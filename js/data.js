// ============ 游戏数值配置 ============
// 时间做了加速处理：真实 CoC 的小时/天 -> 这里的秒/分钟，节奏更爽快

const GRID = 40;            // 地图 40x40 格
const MAX_TH = 8;           // 大本营最高 8 级

// 等级数组生成器: n 级, 每级由 fn(i) 生成 (i 从 1 开始)
function mkLevels(n, fn) {
  const arr = [];
  for (let i = 1; i <= n; i++) arr.push(fn(i));
  return arr;
}
const R = Math.round;
// 取整到好看的数
function nice(v) {
  if (v < 100) return R(v / 5) * 5;
  if (v < 1000) return R(v / 25) * 25;
  if (v < 10000) return R(v / 100) * 100;
  return R(v / 500) * 500;
}

// ---- 建筑 ----
// maxPerTH[i] = 大本营 i+1 级时该建筑最大数量
// levels[i]: 升到 i+1 级的属性; cost 是"升级到该级"的花费(1 级即建造花费)
const BUILDINGS = {
  town_hall: {
    name: '大本营', icon: '🏰', size: 4, cat: 'army', weight: 3,
    maxPerTH: [1,1,1,1,1,1,1,1],
    desc: '村庄的核心。升级大本营可以解锁更多建筑和兵种。',
    levels: mkLevels(8, i => ({
      cost: { gold: i === 1 ? 0 : nice(400 * Math.pow(3.1, i - 2)) },
      time: i === 1 ? 0 : R(20 * Math.pow(2.1, i - 2)),
      hp: R(1400 * Math.pow(1.2, i - 1)),
      storage: 1000 * i,   // 大本营自带少量存储
    })),
  },
  gold_mine: {
    name: '金矿', icon: '⛏️', size: 3, cat: 'resource', weight: 1,
    maxPerTH: [1,2,3,4,5,6,6,7],
    desc: '从地下开采金币，点击收集。',
    levels: mkLevels(8, i => ({
      cost: { elixir: nice(150 * Math.pow(2.2, i - 1)) },
      time: R(8 * Math.pow(1.9, i - 1)),
      hp: R(360 * Math.pow(1.12, i - 1)),
      rate: R(20 * Math.pow(1.55, i - 1)),      // 每分钟产量
      cap: nice(300 * Math.pow(1.8, i - 1)),    // 存满上限
    })),
  },
  elixir_pump: {
    name: '圣水收集器', icon: '🧪', size: 3, cat: 'resource', weight: 1,
    maxPerTH: [1,2,3,4,5,6,6,7],
    desc: '从地脉抽取圣水，点击收集。',
    levels: mkLevels(8, i => ({
      cost: { gold: nice(150 * Math.pow(2.2, i - 1)) },
      time: R(8 * Math.pow(1.9, i - 1)),
      hp: R(360 * Math.pow(1.12, i - 1)),
      rate: R(20 * Math.pow(1.55, i - 1)),
      cap: nice(300 * Math.pow(1.8, i - 1)),
    })),
  },
  gold_storage: {
    name: '储金罐', icon: '🏦', size: 3, cat: 'resource', weight: 1.5,
    maxPerTH: [1,1,2,2,2,2,3,3],
    desc: '存储金币。升级提高容量，被打时可能被掠夺。',
    levels: mkLevels(8, i => ({
      cost: { elixir: nice(300 * Math.pow(2.4, i - 1)) },
      time: R(10 * Math.pow(1.9, i - 1)),
      hp: R(650 * Math.pow(1.16, i - 1)),
      storage: nice(1500 * Math.pow(2.0, i - 1)),
    })),
  },
  elixir_storage: {
    name: '圣水瓶', icon: '⚗️', size: 3, cat: 'resource', weight: 1.5,
    maxPerTH: [1,1,2,2,2,2,3,3],
    desc: '存储圣水。升级提高容量，被打时可能被掠夺。',
    levels: mkLevels(8, i => ({
      cost: { gold: nice(300 * Math.pow(2.4, i - 1)) },
      time: R(10 * Math.pow(1.9, i - 1)),
      hp: R(650 * Math.pow(1.16, i - 1)),
      storage: nice(1500 * Math.pow(2.0, i - 1)),
    })),
  },
  barracks: {
    name: '兵营', icon: '⛺', size: 3, cat: 'army', weight: 1,
    maxPerTH: [1,1,2,2,3,3,4,4],
    desc: '训练部队。升级解锁更强的兵种，多个兵营可加快训练。',
    levels: mkLevels(10, i => ({
      cost: { elixir: nice(100 * Math.pow(2.35, i - 1)) },
      time: R(6 * Math.pow(1.8, i - 1)),
      hp: R(400 * Math.pow(1.12, i - 1)),
    })),
  },
  army_camp: {
    name: '军营', icon: '🏕️', size: 4, cat: 'army', weight: 1,
    maxPerTH: [1,1,2,2,3,3,4,4],
    desc: '容纳训练好的部队。升级提高容量。',
    levels: mkLevels(8, i => ({
      cost: { elixir: nice(200 * Math.pow(2.5, i - 1)) },
      time: R(10 * Math.pow(1.9, i - 1)),
      hp: R(350 * Math.pow(1.1, i - 1)),
      capacity: [20, 30, 35, 40, 45, 50, 55, 60][i - 1],
    })),
  },
  laboratory: {
    name: '实验室', icon: '🔬', size: 3, cat: 'army', weight: 1,
    maxPerTH: [0,0,1,1,1,1,1,1],
    desc: '研究强化兵种和法术，一次只能研究一项。',
    levels: mkLevels(6, i => ({
      cost: { elixir: nice(2000 * Math.pow(2.4, i - 1)) },
      time: R(30 * Math.pow(1.9, i - 1)),
      hp: R(500 * Math.pow(1.1, i - 1)),
    })),
  },
  spell_factory: {
    name: '法术工厂', icon: '🌀', size: 3, cat: 'army', weight: 1,
    maxPerTH: [0,0,0,1,1,1,1,1],
    desc: '酿造战斗法术。升级解锁新法术并增加容量。',
    levels: mkLevels(4, i => ({
      cost: { gold: nice(5000 * Math.pow(2.5, i - 1)) },
      time: R(40 * Math.pow(2, i - 1)),
      hp: R(500 * Math.pow(1.1, i - 1)),
      capacity: i + 1,
    })),
  },
  cannon: {
    name: '加农炮', icon: '💣', size: 3, cat: 'defense', weight: 1,
    maxPerTH: [1,2,2,3,3,4,5,5],
    desc: '可靠的单体地面防御。',
    defense: { targets: 'ground', range: 8, minRange: 0, attackSpeed: 0.8, splash: 0 },
    levels: mkLevels(8, i => ({
      cost: { gold: nice(180 * Math.pow(2.4, i - 1)) },
      time: R(6 * Math.pow(1.85, i - 1)),
      hp: R(400 * Math.pow(1.14, i - 1)),
      dps: R(8 * Math.pow(1.28, i - 1)),
    })),
  },
  archer_tower: {
    name: '箭塔', icon: '🏹', size: 3, cat: 'defense', weight: 1,
    maxPerTH: [0,1,1,2,3,3,4,4],
    desc: '对空对地都能攻击的远程防御。',
    defense: { targets: 'both', range: 10, minRange: 0, attackSpeed: 0.7, splash: 0 },
    levels: mkLevels(8, i => ({
      cost: { gold: nice(700 * Math.pow(2.2, i - 1)) },
      time: R(10 * Math.pow(1.85, i - 1)),
      hp: R(360 * Math.pow(1.14, i - 1)),
      dps: R(9 * Math.pow(1.26, i - 1)),
    })),
  },
  mortar: {
    name: '迫击炮', icon: '🎯', size: 3, cat: 'defense', weight: 1.2,
    maxPerTH: [0,0,1,1,2,2,3,3],
    desc: '远程范围杀伤，但打不到太近的敌人。',
    defense: { targets: 'ground', range: 13, minRange: 4, attackSpeed: 5, splash: 1.5 },
    levels: mkLevels(8, i => ({
      cost: { gold: nice(4000 * Math.pow(2, i - 1)) },
      time: R(20 * Math.pow(1.8, i - 1)),
      hp: R(400 * Math.pow(1.14, i - 1)),
      dps: R(4 * Math.pow(1.28, i - 1)),
    })),
  },
  wizard_tower: {
    name: '法师塔', icon: '🔮', size: 3, cat: 'defense', weight: 1.2,
    maxPerTH: [0,0,0,0,1,2,2,3],
    desc: '短程溅射魔法，克制人海战术，对空对地。',
    defense: { targets: 'both', range: 7, minRange: 0, attackSpeed: 1.3, splash: 1 },
    levels: mkLevels(6, i => ({
      cost: { gold: nice(9000 * Math.pow(2, i - 1)) },
      time: R(30 * Math.pow(1.8, i - 1)),
      hp: R(600 * Math.pow(1.14, i - 1)),
      dps: R(10 * Math.pow(1.3, i - 1)),
    })),
  },
  air_defense: {
    name: '防空火箭', icon: '🚀', size: 3, cat: 'defense', weight: 1.2,
    maxPerTH: [0,0,0,1,1,2,2,3],
    desc: '对空火力极强，但无法攻击地面。',
    defense: { targets: 'air', range: 10, minRange: 0, attackSpeed: 1, splash: 0 },
    levels: mkLevels(6, i => ({
      cost: { gold: nice(5000 * Math.pow(2.1, i - 1)) },
      time: R(25 * Math.pow(1.8, i - 1)),
      hp: R(700 * Math.pow(1.14, i - 1)),
      dps: R(65 * Math.pow(1.25, i - 1)),
    })),
  },
  wall: {
    name: '城墙', icon: '🧱', size: 1, cat: 'defense', weight: 0,
    maxPerTH: [0, 25, 50, 75, 100, 125, 150, 175],
    desc: '阻挡地面部队的坚固城墙，升级瞬间完成。',
    levels: mkLevels(8, i => ({
      cost: { gold: [50, 200, 700, 2000, 5000, 10000, 20000, 40000][i - 1] },
      time: 0,
      hp: [300, 500, 800, 1400, 2000, 3000, 4000, 5500][i - 1],
    })),
  },
  builder_hut: {
    name: '建筑工人小屋', icon: '🛖', size: 2, cat: 'army', weight: 0.5,
    maxPerTH: [5,5,5,5,5,5,5,5],
    desc: '每个小屋提供一名建筑工人，可同时进行更多建造。',
    levels: [{ cost: { gems: 0 }, time: 0, hp: 250 }],
  },
};

