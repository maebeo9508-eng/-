'use strict';
// ── 모찌의 스킬: 슬롯 1 = 궁극기(카드로 발동, AUTO면 자동), 슬롯 2 = 보조 스킬(늘 자동) ──
G.ACTIVE_SKILLS = {
  spin: { name: '회전 베기', icon: '🌀', cd: 7, dmg: 3.0, cost: 0, desc: '빙글 돌며 주변 적 모두에게 공격력의 {d} 피해.' },
  heal: { name: '치유의 빛', icon: '💖', cd: 18, heal: 0.3, cost: 0, desc: '팀 모두의 체력을 {h} 회복하고 모찌가 잠시 받는 피해가 줄어듭니다.' },
  meteor: { name: '유성 낙하', icon: '☄️', cd: 10, dmg: 5.5, cost: 40, desc: '적이 가장 많은 곳에 커다란 유성! 공격력의 {d} 광역 피해.' },
  frost: { name: '눈꽃 폭발', icon: '❄️', cd: 10, dmg: 1.8, cost: 40, desc: '주변을 얼려 2초간 빙결, 공격력의 {d} 피해.' },
  thunder: { name: '천둥 폭풍', icon: '⚡', cd: 12, dmg: 1.6, cost: 60, desc: '번개 8줄기가 무작위 적에게 떨어집니다. 한 줄기당 {d}.' },
  shield: { name: '솜털 방패', icon: '🛡️', cd: 15, dur: 2.5, cost: 60, desc: '{u}초 동안 모찌가 무적이 되고, 팀 모두에게 보호막을 씌워요.' },
  beam: { name: '별빛 광선', icon: '🌟', cd: 11, dmg: 0.6, cost: 90, desc: '1.6초 동안 앞쪽으로 광선을 뿜어 틱당 {d} 피해.' },
  clone: { name: '냥냥 분신술', icon: '🐱', cd: 16, dmg: 0.5, cost: 120, desc: '6초 동안 분신 2마리가 함께 싸웁니다. (공격력의 {d})' },
};
G.SKILL_MAX_LV = 5;
G.skillUpCost = (lv) => 20 + lv * 25; // 별조각

