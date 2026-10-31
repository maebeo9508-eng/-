'use strict';
// 몬스터 도감. hp/atk는 1층 기준이며 층마다 G.S(층) 배율로 강해집니다.
// ai 종류는 game/ai.js 참고. look.hold 는 손에 든 무기 (render/art.js 의 weapon 그림)
const BALL = (color, speed, r) => ({ type: 'ball', color, speed: speed || 130, r: r || 5 });
const SKULL = { color: '#f1ebdd', eyes: 'hollow', mouth: 'teeth', pat: ['ribs'], blush: false };

G.MONSTERS = {
  // ── 1. 이끼 낀 지하감옥 ─────────────
  slime: {
    name: '초록 슬라임', desc: '말랑말랑 다가와 몸통 박치기!', ai: 'chase', hp: 16, atk: 6, spd: 52, r: 11, exp: 1,
    look: { body: 'slime', color: '#7fd38a', eyes: 'cute', mouth: 'cat', translucent: true },
  },
  goblin: {
    name: '고블린', desc: '녹슨 단검을 휘두르며 달려들어요.', ai: 'chase', hp: 15, atk: 7, spd: 58, r: 10, exp: 1,
    look: { body: 'round', color: '#8cc56b', ears: 'goblin', innerEar: '#c5e3a6', eyes: 'angry', mouth: 'fang', acc: ['nose'], hold: 'dagger' },
  },
  bat: {
    name: '동굴 박쥐', desc: '잠깐 멈췄다가 쏜살같이 돌진!', ai: 'dasher', hp: 11, atk: 8, spd: 62, r: 9, exp: 1,
    look: { body: 'round', color: '#6b5a8a', ears: 'cat', innerEar: '#ff9fc4', back: ['batwings'], wingColor: '#4e4068', eyes: 'cute', mouth: 'fang', float: true },
  },
  goblinthrower: {
    name: '고블린 투석꾼', desc: '멀리서 돌멩이를 휙휙 던져요.', ai: 'shooter', hp: 14, atk: 6, spd: 30, r: 11, exp: 1,
    range: 180, cd: 2.4, proj: { type: 'rock', color: '#9a8f80', speed: 130, r: 5 },
    look: { body: 'round', color: '#9cc77a', ears: 'goblin', innerEar: '#cfe6b8', eyes: 'happy', mouth: 'grin', acc: ['bandana', 'nose'], bandColor: '#c0504d' },
  },

  // ── 2. 해골 납골당 ───────────────────
  skeleton: {
    name: '해골 병사', desc: '달그락달그락, 뼈 칼을 들고 다가와요.', ai: 'chase', hp: 20, atk: 8, spd: 44, r: 11, exp: 1,
    look: Object.assign({ body: 'round', hold: 'sword', holdColor: '#e8dcc0' }, SKULL, { eyeColor: '#7ee0ff' }),
  },
  skelarcher: {
    name: '해골 궁수', desc: '두건 아래에서 뼈 화살을 조준해요.', ai: 'shooter', hp: 14, atk: 7, spd: 36, r: 11, exp: 1,
    range: 210, cd: 2.4, proj: { type: 'arrow', color: '#e8dcc0', speed: 200, r: 4 },
    look: Object.assign({ body: 'round', acc: ['hood'], hoodColor: '#5a4a6e', hold: 'bow', holdColor: '#a0785a' }, SKULL, { eyeColor: '#ffd166' }),
  },
  ghost: {
    name: '떠도는 유령', desc: '뿅 사라졌다 나타나 도깨비불을 던져요.', ai: 'blinker', hp: 15, atk: 7, spd: 0, r: 11, exp: 1,
    cd: 2.6, proj: BALL('#b7f0ff', 140, 5), count: 3,
    look: { body: 'ghost', color: '#dff3ff', eyes: 'sleepy', mouth: 'o', float: true, translucent: true },
  },
  skeldog: {
    name: '해골 개', desc: '뼈다귀 냄새를 맡고 쏜살같이 돌진!', ai: 'dasher', hp: 13, atk: 8, spd: 70, r: 9, exp: 1,
    look: Object.assign({ body: 'wide', ears: 'fox', innerEar: '#d8cfbd' }, SKULL, { eyeColor: '#ff8f6b' }),
  },

  // ── 3. 거미 동굴 ─────────────────────
  spider: {
    name: '동굴 거미', desc: '여러 개의 눈으로 노려보다 덮쳐요.', ai: 'dasher', hp: 22, atk: 9, spd: 66, r: 11, exp: 2,
    dashSpd: 340,
    look: { body: 'round', color: '#5a4038', back: ['spiderlegs'], eyes: 'many', eyeColor: '#ff5a5a', mouth: 'fang' },
  },
  toadstool: {
    name: '독버섯', desc: '움직이지 않지만 독 포자를 사방으로!', ai: 'turret', hp: 30, atk: 8, spd: 0, r: 12, exp: 2,
    cd: 2.8, ring: 8, proj: { type: 'spike', color: '#c08bff', speed: 115, r: 5 },
    look: { body: 'round', color: '#efe1c8', eyes: 'dot', mouth: 'cat', acc: ['cap'], capColor: '#9a5cc9', eyeY: 0.15, mouthY: 0.22 },
  },
  worm: {
    name: '동굴 지렁이', desc: '땅속에 숨었다 발밑에서 튀어나와요.', ai: 'burrower', hp: 22, atk: 9, spd: 70, r: 11, exp: 2,
    look: { body: 'egg', color: '#e89a9a', color2: '#f6c3b5', pat: ['belly'], eyes: 'dot', mouth: 'fang' },
  },
  poisonslime: {
    name: '독 슬라임', desc: '지나간 자리에 독 웅덩이가 남아요.', ai: 'trailer', hp: 30, atk: 9, spd: 48, r: 12, exp: 2,
    trail: 'poison',
    look: { body: 'slime', color: '#9be36b', color2: '#6cbf4a', pat: ['spots'], eyes: 'cute', mouth: 'o', translucent: true },
  },

  // ── 4. 서리 동굴 ─────────────────────
  frostbat: {
    name: '서리 박쥐', desc: '날아다니며 얼음 조각을 뿌려요.', ai: 'flyer', hp: 18, atk: 9, spd: 70, r: 10, exp: 2,
    cd: 2.0, proj: { type: 'ball', color: '#bfefff', speed: 160, r: 5, slow: 0.3 },
    look: { body: 'round', color: '#9fc8e8', ears: 'cat', innerEar: '#dff4ff', back: ['batwings'], wingColor: '#6f9ec4', eyes: 'cute', mouth: 'fang', float: true },
  },
  icewisp: {
    name: '얼음 정령', desc: '모였다가 얼음 고리를 펑!', ai: 'nova', hp: 18, atk: 10, spd: 55, r: 10, exp: 2,
    cd: 3.2, radius: 70,
    look: { body: 'star', color: '#a5ecff', eyes: 'happy', mouth: 'o', float: true, pat: ['glow'] },
  },
  frostwolf: {
    name: '서리 늑대', desc: '얼음 위를 미끄러지며 길게 돌진!', ai: 'dasher', hp: 20, atk: 9, spd: 58, r: 11, exp: 2,
    dashSpd: 360, dashT: 0.55,
    look: { body: 'round', color: '#e8f4ff', ears: 'fox', innerEar: '#bfe0f5', back: ['foxtail'], tailColor: '#e8f4ff', eyes: 'angry', mouth: 'fang' },
  },
  icegolem: {
    name: '얼음 골렘', desc: '느릿느릿, 하지만 엄청 튼튼해요.', ai: 'tank', hp: 55, atk: 9, spd: 28, r: 13, exp: 2,
    cd: 3.5, ring: 6, proj: BALL('#dff4ff', 100, 5),
    look: { body: 'square', color: '#a9d6ef', color2: '#7fb6d6', pat: ['stone'], eyes: 'glow', eyeColor: '#ffffff', mouth: 'none', acc: ['crystals'], crystalColor: '#e6fbff', blush: false },
  },

  // ── 5. 용암 갱도 ─────────────────────
  imp: {
    name: '불꽃 임프', desc: '달려와서 펑! 하고 터져요.', ai: 'bomber', hp: 14, atk: 16, spd: 78, r: 10, exp: 2,
    radius: 52,
    look: { body: 'round', color: '#ff6b4a', ears: 'horns', back: ['dragontail'], eyes: 'angry', mouth: 'grin', acc: ['flame'] },
  },
  lavaslime: {
    name: '용암 슬라임', desc: '쓰러지면 불바다를 남겨요.', ai: 'chase', hp: 30, atk: 10, spd: 50, r: 12, exp: 2,
    deathZone: true,
    look: { body: 'slime', color: '#ff6b5b', pat: ['lavaglow'], eyes: 'angry', mouth: 'cat', translucent: true },
  },
  firebat: {
    name: '화염 박쥐', desc: '날아다니며 불꽃을 쏴요.', ai: 'flyer', hp: 18, atk: 9, spd: 70, r: 10, exp: 2,
    cd: 2.0, proj: { type: 'fire', color: '#ff9f1c', speed: 160, r: 5 },
    look: { body: 'round', color: '#7a4b6b', back: ['batwings'], wingColor: '#5a3550', eyes: 'glow', eyeColor: '#ffb347', mouth: 'fang', float: true },
  },
  kobold: {
    name: '코볼트 광부', desc: '곡괭이를 들고 폴짝 뛰어 내려찍어요.', ai: 'jumper', hp: 22, atk: 9, spd: 56, r: 10, exp: 2,
    look: { body: 'round', color: '#c98f5a', ears: 'fox', innerEar: '#f0c49a', eyes: 'cute', mouth: 'fang', acc: ['minerhelm'], hold: 'pickaxe' },
  },

  // ── 6. 저주받은 서고 ─────────────────
  grimoire: {
    name: '떠도는 마도서', desc: '책장을 펄럭이며 저주 쪽지를 날려요.', ai: 'flyer', hp: 20, atk: 9, spd: 60, r: 11, exp: 2,
    cd: 2.0, proj: { type: 'page', color: '#fffaf0', speed: 150, r: 6 }, count: 2, spread: 0.3,
    look: { body: 'book', color: '#7b5ea7', pat: ['pages'], eyes: 'angry', mouth: 'grin', float: true },
  },
  candlewraith: {
    name: '촛불 망령', desc: '순간이동하며 불씨를 뿌려요.', ai: 'blinker', hp: 20, atk: 9, spd: 0, r: 11, exp: 2,
    cd: 2.4, proj: { type: 'fire', color: '#ffb347', speed: 150, r: 5 }, count: 5,
    look: { body: 'ghost', color: '#f6f0ff', eyes: 'sleepy', mouth: 'o', acc: ['candle'], float: true },
  },
  darkmage: {
    name: '어둠 마법사', desc: '두건 아래에서 별빛 저주를 세 갈래로!', ai: 'shooter', hp: 26, atk: 10, spd: 40, r: 12, exp: 2,
    range: 220, cd: 2.0, proj: { type: 'star', color: '#c3a6ff', speed: 150, r: 6 }, count: 3, spread: 0.3,
    look: { body: 'round', color: '#7a6aa8', eyes: 'glow', eyeColor: '#ffd6ff', mouth: 'none', acc: ['hood'], hoodColor: '#3d2f5c', hold: 'staff', holdColor: '#b06cff', blush: false },
  },
  gargoyle: {
    name: '가고일', desc: '돌날개를 펴고 일직선으로 돌격합니다.', ai: 'charger', hp: 34, atk: 12, spd: 48, r: 12, exp: 2,
    look: { body: 'round', color: '#9a97a8', color2: '#7d7a8c', pat: ['stone'], ears: 'horns', hornColor: '#7d7a8c', back: ['batwings'], wingColor: '#7d7a8c', eyes: 'glow', eyeColor: '#ff9a5a', mouth: 'fang', blush: false },
  },

  // ── 7. 오크 요새 ─────────────────────
  orc: {
    name: '오크 전사', desc: '쿵쿵 걸어와 도끼로 땅을 내리쳐요.', ai: 'tank', hp: 50, atk: 11, spd: 34, r: 13, exp: 2,
    cd: 3.2, ring: 6, proj: { type: 'rock', color: '#a89a80', speed: 110, r: 5 },
    look: { body: 'round', color: '#7f9a5e', color2: '#a8bf8a', pat: ['belly'], ears: 'goblin', innerEar: '#a8bf8a', eyes: 'angry', mouth: 'tusk', acc: ['hornhelm'], helmColor: '#8a8a96', hold: 'axe' },
  },
  warwolf: {
    name: '전투 늑대', desc: '자세를 낮췄다가 일직선으로 돌격!', ai: 'charger', hp: 30, atk: 11, spd: 52, r: 12, exp: 2,
    look: { body: 'round', color: '#8a8f9e', ears: 'fox', innerEar: '#c8ccd8', back: ['bigtail'], tailColor: '#8a8f9e', eyes: 'angry', mouth: 'fang', acc: ['bandana'], bandColor: '#c0504d' },
  },
  mimic: {
    name: '미믹', desc: '보물 상자인 척하다가 덥석!', ai: 'ambusher', hp: 36, atk: 11, spd: 60, r: 12, exp: 2,
    cd: 2.2, ring: 10, proj: BALL('#ffd166', 130, 5),
    look: { body: 'box', color: '#a8743f', pat: ['planks'], eyes: 'glow', eyeColor: '#ffd166', mouth: 'teeth', blush: false },
  },
  shaman: {
    name: '오크 주술사', desc: '조준선을 그린 뒤 저주 광선을 쏴요.', ai: 'laser', hp: 30, atk: 12, spd: 40, r: 12, exp: 2,
    cd: 3.2, range: 260,
    look: { body: 'round', color: '#7f9a5e', ears: 'goblin', innerEar: '#a8bf8a', eyes: 'glow', eyeColor: '#7ee081', mouth: 'tusk', acc: ['hood'], hoodColor: '#6b4a2f', hold: 'staff', holdColor: '#7ee081' },
  },

  // ── 8. 가라앉은 신전 ─────────────────
  merfolk: {
    name: '어인 병사', desc: '삼지창을 휘두르며 물방울을 쏴요.', ai: 'shooter', hp: 30, atk: 11, spd: 50, r: 12, exp: 2,
    range: 190, cd: 2.0, proj: { type: 'bubble', color: '#bfefff', speed: 120, r: 7 }, count: 3, spread: 0.35,
    look: { body: 'fish', color: '#5fa8c8', color2: '#8fd0e8', pat: ['scales'], back: ['fins'], eyes: 'cute', mouth: 'o', hold: 'trident', holdColor: '#ffd166' },
  },
  jellyfish: {
    name: '찌릿 해파리', desc: '찌릿! 전기 고리를 퍼뜨려요.', ai: 'nova', hp: 26, atk: 11, spd: 46, r: 11, exp: 2,
    cd: 3.0, radius: 75,
    look: { body: 'ghost', color: '#ffb3e6', eyes: 'happy', mouth: 'o', float: true, translucent: true },
  },
  seaserpent: {
    name: '바다뱀', desc: '물살을 타고 쌩하고 돌진!', ai: 'dasher', hp: 26, atk: 13, spd: 60, r: 10, exp: 2,
    dashSpd: 380, dashT: 0.5,
    look: { body: 'tall', color: '#4fae8a', color2: '#7fd0b0', pat: ['scales'], back: ['dragontail'], eyes: 'angry', mouth: 'fang' },
  },
  crabknight: {
    name: '게 기사', desc: '단단한 껍질로 버티며 물거품을 흩뿌려요.', ai: 'tank', hp: 60, atk: 12, spd: 34, r: 13, exp: 2,
    cd: 3.0, ring: 8, proj: { type: 'bubble', color: '#bfefff', speed: 110, r: 6 },
    look: { body: 'wide', color: '#ff6b6b', back: ['claws'], eyes: 'cute', mouth: 'smile', acc: ['helmet'], helmColor: '#9fb3c8', plumeColor: '#5fd3c8' },
  },

  // ── 9. 수정 첨탑 ─────────────────────
  crystalgolem: {
    name: '수정 골렘', desc: '움직이지 않지만 수정 조각을 사방으로!', ai: 'turret', hp: 40, atk: 12, spd: 0, r: 13, exp: 2,
    cd: 2.6, ring: 10, proj: { type: 'spike', color: '#d9c9ff', speed: 125, r: 5 },
    look: { body: 'square', color: '#c9b8ff', color2: '#a08ce0', pat: ['stone'], eyes: 'glow', eyeColor: '#ffffff', mouth: 'none', acc: ['crystals'], crystalColor: '#f0e8ff', blush: false },
  },
  livingarmor: {
    name: '살아있는 갑옷', desc: '텅 빈 투구 속 눈빛. 방패를 앞세워 돌격해요.', ai: 'charger', hp: 40, atk: 13, spd: 50, r: 12, exp: 2,
    look: { body: 'tall', color: '#9fb3c8', color2: '#7d91a8', pat: ['plate'], eyes: 'hollow', eyeColor: '#7ee0ff', mouth: 'none', acc: ['helmet', 'shield'], helmColor: '#7d91a8', plumeColor: '#ff6b6b', shieldColor: '#5f7ba8', hold: 'sword', blush: false },
  },
  lightwisp: {
    name: '빛의 정령', desc: '별가루 속으로 사라졌다 나타나요.', ai: 'blinker', hp: 28, atk: 12, spd: 0, r: 11, exp: 2,
    cd: 2.0, proj: { type: 'star', color: '#fff3b0', speed: 160, r: 6 }, count: 6,
    look: { body: 'star', color: '#fff3b0', eyes: 'happy', mouth: 'o', float: true, pat: ['glow'] },
  },
  manaeye: {
    name: '마나의 눈', desc: '커다란 눈으로 노려본 뒤 마나 광선!', ai: 'laser', hp: 34, atk: 13, spd: 36, r: 12, exp: 2,
    cd: 3.0, range: 280,
    look: { body: 'round', color: '#6b8ae0', eyes: 'one', eyeColor: '#7ee0ff', mouth: 'none', back: ['wings'], float: true, blush: false },
  },

  // ── 10. 악몽의 왕좌 ──────────────────
  nightslime: {
    name: '그림자 슬라임', desc: '어둠으로 물든 슬라임. 쓰러지면 둘로 나뉘어요.', ai: 'chase', hp: 40, atk: 14, spd: 58, r: 12, exp: 3,
    split: 'nightslime',
    look: { body: 'slime', color: '#5b4a8a', ears: 'horns', hornColor: '#2f2650', eyes: 'glow', eyeColor: '#ff6bd6', mouth: 'fang', translucent: true },
  },
  demonbat: {
    name: '악마 박쥐', desc: '어둠 속에서 쏜살같이 덮쳐요.', ai: 'dasher', hp: 30, atk: 14, spd: 70, r: 10, exp: 3,
    look: { body: 'round', color: '#3e335c', ears: 'horns', hornColor: '#ff6bd6', back: ['batwings'], wingColor: '#2a2240', eyes: 'glow', eyeColor: '#ff6bd6', mouth: 'fang', float: true },
  },
  deathknight: {
    name: '데스나이트', desc: '묵직한 걸음, 사방으로 그림자 칼날.', ai: 'tank', hp: 80, atk: 15, spd: 36, r: 13, exp: 3,
    cd: 3.0, ring: 10, proj: BALL('#b06cff', 120, 5),
    look: { body: 'tall', color: '#3d3358', color2: '#2a2240', pat: ['plate'], back: ['cape'], capeColor: '#5a1f3a', eyes: 'hollow', eyeColor: '#ff6bd6', mouth: 'none', acc: ['hornhelm'], helmColor: '#2a2240', hold: 'sword', holdColor: '#b06cff', blush: false },
  },
  nightmareeye: {
    name: '악몽의 눈', desc: '거대한 눈으로 노려본 뒤 레이저!', ai: 'laser', hp: 46, atk: 16, spd: 34, r: 12, exp: 3,
    cd: 2.8, range: 300,
    look: { body: 'round', color: '#2f2650', eyes: 'one', eyeColor: '#ff6bd6', mouth: 'none', back: ['batwings'], wingColor: '#1e1830', float: true, blush: false },
  },
};