// 各栋建筑用宝石购买的价格（第 n 个工人小屋）
const BUILDER_HUT_GEM_COST = [0, 0, 250, 600, 1200]; // 前两个免费(初始就有)

// ---- 兵种 ----
const TROOPS = {
  barbarian: {
    name: '野蛮人', icon: '🗡️', housing: 1, speed: 2.4, range: 0.5,
    attackSpeed: 1, dps: 12, hp: 65, move: 'ground', attacks: 'ground',
    prefer: null, cost: 25, trainTime: 3, unlockBarracks: 1, maxLevel: 8,
    desc: '挥舞大剑的金发猛男，见什么砍什么。',
  },
  archer: {
    name: '弓箭手', icon: '🏹', housing: 1, speed: 2.6, range: 3.5,
    attackSpeed: 1, dps: 10, hp: 30, move: 'ground', attacks: 'both',
    prefer: null, cost: 60, trainTime: 5, unlockBarracks: 2, maxLevel: 8,
    desc: '远程输出，可以隔着城墙射击。',
  },
  goblin: {
    name: '哥布林', icon: '👺', housing: 1, speed: 3.6, range: 0.5,
    attackSpeed: 1, dps: 14, hp: 34, move: 'ground', attacks: 'ground',
    prefer: 'resource', preferMult: 2, cost: 30, trainTime: 5, unlockBarracks: 3, maxLevel: 8,
    desc: '见钱眼开，优先攻击资源建筑且伤害翻倍。',
  },
  giant: {
    name: '巨人', icon: '🦣', housing: 5, speed: 1.4, range: 0.6,
    attackSpeed: 2, dps: 16, hp: 420, move: 'ground', attacks: 'ground',
    prefer: 'defense', cost: 280, trainTime: 15, unlockBarracks: 4, maxLevel: 8,
    desc: '皮糙肉厚的肉盾，优先攻击防御建筑。',
  },
  wall_breaker: {
    name: '炸弹人', icon: '💀', housing: 2, speed: 3.2, range: 0.4,
    attackSpeed: 1, dps: 15, hp: 30, move: 'ground', attacks: 'ground',
    prefer: 'wall', wallMult: 40, suicide: true, splash: 1.5,
    cost: 600, trainTime: 15, unlockBarracks: 5, maxLevel: 6,
    desc: '抱着炸弹冲向城墙，对城墙造成 40 倍伤害。',
  },
  balloon: {
    name: '气球兵', icon: '🎈', housing: 5, speed: 1.2, range: 0.5,
    attackSpeed: 3, dps: 36, hp: 220, move: 'air', attacks: 'ground',
    prefer: 'defense', deathDamage: 60, deathSplash: 1.5,
    cost: 2200, trainTime: 20, unlockBarracks: 6, maxLevel: 6,
    desc: '飞跃城墙投掷炸弹，优先攻击防御，坠毁时爆炸。',
  },
  wizard: {
    name: '法师', icon: '🧙', housing: 4, speed: 2.2, range: 3,
    attackSpeed: 1.5, dps: 50, hp: 100, move: 'ground', attacks: 'both',
    splash: 0.6, prefer: null, cost: 1800, trainTime: 20, unlockBarracks: 7, maxLevel: 6,
    desc: '投掷火球的范围输出核心。',
  },
  healer: {
    name: '天使', icon: '👼', housing: 14, speed: 1.6, range: 4,
    attackSpeed: 1, dps: 0, heal: 40, hp: 550, move: 'air', attacks: 'none',
    prefer: null, cost: 6000, trainTime: 40, unlockBarracks: 8, maxLevel: 5,
    desc: '不会攻击，持续治疗受伤的地面部队。',
  },
  dragon: {
    name: '飞龙', icon: '🐉', housing: 20, speed: 1.6, range: 2,
    attackSpeed: 1.5, dps: 130, hp: 2000, move: 'air', attacks: 'both',
    splash: 0.8, prefer: null, cost: 26000, trainTime: 60, unlockBarracks: 9, maxLevel: 5,
    desc: '喷吐烈焰的空中霸主。',
  },
  pekka: {
    name: '皮卡超人', icon: '🤖', housing: 25, speed: 1.6, range: 0.6,
    attackSpeed: 1.8, dps: 240, hp: 3000, move: 'ground', attacks: 'ground',
    prefer: null, cost: 30000, trainTime: 60, unlockBarracks: 10, maxLevel: 5,
    desc: '重甲战士，蝴蝶也怕它的剑。',
  },
};
const TROOP_ORDER = ['barbarian','archer','goblin','giant','wall_breaker','balloon','wizard','healer','dragon','pekka'];

