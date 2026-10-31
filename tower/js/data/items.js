'use strict';
// 장비: 5개 부위 × 10개 테마(스테이지) × 부위별 4종 + 무기 7종 + 전설 고유 장비
G.SLOTS = ['weapon', 'hat', 'armor', 'shoes', 'acc'];
G.SLOT_NAMES = { weapon: '무기', hat: '모자', armor: '옷', shoes: '신발', acc: '장신구' };

G.RARITIES = [
  { id: 0, name: '일반', color: '#a8a3b5', mul: 1.0, affix: 0, w: 52 },
  { id: 1, name: '고급', color: '#5cc26a', mul: 1.25, affix: 1, w: 30 },
  { id: 2, name: '희귀', color: '#4fa3ff', mul: 1.55, affix: 2, w: 13 },
  { id: 3, name: '영웅', color: '#b06cff', mul: 1.95, affix: 3, w: 4.2 },
  { id: 4, name: '전설', color: '#ff9f1c', mul: 2.5, affix: 3, w: 0.9 },
  { id: 5, name: '신화', color: '#ff4d6d', mul: 3.2, affix: 4, w: 0.15 },
];

// 무기마다 휘두르는 방식이 완전히 다릅니다. (game/player.js 의 휘두르기 엔진이 combo 를 차례로 재생)
// combo 한 동작: type(arc 부채꼴 베기 · thrust 찌르기 · spin 회전 · smash 내려찍기 · whip 채찍)
//   arc 휘두르는 각도(라디안, 음수면 반대 방향), range 사거리, mul 피해 배율, lunge 앞으로 내딛는 거리,
//   w 찌르기 폭, aoe 내려찍기 범위, knock 넉백, t 동작 시간 배율
G.WEAPONS = {
  sword: {
    name: '검', icon: '🗡️', kind: 'swing', atkMul: 1.0, rate: 2.1, len: 1.7, parry: true,
    desc: '베기 → 되베기 → 찌르기 3연격 · 적의 탄환을 베어냄',
    combo: [{ type: 'arc', arc: 2.1, range: 46, mul: 1.0 }, { type: 'arc', arc: -2.1, range: 46, mul: 1.0 }, { type: 'thrust', range: 60, w: 18, mul: 1.5, lunge: 12, t: 1.2 }],
  },
  greatsword: {
    name: '대검', icon: '⚔️', kind: 'swing', atkMul: 1.65, rate: 1.0, len: 2.3, parry: true,
    desc: '크고 느린 2연 베기 + 회전 베기 · 강한 넉백',
    combo: [{ type: 'arc', arc: 2.6, range: 60, mul: 1.0, knock: 230 }, { type: 'arc', arc: -2.6, range: 60, mul: 1.0, knock: 230 }, { type: 'spin', range: 64, mul: 1.5, knock: 260, t: 1.4 }],
  },
  dagger: {
    name: '단검', icon: '🔪', kind: 'swing', atkMul: 0.5, rate: 4.2, len: 1.1, crit: 0.12,
    desc: '아주 빠른 4연격 · 치명타 확률 +12%',
    combo: [{ type: 'thrust', range: 34, w: 14, mul: 1.0 }, { type: 'thrust', range: 34, w: 14, mul: 1.0 }, { type: 'arc', arc: 1.7, range: 34, mul: 1.1 }, { type: 'thrust', range: 42, w: 16, mul: 1.6, lunge: 16, t: 1.2 }],
  },
  spear: {
    name: '창', icon: '🔱', kind: 'swing', atkMul: 1.15, rate: 1.6, len: 2.5,
    desc: '멀리 찌르는 2연 찌르기 + 휩쓸기 · 일직선 관통',
    combo: [{ type: 'thrust', range: 84, w: 16, mul: 1.0 }, { type: 'thrust', range: 84, w: 16, mul: 1.0 }, { type: 'arc', arc: 1.6, range: 76, mul: 1.3, t: 1.2 }],
  },
  axe: {
    name: '도끼', icon: '🪓', kind: 'swing', atkMul: 1.35, rate: 1.35, len: 1.8,
    desc: '묵직한 2연 찍기 + 회오리 베기',
    combo: [{ type: 'arc', arc: 2.3, range: 50, mul: 1.0 }, { type: 'arc', arc: -2.3, range: 50, mul: 1.0 }, { type: 'spin', range: 56, mul: 1.6, t: 1.3 }],
  },
  hammer: {
    name: '망치', icon: '🔨', kind: 'swing', atkMul: 2.0, rate: 0.85, len: 1.8,
    desc: '느리지만 땅을 울리는 내려찍기 · 범위 피해 · 가끔 기절',
    combo: [{ type: 'smash', range: 44, aoe: 52, mul: 1.0 }, { type: 'smash', range: 46, aoe: 64, mul: 1.35, t: 1.25 }],
  },
  scythe: {
    name: '낫', icon: '🌙', kind: 'swing', atkMul: 1.15, rate: 1.15, len: 2.2, vamp: 0.02,
    desc: '아주 넓게 휩쓰는 베기 · 피해의 2% 흡혈',
    combo: [{ type: 'arc', arc: 3.6, range: 60, mul: 1.0 }, { type: 'arc', arc: -3.6, range: 60, mul: 1.0 }, { type: 'spin', range: 64, mul: 1.3, t: 1.2 }],
  },
  rapier: {
    name: '레이피어', icon: '🤺', kind: 'swing', atkMul: 0.85, rate: 2.9, len: 2.0, critDmg: 0.3,
    desc: '빠르고 정확한 찌르기 · 마지막 일격은 돌진 · 치명타 피해 +30%',
    combo: [{ type: 'thrust', range: 66, w: 11, mul: 1.0 }, { type: 'thrust', range: 66, w: 11, mul: 1.0 }, { type: 'thrust', range: 74, w: 13, mul: 1.8, lunge: 26, t: 1.3 }],
  },
  gauntlet: {
    name: '건틀릿', icon: '🥊', kind: 'swing', atkMul: 0.55, rate: 4.6, len: 0.9,
    desc: '눈에 안 보이는 주먹 연타 + 어퍼컷 · 강한 넉백',
    combo: [{ type: 'thrust', range: 28, w: 24, mul: 1.0, knock: 120 }, { type: 'thrust', range: 28, w: 24, mul: 1.0, knock: 120 }, { type: 'thrust', range: 28, w: 24, mul: 1.0, knock: 120 }, { type: 'smash', range: 26, aoe: 36, mul: 2.2, knock: 260, t: 1.4 }],
  },
  whip: {
    name: '채찍', icon: '〰️', kind: 'swing', atkMul: 1.0, rate: 1.5, len: 1.4,
    desc: '아주 긴 휘감기 · 끝부분에 맞으면 피해 1.5배',
    combo: [{ type: 'whip', arc: 1.3, range: 96, mul: 1.0 }, { type: 'whip', arc: -1.3, range: 96, mul: 1.0 }],
  },
  bow: {
    name: '활', icon: '🏹', kind: 'proj', atkMul: 0.95, rate: 1.7, len: 1.6, range: 330, proj: 'arrow', speed: 480,
    desc: '빠르고 곧은 화살 · 멀리서 안전하게',
  },
  staff: {
    name: '지팡이', icon: '🪄', kind: 'proj', atkMul: 1.25, rate: 1.05, len: 2.0, range: 300, proj: 'orb', speed: 250, homing: 5, aoe: 26,
    desc: '적을 쫓아가 터지는 마법 구슬 · 작은 범위 피해',
  },
};
// 예전 저장의 무기 종류를 새 종류로
G.WEAPON_RENAME = { wand: 'staff', boomerang: 'axe', watergun: 'bow' };

