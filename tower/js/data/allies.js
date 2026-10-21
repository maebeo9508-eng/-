'use strict';
// ── 주인공과 이야기 속 인물 ─────────────────────────────────
G.HERO_LOOK = {
  body: 'round', color: '#fffaf3', ears: 'cat', innerEar: '#ffb3c6', eyes: 'cute', mouth: 'cat',
  acc: ['scarf'], scarfColor: '#ff6b6b', back: ['cattail'], tailColor: '#fffaf3',
};

G.CHARACTERS = {
  mochi: { name: '모찌', look: G.HERO_LOOK },
  grandma: { name: '솜솜 할머니', look: { body: 'round', color: '#ddd6e8', ears: 'cat', eyes: 'sleepy', mouth: 'cat', acc: ['glasses', 'shawl'], back: ['cattail'], tailColor: '#ddd6e8' } },
  lumi: { name: '루미', look: { body: 'star', color: '#fff3b0', eyes: 'cute', mouth: 'o', pat: ['glow'], float: true } },
  lumiShadow: { name: '악몽왕', look: G.BOSSES.nightmare.look },
  narrator: { name: '', look: null },
};

// ── 펫: 항상 곁을 따라다니며 도와줍니다 ───────────────────
// passive: 레벨 1 기준 능력치, per: 레벨당 증가량
G.PETS = {
  chick: {
    name: '삐약이', icon: '🐥', skill: '콕콕 쪼기', desc: '근처 적을 콕콕 쪼아요.',
    ability: 'peck', passive: { atkP: 0.03 }, per: { atkP: 0.01 },
    look: { body: 'round', color: '#ffe066', eyes: 'cute', mouth: 'none', acc: ['beak', 'eggshell'] },
  },
  slimey: {
    name: '말랑이', icon: '💧', skill: '말랑 치유', desc: '6초마다 모찌의 체력을 회복시켜요.',
    ability: 'heal', passive: { hpP: 0.05 }, per: { hpP: 0.015 },
    look: { body: 'slime', color: '#9fe6f0', eyes: 'happy', mouth: 'cat', translucent: true },
  },
  ppoyong: {
    name: '뽀용', icon: '🐲', skill: '꼬마 불꽃', desc: '불꽃 구슬을 뿜어 적을 태워요.',
    ability: 'fireball', passive: { crit: 0.02 }, per: { crit: 0.006 },
    look: { body: 'round', color: '#ff9fb0', color2: '#ffe0a3', pat: ['belly'], ears: 'horns', back: ['dragonwings', 'dragontail'], eyes: 'cute', mouth: 'fang', float: true },
  },
  boo: {
    name: '부우', icon: '👻', skill: '으스스 기운', desc: '주변 적을 느리게 만들어요.',
    ability: 'slowaura', passive: { defP: 0.05 }, per: { defP: 0.015 },
    look: { body: 'ghost', color: '#f2f0ff', eyes: 'happy', mouth: 'o', float: true },
  },
  hoot: {
    name: '부엉', icon: '🦉', skill: '깃털 화살', desc: '깃털을 쏘고, 아이템을 끌어당겨요.',
    ability: 'feather', passive: { expP: 0.08 }, per: { expP: 0.02 },
    look: { body: 'round', color: '#b08968', color2: '#f2dcc2', pat: ['belly'], ears: 'owl', eyes: 'big', mouth: 'none', acc: ['beak'], float: true },
  },
  twinkle: {
    name: '반짝이', icon: '⭐', skill: '별빛 보호막', desc: '주기적으로 피해를 막는 보호막을 줘요.',
    ability: 'shield', passive: { cdr: 0.03 }, per: { cdr: 0.007 },
    look: { body: 'star', color: '#fff3b0', eyes: 'cute', mouth: 'cat', pat: ['glow'], float: true },
  },
  oink: {
    name: '꿀꿀이', icon: '🐷', skill: '보물 냄새', desc: '골드를 더 많이 찾아내요.',
    ability: 'gold', passive: { goldP: 0.15 }, per: { goldP: 0.04 },
    look: { body: 'round', color: '#ffc2d1', ears: 'pig', eyes: 'cute', mouth: 'none', acc: ['snout'] },
  },
  nyang: {
    name: '냥냥이', icon: '🐱', skill: '냥냥 펀치', desc: '재빠르게 앞발로 할퀴어요.',
    ability: 'scratch', passive: { aspd: 0.03 }, per: { aspd: 0.008 },
    look: { body: 'round', color: '#ffb26b', ears: 'cat', eyes: 'cute', mouth: 'cat', back: ['cattail'], pat: ['spots'], color2: '#ff9a3c' },
  },
};
G.PET_MAX_LV = 10;
G.petUpCost = (lv) => Math.floor(150 * Math.pow(1.7, lv - 1));

