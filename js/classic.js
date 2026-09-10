/* Local image assets and classic village presentation. Engine remains independent. */
const Classic = {
  images: new Map(), masks: new Map(), loaded: 0, failed: [], terrain: null,
  buildingNames: { elixir_pump: 'elixir_collector', builder_hut: "builder's_hut" },
  obstacleNames: { tree1: 'tree', tree2: 'tree', bush: 'bush', rock: 'stone', gembox: 'gem_box' },
  buildingPath(type, level = 1) {
    return `assets/buildings/home-village/${this.buildingNames[type] || type}/level_${Math.max(1, Math.min(BUILDINGS[type].levels.length, level))}.webp`;
  },
  icon(type) {
    if (TROOPS[type]) return `assets/troops/${type}/icon.webp`;
    if (SPELLS[type]) return `assets/spells/${type === 'heal' ? 'healing' : type}_spell.webp`;
    return this.buildingPath(type);
  },
  image(path) {
    if (!this.images.has(path)) {
      const img = new Image();
      img.onload = () => { this.loaded++; this.terrain = null; };
      img.onerror = () => { this.failed.push(path); };
      img.src = path;
      this.images.set(path, img);
    }
    const img = this.images.get(path);
    return img.complete && img.naturalWidth ? img : null;
  },
  sprite(ctx, path, x, bottom, width) {
    const img = this.image(path);
    if (!img) return false;
    ctx.drawImage(img, x - width / 2, bottom - width * img.naturalHeight / img.naturalWidth,
      width, width * img.naturalHeight / img.naturalWidth);
    return true;
  },
  preload() {
    for (const type in BUILDINGS) for (let l = 1; l <= BUILDINGS[type].levels.length; l++) this.image(this.buildingPath(type, l));
    for (const type of [...TROOP_ORDER, ...SPELL_ORDER]) this.image(this.icon(type));
    for (const name of Object.values(this.obstacleNames)) this.image(`assets/obstacles/home-village/${name}.webp`);
    this.image('assets/obstacles/builder-base/big_tree.webp');
    for (const res of ['gold','elixir','gems']) this.image(`assets/resources/${res}.webp`);
  },
  center() {
    const w = Render.canvas.width, h = Render.canvas.height;
    Render.cam.scale = Math.max(.38, Math.min(1.45, w / 1640, h / 850));
    const p = Render.iso(20, 20);
    Render.cam.x = w / 2;
    Render.cam.y = h * .53 - p.y * Render.cam.scale;
  },
  makeTerrain() {
    const canvas = document.createElement('canvas');
    canvas.width = 3000; canvas.height = 2000;
    const c = canvas.getContext('2d');
    c.translate(1500, 350);
    c.fillStyle = '#496c32'; c.fillRect(-1500, -350, 3000, 2000);
    let seed = 277;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    // Sand and water occupy the southwest outside the usable village.
    for (let x = -14; x < 56; x++) for (let y = -14; y < 58; y++) {
      Render.diamond(c, x, y, 1.025, 1.025);
      const inside = x >= 0 && x < GRID && y >= 0 && y < GRID;
      const r = random();
      c.fillStyle = y > 45 ? (y < 48 ? '#bca56b' : ['#318b9e','#328f9f','#3593a0'][Math.floor(r*3)]) : inside
        ? [`#8cb94c`, '#8bb84b', '#8ebc4e', '#89b64a'][Math.floor(r*4)]
        : ['#537a36','#587e38','#5e853b','#638b3d'][Math.floor(r*4)];
      c.fill();
    }
    // Gentle light over the field, fine grass detail; grid appears only in edit mode.
    Render.diamond(c, 0, 0, GRID, GRID);
    const light = c.createLinearGradient(0, 0, 0, 1040);
    light.addColorStop(0, 'rgba(226,241,124,.17)'); light.addColorStop(1, 'rgba(67,103,25,.1)');
    c.fillStyle = light; c.fill();
    for (let i = 0; i < 12000; i++) {
      const x = random()*40, y = random()*40, p = Render.iso(x, y);
      c.fillStyle = random() > .5 ? 'rgba(230,239,132,.18)' : 'rgba(59,107,27,.1)';
      c.fillRect(p.x, p.y, 1 + random()*3, 1);
    }
    // Worn boundary stones.
    for (let i = 0; i < 40; i += 1.2) for (const [x,y] of [[i,0],[0,i],[40,i],[i,40]]) {
      Render.prism(c,x-.08,y-.08,.32,.34,3, '#a5a48a');
    }
    const trees = [];
    for (let x=-11;x<51;x+=1.7) for(let y=-10;y<46;y+=1.7) {
      if(x > -.9 && y > -.9 && x < 40.9 && y < 40.9) continue;
      if(y > 40 && x < 15) continue;
      trees.push({x:x+random()*.8,y:y+random()*.8,w:75+random()*45});
    }
    trees.sort((a,b)=>(a.x+a.y)-(b.x+b.y));
    for(const t of trees) {
      const p = Render.iso(t.x,t.y);
      this.sprite(c,'assets/obstacles/builder-base/big_tree.webp',p.x,p.y+10,t.w);
    }
    // Shore foam, visible when panning toward the water.
    c.strokeStyle='rgba(213,249,231,.5)'; c.lineWidth=3;
    c.beginPath(); const a=Render.iso(-15,48),b=Render.iso(55,48);
    c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
    this.terrain = canvas;
  },
  drawGround(ctx) {
    if (!this.terrain) this.makeTerrain();
    ctx.drawImage(this.terrain,-1500,-350);
    if (Main.placementType || Main.dragBuilding) {
      ctx.strokeStyle = 'rgba(245,255,211,.25)'; ctx.lineWidth = .8;
      for(let x=0;x<GRID;x++) for(let y=0;y<GRID;y++) { Render.diamond(ctx,x,y,1,1);ctx.stroke(); }
    }
  },
  createVillage() {
    const s = Game.state;
    s.buildings=[]; s.obstacles=[]; s.nextId=1; s.trainQueue=[]; s.brewQueue=[]; s.research=null;
    s.gold=72000; s.elixir=64000; s.gems=450; s.trophies=850; s.xp=23040;
    s.army={barbarian:20,archer:20,giant:8,wall_breaker:5,wizard:5};
    s.spells={lightning:1,heal:1}; s.troopLevels={};
    const layout=[
      ['town_hall',6,18,18], ['gold_storage',6,14,18],['elixir_storage',6,23,18],
      ['gold_storage',6,18,13],['elixir_storage',6,18,24],
      ['mortar',4,13,13],['mortar',4,24,24],['air_defense',4,24,13],['wizard_tower',3,13,24],
      ['cannon',6,10,18],['cannon',6,27,18],['cannon',6,18,9],['cannon',6,18,28],
      ['archer_tower',6,10,10],['archer_tower',6,27,10],['archer_tower',6,10,27],
      ['gold_mine',6,6,13],['gold_mine',6,6,18],['gold_mine',6,6,23],
      ['elixir_pump',6,31,13],['elixir_pump',6,31,18],['elixir_pump',6,31,23],
      ['barracks',6,14,5],['barracks',6,23,5],['laboratory',4,23,30],['spell_factory',2,27,27],
      ['army_camp',5,12,32],['army_camp',5,27,32],['army_camp',5,5,5],
      ['builder_hut',1,10,6],['builder_hut',1,29,6]
    ];
    for (const args of layout) Game.addBuilding(...args);
    const walls = new Set();
    const wall = (x,y) => {const key=`${x},${y}`;if(!walls.has(key)&&Game.canPlace(x,y,1,null)){Game.addBuilding('wall',5,x,y);walls.add(key);}};
    for(let i=9;i<=30;i++){wall(i,8);wall(i,31);wall(9,i);wall(30,i);}
    for(let i=13;i<=26;i++){wall(i,17);wall(i,22);}
    for(const [x,y,key] of [[3,15,'tree1'],[5,30,'tree2'],[33,7,'tree1'],[34,29,'tree1'],[20,35,'rock'],[32,34,'bush'],[4,25,'rock'],[34,10,'gembox']]) Game.addObstacle(key,x,y);
    for(const b of s.buildings) if(['gold_mine','elixir_pump'].includes(b.type)) b.stored=180;
    s.classicDemo=true; Game.dirty=true;
  },
  mountUI() {
    const top = UI.$('hud-top');
    top.insertAdjacentHTML('afterbegin',`<div class="player-card"><div class="xp-shield"><span id="classic-level">25</span></div><div><strong>首领的村庄</strong><div class="xp-track"><i></i></div><div class="player-sub">CLASH VILLAGE</div></div></div>`);
    for(const [cls,res] of [['gold','gold'],['elixir','elixir'],['gems','gems']]) {
      const bar=top.querySelector('.'+cls);
      bar.querySelector('.res-icon').innerHTML=`<img src="assets/resources/${res}.webp" alt="">`;
      bar.insertAdjacentHTML('afterbegin',`<span class="capacity" id="cap-${res}"></span>`);
    }
    UI.$('trophy-badge').innerHTML='<img src="assets/icons/Icon_HV_Trophy.png" alt="奖杯"><span id="trophy-num">0</span>';
    UI.$('builder-badge').innerHTML='<img src="assets/helpers/builder\'s_apprentice.webp" alt="建筑工人"><div><small>建筑工人</small><span id="builder-num">2/2</span></div>';
    UI.$('builder-bar').insertAdjacentHTML('beforeend','<div class="village-status"><img src="assets/icons/Icon_HV_Shield.png" alt=""><div><small>家乡村庄</small><strong id="town-level">大本营 6 级</strong></div></div>');
    UI.$('btn-attack').querySelector('.bb-icon').innerHTML='<img src="assets/icons/Icon_HV_Attack.png" alt="">';
    UI.$('btn-army').querySelector('.bb-icon').innerHTML='<img src="assets/troops/barbarian/icon.webp" alt="">';
    UI.$('btn-shop').querySelector('.bb-icon').innerHTML='<img src="assets/buildings/home-village/builder\'s_hut/level_1.webp" alt="">';
    document.body.insertAdjacentHTML('beforeend',`<div id="village-tools"><button id="btn-home" title="回到村庄中心">⌖</button><button id="btn-zoom-in" title="放大">＋</button><button id="btn-zoom-out" title="缩小">−</button><button id="btn-help" title="设置与帮助">⚙</button></div>
      <div id="village-caption"><strong>家乡村庄</strong><span>拖动地图 · 滚轮缩放 · 点击建筑管理</span></div>
      <div id="panel-settings" class="panel modal hidden"><div class="panel-title"><span>村庄设置</span><button class="close-x" id="close-settings">✕</button></div><div class="settings-body">
      <p>建造村庄，训练军队，进攻并收集战利品。</p><p>点击建筑查看升级与收集；选中后拖动可以移动建筑。点击部队训练，点击进攻搜索对手，在红线外部署军队。</p>
      <label>背景音乐 <input id="music-volume" type="range" min="0" max="100" value="22"></label>
      <div class="center-row"><button class="act-btn" id="btn-demo">进入六本体验村庄</button><button class="act-btn blue" id="btn-restore">返回原村庄</button></div>
      <p class="credits">本地单机同人演示 · 建造时间已加速，数值为本项目配置。建筑、兵种头像和背景音乐由 <a href="https://github.com/ClashKingInc/ClashKingAssets" target="_blank" rel="noreferrer">ClashKing Assets</a> 提供，原游戏素材属于 Supercell。本作品非官方产品。音乐采用丛林场景曲目；战斗单位动画与交互音效仍为程序实现。</p></div></div>`);
    UI.$('btn-home').onclick=()=>this.center();
    UI.$('btn-zoom-in').onclick=()=>Main.zoomAt(innerWidth/2,innerHeight/2,1.15);
    UI.$('btn-zoom-out').onclick=()=>Main.zoomAt(innerWidth/2,innerHeight/2,1/1.15);
    UI.$('btn-help').onclick=()=>{UI.closeAll();UI.$('panel-settings').classList.remove('hidden');};
    UI.$('close-settings').onclick=()=>UI.$('panel-settings').classList.add('hidden');
    UI.$('btn-demo').onclick=()=>{
      if(!Game.state.classicDemo) {
        try { localStorage.setItem('clash_village_original_backup',JSON.stringify(Game.state)); }
        catch {UI.toast('存档备份失败，未切换村庄');return;}
      } else {UI.toast('当前已经是六本体验村庄');return;}
      this.createVillage();Game.save();UI.closeAll();this.center();UI.updateHUD();UI.toast('六本体验村庄已就绪，原村庄已备份');
    };
    UI.$('btn-restore').onclick=()=>{
      const raw=localStorage.getItem('clash_village_original_backup');
      if(!raw){UI.toast('没有原村庄备份');return;}
      try{Game.state=JSON.parse(raw);}catch{UI.toast('原村庄备份无法读取');return;}
      Game.save();UI.closeAll();this.center();UI.updateHUD();UI.toast('已恢复原村庄');
    };
    this.music=new Audio('assets/sceneries/jungle_scenery/music.ogg');
    this.music.loop=true;this.music.volume=.22;
    const syncMusic=()=>{if(SFX.enabled&&!Battle.active&&!document.hidden)this.music.play().catch(()=>{});else this.music.pause();};
    document.addEventListener('pointerdown',syncMusic);
    document.addEventListener('visibilitychange',syncMusic);
    const soundClick=UI.$('btn-sound').onclick;
    UI.$('btn-sound').onclick=()=>{soundClick();syncMusic();Game.save();};
    UI.$('music-volume').oninput=e=>{this.music.volume=Number(e.target.value)/100;};
    const start=Battle.start.bind(Battle),exit=Battle.exit.bind(Battle);
    Battle.start=(enemy)=>{start(enemy);this.music.pause();};
    Battle.exit=()=>{exit();syncMusic();};
  },
};