// 층(스테이지)별 장비 이름 접두어와 색
G.THEMES = [
  { prefix: '이끼 낀', color: '#8a9a6a' },
  { prefix: '뼈', color: '#e8dcc0' },
  { prefix: '거미줄', color: '#b8a8c8' },
  { prefix: '서리', color: '#7cc8f2' },
  { prefix: '화염', color: '#ff6b4a' },
  { prefix: '마도', color: '#a98be8' },
  { prefix: '무쇠', color: '#9aa3b0' },
  { prefix: '심해', color: '#4fb3c8' },
  { prefix: '수정', color: '#d0c0ff' },
  { prefix: '악몽', color: '#b06cff' },
];

G.GEAR_VARIANTS = {
  hat: ['모자', '두건', '투구', '왕관'],
  armor: ['가죽 갑옷', '망토', '판금 갑옷', '로브'],
  shoes: ['장화', '샌들', '각반', '부츠'],
  acc: ['반지', '목걸이', '부적', '브로치'],
};

// ── 보석: 장비 홈에 끼워 보조 능력치를 올려요. 같은 보석 3개 → 한 등급 위 (최대 5등급) ──
G.GEMS = {
  ruby: { name: '루비', color: '#ff4d6d', stat: 'critDmg', vals: [0.06, 0.1, 0.15, 0.21, 0.3] },
  topaz: { name: '토파즈', color: '#ffb347', stat: 'crit', vals: [0.015, 0.025, 0.035, 0.05, 0.07] },
  emerald: { name: '에메랄드', color: '#3fcf8e', stat: 'aspd', vals: [0.03, 0.05, 0.08, 0.11, 0.15] },
  aquamarine: { name: '아쿠아마린', color: '#5fd3f3', stat: 'move', vals: [0.02, 0.035, 0.05, 0.07, 0.1] },
  amethyst: { name: '자수정', color: '#b06cff', stat: 'vamp', vals: [0.006, 0.01, 0.015, 0.021, 0.03] },
  sapphire: { name: '사파이어', color: '#4f7bff', stat: 'cdr', vals: [0.025, 0.04, 0.06, 0.085, 0.12] },
  diamond: { name: '다이아몬드', color: '#e8f6ff', stat: 'dmgRed', vals: [0.02, 0.035, 0.05, 0.07, 0.1] },
  onyx: { name: '오닉스', color: '#4a3f5c', stat: 'dodge', vals: [0.015, 0.025, 0.035, 0.05, 0.07] },
};
G.GEM_GRADE_NAMES = ['조각난', '거친', '다듬은', '빛나는', '완벽한'];
G.GEM_SOCKETS = [0, 1, 1, 2, 2, 3]; // 장비 등급별 보석 홈 수