// 兵种等级带来的属性倍率
function troopLevelMult(level) { return Math.pow(1.18, level - 1); }
// 研究费用(圣水)与时间
function researchCost(type, toLevel) {
  const t = TROOPS[type] || SPELLS[type];
  const base = (t.cost || 1000) * 8;
  return { elixir: nice(base * Math.pow(1.9, toLevel - 2)), time: R(20 * Math.pow(1.7, toLevel - 2)) };
}
// 研究需要的实验室等级
function researchLabNeed(toLevel) { return Math.max(1, toLevel - 1); }

// ---- 法术 ----
const SPELLS = {
  lightning: {
    name: '雷电法术', icon: '⚡', unlockFactory: 1, cost: 800, brewTime: 20, maxLevel: 6,
    radius: 2, damage: 320,
    desc: '召唤闪电轰击一小片区域。',
  },
  heal: {
    name: '治疗法术', icon: '💖', unlockFactory: 2, cost: 1500, brewTime: 25, maxLevel: 6,
    radius: 3.5, hps: 60, duration: 10,
    desc: '在区域内持续治疗己方部队。',
  },
  rage: {
    name: '狂暴法术', icon: '😡', unlockFactory: 3, cost: 2200, brewTime: 30, maxLevel: 5,
    radius: 3.5, boost: 1.7, duration: 12,
    desc: '区域内部队移动与攻击大幅提升。',
  },
};
const SPELL_ORDER = ['lightning', 'heal', 'rage'];
function spellLevelMult(level) { return Math.pow(1.2, level - 1); }