Classic.preload();
// Pick the visible opaque part of a roof or tower, not an invisible grid underneath it.
const oldPick=Main.pickBuilding.bind(Main);
Main.pickBuilding=function(gx,gy) {
  const point=Render.iso(gx,gy);
  const buildings=[...Game.state.buildings].sort((a,b)=>b.x+b.y+BUILDINGS[b.type].size-a.x-a.y-BUILDINGS[a.type].size);
  for(const b of buildings) {
    const path=Classic.buildingPath(b.type,b.level),img=Classic.image(path);
    if(!img)continue;
    const s=BUILDINGS[b.type].size,p=Render.iso(b.x+s/2,b.y+s/2),w=s*TILE_W*(b.type==='wall'?.96:.9),h=w*img.naturalHeight/img.naturalWidth;
    const u=(point.x-(p.x-w/2))/w,v=(point.y-(p.y+s*HH*.85-h))/h;
    if(u<0||u>=1||v<0||v>=1)continue;
    if(!Classic.masks.has(path)) {
      const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
      try{Classic.masks.set(path,ctx.getImageData(0,0,canvas.width,canvas.height).data);}catch{continue;}
    }
    const index=(Math.floor(v*img.naturalHeight)*img.naturalWidth+Math.floor(u*img.naturalWidth))*4+3;
    if(Classic.masks.get(path)[index]>80)return b;
  }
  return oldPick(gx,gy);
};
Render.drawGround=ctx=>Classic.drawGround(ctx);
for(const type in BUILDINGS) {
  const original=Render['b_'+type];
  Render['b_'+type]=function(ctx,b,size,now) {
    const p=this.iso(b.x+size/2,b.y+size/2);
    const width=size*TILE_W*(type==='wall'?.96:.9);
    if(!Classic.sprite(ctx,Classic.buildingPath(type,b.level),p.x,p.y+size*HH*.85,width)) original?.call(this,ctx,b,size,now);
  };
}
const oldObstacle=Render.drawObstacle;
Render.drawObstacle=function(ctx,o,now) {
  const p=this.iso(o.x+o.size/2,o.y+o.size/2);
  const width=o.key.startsWith('tree')?100:o.key==='bush'?52:64;
  if(!Classic.sprite(ctx,`assets/obstacles/home-village/${Classic.obstacleNames[o.key]||'tree'}.webp`,p.x,p.y+12,width))oldObstacle.call(this,ctx,o,now);
  if(o.clearing)this.worldBar(ctx,o.x+o.size/2,o.y+o.size/2,60,1-o.clearing.remain/o.clearing.total,'#a4ed4b');
};
// Keep particles, construction and HP overlays from the engine; replace collection emoji.
const oldEmoji=Render.emoji;
Render.emoji=function(ctx,x,y,elev,ch,size) {
  const res=ch==='🪙'?'gold':ch==='💧'?'elixir':null;
  if(res){const p=this.iso(x,y);if(Classic.sprite(ctx,`assets/resources/${res}.webp`,p.x,p.y-elev+14,27))return;}
  oldEmoji.call(this,ctx,x,y,elev,ch,size);
};
const oldNew=Game.newState.bind(Game);
Game.newState=function(){oldNew();Classic.createVillage();return this.state;};
const oldClose=UI.closeAll.bind(UI);
UI.closeAll=function(){oldClose();Render.previewEnemy=null;document.body.classList.remove('scouting');UI.$('panel-settings')?.classList.add('hidden');};
const oldSearch=UI.renderSearch.bind(UI);
UI.renderSearch=function(){oldSearch();Render.previewEnemy=this.currentEnemy;document.body.classList.add('scouting');Classic.center();};
const oldHud=UI.updateHUD.bind(UI);
UI.updateHUD=function(){
  oldHud();if(!UI.$('classic-level'))return;
  UI.$('classic-level').textContent=Game.playerLevel();
  UI.$('cap-gold').textContent='容量 '+fmt(Game.storageCap('gold'));
  UI.$('cap-elixir').textContent='容量 '+fmt(Game.storageCap('elixir'));
  UI.$('town-level').textContent=`大本营 ${Game.thLevel()} 级`;
  document.body.classList.toggle('in-battle',Battle.active);
};
// Replace card pictures at the source, including research and spell cards.
UI.assetIcon=function(type){return `<img src="${Classic.icon(type)}" alt="" draggable="false">`;};
window.addEventListener('DOMContentLoaded',()=>{
  Classic.mountUI();Classic.center();UI.updateHUD();
  // Register after Render.init's resize listener so camera uses the new canvas dimensions.
  window.addEventListener('resize',()=>Classic.center());
  document.querySelector('[data-close="panel-search"]').onclick=()=>UI.closeAll();
  // Hold to deploy consecutive troops, with the same red-zone checks as single taps.
  let repeat=null,hold=null,last=null;
  const canvas=Render.canvas;
  canvas.addEventListener('pointerdown',e=>{
    if(!Battle.active||Battle.ended||Battle.selected?.kind!=='troop')return;
    last={x:e.clientX,y:e.clientY};
    hold=setTimeout(()=>{repeat=setInterval(()=>{
      if(!Battle.active||Battle.ended||Battle.selected?.kind!=='troop')return;
      const p=Render.screenToGrid(last.x,last.y);
      if(Battle.deploy(Battle.selected.type,p.gx,p.gy))UI.renderDeployBar();
    },130);},300);
  });
  canvas.addEventListener('pointermove',e=>{last={x:e.clientX,y:e.clientY};});
  const stop=()=>{clearTimeout(hold);clearInterval(repeat);hold=repeat=null;};
  window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',stop);window.addEventListener('blur',stop);
});
window.G.Classic=Classic;
