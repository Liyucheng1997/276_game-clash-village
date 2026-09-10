const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');
(async()=>{
  fs.mkdirSync('artifacts',{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[],missing=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))missing.push(r.url());});
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8277');
    await page.waitForFunction(()=>G.Classic.loaded>=132);
    await page.evaluate(()=>document.fonts.ready);
    assert.deepEqual(await page.evaluate(()=>G.Classic.failed),[]);
    assert.equal(await page.evaluate(()=>G.Game.thLevel()),6);
    assert.deepEqual(await page.evaluate(()=>G.Game.state.buildings.filter(b=>!G.Game.canPlace(b.x,b.y,BUILDINGS[b.type].size,b)).map(b=>b.type)),[]);
    await page.screenshot({path:'artifacts/village-desktop.png'});
    // Clicking the town hall's roof must select the town hall, not a building behind it.
    const roof=await page.evaluate(()=>{const p=G.Render.iso(20,20);return{x:G.Render.cam.x+p.x*G.Render.cam.scale,y:G.Render.cam.y+(p.y-80)*G.Render.cam.scale};});
    await page.mouse.click(roof.x,roof.y);
    assert.equal(await page.evaluate(()=>G.Render.selectedBuilding?.type),'town_hall');
    const drop=await page.evaluate(()=>{const p=G.Render.iso(36,36);return{x:G.Render.cam.x+p.x*G.Render.cam.scale,y:G.Render.cam.y+p.y*G.Render.cam.scale};});
    await page.mouse.move(roof.x,roof.y);await page.mouse.down();await page.mouse.move(drop.x,drop.y,{steps:12});await page.mouse.up();
    assert.deepEqual(await page.evaluate(()=>{const b=G.Game.state.buildings.find(b=>b.type==='town_hall');return[b.x,b.y];}),[34,34]);
    await page.evaluate(()=>{const b=G.Game.state.buildings.find(b=>b.type==='town_hall');b.x=18;b.y=18;});
    await page.keyboard.press('Escape');
    await page.click('#btn-army');
    const before=await page.evaluate(()=>G.Game.state.army.barbarian);
    await page.click('[data-act="train"][data-type="barbarian"]');
    await page.evaluate(()=>G.Game.tickEconomy(30));
    assert.equal(await page.evaluate(()=>G.Game.state.army.barbarian),before+1);
    await page.screenshot({path:'artifacts/army-desktop.png'});
    await page.keyboard.press('Escape');
    // Economy, builder occupancy, completion, valid placement, and resource collection.
    const economic=await page.evaluate(()=>{
      const game=G.Game,b=game.state.buildings.find(b=>b.type==='gold_mine'),old=b.level;
      const started=game.startUpgrade(b),busy=game.builderBusy();
      if(b.upgrading)game.tickEconomy(b.upgrading.remain+1);
      b.stored=100;const gold=game.state.gold;game.collect(b);
      const spot=game.findFreeSpot(3),placed=spot&&game.placeNew('gold_mine',spot.x,spot.y);
      return{started,busy,level:b.level,old,collected:game.state.gold>=gold,placed:!!placed};
    });
    assert(economic.started);assert.equal(economic.busy,1);assert.equal(economic.level,economic.old+1);assert(economic.collected);assert(economic.placed);
    await page.click('#btn-shop');await page.screenshot({path:'artifacts/shop-desktop.png'});await page.keyboard.press('Escape');
    await page.click('#btn-attack');
    assert(await page.evaluate(()=>!!G.Render.previewEnemy));
    await page.screenshot({path:'artifacts/scout-desktop.png'});
    await page.click('#btn-fight');
    assert(await page.evaluate(()=>G.Battle.active));
    const reject=await page.evaluate(()=>{const b=G.Battle.buildings.find(b=>b.type==='town_hall');const n=G.Battle.army.barbarian;return !G.Battle.deploy('barbarian',b.x+1,b.y+1)&&G.Battle.army.barbarian===n;});assert(reject);
    await page.click('.deploy-card[data-type="barbarian"]');
    const spawn=await page.evaluate(()=>{for(let y=3;y<37;y++)for(let x=3;x<37;x++){if(!G.Battle.allowGrid[y*GRID+x])continue;const p=G.Render.iso(x+.5,y+.5),sx=G.Render.cam.x+p.x*G.Render.cam.scale,sy=G.Render.cam.y+p.y*G.Render.cam.scale;if(sx>250&&sx<1150&&sy>180&&sy<680)return{x:sx,y:sy};}});
    assert(spawn);await page.mouse.move(spawn.x,spawn.y);await page.mouse.down();await page.waitForTimeout(850);await page.mouse.up();
    assert((await page.evaluate(()=>G.Battle.usedTroops.barbarian))>=3);
    const simulation=await page.evaluate(()=>{
      const initial=G.Battle.troops.map(t=>({x:t.x,y:t.y}));
      for(let i=0;i<900;i++)G.Battle.update(1/30);
      return{time:G.Battle.time,moved:G.Battle.troops.some((t,i)=>Math.hypot(t.x-initial[i].x,t.y-initial[i].y)>.5),damage:G.Battle.buildings.some(b=>b.hp<b.maxHp)||G.Battle.troops.some(t=>t.hp<t.maxHp)};
    });
    assert(simulation.time<151);assert(simulation.moved);assert(simulation.damage);
    await page.screenshot({path:'artifacts/battle-desktop.png'});
    // Exercise destruction, three-star scoring and the reset between consecutive fights.
    const combat=await page.evaluate(()=>{
      const battle=G.Battle;
      for(const b of battle.buildings)battle.damageBuilding(b,b.hp+1);
      battle.update(.1);
      return{ended:battle.ended,stars:battle.stars,percent:battle.percent,result:battle.result};
    });
    assert.equal(combat.stars,3);assert.equal(combat.percent,100);assert(combat.ended);
    await page.click('#btn-back-home');
    await page.evaluate(()=>{G.Battle.start(G.EnemyGen.generate(6,850));});
    assert.equal(await page.evaluate(()=>G.Battle.thDestroyed),false);
    assert.equal(await page.evaluate(()=>G.Battle.stars),0);
    await page.evaluate(()=>{G.Battle.exit();G.UI.updateHUD();});
    // Preserve an existing profile through demo entry and restore.
    await page.evaluate(()=>{G.Game.state.classicDemo=false;G.Game.state.gold=44321;G.Game.save();});
    await page.reload();await page.waitForFunction(()=>G.Classic.loaded>=132);
    await page.click('#btn-help');await page.click('#btn-demo');
    assert.equal(await page.evaluate(()=>G.Game.state.gold),72000);
    await page.click('#btn-help');await page.click('#btn-restore');
    assert.equal(await page.evaluate(()=>G.Game.state.gold),44321);
    await page.reload();assert.equal(await page.evaluate(()=>G.Game.state.gold),44321);
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>G.Render.canvas.width===390&&G.Render.cam.x===195);
    await page.screenshot({path:'artifacts/village-mobile.png'});
    await page.click('#btn-shop');assert(await page.locator('#panel-shop').isVisible());await page.screenshot({path:'artifacts/shop-mobile.png'});
    await page.keyboard.press('Escape');await page.click('#btn-sound');assert.equal(await page.evaluate(()=>G.Classic.music.paused),true);
    assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
    const summary={passed:true,checks:['asset loading','nonoverlapping village','roof picking','building drag','training','upgrade builders','construction placement','collection','shop','enemy scouting','red-zone rejection','hold deployment','troop movement and damage','three-star result','consecutive battle reset','profile backup and restoration','reload persistence','mobile resize and UI','sound mute'],errors,missing};
    fs.writeFileSync('artifacts/smoke-results.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