// ── 동료: 모찌와 한 팀이 되어 함께 싸웁니다 (최대 3명 편성) ──
// pos: front(앞줄, 적을 막음) / back(뒷줄, 거리 유지)
// ult: 궁극기. charge초마다 게이지가 차고, AUTO면 알아서, 아니면 카드를 눌러 발동
G.TEAM_SLOTS = 3;
G.STARTER_TEAM = ['mungchi', 'bopul', 'poksin'];
G.COMPANIONS = {
  // 처음부터 함께하는 털실 인형 셋 (할머니가 뜬 인형이 등불 빛을 받아 깨어남)
  mungchi: {
    name: '뭉치', icon: '🧸', role: '털실 곰 · 탱커', pos: 'front', doll: true,
    desc: '할머니가 뜬 하늘색 털실 곰. 맨 앞에서 적의 시선을 끌어요.',
    ai: 'melee', taunt: true, hpMul: 2.4, atkMul: 0.55, rate: 0.9, range: 30, spd: 100,
    ult: { name: '털실 방패', icon: '🧶', charge: 15, desc: '팀 모두에게 보호막을 씌우고 4초 동안 모든 적을 도발해요.' },
    look: { body: 'round', color: '#9fc5e8', pat: ['knit'], ears: 'bear', innerEar: '#cfe3f5', eyes: 'button', mouth: 'cat', acc: ['bandana'], bandColor: '#ffd166' },
  },
  bopul: {
    name: '보풀', icon: '🐰', role: '털실 토끼 · 원거리', pos: 'back', doll: true,
    desc: '분홍 털실 토끼. 뒤에서 털실 화살을 콕콕 쏴요.',
    ai: 'ranged', hpMul: 1.0, atkMul: 0.7, rate: 1.2, range: 230, proj: 'arrow', spd: 105,
    ult: { name: '실타래 연사', icon: '🏹', charge: 13, desc: '털실 화살 12발을 쉴 새 없이 쏘아요.' },
    look: { body: 'round', color: '#f6c1d0', pat: ['knit'], ears: 'bunny', innerEar: '#fde3ea', eyes: 'button', mouth: 'cat', acc: ['bow'], bowColor: '#7ed9c3' },
  },
  poksin: {
    name: '폭신', icon: '🐑', role: '털실 양 · 회복', pos: 'back', doll: true,
    desc: '폭신한 털실 양. 친구들의 상처를 포근하게 감싸 줘요.',
    ai: 'healer', hpMul: 1.1, atkMul: 0.35, rate: 0.9, range: 180, proj: 'orb', heal: 0.035, spd: 100,
    ult: { name: '폭신 자장가', icon: '💤', charge: 16, desc: '팀 체력 25% 회복, 주변 적을 꾸벅꾸벅 졸게(크게 둔화) 해요.' },
    look: { body: 'round', color: '#fff6e8', pat: ['knit'], back: ['sheep'], earColor: '#e8d8c3', eyes: 'button', mouth: 'smile', acc: ['wool'] },
  },
  // 보스에게서 구해 낸 마을 친구들
  gombang: {
    name: '곰방', icon: '🐻', role: '대장장이 · 탱커', pos: 'front',
    desc: '적의 시선을 끌고 망치로 쿵! 튼튼해요.',
    ai: 'melee', taunt: true, hpMul: 3.0, atkMul: 0.9, rate: 0.9, range: 34, aoe: 34, spd: 95,
    ult: { name: '대지 강타', icon: '🔨', charge: 15, desc: '적이 모인 곳으로 뛰어들어 쾅! 주변 적을 기절시켜요.' },
    look: { body: 'round', color: '#c08b5c', color2: '#f2d0a4', pat: ['belly'], ears: 'bear', eyes: 'cute', mouth: 'cat', acc: ['bandana'], bandColor: '#ff6b6b' },
  },
  toseul: {
    name: '토슬', icon: '🐰', role: '제빵사 · 지원', pos: 'back',
    desc: '크림 파이를 던져 적을 끈적하게 만들어요.',
    ai: 'ranged', hpMul: 1.4, atkMul: 0.75, rate: 0.85, range: 200, proj: 'cream', aoe: 36, slow: 0.4, spd: 100,
    ult: { name: '거대 케이크 폭탄', icon: '🎂', charge: 14, desc: '커다란 케이크를 던져 넓은 범위의 적을 끈적하게 만들어요.' },
    look: { body: 'round', color: '#fff0f5', ears: 'bunny', eyes: 'happy', mouth: 'cat', acc: ['chefHat'] },
  },
  neogul: {
    name: '너굴', icon: '🦝', role: '상인 · 도적', pos: 'front',
    desc: '날쌘 단검 연타, 쓰러뜨린 적에게서 골드를 더 챙겨요.',
    ai: 'melee', hpMul: 1.6, atkMul: 0.45, rate: 2.4, range: 26, goldP: 0.2, spd: 115,
    ult: { name: '황금 소나기', icon: '💰', charge: 12, desc: '단검 10번 연속 공격! 쓰러뜨린 적은 골드를 더 떨궈요.' },
    look: { body: 'round', color: '#a39e9e', pat: ['mask'], ears: 'bear', eyes: 'cute', mouth: 'cat', back: ['cattail'], tailColor: '#7d7878' },
  },
  pengpeng: {
    name: '펭펭', icon: '🐧', role: '사제 · 회복', pos: 'back',
    desc: '5초마다 모두의 체력을 회복시켜요.',
    ai: 'healer', hpMul: 1.6, atkMul: 0.4, rate: 0.9, range: 180, proj: 'orb', heal: 0.05, spd: 95,
    ult: { name: '축복의 오로라', icon: '✨', charge: 20, desc: '팀 체력 40% 회복, 쓰러진 친구를 일으켜 세워요.' },
    look: { body: 'tall', color: '#4a5878', color2: '#ffffff', pat: ['belly'], eyes: 'cute', mouth: 'none', acc: ['beak', 'halo'] },
  },
  tobi: {
    name: '토비', icon: '🪄', role: '견습 마법사 · 광역', pos: 'back',
    desc: '터지는 불꽃 마법으로 여러 적을 한꺼번에!',
    ai: 'ranged', hpMul: 1.2, atkMul: 1.15, rate: 0.65, range: 230, proj: 'fireball', aoe: 46, spd: 100,
    ult: { name: '불꽃 폭풍', icon: '🔥', charge: 15, desc: '적들 위로 불꽃 폭발이 6번 터져요.' },
    look: { body: 'round', color: '#d4e8ff', ears: 'bunny', innerEar: '#ffd6e0', eyes: 'cute', mouth: 'smile', acc: ['witchHat'], hatColor: '#4f7cff', bandColor: '#ffd166' },
  },
  daram: {
    name: '다람', icon: '🐿️', role: '시계공 · 설치', pos: 'back',
    desc: '자동 포탑을 설치해 콩알탄을 쏴요.',
    ai: 'turret', hpMul: 1.4, atkMul: 0.4, rate: 3, range: 220, proj: 'ball', spd: 100,
    ult: { name: '태엽 포대', icon: '⚙️', charge: 16, desc: '자동 포탑 3개를 한꺼번에 설치해요.' },
    look: { body: 'round', color: '#e0954f', color2: '#ffe2c2', pat: ['belly'], ears: 'cat', back: ['bigtail'], eyes: 'cute', mouth: 'cat', acc: ['goggles'] },
  },
  yeoul: {
    name: '여울', icon: '🦊', role: '궁수 · 관통', pos: 'back',
    desc: '멀리서 적들을 꿰뚫는 화살을 쏴요.',
    ai: 'ranged', hpMul: 1.3, atkMul: 0.85, rate: 1.3, range: 300, proj: 'arrow', pierce: 3, spd: 105,
    ult: { name: '빛의 화살비', icon: '🌠', charge: 14, desc: '모든 적을 꿰뚫는 빛의 화살 5발을 쏴요.' },
    look: { body: 'round', color: '#ff9a4d', color2: '#ffffff', pat: ['belly'], ears: 'fox', back: ['foxtail'], eyes: 'cute', mouth: 'cat', acc: ['feather'] },
  },
  luna: {
    name: '루나', icon: '🌙', role: '달의 무녀 · 별빛', pos: 'back',
    desc: '하늘에서 별 세 개를 불러 떨어뜨려요.',
    ai: 'star', hpMul: 1.4, atkMul: 0.9, rate: 0.28, range: 260, spd: 100,
    ult: { name: '달빛 유성우', icon: '🌙', charge: 16, desc: '별 10개가 적들 위로 쏟아져 내려요.' },
    look: { body: 'round', color: '#f3f0ff', ears: 'bunny', innerEar: '#c3a6ff', eyes: 'sleepy', mouth: 'cat', acc: ['moonpin'] },
  },
};
G.COMP_MAX_LV = 10;
G.compUpCost = (lv) => Math.floor(220 * Math.pow(1.75, lv - 1));

