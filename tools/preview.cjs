const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8277');
  await page.waitForFunction(()=>window.G?.Classic.loaded>130);
  await page.screenshot({path:'artifacts/village-desktop.png'});
  console.log(JSON.stringify(await page.evaluate(()=>({loaded:G.Classic.loaded,failed:G.Classic.failed,buildings:G.Game.state.buildings.length,th:G.Game.thLevel(),invalid:G.Game.state.buildings.filter(b=>!G.Game.canPlace(b.x,b.y,BUILDINGS[b.type].size,b)).map(b=>b.type)}))));
  await page.click('#btn-shop');await page.screenshot({path:'artifacts/shop-desktop.png'});
  console.log('page errors',errors);
  await browser.close();
})();
