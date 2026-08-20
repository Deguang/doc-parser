import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  await page.evaluate(async () => {
    try {
      const res = await fetch("https://hf-mirror.com/Xenova/all-MiniLM-L6-v2/resolve/main/config.json");
      console.log("STATUS:", res.status);
      const text = await res.text();
      console.log("TEXT:", text.slice(0, 50));
    } catch (e) {
      console.log("ERROR:", e.message);
    }
  });
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();
