const authUrl = 'https://api.azs-online.uz/api/Authenticate/Login';
const eventsUrl = 'https://api.azs-online.uz/api/events/deviceRefillEvents';
const username = 'DKZ_Narbaevdamir@gmail.com';
const password = 'Damirga2026';

async function test() {
  const loginRes = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: username, password: password })
  });
  if (!loginRes.ok) {
    console.error('Login failed:', loginRes.status, await loginRes.text());
    return;
  }
  let token = await loginRes.text();
  if (token.startsWith('"') && token.endsWith('"')) {
    token = token.slice(1, -1);
  }
  console.log('Got token');

  const dateFrom = new Date('2026-06-22T00:00:00+05:00').getTime() / 1000;
  const dateTo = new Date('2026-06-22T23:59:59+05:00').getTime() / 1000;

  const eventsRes = await fetch(`${eventsUrl}?DateStart=${dateFrom}&DateEnd=${dateTo}&CountOnPage=10000`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  });
  if (!eventsRes.ok) {
    console.error('Events failed:', eventsRes.status, await eventsRes.text());
    return;
  }
  const data = await eventsRes.json();
  const objs = data.objects || [];
  console.log(`Found ${objs.length} events`);
  let sumDut = 0, sumVirtual = 0, sumValue = 0, sumDiff = 0, sumLiters=0;
  objs.forEach(o => {
    sumDut += o.issuedDut || 0;
    sumVirtual += o.issuedVirtual || 0;
    sumValue += o.issuedValue || 0;
    sumDiff += o.differenceRefuel || 0;
    sumLiters += o.liters || 0;
  });
  console.log(`Sum Dut: ${sumDut}`);
  console.log(`Sum Virtual: ${sumVirtual}`);
  console.log(`Sum Value: ${sumValue}`);
  console.log(`Sum Diff: ${sumDiff}`);
  console.log(`Sum Liters: ${sumLiters}`);
  
  // also sum for station
  const byStation = {};
  objs.forEach(o => {
    const station = o.deviceName || 'Unknown';
    if (!byStation[station]) byStation[station] = { dut: 0, virt: 0, val: 0 };
    byStation[station].dut += o.issuedDut || 0;
    byStation[station].virt += o.issuedVirtual || 0;
    byStation[station].val += o.issuedValue || 0;
  });
  console.log('By Station:', byStation);
}
test();