// 능력치 표시 이름과 형식
G.STAT_INFO = {
  atk: { name: '공격력', fmt: 'int' },
  hp: { name: '체력', fmt: 'int' },
  def: { name: '방어력', fmt: 'int' },
  atkP: { name: '공격력', fmt: 'pct' },
  hpP: { name: '체력', fmt: 'pct' },
  defP: { name: '방어력', fmt: 'pct' },
  aspd: { name: '공격 속도', fmt: 'pct' },
  crit: { name: '치명타 확률', fmt: 'pct' },
  critDmg: { name: '치명타 피해', fmt: 'pct' },
  move: { name: '이동 속도', fmt: 'pct' },
  vamp: { name: '흡혈', fmt: 'pct' },
  goldP: { name: '골드 획득', fmt: 'pct' },
  expP: { name: '경험치', fmt: 'pct' },
  cdr: { name: '스킬 쿨다운 감소', fmt: 'pct' },
  bossDmg: { name: '보스·엘리트 피해', fmt: 'pct' },
  skillDmg: { name: '스킬 피해', fmt: 'pct' },
  burn: { name: '화상 확률', fmt: 'pct' },
  frost: { name: '둔화 확률', fmt: 'pct' },
  shock: { name: '연쇄 번개 확률', fmt: 'pct' },
  poison: { name: '중독 확률', fmt: 'pct' },
  regen: { name: '초당 회복', fmt: 'pct' },
  dodge: { name: '회피', fmt: 'pct' },
  luck: { name: '행운', fmt: 'pct' },
  allyDmg: { name: '펫 피해', fmt: 'pct' },
  dmgRed: { name: '받는 피해 감소', fmt: 'pct' },
};

// 랜덤 옵션 (min~max는 영웅 등급 기준, 등급에 따라 보정)
G.AFFIXES = [
  { stat: 'atkP', min: 0.04, max: 0.1, w: 10 },
  { stat: 'hpP', min: 0.05, max: 0.12, w: 10 },
  { stat: 'defP', min: 0.05, max: 0.12, w: 7 },
  { stat: 'aspd', min: 0.03, max: 0.08, w: 8 },
  { stat: 'crit', min: 0.02, max: 0.05, w: 8 },
  { stat: 'critDmg', min: 0.08, max: 0.2, w: 7 },
  { stat: 'move', min: 0.02, max: 0.06, w: 5 },
  { stat: 'vamp', min: 0.01, max: 0.025, w: 4 },
  { stat: 'goldP', min: 0.06, max: 0.15, w: 5 },
  { stat: 'expP', min: 0.05, max: 0.12, w: 5 },
  { stat: 'cdr', min: 0.03, max: 0.07, w: 4 },
  { stat: 'bossDmg', min: 0.05, max: 0.14, w: 5 },
  { stat: 'skillDmg', min: 0.06, max: 0.16, w: 4 },
  { stat: 'burn', min: 0.04, max: 0.1, w: 3 },
  { stat: 'frost', min: 0.04, max: 0.1, w: 3 },
  { stat: 'shock', min: 0.03, max: 0.08, w: 3 },
  { stat: 'poison', min: 0.04, max: 0.1, w: 3 },
  { stat: 'regen', min: 0.001, max: 0.003, w: 3 },
  { stat: 'dodge', min: 0.02, max: 0.05, w: 3 },
  { stat: 'allyDmg', min: 0.08, max: 0.2, w: 3 },
];

