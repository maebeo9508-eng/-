'use strict';
// ── 스킬: 마을에서 배워 하나를 장착해요. 탑 안에서 스킬 버튼(PC: Q)으로 쓰고, 쿨다운이 지나면 다시 ──
G.ACTIVE_SKILLS = {
  spin: { name: '회전 베기', icon: '🌀', cd: 7, dmg: 3.0, cost: 0, desc: '빙글 돌며 주변 적 모두에게 공격력의 {d} 피해.' },
  heal: { name: '치유의 빛', icon: '💖', cd: 18, heal: 0.3, cost: 0, desc: '체력을 {h} 회복하고 3초 동안 받는 피해가 줄어들어요.' },
  meteor: { name: '유성 낙하', icon: '☄️', cd: 10, dmg: 5.5, cost: 40, desc: '적이 가장 많은 곳에 커다란 유성! 공격력의 {d} 광역 피해.' },
  frost: { name: '눈꽃 폭발', icon: '❄️', cd: 10, dmg: 1.8, cost: 40, desc: '주변을 얼려 2초간 빙결, 공격력의 {d} 피해.' },
  thunder: { name: '천둥 폭풍', icon: '⚡', cd: 12, dmg: 1.6, cost: 60, desc: '번개 8줄기가 무작위 적에게 떨어집니다. 한 줄기당 {d}.' },
  shield: { name: '솜털 방패', icon: '🛡️', cd: 15, dur: 2.5, cost: 60, desc: '{u}초 동안 무적이 되고 날아오는 탄환을 막아요.' },
  beam: { name: '별빛 광선', icon: '🌟', cd: 11, dmg: 0.6, cost: 90, desc: '1.6초 동안 앞쪽으로 광선을 뿜어 틱당 {d} 피해.' },
  clone: { name: '분신술', icon: '👥', cd: 16, dmg: 0.5, cost: 120, desc: '6초 동안 분신 2명이 함께 싸워요. (공격력의 {d})' },
};
G.SKILL_MAX_LV = 5;
G.skillUpCost = (lv) => 20 + lv * 25; // 별조각

