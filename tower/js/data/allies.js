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

// ── 주인공: 탑에 오를 캐릭터를 골라요 ──────────────────────
// stats: 기본 능력치 배율(hp·atk·def·move) / crit 추가 치명타 확률
// weapon: 주 무기 — 같은 종류의 무기를 들면 피해 +20%, 처음 함께할 때 이 무기를 하나 받아요
// trait: 고유 특성(늘 켜져 있음) / ult: 필살기 (적을 때려 게이지를 채우고 버튼으로 발동)
G.HERO_MAX_LV = 10;
G.heroUpCost = (lv) => Math.floor(220 * Math.pow(1.75, lv - 1));
G.FAVORED_BONUS = 0.2;
G.STARTER_HEROES = ['mochi', 'mungchi', 'bopul', 'poksin'];
G.HEROES = {
  mochi: {
    name: '모찌', icon: '🐱', role: '용감한 검사', weapon: 'sword',
    desc: '등불을 든 하얀 고양이. 무엇이든 무난하게 잘해요.',
    stats: { hp: 1, atk: 1, def: 1, move: 1, crit: 0 },
    trait: { fx: 'brave', name: '용감한 꼬리', desc: '연속 공격의 마지막 일격 피해 +35%' },
    ult: { name: '냥냥 난무', icon: '🌀', charge: 1, desc: '빙글빙글 돌며 주변 적을 8번 베어요.' },
    look: G.HERO_LOOK,
  },
  // 처음부터 함께하는 털실 인형 셋 (할머니가 뜬 인형이 등불 빛을 받아 깨어남)
  mungchi: {
    name: '뭉치', icon: '🧸', role: '털실 곰 · 탱커', weapon: 'greatsword', doll: true,
    desc: '할머니가 뜬 하늘색 털실 곰. 느리지만 엄청 튼튼해요.',
    stats: { hp: 1.4, atk: 0.92, def: 1.5, move: 0.9, crit: 0 },
    trait: { fx: 'yarnArmor', name: '털실 갑옷', desc: '받는 피해 -12%, 체력 50% 이하에서는 -25%' },
    ult: { name: '털실 방패', icon: '🧶', charge: 0.9, desc: '4초 동안 무적 털실 방패! 주변 적을 밀쳐 내요.' },
    look: { body: 'round', color: '#9fc5e8', pat: ['knit'], ears: 'bear', innerEar: '#cfe3f5', eyes: 'button', mouth: 'cat', acc: ['bandana'], bandColor: '#ffd166' },
  },
  bopul: {
    name: '보풀', icon: '🐰', role: '털실 토끼 · 창술사', weapon: 'spear', doll: true,
    desc: '분홍 털실 토끼. 커다란 뜨개바늘로 멀리서 콕콕 찔러요.',
    stats: { hp: 0.92, atk: 1.05, def: 0.9, move: 1.05, crit: 0.05 },
    trait: { fx: 'needle', name: '뜨개바늘 솜씨', desc: '찌르기 사거리 +20%, 치명타 확률 +5%' },
    ult: { name: '실타래 연사', icon: '🧵', charge: 1.1, desc: '털실 바늘 12개를 쉴 새 없이 던져요.' },
    look: { body: 'round', color: '#f6c1d0', pat: ['knit'], ears: 'bunny', innerEar: '#fde3ea', eyes: 'button', mouth: 'cat', acc: ['bow'], bowColor: '#7ed9c3' },
  },
  poksin: {
    name: '폭신', icon: '🐑', role: '털실 양 · 채찍술사', weapon: 'whip', doll: true,
    desc: '폭신한 털실 양. 길게 뻗는 털실 채찍과 포근한 회복.',
    stats: { hp: 1.15, atk: 0.88, def: 1.1, move: 1, crit: 0 },
    trait: { fx: 'fluffy', name: '포근한 털', desc: '1초마다 체력 0.6% 회복' },
    ult: { name: '폭신 자장가', icon: '💤', charge: 1, desc: '체력 30% 회복, 주변 적을 꾸벅꾸벅 졸게(크게 둔화) 해요.' },
    look: { body: 'round', color: '#fff6e8', pat: ['knit'], back: ['sheep'], earColor: '#e8d8c3', eyes: 'button', mouth: 'smile', acc: ['wool'] },
  },
  // 보스에게서 구해 낸 마을 친구들
  gombang: {
    name: '곰방', icon: '🐻', role: '대장장이 · 도끼', weapon: 'axe',
    desc: '마을 대장장이 곰. 묵직한 도끼질에 충격파가 실려요.',
    stats: { hp: 1.25, atk: 1.12, def: 1.2, move: 0.9, crit: 0 },
    trait: { fx: 'smith', name: '대장장이의 팔', desc: '공격이 12% 확률로 충격파를 일으켜요 (공격력 80%)' },
    ult: { name: '대지 강타', icon: '🔨', charge: 1, desc: '적이 모인 곳으로 뛰어들어 쾅! 주변 적을 기절시켜요.' },
    look: { body: 'round', color: '#c08b5c', color2: '#f2d0a4', pat: ['belly'], ears: 'bear', eyes: 'cute', mouth: 'cat', acc: ['bandana'], bandColor: '#ff6b6b' },
  },
  toseul: {
    name: '토슬', icon: '🐰', role: '제빵사 · 권법가', weapon: 'gauntlet',
    desc: '오븐 장갑을 낀 제빵사 토끼. 반죽 치듯 빠른 주먹 연타!',
    stats: { hp: 1, atk: 1, def: 0.95, move: 1.08, crit: 0 },
    trait: { fx: 'baker', name: '갓 구운 쿠키', desc: '적을 쓰러뜨리면 10% 확률로 회복 쿠키(체력 8%)가 떨어져요' },
    ult: { name: '거대 케이크 폭탄', icon: '🎂', charge: 1, desc: '커다란 케이크를 던져 넓은 범위의 적을 끈적하게 만들어요.' },
    look: { body: 'round', color: '#fff0f5', ears: 'bunny', eyes: 'happy', mouth: 'cat', acc: ['chefHat'] },
  },
  neogul: {
    name: '너굴', icon: '🦝', role: '상인 · 도적', weapon: 'dagger',
    desc: '날쌘 너구리 상인. 단검 연타와 돈 냄새는 따라올 자가 없어요.',
    stats: { hp: 0.86, atk: 1.04, def: 0.85, move: 1.15, crit: 0.08 },
    trait: { fx: 'merchant', name: '장사꾼의 셈', desc: '골드 +35%, 탑 속 상점 20% 할인' },
    ult: { name: '황금 소나기', icon: '💰', charge: 1.15, desc: '단검 10번 연속 공격! 쓰러뜨린 적은 골드를 더 떨궈요.' },
    look: { body: 'round', color: '#a39e9e', pat: ['mask'], ears: 'bear', eyes: 'cute', mouth: 'cat', back: ['cattail'], tailColor: '#7d7878' },
  },
  pengpeng: {
    name: '펭펭', icon: '🐧', role: '사제 · 성스러운 망치', weapon: 'hammer',
    desc: '마을 사제 펭귄. 축복받은 망치로 쿵! 쓰러져도 한 번 일어나요.',
    stats: { hp: 1.1, atk: 0.98, def: 1.15, move: 0.94, crit: 0 },
    trait: { fx: 'blessing', name: '수호천사', desc: '탑에서 한 번, 쓰러져도 체력 50%로 일어나요. 받는 회복량 +30%' },
    ult: { name: '축복의 오로라', icon: '✨', charge: 0.85, desc: '체력 40% 회복, 3초 동안 무적.' },
    look: { body: 'tall', color: '#4a5878', color2: '#ffffff', pat: ['belly'], eyes: 'cute', mouth: 'none', acc: ['beak', 'halo'] },
  },
  tobi: {
    name: '토비', icon: '🪄', role: '견습 마법사', weapon: 'staff',
    desc: '불꽃 마법을 연습하는 꼬마 마법사. 몸은 약하지만 마법은 세요.',
    stats: { hp: 0.8, atk: 1.2, def: 0.8, move: 1, crit: 0 },
    trait: { fx: 'arcane', name: '마법 영재', desc: '스킬 피해 +30%, 스킬 쿨다운 -15%' },
    ult: { name: '불꽃 폭풍', icon: '🔥', charge: 1, desc: '적들 위로 불꽃 폭발이 6번 터져요.' },
    look: { body: 'round', color: '#d4e8ff', ears: 'bunny', innerEar: '#ffd6e0', eyes: 'cute', mouth: 'smile', acc: ['witchHat'], hatColor: '#4f7cff', bandColor: '#ffd166' },
  },
  daram: {
    name: '다람', icon: '🐿️', role: '시계공 · 펜싱', weapon: 'rapier',
    desc: '시곗바늘을 갈아 만든 레이피어. 째깍째깍 정확한 찌르기.',
    stats: { hp: 0.9, atk: 1, def: 0.9, move: 1.1, crit: 0.03 },
    trait: { fx: 'clockwork', name: '정밀한 태엽', desc: '공격 속도 +15%, 대시 쿨다운 -20%' },
    ult: { name: '태엽 포대', icon: '⚙️', charge: 1, desc: '자동 포탑 3개를 한꺼번에 설치해요.' },
    look: { body: 'round', color: '#e0954f', color2: '#ffe2c2', pat: ['belly'], ears: 'cat', back: ['bigtail'], eyes: 'cute', mouth: 'cat', acc: ['goggles'] },
  },
  yeoul: {
    name: '여울', icon: '🦊', role: '궁수 · 관통', weapon: 'bow',
    desc: '숲의 여우 궁수. 멀리서 적들을 꿰뚫어요.',
    stats: { hp: 0.86, atk: 1.08, def: 0.86, move: 1.05, crit: 0.05 },
    trait: { fx: 'hunter', name: '사냥꾼의 눈', desc: '보스·엘리트 피해 +30%, 화살·마법이 1명 더 관통' },
    ult: { name: '빛의 화살비', icon: '🌠', charge: 1, desc: '모든 적을 꿰뚫는 빛의 화살 5발을 쏴요.' },
    look: { body: 'round', color: '#ff9a4d', color2: '#ffffff', pat: ['belly'], ears: 'fox', back: ['foxtail'], eyes: 'cute', mouth: 'cat', acc: ['feather'] },
  },
  luna: {
    name: '루나', icon: '🌙', role: '달의 무녀 · 낫', weapon: 'scythe',
    desc: '초승달 낫을 든 달의 무녀. 치명타에 별이 떨어져요.',
    stats: { hp: 0.95, atk: 1.08, def: 0.9, move: 1.02, crit: 0.05 },
    trait: { fx: 'moonlight', name: '달빛 축복', desc: '치명타가 터지면 15% 확률로 별똥별이 떨어져요 (공격력 150%)' },
    ult: { name: '달빛 유성우', icon: '🌙', charge: 1, desc: '별 10개가 적들 위로 쏟아져 내려요.' },
    look: { body: 'round', color: '#f3f0ff', ears: 'bunny', innerEar: '#c3a6ff', eyes: 'sleepy', mouth: 'cat', acc: ['moonpin'] },
  },
};
// 이야기·구출용: 모찌를 뺀 친구들
G.COMPANIONS = {};
for (const k in G.HEROES) if (k !== 'mochi') G.COMPANIONS[k] = G.HEROES[k];

// ── 특성: 별조각으로 배우는 영구 성장 ─────────────────────
G.TRAIT_TREES = [
  {
    id: 'courage', name: '용기', color: '#ff6b6b', icon: '🔥',
    nodes: [
      { id: 'c1', name: '날카로운 발톱', icon: '🐾', max: 10, stat: 'atkP', per: 0.04, req: 0 },
      { id: 'c2', name: '재빠른 앞발', icon: '💨', max: 10, stat: 'aspd', per: 0.025, req: 5 },
      { id: 'c3', name: '급소 노리기', icon: '🎯', max: 10, stat: 'crit', per: 0.012, req: 12 },
      { id: 'c4', name: '사냥꾼의 본능', icon: '👑', max: 5, stat: 'bossDmg', per: 0.07, req: 20 },
      { id: 'c5', name: '필살의 일격', icon: '💥', max: 5, stat: 'skillDmg', per: 0.12, req: 28 },
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