// 전설/신화 등급에서만 나오는 고유 장비. effect는 game/ 쪽에서 처리
G.UNIQUES = [
  { id: 'excalnyang', slot: 'weapon', wtype: 'sword', name: '엑스칼냥', effect: 'swordWave', desc: '휘두를 때마다 커다란 검기를 날립니다.' },
  { id: 'giantcleaver', slot: 'weapon', wtype: 'greatsword', name: '거인의 대검', effect: 'quake', desc: '회전 베기가 끝나면 주변에 충격파가 퍼집니다.' },
  { id: 'shadowfang', slot: 'weapon', wtype: 'dagger', name: '그림자 송곳니', effect: 'shadowStrike', desc: '치명타가 터지면 그림자가 한 번 더 찌릅니다.' },
  { id: 'viperspear', slot: 'weapon', wtype: 'spear', name: '독사의 창', effect: 'doublePoison', desc: '찌를 때마다 중독을 2번 겁니다.' },
  { id: 'kingaxe', slot: 'weapon', wtype: 'axe', name: '오크 왕의 도끼', effect: 'axeThrow', desc: '회오리 베기 때 작은 도끼 4개가 날아갑니다.' },
  { id: 'mjolnyang', slot: 'weapon', wtype: 'hammer', name: '천둥망치 묠냥', effect: 'hammerBolt', desc: '내려찍을 때 30% 확률로 번개가 떨어집니다.' },
  { id: 'bloodmoon', slot: 'weapon', wtype: 'scythe', name: '핏빛 초승달', effect: 'reap', desc: '적을 쓰러뜨릴 때마다 체력 2% 회복.' },
  { id: 'windrapier', slot: 'weapon', wtype: 'rapier', name: '바람의 레이피어', effect: 'windLunge', desc: '돌진 찌르기가 2배 멀리 나가고 길 위의 적을 모두 꿰뚫어요.' },
  { id: 'thunderfist', slot: 'weapon', wtype: 'gauntlet', name: '번개 주먹', effect: 'fistBolt', desc: '어퍼컷마다 번개가 주변 적 3명에게 튑니다.' },
  { id: 'thornwhip', slot: 'weapon', wtype: 'whip', name: '가시덩굴 채찍', effect: 'thornWhip', desc: '채찍에 맞은 적이 중독되고 느려집니다.' },
  { id: 'twinbow', slot: 'weapon', wtype: 'bow', name: '쌍둥이별 활', effect: 'extraProj', desc: '화살이 1발 더 발사됩니다.' },
  { id: 'frostwand', slot: 'weapon', wtype: 'staff', name: '얼음여왕의 지팡이', effect: 'freezeHit', desc: '공격이 15% 확률로 적을 얼립니다.' },
  { id: 'puddingcrown', slot: 'hat', name: '고블린 대장의 뿔투구', effect: 'jellyShield', desc: '피격 시 15% 확률로 보호막이 생깁니다.' },
  { id: 'berserkhelm', slot: 'hat', name: '광전사의 투구', effect: 'berserk', desc: '체력 50% 이하에서 공격력 +40%.' },
  { id: 'turtleshell', slot: 'armor', name: '거북 등껍질 갑옷', effect: 'turtle', desc: '받는 피해 -18%, 이동 속도 -8%.' },
  { id: 'starcloak', slot: 'armor', name: '별빛 망토', effect: 'starfall', desc: '6초마다 별똥별이 적에게 떨어집니다.' },
  { id: 'windboots', slot: 'shoes', name: '바람신의 장화', effect: 'windDash', desc: '대시 쿨다운 -40%, 대시 후 공격 속도 +50%.' },
  { id: 'phoenix', slot: 'acc', name: '불사조 깃털', effect: 'revive', desc: '탑에서 한 번, 쓰러져도 되살아납니다.' },
  { id: 'vampfang', slot: 'acc', name: '흡혈귀의 송곳니', effect: 'vamp', desc: '흡혈 +6%.' },
  { id: 'goldbell', slot: 'acc', name: '황금 고양이 방울', effect: 'goldBell', desc: '골드 +50%, 장비 발견 확률 +30%.' },
  { id: 'hourglass', slot: 'acc', name: '시간의 모래시계', effect: 'hourglass', desc: '스킬 쿨다운 -25%.' },
];
// 사라진 고유 장비 → 새 고유 장비
G.UNIQUE_RENAME = { kingboomerang: 'kingaxe', rainbowgun: 'twinbow' };
