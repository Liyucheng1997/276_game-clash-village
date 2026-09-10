// ============ 主循环 & 输入 ============
const Main = {
  placementType: null,   // 商店购买后的放置模式
  dragBuilding: null,    // 正在拖动的建筑
  dragStart: null,
  panning: false,
  lastPointer: null,
  pinchDist: 0,
  lastTime: 0,
  hudTimer: 0,

  init() {
    const canvas = document.getElementById('game');
    Render.init(canvas);
    if (!Game.load()) Game.newState();
    if (!Game.state.soundOn) { SFX.toggle(); UI.$('btn-sound').textContent = '🔇'; }
    UI.init();
    UI.updateHUD();
    this.bindInput(canvas);
    requestAnimationFrame(t => this.loop(t));
    setInterval(() => Game.save(), 5000);
    window.addEventListener('beforeunload', () => Game.save());
    if (Game.state.battleCount === 0 && Game.state.buildings.length <= 10) {
      setTimeout(() => UI.toast('👋 欢迎来到你的村庄！点击建筑升级，点商店建造新建筑'), 800);
      setTimeout(() => UI.toast('💡 训练部队后点"进攻"去掠夺资源'), 4200);
    }
  },

  // ---------- 输入 ----------
  bindInput(canvas) {
    let downPos = null, moved = false;

    const getPos = (e) => {
      if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    };

    const onDown = (e) => {
      const p = getPos(e);
      downPos = p;
      moved = false;
      this.lastPointer = p;
      if (e.touches && e.touches.length === 2) {
        this.pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
        return;
      }
      const { gx, gy } = Render.screenToGrid(p.x, p.y);
      // 村庄模式: 按住建筑可拖动
      if (!Battle.active && !this.placementType) {
        const b = this.pickBuilding(gx, gy);
        if (b && Render.selectedBuilding === b && !Battle.active) {
          this.dragBuilding = b;
          this.dragStart = { x: b.x, y: b.y };
        }
      }
    };

    const onMove = (e) => {
      const p = getPos(e);
      if (e.touches && e.touches.length === 2) {
        // 双指缩放
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
        if (this.pinchDist > 0) this.zoomAt((p.x + e.touches[1].clientX) / 2, (p.y + e.touches[1].clientY) / 2, d / this.pinchDist);
        this.pinchDist = d;
        return;
      }
      if (!downPos) {
        // 放置模式跟随鼠标
        if (this.placementType) this.updatePlacement(p.x, p.y);
        return;
      }
      const dx = p.x - this.lastPointer.x, dy = p.y - this.lastPointer.y;
      if (Math.hypot(p.x - downPos.x, p.y - downPos.y) > 6) moved = true;

      if (this.dragBuilding) {
        const { gx, gy } = Render.screenToGrid(p.x, p.y);
        const size = BUILDINGS[this.dragBuilding.type].size;
        const nx = Math.round(gx - size / 2), ny = Math.round(gy - size / 2);
        this.dragBuilding.x = Math.max(1, Math.min(GRID - size - 1, nx));
        this.dragBuilding.y = Math.max(1, Math.min(GRID - size - 1, ny));
      } else if (this.placementType) {
        this.updatePlacement(p.x, p.y);
      } else if (moved) {
        Render.cam.x += dx;
        Render.cam.y += dy;
      }
      this.lastPointer = p;
    };

    const onUp = (e) => {
      const p = this.lastPointer || downPos;
      if (this.dragBuilding) {
        // 校验落点
        const b = this.dragBuilding;
        if (!Game.canPlace(b.x, b.y, BUILDINGS[b.type].size, b)) {
          b.x = this.dragStart.x; b.y = this.dragStart.y;
          SFX.error();
        } else if (b.x !== this.dragStart.x || b.y !== this.dragStart.y) {
          SFX.build();
          Game.save();
        }
        this.dragBuilding = null;
        downPos = null;
        return;
      }
      if (downPos && !moved && p) this.onTap(p.x, p.y);
      downPos = null;
      this.pinchDist = 0;
    };

    canvas.addEventListener('mousedown', onDown);
    // Continue a drag when the pointer crosses a HUD or building panel.
    window.addEventListener('mousemove', e => { if (downPos || e.target === canvas) onMove(e); });
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(e); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); onMove(e); }, { passive: false });
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); onUp(e); }, { passive: false });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 0.9);
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.placementType) this.exitPlacement(true);
        else UI.closeAll();
      }
    });
  },

  zoomAt(sx, sy, factor) {
    const cam = Render.cam;
    const ns = Math.max(0.35, Math.min(2.2, cam.scale * factor));
    const k = ns / cam.scale;
    cam.x = sx - (sx - cam.x) * k;
    cam.y = sy - (sy - cam.y) * k;
    cam.scale = ns;
  },

  pickBuilding(gx, gy) {
    const x = Math.floor(gx), y = Math.floor(gy);
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return null;
    const occ = Game.occupancy(null);
    const cell = occ[y * GRID + x];
    return cell && cell.kind === 'building' ? cell.ref : null;
  },
  pickObstacle(gx, gy) {
    const x = Math.floor(gx), y = Math.floor(gy);
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return null;
    const occ = Game.occupancy(null);
    const cell = occ[y * GRID + x];
    return cell && cell.kind === 'obstacle' ? cell.ref : null;
  },

  onTap(sx, sy) {
    const { gx, gy } = Render.screenToGrid(sx, sy);

    // ---- 战斗模式: 部署 ----
    if (Battle.active) {
      if (Battle.ended) return;
      if (!Battle.selected) { UI.toast('先在下方选择要部署的部队'); return; }
      const sel = Battle.selected;
      if (sel.kind === 'troop') {
        if (Battle.deploy(sel.type, gx, gy)) {
          if ((Battle.army[sel.type] || 0) <= 0) Battle.selected = null;
          UI.renderDeployBar();
        }
      } else {
        if (Battle.castSpell(sel.type, gx, gy)) {
          if ((Battle.spells[sel.type] || 0) <= 0) Battle.selected = null;
          UI.renderDeployBar();
        }
      }
      return;
    }

    // ---- 放置模式 ----
    if (this.placementType) {
      const def = BUILDINGS[this.placementType];
      const x = Math.round(gx - def.size / 2), y = Math.round(gy - def.size / 2);
      if (Game.canPlace(x, y, def.size, null)) {
        const b = Game.placeNew(this.placementType, x, y);
        if (b) {
          UI.updateHUD();
          // 城墙连续放置
          if (this.placementType === 'wall' && Game.canBuild('wall').ok) {
            Render.placement = { type: 'wall', x, y, valid: false };
            return;
          }
        }
        this.exitPlacement(false);
      } else {
        SFX.error();
      }
      return;
    }

    // ---- 村庄模式: 选择 ----
    const b = this.pickBuilding(gx, gy);
    if (b) {
      SFX.click();
      // 采集器直接点击收集
      if ((b.type === 'gold_mine' || b.type === 'elixir_pump') && b.stored >= 1 && Render.selectedBuilding === b) {
        Game.collect(b);
      }
      UI.showBuilding(b);
      return;
    }
    const o = this.pickObstacle(gx, gy);
    if (o) { SFX.click(); UI.showObstacle(o); return; }
    // 空地: 取消选择
    UI.closeAll();
  },

  enterPlacement(type) {
    this.placementType = type;
    const def = BUILDINGS[type];
    const spot = Game.findFreeSpot(def.size) || { x: 18, y: 18 };
    Render.placement = { type, x: spot.x, y: spot.y, valid: Game.canPlace(spot.x, spot.y, def.size, null) };
    UI.toast(`点击地面放置${def.name}${type === 'wall' ? '，可连续放置，Esc 退出' : ''}`);
  },
  updatePlacement(sx, sy) {
    if (!this.placementType) return;
    const def = BUILDINGS[this.placementType];
    const { gx, gy } = Render.screenToGrid(sx, sy);
    const x = Math.round(gx - def.size / 2), y = Math.round(gy - def.size / 2);
    Render.placement = { type: this.placementType, x, y, valid: Game.canPlace(x, y, def.size, null) };
  },
  exitPlacement(cancelled) {
    this.placementType = null;
    Render.placement = null;
    if (cancelled) UI.toast('已退出放置模式');
  },

  focusBuilding(b) {
    const size = BUILDINGS[b.type].size;
    const c = Render.iso(b.x + size / 2, b.y + size / 2);
    Render.cam.x = Render.canvas.width / 2 - c.x * Render.cam.scale;
    Render.cam.y = Render.canvas.height / 2 - c.y * Render.cam.scale;
    UI.showBuilding(b);
  },
  focusCenter() {
    const c = Render.iso(GRID / 2, GRID / 2);
    Render.cam.x = Render.canvas.width / 2 - c.x * Render.cam.scale;
    Render.cam.y = Render.canvas.height / 2 - c.y * Render.cam.scale;
  },

  // ---------- 循环 ----------
  loop(t) {
    const dt = Math.min(0.1, (t - this.lastTime) / 1000 || 0.016);
    this.lastTime = t;

    if (Battle.active) {
      Battle.update(dt);
      UI.updateBattleHUD();
    } else {
      Game.tickEconomy(dt);
    }

    // HUD 节流刷新
    this.hudTimer -= dt;
    if (this.hudTimer <= 0 || Game.dirty) {
      this.hudTimer = 0.5;
      Game.dirty = false;
      UI.updateHUD();
    }

    Render.draw(dt);
    requestAnimationFrame(tt => this.loop(tt));
  },
};

window.addEventListener('DOMContentLoaded', () => Main.init());
// 调试入口
window.G = { Game, Battle, Render, UI, EnemyGen };
