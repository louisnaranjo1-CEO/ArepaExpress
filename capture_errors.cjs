const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        
        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.log('PAGE ERROR:', msg.text());
            }
        });
        
        page.on('pageerror', err => {
            console.log('PAGE UNCAUGHT EXCEPTION:', err.toString());
        });

        console.log('Navigating to http://localhost:5001...');
        await page.goto('http://localhost:5001', { waitUntil: 'networkidle0', timeout: 10000 });
        
        // Wait a bit more to see if any errors pop up after splash
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await browser.close();
        console.log('Done.');
    } catch (err) {
        console.error('Script Error:', err);
        process.exit(1);
    }
})();