// ── 보스 ──────────────────────────────────────────────
// patterns: game/bosses.js 의 패턴 이름. rage: 체력 50% 이하에서 추가되는 패턴
G.BOSSES = {
  goblinchief: {
    name: '고블린 대장 그롬', title: '이끼 낀 지하감옥의 우두머리', hp: 520, atk: 10, spd: 46, r: 34,
    patterns: ['slam', 'summon', 'charge'], rage: ['slam2', 'fan'], minion: 'goblin', bullet: '#c9b27a',
    look: { body: 'round', color: '#7fb85e', color2: '#a8d48a', pat: ['belly'], ears: 'goblin', innerEar: '#a8d48a', eyes: 'angry', mouth: 'tusk', acc: ['hornhelm', 'nose'], helmColor: '#8a8070', hold: 'club' },
  },
  skeletonking: {
    name: '해골 왕 본즈', title: '잠들지 못하는 납골당의 왕', hp: 720, atk: 12, spd: 40, r: 34,
    patterns: ['summon', 'fan', 'slam'], rage: ['ring', 'spiral'], minion: 'skeleton', bullet: '#bfe9ff',
    look: Object.assign({ body: 'round', acc: ['crown'], back: ['cape'], capeColor: '#6a3a7a', hold: 'sword', holdColor: '#e8dcc0' }, SKULL, { eyeColor: '#7ee0ff' }),
  },
  spiderqueen: {
    name: '거미 여왕 아라냐', title: '어둠 속에서 실을 잣는 이', hp: 900, atk: 13, spd: 48, r: 34,
    patterns: ['fan', 'summon', 'rain'], rage: ['spiral', 'charge'], minion: 'spider', bullet: '#e6f5c0',
    look: { body: 'round', color: '#4b3350', color2: '#7a4d7f', pat: ['spots'], back: ['spiderlegs'], eyes: 'many', eyeColor: '#ff6bd6', mouth: 'fang', acc: ['crown'] },
  },
  frostgiant: {
    name: '서리 거인 요툰', title: '얼어붙은 왕좌의 주인', hp: 1100, atk: 14, spd: 50, r: 38,
    patterns: ['charge', 'rain', 'ring'], rage: ['charge', 'nova'], minion: 'frostwolf', bullet: '#dff4ff',
    look: { body: 'round', color: '#f4f8ff', color2: '#bfe6ff', pat: ['belly'], ears: 'horns', hornColor: '#c9d3e6', eyes: 'angry', mouth: 'fang', acc: ['crown'] },
  },
  reddragon: {
    name: '화염룡 이그니스', title: '갱도 깊은 곳의 잠든 불꽃', hp: 1300, atk: 16, spd: 52, r: 36,
    patterns: ['breath', 'rain', 'ring'], rage: ['spiral', 'charge'], minion: 'imp', bullet: '#ff9f1c',
    look: { body: 'round', color: '#ff6b5b', color2: '#ffd166', pat: ['belly'], ears: 'horns', back: ['dragonwings', 'dragontail'], eyes: 'angry', mouth: 'fang' },
  },
  lich: {
    name: '리치 모르테', title: '금지된 책장의 주인', hp: 1500, atk: 17, spd: 50, r: 32,
    patterns: ['spiral', 'summon', 'teleport', 'fan'], rage: ['laser3'], minion: 'grimoire', bullet: '#c3a6ff',
    look: Object.assign({ body: 'round', acc: ['hood', 'crown'], hoodColor: '#4b3d70', back: ['cape'], capeColor: '#2f2650', hold: 'staff', holdColor: '#b06cff' }, SKULL, { color: '#e8e0f0', eyeColor: '#b06cff' }),
  },
  orcwarlord: {
    name: '오크 대족장 고르크', title: '요새의 무쇠 주먹', hp: 1800, atk: 18, spd: 44, r: 40,
    patterns: ['charge', 'summon', 'rain', 'ring'], rage: ['spiral'], minion: 'orc', bullet: '#ffd166',
    look: { body: 'round', color: '#6f8a4e', color2: '#9ab87a', pat: ['belly'], ears: 'goblin', innerEar: '#9ab87a', eyes: 'angry', mouth: 'tusk', acc: ['hornhelm'], helmColor: '#d4a017', hold: 'axe', holdColor: '#c9ced8' },
  },
  kraken: {
    name: '크라켄', title: '가라앉은 신전의 파수꾼', hp: 2100, atk: 19, spd: 42, r: 38,
    patterns: ['laser3', 'spiral', 'summon'], rage: ['ring', 'nova'], minion: 'jellyfish', bullet: '#bfefff',
    look: { body: 'round', color: '#8a5a9e', color2: '#b07cc4', pat: ['spots'], back: ['tentacles'], eyes: 'glow', eyeColor: '#ffe66d', mouth: 'o', acc: ['crown'] },
  },
  ancientgolem: {
    name: '고대 수호자 아스트라', title: '첨탑을 지키는 별의 거인', hp: 2400, atk: 20, spd: 50, r: 36,
    patterns: ['clock', 'spiral', 'rain'], rage: ['laser3'], minion: 'crystalgolem', bullet: '#e6dcff',
    look: { body: 'square', color: '#b8a8f0', color2: '#8f7ad6', pat: ['stone'], eyes: 'glow', eyeColor: '#fff3b0', mouth: 'none', acc: ['crown', 'crystals'], crystalColor: '#fff3b0', blush: false },
  },
  nightmare: {
    name: '악몽왕', title: '잠들지 못한 별의 그림자', hp: 3000, atk: 22, spd: 54, r: 40,
    patterns: ['spiral', 'laser3', 'rain', 'summon', 'nova'], rage: ['clock', 'charge'], minion: 'demonbat', bullet: '#ff6bd6',
    look: { body: 'star', color: '#3a2b5c', eyes: 'glow', eyeColor: '#ff6bd6', mouth: 'grin', acc: ['crown'], back: ['cape'], capeColor: '#5a1f3a', pat: ['stars'], blush: false },
    rageLook: { body: 'star', color: '#fff3b0', eyes: 'sleepy', mouth: 'o', pat: ['glow'], acc: [] },
  },
};
