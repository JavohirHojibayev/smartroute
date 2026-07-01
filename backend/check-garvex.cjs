const fetch = require('node-fetch');

async function run() {
  const loginUrl = 'https://api.auth.garvex.tech/api/Authenticate/Login';
  const loginRes = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ login: 'DKZ_Narbaevdamir@gmail.com', password: 'Damirga2026' })
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken || loginData.access_token || loginData.token;
  console.log('Got token:', token ? 'yes' : 'no');

  const unitsUrl = 'https://api.mt.garvex.tech/api/Units/GetUnits?page=0&countOnPage=10';
  const unitsRes = await fetch(unitsUrl, {
    headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
  });
  const unitsData = await unitsRes.json();
  console.log('Units:', JSON.stringify(unitsData.objects.slice(0, 3), null, 2));
}

run().catch(console.error);
