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

// 무기마다 공격 방식이 완전히 다릅니다.
G.WEAPONS = {
  sword: { name: '검', kind: 'melee', atkMul: 1.0, rate: 1.55, range: 50, arc: 2.0, desc: '부채꼴 베기 · 적의 탄환을 베어냄' },
  spear: { name: '창', kind: 'thrust', atkMul: 1.15, rate: 1.2, range: 88, width: 18, desc: '긴 찌르기 · 일직선 관통' },
  hammer: { name: '망치', kind: 'slam', atkMul: 2.1, rate: 0.72, range: 52, aoe: 60, desc: '느리지만 강한 광역 내려찍기' },
  bow: { name: '활', kind: 'proj', atkMul: 0.9, rate: 1.6, range: 330, proj: 'arrow', speed: 470, desc: '빠르고 곧은 화살' },
  wand: { name: '마법봉', kind: 'proj', atkMul: 1.25, rate: 1.05, range: 300, proj: 'orb', speed: 250, homing: 5, desc: '적을 따라가는 마법 구슬' },
  boomerang: { name: '부메랑', kind: 'boomerang', atkMul: 1.0, rate: 0.95, range: 190, proj: 'boomerang', speed: 340, desc: '날아갔다 돌아오며 모두 관통' },
  watergun: { name: '물총', kind: 'proj', atkMul: 0.42, rate: 4.6, range: 220, proj: 'water', speed: 390, spread: 0.2, desc: '쉴 새 없이 쏘는 물줄기' },
};

// 스테이지 테마별 장비 이름 접두어와 색
G.THEMES = [
  { prefix: '나뭇가지', color: '#a0785a' },
  { prefix: '쿠키', color: '#d99058' },
  { prefix: '선인장', color: '#5cb85c' },
  { prefix: '고드름', color: '#7cc8f2' },
  { prefix: '용암', color: '#ff6b4a' },
  { prefix: '깃펜', color: '#a98be8' },
  { prefix: '태엽', color: '#e8b84a' },
  { prefix: '산호', color: '#ff8fa3' },
  { prefix: '별빛', color: '#f5d742' },
  { prefix: '꿈결', color: '#b48cff' },
];

G.GEAR_VARIANTS = {
  hat: ['모자', '두건', '투구', '왕관'],
  armor: ['조끼', '망토', '갑옷', '로브'],
  shoes: ['장화', '샌들', '운동화', '부츠'],
  acc: ['반지', '목걸이', '방울', '브로치'],
};

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
  allyDmg: { name: '펫·동료 피해', fmt: 'pct' },
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

// 전설/신화 등급에서만 나오는 고유 장비. effect는 game/combat.js 에서 처리
G.UNIQUES = [
  { id: 'excalnyang', slot: 'weapon', wtype: 'sword', name: '엑스칼냥', effect: 'swordWave', desc: '휘두를 때마다 커다란 검기를 날립니다.' },
  { id: 'mjolnyang', slot: 'weapon', wtype: 'hammer', name: '천둥망치 묠냥', effect: 'hammerBolt', desc: '내려찍을 때 30% 확률로 번개가 떨어집니다.' },
  { id: 'twinbow', slot: 'weapon', wtype: 'bow', name: '쌍둥이별 활', effect: 'extraProj', desc: '화살이 1발 더 발사됩니다.' },
  { id: 'frostwand', slot: 'weapon', wtype: 'wand', name: '얼음여왕의 지팡이', effect: 'freezeHit', desc: '공격이 15% 확률로 적을 얼립니다.' },
  { id: 'kingboomerang', slot: 'weapon', wtype: 'boomerang', name: '왕의 부메랑', effect: 'bigBoomerang', desc: '부메랑이 1.6배 커집니다.' },
  { id: 'rainbowgun', slot: 'weapon', wtype: 'watergun', name: '무지개 물총', effect: 'rainbow', desc: '물줄기에 무작위 원소가 깃듭니다.' },
  { id: 'viperspear', slot: 'weapon', wtype: 'spear', name: '독사의 창', effect: 'doublePoison', desc: '찌를 때마다 중독을 2번 겁니다.' },
  { id: 'puddingcrown', slot: 'hat', name: '푸딩 임금님의 왕관', effect: 'jellyShield', desc: '피격 시 15% 확률로 젤리 보호막이 생깁니다.' },
  { id: 'berserkhelm', slot: 'hat', name: '광전사의 투구', effect: 'berserk', desc: '체력 50% 이하에서 공격력 +40%.' },
  { id: 'turtleshell', slot: 'armor', name: '거북이 등껍질', effect: 'turtle', desc: '받는 피해 -18%, 이동 속도 -8%.' },
  { id: 'starcloak', slot: 'armor', name: '별빛 망토', effect: 'starfall', desc: '6초마다 별똥별이 적에게 떨어집니다.' },
  { id: 'windboots', slot: 'shoes', name: '바람신의 장화', effect: 'windDash', desc: '대시 쿨다운 -40%, 대시 후 공격 속도 +50%.' },
  { id: 'phoenix', slot: 'acc', name: '불사조 깃털', effect: 'revive', desc: '탑에서 한 번, 쓰러져도 되살아납니다.' },
  { id: 'vampfang', slot: 'acc', name: '흡혈귀의 송곳니', effect: 'vamp', desc: '흡혈 +6%.' },
  { id: 'goldbell', slot: 'acc', name: '황금 고양이 방울', effect: 'goldBell', desc: '골드 +50%, 장비 발견 확률 +30%.' },
  { id: 'hourglass', slot: 'acc', name: '시간의 모래시계', effect: 'hourglass', desc: '스킬 쿨다운 -25%.' },
];
