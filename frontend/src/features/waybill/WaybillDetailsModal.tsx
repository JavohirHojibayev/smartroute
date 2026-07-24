import { X, Save, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { useState, useEffect } from 'react';
import { loadTransportRegistry } from '../../data/transportStore';

export type WaybillDetailsData = {
    // Header & Transport Info
    stampInfo?: string;
    waybillNo?: string;
    waybillDate?: string;
    driver: string;
    tabNo?: string;
    driverClass?: string;
    vehicleModel?: string;
    plate: string;
    type: string;
    workRegime?: string;
    regimeCode?: string;
    columnNo?: string;
    trailerPlate?: string;
    semiTrailerPlate?: string;
    companions?: string;

    // Vehicle Work (Table 1-6)
    departureTime: string;
    expectedReturn: string;
    paidDistance?: string;
    odometerOut?: string;
    odometerIn?: string;
    actualDeparture?: string;
    actualReturn?: string;

    // Fuel Expense (Table 7-14)
    fuelType?: string;
    fuelCode?: string;
    fuelGiven?: string;
    fuelOut?: string;
    fuelIn?: string;
    fuelNormCoef?: string;
    specialEquipmentHours?: string;
    engineHours?: string;

    fuelType2?: string;
    fuelCode2?: string;
    fuelGiven2?: string;
    fuelOut2?: string;
    fuelIn2?: string;
    fuelNormCoef2?: string;
    specialEquipmentHours2?: string;
    engineHours2?: string;

    fuelerSignature?: string;
    mechanicOutSignature?: string;
    mechanicInSignature?: string;
    dispatcherSignature?: string;

    // Assignment (Table 15-22)
    customer?: string;
    arrivalTime?: string;
    pickupLoc?: string;
    route?: string;
    cargo?: string;
    tripsCount?: string;
    distance?: string;
    weight?: string;

    customer2?: string;
    arrivalTime2?: string;
    pickupLoc2?: string;
    route2?: string;
    cargo2?: string;
    tripsCount2?: string;
    distance2?: string;
    weight2?: string;

    customer3?: string;
    arrivalTime3?: string;
    pickupLoc3?: string;
    route3?: string;
    cargo3?: string;
    tripsCount3?: string;
    distance3?: string;
    weight3?: string;

    customer4?: string;
    arrivalTime4?: string;
    pickupLoc4?: string;
    route4?: string;
    cargo4?: string;
    tripsCount4?: string;
    distance4?: string;
    weight4?: string;

    customer5?: string;
    arrivalTime5?: string;
    pickupLoc5?: string;
    route5?: string;
    cargo5?: string;
    tripsCount5?: string;
    distance5?: string;
    weight5?: string;

    // Signatures & Page 2
    techOutStatus?: string;
    techInStatus?: string;
    specialNotes?: string;
    ttnNumbers?: string;
    delaysInfo?: string;

    // Meta
    securityStatus?: 'pending' | 'allowed' | 'denied' | 'returned';
    denyReason?: string;
    dispatcherName?: string;
    updatedAt?: number;
};

type WaybillDetailsModalProps = {
    open: boolean;
    onClose: () => void;
    data: WaybillDetailsData | null;
    onSave: (data: WaybillDetailsData) => void;
};

export const WaybillDetailsModal = ({ open, onClose, data, onSave }: WaybillDetailsModalProps) => {

    const [formData, setFormData] = useState<WaybillDetailsData>({
        stampInfo: '',
        waybillNo: '',
        waybillDate: '',
        driver: '',
        tabNo: '',
        driverClass: '',
        vehicleModel: '',
        plate: '',
        type: '',
        workRegime: '',
        regimeCode: '',
        columnNo: '',
        trailerPlate: '',
        semiTrailerPlate: '',
        companions: '',

        departureTime: '',
        expectedReturn: '',
        paidDistance: '',
        odometerOut: '',
        odometerIn: '',
        actualDeparture: '',
        actualReturn: '',

        fuelType: '',
        fuelCode: '',
        fuelGiven: '',
        fuelOut: '',
        fuelIn: '',
        fuelNormCoef: '',
        specialEquipmentHours: '',
        engineHours: '',

        fuelType2: '',
        fuelCode2: '',
        fuelGiven2: '',
        fuelOut2: '',
        fuelIn2: '',
        fuelNormCoef2: '',
        specialEquipmentHours2: '',
        engineHours2: '',

        fuelerSignature: '',
        mechanicOutSignature: '',
        mechanicInSignature: '',
        dispatcherSignature: '',

        customer: '',
        arrivalTime: '',
        pickupLoc: '',
        route: '',
        cargo: '',
        tripsCount: '',
        distance: '',
        weight: '',

        customer2: '',
        arrivalTime2: '',
        pickupLoc2: '',
        route2: '',
        cargo2: '',
        tripsCount2: '',
        distance2: '',
        weight2: '',

        customer3: '',
        arrivalTime3: '',
        pickupLoc3: '',
        route3: '',
        cargo3: '',
        tripsCount3: '',
        distance3: '',
        weight3: '',

        customer4: '',
        arrivalTime4: '',
        pickupLoc4: '',
        route4: '',
        cargo4: '',
        tripsCount4: '',
        distance4: '',
        weight4: '',

        customer5: '',
        arrivalTime5: '',
        pickupLoc5: '',
        route5: '',
        cargo5: '',
        tripsCount5: '',
        distance5: '',
        weight5: '',

        techOutStatus: 'Soz',
        techInStatus: 'Soz',
        specialNotes: '',
        ttnNumbers: '',
        delaysInfo: ''
    });

    const [allDrivers, setAllDrivers] = useState<string[]>([]);
    const [allPlates, setAllPlates] = useState<string[]>([]);
    const [plateToType, setPlateToType] = useState<Record<string, string>>({});

    useEffect(() => {
        if (open) {
            const clean = (val: string | undefined) => val === '-' ? '' : (val || '');
            setFormData({
                stampInfo: clean(data?.stampInfo),
                waybillNo: clean(data?.waybillNo),
                waybillDate: clean(data?.waybillDate) || new Date().toISOString().split('T')[0],
                driver: clean(data?.driver),
                tabNo: clean(data?.tabNo),
                driverClass: clean(data?.driverClass),
                vehicleModel: clean(data?.vehicleModel),
                plate: clean(data?.plate),
                type: clean(data?.type),
                workRegime: clean(data?.workRegime),
                regimeCode: clean(data?.regimeCode),
                columnNo: clean(data?.columnNo),
                trailerPlate: clean(data?.trailerPlate),
                semiTrailerPlate: clean(data?.semiTrailerPlate),
                companions: clean(data?.companions),

                departureTime: clean(data?.departureTime),
                expectedReturn: clean(data?.expectedReturn),
                paidDistance: clean(data?.paidDistance),
                odometerOut: clean(data?.odometerOut),
                odometerIn: clean(data?.odometerIn),
                actualDeparture: clean(data?.actualDeparture),
                actualReturn: clean(data?.actualReturn),

                fuelType: clean(data?.fuelType),
                fuelCode: clean(data?.fuelCode),
                fuelGiven: clean(data?.fuelGiven),
                fuelOut: clean(data?.fuelOut),
                fuelIn: clean(data?.fuelIn),
                fuelNormCoef: clean(data?.fuelNormCoef),
                specialEquipmentHours: clean(data?.specialEquipmentHours),
                engineHours: clean(data?.engineHours),

                fuelType2: clean(data?.fuelType2),
                fuelCode2: clean(data?.fuelCode2),
                fuelGiven2: clean(data?.fuelGiven2),
                fuelOut2: clean(data?.fuelOut2),
                fuelIn2: clean(data?.fuelIn2),
                fuelNormCoef2: clean(data?.fuelNormCoef2),
                specialEquipmentHours2: clean(data?.specialEquipmentHours2),
                engineHours2: clean(data?.engineHours2),

                fuelerSignature: clean(data?.fuelerSignature),
                mechanicOutSignature: clean(data?.mechanicOutSignature),
                mechanicInSignature: clean(data?.mechanicInSignature),
                dispatcherSignature: clean(data?.dispatcherSignature),

                customer: clean(data?.customer),
                arrivalTime: clean(data?.arrivalTime),
                pickupLoc: clean(data?.pickupLoc),
                route: clean(data?.route),
                cargo: clean(data?.cargo),
                tripsCount: clean(data?.tripsCount),
                distance: clean(data?.distance),
                weight: clean(data?.weight),

                customer2: clean(data?.customer2),
                arrivalTime2: clean(data?.arrivalTime2),
                pickupLoc2: clean(data?.pickupLoc2),
                route2: clean(data?.route2),
                cargo2: clean(data?.cargo2),
                tripsCount2: clean(data?.tripsCount2),
                distance2: clean(data?.distance2),
                weight2: clean(data?.weight2),

                customer3: clean(data?.customer3),
                arrivalTime3: clean(data?.arrivalTime3),
                pickupLoc3: clean(data?.pickupLoc3),
                route3: clean(data?.route3),
                cargo3: clean(data?.cargo3),
                tripsCount3: clean(data?.tripsCount3),
                distance3: clean(data?.distance3),
                weight3: clean(data?.weight3),

                customer4: clean(data?.customer4),
                arrivalTime4: clean(data?.arrivalTime4),
                pickupLoc4: clean(data?.pickupLoc4),
                route4: clean(data?.route4),
                cargo4: clean(data?.cargo4),
                tripsCount4: clean(data?.tripsCount4),
                distance4: clean(data?.distance4),
                weight4: clean(data?.weight4),

                customer5: clean(data?.customer5),
                arrivalTime5: clean(data?.arrivalTime5),
                pickupLoc5: clean(data?.pickupLoc5),
                route5: clean(data?.route5),
                cargo5: clean(data?.cargo5),
                tripsCount5: clean(data?.tripsCount5),
                distance5: clean(data?.distance5),
                weight5: clean(data?.weight5),

                techOutStatus: clean(data?.techOutStatus) || 'Soz',
                techInStatus: clean(data?.techInStatus) || 'Soz',
                specialNotes: clean(data?.specialNotes),
                ttnNumbers: clean(data?.ttnNumbers),
                delaysInfo: clean(data?.delaysInfo),

                securityStatus: data?.securityStatus,
                denyReason: data?.denyReason,
                dispatcherName: data?.dispatcherName
            });

            const transports = loadTransportRegistry();
            const plates = transports.map(tr => tr.plate).filter(Boolean);
            const drivers = Array.from(new Set(transports.flatMap(tr => tr.drivers.map(d => d.fullName)))).filter(Boolean);

            const p2t: Record<string, string> = {};
            transports.forEach(tr => {
                if (tr.plate && tr.vehicleType) {
                    p2t[tr.plate] = tr.vehicleType;
                }
            });

            setAllPlates(plates);
            setAllDrivers(drivers);
            setPlateToType(p2t);
        }
    }, [open, data]);

    if (!open) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => {
            const next = { ...prev, [name]: value };
            if (name === 'plate' && plateToType[value]) {
                next.type = plateToType[value];
            }
            if (name === 'departureTime') {
                if (next.expectedReturn && new Date(value) > new Date(next.expectedReturn)) {
                    next.expectedReturn = value;
                }
            }
            if (name === 'expectedReturn') {
                if (next.departureTime && new Date(value) < new Date(next.departureTime)) {
                    next.expectedReturn = next.departureTime;
                }
            }
            return next;
        });
    };

    const handleSave = () => {
        onSave(formData);
        onClose();
    };

    const handleComplete = () => {
        onSave({ ...formData, securityStatus: 'returned', updatedAt: Date.now() });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col w-screen h-screen bg-slate-950 overflow-hidden animate-in fade-in duration-200">
            {/* Full Screen Header Bar */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-700/60 px-6 py-3.5 bg-slate-900/90 shadow-md">
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2.5">
                    <FileSpreadsheet className="text-blue-400" size={22} />
                    Yo'l varaqasini shakllantirish (YUK AVTOMOBILI № 4-m namunaviy shakl)
                </h3>
                <button
                    type="button"
                    onClick={onClose}
                    className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
                    title="Yopish"
                >
                    <X size={22} />
                </button>
            </div>

            {/* Form Document Body (Full Screen A4 Landscape Layout) */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 text-slate-200 text-xs font-sans bg-slate-950/60">
                <datalist id="drivers-list">
                    {allDrivers.map((d, i) => <option key={i} value={d} />)}
                </datalist>
                <datalist id="plates-list">
                    {allPlates.map((p, i) => <option key={i} value={p} />)}
                </datalist>

                {/* TOP SECTION: Left Info + Right Work & Fuel Tables */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* LEFT COLUMN: Document Header & Vehicle Details */}
                    <div className="lg:col-span-5 border border-slate-700/60 rounded-xl p-4 bg-slate-900/60 space-y-3 shadow-md">


                        <div className="flex items-center justify-between gap-2 py-1">
                            <span className="font-bold text-sm text-blue-400">YO'L VARAQASI №</span>
                            <input
                                type="text"
                                name="waybillNo"
                                value={formData.waybillNo || ''}
                                onChange={handleChange}
                                className="bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-100 font-bold text-xs w-28 text-center"
                                placeholder=""
                            />
                            <span className="font-medium text-slate-400">Sana:</span>
                            <input
                                type="date"
                                name="waybillDate"
                                value={formData.waybillDate || ''}
                                onChange={handleChange}
                                className="bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 text-xs"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/40">
                            <div className="flex items-center gap-1.5">
                                <span className="text-slate-400 shrink-0">Ish rejimi:</span>
                                <input type="text" name="workRegime" value={formData.workRegime || ''} onChange={handleChange} className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200" placeholder="" />
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-slate-400 shrink-0">Kod:</span>
                                <input type="text" name="regimeCode" value={formData.regimeCode || ''} onChange={handleChange} className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200" placeholder="" />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-slate-400 shrink-0">Kolonna:</span>
                            <input type="text" name="columnNo" value={formData.columnNo || ''} onChange={handleChange} className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200" placeholder="" />
                        </div>

                        {/* Vehicle Details */}
                        <div className="space-y-2 pt-2 border-t border-slate-700/40">
                            <div className="text-[11px] font-semibold text-slate-300">Avtomobil (rusumi, davlat raqami, tip):</div>
                            <div className="grid grid-cols-3 gap-1.5">
                                <input type="text" name="vehicleModel" value={formData.vehicleModel || ''} onChange={handleChange} placeholder="" className="bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200" />
                                <input type="text" name="plate" value={formData.plate} onChange={handleChange} list="plates-list" placeholder="" className="bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 font-semibold" />
                                <input type="text" name="type" value={formData.type} onChange={handleChange} placeholder="" className="bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200" />
                            </div>
                        </div>

                        {/* Driver Details */}
                        <div className="space-y-2 pt-2 border-t border-slate-700/40">
                            <div className="text-[11px] font-semibold text-slate-300">1. Haydovchi F.I.SH. / Tab № / Klassi:</div>
                            <div className="grid grid-cols-12 gap-1.5">
                                <input type="text" name="driver" value={formData.driver} onChange={handleChange} list="drivers-list" placeholder="" className="col-span-6 bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 font-semibold" />
                                <input type="text" name="tabNo" value={formData.tabNo || ''} onChange={handleChange} placeholder="" className="col-span-3 bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200" />
                                <input type="text" name="driverClass" value={formData.driverClass || ''} onChange={handleChange} placeholder="" className="col-span-3 bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200" />
                            </div>
                        </div>

                        {/* Trailer Details */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/40">
                            <div>
                                <span className="text-slate-400 text-[11px]">Tirkama (rusumi, raqami):</span>
                                <input type="text" name="trailerPlate" value={formData.trailerPlate || ''} onChange={handleChange} className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 mt-0.5" placeholder="" />
                            </div>
                            <div>
                                <span className="text-slate-400 text-[11px]">Yarimtirkama:</span>
                                <input type="text" name="semiTrailerPlate" value={formData.semiTrailerPlate || ''} onChange={handleChange} className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 mt-0.5" placeholder="" />
                            </div>
                        </div>

                        <div>
                            <span className="text-slate-400 text-[11px]">Hamkorlik qiluvchi shaxslar:</span>
                            <input type="text" name="companions" value={formData.companions || ''} onChange={handleChange} className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 mt-0.5" placeholder="" />
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Tables 1-6 (Work) & 7-14 (Fuel) */}
                    <div className="lg:col-span-7 space-y-4">
                        {/* TABLE 1-6: Haydovchi va avtomobilning ishi */}
                        <div className="border border-slate-700/60 rounded-xl overflow-hidden bg-slate-900/60 shadow-md">
                            <div className="bg-slate-800/80 px-3 py-1.5 font-bold text-slate-200 text-center border-b border-slate-700/60">
                                Haydovchi va avtomobilning ishi
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-center border-collapse">
                                    <thead>
                                        <tr className="bg-slate-950/60 text-[11px] text-slate-300 border-b border-slate-700/60">
                                            <th className="p-1.5 border-r border-slate-700/50 w-28">Operatsiya</th>
                                            <th className="p-1.5 border-r border-slate-700/50">Jadval bo'yicha vaqt</th>
                                            <th className="p-1.5 border-r border-slate-700/50">Pulli masofa, km</th>
                                            <th className="p-1.5 border-r border-slate-700/50">Spidometr ko'rsatgichlari</th>
                                            <th className="p-1.5">Amaldagi vaqt</th>
                                        </tr>
                                        <tr className="bg-slate-900/40 text-[10px] text-slate-400 border-b border-slate-700/60">
                                            <th className="py-0.5 border-r border-slate-700/50">1</th>
                                            <th className="py-0.5 border-r border-slate-700/50">2 - 3</th>
                                            <th className="py-0.5 border-r border-slate-700/50">4</th>
                                            <th className="py-0.5 border-r border-slate-700/50">5</th>
                                            <th className="py-0.5">6</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700/50">
                                        <tr>
                                            <td className="p-1.5 font-medium border-r border-slate-700/50 bg-slate-950/20">Garajdan chiqish</td>
                                            <td className="p-1 border-r border-slate-700/50">
                                                <input type="datetime-local" name="departureTime" value={formData.departureTime} onChange={handleChange} className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-center text-slate-200" />
                                            </td>
                                            <td className="p-1 border-r border-slate-700/50" rowSpan={2}>
                                                <input type="text" name="paidDistance" value={formData.paidDistance || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-center text-slate-200" />
                                            </td>
                                            <td className="p-1 border-r border-slate-700/50">
                                                <input type="text" name="odometerOut" value={formData.odometerOut || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-center text-slate-200" />
                                            </td>
                                            <td className="p-1">
                                                <input type="text" name="actualDeparture" value={formData.actualDeparture || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-center text-slate-200" />
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="p-1.5 font-medium border-r border-slate-700/50 bg-slate-950/20">Garajga qaytish</td>
                                            <td className="p-1 border-r border-slate-700/50">
                                                <input type="datetime-local" name="expectedReturn" value={formData.expectedReturn} onChange={handleChange} className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-center text-slate-200" />
                                            </td>
                                            <td className="p-1 border-r border-slate-700/50">
                                                <input type="text" name="odometerIn" value={formData.odometerIn || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-center text-slate-200" />
                                            </td>
                                            <td className="p-1">
                                                <input type="text" name="actualReturn" value={formData.actualReturn || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1.5 py-0.5 text-center text-slate-200" />
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                            {/* TABLE 7-14: Yonilg'i harajati, litr */}
                            <div className="border border-slate-700/60 rounded-xl overflow-hidden bg-slate-900/60 shadow-md">
                                <div className="bg-slate-800/80 px-3 py-1.5 font-bold text-slate-200 text-center border-b border-slate-700/60">
                                    yonilg'i harajati, litr
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-center border-collapse">
                                        <thead>
                                            <tr className="bg-slate-950/60 text-[11px] text-slate-300 border-b border-slate-700/60">
                                                <th className="p-1 border-r border-slate-700/50" rowSpan={2}>yonilg'i markasi</th>
                                                <th className="p-1 border-r border-slate-700/50" rowSpan={2}>Marka kodi</th>
                                                <th className="p-1 border-r border-slate-700/50" rowSpan={2}>Berildi</th>
                                                <th className="p-1 border-r border-slate-700/50" colSpan={2}>Qoldiq</th>
                                                <th className="p-1 border-r border-slate-700/50 text-[10px]" rowSpan={2}>Norma o'zlashtirish koeffisenti</th>
                                                <th className="p-1" colSpan={2}>ishlash vaqti, soat</th>
                                            </tr>
                                            <tr className="bg-slate-900/40 text-[10px] text-slate-400 border-b border-slate-700/60">
                                                <th className="py-0.5 border-r border-slate-700/50">chiqishda</th>
                                                <th className="py-0.5 border-r border-slate-700/50">qaytishda</th>
                                                <th className="py-0.5 border-r border-slate-700/50">Maxsus uskuna</th>
                                                <th className="py-0.5">dvigatel</th>
                                            </tr>
                                            <tr className="bg-slate-950/40 text-[9px] text-slate-500 border-b border-slate-700/60">
                                                <th className="py-0.5 border-r border-slate-700/50">7</th>
                                                <th className="py-0.5 border-r border-slate-700/50">8</th>
                                                <th className="py-0.5 border-r border-slate-700/50">9</th>
                                                <th className="py-0.5 border-r border-slate-700/50">10</th>
                                                <th className="py-0.5 border-r border-slate-700/50">11</th>
                                                <th className="py-0.5 border-r border-slate-700/50">12</th>
                                                <th className="py-0.5 border-r border-slate-700/50">13</th>
                                                <th className="py-0.5">14</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {/* Fuel Row 1 */}
                                            <tr>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelType" value={formData.fuelType || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelCode" value={formData.fuelCode || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelGiven" value={formData.fuelGiven || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 font-bold text-blue-400" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelOut" value={formData.fuelOut || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelIn" value={formData.fuelIn || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelNormCoef" value={formData.fuelNormCoef || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="specialEquipmentHours" value={formData.specialEquipmentHours || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200" />
                                                </td>
                                                <td className="p-1">
                                                    <input type="text" name="engineHours" value={formData.engineHours || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200" />
                                                </td>
                                            </tr>

                                            {/* Fuel Row 2 */}
                                            <tr className="border-t border-slate-700/40">
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelType2" value={formData.fuelType2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelCode2" value={formData.fuelCode2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelGiven2" value={formData.fuelGiven2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 font-bold text-blue-400" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelOut2" value={formData.fuelOut2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelIn2" value={formData.fuelIn2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="fuelNormCoef2" value={formData.fuelNormCoef2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="specialEquipmentHours2" value={formData.specialEquipmentHours2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200" />
                                                </td>
                                                <td className="p-1">
                                                    <input type="text" name="engineHours2" value={formData.engineHours2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200" />
                                                </td>
                                            </tr>

                                            {/* Signatures Role Header Row */}
                                            <tr className="bg-slate-950/80 text-[10px] font-semibold text-slate-400 border-t border-slate-700/60">
                                                <td className="p-1 border-r border-slate-700/50 italic">imzolar</td>
                                                <td className="p-1 border-r border-slate-700/50" colSpan={2}>Yonilg'i quyuvchi</td>
                                                <td className="p-1 border-r border-slate-700/50">Nav.mex</td>
                                                <td className="p-1 border-r border-slate-700/50">Nav.mex</td>
                                                <td className="p-1" colSpan={3}>Dispetcher</td>
                                            </tr>

                                            {/* Signatures Input Row */}
                                            <tr className="border-t border-slate-700/40 bg-slate-950/40">
                                                <td className="p-1 border-r border-slate-700/50"></td>
                                                <td className="p-1 border-r border-slate-700/50" colSpan={2}>
                                                    <input type="text" name="fuelerSignature" value={formData.fuelerSignature || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-[11px]" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="mechanicOutSignature" value={formData.mechanicOutSignature || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-[11px]" />
                                                </td>
                                                <td className="p-1 border-r border-slate-700/50">
                                                    <input type="text" name="mechanicInSignature" value={formData.mechanicInSignature || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-[11px]" />
                                                </td>
                                                <td className="p-1" colSpan={3}>
                                                    <input type="text" name="dispatcherSignature" value={formData.dispatcherSignature || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-1 py-0.5 text-center text-slate-200 text-[11px]" />
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                    </div>
                </div>

                    {/* MIDDLE SECTION: XAYDOVCHIGA TOPSHIRIQ TABLE (Columns 15-22) */}
                    <div className="border border-slate-700/60 rounded-xl overflow-hidden bg-slate-900/60 shadow-md">
                        <div className="bg-slate-800/80 px-4 py-2 font-bold text-slate-200 text-center border-b border-slate-700/60 flex items-center justify-center gap-2">
                            <span>XAYDOVCHIGA TOPSHIRIQ</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-center border-collapse">
                                <thead>
                                    <tr className="bg-slate-950/60 text-[11px] text-slate-300 border-b border-slate-700/60">
                                        <th className="p-2 border-r border-slate-700/50 min-w-[140px]">Kimning ixtiyoriga</th>
                                        <th className="p-2 border-r border-slate-700/50 min-w-[110px]">Kelish vaqti<br/><span className="text-[9px] text-slate-400 font-normal">(soat, daqiqa)</span></th>
                                        <th className="p-2 border-r border-slate-700/50 min-w-[140px]">Yuk qayerdan olinadi</th>
                                        <th className="p-2 border-r border-slate-700/50 min-w-[160px]">Yuk qayerga yetkaziladi</th>
                                        <th className="p-2 border-r border-slate-700/50 min-w-[130px]">Yukning nomi</th>
                                        <th className="p-2 border-r border-slate-700/50 min-w-[110px]">Yuk bilan qatnovlar soni</th>
                                        <th className="p-2 border-r border-slate-700/50 min-w-[90px]">Masofa, km</th>
                                        <th className="p-2 min-w-[130px]">Tashilishi kerak yuk hajmi, tonna</th>
                                    </tr>
                                    <tr className="bg-slate-900/40 text-[10px] text-slate-400 border-b border-slate-700/60">
                                        <th className="py-0.5 border-r border-slate-700/50">15</th>
                                        <th className="py-0.5 border-r border-slate-700/50">16</th>
                                        <th className="py-0.5 border-r border-slate-700/50">17</th>
                                        <th className="py-0.5 border-r border-slate-700/50">18</th>
                                        <th className="py-0.5 border-r border-slate-700/50">19</th>
                                        <th className="py-0.5 border-r border-slate-700/50">20</th>
                                        <th className="py-0.5 border-r border-slate-700/50">21</th>
                                        <th className="py-0.5">22</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Row 1 */}
                                    <tr className="hover:bg-white/5 transition-colors">
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="customer" value={formData.customer || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="arrivalTime" value={formData.arrivalTime || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="pickupLoc" value={formData.pickupLoc || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="route" value={formData.route || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 font-semibold" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="cargo" value={formData.cargo || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="number" name="tripsCount" value={formData.tripsCount || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="distance" value={formData.distance || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold" />
                                        </td>
                                        <td className="p-1">
                                            <input type="text" name="weight" value={formData.weight || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold" />
                                        </td>
                                    </tr>

                                    {/* Row 2 */}
                                    <tr className="hover:bg-white/5 transition-colors border-t border-slate-700/40">
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="customer2" value={formData.customer2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="arrivalTime2" value={formData.arrivalTime2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="pickupLoc2" value={formData.pickupLoc2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="route2" value={formData.route2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 font-semibold" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="cargo2" value={formData.cargo2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="number" name="tripsCount2" value={formData.tripsCount2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="distance2" value={formData.distance2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold" />
                                        </td>
                                        <td className="p-1">
                                            <input type="text" name="weight2" value={formData.weight2 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold" />
                                        </td>
                                    </tr>

                                    {/* Row 3 */}
                                    <tr className="hover:bg-white/5 transition-colors border-t border-slate-700/40">
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="customer3" value={formData.customer3 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="arrivalTime3" value={formData.arrivalTime3 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="pickupLoc3" value={formData.pickupLoc3 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="route3" value={formData.route3 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 font-semibold" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="cargo3" value={formData.cargo3 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="number" name="tripsCount3" value={formData.tripsCount3 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="distance3" value={formData.distance3 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold" />
                                        </td>
                                        <td className="p-1">
                                            <input type="text" name="weight3" value={formData.weight3 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold" />
                                        </td>
                                    </tr>

                                    {/* Row 4 */}
                                    <tr className="hover:bg-white/5 transition-colors border-t border-slate-700/40">
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="customer4" value={formData.customer4 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="arrivalTime4" value={formData.arrivalTime4 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="pickupLoc4" value={formData.pickupLoc4 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="route4" value={formData.route4 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 font-semibold" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="cargo4" value={formData.cargo4 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="number" name="tripsCount4" value={formData.tripsCount4 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="distance4" value={formData.distance4 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold" />
                                        </td>
                                        <td className="p-1">
                                            <input type="text" name="weight4" value={formData.weight4 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold" />
                                        </td>
                                    </tr>

                                    {/* Row 5 */}
                                    <tr className="hover:bg-white/5 transition-colors border-t border-slate-700/40">
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="customer5" value={formData.customer5 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="arrivalTime5" value={formData.arrivalTime5 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="pickupLoc5" value={formData.pickupLoc5 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="route5" value={formData.route5 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 font-semibold" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="cargo5" value={formData.cargo5 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="number" name="tripsCount5" value={formData.tripsCount5 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200" />
                                        </td>
                                        <td className="p-1 border-r border-slate-700/50">
                                            <input type="text" name="distance5" value={formData.distance5 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold" />
                                        </td>
                                        <td className="p-1">
                                            <input type="text" name="weight5" value={formData.weight5 || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-0.5 text-center text-slate-200 font-bold" />
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                {/* BOTTOM SECTION: Signatures, Technical Status, TTN & Notes */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
                    {/* Technical Status & Clearances */}
                    <div className="lg:col-span-6 border border-slate-700/60 rounded-xl p-4 bg-slate-900/60 space-y-3 shadow-md">
                        <div className="font-bold text-slate-200 border-b border-slate-700/40 pb-1 text-xs">
                            Texnik sozlik va ruxsatnomalar
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <span className="text-slate-400 text-[11px]">Texnik holat (Chiqishda):</span>
                                <select name="techOutStatus" value={formData.techOutStatus || 'Soz'} onChange={handleChange} className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 mt-1">
                                    <option value="Soz" className="bg-slate-900 text-emerald-400">Soz (Ruxsat berildi)</option>
                                    <option value="Nosoz" className="bg-slate-900 text-rose-400">Nosoz</option>
                                </select>
                            </div>
                            <div>
                                <span className="text-slate-400 text-[11px]">Texnik holat (Qaytishda):</span>
                                <select name="techInStatus" value={formData.techInStatus || 'Soz'} onChange={handleChange} className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 mt-1">
                                    <option value="Soz" className="bg-slate-900 text-emerald-400">Soz (Qabul qilindi)</option>
                                    <option value="Nosoz" className="bg-slate-900 text-rose-400">Nosoz</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <span className="text-slate-400 text-[11px]">Ilova qilingan TTN nakladnoy raqamlari (24):</span>
                            <input type="text" name="ttnNumbers" value={formData.ttnNumbers || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 mt-1" />
                        </div>
                    </div>

                    {/* Special Notes & Delays */}
                    <div className="lg:col-span-6 border border-slate-700/60 rounded-xl p-4 bg-slate-900/60 space-y-3 shadow-md">
                        <div className="font-bold text-slate-200 border-b border-slate-700/40 pb-1 text-xs">
                            Alohida qaydlar va liniyada turib qolishlar
                        </div>

                        <div>
                            <span className="text-slate-400 text-[11px]">Alohida qaydlar:</span>
                            <textarea name="specialNotes" value={formData.specialNotes || ''} onChange={handleChange} rows={2} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 mt-1 resize-none" />
                        </div>

                        <div>
                            <span className="text-slate-400 text-[11px]">Liniyada turib qolishlar (26-30):</span>
                            <input type="text" name="delaysInfo" value={formData.delaysInfo || ''} onChange={handleChange} placeholder="" className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-slate-200 mt-1" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Controls */}
            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-700/60 px-6 py-3.5 bg-slate-800/80">
                <button
                    type="button"
                    onClick={handleComplete}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/20 mr-auto"
                >
                    <CheckCircle2 size={16} />
                    Yakunlash
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-yellow-600 hover:bg-yellow-500 transition-colors shadow-lg shadow-yellow-500/20"
                >
                    Bekor qilish
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20"
                >
                    <Save size={16} />
                    Saqlash
                </button>
            </div>
        </div>
    );
};