// ── 레벨업 능력 (탑 안에서만 유지되는 로그라이크 성장) ──
// rar: 0 보통 / 1 희귀 / 2 전설
// req: 'proj' 투사체 무기 전용, 'melee' 근접 무기 전용
G.ABILITIES = [
  { id: 'atk', name: '힘 솟는 젤리', icon: '💪', max: 6, rar: 0, desc: '팀 전체 공격력 +18%' },
  { id: 'aspd', name: '번개 발톱', icon: '⚡', max: 6, rar: 0, desc: '팀 전체 공격 속도 +15%' },
  { id: 'crit', name: '날카로운 눈', icon: '🎯', max: 5, rar: 0, desc: '팀 전체 치명타 확률 +8%, 치명타 피해 +15%' },
  { id: 'hp', name: '든든한 우유', icon: '🥛', max: 5, rar: 0, desc: '팀 전체 최대 체력 +20%, 모찌 체력 20% 회복' },
  { id: 'move', name: '가벼운 발걸음', icon: '👟', max: 3, rar: 0, desc: '모찌 이동 속도 +12%' },
  { id: 'multi', name: '더블 어택', icon: '✌️', max: 3, rar: 1, desc: '모찌의 공격이 한 번 더 나갑니다 (피해 -10%)' },
  { id: 'diag', name: '사선 공격', icon: '↗️', max: 2, rar: 1, desc: '모찌가 양쪽 대각선으로 추가 공격' },
  { id: 'rear', name: '뒤통수 공격', icon: '↩️', max: 2, rar: 0, desc: '모찌가 뒤쪽으로도 공격합니다' },
  { id: 'pierce', name: '관통', icon: '🗡️', max: 3, rar: 0, req: 'proj', desc: '모찌의 투사체가 적을 1명 더 관통' },
  { id: 'bounce', name: '통통 튕기기', icon: '🏓', max: 3, rar: 1, req: 'proj', desc: '모찌의 투사체가 다른 적에게 1번 더 튕김' },
  { id: 'wave', name: '검기', icon: '🌙', max: 3, rar: 1, req: 'melee', desc: '모찌가 근접 공격할 때 검기가 날아갑니다' },
  { id: 'burn', name: '불꽃 부여', icon: '🔥', max: 3, rar: 0, desc: '팀 모두의 공격이 적을 불태웁니다 (3초간 지속 피해)' },
  { id: 'frost', name: '얼음 부여', icon: '🧊', max: 3, rar: 0, desc: '팀 모두의 공격이 적을 느리게 하고 가끔 얼립니다' },
  { id: 'poison', name: '독 부여', icon: '🧪', max: 3, rar: 0, desc: '팀 모두의 공격마다 독이 쌓입니다 (최대 5중첩)' },
  { id: 'shock', name: '번개 부여', icon: '🌩️', max: 3, rar: 1, desc: '팀 모두의 공격이 25% 확률로 연쇄 번개' },
  { id: 'orbit', name: '빙글 별사탕', icon: '⭐', max: 4, rar: 1, desc: '모찌 주위를 도는 별사탕 +1' },
  { id: 'bubble', name: '솜털 보호막', icon: '🫧', max: 3, rar: 1, desc: '몇 초마다 모찌의 피해를 1번 막아주는 보호막' },
  { id: 'vamp', name: '흡혈 이빨', icon: '🦷', max: 3, rar: 0, desc: '모찌가 준 피해의 3%만큼 회복' },
  { id: 'killheal', name: '냠냠 회복', icon: '🍖', max: 3, rar: 0, desc: '적을 쓰러뜨릴 때마다 팀 모두 체력 1.5% 회복' },
  { id: 'explode', name: '팡팡 폭발', icon: '💥', max: 3, rar: 1, desc: '쓰러진 적이 폭발해 주변에 피해' },
  { id: 'magnet', name: '자석 수염', icon: '🧲', max: 2, rar: 0, desc: '아이템 획득 범위 +70%' },
  { id: 'giant', name: '거대화', icon: '🐘', max: 2, rar: 1, desc: '모찌가 커지고 팀 전체 피해 +22%' },
  { id: 'meteor', name: '별똥별 소환', icon: '☄️', max: 3, rar: 1, desc: '주기적으로 별똥별이 떨어집니다' },
  { id: 'thunder', name: '번개 구름', icon: '🌧️', max: 3, rar: 1, desc: '주기적으로 번개가 내리칩니다' },
  { id: 'rage', name: '분노의 꼬리', icon: '😤', max: 2, rar: 1, desc: '모찌가 잃은 체력에 비례해 피해 최대 +50%' },
  { id: 'luck', name: '네잎클로버', icon: '🍀', max: 3, rar: 0, desc: '골드 +25%, 장비 발견 확률 증가' },
  { id: 'cdr', name: '작은 모래시계', icon: '⏳', max: 3, rar: 0, desc: '모찌 스킬 쿨다운 -15%, 동료 궁극기 충전 +15%' },
  { id: 'petpow', name: '펫 간식', icon: '🍪', max: 3, rar: 0, desc: '펫과 동료의 피해 +40%' },
  { id: 'hunter', name: '보스 사냥꾼', icon: '👑', max: 3, rar: 0, desc: '팀 전체 보스·엘리트 피해 +25%' },
  { id: 'dash', name: '질풍 대시', icon: '💨', max: 2, rar: 0, desc: '모찌 대시 쿨다운 -30%, 대시 경로의 적에게 피해' },
  { id: 'rally', name: '응원가', icon: '📣', max: 3, rar: 1, desc: '동료 궁극기 충전 속도 +25%' },
  { id: 'guard', name: '철벽 진형', icon: '🧱', max: 3, rar: 0, desc: '동료가 받는 피해 -15%' },
  { id: 'firstaid', name: '응급 처치', icon: '🩹', max: 2, rar: 0, desc: '층을 클리어할 때마다 팀 체력 15% 회복' },
  { id: 'comeback', name: '다시 일어나!', icon: '🙌', max: 2, rar: 1, desc: '쓰러진 동료가 10초 뒤 30% 체력으로 부활 (2레벨: 8초)' },
  { id: 'revive', name: '두 번째 목숨', icon: '👼', max: 1, rar: 2, desc: '팀이 전멸하면 한 번 모두 체력 50%로 부활' },
  { id: 'heal', name: '따끈한 수프', icon: '🍲', max: 99, rar: 0, desc: '팀 모두 체력 40% 즉시 회복', instant: true },
];
