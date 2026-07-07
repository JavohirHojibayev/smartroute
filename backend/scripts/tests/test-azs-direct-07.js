const fs = require('fs');
(async () => {
  try {
    const res = await fetch('https://api.auth.garvex.uz/api/Authenticate/Login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login: 'DKZ_Narbaevdamir@gmail.com',
        password: 'Damirga2026'
      })
    });
    const loginData = await res.json();
    const token = loginData.accessToken || loginData.token;
    if (!token) { console.log('No token:', loginData); return; }
    
    const s = Math.floor(new Date('2026-07-05T21:00:00.000Z').getTime() / 1000);
    const e = Math.floor(new Date('2026-07-07T20:59:59.000Z').getTime() / 1000);
    
    // Fetch ALL pages
    let allObjects = [];
    let page = 0;
    while (true) {
      const url = `https://api.azs-online.uz/api/events/deviceRefillEvents?dateStart=${s}&dateEnd=${e}&page=${page}&countOnPage=100&orderByDescending=true`;
      const eventsRes = await fetch(url, {
        headers: { 
          'Authorization': `Bearer ${token}`, 
          'Accept': 'application/json'
        }
      });
      const data = await eventsRes.json();
      const objects = data.objects || [];
      if (objects.length === 0) break;
      allObjects.push(...objects);
      const totalPages = data.pageCount || 1;
      page++;
      if (page >= totalPages) break;
    }
    
    console.log('Total objects:', allObjects.length);
    
    // Compute sums at item level
    let sumValue = 0, sumIssuedValue = 0, sumIssuedDut = 0, sumIssuedVirtual = 0, sumDiffRefuel = 0;
    const type131 = allObjects.filter(o => o.eventsType === 131 || o.eventsType === 132);
    type131.forEach(o => {
      sumValue += o.value || 0;
      sumIssuedValue += o.issuedValue || 0;
      sumIssuedDut += o.issuedDut || 0;
      sumIssuedVirtual += o.issuedVirtual || 0;
      sumDiffRefuel += o.differenceRefuel || 0;
    });
    
    console.log('Type 131/132 count:', type131.length);
    console.log('sumValue:', sumValue);
    console.log('sumIssuedValue:', sumIssuedValue);
    console.log('sumIssuedDut:', sumIssuedDut);
    console.log('sumIssuedVirtual:', sumIssuedVirtual);
    console.log('sumDiffRefuel:', sumDiffRefuel);
    
    fs.writeFileSync('azs_events_all.json', JSON.stringify(allObjects, null, 2));
    console.log('Saved to azs_events_all.json');
    
  } catch (err) {
    console.error(err);
  }
})();