// ---- 障碍物 ----
const OBSTACLES = [
  { key: 'tree1', name: '橡树', icon: '🌳', size: 2, cost: { gold: 200 }, gems: [0, 3] },
  { key: 'tree2', name: '松树', icon: '🌲', size: 2, cost: { elixir: 200 }, gems: [0, 3] },
  { key: 'bush', name: '灌木', icon: '🌿', size: 1, cost: { gold: 80 }, gems: [0, 1] },
  { key: 'rock', name: '岩石', icon: '🪨', size: 2, cost: { elixir: 300 }, gems: [0, 2] },
  { key: 'gembox', name: '宝石箱', icon: '🎁', size: 2, cost: { elixir: 500 }, gems: [20, 25] },
];

// 商店分类
const SHOP_CATS = [
  { key: 'resource', name: '资源' },
  { key: 'army', name: '军事' },
  { key: 'defense', name: '防御' },
];

// ---- 通用工具 ----
function fmt(n) {
  n = Math.floor(n);
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
function fmtTime(sec) {
  sec = Math.ceil(sec);
  if (sec < 60) return sec + '秒';
  if (sec < 3600) return Math.floor(sec / 60) + '分' + (sec % 60 ? sec % 60 + '秒' : '');
  return Math.floor(sec / 3600) + '时' + Math.floor((sec % 3600) / 60) + '分';
}
// 加速完成的宝石花费
function gemCostForTime(sec) { return Math.max(1, Math.ceil(sec / 15)); }
function costText(cost) {
  const parts = [];
  if (cost.gold) parts.push('🪙' + fmt(cost.gold));
  if (cost.elixir) parts.push('💧' + fmt(cost.elixir));
  if (cost.gems) parts.push('💎' + fmt(cost.gems));
  return parts.join(' ') || '免费';
}
