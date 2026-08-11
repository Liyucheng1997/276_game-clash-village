// ============ UI 层 ============
const UI = {
  shopCat: 'resource',
  currentEnemy: null,

  $(id) { return document.getElementById(id); },

  init() {
    this.$('btn-shop').onclick = () => { SFX.click(); this.toggleShop(); };
    this.$('btn-army').onclick = () => { SFX.click(); this.toggleArmy(); };
    this.$('btn-attack').onclick = () => { SFX.click(); this.openSearch(); };
    this.$('btn-end-battle').onclick = () => {
      SFX.click();
      this.confirm('确定要结束战斗吗？', () => Battle.endBattle('主动结束'));
    };
    this.$('btn-sound').onclick = () => {
      const on = SFX.toggle();
      Game.state.soundOn = on;
      this.$('btn-sound').textContent = on ? '🔊' : '🔇';
    };
    document.querySelectorAll('.close-x').forEach(btn => {
      btn.onclick = () => { SFX.click(); this.$(btn.dataset.close).classList.add('hidden'); if (btn.dataset.close === 'panel-building') Render.selectedBuilding = null; };
    });
  },

  toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    this.$('toast-wrap').appendChild(el);
    setTimeout(() => el.remove(), 2700);
  },

  confirm(text, onYes) {
    const wrap = this.$('confirm-wrap');
    wrap.classList.remove('hidden');
    wrap.innerHTML = `<div class="confirm-box"><div class="cb-text">${text}</div>
      <div class="center-row">
        <button class="act-btn danger" id="cf-yes">确定</button>
        <button class="act-btn blue" id="cf-no">取消</button>
      </div></div>`;
    this.$('cf-yes').onclick = () => { wrap.classList.add('hidden'); onYes(); };
    this.$('cf-no').onclick = () => wrap.classList.add('hidden');
  },

  closeAll() {
    ['panel-shop','panel-army','panel-search','panel-building'].forEach(id => this.$(id).classList.add('hidden'));
    Render.selectedBuilding = null;
  },

  // ---------- HUD ----------
  updateHUD() {
    const s = Game.state;
    const gCap = Game.storageCap('gold'), eCap = Game.storageCap('elixir');
    this.$('gold-num').textContent = fmt(s.gold);
    this.$('elixir-num').textContent = fmt(s.elixir);
    this.$('gem-num').textContent = fmt(s.gems);
    this.$('gold-fill').style.width = Math.min(100, s.gold / Math.max(1, gCap) * 100) + '%';
    this.$('elixir-fill').style.width = Math.min(100, s.elixir / Math.max(1, eCap) * 100) + '%';
    this.$('trophy-num').textContent = s.trophies;
    this.$('level-num').textContent = Game.playerLevel();
    this.$('builder-num').textContent = `${Game.builderFree()}/${Game.builderTotal()}`;
    // 工人任务列表
    const jobs = [];
    for (const b of s.buildings) {
      if (b.upgrading) jobs.push({ label: `${BUILDINGS[b.type].icon}${BUILDINGS[b.type].name}→${b.upgrading.toLevel}级 ${fmtTime(b.upgrading.remain)}`, ref: b });
    }
    for (const o of s.obstacles) {
      if (o.clearing) jobs.push({ label: `🔨清理障碍 ${fmtTime(o.clearing.remain)}`, ref: null });
    }
    if (s.research) {
      const def = TROOPS[s.research.type] || SPELLS[s.research.type];
      jobs.push({ label: `🔬${def.name}→${s.research.toLevel}级 ${fmtTime(s.research.remain)}`, ref: null });
    }
    const jw = this.$('builder-jobs');
    jw.innerHTML = jobs.map((j, i) => `<div class="builder-job" data-i="${i}">${j.label}</div>`).join('');
    jw.querySelectorAll('.builder-job').forEach((el, i) => {
      el.onclick = () => { if (jobs[i].ref) Main.focusBuilding(jobs[i].ref); };
    });
    // 战斗按钮禁用
    this.$('hud-bottom').style.display = Battle.active ? 'none' : 'flex';
    this.$('builder-bar').style.display = Battle.active ? 'none' : 'flex';
    this.$('hud-top').style.display = Battle.active ? 'none' : 'flex';
  },

  // ---------- 建筑面板 ----------
  showBuilding(b) {
    const def = BUILDINGS[b.type];
    const panel = this.$('panel-building');
    panel.classList.remove('hidden');
    Render.selectedBuilding = b;
    const lvText = b.level === 0 ? '(建造中)' : ` ${b.level} 级`;
    this.$('pb-name').textContent = `${def.icon} ${def.name}${lvText}`;

    const stats = [];
    const ld = b.level > 0 ? def.levels[b.level - 1] : def.levels[0];
    stats.push(`生命 <b>${ld.hp}</b>`);
    if (def.defense) {
      stats.push(`每秒伤害 <b>${ld.dps}</b>`);
      stats.push(`射程 <b>${def.defense.minRange ? def.defense.minRange + '-' : ''}${def.defense.range}</b>`);
      const tg = { ground: '对地', air: '对空', both: '对空对地' }[def.defense.targets];
      stats.push(`目标 <b>${tg}</b>`);
      if (def.defense.splash) stats.push(`范围伤害 <b>是</b>`);
    }
    if (ld.rate) stats.push(`产量 <b>${ld.rate}/分钟</b>`);
    if (ld.cap) stats.push(`容量 <b>${fmt(ld.cap)}</b>${b.stored !== undefined ? ` (已存 <b>${fmt(b.stored)}</b>)` : ''}`);
    if (ld.storage) stats.push(`存储 <b>${fmt(ld.storage)}</b>`);
    if (ld.capacity) stats.push(`容量 <b>${ld.capacity}</b>`);
    stats.push(`<span style="color:#8fa4bc">${def.desc}</span>`);
    this.$('pb-stats').innerHTML = stats.map(x => `<span>${x}</span>`).join('');

    const acts = this.$('pb-actions');
    acts.innerHTML = '';
    const addBtn = (label, cls, fn, disabled) => {
      const btn = document.createElement('button');
      btn.className = 'act-btn ' + cls;
      btn.innerHTML = label;
      btn.disabled = !!disabled;
      btn.onclick = () => { SFX.click(); fn(); };
      acts.appendChild(btn);
      return btn;
    };

    if (b.upgrading) {
      const remain = b.upgrading.remain;
      addBtn(`💎${gemCostForTime(remain)} 立即完成`, 'gem', () => { Game.finishNow(b); this.showBuilding(b); });
      addBtn('取消并返还50%', 'danger', () => {
        this.confirm('取消升级只返还一半资源，确定吗？', () => { Game.cancelUpgrade(b); this.closeAll(); });
      });
    } else {
      // 收集
      if ((b.type === 'gold_mine' || b.type === 'elixir_pump') && b.stored >= 1) {
        addBtn('收集', '', () => { Game.collect(b); this.showBuilding(b); });
      }
      // 升级
      const info = Game.upgradeInfo(b);
      if (info.can) {
        addBtn(`升级 ${costText(info.cost)}${info.time ? ' · ' + fmtTime(info.time) : ''}`, 'blue',
          () => { if (Game.startUpgrade(b)) this.showBuilding(b); },
          !Game.canAfford(info.cost));
      } else if (info.why) {
        addBtn(info.why, 'blue', () => {}, true);
      }
      // 训练入口
      if (b.type === 'barracks' || b.type === 'army_camp') addBtn('训练部队', '', () => { this.closeAll(); this.toggleArmy(); });
      if (b.type === 'spell_factory') addBtn('酿造法术', '', () => { this.closeAll(); this.toggleArmy(); });
      if (b.type === 'laboratory') addBtn('研究', '', () => { this.closeAll(); this.toggleArmy(); });
      if (b.type === 'wall') {
        addBtn('出售(返还30%)', 'danger', () => { Game.sellWall(b); this.closeAll(); });
        // 批量升级同级城墙
        const walls = Game.state.buildings.filter(w => w.type === 'wall' && w.level === b.level);
        const winfo = Game.upgradeInfo(b);
        if (winfo.can && walls.length > 1) {
          addBtn(`升级全部同级墙 ×${walls.length}`, 'blue', () => {
            let n = 0;
            for (const w of walls) { if (Game.upgradeInfo(w).can && Game.canAfford(Game.upgradeInfo(w).cost)) { Game.startUpgrade(w); n++; } }
            this.toast(`升级了 ${n} 段城墙`);
            this.closeAll();
          });
        }
      }
    }
  },

  showObstacle(o) {
    const def = OBSTACLES.find(d => d.key === o.key);
    const panel = this.$('panel-building');
    panel.classList.remove('hidden');
    this.$('pb-name').textContent = `${def.icon} ${def.name}`;
    this.$('pb-stats').innerHTML = `<span>清理障碍有机会获得宝石${o.key === 'gembox' ? '，宝石箱必出大量宝石！' : ''}</span>`;
    const acts = this.$('pb-actions');
    acts.innerHTML = '';
    if (!o.clearing) {
      const btn = document.createElement('button');
      btn.className = 'act-btn';
      btn.textContent = `清理 ${costText(def.cost)}`;
      btn.onclick = () => { SFX.click(); Game.startClearObstacle(o); panel.classList.add('hidden'); };
      acts.appendChild(btn);
    } else {
      acts.innerHTML = '<span style="color:#9fb4cc">清理中...</span>';
    }
  },

  // ---------- 商店 ----------
  toggleShop() {
    const panel = this.$('panel-shop');
    if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
    this.closeAll();
    panel.classList.remove('hidden');
    this.renderShop();
  },
  renderShop() {
    const tabs = this.$('shop-tabs');
    tabs.innerHTML = SHOP_CATS.map(c =>
      `<button class="shop-tab ${c.key === this.shopCat ? 'active' : ''}" data-cat="${c.key}">${c.name}</button>`).join('');
    tabs.querySelectorAll('.shop-tab').forEach(el => {
      el.onclick = () => { SFX.click(); this.shopCat = el.dataset.cat; this.renderShop(); };
    });
    const grid = this.$('shop-grid');
    grid.innerHTML = '';
    for (const type in BUILDINGS) {
      const def = BUILDINGS[type];
      if (def.cat !== this.shopCat) continue;
      if (type === 'town_hall') continue;
      const count = Game.countType(type);
      const max = Game.maxCount(type);
      const chk = Game.canBuild(type);
      const cost = type === 'builder_hut' ? { gems: BUILDER_HUT_GEM_COST[count] } : def.levels[0].cost;
      const item = document.createElement('div');
      item.className = 'shop-item' + (chk.ok ? '' : ' locked');
      item.innerHTML = `
        <div class="si-count">${count}/${max}</div>
        <div class="si-icon">${def.icon}</div>
        <div class="si-name">${def.name}</div>
        <div class="si-info">${def.desc}</div>
        <div class="si-cost">${costText(cost)}</div>`;
      item.onclick = () => {
        SFX.click();
        if (!chk.ok) { this.toast(chk.why); SFX.error(); return; }
        this.$('panel-shop').classList.add('hidden');
        Main.enterPlacement(type);
      };
      grid.appendChild(item);
    }
  },

  // ---------- 部队面板 ----------
  toggleArmy() {
    const panel = this.$('panel-army');
    if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
    this.closeAll();
    panel.classList.remove('hidden');
    this.renderArmy();
  },
  renderArmy() {
    const s = Game.state;
    const wrap = this.$('army-content');
    const housing = Game.armyHousing(), cap = Game.campCapacity();
    const barLv = Game.maxBarracksLevel();
    let html = `<div class="camp-meter">军营容量: <b>${housing} / ${cap}</b>${s.trainQueue.length ? ` · 训练队列 ${s.trainQueue.length}` : ''}</div>`;

    // 当前部队
    const troopsOwned = TROOP_ORDER.filter(t => s.army[t]);
    if (troopsOwned.length) {
      html += `<div class="army-section-title">现有部队 (点击可解散)</div><div class="troop-row">`;
      for (const t of troopsOwned) {
        const def = TROOPS[t];
        html += `<div class="troop-card" data-act="dismiss" data-type="${t}">
          <div class="tc-count">×${s.army[t]}</div>
          <div class="tc-icon">${def.icon}</div>
          <div class="tc-name">${def.name} ${Game.troopLevel(t)}级</div>
          <div class="tc-info">占${def.housing}人口</div></div>`;
      }
      html += `</div>`;
    }
    if (Object.keys(s.spells).length) {
      html += `<div class="army-section-title">已备法术</div><div class="troop-row">`;
      for (const t in s.spells) {
        const def = SPELLS[t];
        html += `<div class="troop-card"><div class="tc-count">×${s.spells[t]}</div>
          <div class="tc-icon">${def.icon}</div><div class="tc-name">${def.name}</div></div>`;
      }
      html += `</div>`;
    }

    // 训练队列
    if (s.trainQueue.length) {
      const q0 = s.trainQueue[0];
      html += `<div class="army-section-title">训练中</div>
        <div class="progress-outer"><div class="progress-inner" style="width:${(1 - q0.remain / q0.total) * 100}%"></div></div>
        <div class="queue-row">${s.trainQueue.map((q, i) =>
          `<div class="queue-item" data-act="cancel-train" data-i="${i}">${TROOPS[q.type].icon}${TROOPS[q.type].name}${i === 0 ? ' ' + fmtTime(q.remain) : ''} ✕</div>`).join('')}</div>`;
    }

    // 训练
    html += `<div class="army-section-title">训练部队 (兵营 ${barLv} 级)</div><div class="troop-row">`;
    for (const t of TROOP_ORDER) {
      const def = TROOPS[t];
      const locked = barLv < def.unlockBarracks;
      html += `<div class="troop-card ${locked ? 'locked' : ''}" data-act="train" data-type="${t}" title="${def.desc}">
        <div class="tc-icon">${def.icon}</div>
        <div class="tc-name">${def.name} ${Game.troopLevel(t)}级</div>
        <div class="tc-info">${locked ? `需${def.unlockBarracks}级兵营` : `💧${fmt(def.cost)} · 占${def.housing}`}</div></div>`;
    }
    html += `</div>`;

    // 法术
    const facLv = Game.factoryLevel();
    if (facLv > 0) {
      html += `<div class="army-section-title">酿造法术 (容量 ${Game.spellCount()}/${Game.spellCapacity()})</div>`;
      if (s.brewQueue.length) {
        const q0 = s.brewQueue[0];
        html += `<div class="progress-outer"><div class="progress-inner" style="width:${(1 - q0.remain / q0.total) * 100}%"></div></div>
          <div class="queue-row">${s.brewQueue.map(q => `<div class="queue-item">${SPELLS[q.type].icon}${SPELLS[q.type].name}</div>`).join('')}</div>`;
      }
      html += `<div class="troop-row">`;
      for (const t of SPELL_ORDER) {
        const def = SPELLS[t];
        const locked = facLv < def.unlockFactory;
        html += `<div class="troop-card ${locked ? 'locked' : ''}" data-act="brew" data-type="${t}" title="${def.desc}">
          <div class="tc-icon">${def.icon}</div>
          <div class="tc-name">${def.name} ${Game.troopLevel(t)}级</div>
          <div class="tc-info">${locked ? `需${def.unlockFactory}级工厂` : `💧${fmt(def.cost)}`}</div></div>`;
      }
      html += `</div>`;
    }

    // 研究
    const labLv = Game.labLevel();
    if (labLv > 0) {
      html += `<div class="army-section-title">实验室研究 (${labLv} 级)</div>`;
      if (s.research) {
        const def = TROOPS[s.research.type] || SPELLS[s.research.type];
        html += `<div class="camp-meter">研究中: ${def.icon}${def.name} → ${s.research.toLevel} 级 · 剩余 ${fmtTime(s.research.remain)}</div>
          <div class="progress-outer"><div class="progress-inner" style="width:${(1 - s.research.remain / s.research.total) * 100}%"></div></div>`;
      } else {
        html += `<div class="troop-row">`;
        const researchables = [...TROOP_ORDER.filter(t => barLv >= TROOPS[t].unlockBarracks), ...SPELL_ORDER.filter(t => facLv >= SPELLS[t].unlockFactory)];
        for (const t of researchables) {
          const def = TROOPS[t] || SPELLS[t];
          const cur = Game.troopLevel(t);
          if (cur >= def.maxLevel) continue;
          const rc = researchCost(t, cur + 1);
          const need = researchLabNeed(cur + 1);
          const locked = labLv < need;
          html += `<div class="troop-card ${locked ? 'locked' : ''}" data-act="research" data-type="${t}">
            <div class="tc-icon">${def.icon}</div>
            <div class="tc-name">${def.name} ${cur}→${cur + 1}级</div>
            <div class="tc-info">${locked ? `需${need}级实验室` : `💧${fmt(rc.elixir)} · ${fmtTime(rc.time)}`}</div></div>`;
        }
        html += `</div>`;
      }
    }

    wrap.innerHTML = html;
    wrap.querySelectorAll('[data-act]').forEach(el => {
      const act = el.dataset.act, type = el.dataset.type;
      el.onclick = () => {
        SFX.click();
        if (act === 'train') { if (Game.train(type)) this.renderArmy(); }
        else if (act === 'brew') { if (Game.brew(type)) this.renderArmy(); }
        else if (act === 'research') { if (Game.research(type)) this.renderArmy(); }
        else if (act === 'cancel-train') { Game.cancelTrain(+el.dataset.i); this.renderArmy(); }
        else if (act === 'dismiss') {
          this.confirm(`解散一个${TROOPS[type].name}？(不返还圣水)`, () => { Game.removeTroop(type); this.renderArmy(); });
        }
      };
    });
  },

  // ---------- 进攻搜索 ----------
  openSearch() {
    if (Game.armyHousing() === 0 || Object.keys(Game.state.army).length === 0) {
      this.toast('先训练部队再进攻！');
      SFX.error();
      this.toggleArmy();
      return;
    }
    this.closeAll();
    this.$('panel-search').classList.remove('hidden');
    this.rollEnemy(true);
  },
  searchCost() { return Math.round(30 * Math.pow(Game.thLevel(), 1.4)); },
  rollEnemy(first) {
    if (!first) {
      const cost = this.searchCost();
      if (Game.state.gold < cost) { this.toast('金币不足，无法继续搜索'); SFX.error(); return; }
      Game.state.gold -= cost;
    }
    this.currentEnemy = EnemyGen.generate(Game.thLevel(), Game.state.trophies);
    this.renderSearch();
  },
  renderSearch() {
    const e = this.currentEnemy;
    const wrap = this.$('search-content');
    const defCount = e.buildings.filter(b => BUILDINGS[b.type].defense).length;
    const wallCount = e.buildings.filter(b => b.type === 'wall').length;
    wrap.innerHTML = `
      <div class="search-info">
        <div style="font-size:19px;font-weight:bold">⚔️ ${e.name}</div>
        <div>大本营 <b>${e.th}</b> 级 · 防御建筑 <b>${defCount}</b> 座 · 城墙 <b>${wallCount}</b> 段</div>
        <div class="search-loot">
          <span style="color:#ffe27a">🪙 ${fmt(e.loot.gold)}</span>
          <span style="color:#f0a9f0">💧 ${fmt(e.loot.elixir)}</span>
          <span style="color:#9fd4ff">🏆 +${e.trophies}</span>
        </div>
        <div style="color:#9fb4cc;font-size:13px">我方部队人口: ${Game.armyHousing()} / ${Game.campCapacity()}</div>
      </div>
      <div class="center-row">
        <button class="act-btn danger" id="btn-fight">开战！</button>
        <button class="act-btn blue" id="btn-next">下一个 (🪙${fmt(this.searchCost())})</button>
      </div>`;
    this.$('btn-fight').onclick = () => { SFX.click(); this.startBattle(); };
    this.$('btn-next').onclick = () => { SFX.click(); this.rollEnemy(false); };
  },
  startBattle() {
    this.closeAll();
    Battle.start(this.currentEnemy);
    this.$('battle-hud').classList.remove('hidden');
    this.renderDeployBar();
    this.updateHUD();
    Main.focusCenter();
  },

  // ---------- 战斗 HUD ----------
  renderDeployBar() {
    const bar = this.$('deploy-bar');
    let html = '';
    for (const t of TROOP_ORDER) {
      const n = Battle.army[t] || 0;
      if (n <= 0 && !(Battle.usedTroops && Battle.usedTroops[t])) continue;
      const def = TROOPS[t];
      const sel = Battle.selected && Battle.selected.kind === 'troop' && Battle.selected.type === t;
      html += `<div class="deploy-card ${sel ? 'selected' : ''} ${n <= 0 ? 'empty' : ''}" data-kind="troop" data-type="${t}">
        <div class="dc-count">×${n}</div><div class="dc-icon">${def.icon}</div><div class="dc-name">${def.name}</div></div>`;
    }
    for (const t of SPELL_ORDER) {
      const n = Battle.spells[t] || 0;
      if (n <= 0 && !(Battle.usedSpells && Battle.usedSpells[t])) continue;
      const def = SPELLS[t];
      const sel = Battle.selected && Battle.selected.kind === 'spell' && Battle.selected.type === t;
      html += `<div class="deploy-card spell ${sel ? 'selected' : ''} ${n <= 0 ? 'empty' : ''}" data-kind="spell" data-type="${t}">
        <div class="dc-count">×${n}</div><div class="dc-icon">${def.icon}</div><div class="dc-name">${def.name}</div></div>`;
    }
    bar.innerHTML = html;
    bar.querySelectorAll('.deploy-card').forEach(el => {
      el.onclick = () => {
        SFX.click();
        const kind = el.dataset.kind, type = el.dataset.type;
        const pool = kind === 'troop' ? Battle.army : Battle.spells;
        if ((pool[type] || 0) <= 0) return;
        if (Battle.selected && Battle.selected.type === type) Battle.selected = null;
        else Battle.selected = { kind, type };
        this.renderDeployBar();
      };
    });
  },
  updateBattleHUD() {
    const m = Math.floor(Battle.time / 60), s = Math.floor(Battle.time % 60);
    this.$('battle-timer').textContent = `${m}:${String(s).padStart(2, '0')}`;
    this.$('battle-percent').textContent = Battle.percent + '%';
    this.$('battle-stars').textContent = '★'.repeat(Battle.stars) + '☆'.repeat(3 - Battle.stars);
    this.$('battle-loot-gold').textContent = fmt(Battle.lootGold);
    this.$('battle-loot-elixir').textContent = fmt(Battle.lootElixir);
  },

  // ---------- 结算 ----------
  showResult(r) {
    this.$('battle-hud').classList.add('hidden');
    const panel = this.$('panel-result');
    panel.classList.remove('hidden');
    this.$('result-title').textContent = r.win ? '🎉 胜利！' : '💀 战败';
    const used = Object.entries(r.usedTroops).map(([t, n]) => `${TROOPS[t].icon}×${n}`).join(' ') || '无';
    this.$('result-content').innerHTML = `
      <div class="result-stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</div>
      <div class="result-lines">
        <div>摧毁 <b>${r.percent}%</b> (${r.reason})</div>
        <div>掠夺 <span style="color:#ffe27a">🪙 ${fmt(r.lootGold)}</span> <span style="color:#f0a9f0">💧 ${fmt(r.lootElixir)}</span></div>
        <div>奖杯 <b style="color:${r.trophyDelta >= 0 ? '#8be06a' : '#e05a4a'}">${r.trophyDelta >= 0 ? '+' : ''}${r.trophyDelta}</b> 🏆</div>
        <div style="color:#9fb4cc;font-size:13px">消耗部队: ${used}</div>
      </div>
      <div class="center-row"><button class="act-btn" id="btn-back-home">返回村庄</button></div>`;
    this.$('btn-back-home').onclick = () => {
      SFX.click();
      panel.classList.add('hidden');
      Battle.exit();
      this.updateHUD();
      Main.focusCenter();
    };
  },
};
