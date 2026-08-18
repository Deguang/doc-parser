const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ headless: "new", executablePath: '/usr/bin/google-chrome' });
  const page = await browser.newPage();
  
  // Capture logs
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  
  await page.goto('http://localhost:4173/doc-parser/', { waitUntil: 'networkidle2' });
  
  // Upload a file using the file input
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    console.log('Uploading file...');
    await fileInput.uploadFile('test.pdf');
  } else {
    console.log('File input not found');
  }
  
  // Wait a bit for processing
  await new Promise(r => setTimeout(r, 5000));
  
  console.log('Closing browser...');
  await browser.close();
})();
