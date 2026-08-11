// ============ 游戏状态 / 存档 / 经济系统 ============
const SAVE_KEY = 'clash_village_save_v1';

const Game = {
  state: null,
  dirty: false,          // 界面需要刷新
  now() { return Date.now() / 1000; },

  // ---------- 新档 ----------
  newState() {
    const now = this.now();
    const s = {
      ver: 1,
      gold: 750, elixir: 750, gems: 250,
      trophies: 0, xp: 0,
      buildings: [],
      obstacles: [],
      army: {},            // {type: count}
      spells: {},          // {type: count}
      trainQueue: [],      // [{type, remain}]
      brewQueue: [],       // [{type, remain}]
      research: null,      // {type, toLevel, remain}
      troopLevels: {},     // {type: level}
      nextId: 1,
      lastSave: now,
      lastObstacle: now,
      battleWins: 0, battleCount: 0,
      soundOn: true,
    };
    this.state = s;
    // 初始村庄
    this.addBuilding('town_hall', 1, 18, 18);
    this.addBuilding('gold_mine', 1, 24, 16);
    this.addBuilding('elixir_pump', 1, 24, 22);
    this.addBuilding('gold_storage', 1, 14, 16);
    this.addBuilding('elixir_storage', 1, 14, 22);
    this.addBuilding('cannon', 1, 19, 13);
    this.addBuilding('barracks', 1, 13, 27);
    this.addBuilding('army_camp', 1, 24, 27);
    this.addBuilding('builder_hut', 1, 10, 12);
    this.addBuilding('builder_hut', 1, 10, 30);
    // 初始障碍物
    const spots = [[4,6,'tree1'],[6,32,'tree2'],[32,5,'rock'],[33,30,'tree1'],[28,8,'bush'],[8,20,'tree2'],[30,20,'bush'],[16,34,'rock']];
    for (const [x, y, key] of spots) this.addObstacle(key, x, y);
    return s;
  },

  addBuilding(type, level, x, y) {
    const b = {
      id: this.state.nextId++, type, level, x, y,
      upgrading: null,         // {remain, toLevel}
      stored: 0,               // 采集器已积累
    };
    this.state.buildings.push(b);
    return b;
  },
  addObstacle(key, x, y) {
    const def = OBSTACLES.find(o => o.key === key);
    this.state.obstacles.push({ id: this.state.nextId++, key, x, y, size: def.size, clearing: null });
  },

  // ---------- 存/读 ----------
  save() {
    this.state.lastSave = this.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); } catch (e) {}
  },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || s.ver !== 1) return false;
      this.state = s;
      // 离线收益: 采集器按离线时间继续积累
      const offline = Math.max(0, this.now() - (s.lastSave || this.now()));
      if (offline > 1) this.tickEconomy(Math.min(offline, 3600 * 8));
      return true;
    } catch (e) { return false; }
  },
  reset() {
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  },

  // ---------- 查询 ----------
  bDef(b) { return BUILDINGS[b.type]; },
  bLevelData(b, lv) { return BUILDINGS[b.type].levels[(lv || b.level) - 1]; },
  thLevel() {
    const th = this.state.buildings.find(b => b.type === 'town_hall');
    return th ? th.level : 1;
  },
  countType(type) { return this.state.buildings.filter(b => b.type === type).length; },
  builderTotal() { return this.countType('builder_hut'); },
  builderBusy() {
    let n = this.state.buildings.filter(b => b.upgrading).length;
    n += this.state.obstacles.filter(o => o.clearing).length;
    return n;
  },
  builderFree() { return this.builderTotal() - this.builderBusy(); },

  storageCap(res) {
    let cap = 0;
    for (const b of this.state.buildings) {
      if (b.type === 'town_hall') cap += this.bLevelData(b).storage;
      if (res === 'gold' && b.type === 'gold_storage') cap += this.bLevelData(b).storage;
      if (res === 'elixir' && b.type === 'elixir_storage') cap += this.bLevelData(b).storage;
    }
    return cap;
  },
  campCapacity() {
    let cap = 0;
    for (const b of this.state.buildings) if (b.type === 'army_camp' && !this.isUnderConstruction(b)) cap += this.bLevelData(b).capacity;
    return cap;
  },
  spellCapacity() {
    const f = this.state.buildings.find(b => b.type === 'spell_factory');
    if (!f || this.isUnderConstruction(f)) return 0;
    return this.bLevelData(f).capacity;
  },
  armyHousing() {
    let n = 0;
    for (const t in this.state.army) n += this.state.army[t] * TROOPS[t].housing;
    for (const q of this.state.trainQueue) n += TROOPS[q.type].housing;
    return n;
  },
  spellCount() {
    let n = 0;
    for (const t in this.state.spells) n += this.state.spells[t];
    n += this.state.brewQueue.length;
    return n;
  },
  maxBarracksLevel() {
    let m = 0;
    for (const b of this.state.buildings) if (b.type === 'barracks' && !this.isUnderConstruction(b)) m = Math.max(m, b.level);
    return m;
  },
  barracksCount() {
    return this.state.buildings.filter(b => b.type === 'barracks' && !this.isUnderConstruction(b)).length;
  },
  labLevel() {
    const l = this.state.buildings.find(b => b.type === 'laboratory');
    return (l && !this.isUnderConstruction(l)) ? l.level : 0;
  },
  factoryLevel() {
    const f = this.state.buildings.find(b => b.type === 'spell_factory');
    return (f && !this.isUnderConstruction(f)) ? f.level : 0;
  },
  troopLevel(type) { return this.state.troopLevels[type] || 1; },
  isUnderConstruction(b) { return b.upgrading && b.upgrading.toLevel === 1; },
  playerLevel() { return Math.floor(Math.sqrt(this.state.xp / 40)) + 1; },
  addXp(n) { this.state.xp += Math.max(1, Math.round(n)); },

  // ---------- 占地 ----------
  // 返回 GRID x GRID 占用表: null 或 {kind:'building'|'obstacle', ref}
  occupancy(exclude) {
    const g = new Array(GRID * GRID).fill(null);
    for (const b of this.state.buildings) {
      if (b === exclude) continue;
      const size = this.bDef(b).size;
      for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) {
        g[(b.y + dy) * GRID + (b.x + dx)] = { kind: 'building', ref: b };
      }
    }
    for (const o of this.state.obstacles) {
      if (o === exclude) continue;
      for (let dx = 0; dx < o.size; dx++) for (let dy = 0; dy < o.size; dy++) {
        g[(o.y + dy) * GRID + (o.x + dx)] = { kind: 'obstacle', ref: o };
      }
    }
    return g;
  },
  canPlace(x, y, size, exclude) {
    if (x < 1 || y < 1 || x + size > GRID - 1 || y + size > GRID - 1) return false;
    const occ = this.occupancy(exclude);
    for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) {
      if (occ[(y + dy) * GRID + (x + dx)]) return false;
    }
    return true;
  },
  findFreeSpot(size) {
    // 从中心螺旋向外找空位
    const c = GRID / 2;
    for (let r = 0; r < GRID; r++) {
      for (let x = Math.floor(c - r); x <= c + r; x++) for (let y = Math.floor(c - r); y <= c + r; y++) {
        if (Math.max(Math.abs(x - c), Math.abs(y - c)) !== r) continue;
        if (this.canPlace(x, y, size, null)) return { x, y };
      }
    }
    return null;
  },

  // ---------- 花费 ----------
  canAfford(cost) {
    const s = this.state;
    return (s.gold >= (cost.gold || 0)) && (s.elixir >= (cost.elixir || 0)) && (s.gems >= (cost.gems || 0));
  },
  pay(cost) {
    if (!this.canAfford(cost)) return false;
    this.state.gold -= cost.gold || 0;
    this.state.elixir -= cost.elixir || 0;
    this.state.gems -= cost.gems || 0;
    this.dirty = true;
    return true;
  },
  gain(res, amount) {
    const s = this.state;
    if (res === 'gold') s.gold = Math.min(this.storageCap('gold'), s.gold + amount);
    else if (res === 'elixir') s.elixir = Math.min(this.storageCap('elixir'), s.elixir + amount);
    else if (res === 'gems') s.gems += amount;
    this.dirty = true;
  },

  // ---------- 建造 / 升级 ----------
  maxCount(type) { return BUILDINGS[type].maxPerTH[this.thLevel() - 1]; },
  canBuild(type) {
    const def = BUILDINGS[type];
    if (this.countType(type) >= this.maxCount(type)) return { ok: false, why: '数量已达上限，升级大本营解锁更多' };
    if (type === 'builder_hut') {
      const cost = { gems: BUILDER_HUT_GEM_COST[this.countType(type)] };
      if (!this.canAfford(cost)) return { ok: false, why: '宝石不足' };
      return { ok: true, cost };
    }
    const cost = def.levels[0].cost;
    if (!this.canAfford(cost)) return { ok: false, why: '资源不足' };
    if (def.levels[0].time > 0 && this.builderFree() <= 0) return { ok: false, why: '没有空闲的建筑工人' };
    return { ok: true, cost };
  },
  // 开始放置(由 UI 进入放置模式后调用)
  placeNew(type, x, y) {
    const def = BUILDINGS[type];
    const chk = this.canBuild(type);
    if (!chk.ok) return null;
    if (!this.canPlace(x, y, def.size, null)) return null;
    this.pay(chk.cost);
    const b = this.addBuilding(type, 1, x, y);
    const t = def.levels[0].time;
    if (t > 0) { b.level = 0; b.upgrading = { remain: t, total: t, toLevel: 1 }; SFX.build(); }
    else SFX.done();
    this.dirty = true;
    return b;
  },
  upgradeInfo(b) {
    const def = this.bDef(b);
    const nextLv = b.level + 1;
    if (b.type === 'builder_hut') return { can: false, why: '无法升级' };
    if (nextLv > def.levels.length) return { can: false, why: '已达最高等级' };
    if (b.type !== 'town_hall' && b.type !== 'wall' && nextLv > this.thLevel() + 2) return { can: false, why: '需要更高级的大本营' };
    if (b.type === 'wall' && nextLv > this.thLevel()) return { can: false, why: '需要更高级的大本营' };
    const ld = def.levels[nextLv - 1];
    return { can: true, cost: ld.cost, time: ld.time, nextLv, ld };
  },
  startUpgrade(b) {
    if (b.upgrading) return false;
    const info = this.upgradeInfo(b);
    if (!info.can) { UI.toast(info.why); return false; }
    if (!this.canAfford(info.cost)) { UI.toast('资源不足'); SFX.error(); return false; }
    if (info.time > 0 && this.builderFree() <= 0) { UI.toast('没有空闲的建筑工人'); SFX.error(); return false; }
    this.pay(info.cost);
    if (info.time <= 0) {
      b.level = info.nextLv;
      this.addXp(Math.sqrt((info.cost.gold || 0) + (info.cost.elixir || 0)));
      SFX.done();
    } else {
      b.upgrading = { remain: info.time, total: info.time, toLevel: info.nextLv };
      SFX.build();
    }
    this.dirty = true;
    return true;
  },
  cancelUpgrade(b) {
    if (!b.upgrading) return;
    const def = this.bDef(b);
    const cost = def.levels[b.upgrading.toLevel - 1].cost;
    // 返还一半
    this.gain('gold', (cost.gold || 0) * 0.5);
    this.gain('elixir', (cost.elixir || 0) * 0.5);
    if (b.upgrading.toLevel === 1) {
      this.state.buildings = this.state.buildings.filter(x => x !== b);
    } else b.upgrading = null;
    this.dirty = true;
  },
  finishNow(b) {
    if (!b.upgrading) return;
    const cost = { gems: gemCostForTime(b.upgrading.remain) };
    if (!this.pay(cost)) { UI.toast('宝石不足'); SFX.error(); return; }
    b.upgrading.remain = 0;
  },
  moveBuilding(b, x, y) {
    const size = this.bDef(b).size;
    if (!this.canPlace(x, y, size, b)) return false;
    b.x = x; b.y = y;
    this.dirty = true;
    return true;
  },
  sellWall(b) {
    if (b.type !== 'wall') return;
    const cost = this.bDef(b).levels[b.level - 1].cost;
    this.gain('gold', (cost.gold || 0) * 0.3);
    this.state.buildings = this.state.buildings.filter(x => x !== b);
    this.dirty = true;
  },

  // ---------- 障碍物 ----------
  startClearObstacle(o) {
    const def = OBSTACLES.find(d => d.key === o.key);
    if (o.clearing) return;
    if (!this.canAfford(def.cost)) { UI.toast('资源不足'); SFX.error(); return; }
    if (this.builderFree() <= 0) { UI.toast('没有空闲的建筑工人'); SFX.error(); return; }
    this.pay(def.cost);
    const t = 8 + def.size * 6;
    o.clearing = { remain: t, total: t };
    SFX.build();
  },

  // ---------- 训练 ----------
  canTrain(type) {
    const t = TROOPS[type];
    if (this.maxBarracksLevel() < t.unlockBarracks) return { ok: false, why: `需要 ${t.unlockBarracks} 级兵营` };
    if (this.armyHousing() + t.housing > this.campCapacity()) return { ok: false, why: '军营已满' };
    if (this.state.elixir < t.cost) return { ok: false, why: '圣水不足' };
    return { ok: true };
  },
  train(type) {
    const chk = this.canTrain(type);
    if (!chk.ok) { UI.toast(chk.why); SFX.error(); return false; }
    this.state.elixir -= TROOPS[type].cost;
    this.state.trainQueue.push({ type, remain: TROOPS[type].trainTime, total: TROOPS[type].trainTime });
    this.dirty = true;
    return true;
  },
  cancelTrain(idx) {
    const q = this.state.trainQueue[idx];
    if (!q) return;
    this.gain('elixir', TROOPS[q.type].cost);
    this.state.trainQueue.splice(idx, 1);
    this.dirty = true;
  },
  removeTroop(type) {
    if (this.state.army[type] > 0) {
      this.state.army[type]--;
      if (this.state.army[type] <= 0) delete this.state.army[type];
      this.dirty = true;
    }
  },

  // ---------- 酿造法术 ----------
  canBrew(type) {
    const sp = SPELLS[type];
    const fl = this.factoryLevel();
    if (fl < sp.unlockFactory) return { ok: false, why: `需要 ${sp.unlockFactory} 级法术工厂` };
    if (this.spellCount() >= this.spellCapacity()) return { ok: false, why: '法术容量已满' };
    if (this.state.elixir < sp.cost) return { ok: false, why: '圣水不足' };
    return { ok: true };
  },
  brew(type) {
    const chk = this.canBrew(type);
    if (!chk.ok) { UI.toast(chk.why); SFX.error(); return false; }
    this.state.elixir -= SPELLS[type].cost;
    this.state.brewQueue.push({ type, remain: SPELLS[type].brewTime, total: SPELLS[type].brewTime });
    this.dirty = true;
    return true;
  },

  // ---------- 研究 ----------
  canResearch(type) {
    const def = TROOPS[type] || SPELLS[type];
    const cur = this.troopLevel(type);
    if (this.state.research) return { ok: false, why: '实验室正忙' };
    if (cur >= def.maxLevel) return { ok: false, why: '已达最高等级' };
    const need = researchLabNeed(cur + 1);
    if (this.labLevel() < need) return { ok: false, why: `需要 ${need} 级实验室` };
    const rc = researchCost(type, cur + 1);
    if (this.state.elixir < rc.elixir) return { ok: false, why: '圣水不足' };
    return { ok: true, rc };
  },
  research(type) {
    const chk = this.canResearch(type);
    if (!chk.ok) { UI.toast(chk.why); SFX.error(); return false; }
    this.state.elixir -= chk.rc.elixir;
    this.state.research = { type, toLevel: this.troopLevel(type) + 1, remain: chk.rc.time, total: chk.rc.time };
    this.dirty = true;
    return true;
  },

  // ---------- 收集 ----------
  collect(b) {
    if (b.type !== 'gold_mine' && b.type !== 'elixir_pump') return;
    if (b.stored < 1) return;
    const res = b.type === 'gold_mine' ? 'gold' : 'elixir';
    const amount = Math.floor(b.stored);
    b.stored = 0;
    this.gain(res, amount);
    SFX.coin();
    Render.floatText(b, '+' + fmt(amount), res === 'gold' ? '#ffd800' : '#e879e8');
  },

  // ---------- 每帧经济与计时 ----------
  tickEconomy(dt) {
    const s = this.state;
    // 采集器产出
    for (const b of s.buildings) {
      if ((b.type === 'gold_mine' || b.type === 'elixir_pump') && b.level > 0 && !b.upgrading) {
        const ld = this.bLevelData(b);
        b.stored = Math.min(ld.cap, b.stored + ld.rate / 60 * dt);
      }
    }
    // 建造/升级
    for (const b of s.buildings) {
      if (b.upgrading) {
        b.upgrading.remain -= dt;
        if (b.upgrading.remain <= 0) {
          const def = this.bDef(b);
          b.level = b.upgrading.toLevel;
          const cost = def.levels[b.level - 1].cost;
          this.addXp(Math.sqrt((cost.gold || 0) + (cost.elixir || 0)));
          b.upgrading = null;
          UI.toast(`${def.name} 升到 ${b.level} 级！`);
          SFX.done();
          this.dirty = true;
        }
      }
    }
    // 清障碍
    for (const o of [...s.obstacles]) {
      if (o.clearing) {
        o.clearing.remain -= dt;
        if (o.clearing.remain <= 0) {
          const def = OBSTACLES.find(d => d.key === o.key);
          const gems = def.gems[0] + Math.floor(Math.random() * (def.gems[1] - def.gems[0] + 1));
          if (gems > 0) { this.gain('gems', gems); UI.toast(`获得 💎${gems} 宝石！`); }
          this.addXp(10);
          s.obstacles = s.obstacles.filter(x => x !== o);
          SFX.done();
          this.dirty = true;
        }
      }
    }
    // 训练 (多兵营加速)
    if (s.trainQueue.length > 0) {
      const speed = Math.max(1, this.barracksCount());
      const q = s.trainQueue[0];
      q.remain -= dt * speed;
      if (q.remain <= 0) {
        if (this.armyHousing() - TROOPS[q.type].housing + TROOPS[q.type].housing <= this.campCapacity()) {
          s.army[q.type] = (s.army[q.type] || 0) + 1;
        }
        s.trainQueue.shift();
        this.dirty = true;
      }
    }
    // 酿造
    if (s.brewQueue.length > 0) {
      const q = s.brewQueue[0];
      q.remain -= dt;
      if (q.remain <= 0) {
        s.spells[q.type] = (s.spells[q.type] || 0) + 1;
        s.brewQueue.shift();
        this.dirty = true;
      }
    }
    // 研究
    if (s.research) {
      s.research.remain -= dt;
      if (s.research.remain <= 0) {
        s.troopLevels[s.research.type] = s.research.toLevel;
        const def = TROOPS[s.research.type] || SPELLS[s.research.type];
        UI.toast(`${def.name} 研究完成，升到 ${s.research.toLevel} 级！`);
        this.addXp(30);
        s.research = null;
        SFX.done();
        this.dirty = true;
      }
    }
    // 障碍物定时生长 (每 3 分钟一个, 上限 12)
    if (this.now() - s.lastObstacle > 180 && s.obstacles.length < 12) {
      s.lastObstacle = this.now();
      const def = OBSTACLES[Math.floor(Math.random() * (Math.random() < 0.04 ? 5 : 4))];
      for (let tries = 0; tries < 40; tries++) {
        const x = 1 + Math.floor(Math.random() * (GRID - def.size - 2));
        const y = 1 + Math.floor(Math.random() * (GRID - def.size - 2));
        if (this.canPlace(x, y, def.size, null)) { this.addObstacle(def.key, x, y); break; }
      }
    }
  },
};
