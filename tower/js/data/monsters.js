'use strict';
// 몬스터 도감. hp/atk는 1층 기준이며 층마다 G.S(층) 배율로 강해집니다.
// ai 종류는 game/ai.js 참고.
const BALL = (color, speed, r) => ({ type: 'ball', color, speed: speed || 130, r: r || 5 });

G.MONSTERS = {
  // ── 1. 새싹 정원 ─────────────────────
  slime: {
    name: '말랑 슬라임', desc: '말랑말랑 다가와 몸통 박치기!', ai: 'chase', hp: 16, atk: 6, spd: 52, r: 11, exp: 1,
    look: { body: 'slime', color: '#86e3a0', ears: 'cat', innerEar: '#c9f5d4', eyes: 'cute', mouth: 'cat', translucent: true },
  },
  mushroom: {
    name: '버섯돌이', desc: '멀리서 포자를 퐁퐁 쏩니다.', ai: 'shooter', hp: 14, atk: 6, spd: 30, r: 11, exp: 1,
    range: 170, cd: 2.4, proj: BALL('#ffe08a', 120, 5),
    look: { body: 'round', color: '#ffe2b8', color2: '#fff6e6', pat: ['belly'], ears: 'mouse', innerEar: '#ffc4c4', eyes: 'dot', mouth: 'cat', acc: ['cap'], capColor: '#ff7b7b', eyeY: 0.15, mouthY: 0.22 },
  },
  bee: {
    name: '붕붕 꿀벌', desc: '잠깐 멈췄다가 쏜살같이 돌진!', ai: 'dasher', hp: 11, atk: 8, spd: 62, r: 9, exp: 1,
    look: { body: 'round', color: '#ffd166', color2: '#4a3a5c', pat: ['stripes'], ears: 'antenna', back: ['wings'], eyes: 'cute', mouth: 'o', float: true },
  },
  sprout: {
    name: '새싹 꼬마', desc: '통통 뛰어올라 쿵 하고 내려앉아요.', ai: 'jumper', hp: 18, atk: 7, spd: 48, r: 11, exp: 1,
    look: { body: 'egg', color: '#c9a27a', color2: '#e8d2b5', pat: ['belly'], ears: 'mouse', innerEar: '#f0c7b0', eyes: 'happy', mouth: 'cat', acc: ['sprout'] },
  },

  // ── 2. 달콤 과자숲 ───────────────────
  cookie: {
    name: '진저 쿠키 병정', desc: '자리를 잡고 일직선으로 돌격합니다.', ai: 'charger', hp: 20, atk: 8, spd: 46, r: 12, exp: 1,
    look: { body: 'square', color: '#d99058', ears: 'bear', pat: ['icing'], eyes: 'button', mouth: 'smile' },
  },
  macaron: {
    name: '마카롱 박쥐', desc: '물결처럼 날아오며 크림을 뿌려요.', ai: 'flyer', hp: 13, atk: 7, spd: 58, r: 10, exp: 1,
    cd: 2.8, proj: BALL('#fff3e0', 120, 5),
    look: { body: 'round', color: '#a8dcff', color2: '#fff3e0', pat: ['macaron'], back: ['batwings'], wingColor: '#ff9fc4', eyes: 'cute', mouth: 'fang', float: true },
  },
  cottonghost: {
    name: '솜사탕 유령', desc: '뿅 사라졌다 나타나 사탕을 던져요.', ai: 'blinker', hp: 15, atk: 7, spd: 0, r: 11, exp: 1,
    cd: 2.6, proj: BALL('#ff8fab', 140, 5), count: 3,
    look: { body: 'ghost', color: '#ffc6e5', ears: 'bunny', innerEar: '#ffe3f1', eyes: 'happy', mouth: 'o', float: true, pat: ['sprinkles'] },
  },
  gummybear: {
    name: '말랑 곰젤리', desc: '젤리 몸으로 폴짝폴짝 덮쳐요.', ai: 'jumper', hp: 22, atk: 8, spd: 52, r: 11, exp: 1,
    look: { body: 'round', color: '#ff7b9c', ears: 'bear', eyes: 'cute', mouth: 'cat', translucent: true },
  },

  // ── 3. 모래시계 사막 ─────────────────
  cactus: {
    name: '선인장 꿍', desc: '움직이지 않지만 가시를 사방으로!', ai: 'turret', hp: 30, atk: 8, spd: 0, r: 12, exp: 2,
    cd: 2.8, ring: 8, proj: { type: 'spike', color: '#bff08a', speed: 115, r: 5 },
    look: { body: 'tall', color: '#6cc56f', pat: ['needles'], eyes: 'dot', mouth: 'smile', acc: ['bow'], bowColor: '#ff8fab' },
  },
  scorpion: {
    name: '모래 전갈', desc: '모래 속에 숨었다 발밑에서 튀어나와요.', ai: 'burrower', hp: 22, atk: 9, spd: 70, r: 11, exp: 2,
    look: { body: 'wide', color: '#e7a85f', back: ['stinger', 'claws'], eyes: 'angry', mouth: 'zig' },
  },
  mummycat: {
    name: '미라냥', desc: '느릿느릿, 하지만 엄청 튼튼해요.', ai: 'tank', hp: 55, atk: 9, spd: 28, r: 13, exp: 2,
    cd: 3.5, ring: 6, proj: BALL('#e8dcc0', 100, 5),
    look: { body: 'round', color: '#f2ead3', pat: ['bandage'], ears: 'cat', eyes: 'glow', eyeColor: '#7ee081', mouth: 'cat' },
  },
  dustspirit: {
    name: '모래바람 정령', desc: '빙글빙글 날아다니며 모래를 뿌려요.', ai: 'flyer', hp: 16, atk: 8, spd: 66, r: 10, exp: 1,
    cd: 2.2, proj: BALL('#f0c674', 150, 4),
    look: { body: 'ghost', color: '#efcf8f', ears: 'fox', innerEar: '#fff1cf', eyes: 'sleepy', mouth: 'cat', float: true },
  },

  // ── 4. 눈꽃 설원 ─────────────────────
  snowman: {
    name: '꼬마 눈사람', desc: '눈덩이를 던져 발을 느리게 해요.', ai: 'shooter', hp: 24, atk: 8, spd: 26, r: 12, exp: 2,
    range: 190, cd: 2.2, proj: { type: 'ball', color: '#ffffff', speed: 140, r: 6, slow: 0.35 }, count: 2, spread: 0.25,
    look: { body: 'round', color: '#ffffff', ears: 'bear', eyes: 'dot', mouth: 'smile', acc: ['beanie', 'carrot'], hatColor: '#ff6b8b' },
  },
  babypenguin: {
    name: '아기 펭귄', desc: '배로 미끄러지며 길게 돌진!', ai: 'dasher', hp: 20, atk: 9, spd: 50, r: 11, exp: 2,
    dashSpd: 360, dashT: 0.6,
    look: { body: 'tall', color: '#4a5878', color2: '#ffffff', pat: ['belly'], eyes: 'cute', mouth: 'none', acc: ['beak'] },
  },
  icewisp: {
    name: '얼음 정령', desc: '모였다가 얼음 고리를 펑!', ai: 'nova', hp: 18, atk: 10, spd: 55, r: 10, exp: 2,
    cd: 3.2, radius: 70,
    look: { body: 'star', color: '#a5ecff', eyes: 'happy', mouth: 'o', float: true, pat: ['glow'] },
  },
  snowbunny: {
    name: '눈토끼', desc: '깡충깡충 빠르게 뛰어와요.', ai: 'jumper', hp: 20, atk: 9, spd: 64, r: 10, exp: 2,
    look: { body: 'round', color: '#f7fbff', ears: 'bunny', innerEar: '#bfe6ff', eyes: 'cute', mouth: 'cat' },
  },

  // ── 5. 보글 화산 ─────────────────────
  fireimp: {
    name: '불씨 도깨비', desc: '달려와서 펑! 하고 터져요.', ai: 'bomber', hp: 14, atk: 16, spd: 78, r: 10, exp: 2,
    radius: 52,
    look: { body: 'round', color: '#ff7b54', ears: 'horns', back: ['foxtail'], tailColor: '#ff7b54', eyes: 'angry', mouth: 'grin', acc: ['flame'] },
  },
  lavasnail: {
    name: '용암 달팽이', desc: '지나간 자리에 뜨거운 용암이 남아요.', ai: 'trailer', hp: 40, atk: 9, spd: 30, r: 12, exp: 2,
    look: { body: 'wide', color: '#ffb36b', back: ['shell'], shellColor: '#ff5e5b', eyes: 'sleepy', mouth: 'cat', acc: [] },
  },
  firebat: {
    name: '화산 박쥐', desc: '날아다니며 불꽃을 쏴요.', ai: 'flyer', hp: 18, atk: 9, spd: 70, r: 10, exp: 2,
    cd: 2.0, proj: { type: 'fire', color: '#ff9f1c', speed: 160, r: 5 },
    look: { body: 'round', color: '#7a4b6b', back: ['batwings'], wingColor: '#5a3550', eyes: 'glow', eyeColor: '#ffb347', mouth: 'fang', float: true },
  },
  magmaslime: {
    name: '마그마 슬라임', desc: '쓰러지면 불바다를 남겨요.', ai: 'chase', hp: 30, atk: 10, spd: 50, r: 12, exp: 2,
    deathZone: true,
    look: { body: 'slime', color: '#ff6b5b', ears: 'cat', innerEar: '#ffb36b', pat: ['lavaglow'], eyes: 'angry', mouth: 'cat', translucent: true },
  },

  // ── 6. 유령 도서관 ───────────────────
  flybook: {
    name: '날아다니는 책', desc: '책장을 펄럭이며 페이지를 날려요.', ai: 'flyer', hp: 20, atk: 9, spd: 60, r: 11, exp: 2,
    cd: 2.0, proj: { type: 'page', color: '#fffaf0', speed: 150, r: 6 }, count: 2, spread: 0.3,
    look: { body: 'book', color: '#7b5ea7', pat: ['pages'], eyes: 'cute', mouth: 'grin', float: true },
  },
  candleghost: {
    name: '촛불 유령', desc: '순간이동하며 불씨를 뿌려요.', ai: 'blinker', hp: 20, atk: 9, spd: 0, r: 11, exp: 2,
    cd: 2.4, proj: { type: 'fire', color: '#ffb347', speed: 150, r: 5 }, count: 5,
    look: { body: 'ghost', color: '#f6f0ff', ears: 'cat', innerEar: '#e2d6ff', eyes: 'sleepy', mouth: 'cat', acc: ['candle'], float: true },
  },
  inkslime: {
    name: '잉크 슬라임', desc: '끈적한 잉크 웅덩이를 남겨요.', ai: 'trailer', hp: 30, atk: 9, spd: 48, r: 12, exp: 2,
    trail: 'ink',
    look: { body: 'slime', color: '#5a5694', ears: 'mouse', innerEar: '#9d98d9', eyes: 'cute', mouth: 'o', translucent: true },
  },
  quillknight: {
    name: '깃펜 기사', desc: '날카로운 깃펜을 조준해 던져요.', ai: 'shooter', hp: 26, atk: 10, spd: 40, r: 12, exp: 2,
    range: 210, cd: 1.8, proj: { type: 'feather', color: '#7ed9c3', speed: 210, r: 5 },
    look: { body: 'tall', color: '#fffaf0', eyes: 'angry', mouth: 'none', acc: ['helmet', 'feather', 'beak'], helmColor: '#b9a6ff', plumeColor: '#7ed9c3' },
  },

  // ── 7. 태엽 장난감 공장 ──────────────
  windupsoldier: {
    name: '태엽 병정', desc: '뚜벅뚜벅 행진하며 콩알탄을 쏴요.', ai: 'chase', hp: 32, atk: 10, spd: 44, r: 12, exp: 2,
    cd: 2.4, proj: BALL('#ffd166', 150, 4),
    look: { body: 'tall', color: '#d9d2e6', color2: '#ef5f7f', pat: ['belly'], ears: 'mouse', innerEar: '#ffb3c6', back: ['windkey'], eyes: 'button', mouth: 'cat', acc: ['soldierHat'] },
  },
  jackbox: {
    name: '깜짝상자', desc: '가까이 가면 깜짝! 튀어나와요.', ai: 'ambusher', hp: 36, atk: 11, spd: 60, r: 12, exp: 2,
    cd: 2.2, ring: 10, proj: BALL('#ff8fab', 130, 5),
    look: { body: 'box', color: '#ffd166', eyes: 'happy', mouth: 'grin', acc: ['bow'], bowColor: '#4fa3ff' },
  },
  toytank: {
    name: '장난감 탱크', desc: '커다란 포탄을 쿵쿵 쏴요.', ai: 'shooter', hp: 42, atk: 13, spd: 28, r: 13, exp: 2,
    range: 230, cd: 2.8, proj: { type: 'ball', color: '#5c7a4f', speed: 110, r: 9, boom: 40 },
    look: { body: 'box', color: '#8fc97a', eyes: 'dot', mouth: 'smile', acc: ['cannon'] },
  },
  robo: {
    name: '꼬마 로봇', desc: '조준선을 그린 뒤 레이저 발사!', ai: 'laser', hp: 30, atk: 12, spd: 40, r: 12, exp: 2,
    cd: 3.2, range: 260,
    look: { body: 'square', color: '#b8c4d9', ears: 'cat', innerEar: '#8fa0bd', eyes: 'glow', eyeColor: '#6ef0ff', mouth: 'cat', blush: false },
  },

  // ── 8. 물방울 수족관 ─────────────────
  jellyfish: {
    name: '말랑 해파리', desc: '찌릿! 전기 고리를 퍼뜨려요.', ai: 'nova', hp: 26, atk: 11, spd: 46, r: 11, exp: 2,
    cd: 3.0, radius: 75,
    look: { body: 'ghost', color: '#ffb3e6', eyes: 'happy', mouth: 'o', float: true, translucent: true },
  },
  puffer: {
    name: '빵빵 복어', desc: '부풀어 오르면 가시가 사방으로!', ai: 'bomber', hp: 24, atk: 14, spd: 60, r: 11, exp: 2,
    radius: 46, ring: 10, proj: { type: 'spike', color: '#ffe066', speed: 140, r: 5 },
    look: { body: 'round', color: '#ffe066', back: ['spikes'], spikeColor: '#e0b33a', eyes: 'cute', mouth: 'o', back2: true },
  },
  angler: {
    name: '반짝 아귀', desc: '등불로 유혹하고 돌진해요.', ai: 'charger', hp: 34, atk: 13, spd: 50, r: 12, exp: 2,
    look: { body: 'fish', color: '#4f6d9a', back: ['fins'], eyes: 'cute', mouth: 'fang', acc: ['lure'] },
  },
  crab: {
    name: '꽃게 장군', desc: '옆걸음으로 비눗방울을 쏴요.', ai: 'shooter', hp: 30, atk: 11, spd: 50, r: 12, exp: 2,
    range: 180, cd: 2.0, proj: { type: 'bubble', color: '#bfefff', speed: 120, r: 7 }, count: 3, spread: 0.35,
    look: { body: 'wide', color: '#ff6b6b', back: ['claws'], eyes: 'cute', mouth: 'smile' },
  },

  // ── 9. 별빛 천문대 ───────────────────
  shootingstar: {
    name: '별똥별', desc: '반짝 빛나더니 쌩하고 날아와요.', ai: 'dasher', hp: 26, atk: 13, spd: 60, r: 10, exp: 2,
    dashSpd: 400, dashT: 0.5,
    look: { body: 'star', color: '#ffe66d', eyes: 'happy', mouth: 'cat', float: true },
  },
  moonbunny: {
    name: '달토끼', desc: '떡방아로 만든 찹쌀떡을 던져요.', ai: 'shooter', hp: 30, atk: 12, spd: 48, r: 11, exp: 2,
    range: 200, cd: 1.9, proj: BALL('#ffffff', 160, 6), count: 3, spread: 0.2,
    look: { body: 'round', color: '#f3f0ff', ears: 'bunny', innerEar: '#ffd6e0', eyes: 'cute', mouth: 'cat', acc: ['moonpin'] },
  },
  nebula: {
    name: '성운 정령', desc: '별가루 속으로 사라졌다 나타나요.', ai: 'blinker', hp: 28, atk: 12, spd: 0, r: 11, exp: 2,
    cd: 2.0, proj: { type: 'star', color: '#c3a6ff', speed: 160, r: 6 }, count: 6,
    look: { body: 'ghost', color: '#9d8df1', ears: 'cat', innerEar: '#c9bfff', pat: ['stars'], eyes: 'glow', eyeColor: '#fff3b0', mouth: 'cat', float: true },
  },
  clockbird: {
    name: '뻐꾸기 시계새', desc: '째깍째깍, 정해진 박자로 깃털을 쏴요.', ai: 'flyer', hp: 26, atk: 12, spd: 64, r: 11, exp: 2,
    cd: 1.6, proj: { type: 'feather', color: '#ffd23f', speed: 170, r: 5 },
    look: { body: 'round', color: '#d9b45a', pat: ['clock'], back: ['wings'], eyes: 'cute', mouth: 'none', acc: ['beak'], float: true },
  },

  // ── 10. 꿈의 정점 ────────────────────
  nightslime: {
    name: '악몽 슬라임', desc: '어둠으로 물든 슬라임. 쓰러지면 둘로 나뉘어요.', ai: 'chase', hp: 40, atk: 14, spd: 58, r: 12, exp: 3,
    split: 'nightslime',
    look: { body: 'slime', color: '#5b4a8a', ears: 'horns', hornColor: '#2f2650', eyes: 'glow', eyeColor: '#ff6bd6', mouth: 'fang', translucent: true },
  },
  nightbat: {
    name: '악몽 박쥐', desc: '어둠 속에서 쏜살같이 덮쳐요.', ai: 'dasher', hp: 30, atk: 14, spd: 70, r: 10, exp: 3,
    look: { body: 'round', color: '#3e335c', back: ['batwings'], wingColor: '#2a2240', eyes: 'glow', eyeColor: '#ff6bd6', mouth: 'fang', float: true },
  },
  shadowknight: {
    name: '그림자 기사', desc: '묵직한 걸음, 사방으로 그림자 칼날.', ai: 'tank', hp: 80, atk: 15, spd: 36, r: 13, exp: 3,
    cd: 3.0, ring: 10, proj: BALL('#b06cff', 120, 5),
    look: { body: 'tall', color: '#4b3d70', ears: 'fox', innerEar: '#2f2650', back: ['bigtail'], tailColor: '#4b3d70', eyes: 'glow', eyeColor: '#c3a6ff', mouth: 'fang', acc: ['helmet'], helmColor: '#2f2650', plumeColor: '#b06cff', blush: false },
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
  puddingking: {
    name: '푸딩 임금님', title: '흔들흔들 새싹 정원의 왕', hp: 520, atk: 10, spd: 46, r: 34,
    patterns: ['slam', 'ring', 'summon'], rage: ['slam2'], minion: 'slime', bullet: '#ffcf70',
    look: { body: 'slime', color: '#ffd480', color2: '#a0522d', ears: 'cat', innerEar: '#ffeab8', pat: ['caramel'], eyes: 'cute', mouth: 'grin', acc: ['crown'], translucent: true },
  },
  cakegolem: {
    name: '생크림 대장', title: '세 겹 케이크 거인', hp: 720, atk: 12, spd: 40, r: 36,
    patterns: ['fan', 'nova', 'rain'], rage: ['spiral'], minion: 'cookie', bullet: '#ff8fab',
    look: { body: 'square', color: '#fff6ee', color2: '#ffb3c6', ears: 'bear', innerEar: '#ffb3c6', pat: ['frosting', 'sprinkles'], eyes: 'angry', mouth: 'grin', acc: ['candle', 'cherry'] },
  },
  sphinx: {
    name: '냥크스', title: '수수께끼를 내는 모래 고양이', hp: 900, atk: 13, spd: 48, r: 34,
    patterns: ['laser', 'spiral', 'teleport'], rage: ['summon', 'laser3'], minion: 'mummycat', bullet: '#f0c674',
    look: { body: 'round', color: '#f4c95d', ears: 'cat', eyes: 'glow', eyeColor: '#7ee0ff', mouth: 'cat', acc: ['pharaoh'] },
  },
  yeti: {
    name: '털복숭이 설왕', title: '외로운 눈보라의 왕', hp: 1100, atk: 14, spd: 50, r: 38,
    patterns: ['charge', 'rain', 'ring'], rage: ['charge', 'nova'], minion: 'snowbunny', bullet: '#dff4ff',
    look: { body: 'round', color: '#f4f8ff', color2: '#bfe6ff', pat: ['belly'], ears: 'horns', hornColor: '#c9d3e6', eyes: 'angry', mouth: 'fang', acc: ['crown'] },
  },
  ignis: {
    name: '꼬마 화염룡 이그니스', title: '너무 빨리 커버린 꿈', hp: 1300, atk: 16, spd: 52, r: 36,
    patterns: ['breath', 'rain', 'ring'], rage: ['spiral', 'charge'], minion: 'fireimp', bullet: '#ff9f1c',
    look: { body: 'round', color: '#ff6b5b', color2: '#ffd166', pat: ['belly'], ears: 'horns', back: ['dragonwings', 'dragontail'], eyes: 'angry', mouth: 'fang' },
  },
  libra: {
    name: '책벌레 마녀 리브라', title: '읽히지 못한 이야기들의 주인', hp: 1500, atk: 17, spd: 50, r: 32,
    patterns: ['spiral', 'summon', 'teleport', 'fan'], rage: ['laser3'], minion: 'flybook', bullet: '#fffaf0',
    look: { body: 'round', color: '#c7a6f0', ears: 'cat', innerEar: '#ffd6f0', back: ['cattail'], tailColor: '#c7a6f0', eyes: 'cute', mouth: 'cat', acc: ['glasses', 'witchHat'], hatColor: '#4b3d70', bandColor: '#7ed9c3' },
  },
  teddymachine: {
    name: '테디 머신', title: '멈춰버린 장난감 공장의 심장', hp: 1800, atk: 18, spd: 44, r: 40,
    patterns: ['charge', 'summon', 'rain', 'ring'], rage: ['spiral'], minion: 'windupsoldier', bullet: '#ffd166',
    look: { body: 'round', color: '#c49a6c', color2: '#e8d2b5', pat: ['belly', 'stitches'], ears: 'bear', back: ['windkey'], eyes: 'button', mouth: 'cat' },
  },
  octoking: {
    name: '왕문어 꾸물', title: '깊은 바다의 등대지기', hp: 2100, atk: 19, spd: 42, r: 38,
    patterns: ['laser3', 'spiral', 'summon'], rage: ['ring', 'nova'], minion: 'jellyfish', bullet: '#bfefff',
    look: { body: 'round', color: '#e56b9f', back: ['tentacles'], pat: ['spots'], color2: '#f59bc0', eyes: 'cute', mouth: 'o', acc: ['captain'] },
  },
  chronoowl: {
    name: '시간의 부엉이 크로노', title: '멈춘 시계탑의 파수꾼', hp: 2400, atk: 20, spd: 50, r: 36,
    patterns: ['clock', 'spiral', 'teleport', 'rain'], rage: ['laser3'], minion: 'clockbird', bullet: '#ffe66d',
    look: { body: 'round', color: '#7d6b94', color2: '#d8cce8', pat: ['belly', 'clock'], ears: 'owl', eyes: 'big', mouth: 'none', acc: ['beak', 'monocle'] },
  },
  nightmare: {
    name: '악몽왕', title: '잠들지 못한 별의 그림자', hp: 3000, atk: 22, spd: 54, r: 40,
    patterns: ['spiral', 'laser3', 'rain', 'summon', 'nova'], rage: ['clock', 'charge'], minion: 'nightbat', bullet: '#ff6bd6',
    look: { body: 'star', color: '#3a2b5c', eyes: 'glow', eyeColor: '#ff6bd6', mouth: 'grin', acc: ['crown'], pat: ['stars'], blush: false },
    rageLook: { body: 'star', color: '#fff3b0', eyes: 'sleepy', mouth: 'o', pat: ['glow'], acc: [] },
  },
};