// ── 특성: 별조각으로 배우는 영구 성장 ─────────────────────
G.TRAIT_TREES = [
  {
    id: 'courage', name: '용기', color: '#ff6b6b', icon: '🔥',
    nodes: [
      { id: 'c1', name: '날카로운 발톱', icon: '🐾', max: 10, stat: 'atkP', per: 0.04, req: 0 },
      { id: 'c2', name: '재빠른 앞발', icon: '💨', max: 10, stat: 'aspd', per: 0.025, req: 5 },
      { id: 'c3', name: '급소 노리기', icon: '🎯', max: 10, stat: 'crit', per: 0.012, req: 12 },
      { id: 'c4', name: '사냥꾼의 본능', icon: '👑', max: 5, stat: 'bossDmg', per: 0.07, req: 20 },
      { id: 'c5', name: '필살 냥펀치', icon: '💥', max: 5, stat: 'skillDmg', per: 0.12, req: 28 },
    ],
  },
  {
    id: 'endure', name: '인내', color: '#5cc26a', icon: '🌿',
    nodes: [
      { id: 'e1', name: '튼튼한 몸', icon: '💪', max: 10, stat: 'hpP', per: 0.05, req: 0 },
      { id: 'e2', name: '보송보송 털', icon: '🧶', max: 10, stat: 'defP', per: 0.05, req: 5 },
      { id: 'e3', name: '낮잠의 힘', icon: '💤', max: 5, stat: 'regen', per: 0.0007, req: 12 },
      { id: 'e4', name: '물약 장인', icon: '🧪', max: 3, stat: 'potions', per: 1, req: 20 },
      { id: 'e5', name: '아홉 목숨', icon: '😺', max: 1, stat: 'revive', per: 1, req: 28 },
    ],
  },
  {
    id: 'wisdom', name: '지혜', color: '#4fa3ff', icon: '💡',
    nodes: [
      { id: 'w1', name: '호기심', icon: '🔍', max: 10, stat: 'expP', per: 0.05, req: 0 },
      { id: 'w2', name: '동전 냄새', icon: '🪙', max: 10, stat: 'goldP', per: 0.06, req: 5 },
      { id: 'w3', name: '집중', icon: '🧘', max: 5, stat: 'cdr', per: 0.03, req: 12 },
      { id: 'w4', name: '행운의 꼬리', icon: '🍀', max: 5, stat: 'luck', per: 0.1, req: 20 },
      { id: 'w5', name: '넓은 시야', icon: '🔭', max: 2, stat: 'choices', per: 1, req: 28 },
    ],
  },
];
G.traitCost = (node, lv, idx) => 2 + lv * 2 + idx * 2;