// ── 레벨업 능력 (탑 안에서만 유지되는 로그라이크 성장) ──
// rar: 0 보통 / 1 희귀 / 2 전설
// req: 'proj' 투사체(활·지팡이·검기) 전용, 'melee' 근접 무기 전용
G.ABILITIES = [
  { id: 'atk', name: '힘 솟는 고기', icon: '💪', max: 6, rar: 0, desc: '공격력 +18%' },
  { id: 'aspd', name: '번개 발톱', icon: '⚡', max: 6, rar: 0, desc: '공격 속도 +15%' },
  { id: 'crit', name: '날카로운 눈', icon: '🎯', max: 5, rar: 0, desc: '치명타 확률 +8%, 치명타 피해 +15%' },
  { id: 'hp', name: '든든한 우유', icon: '🥛', max: 5, rar: 0, desc: '최대 체력 +20%, 체력 20% 회복' },
  { id: 'move', name: '가벼운 발걸음', icon: '👟', max: 3, rar: 0, desc: '이동 속도 +12%' },
  { id: 'multi', name: '잔상 베기', icon: '✌️', max: 3, rar: 1, desc: '공격할 때 잔상이 한 번 더 들어가요 (60% 피해)' },
  { id: 'diag', name: '사선 검기', icon: '↗️', max: 2, rar: 1, desc: '공격할 때 양쪽 대각선으로 작은 검기 (활·지팡이: 화살 2발 추가)' },
  { id: 'rear', name: '뒤통수 공격', icon: '↩️', max: 2, rar: 0, desc: '공격할 때 뒤쪽으로도 검기가 날아가요' },
  { id: 'pierce', name: '관통', icon: '🗡️', max: 3, rar: 0, req: 'proj', desc: '화살·마법·검기가 적을 1명 더 관통' },
  { id: 'bounce', name: '통통 튕기기', icon: '🏓', max: 3, rar: 1, req: 'proj', desc: '화살·마법·검기가 다른 적에게 1번 더 튕겨요' },
  { id: 'wave', name: '검기', icon: '🌙', max: 3, rar: 1, req: 'melee', desc: '휘두를 때 앞으로 검기가 날아가요' },
  { id: 'reach', name: '긴 팔', icon: '🦾', max: 3, rar: 0, req: 'melee', desc: '근접 공격 범위 +15%' },
  { id: 'combo', name: '연속기 달인', icon: '🥋', max: 3, rar: 1, desc: '연속 공격의 마지막 일격 피해 +40%' },
  { id: 'burn', name: '불꽃 부여', icon: '🔥', max: 3, rar: 0, desc: '공격이 적을 불태웁니다 (3초간 지속 피해)' },
  { id: 'frost', name: '얼음 부여', icon: '🧊', max: 3, rar: 0, desc: '공격이 적을 느리게 하고 가끔 얼려요' },
  { id: 'poison', name: '독 부여', icon: '🧪', max: 3, rar: 0, desc: '공격마다 독이 쌓여요 (최대 5중첩)' },
  { id: 'shock', name: '번개 부여', icon: '🌩️', max: 3, rar: 1, desc: '공격이 25% 확률로 연쇄 번개' },
  { id: 'orbit', name: '빙글 수호구', icon: '🔮', max: 4, rar: 1, desc: '주위를 도는 수호구 +1' },
  { id: 'bubble', name: '마법 보호막', icon: '🫧', max: 3, rar: 1, desc: '몇 초마다 피해를 1번 막아 주는 보호막' },
  { id: 'vamp', name: '흡혈 이빨', icon: '🦷', max: 3, rar: 0, desc: '준 피해의 3%만큼 회복' },
  { id: 'killheal', name: '냠냠 회복', icon: '🍖', max: 3, rar: 0, desc: '적을 쓰러뜨릴 때마다 체력 1.5% 회복' },
  { id: 'explode', name: '팡팡 폭발', icon: '💥', max: 3, rar: 1, desc: '쓰러진 적이 폭발해 주변에 피해' },
  { id: 'magnet', name: '자석 수염', icon: '🧲', max: 2, rar: 0, desc: '아이템 획득 범위 +70%' },
  { id: 'giant', name: '거대화', icon: '🐘', max: 2, rar: 1, desc: '몸과 무기가 커지고 피해 +22%' },
  { id: 'meteor', name: '별똥별 소환', icon: '☄️', max: 3, rar: 1, desc: '주기적으로 별똥별이 떨어집니다' },
  { id: 'thunder', name: '번개 구름', icon: '🌧️', max: 3, rar: 1, desc: '주기적으로 번개가 내리칩니다' },
  { id: 'rage', name: '분노의 꼬리', icon: '😤', max: 2, rar: 1, desc: '잃은 체력에 비례해 피해 최대 +50%' },
  { id: 'luck', name: '네잎클로버', icon: '🍀', max: 3, rar: 0, desc: '골드 +25%, 장비·아티팩트 등급이 좋아져요' },
  { id: 'cdr', name: '작은 모래시계', icon: '⏳', max: 3, rar: 0, desc: '스킬 쿨다운 -15%, 필살기 충전 +15%' },
  { id: 'ultcharge', name: '투지', icon: '🔥', max: 3, rar: 1, desc: '필살기 게이지가 25% 더 빨리 차요' },
  { id: 'petpow', name: '펫 간식', icon: '🍪', max: 3, rar: 0, desc: '펫 피해 +40%' },
  { id: 'hunter', name: '보스 사냥꾼', icon: '👑', max: 3, rar: 0, desc: '보스·엘리트 피해 +25%' },
  { id: 'dash', name: '질풍 대시', icon: '💨', max: 2, rar: 0, desc: '대시 쿨다운 -30%, 대시 경로의 적에게 피해' },
  { id: 'firstaid', name: '응급 처치', icon: '🩹', max: 2, rar: 0, desc: '층을 클리어할 때마다 체력 15% 회복' },
  { id: 'revive', name: '두 번째 목숨', icon: '👼', max: 1, rar: 2, desc: '쓰러지면 한 번 체력 50%로 되살아나요' },
  { id: 'heal', name: '따끈한 수프', icon: '🍲', max: 99, rar: 0, desc: '체력 40% 즉시 회복', instant: true },
];
