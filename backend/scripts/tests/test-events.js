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
    const data = await res.json();
    const token = data.token;
    
    const s = 1783364400; // 2026-07-05T19:00:00.000Z
    const e = 1783450799; // 2026-07-06T18:59:59.999Z
    const url = `https://api.azs-online.uz/api/events/deviceRefillEvents?dateStart=${s}&dateEnd=${e}&page=0&countOnPage=1000&orderByDescending=true`;
    
    const eventsRes = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    const eventsData = await eventsRes.json();
    fs.writeFileSync('raw_events.json', JSON.stringify(eventsData, null, 2));
    console.log('Saved raw events:', eventsData.length || eventsData.items?.length || 0);
  } catch (err) {
    console.error(err);
  }
})();
