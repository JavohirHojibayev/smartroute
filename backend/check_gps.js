const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const authBase = process.env.GARVEX_MT_AUTH_BASE_URL;
const apiBase = process.env.GARVEX_MT_API_BASE_URL;
const username = process.env.GARVEX_MT_USERNAME;
const password = process.env.GARVEX_MT_PASSWORD;

async function testGPS() {
  try {
    console.log(`Logging in to ${authBase}/api/Authenticate/Login...`);
    const loginRes = await fetch(`${authBase}/api/Authenticate/Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login: username,
        password: password
      })
    });
    
    const loginData = await loginRes.json();
    const token = loginData.accessToken || loginData.token;
    if (!token) {
      console.log('Login failed, no token received:', loginData);
      return;
    }
    
    console.log(`Fetching permission...`);
    const permRes = await fetch(`${apiBase}/api/Permissions/GetSelfAccountPermission`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Perm status:', permRes.status);
    console.log('Perm body:', await permRes.text());
    
    console.log(`Fetching units from ${apiBase}/api/Units/GetUnits...`);
    const url = new URL(`${apiBase}/api/Units/GetUnits`);
    url.searchParams.set('Page', '0');
    url.searchParams.set('CountOnPage', '5');
    url.searchParams.set('ShowAddresses', 'true');
    url.searchParams.set('OrderBy', 'name');
    
    const unitsRes = await fetch(url.toString(), {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Units response status:', unitsRes.status);
    const unitsText = await unitsRes.text();
    console.log('Units response text:', unitsText ? unitsText.substring(0, 300) : '<empty>');
    
    if (unitsRes.ok) {
        const units = JSON.parse(unitsText);
        const unitIds = units.objects?.map(u => u.id) || [];
        console.log('Unit IDs:', unitIds);
        
        console.log(`Fetching last data...`);
        const lastDataRes = await fetch(`${apiBase}/api/Units/GetLastData`, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            unitIds: unitIds,
            lastMessageTime: 0
          })
        });
        
        console.log('Last data response status:', lastDataRes.status);
        console.log('Last data response text:', await lastDataRes.text());
    }

  } catch (error) {
    console.error('Error occurred:', error.message);
  }
}

testGPS();
