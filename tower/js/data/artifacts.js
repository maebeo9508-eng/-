'use strict';
// ── 아티팩트: 탑 안에서만 유지되는 특별한 유물 ─────────────────
// 보물 방·보스·엘리트·탑 속 상점에서 얻어요. 같은 아티팩트는 한 번만.
// mod: 능력치 변화 (game/stats.js 의 run 에서 더함) / fx: 특별한 효과 (game/ 쪽에서 처리)
G.ART_RARITY = [
  { name: '일반', color: '#a8a3b5', w: 10 },
  { name: '희귀', color: '#4fa3ff', w: 5 },
  { name: '영웅', color: '#b06cff', w: 2 },
  { name: '전설', color: '#ff9f1c', w: 0.6 },
];
G.ARTIFACTS = [
  // 능력치형
  { id: 'giantring', name: '거인의 반지', icon: '💍', rar: 1, desc: '공격력 +25%, 공격 속도 -8%', mod: { atkM: 0.25, aspdM: -0.08 } },
  { id: 'featherboots', name: '깃털 장화', icon: '🪶', rar: 0, desc: '이동 속도 +15%, 대시 쿨다운 -20%', mod: { moveM: 0.15, dashCdM: -0.2 } },
  { id: 'bloodgrail', name: '피의 성배', icon: '🏆', rar: 1, desc: '흡혈 +4%', mod: { vamp: 0.04 } },
  { id: 'huntcharm', name: '사냥꾼의 부적', icon: '🧿', rar: 0, desc: '보스·엘리트 피해 +35%', mod: { bossDmg: 0.35 } },
  { id: 'whetstone', name: '날카로운 숫돌', icon: '🪨', rar: 0, desc: '치명타 확률 +12%', mod: { crit: 0.12 } },
  { id: 'berserkmask', name: '광전사의 가면', icon: '👺', rar: 2, desc: '잃은 체력에 비례해 피해 최대 +50%, 받는 피해 +10%', mod: { rage: 0.25, dmgTaken: 0.1 } },
  { id: 'guardianshield', name: '수호자의 방패', icon: '🛡️', rar: 1, desc: '받는 피해 -15%', mod: { dmgRed: 0.15 } },
  { id: 'manacrystal', name: '마나 수정', icon: '🔷', rar: 1, desc: '스킬 쿨다운 -20%, 필살기 충전 +25%', mod: { cdr: 0.2, ultRate: 0.25 } },
  { id: 'goldcoin', name: '황금 동전', icon: '🪙', rar: 0, desc: '골드 +40%', mod: { goldP: 0.4 } },
  { id: 'scroll', name: '지혜의 두루마리', icon: '📜', rar: 0, desc: '경험치 +30%', mod: { expP: 0.3 } },
  { id: 'acorn', name: '생명의 도토리', icon: '🌰', rar: 0, desc: '최대 체력 +30%', mod: { hpM: 0.3 } },
  { id: 'longarm', name: '늘어나는 팔', icon: '🦾', rar: 1, desc: '근접 공격 범위 +20%', mod: { reach: 0.2 } },
  { id: 'combogloves', name: '연속기 장갑', icon: '🧤', rar: 1, desc: '연속 공격 마지막 일격 피해 +50%', mod: { finisher: 0.5 } },
  { id: 'executioner', name: '처형인의 도끼', icon: '⚰️', rar: 2, desc: '체력 30% 이하인 적에게 피해 +60%', mod: { execute: 0.6 } },
  { id: 'clover', name: '네잎 클로버', icon: '🍀', rar: 1, desc: '행운 +30% (상자·아티팩트 등급이 좋아져요)', mod: { luck: 0.3 } },
  { id: 'magnet', name: '커다란 자석', icon: '🧲', rar: 0, desc: '아이템 획득 범위 +100%', mod: { pickupM: 1 } },
  { id: 'windfeather', name: '바람의 깃털', icon: '🌬️', rar: 1, desc: '휘두를 때마다 검기가 날아가요 (활·지팡이는 1발 더)', mod: { wave: 1 } },
  { id: 'twinblade', name: '쌍둥이 칼집', icon: '🗡️', rar: 2, desc: '휘두를 때 잔상이 한 번 더 베어요 (60% 피해)', mod: { multi: 1 } },
  { id: 'phoenixash', name: '불사조의 재', icon: '🐦‍🔥', rar: 3, desc: '쓰러지면 한 번 체력 50%로 되살아나요', mod: { revive: 1 } },
  { id: 'kingseal', name: '왕의 인장', icon: '👑', rar: 3, desc: '공격력 +20%, 받는 피해 -10%', mod: { atkM: 0.2, dmgRed: 0.1 } },
  { id: 'cursedidol', name: '저주받은 우상', icon: '🗿', rar: 3, desc: '공격력 +60%, 최대 체력 -30%', mod: { atkM: 0.6, hpM: -0.3 } },
  // 효과형
  { id: 'stormjar', name: '번개 병', icon: '⚡', rar: 1, desc: '공격 5번마다 가까운 적에게 번개 (공격력 120%)', fx: 'stormjar' },
  { id: 'fireheart', name: '불꽃 심장', icon: '❤️‍🔥', rar: 1, desc: '쓰러진 적이 폭발해 주변에 공격력 70% 피해', fx: 'fireheart' },
  { id: 'frostspike', name: '서리 송곳', icon: '🧊', rar: 1, desc: '공격이 12% 확률로 적을 1초 얼려요', fx: 'frostspike' },
  { id: 'vipertooth', name: '독사의 이빨', icon: '🐍', rar: 0, desc: '모든 공격이 독을 쌓아요', fx: 'vipertooth' },
  { id: 'phantomcloak', name: '유령 망토', icon: '🥷', rar: 2, desc: '대시한 뒤 다음 공격 피해 2배', fx: 'phantom' },
  { id: 'starcompass', name: '별똥 나침반', icon: '🧭', rar: 1, desc: '전투가 시작될 때 별똥별 3개가 적에게 떨어져요', fx: 'starcompass' },
  { id: 'springwater', name: '회복의 샘물병', icon: '🧴', rar: 0, desc: '층을 클리어할 때마다 체력 15% 회복', fx: 'springwater' },
  { id: 'thornarmor', name: '가시 갑옷', icon: '🌵', rar: 1, desc: '나에게 부딪힌 적에게 공격력 100% 반사 피해', fx: 'thorns' },
  { id: 'oldclock', name: '멈춘 회중시계', icon: '⏱️', rar: 2, desc: '새 웨이브가 나타나면 2초 동안 적이 느려져요', fx: 'oldclock' },
  { id: 'greedpouch', name: '탐욕의 주머니', icon: '👝', rar: 1, desc: '적이 골드를 2배로 떨구고, 탑 속 상점 15% 할인', fx: 'greed' },
  { id: 'vampfang2', name: '흡혈귀의 이빨', icon: '🧛', rar: 1, desc: '치명타가 터질 때마다 체력 1% 회복', fx: 'critheal' },
  { id: 'stormeye', name: '폭풍의 눈', icon: '🌪️', rar: 2, desc: '대시하면 주변에 번개 고리 (공격력 150%)', fx: 'stormeye' },
];
G.artifactDef = (id) => G.ARTIFACTS.find((a) => a.id === id);
