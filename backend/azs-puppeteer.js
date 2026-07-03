const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.setRequestInterception(true);
  page.on('request', request => {
    request.continue();
  });
  
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/api/') && response.request().method() !== 'OPTIONS') {
      try {
        const text = await response.text();
        console.log(`[API RESPONSE] ${url}`);
        if (text.length < 2000) {
            console.log(text);
        } else {
            console.log(text.substring(0, 500) + '... [TRUNCATED]');
        }
      } catch (e) {}
    }
  });

  console.log('Navigating to login...');
  await page.goto('https://azs-online.uz/login', { waitUntil: 'networkidle2' });
  
  console.log('Logging in...');
  await page.type('input[type="text"]', 'DKZ_Narbaevdamir@gmail.com');
  await page.type('input[type="password"]', 'Damirga2026');
  await page.click('button[type="submit"]');
  
  console.log('Waiting for dashboard...');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  
  console.log('Dashboard loaded. Waiting a bit for data to load...');
  await new Promise(r => setTimeout(r, 5000));
  
  await browser.close();
})();
