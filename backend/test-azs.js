const https = require('https');
const data = JSON.stringify({ login: 'DKZ_Narbaevdamir@gmail.com', password: 'Damirga2026' });

const req = https.request({
  hostname: 'api.auth.garvex.uz',
  port: 443,
  path: '/api/Authenticate/Login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    const token = JSON.parse(body).token;
    
    // now fetch events
    const query = '?dateFrom=2026-07-02T19:00:00.000Z&dateTo=2026-07-03T18:59:59.999Z&take=100&skip=0';
    const req2 = https.request({
      hostname: 'api.azs-online.uz',
      port: 443,
      path: '/api/events/deviceRefillEvents' + query,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    }, res2 => {
       let b2 = '';
       res2.on('data', d => b2 += d);
       res2.on('end', () => {
         const events = JSON.parse(b2).data;
         console.log('Got', events.length, 'events');
         let sumValue = 0, sumIssued = 0, sumDiff = 0, sumDut = 0;
         events.forEach(e => {
            sumValue += e.value || 0;
            sumIssued += e.issuedValue || 0;
            sumDiff += e.differenceRefuel || 0;
            sumDut += e.issuedDut || 0;
         });
         console.log('Sums -> value:', sumValue, 'issued:', sumIssued, 'diff:', sumDiff, 'dut:', sumDut);
       });
    });
    req2.end();
  });
});
req.write(data);
req.end();
