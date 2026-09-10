// ============ 等距渲染器 ============
const TILE_W = 52, TILE_H = 26;
const HW = TILE_W / 2, HH = TILE_H / 2;

const Render = {
  canvas: null, ctx: null,
  cam: { x: 0, y: 0, scale: 1 },
  shakeAmt: 0,
  particles: [],
  floaters: [],
  bolts: [],       // 闪电特效
  tracers: [],     // 部队远程弹道
  placement: null, // {type, x, y, valid} 放置模式
  selectedBuilding: null,
  redPath: null,   // 战斗禁区

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    // 居中
    const c = this.iso(GRID / 2, GRID / 2);
    this.cam.scale = Math.min(1.2, Math.max(0.6, window.innerWidth / 1400));
    this.cam.x = canvas.width / 2 - c.x * this.cam.scale;
    this.cam.y = canvas.height / 2 - c.y * this.cam.scale;
  },
  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  iso(gx, gy) { return { x: (gx - gy) * HW, y: (gx + gy) * HH }; },
  screenToGrid(sx, sy) {
    const wx = (sx - this.cam.x) / this.cam.scale;
    const wy = (sy - this.cam.y) / this.cam.scale;
    return { gx: (wx / HW + wy / HH) / 2, gy: (wy / HH - wx / HW) / 2 };
  },

  shake(n) { this.shakeAmt = Math.max(this.shakeAmt, n); },

  // ---------- 颜色工具 ----------
  shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r * f)));
    g = Math.max(0, Math.min(255, Math.round(g * f)));
    b = Math.max(0, Math.min(255, Math.round(b * f)));
    return `rgb(${r},${g},${b})`;
  },

  // ---------- 基础形状 (世界坐标) ----------
  diamond(ctx, gx, gy, w, h, elev) {
    const p1 = this.iso(gx, gy), p2 = this.iso(gx + w, gy), p3 = this.iso(gx + w, gy + h), p4 = this.iso(gx, gy + h);
    const e = elev || 0;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y - e);
    ctx.lineTo(p2.x, p2.y - e);
    ctx.lineTo(p3.x, p3.y - e);
    ctx.lineTo(p4.x, p4.y - e);
    ctx.closePath();
  },
  // 立体棱柱: 顶面 + 左右侧面
  prism(ctx, gx, gy, w, h, height, color) {
    const p2 = this.iso(gx + w, gy), p3 = this.iso(gx + w, gy + h), p4 = this.iso(gx, gy + h);
    // 左面 (朝西南)
    ctx.fillStyle = this.shade(color, 0.72);
    ctx.beginPath();
    ctx.moveTo(p4.x, p4.y - height); ctx.lineTo(p3.x, p3.y - height);
    ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
    ctx.closePath(); ctx.fill();
    // 右面 (朝东南)
    ctx.fillStyle = this.shade(color, 0.55);
    ctx.beginPath();
    ctx.moveTo(p3.x, p3.y - height); ctx.lineTo(p2.x, p2.y - height);
    ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
    ctx.closePath(); ctx.fill();
    // 顶面
    ctx.fillStyle = color;
    this.diamond(ctx, gx, gy, w, h, height);
    ctx.fill();
  },
  ellipseAt(ctx, gx, gy, rx, ry, elev, color) {
    const p = this.iso(gx, gy);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - (elev || 0), rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  },

  // ---------- 主绘制 ----------
  draw(dt) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // 天空/背景
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#496c32');
    bg.addColorStop(1, '#496c32');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    let shx = 0, shy = 0;
    if (this.shakeAmt > 0.2) {
      shx = (Math.random() - 0.5) * this.shakeAmt * 2;
      shy = (Math.random() - 0.5) * this.shakeAmt * 2;
      this.shakeAmt *= Math.pow(0.02, dt);
    } else this.shakeAmt = 0;

    ctx.setTransform(this.cam.scale, 0, 0, this.cam.scale, this.cam.x + shx, this.cam.y + shy);

    this.drawGround(ctx);

    // 收集要排序绘制的实体
    const items = [];
    const buildings = Battle.active ? Battle.buildings : (this.previewEnemy ? this.previewEnemy.buildings : Game.state.buildings);
    for (const b of buildings) {
      const size = b.size || BUILDINGS[b.type].size;
      items.push({ key: b.x + b.y + size, kind: 'b', ref: b });
    }
    if (!Battle.active) {
      for (const o of (this.previewEnemy ? this.previewEnemy.obstacles : Game.state.obstacles)) items.push({ key: o.x + o.y + o.size, kind: 'o', ref: o });
    } else if (Battle.enemy) {
      for (const o of Battle.enemy.obstacles) items.push({ key: o.x + o.y + o.size, kind: 'o', ref: o });
      for (const t of Battle.troops) if (!t.dead) items.push({ key: t.x + t.y + 0.6, kind: 't', ref: t });
    }
    items.sort((a, b) => a.key - b.key);

    const now = performance.now() / 1000;
    for (const it of items) {
      if (it.kind === 'b') this.drawBuilding(ctx, it.ref, now);
      else if (it.kind === 'o') this.drawObstacle(ctx, it.ref, now);
      else this.drawTroop(ctx, it.ref, now);
    }

    if (Battle.active) {
      this.drawRings(ctx, now);
      this.drawProjectiles(ctx);
      this.drawRedZone(ctx);
    } else {
      this.drawPlacement(ctx, now);
    }
    this.drawBolts(ctx, dt);
    this.drawTracers(ctx, dt);
    this.drawParticles(ctx, dt);
    this.drawFloaters(ctx, dt);
  },

  drawGround(ctx) {
    // 大草地
    this.diamond(ctx, -1, -1, GRID + 2, GRID + 2, 0);
    ctx.fillStyle = '#2f6b33';
    ctx.fill();
    // 边缘厚度
    const p3 = this.iso(GRID + 1, GRID + 1), p2 = this.iso(GRID + 1, -1), p4 = this.iso(-1, GRID + 1);
    ctx.fillStyle = '#4a3b28';
    ctx.beginPath();
    ctx.moveTo(p4.x, p4.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p3.x, p3.y + 14); ctx.lineTo(p4.x, p4.y + 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3c2f1f';
    ctx.beginPath();
    ctx.moveTo(p3.x, p3.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p2.x, p2.y + 14); ctx.lineTo(p3.x, p3.y + 14); ctx.closePath(); ctx.fill();
    // 棋盘微纹理
    ctx.globalAlpha = 0.05;
    for (let x = 0; x < GRID; x++) for (let y = 0; y < GRID; y++) {
      if ((x + y) % 2 === 0) continue;
      this.diamond(ctx, x, y, 1, 1, 0);
      ctx.fillStyle = '#000';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  // ---------- 建筑 ----------
  drawBuilding(ctx, b, now) {
    const type = b.type;
    const size = b.size || BUILDINGS[type].size;
    const destroyed = b.destroyed;
    const underCons = !Battle.active && b.upgrading;

    // 地基
    if (type !== 'wall') {
      this.diamond(ctx, b.x - 0.15, b.y - 0.15, size + 0.3, size + 0.3, 0);
      ctx.fillStyle = destroyed ? 'rgba(60,50,40,.5)' : 'rgba(0,0,0,.13)';
      ctx.fill();
    }
    // 选中高亮
    if (!Battle.active && this.selectedBuilding === b) {
      this.diamond(ctx, b.x - 0.2, b.y - 0.2, size + 0.4, size + 0.4, 0);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    if (destroyed) { this.drawRubble(ctx, b, size); return; }

    if (underCons && b.level === 0) {
      // 建造中: 工地
      this.prism(ctx, b.x + 0.3, b.y + 0.3, size - 0.6, size - 0.6, 10, '#8a6f4d');
      this.emoji(ctx, b.x + size / 2, b.y + size / 2, 26, '🚧', 16);
    } else {
      const fn = this['b_' + type];
      if (fn) fn.call(this, ctx, b, size, now);
      else this.prism(ctx, b.x + 0.2, b.y + 0.2, size - 0.4, size - 0.4, 20, '#888');
    }

    // 升级进度条
    if (underCons) {
      const pr = 1 - b.upgrading.remain / b.upgrading.total;
      this.worldBar(ctx, b.x + size / 2, b.y + size / 2, 44, pr, '#8be06a');
      this.emoji(ctx, b.x + size / 2 - 0.6, b.y + size / 2 - 0.6, 40, '🔨', 13);
    }
    // 战斗血条
    if (Battle.active && b.hp < b.maxHp && !b.isWall) {
      this.worldBar(ctx, b.x + size / 2, b.y + size / 2, 48, b.hp / b.maxHp, '#6ee06a');
    }
    // 采集器待收集提示
    if (!Battle.active && (type === 'gold_mine' || type === 'elixir_pump') && b.level > 0) {
      const ld = Game.bLevelData(b);
      if (b.stored >= Math.min(ld.cap * 0.15, 50)) {
        const bob = Math.sin(now * 3) * 3;
        this.emoji(ctx, b.x + size / 2, b.y + size / 2, 52 + bob, type === 'gold_mine' ? '🪙' : '💧', 15);
      }
    }
  },

  emoji(ctx, gx, gy, elev, ch, sizePx) {
    const p = this.iso(gx, gy);
    ctx.font = `${sizePx || 14}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, p.x, p.y - elev);
  },
  worldBar(ctx, gx, gy, elev, ratio, color) {
    const p = this.iso(gx, gy);
    const w = 34, h = 5;
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillRect(p.x - w / 2 - 1, p.y - elev - 1, w + 2, h + 2);
    ctx.fillStyle = color;
    ctx.fillRect(p.x - w / 2, p.y - elev, w * Math.max(0, Math.min(1, ratio)), h);
  },

  tier(level) { return level >= 6 ? '#e8c35a' : level >= 4 ? '#9aa7b5' : '#a5814f'; },

  b_town_hall(ctx, b, s, now) {
    const accent = this.tier(b.level);
    this.prism(ctx, b.x + 0.3, b.y + 0.3, s - 0.6, s - 0.6, 26, '#b59a72');
    this.prism(ctx, b.x + 0.9, b.y + 0.9, s - 1.8, s - 1.8, 44, '#c9ad80');
    // 红屋顶
    this.prism(ctx, b.x + 0.7, b.y + 0.7, s - 1.4, s - 1.4, 50, b.level >= 6 ? '#d4a017' : '#b03a2e');
    // 等级饰条
    ctx.fillStyle = accent;
    this.diamond(ctx, b.x + 1.2, b.y + 1.2, s - 2.4, s - 2.4, 52);
    ctx.fill();
    // 旗帜
    const fp = this.iso(b.x + s / 2, b.y + s / 2);
    ctx.strokeStyle = '#5c4a30';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(fp.x, fp.y - 52); ctx.lineTo(fp.x, fp.y - 72); ctx.stroke();
    ctx.fillStyle = '#e03a2a';
    ctx.beginPath();
    ctx.moveTo(fp.x, fp.y - 72); ctx.lineTo(fp.x + 12, fp.y - 68); ctx.lineTo(fp.x, fp.y - 64);
    ctx.closePath(); ctx.fill();
  },
  b_gold_mine(ctx, b, s) {
    this.prism(ctx, b.x + 0.3, b.y + 0.3, s - 0.6, s - 0.6, 8, '#7d6748');
    this.ellipseAt(ctx, b.x + s / 2, b.y + s / 2, 13, 7, 10, '#3a2e1e');
    const fill = b.stored !== undefined && b.level > 0 ? Math.min(1, b.stored / Game.bLevelData(b).cap) : 0.4;
    if (fill > 0.05) this.ellipseAt(ctx, b.x + s / 2, b.y + s / 2, 10 * fill + 2, 5 * fill + 1, 11 + fill * 5, '#f5c542');
    this.emoji(ctx, b.x + s - 0.7, b.y + 0.7, 16, '⛏️', 12);
  },
  b_elixir_pump(ctx, b, s, now) {
    this.prism(ctx, b.x + 0.5, b.y + 0.5, s - 1, s - 1, 12, '#6e5a41');
    const p = this.iso(b.x + s / 2, b.y + s / 2);
    ctx.fillStyle = '#c94fc9';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 22, 11, 12 + Math.sin(now * 2) * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath();
    ctx.ellipse(p.x - 3, p.y - 26, 3.5, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  b_gold_storage(ctx, b, s) {
    this.prism(ctx, b.x + 0.3, b.y + 0.3, s - 0.6, s - 0.6, 16, '#8f7550');
    const ratio = Battle.active ? 0.7 : Math.min(1, Game.state.gold / Math.max(1, Game.storageCap('gold')));
    this.ellipseAt(ctx, b.x + s / 2, b.y + s / 2, 12, 6.5, 18, '#5c4a30');
    if (ratio > 0.03) this.ellipseAt(ctx, b.x + s / 2, b.y + s / 2, 11 * ratio + 1, 5.5 * ratio + 0.5, 19 + ratio * 8, '#ffd23e');
  },
  b_elixir_storage(ctx, b, s) {
    this.prism(ctx, b.x + 0.6, b.y + 0.6, s - 1.2, s - 1.2, 10, '#6e5a41');
    const p = this.iso(b.x + s / 2, b.y + s / 2);
    const ratio = Battle.active ? 0.7 : Math.min(1, Game.state.elixir / Math.max(1, Game.storageCap('elixir')));
    // 大瓶
    ctx.fillStyle = 'rgba(180,200,220,.45)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 26, 13, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c94fc9';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 26 + (1 - ratio) * 8, 11.5, 15 * ratio + 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a6f4d';
    ctx.fillRect(p.x - 4, p.y - 48, 8, 7);
  },
  b_barracks(ctx, b, s) {
    // 帐篷 (四棱锥: 先画背面两坡, 再画正面两坡)
    const p1 = this.iso(b.x + 0.3, b.y + 0.3), p2 = this.iso(b.x + s - 0.3, b.y + 0.3);
    const p3 = this.iso(b.x + s - 0.3, b.y + s - 0.3), p4 = this.iso(b.x + 0.3, b.y + s - 0.3);
    const top = this.iso(b.x + s / 2, b.y + s / 2);
    const apexY = top.y - 34;
    const face = (a, bb, color) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(top.x, apexY); ctx.lineTo(bb.x, bb.y); ctx.closePath(); ctx.fill();
    };
    face(p1, p2, '#d15b42');   // 背左
    face(p1, p4, '#c2503a');   // 背右
    face(p4, p3, '#b3442e');   // 前左
    face(p3, p2, '#8f2f1e');   // 前右
    // 门帘
    ctx.fillStyle = '#d8d0c0';
    ctx.beginPath();
    ctx.moveTo(p3.x, p3.y); ctx.lineTo(top.x, (apexY + top.y) / 2); ctx.lineTo(top.x, top.y); ctx.closePath(); ctx.fill();
    this.emoji(ctx, b.x + s / 2, b.y + s / 2, 46, '⚔️', 12);
  },
  b_army_camp(ctx, b, s, now) {
    this.diamond(ctx, b.x + 0.2, b.y + 0.2, s - 0.4, s - 0.4, 0);
    ctx.fillStyle = '#6d8f3e';
    ctx.fill();
    // 篝火
    const p = this.iso(b.x + s / 2, b.y + s / 2);
    ctx.fillStyle = '#5c4a30';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    const f = 1 + Math.sin(now * 8) * 0.2;
    ctx.fillStyle = '#ff8c1a';
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 5 * f, 4, 6 * f, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 4 * f, 2, 3.5 * f, 0, 0, Math.PI * 2); ctx.fill();
    // 小帐篷
    this.emoji(ctx, b.x + 0.8, b.y + s - 0.8, 12, '⛺', 14);
    this.emoji(ctx, b.x + s - 0.8, b.y + 0.8, 12, '⛺', 14);
  },
  b_laboratory(ctx, b, s, now) {
    this.prism(ctx, b.x + 0.4, b.y + 0.4, s - 0.8, s - 0.8, 18, '#7a8fa0');
    const p = this.iso(b.x + s / 2, b.y + s / 2);
    ctx.fillStyle = '#4b6b80';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 24, 12, 10, 0, Math.PI, 0);
    ctx.fill();
    const bub = (now * 20) % 14;
    ctx.fillStyle = 'rgba(120,230,120,.8)';
    ctx.beginPath(); ctx.arc(p.x + 4, p.y - 24 - bub, 2, 0, Math.PI * 2); ctx.fill();
    this.emoji(ctx, b.x + s / 2, b.y + s / 2, 34, '🧪', 11);
  },
  b_spell_factory(ctx, b, s, now) {
    this.prism(ctx, b.x + 0.4, b.y + 0.4, s - 0.8, s - 0.8, 22, '#6b5a8e');
    const p = this.iso(b.x + s / 2, b.y + s / 2);
    const a = now * 2;
    ctx.strokeStyle = '#b98ef0';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 32, 8, a, a + 4.5);
    ctx.stroke();
    this.emoji(ctx, b.x + s / 2, b.y + s / 2, 32, '🌀', 12);
  },
  b_cannon(ctx, b, s, now) {
    // 木质圆台底座
    this.ellipseAt(ctx, b.x + s / 2, b.y + s / 2, 20, 11, 0, '#6e5a41');
    this.ellipseAt(ctx, b.x + s / 2, b.y + s / 2, 17, 9, 5, '#8a6f4d');
    this.ellipseAt(ctx, b.x + s / 2, b.y + s / 2, 12, 6.5, 9, '#5a5a5a');
    const p = this.iso(b.x + s / 2, b.y + s / 2);
    const ang = Battle.active && b.angle !== undefined ? b.angle : -0.6;
    // 等距方向: 世界角度转屏幕
    const dx = Math.cos(ang) * HW - Math.sin(ang) * -HW;
    const dy = Math.cos(ang) * HH + Math.sin(ang) * HH;
    const len = Math.hypot(dx, dy) || 1;
    ctx.strokeStyle = '#2e2e2e';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 15);
    ctx.lineTo(p.x + dx / len * 20, p.y - 15 + dy / len * 10);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = this.tier(b.level);
    ctx.beginPath(); ctx.arc(p.x, p.y - 15, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath(); ctx.arc(p.x, p.y - 15, 3, 0, Math.PI * 2); ctx.fill();
  },
  b_archer_tower(ctx, b, s, now) {
    this.prism(ctx, b.x + 0.8, b.y + 0.8, s - 1.6, s - 1.6, 40, this.tier(b.level) === '#a5814f' ? '#8a6f4d' : '#9aa7b5');
    // 顶部平台 (薄板)
    ctx.fillStyle = '#5c4a30';
    this.diamond(ctx, b.x + 0.5, b.y + 0.5, s - 1, s - 1, 40);
    ctx.fill();
    ctx.fillStyle = '#6e5a41';
    this.diamond(ctx, b.x + 0.5, b.y + 0.5, s - 1, s - 1, 43);
    ctx.fill();
    const p = this.iso(b.x + s / 2, b.y + s / 2);
    // 塔顶弓箭手
    ctx.fillStyle = '#3f8f5e';
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 52, 3, 3.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8b48a';
    ctx.beginPath(); ctx.arc(p.x, p.y - 57, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e055c8';
    ctx.beginPath(); ctx.arc(p.x, p.y - 58, 2, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#8a6f4d';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(p.x + 3.5, p.y - 55, 3, -1.2, 1.2); ctx.stroke();
  },
  b_mortar(ctx, b, s) {
    // 沙包环
    this.ellipseAt(ctx, b.x + s / 2, b.y + s / 2, 15, 8, 2, '#8f7550');
    this.ellipseAt(ctx, b.x + s / 2, b.y + s / 2, 11, 6, 4, '#4f4438');
    const p = this.iso(b.x + s / 2, b.y + s / 2);
    ctx.fillStyle = '#3b3b3b';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 10, 6.5, 5, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.ellipse(p.x + 2, p.y - 14, 3.5, 2.5, -0.4, 0, Math.PI * 2);
    ctx.fill();
  },
  b_wizard_tower(ctx, b, s, now) {
    this.prism(ctx, b.x + 0.8, b.y + 0.8, s - 1.6, s - 1.6, 34, '#7d6b9e');
    this.prism(ctx, b.x + 1.1, b.y + 1.1, s - 2.2, s - 2.2, 48, '#8f7bb5');
    const p = this.iso(b.x + s / 2, b.y + s / 2);
    const glow = 0.6 + Math.sin(now * 4) * 0.3;
    ctx.fillStyle = `rgba(120,220,255,${glow})`;
    ctx.beginPath(); ctx.arc(p.x, p.y - 56, 5, 0, Math.PI * 2); ctx.fill();
  },
  b_air_defense(ctx, b, s) {
    this.ellipseAt(ctx, b.x + s / 2, b.y + s / 2, 13, 7, 2, '#5a5a5a');
    const p = this.iso(b.x + s / 2, b.y + s / 2);
    ctx.fillStyle = '#b03a2e';
    ctx.beginPath();
    ctx.moveTo(p.x - 8, p.y - 6);
    ctx.lineTo(p.x, p.y - 34);
    ctx.lineTo(p.x + 8, p.y - 6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d8d0c0';
    ctx.beginPath();
    ctx.moveTo(p.x - 4, p.y - 16); ctx.lineTo(p.x, p.y - 30); ctx.lineTo(p.x + 4, p.y - 16);
    ctx.closePath(); ctx.fill();
  },
  b_wall(ctx, b, s) {
    const lv = b.level;
    const color = lv >= 8 ? '#7ec8e3' : lv >= 6 ? '#e8c35a' : lv >= 4 ? '#9aa7b5' : lv >= 2 ? '#8b8b8b' : '#a5814f';
    this.prism(ctx, b.x + 0.08, b.y + 0.08, 0.84, 0.84, 14 + lv, color);
  },
  b_builder_hut(ctx, b, s, now) {
    this.prism(ctx, b.x + 0.2, b.y + 0.2, s - 0.4, s - 0.4, 12, '#a5814f');
    this.prism(ctx, b.x + 0.1, b.y + 0.1, s - 0.2, s - 0.2, 18, '#b3442e');
    // 有工人干活时冒烟
    if (!Battle.active && Game.builderBusy() > 0 && Math.random() < 0.05) {
      const p = this.iso(b.x + s / 2, b.y + s / 2);
      this.particles.push({ x: p.x, y: p.y - 22, vx: (Math.random() - 0.5) * 4, vy: -14, life: 1.4, size: 3, color: 'rgba(200,200,200,.5)' });
    }
  },

  drawRubble(ctx, b, size) {
    this.ellipseAt(ctx, b.x + size / 2, b.y + size / 2, size * 6, size * 3, 0, '#5a5248');
    this.ellipseAt(ctx, b.x + size / 2 - 0.3, b.y + size / 2, size * 3.4, size * 1.8, 3, '#6e6458');
    this.ellipseAt(ctx, b.x + size / 2 + 0.4, b.y + size / 2 + 0.3, size * 2, size * 1.2, 5, '#7d7264');
  },

  drawObstacle(ctx, o, now) {
    const cx = o.x + o.size / 2, cy = o.y + o.size / 2;
    const map = { tree1: ['🌳', 30], tree2: ['🌲', 30], bush: ['🌿', 18], rock: ['🪨', 24], gembox: ['🎁', 24] };
    const [ch, sizePx] = map[o.key] || ['🌳', 26];
    this.ellipseAt(ctx, cx, cy + 0.1, o.size * 8, o.size * 4, 0, 'rgba(0,0,0,.15)');
    this.emoji(ctx, cx, cy, sizePx * 0.5, ch, sizePx);
    if (o.clearing) {
      this.worldBar(ctx, cx, cy, sizePx + 14, 1 - o.clearing.remain / o.clearing.total, '#8be06a');
      this.emoji(ctx, cx - 0.4, cy - 0.4, sizePx + 8, '🔨', 12);
    }
  },

  // ---------- 部队 ----------
  drawTroop(ctx, t, now) {
    const p = this.iso(t.x, t.y);
    const air = t.def.move === 'air';
    const bob = air ? Math.sin(t.anim * 2) * 3 : 0;
    const elev = air ? 38 + bob : 0;
    const walk = t.state === 'moving' ? Math.abs(Math.sin(t.anim * 8)) * 2 : 0;
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, air ? 6 : 5.5, air ? 3 : 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    const y = p.y - elev - walk;
    const fn = this['t_' + t.type];
    if (fn) fn.call(this, ctx, t, p.x, y, now);
    else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, y - 6, 5, 0, Math.PI * 2); ctx.fill(); }
    // 血条
    if (t.hp < t.maxHp) {
      const w = 16;
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(p.x - w / 2 - 1, y - 26, w + 2, 4);
      ctx.fillStyle = t.hp / t.maxHp > 0.4 ? '#6ee06a' : '#e05a4a';
      ctx.fillRect(p.x - w / 2, y - 25, w * (t.hp / t.maxHp), 2);
    }
  },
  // 小人绘制辅助: 身体+头
  body(ctx, x, y, bodyColor, headColor, w) {
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(x, y - 5, w, w * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = headColor;
    ctx.beginPath();
    ctx.arc(x, y - 5 - w * 1.35, w * 0.72, 0, Math.PI * 2);
    ctx.fill();
  },
  t_barbarian(ctx, t, x, y) {
    this.body(ctx, x, y, '#c96', '#e8b48a', 4);
    ctx.fillStyle = '#f0d040';   // 金发
    ctx.beginPath(); ctx.arc(x, y - 12.5, 3.2, Math.PI, 0); ctx.fill();
    const sw = t.state === 'attacking' ? Math.sin(t.anim * 14) * 4 : 0;
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(x + 3, y - 7); ctx.lineTo(x + 7 + sw, y - 13 - sw); ctx.stroke();
  },
  t_archer(ctx, t, x, y) {
    this.body(ctx, x, y, '#3f8f5e', '#e8b48a', 3.4);
    ctx.fillStyle = '#e055c8';
    ctx.beginPath(); ctx.arc(x, y - 10.5, 2.8, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#8a6f4d';
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(x + 4, y - 8, 3.5, -1.2, 1.2); ctx.stroke();
  },
  t_goblin(ctx, t, x, y) {
    this.body(ctx, x, y, '#7a5230', '#59b34a', 3.2);
    ctx.fillStyle = '#59b34a';   // 大耳朵
    ctx.beginPath(); ctx.moveTo(x - 3, y - 10); ctx.lineTo(x - 7, y - 13); ctx.lineTo(x - 3, y - 12); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 3, y - 10); ctx.lineTo(x + 7, y - 13); ctx.lineTo(x + 3, y - 12); ctx.fill();
    ctx.fillStyle = '#8b6b3e';
    ctx.fillRect(x + 3, y - 6, 4, 4);
  },
  t_giant(ctx, t, x, y) {
    this.body(ctx, x, y, '#b58a5a', '#d9a877', 6.5);
    ctx.fillStyle = '#8b6b3e';
    ctx.fillRect(x - 7, y - 4, 14, 3);
    const sw = t.state === 'attacking' ? Math.sin(t.anim * 8) * 3 : 0;
    ctx.fillStyle = '#d9a877';
    ctx.beginPath(); ctx.arc(x - 7, y - 8 + sw, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 7, y - 8 - sw, 2.6, 0, Math.PI * 2); ctx.fill();
  },
  t_wall_breaker(ctx, t, x, y) {
    this.body(ctx, x, y, '#ddd', '#eee', 3);
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(x + 4, y - 12, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e07820';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 5, y - 15); ctx.lineTo(x + 7, y - 18); ctx.stroke();
  },
  t_balloon(ctx, t, x, y, now) {
    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.ellipse(x, y - 14, 8, 9.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8f2f1e';
    ctx.beginPath(); ctx.ellipse(x - 2.5, y - 15, 3, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5c4a30';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 4, y - 6); ctx.lineTo(x - 3, y - 1); ctx.moveTo(x + 4, y - 6); ctx.lineTo(x + 3, y - 1); ctx.stroke();
    ctx.fillStyle = '#8a6f4d';
    ctx.fillRect(x - 4, y - 2, 8, 5);
  },
  t_wizard(ctx, t, x, y, now) {
    this.body(ctx, x, y, '#6b3fa0', '#e8b48a', 4);
    ctx.fillStyle = '#6b3fa0';
    ctx.beginPath(); ctx.moveTo(x - 4, y - 12); ctx.lineTo(x, y - 19); ctx.lineTo(x + 4, y - 12); ctx.closePath(); ctx.fill();
    const g = 0.5 + Math.sin(now * 6) * 0.3;
    ctx.fillStyle = `rgba(255,140,40,${g})`;
    ctx.beginPath(); ctx.arc(x + 6, y - 8, 2.5, 0, Math.PI * 2); ctx.fill();
  },
  t_healer(ctx, t, x, y, now) {
    const flap = Math.sin(t.anim * 6) * 3;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath(); ctx.ellipse(x - 7, y - 10, 5, 2.5 + flap, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 7, y - 10, 5, 2.5 + flap, 0.5, 0, Math.PI * 2); ctx.fill();
    this.body(ctx, x, y, '#e8d9f5', '#f0c9a0', 3.6);
    ctx.strokeStyle = '#ffd800';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(x, y - 14.5, 3, 1.2, 0, 0, Math.PI * 2); ctx.stroke();
  },
  t_dragon(ctx, t, x, y, now) {
    const flap = Math.sin(t.anim * 5) * 4;
    ctx.fillStyle = '#3f7a2e';
    ctx.beginPath(); ctx.ellipse(x - 10, y - 10, 7, 3.5 + flap, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 10, y - 10, 7, 3.5 + flap, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#59b34a';
    ctx.beginPath(); ctx.ellipse(x, y - 8, 8, 6.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#59b34a';
    ctx.beginPath(); ctx.arc(x + 7, y - 13, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath(); ctx.arc(x + 8.5, y - 13.5, 1.2, 0, Math.PI * 2); ctx.fill();
    if (t.state === 'attacking') {
      ctx.fillStyle = 'rgba(255,120,30,.8)';
      ctx.beginPath(); ctx.arc(x + 13, y - 12, 3 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
    }
  },
  t_pekka(ctx, t, x, y) {
    this.body(ctx, x, y, '#2c3e50', '#34495e', 5.5);
    ctx.fillStyle = '#9b59b6';   // 角
    ctx.beginPath(); ctx.moveTo(x - 4, y - 14); ctx.lineTo(x - 8, y - 20); ctx.lineTo(x - 2, y - 15); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 4, y - 14); ctx.lineTo(x + 8, y - 20); ctx.lineTo(x + 2, y - 15); ctx.fill();
    ctx.fillStyle = '#3fd0e8';   // 眼
    ctx.fillRect(x - 3, y - 13, 2, 1.6);
    ctx.fillRect(x + 1, y - 13, 2, 1.6);
    const sw = t.state === 'attacking' ? Math.sin(t.anim * 10) * 5 : 0;
    ctx.strokeStyle = '#b8c4d0';
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(x + 5, y - 6); ctx.lineTo(x + 10 + sw, y - 15 - sw); ctx.stroke();
  },

  // ---------- 战斗特效 ----------
  drawRings(ctx, now) {
    for (const r of Battle.rings) {
      const p = this.iso(r.x, r.y);
      const col = r.type === 'heal' ? '255,220,80' : '230,80,200';
      ctx.strokeStyle = `rgba(${col},.7)`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r.radius * HW, r.radius * HH, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(${col},.10)`;
      ctx.fill();
      // 上升粒子
      if (Math.random() < 0.3) {
        const a = Math.random() * Math.PI * 2, rr = Math.random() * r.radius;
        const pp = this.iso(r.x + Math.cos(a) * rr, r.y + Math.sin(a) * rr);
        this.particles.push({ x: pp.x, y: pp.y, vx: 0, vy: -20, life: 0.8, size: 2, color: r.type === 'heal' ? 'rgba(255,230,120,.8)' : 'rgba(240,100,220,.8)' });
      }
    }
  },
  drawProjectiles(ctx) {
    for (const p of Battle.projectiles) {
      if (p.kind === 'mortar') {
        const sx = this.iso(p.sx, p.sy), tx = this.iso(p.tx, p.ty);
        const x = sx.x + (tx.x - sx.x) * p.t;
        const yBase = sx.y + (tx.y - sx.y) * p.t;
        const arc = Math.sin(p.t * Math.PI) * 90;
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.beginPath(); ctx.ellipse(x, yBase, 3.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(x, yBase - 10 - arc, 4, 0, Math.PI * 2); ctx.fill();
      } else {
        const s = this.iso(p.sx, p.sy);
        const elev = p.troop && p.troop.def.move === 'air' ? 30 : 12;
        if (p.kind === 'arrow') {
          ctx.strokeStyle = '#d8c090';
          ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(s.x - 3, s.y - elev + 2); ctx.lineTo(s.x + 3, s.y - elev - 2); ctx.stroke();
        } else if (p.kind === 'magic') {
          ctx.fillStyle = '#7de8ff';
          ctx.beginPath(); ctx.arc(s.x, s.y - elev, 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(125,232,255,.35)';
          ctx.beginPath(); ctx.arc(s.x, s.y - elev, 7, 0, Math.PI * 2); ctx.fill();
        } else if (p.kind === 'rocket') {
          ctx.fillStyle = '#e05a4a';
          ctx.beginPath(); ctx.arc(s.x, s.y - elev, 3.2, 0, Math.PI * 2); ctx.fill();
          this.particles.push({ x: s.x, y: s.y - elev, vx: 0, vy: 6, life: 0.3, size: 2, color: 'rgba(255,180,80,.7)' });
        } else {
          ctx.fillStyle = '#1a1a1a';
          ctx.beginPath(); ctx.arc(s.x, s.y - elev, 3.6, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  },
  drawRedZone(ctx) {
    if (!Battle.selected) return;
    ctx.fillStyle = 'rgba(230,60,50,.16)';
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      if (Battle.allowGrid[y * GRID + x]) continue;
      this.diamond(ctx, x, y, 1, 1, 0);
      ctx.fill();
    }
  },
  drawPlacement(ctx, now) {
    const pl = this.placement;
    if (!pl) return;
    const def = BUILDINGS[pl.type];
    ctx.globalAlpha = 0.5;
    this.diamond(ctx, pl.x, pl.y, def.size, def.size, 0);
    ctx.fillStyle = pl.valid ? 'rgba(80,230,90,.6)' : 'rgba(230,60,50,.6)';
    ctx.fill();
    const fn = this['b_' + pl.type];
    const fake = { x: pl.x, y: pl.y, level: 1, type: pl.type };
    if (fn) fn.call(this, ctx, fake, def.size, now);
    ctx.globalAlpha = 1;
  },

  // ---------- 粒子 / 浮字 ----------
  drawParticles(ctx, dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity) p.vy += p.gravity * dt;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.particles = this.particles.filter(p => p.life > 0);
  },
  drawFloaters(ctx, dt) {
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= 26 * dt;
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
      ctx.font = 'bold 14px sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    this.floaters = this.floaters.filter(f => f.life > 0);
  },
  drawBolts(ctx, dt) {
    for (const b of this.bolts) {
      b.life -= dt;
      ctx.globalAlpha = Math.max(0, b.life * 3);
      ctx.strokeStyle = '#aee8ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      let y = b.y - 260, x = b.x;
      ctx.moveTo(x, y);
      while (y < b.y) {
        y += 30;
        x = b.x + (Math.random() - 0.5) * 26;
        ctx.lineTo(x, Math.min(y, b.y));
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.bolts = this.bolts.filter(b => b.life > 0);
  },
  drawTracers(ctx, dt) {
    for (const t of this.tracers) {
      t.life -= dt;
      const k = 1 - Math.max(0, t.life / t.total);
      const x = t.sx + (t.tx - t.sx) * k;
      const y = t.sy + (t.ty - t.sy) * k - Math.sin(k * Math.PI) * t.arc;
      ctx.fillStyle = t.color;
      ctx.beginPath(); ctx.arc(x, y, t.size, 0, Math.PI * 2); ctx.fill();
    }
    this.tracers = this.tracers.filter(t => t.life > 0);
  },

  // ---------- 特效 API (Battle 调用) ----------
  floatText(b, text, color) {
    const size = b.size || BUILDINGS[b.type].size;
    const p = this.iso(b.x + size / 2, b.y + size / 2);
    this.floaters.push({ x: p.x, y: p.y - 40, text, color, life: 1.6 });
  },
  floatTextAt(gx, gy, text, color) {
    const p = this.iso(gx, gy);
    this.floaters.push({ x: p.x, y: p.y - 30, text, color, life: 1.6 });
  },
  explosionFx(gx, gy, scale) {
    const p = this.iso(gx, gy);
    for (let i = 0; i < 14 * scale; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 30 + Math.random() * 70 * scale;
      this.particles.push({
        x: p.x, y: p.y - 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 40,
        life: 0.5 + Math.random() * 0.5, size: 2 + Math.random() * 3 * scale, gravity: 160,
        color: ['#ff8c1a', '#ffd23e', '#e05a4a', '#888'][Math.floor(Math.random() * 4)],
      });
    }
  },
  buildingDestroyedFx(b) {
    const size = b.size || 2;
    this.explosionFx(b.x + size / 2, b.y + size / 2, 1.4);
    const p = this.iso(b.x + size / 2, b.y + size / 2);
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        x: p.x + (Math.random() - 0.5) * 20, y: p.y - Math.random() * 10,
        vx: (Math.random() - 0.5) * 10, vy: -18 - Math.random() * 10,
        life: 1.5 + Math.random(), size: 4 + Math.random() * 4, color: 'rgba(120,120,120,.5)',
      });
    }
  },
  troopDeathFx(t) {
    const p = this.iso(t.x, t.y);
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x: p.x, y: p.y - 8, vx: Math.cos(a) * 40, vy: Math.sin(a) * 20 - 30,
        life: 0.5, size: 2.5, gravity: 140, color: '#ccc',
      });
    }
  },
  hitFx(b) {
    const size = b.size || 2;
    const p = this.iso(b.x + size / 2, b.y + size / 2);
    this.particles.push({
      x: p.x + (Math.random() - 0.5) * 16, y: p.y - 10 - Math.random() * 10,
      vx: (Math.random() - 0.5) * 30, vy: -30, life: 0.35, size: 2.5, gravity: 100, color: '#ffd23e',
    });
  },
  hitTroopFx(t) {
    const p = this.iso(t.x, t.y);
    this.particles.push({ x: p.x, y: p.y - 10, vx: 0, vy: -20, life: 0.3, size: 2.5, color: '#ff6a5a' });
  },
  muzzleFx(b) {
    const p = this.iso(b.x + b.size / 2, b.y + b.size / 2);
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        x: p.x, y: p.y - 12, vx: (Math.random() - 0.5) * 50, vy: -10 - Math.random() * 20,
        life: 0.25, size: 2.5, color: '#ffb84d',
      });
    }
  },
  healFx(gx, gy) {
    if (Math.random() > 0.4) return;
    const p = this.iso(gx, gy);
    this.particles.push({ x: p.x + (Math.random() - 0.5) * 10, y: p.y - 12, vx: 0, vy: -26, life: 0.6, size: 2, color: 'rgba(255,230,120,.9)' });
  },
  lightningFx(gx, gy, radius) {
    const p = this.iso(gx, gy);
    this.bolts.push({ x: p.x, y: p.y, life: 0.35 });
    this.explosionFx(gx, gy, 1.2);
  },
  troopShotFx(t, target) {
    const s = this.iso(t.x, t.y);
    const cx = target.x + target.size / 2, cy = target.y + target.size / 2;
    const e = this.iso(cx, cy);
    const air = t.def.move === 'air';
    const colors = { archer: '#d8c090', wizard: '#ff8c1a', dragon: '#ff6a2a' };
    this.tracers.push({
      sx: s.x, sy: s.y - (air ? 40 : 12), tx: e.x, ty: e.y - 10,
      life: 0.22, total: 0.22, arc: t.type === 'archer' ? 26 : 6,
      size: t.type === 'dragon' ? 4 : 2.5,
      color: colors[t.type] || '#fff',
    });
  },
};
