// ============ 战斗引擎 ============
const Battle = {
  active: false,
  enemy: null,
  buildings: [],      // 战斗中的建筑实体
  troops: [],         // 已部署部队
  projectiles: [],
  rings: [],          // 治疗/狂暴光环
  army: {},           // 可部署部队
  spells: {},
  time: 180,
  started: false,     // 首次部署后计时
  ended: false,
  stars: 0,
  percent: 0,
  lootGold: 0,
  lootElixir: 0,
  pathsDirty: false,
  allowGrid: null,    // 可部署区域
  selected: null,     // 当前选择的部署单位/法术 {kind:'troop'|'spell', type}
  result: null,

  // ---------- 开始战斗 ----------
  start(enemy) {
    this.enemy = enemy;
    this.active = true;
    this.ended = false;
    this.started = false;
    this.time = 180;
    this.stars = 0;
    this.thDestroyed = false;
    this.endTimer = 0;
    this.percent = 0;
    this.lootGold = 0;
    this.lootElixir = 0;
    this.troops = [];
    this.projectiles = [];
    this.rings = [];
    this.result = null;
    this.selected = null;
    this.army = Object.assign({}, Game.state.army);
    this.spells = Object.assign({}, Game.state.spells);
    this.usedTroops = {};   // 统计消耗
    this.usedSpells = {};

    // 建筑实体化
    this.buildings = enemy.buildings.map(src => {
      const def = BUILDINGS[src.type];
      const ld = def.levels[Math.min(src.level, def.levels.length) - 1];
      return {
        id: src.id, type: src.type, level: src.level, x: src.x, y: src.y,
        size: def.size, hp: ld.hp, maxHp: ld.hp, destroyed: false,
        def: def.defense ? { ...def.defense, dps: ld.dps } : null,
        cooldown: Math.random() * 0.5, target: null, angle: 0,
        isWall: src.type === 'wall',
        lootGold: 0, lootElixir: 0,
      };
    });

    // 分配战利品到建筑
    const nonWall = this.buildings.filter(b => !b.isWall);
    const holders = { storageG: [], storageE: [], collectG: [], collectE: [] };
    for (const b of nonWall) {
      if (b.type === 'gold_storage' || b.type === 'town_hall') holders.storageG.push(b);
      if (b.type === 'elixir_storage' || b.type === 'town_hall') holders.storageE.push(b);
      if (b.type === 'gold_mine') holders.collectG.push(b);
      if (b.type === 'elixir_pump') holders.collectE.push(b);
    }
    const spread = (list, total, key) => {
      if (!list.length) return 0;
      list.forEach(b => b[key] += Math.round(total / list.length));
      return total;
    };
    let g = enemy.loot.gold, e = enemy.loot.elixir;
    spread(holders.storageG, g * 0.75, 'lootGold');
    spread(holders.collectG, g * 0.25, 'lootGold');
    spread(holders.storageE, e * 0.75, 'lootElixir');
    spread(holders.collectE, e * 0.25, 'lootElixir');

    this.totalCount = nonWall.length;
    this.destroyedCount = 0;
    this.buildAllowGrid();
    this.pathsDirty = true;
  },

  buildAllowGrid() {
    // 红线: 建筑周围 1 格内禁止部署
    const g = new Uint8Array(GRID * GRID).fill(1);
    for (const b of this.buildings) {
      for (let dx = -1; dx <= b.size; dx++) for (let dy = -1; dy <= b.size; dy++) {
        const x = b.x + dx, y = b.y + dy;
        if (x >= 0 && y >= 0 && x < GRID && y < GRID) g[y * GRID + x] = 0;
      }
    }
    this.allowGrid = g;
  },

  // ---------- 部署 ----------
  deploy(type, tx, ty) {
    if (this.ended) return false;
    if (!this.army[type] || this.army[type] <= 0) return false;
    const gx = Math.floor(tx), gy = Math.floor(ty);
    if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) return false;
    if (!this.allowGrid[gy * GRID + gx]) { UI.toast('不能部署在红色区域内'); return false; }
    this.army[type]--;
    this.usedTroops[type] = (this.usedTroops[type] || 0) + 1;
    const def = TROOPS[type];
    const level = Game.troopLevel(type);
    const m = troopLevelMult(level);
    this.troops.push({
      type, level, def,
      x: tx + (Math.random() - 0.5) * 0.6, y: ty + (Math.random() - 0.5) * 0.6,
      hp: def.hp * m, maxHp: def.hp * m,
      dmg: def.dps * def.attackSpeed * m,
      heal: (def.heal || 0) * m,
      cooldown: 0.3, target: null, wallTarget: null, path: null, pathIdx: 0,
      state: 'idle', dead: false, repathTimer: 0,
      anim: Math.random() * 10,
    });
    this.started = true;
    SFX.deploy();
    return true;
  },

  castSpell(type, tx, ty) {
    if (this.ended) return false;
    if (!this.spells[type] || this.spells[type] <= 0) return false;
    this.spells[type]--;
    this.usedSpells[type] = (this.usedSpells[type] || 0) + 1;
    const sp = SPELLS[type];
    const level = Game.troopLevel(type);
    const m = spellLevelMult(level);
    this.started = true;
    if (type === 'lightning') {
      SFX.zap();
      Render.shake(6);
      Render.lightningFx(tx, ty, sp.radius);
      for (const b of this.buildings) {
        if (b.destroyed) continue;
        if (this.distPointToBuilding(tx, ty, b) <= sp.radius) {
          this.damageBuilding(b, sp.damage * m);
        }
      }
    } else if (type === 'heal') {
      SFX.heal();
      this.rings.push({ type: 'heal', x: tx, y: ty, radius: sp.radius, remain: sp.duration, hps: sp.hps * m, tick: 0 });
    } else if (type === 'rage') {
      SFX.spell();
      this.rings.push({ type: 'rage', x: tx, y: ty, radius: sp.radius, remain: sp.duration, boost: sp.boost * Math.pow(1.05, level - 1) });
    }
    return true;
  },

  // ---------- 几何工具 ----------
  distPointToBuilding(px, py, b) {
    const cx = Math.max(b.x, Math.min(px, b.x + b.size));
    const cy = Math.max(b.y, Math.min(py, b.y + b.size));
    return Math.hypot(px - cx, py - cy);
  },

  aliveBuildings() { return this.buildings.filter(b => !b.destroyed); },

  // ---------- 寻路 ----------
  costGrid(targetB) {
    // 每格代价: 空地 1, 城墙 高代价, 其他存活建筑不可通行 (目标建筑本身不可入,但目标是相邻格)
    const g = new Float32Array(GRID * GRID).fill(1);
    for (const b of this.buildings) {
      if (b.destroyed) continue;
      if (b.isWall) {
        g[b.y * GRID + b.x] = 12 + b.hp / 150;
      } else {
        for (let dx = 0; dx < b.size; dx++) for (let dy = 0; dy < b.size; dy++) {
          g[(b.y + dy) * GRID + (b.x + dx)] = Infinity;
        }
      }
    }
    return g;
  },

  // A*: 从 (sx,sy) 到目标建筑周边任一格
  findPath(sx, sy, targetB, costs) {
    const start = Math.max(0, Math.min(GRID - 1, Math.floor(sx))) + Math.max(0, Math.min(GRID - 1, Math.floor(sy))) * GRID;
    // 目标格集合: 建筑周边一圈
    const goals = new Set();
    for (let dx = -1; dx <= targetB.size; dx++) for (let dy = -1; dy <= targetB.size; dy++) {
      if (dx >= 0 && dx < targetB.size && dy >= 0 && dy < targetB.size) continue;
      const x = targetB.x + dx, y = targetB.y + dy;
      if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
      if (costs[y * GRID + x] === Infinity) continue;
      goals.add(y * GRID + x);
    }
    if (goals.size === 0) return null;
    if (goals.has(start)) return [];

    const cx = targetB.x + targetB.size / 2, cy = targetB.y + targetB.size / 2;
    const h = (idx) => {
      const x = idx % GRID, y = (idx / GRID) | 0;
      return Math.hypot(x - cx, y - cy);
    };
    const dist = new Float32Array(GRID * GRID).fill(Infinity);
    const prev = new Int32Array(GRID * GRID).fill(-1);
    dist[start] = 0;
    // 简易二叉堆
    const heap = [[h(start), start]];
    const push = (item) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]]; i = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        while (true) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    const dirs = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.414],[1,-1,1.414],[-1,1,1.414],[-1,-1,1.414]];
    let found = -1, iter = 0;
    while (heap.length && iter++ < 6000) {
      const [f, u] = pop();
      if (goals.has(u)) { found = u; break; }
      if (f - h(u) > dist[u] + 0.001) continue;
      const ux = u % GRID, uy = (u / GRID) | 0;
      for (const [dx, dy, w] of dirs) {
        const nx = ux + dx, ny = uy + dy;
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
        const v = ny * GRID + nx;
        const c = costs[v];
        if (c === Infinity) continue;
        // 斜向不能穿过拐角实体
        if (dx && dy) {
          if (costs[uy * GRID + nx] === Infinity || costs[ny * GRID + ux] === Infinity) continue;
        }
        const nd = dist[u] + c * w;
        if (nd < dist[v] - 0.001) {
          dist[v] = nd; prev[v] = u;
          push([nd + h(v), v]);
        }
      }
    }
    if (found < 0) return null;
    const path = [];
    let cur = found;
    while (cur !== start && cur >= 0) {
      path.push({ x: (cur % GRID) + 0.5, y: ((cur / GRID) | 0) + 0.5 });
      cur = prev[cur];
    }
    path.reverse();
    return path;
  },

  // ---------- 目标选择 ----------
  acquireTarget(t) {
    const alive = this.aliveBuildings().filter(b => !b.isWall);
    if (!alive.length) return null;
    let pool = alive;
    const def = t.def;
    if (def.prefer === 'defense') {
      const d = alive.filter(b => b.def);
      if (d.length) pool = d;
    } else if (def.prefer === 'resource') {
      const r = alive.filter(b => ['gold_mine','elixir_pump','gold_storage','elixir_storage','town_hall'].includes(b.type));
      if (r.length) pool = r;
    } else if (def.prefer === 'wall') {
      // 炸弹人: 找离"被墙保护的建筑"最近的墙
      const walls = this.aliveBuildings().filter(b => b.isWall);
      if (walls.length) {
        let best = null, bd = 1e9;
        for (const w of walls) {
          const d = Math.hypot(t.x - (w.x + 0.5), t.y - (w.y + 0.5));
          if (d < bd) { bd = d; best = w; }
        }
        if (best) return best;
      }
      // 没墙了就打最近的建筑
    }
    let best = null, bd = 1e9;
    for (const b of pool) {
      const d = this.distPointToBuilding(t.x, t.y, b);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  },

  // ---------- 伤害 ----------
  damageBuilding(b, dmg) {
    if (b.destroyed) return;
    b.hp -= dmg;
    if (b.hp <= 0) {
      b.hp = 0;
      b.destroyed = true;
      Render.buildingDestroyedFx(b);
      SFX.boom();
      if (b.isWall) {
        this.pathsDirty = true;
      } else {
        this.destroyedCount++;
        this.lootGold += b.lootGold;
        this.lootElixir += b.lootElixir;
        this.percent = Math.round(this.destroyedCount / this.totalCount * 100);
        const oldStars = this.stars;
        let stars = 0;
        if (this.percent >= 50) stars++;
        if (b.type === 'town_hall') this.thDestroyed = true;
        if (this.thDestroyed) stars++;
        if (this.percent >= 100) stars = 3;
        this.stars = Math.max(this.stars, stars);
        if (this.stars > oldStars) { SFX.win(); Render.shake(4); }
        this.pathsDirty = true;   // 建筑变废墟可通行
      }
    }
  },

  damageTroop(t, dmg) {
    if (t.dead) return;
    t.hp -= dmg;
    if (t.hp <= 0) {
      t.hp = 0;
      t.dead = true;
      Render.troopDeathFx(t);
      // 气球兵坠毁伤害
      if (t.def.deathDamage) {
        const m = troopLevelMult(t.level);
        for (const b of this.aliveBuildings()) {
          if (this.distPointToBuilding(t.x, t.y, b) <= t.def.deathSplash) {
            this.damageBuilding(b, t.def.deathDamage * m);
          }
        }
        Render.explosionFx(t.x, t.y, 1.2);
      }
    }
  },

  // ---------- 主更新 ----------
  update(dt) {
    if (!this.active || this.ended) return;
    if (this.started) {
      this.time -= dt;
      if (this.time <= 0) { this.time = 0; return this.endBattle('时间到'); }
    }
    if (this.percent >= 100) return this.endBattle('全部摧毁');

    // 兵力耗尽检测
    if (this.started) {
      const anyAlive = this.troops.some(t => !t.dead);
      const anyLeft = Object.values(this.army).some(n => n > 0) || Object.values(this.spells).some(n => n > 0);
      const anyRings = this.rings.length > 0;
      if (!anyAlive && !anyLeft && !anyRings) {
        this.endTimer = (this.endTimer || 0) + dt;
        if (this.endTimer > 2) return this.endBattle('兵力耗尽');
      } else this.endTimer = 0;
    }

    if (this.pathsDirty) {
      for (const t of this.troops) if (!t.dead && t.def.move === 'ground') t.path = null;
      this.pathsDirty = false;
    }

    // 光环
    for (const ring of this.rings) {
      ring.remain -= dt;
      if (ring.type === 'heal') {
        ring.tick -= dt;
        if (ring.tick <= 0) {
          ring.tick = 0.5;
          for (const t of this.troops) {
            if (t.dead) continue;
            if (Math.hypot(t.x - ring.x, t.y - ring.y) <= ring.radius) {
              const before = t.hp;
              t.hp = Math.min(t.maxHp, t.hp + ring.hps * 0.5);
              if (t.hp > before) Render.healFx(t.x, t.y);
            }
          }
        }
      }
    }
    this.rings = this.rings.filter(r => r.remain > 0);

    // 部队
    for (const t of this.troops) {
      if (t.dead) continue;
      this.updateTroop(t, dt);
    }
    // 防御
    for (const b of this.buildings) {
      if (b.destroyed || !b.def) continue;
      this.updateDefense(b, dt);
    }
    // 弹道
    this.updateProjectiles(dt);
  },

  rageBoost(t) {
    for (const r of this.rings) {
      if (r.type === 'rage' && Math.hypot(t.x - r.x, t.y - r.y) <= r.radius) return r.boost;
    }
    return 1;
  },

  updateTroop(t, dt) {
    const def = t.def;
    const boost = this.rageBoost(t);
    t.anim += dt;
    if (t.cooldown > 0) t.cooldown -= dt * boost;

    // ---- 天使 ----
    if (def.attacks === 'none') {
      let target = null, bd = 1e9;
      for (const o of this.troops) {
        if (o.dead || o === t || o.def.move !== 'ground') continue;
        const score = (o.hp < o.maxHp ? 0 : 100) + Math.hypot(o.x - t.x, o.y - t.y);
        if (score < bd) { bd = score; target = o; }
      }
      if (!target) return;
      const d = Math.hypot(target.x - t.x, target.y - t.y);
      if (d > def.range * 0.6) {
        this.moveToward(t, target.x, target.y, def.speed * boost * dt);
      }
      if (t.cooldown <= 0 && d < def.range) {
        t.cooldown = def.attackSpeed;
        let healed = false;
        for (const o of this.troops) {
          if (o.dead || o.def.move !== 'ground') continue;
          if (Math.hypot(o.x - target.x, o.y - target.y) <= 2 && o.hp < o.maxHp) {
            o.hp = Math.min(o.maxHp, o.hp + t.heal);
            Render.healFx(o.x, o.y);
            healed = true;
          }
        }
        if (healed) t.state = 'attacking';
      }
      return;
    }

    // ---- 攻城墙优先 ----
    if (t.wallTarget && t.wallTarget.destroyed) t.wallTarget = null;
    let target = t.wallTarget;
    if (!target) {
      if (t.target && t.target.destroyed) t.target = null;
      if (!t.target) {
        t.target = this.acquireTarget(t);
        t.path = null;
      }
      target = t.target;
    }
    if (!target) return;

    const dist = this.distPointToBuilding(t.x, t.y, target);
    const range = Math.max(def.range, 0.4);

    if (dist <= range + 0.15) {
      // 攻击
      t.state = 'attacking';
      t.face = Math.atan2((target.y + target.size / 2) - t.y, (target.x + target.size / 2) - t.x);
      if (t.cooldown <= 0) {
        t.cooldown = def.attackSpeed;
        // 炸弹人自爆
        if (def.suicide) {
          const m = troopLevelMult(t.level);
          for (const b of this.aliveBuildings()) {
            const d = this.distPointToBuilding(t.x, t.y, b);
            if (d <= def.splash) {
              const mult = b.isWall ? def.wallMult : 1;
              this.damageBuilding(b, def.dps * mult * m);
            }
          }
          t.hp = 0; t.dead = true;
          Render.explosionFx(t.x, t.y, 1.4);
          SFX.boom();
          return;
        }
        let dmg = t.dmg * (boost > 1 ? 1.4 : 1);
        if (def.prefer === 'resource' && ['gold_mine','elixir_pump','gold_storage','elixir_storage'].includes(target.type)) {
          dmg *= def.preferMult || 1;
        }
        if (def.range >= 1.5) {
          // 远程投射
          Render.troopShotFx(t, target);
          SFX.arrow();
        } else {
          SFX.hit();
        }
        if (def.splash) {
          for (const b of this.aliveBuildings()) {
            if (this.distPointToBuilding(target.x + target.size / 2, target.y + target.size / 2, b) <= def.splash + target.size / 2) {
              this.damageBuilding(b, dmg);
            }
          }
        } else {
          this.damageBuilding(target, dmg);
        }
        Render.hitFx(target);
      }
      return;
    }

    // ---- 移动 ----
    t.state = 'moving';
    const speed = def.speed * boost * dt;
    if (def.move === 'air') {
      const cx = target.x + target.size / 2, cy = target.y + target.size / 2;
      this.moveToward(t, cx, cy, speed);
      return;
    }
    // 地面: 走 A*
    t.repathTimer -= dt;
    if (!t.path || t.repathTimer <= 0) {
      const costs = this.costGrid(target);
      t.path = this.findPath(t.x, t.y, target, costs);
      t.pathIdx = 0;
      t.repathTimer = 2.5;
      if (t.path) {
        // 检查路径上是否有墙 → 改打墙
        if (!def.prefer || def.prefer !== 'wall') {
          for (const wp of t.path) {
            const cell = this.buildings.find(b => b.isWall && !b.destroyed && b.x === Math.floor(wp.x) && b.y === Math.floor(wp.y));
            if (cell) { t.wallTarget = cell; break; }
          }
        }
      }
    }
    if (t.path && t.pathIdx < t.path.length) {
      const wp = t.path[t.pathIdx];
      const d = Math.hypot(wp.x - t.x, wp.y - t.y);
      if (d < 0.15) t.pathIdx++;
      else {
        // 如果下一格是目标墙则停在墙边攻击
        if (t.wallTarget && Math.floor(wp.x) === t.wallTarget.x && Math.floor(wp.y) === t.wallTarget.y) {
          const wd = this.distPointToBuilding(t.x, t.y, t.wallTarget);
          if (wd <= 0.6) { return; }
        }
        this.moveToward(t, wp.x, wp.y, speed);
      }
    } else if (t.path && t.pathIdx >= t.path.length) {
      // 走完了还没到攻击范围 → 直线逼近
      const cx = target.x + target.size / 2, cy = target.y + target.size / 2;
      this.moveToward(t, cx, cy, speed);
    } else {
      // 无路可走 → 就地打最近的墙
      const walls = this.aliveBuildings().filter(b => b.isWall);
      if (walls.length) {
        let best = null, bd = 1e9;
        for (const w of walls) {
          const d = Math.hypot(t.x - (w.x + 0.5), t.y - (w.y + 0.5));
          if (d < bd) { bd = d; best = w; }
        }
        t.wallTarget = best;
      }
      const cx = target.x + target.size / 2, cy = target.y + target.size / 2;
      this.moveToward(t, cx, cy, speed * 0.5);
    }
  },

  moveToward(t, x, y, step) {
    const dx = x - t.x, dy = y - t.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.001) return;
    const s = Math.min(step, d);
    t.x += dx / d * s;
    t.y += dy / d * s;
    t.face = Math.atan2(dy, dx);
  },

  // ---------- 防御塔 ----------
  updateDefense(b, dt) {
    const def = b.def;
    if (b.cooldown > 0) b.cooldown -= dt;
    // 目标校验
    if (b.target && (b.target.dead ||
        this.distPointToBuilding(b.target.x, b.target.y, b) > def.range ||
        this.distPointToBuilding(b.target.x, b.target.y, b) < def.minRange)) {
      b.target = null;
    }
    if (!b.target) {
      let best = null, bd = 1e9;
      for (const t of this.troops) {
        if (t.dead) continue;
        if (def.targets === 'ground' && t.def.move !== 'ground') continue;
        if (def.targets === 'air' && t.def.move !== 'air') continue;
        const d = this.distPointToBuilding(t.x, t.y, b);
        if (d > def.range || d < def.minRange) continue;
        if (d < bd) { bd = d; best = t; }
      }
      b.target = best;
    }
    if (!b.target) return;
    const cx = b.x + b.size / 2, cy = b.y + b.size / 2;
    b.angle = Math.atan2(b.target.y - cy, b.target.x - cx);
    if (b.cooldown <= 0) {
      b.cooldown = def.attackSpeed;
      const dmg = def.dps * def.attackSpeed;
      if (b.type === 'mortar') {
        // 迫击炮: 落点为开火时目标位置, 会打空
        this.projectiles.push({
          kind: 'mortar', sx: cx, sy: cy, tx: b.target.x, ty: b.target.y,
          t: 0, dur: 1.6, dmg, splash: def.splash,
        });
        SFX.cannon();
      } else if (b.type === 'wizard_tower') {
        this.projectiles.push({ kind: 'magic', sx: cx, sy: cy, troop: b.target, speed: 9, dmg, splash: def.splash });
        SFX.zap();
      } else if (b.type === 'air_defense') {
        this.projectiles.push({ kind: 'rocket', sx: cx, sy: cy, troop: b.target, speed: 14, dmg, splash: 0 });
        SFX.arrow();
      } else if (b.type === 'archer_tower') {
        this.projectiles.push({ kind: 'arrow', sx: cx, sy: cy, troop: b.target, speed: 16, dmg, splash: 0 });
        SFX.arrow();
      } else {
        this.projectiles.push({ kind: 'cannonball', sx: cx, sy: cy, troop: b.target, speed: 13, dmg, splash: 0 });
        SFX.cannon();
        Render.muzzleFx(b);
      }
    }
  },

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (p.kind === 'mortar') {
        p.t += dt / p.dur;
        if (p.t >= 1) {
          p.done = true;
          Render.explosionFx(p.tx, p.ty, 1);
          SFX.boom();
          for (const t of this.troops) {
            if (t.dead || t.def.move === 'air') continue;
            if (Math.hypot(t.x - p.tx, t.y - p.ty) <= p.splash) this.damageTroop(t, p.dmg);
          }
        }
      } else {
        // 追踪弹
        const target = p.troop;
        if (target.dead && !p.lastPos) { p.lastPos = { x: target.x, y: target.y }; }
        const tx = p.lastPos ? p.lastPos.x : target.x;
        const ty = p.lastPos ? p.lastPos.y : target.y;
        const dx = tx - p.sx, dy = ty - p.sy;
        const d = Math.hypot(dx, dy);
        const step = p.speed * dt;
        if (d <= step) {
          p.done = true;
          if (p.splash) {
            Render.explosionFx(tx, ty, 0.7);
            for (const t of this.troops) {
              if (t.dead) continue;
              if (Math.hypot(t.x - tx, t.y - ty) <= p.splash) this.damageTroop(t, p.dmg);
            }
          } else if (!target.dead) {
            this.damageTroop(target, p.dmg);
            Render.hitTroopFx(target);
          }
        } else {
          p.sx += dx / d * step;
          p.sy += dy / d * step;
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.done);
  },

  // ---------- 结束 ----------
  endBattle(reason) {
    if (this.ended) return;
    this.ended = true;
    const win = this.stars > 0;
    // 奖杯
    let trophyDelta;
    if (win) trophyDelta = Math.round(this.enemy.trophies * (0.5 + this.stars * 0.25));
    else trophyDelta = -Math.max(5, Math.round(this.enemy.trophies * 0.6));
    this.result = {
      reason, win, stars: this.stars, percent: this.percent,
      lootGold: this.lootGold, lootElixir: this.lootElixir,
      trophyDelta,
      usedTroops: this.usedTroops, usedSpells: this.usedSpells,
    };
    // 应用结果
    const s = Game.state;
    s.trophies = Math.max(0, s.trophies + trophyDelta);
    Game.gain('gold', this.lootGold);
    Game.gain('elixir', this.lootElixir);
    Game.addXp(10 + this.stars * 25 + this.percent / 4);
    s.battleCount++;
    if (win) s.battleWins++;
    // 已部署部队与法术已消耗 (start 时复制, 现在回写剩余)
    s.army = Object.assign({}, this.army);
    // 清理 0
    for (const k in s.army) if (s.army[k] <= 0) delete s.army[k];
    s.spells = Object.assign({}, this.spells);
    for (const k in s.spells) if (s.spells[k] <= 0) delete s.spells[k];
    Game.save();
    if (win) SFX.win(); else SFX.lose();
    UI.showResult(this.result);
  },

  exit() {
    this.active = false;
    this.enemy = null;
    this.troops = [];
    this.projectiles = [];
    this.rings = [];
  },
};
