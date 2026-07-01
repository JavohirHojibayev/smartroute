const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'azs-fuel.module.ts');
let content = fs.readFileSync(filePath, 'utf8');

const getOperationsStart = content.indexOf('  async getOperations(');
const getSummaryStart = content.indexOf('  async getSummary(');

if (getOperationsStart === -1 || getSummaryStart === -1) {
  console.error('Could not find functions');
  process.exit(1);
}

const getSummaryEnd = content.indexOf("@Controller('integrations/fuel/azs')");
if (getSummaryEnd === -1) {
  console.error('Could not find end of getSummary');
  process.exit(1);
}

const newGetOperations = `  async getOperations(
    pageRaw?: string,
    pageSizeRaw?: string,
    station?: string,
    section?: string,
    dateFrom?: string,
    dateTo?: string,
    objectKind?: string,
  ) {
    const page = Math.max(1, Number.parseInt(pageRaw ?? '1', 10) || 1);
    const pageSize = Math.max(1, Math.min(500, Number.parseInt(pageSizeRaw ?? '10', 10) || 10));

    const { start, end } = this.parseDateBoundaries(dateFrom, dateTo);
    const config = this.getConfig();
    
    let allRows: ExternalFuelRow[] = [];
    let kindFilter = this.azsKindFilterAll;

    if (config.enabled) {
      const ctx = await this.loadAzsObjectKindContext(config, objectKind).catch(() => null);
      if (ctx) {
         kindFilter = ctx.kindFilter;
         if (ctx.token) {
           allRows = await this.fetchEventsInRange(config, ctx.token, start, end).catch(() => []);
         }
      }
    }

    const stationFilter = this.normalizeWhitespace(station).toLowerCase();
    const sectionFilter = this.normalizeWhitespace(section).toLowerCase();

    const filteredRows = allRows.filter((row) => {
      const p = row.payload || {};
      if (p.eventsType !== 131 && p.eventsType !== 132) return false;
      if (!this.externalRowMatchesKindFilter(row, kindFilter)) return false;
      if (stationFilter && stationFilter !== 'all') {
        const rowStation = this.normalizeWhitespace(String(p.devicePostName ?? row.stationName ?? '')).toLowerCase();
        if (rowStation !== stationFilter) return false;
      }
      if (sectionFilter && sectionFilter !== 'all') {
        const rowSection = this.normalizeWhitespace(String(p.fuelSectionName ?? p.devicePostName ?? p.fuelTankName ?? "Noma'lum")).toLowerCase();
        if (rowSection !== sectionFilter) return false;
      }
      return true;
    });

    filteredRows.sort((a, b) => b.eventTime.getTime() - a.eventTime.getTime());

    const total = filteredRows.length;
    const paginated = filteredRows.slice((page - 1) * pageSize, page * pageSize);
    const opsMode = this.normalizeWhitespace(process.env.AZS_OPERATIONS_LITERS_MODE || 'counter').toLowerCase();

    const parseVal = (x: unknown): number | null => {
      if (x == null || x === '') return null;
      const v = typeof x === 'number' ? x : Number.parseFloat(String(x).replace(',', '.'));
      return Number.isFinite(v) ? v : null;
    };

    const getIssuedValue = (p: any, row: any) => {
      if (opsMode === 'dut') {
        return parseVal(p.issuedDut) ?? parseVal(p.issuedVirtual) ?? row.liters ?? null;
      } else if (opsMode === 'hybrid') {
        return parseVal(p.issuedDut) ?? parseVal(p.issuedVirtual) ?? parseVal(p.differenceRefuel) ?? parseVal(p.issuedValue) ?? parseVal(p.value) ?? row.liters ?? null;
      }
      return parseVal(p.value) ?? parseVal(p.issuedValue) ?? parseVal(p.issuedDut) ?? parseVal(p.issuedVirtual) ?? parseVal(p.differenceRefuel) ?? row.liters ?? null;
    };

    return {
      items: paginated.map((row) => {
        const p: Record<string, any> = row.payload || {};
        return {
          id: row.externalId,
          vehicle: row.vehicleNumber || '-',
          fuelType: row.fuelType || "Noma'lum",
          liters: row.liters,
          issuedValue: getIssuedValue(p, row) ?? row.liters ?? null,
          station: this.normalizeWhitespace(String(p.devicePostName ?? p.DevicePostName ?? row.stationName ?? '')) || '-',
          driver: row.driverName || '-',
          time: this.sqliteToIso(row.eventTime),
          eventType: row.eventType,
          payType: row.payType,
          cardId: row.cardId,
          cardNumber: this.normalizeWhitespace(p.idCard ?? p.cardNumber ?? '') || null,
          cardName: this.normalizeWhitespace(p.cardName ?? '') || null,
          groupName: this.normalizeWhitespace(p.groupName ?? '') || null,
          fuelSectionName: this.normalizeWhitespace(p.fuelSectionName ?? '') || null,
          levelStartDut: p.levelStartDut != null ? Number(p.levelStartDut) : null,
          levelEndDut: p.levelEndDut != null ? Number(p.levelEndDut) : null,
          deviceId: row.deviceId,
          devicePostId: row.devicePostId,
          eventMessage: row.eventMessage,
          entityId: row.entityId,
          ownerId: row.ownerId,
          isBroken: row.isBroken,
          eventDuration: row.eventDuration,
        };
      }),
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      summary: {
        liters: filteredRows.reduce((sum, row) => sum + (getIssuedValue(row.payload || {}, row) ?? row.liters ?? 0), 0),
      },
    };
  }

`;

