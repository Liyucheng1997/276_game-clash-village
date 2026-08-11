// ============ 敌方村庄生成 ============
const EnemyGen = {
  // 生成一个敌方村庄布局 (与玩家大本相近的等级)
  generate(playerTH, playerTrophies) {
    const th = Math.max(1, Math.min(MAX_TH, playerTH + (Math.random() < 0.3 ? 1 : 0) - (Math.random() < 0.3 ? 1 : 0)));
    const lvlBase = Math.max(1, th - 1);
    const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const lvl = (max) => Math.max(1, Math.min(max, lvlBase + rnd(-1, 1)));

    const buildings = [];
    let nextId = 1;
    const occ = new Array(GRID * GRID).fill(false);
    const mark = (x, y, size) => {
      for (let dx = -1; dx <= size; dx++) for (let dy = -1; dy <= size; dy++) {
        const gx = x + dx, gy = y + dy;
        if (gx >= 0 && gy >= 0 && gx < GRID && gy < GRID) occ[gy * GRID + gx] = true;
      }
    };
    const free = (x, y, size) => {
      if (x < 2 || y < 2 || x + size > GRID - 2 || y + size > GRID - 2) return false;
      for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) {
        if (occ[(y + dy) * GRID + (x + dx)]) return false;
      }
      return true;
    };
    const add = (type, level, x, y) => {
      const b = { id: nextId++, type, level, x, y };
      buildings.push(b);
      mark(x, y, BUILDINGS[type].size);
      return b;
    };
    // 在中心附近找位置 (dist = 距中心的最大环)
    const placeNear = (type, level, minR, maxR) => {
      const size = BUILDINGS[type].size;
      const c = GRID / 2 - size / 2;
      for (let tries = 0; tries < 300; tries++) {
        const r = minR + Math.random() * (maxR - minR);
        const a = Math.random() * Math.PI * 2;
        const x = Math.round(c + Math.cos(a) * r);
        const y = Math.round(c + Math.sin(a) * r);
        if (free(x, y, size)) return add(type, level, x, y);
      }
      return null;
    };

    // 1. 大本营居中
    add('town_hall', th, 18, 18);

    // 2. 核心区: 防御 + 存储 (依 TH 数量表)
    const count = (t) => BUILDINGS[t].maxPerTH[th - 1];
    const core = [];
    for (let i = 0; i < count('gold_storage'); i++) core.push(['gold_storage', lvl(8)]);
    for (let i = 0; i < count('elixir_storage'); i++) core.push(['elixir_storage', lvl(8)]);
    for (let i = 0; i < count('mortar'); i++) core.push(['mortar', lvl(8)]);
    for (let i = 0; i < count('wizard_tower'); i++) core.push(['wizard_tower', lvl(6)]);
    for (let i = 0; i < count('air_defense'); i++) core.push(['air_defense', lvl(6)]);
    for (const [t, l] of core) placeNear(t, l, 3, 8);

    // 3. 中圈: 加农炮 / 箭塔
    for (let i = 0; i < count('cannon'); i++) placeNear('cannon', lvl(8), 6, 11);
    for (let i = 0; i < count('archer_tower'); i++) placeNear('archer_tower', lvl(8), 6, 11);

    // 4. 外圈: 资源与军事建筑
    for (let i = 0; i < count('gold_mine'); i++) placeNear('gold_mine', lvl(8), 10, 15);
    for (let i = 0; i < count('elixir_pump'); i++) placeNear('elixir_pump', lvl(8), 10, 15);
    for (let i = 0; i < count('barracks'); i++) placeNear('barracks', lvl(10), 11, 15);
    for (let i = 0; i < count('army_camp'); i++) placeNear('army_camp', lvl(8), 11, 15);
    if (count('laboratory')) placeNear('laboratory', lvl(6), 11, 15);
    if (count('spell_factory')) placeNear('spell_factory', lvl(4), 11, 15);
    placeNear('builder_hut', 1, 13, 16);
    placeNear('builder_hut', 1, 13, 16);

    // 5. 城墙: 找出核心建筑的包围盒并沿周界砌墙
    let wallCount = BUILDINGS.wall.maxPerTH[th - 1];
    if (wallCount > 0) {
      const coreTypes = ['town_hall','gold_storage','elixir_storage','mortar','wizard_tower','air_defense'];
      let minX = 99, minY = 99, maxX = -1, maxY = -1;
      for (const b of buildings) {
        if (!coreTypes.includes(b.type)) continue;
        const size = BUILDINGS[b.type].size;
        minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + size); maxY = Math.max(maxY, b.y + size);
      }
      minX--; minY--; maxX++; maxY++;
      const wallLvl = Math.max(1, Math.min(8, lvlBase));
      const cells = [];
      for (let x = minX; x < maxX; x++) { cells.push([x, minY - 1]); cells.push([x, maxY]); }
      for (let y = minY - 1; y <= maxY; y++) { cells.push([minX - 1, y]); cells.push([maxX, y]); }
      // 打乱起点让缺口随机
      const skipGap = Math.random() < 0.35 ? rnd(0, cells.length - 1) : -1;
      for (let i = 0; i < cells.length && wallCount > 0; i++) {
        if (skipGap >= 0 && Math.abs(i - skipGap) < 2) continue;
        const [x, y] = cells[i];
        if (x < 1 || y < 1 || x >= GRID - 1 || y >= GRID - 1) continue;
        if (occ[y * GRID + x]) continue;
        buildings.push({ id: nextId++, type: 'wall', level: wallLvl, x, y });
        occ[y * GRID + x] = true;
        wallCount--;
      }
      // 剩余的墙做十字分隔
      if (wallCount > 8) {
        const midY = Math.floor((minY + maxY) / 2);
        for (let x = minX; x < maxX && wallCount > 0; x++) {
          if (occ[midY * GRID + x]) continue;
          buildings.push({ id: nextId++, type: 'wall', level: wallLvl, x, y: midY });
          occ[midY * GRID + x] = true;
          wallCount--;
        }
      }
    }

    // 6. 装饰障碍
    const obstacles = [];
    const obDefs = OBSTACLES.slice(0, 4);
    for (let i = 0; i < 5; i++) {
      const d = obDefs[rnd(0, 3)];
      for (let tries = 0; tries < 30; tries++) {
        const x = rnd(2, GRID - 4), y = rnd(2, GRID - 4);
        if (free(x, y, d.size)) { obstacles.push({ key: d.key, x, y, size: d.size }); mark(x, y, d.size); break; }
      }
    }

    // 7. 战利品
    const lootScale = 1 + playerTrophies / 400;
    const baseLoot = 400 * th * th * lootScale;
    const gold = Math.round(baseLoot * (0.6 + Math.random() * 0.9));
    const elixir = Math.round(baseLoot * (0.6 + Math.random() * 0.9));
    const trophies = Math.max(5, Math.round(15 + (Math.random() - 0.3) * 14 + (th - playerTH) * 6));

    const names = ['骷髅海盗团','雷霆部落','黑石军团','迷雾村庄','野猪骑士团','龙息谷','钻石矿工','孤狼部落','暗夜守望','咸鱼突击队','蘑菇王国','铁壁要塞'];
    return {
      name: names[rnd(0, names.length - 1)] + ' #' + rnd(100, 999),
      th, buildings, obstacles,
      loot: { gold, elixir },
      trophies,
    };
  },
};
