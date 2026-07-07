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
    
    // Now fetch dashboard
    const dashRes = await fetch('https://api.azs-online.uz/api/dashboard/getDashboard?dateStart=2026-07-05T19:00:00.000Z&dateEnd=2026-07-06T18:59:59.999Z', {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept-Language': 'ru' }
    });
    const dashData = await dashRes.json();
    fs.writeFileSync('azs_dash.json', JSON.stringify(dashData, null, 2));
    console.log('Saved to azs_dash.json');
  } catch (err) {
    console.error(err);
  }
})();