const newGetSummary = `  async getSummary(
    dateFrom?: string,
    dateTo?: string,
    station?: string,
    recentLimitRaw?: string,
    section?: string,
    objectKind?: string,
    compactRaw?: string,
  ) {
    const config = this.getConfig();
    const compact = ['1', 'true', 'yes', 'on'].includes(this.normalizeWhitespace(compactRaw).toLowerCase());

    const { start, end } = this.parseDateBoundaries(dateFrom, dateTo);
    
    // Instead of waiting for the full 10s dashboard stats, we fetch exactly what we need directly.
    let kindFilter = this.azsKindFilterAll;
    let azsToken = '';
    let apiChartRows: ExternalFuelRow[] = [];
    let gaugeRows: Array<{ name: string; liters: number }> = [];
    let allStations: Array<{ id: number; name: string }> = [];

    if (config.enabled) {
      const ctx = await this.loadAzsObjectKindContext(config, objectKind).catch(() => null);
      if (ctx) {
        kindFilter = ctx.kindFilter;
        azsToken = ctx.token;
        if (azsToken) {
          // Fetch events and gauge sections in parallel for speed (~2-3s instead of 10s)
          const [rows, sectionsInfo] = await Promise.all([
             this.fetchEventsInRange(config, azsToken, start, end).catch(() => []),
             this.fetchAllFuelTankSections(config, azsToken).catch(() => [])
          ]);
          apiChartRows = rows;
          
          gaugeRows = sectionsInfo.map((sec: any) => ({
            name: this.normalizeWhitespace(String(sec?.name ?? "Noma'lum")),
            liters: Number.parseFloat(String(sec?.volume ?? '0')) || 0,
          }));

          allStations = ctx.postsForKind.map((p: any) => ({
            id: Number(p?.devicePostId ?? 0),
            name: String(p?.devicePostName ?? ''),
          })).filter((p: {id: number, name: string}) => p.name);
        }
      }
    }

    const stationFilter = this.normalizeWhitespace(station).toLowerCase();
    const sectionFilter = this.normalizeWhitespace(section).toLowerCase();
    
    const filteredRows = apiChartRows.filter((row) => {
      const p = row.payload || {};
      if (p.eventsType !== 131 && p.eventsType !== 132) return false;
      if (!this.externalRowMatchesKindFilter(row, kindFilter)) return false;
      if (stationFilter && stationFilter !== 'all') {
        const rowStation = this.normalizeWhitespace(String(p.devicePostName ?? row.stationName ?? '')).toLowerCase();
        if (rowStation !== stationFilter) return false;
      }
      if (sectionFilter && sectionFilter !== 'all') {
        const rowSection = this.normalizeWhitespace(String(p.fuelSectionName ?? p.devicePostName ?? p.fuelTankName ?? "Noma'lum")).toLowerCase();
        if (rowSection !== sectionFilter) return false;
      }
      return true;
    });

    const sumMode = this.normalizeWhitespace(process.env.AZS_SUMMARY_LITERS_MODE || 'counter').toLowerCase();
    const parseVal = (x: unknown): number | null => {
      if (x == null || x === '') return null;
      const v = typeof x === 'number' ? x : Number.parseFloat(String(x).replace(',', '.'));
      return Number.isFinite(v) ? v : null;
    };
    
    let totalCountResolved = 0;
    let totalLitersResolved = 0;
    let totalAmountResolved = 0;
    
    const fuelTypeMap = new Map<string, number>();
    const stationMap = new Map<string, { records: number; liters: number }>();
    const sectionMap = new Map<string, { records: number }>();
    const dailyMap = new Map<string, { liters: number; amount: number; records: number }>();
    
    const sameDay = this.azsCalendarYmdFromInstant(start) === this.azsCalendarYmdFromInstant(end);
    
    for (const row of filteredRows) {
       const p = row.payload || {};
       let issuedLiters = 0;
       if (sumMode === 'dut') {
          issuedLiters = parseVal(p.issuedDut) ?? parseVal(p.issuedVirtual) ?? row.liters ?? 0;
       } else if (sumMode === 'hybrid') {
          issuedLiters = parseVal(p.issuedDut) ?? parseVal(p.issuedVirtual) ?? parseVal(p.differenceRefuel) ?? parseVal(p.issuedValue) ?? parseVal(p.value) ?? row.liters ?? 0;
       } else {
          issuedLiters = parseVal(p.value) ?? parseVal(p.issuedValue) ?? parseVal(p.issuedDut) ?? parseVal(p.issuedVirtual) ?? parseVal(p.differenceRefuel) ?? row.liters ?? 0;
       }
       const amount = row.amount || 0;
       
       totalCountResolved++;
       totalLitersResolved += issuedLiters;
       totalAmountResolved += amount;
       
       const fuelType = row.fuelType || "Noma'lum";
       fuelTypeMap.set(fuelType, (fuelTypeMap.get(fuelType) || 0) + issuedLiters);
       
       const rowStation = this.normalizeWhitespace(String(p.devicePostName ?? row.stationName ?? "Noma'lum"));
       const st = stationMap.get(rowStation) || { records: 0, liters: 0 };
       st.records++;
       st.liters += issuedLiters;
       stationMap.set(rowStation, st);
       
       const rowSection = this.normalizeWhitespace(String(p.fuelSectionName ?? p.devicePostName ?? p.fuelTankName ?? "Noma'lum"));
       const sec = sectionMap.get(rowSection) || { records: 0 };
       sec.records++;
       sectionMap.set(rowSection, sec);
       
       const bucketHour = row.eventTime.toISOString().substring(11, 13) + ':00';
       const bucketDay = this.azsCalendarYmdFromInstant(row.eventTime);
       const key = sameDay ? bucketHour : bucketDay;
       
       const d = dailyMap.get(key) || { liters: 0, amount: 0, records: 0 };
       d.liters += issuedLiters;
       d.amount += amount;
       d.records++;
       dailyMap.set(key, d);
    }
    
    const chart: Array<{ day: string; consumption: number; cost: number }> = [];
    if (sameDay) {
       for (let hour = 0; hour < 24; hour++) {
          const key = String(hour).padStart(2, '0') + ':00';
          const d = dailyMap.get(key) || { liters: 0, amount: 0, records: 0 };
          chart.push({
             day: key,
             consumption: Math.round(d.liters * 100) / 100,
             cost: Math.round(d.amount * 100) / 100
          });
       }
    } else {
       for (const key of this.eachAzsDayKeyBetween(start, end)) {
          const d = dailyMap.get(key) || { liters: 0, amount: 0, records: 0 };
          chart.push({
             day: this.formatShortDate(key),
             consumption: Math.round(d.liters * 100) / 100,
             cost: Math.round(d.amount * 100) / 100
          });
       }
    }
    
    const anomalyLiters = config.anomalyLiters || 120;
    filteredRows.sort((a, b) => b.eventTime.getTime() - a.eventTime.getTime());
    const anomalies = compact ? [] : filteredRows.filter(r => (r.liters || 0) >= anomalyLiters).slice(0, 5).map(r => ({
       id: r.externalId,
       vehicle: r.vehicleNumber || '-',
       time: this.sqliteToIso(r.eventTime),
       type: "Me'yordan ortiq sarf",
       amount: \`\${r.liters}L\`,
       status: 'warning'
    }));

    let liveLevelGaugeLiters: number | null = null;
    if (gaugeRows.length > 0) {
      if (!sectionFilter || sectionFilter === 'all') {
         const vals = gaugeRows.map(r => r.liters).filter(v => Number.isFinite(v));
         if (vals.length) {
            const aggMode = this.normalizeWhitespace(process.env.AZS_LEVEL_ALL_SECTIONS_AGG || 'max').toLowerCase();
            liveLevelGaugeLiters = aggMode === 'avg' ? vals.reduce((a,b)=>a+b,0)/vals.length : Math.max(...vals);
         }
      } else {
         const matching = gaugeRows.find(r => r.name.toLowerCase() === sectionFilter);
         if (matching) liveLevelGaugeLiters = matching.liters;
      }
    }
    
    const dummyStats = this.emptyAzsStats();

    return {
      health: await this.getHealth(),
      window: {
        dateFrom: start.toISOString(),
        dateTo: end.toISOString(),
        records: totalCountResolved,
        totalLiters: totalLitersResolved,
        totalLitersRounded: Math.round(totalLitersResolved),
        totalAmount: totalAmountResolved,
        liveLevelGaugeLiters,
      },
      stats: dummyStats,
      chart,
      levelChart: [],
      sections: Array.from(sectionMap.entries()).map(([name, data]) => ({ name, records: data.records })),
      stations: allStations.length > 0 ? allStations.map(s => {
          const m = stationMap.get(s.name);
          return { name: s.name, records: m?.records || 0, liters: m?.liters || 0 };
      }) : Array.from(stationMap.entries()).map(([name, data]) => ({ name, records: data.records, liters: data.liters })),
      ...(compact ? {} : {
         fuelTypes: Array.from(fuelTypeMap.entries()).map(([type, liters]) => ({
             key: type.toLowerCase().replace(/\\s+/g, '_'),
             type,
             liters
         }))
      }),
      ...(compact ? {} : { anomalies }),
    };
  }

}

`;

content = content.substring(0, getOperationsStart) + newGetOperations + newGetSummary + content.substring(getSummaryEnd);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Replaced successfully');
