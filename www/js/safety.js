/* 행사 안전 점검 (조감도 모드): 예상 인원으로 화장실·소화기·의료·인파 밀집·비상 대피를, 놓은 물건으로 전기 용량을 어림해서 알려 줌.
   - 집계 ‘전체’의 ‘안전 점검’ 묶음, 점검 창(동선 도구 위쪽 막대·집계에서 열기)
   - 도면에 겹쳐 보기: 소화기가 닿는 거리(20m), 소화기에서 먼 불 쓰는 물건, 관람 구역의 밀집도, 비상구
   - 제안서 PDF의 ‘안전 점검’ 쪽
   기준은 현장에서 흔히 쓰는 어림값이며 법정 기준을 대신하지 않음 (창·제안서에 적어 둠) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const RULE = {
    perToilet: 100,          // 이동식 화장실 1칸에 100명 (반나절 행사 어림)
    reach: 20000,            // 소화기: 각 부분에서 20m 안 (mm, 직선거리로 어림)
    medicalAt: 1000,         // 1,000명 이상: 구급차·의무실
    careAt: 300,             // 300명 이상: 의무 인력·비상 대피 동선 권장
    densityOk: 2,            // 1㎡에 2명까지 여유
    densityBad: 4,           // 4명을 넘으면 위험 (밀려 넘어질 수 있음)
    flow: 80,                // 출구 폭 1m에 1분에 80명 빠져나감
    evacMin: 8,              // 8분 안에 다 나가면 여유
    powerMargin: 1.25,       // 발전기 용량은 필요 전력의 1.25배 (기동 전류·여유)
    cableMax: 50000,         // 발전기에서 50m 넘으면 전압 강하·케이블 주의 (mm)
  };
  /* 전기 (kW, 어림): 물건 종류별 기본값. 물건 속성의 ‘전기’ 칸에 넣은 값이 있으면 그 값 */
  const kw1 = (v) => Math.round(v * 10) / 10;
  const POWER = {
    무대: (it) => Math.max(5, Math.round((it.size / 1000) * ((it.depth != null ? it.depth : it.size) / 1000) * 0.3)), // 음향·조명
    'LED 스크린': (it) => Math.max(1, kw1((it.size / 1000) * (App.catalog.itemHeight3(it) / 1000) * 0.35)),
    스피커: () => 1, 라인어레이: (it) => kw1((it.units || 5) * 0.8), '모니터 스피커': () => 0.5, '콘솔 데스크': () => 2,
    '조명 타워': () => 1.5, 카메라: () => 0.3, 스크린: () => 0.5,
    푸드트럭: () => 5, 부스: () => 1, 몽골텐트: () => 0.5, '대형 텐트': () => 2, '돔 텐트': () => 1, 컨테이너: () => 3, 매표소: () => 1,
    '의무실 텐트': () => 1, '안내 키오스크': () => 0.3, 점수판: () => 1, 에어아치: () => 1.1, 분수: () => 1.5,
  };
  const GEN_SIZES = [10, 30, 60, 100, 200, 300]; // 흔한 발전기 용량 (kW)
  /** 종류의 기본 전기 (kW). 전기를 안 쓰는 종류는 null */
  const powerDefault = (it) => (it && POWER[it.kind] ? POWER[it.kind](it) : null);
  /** 물건 하나가 쓰는 전기 (kW): 넣은 값, 없으면 기본값 */
  function powerOf(it) {
    if (!it || it.type !== 'item' || it.category !== 'event' || it.kind === '발전기' || !POWER[it.kind]) return 0;
    const v = Number(it.kw);
    return it.kw != null && it.kw !== '' && v >= 0 ? v : POWER[it.kind](it);
  }
  /** 발전기 용량 (kW) */
  const genKw = (it) => (Number(it.kw) > 0 ? Number(it.kw) : 60);
  // 불이 날 수 있는 것 (전기·가스·조리·조명): 가까이에 소화기
  const FIRE = new Set(['푸드트럭', '발전기', '무대', '부스', '대형 텐트', '몽골텐트', '돔 텐트', '난로', '조명 타워', 'LED 스크린', '컨테이너', '매표소', '콘솔 데스크']);
  // 의무실·구급 자리를 알아보는 말 (‘착용 의무’, ‘응급 상황 시 연락’ 같은 말은 빼려고 붙는 말까지 봄)
  const MEDICAL = /의무\s*(실|텐트|부스|소|반|요원|인력|차)|응급\s*(실|처치|의료|구조|센터|키트)|의료|구급|보건|간호|구호소|first\s*aid/i;
  const MERGE = 3000; // 대피 동선 끝이 이 안에 모이면 비상구 한 곳
  const LV = { ok: { mark: '✓', word: '여유', cls: 'ok' }, warn: { mark: '!', word: '주의', cls: 'warn' }, bad: { mark: '✕', word: '위험', cls: 'bad' }, info: { mark: 'i', word: '참고', cls: 'info' } };
  const n0 = (v) => Math.round(v).toLocaleString('ko-KR');
  const n1 = (v) => (Math.round(v * 10) / 10).toLocaleString('ko-KR');

  /* ── 모으기 ── */
  function collect() {
    // 숨긴 레이어: 집계와 같은 규칙 (‘숨긴 레이어는 집계에서도 빼기’를 켰을 때만 뺌)
    const exclude = App.layers.excludeHidden();
    const all = [...App.doc.all()].filter((e) => !exclude || App.layers.visible(e));
    const items = all.filter((e) => e.type === 'item');
    const zones = all.filter((e) => e.type === 'zone');
    const routes = all.filter((e) => e.type === 'route');
    const texts = all.filter((e) => e.type === 'text');
    const seats = items.reduce((t, it) => t + ((it.category === 'event' && App.catalog.seats(it)) || { count: 0 }).count, 0);
    const crowdZones = zones.filter((z) => z.crowd);
    const crowdArea = crowdZones.reduce((t, z) => t + App.model.TYPES.zone.area(z), 0) / 1e6; // ㎡
    // 실내 행사장(건물 화장실을 씀): 점검 창에서 고른 값, ‘자동’이면 벽이 3개 넘게 있을 때
    const autoIndoor = all.filter((e) => e.type === 'wall').length >= 3;
    const venue = App.current.venue === 'indoor' || App.current.venue === 'outdoor' ? App.current.venue : 'auto';
    const indoor = venue === 'auto' ? autoIndoor : venue === 'indoor';
    return { items, zones, routes, texts, seats, crowdZones, crowdArea, indoor, autoIndoor, venue, exclude };
  }
  /** 수용 인원 어림 (좌석 + 관람 구역 1㎡에 1명): 예상 인원을 안 넣었을 때 */
  const capacity = (c) => c.seats + Math.floor(c.crowdArea);
  /** 예상 인원: 넣은 값, 없으면 수용 인원 어림 */
  function expected(c = collect()) {
    const v = Number(App.current.expected);
    return v > 0 ? Math.round(v) : capacity(c);
  }
  /** 대피 동선들의 비상구: 끝점이 MERGE 안에 모이면 한 곳(폭은 그곳에 닿는 가장 넓은 길),
      다른 대피 길의 중간에서 끝나면 갈림길이라 비상구가 아님 (그 길의 남은 길이는 걷는 거리에 더함).
      돌려주는 값: { exits: [{ at, from, route, routes, width }], longest(mm) } */
  function exitsOf(evac) {
    const G = App.geom;
    const last = (r) => r.points[r.points.length - 1];
    const near = (a, b, d = MERGE) => Math.hypot(a.x - b.x, a.y - b.y) <= d;
    // p가 길 o 위(폭 안)에 있으면 o 위의 가장 가까운 자리 { i(다음 점 번호), point }
    const onRoute = (p, o) => {
      let best = null;
      for (let i = 1; i < o.points.length; i++) {
        const c = G.closestOnSegment(p, o.points[i - 1], o.points[i]);
        if (!best || c.dist < best.dist) best = { ...c, i };
      }
      return best && best.dist <= Math.max(600, (o.width || 1200) / 2 + 300) ? best : null;
    };
    const joinOf = (r) => {
      const p = last(r);
      for (const o of evac) {
        if (o === r || near(p, last(o))) continue; // 같은 출구로 모이는 길은 갈림길이 아님
        const at = onRoute(p, o);
        if (at) return { o, at };
      }
      return null;
    };
    const rest = (o, at) => {
      let L = Math.hypot(o.points[at.i].x - at.point.x, o.points[at.i].y - at.point.y);
      for (let j = at.i + 1; j < o.points.length; j++) L += Math.hypot(o.points[j].x - o.points[j - 1].x, o.points[j].y - o.points[j - 1].y);
      return L;
    };
    const joins = new Map(evac.map((r) => [r, joinOf(r)]));
    // 걷는 거리: 갈림길이면 이어지는 길의 남은 길이까지 (세 번까지 따라감)
    const walk = (r) => {
      let L = App.routes.length(r), cur = r;
      for (let k = 0; k < 3 && joins.get(cur); k++) { const j = joins.get(cur); L += rest(j.o, j.at); cur = j.o; }
      return L;
    };
    let ends = evac.filter((r) => !joins.get(r));
    if (!ends.length) ends = evac; // 모두 서로의 중간에서 끝나는 이상한 경우: 끝을 그대로 씀
    const exits = [];
    ends.forEach((r) => {
      const p = last(r), w = r.width || 1200;
      const g = exits.find((x) => near(x.at, p));
      if (g) { g.routes.push(r); if (w > g.width) { g.width = w; g.route = r; } } else exits.push({ at: p, from: r.points[r.points.length - 2], route: r, routes: [r], width: w });
    });
    return { exits, longest: Math.max(...evac.map(walk)) };
  }

  /* ── 점검 ── 돌려주는 값: { expected, auto(예상 인원을 넣지 않음), checks: [{ id, title, level, value, detail, advice }], data } */
  let cache = null;
  function run() {
    // 같은 도면·같은 예상 인원·같은 레이어면 다시 셈하지 않음 (겹쳐 보기는 화면을 옮길 때마다 그림)
    const key = `${App.doc.version}|${App.current.expected || ''}|${App.current.venue || ''}|${(App.current.hiddenLayers || []).join(',')}|${App.layers.excludeHidden()}|${App.modes.get()}`;
    if (cache && cache.key === key) return cache.r;
    const r = compute();
    cache = { key, r };
    return r;
  }
  function compute() {
    const c = collect();
    const N = expected(c);
    const auto = !(Number(App.current.expected) > 0);
    const checks = [];
    const data = { uncovered: [], extinguishers: [], density: null, exits: [], crowdZones: c.crowdZones };

    // 0) 예상 인원을 안 넣었으면: 수용 인원 어림으로 센다는 것을 먼저 알림 (밀집도는 셀 수 없음)
    if (auto && (c.items.length || c.crowdZones.length)) {
      checks.push({
        id: 'expected', title: '예상 인원', level: 'info', value: '안 넣음',
        detail: `좌석 ${n0(c.seats)}석 + 관람·대기 구역 ${n0(c.crowdArea)}㎡ × 1명 = ${n0(N)}명으로 어림해서 셉니다`,
        advice: '‘자세히’에서 예상 인원을 넣으면 밀집도·화장실·의료·대피를 그 인원으로 셉니다',
        print: `예상 인원이 정해지지 않아 좌석과 관람 구역 넓이로 ${n0(N)}명을 어림했습니다`,
      });
    }

    // 1) 인파 밀집: 서서 있을 사람을 관람·대기 구역 넓이로 나눔
    const standing = Math.max(0, N - c.seats);
    const capOk = c.crowdArea * RULE.densityOk, capBad = c.crowdArea * RULE.densityBad;
    const seatsNote = c.seats ? ` + 좌석 ${n0(c.seats)}` : '';
    if (c.crowdZones.length && c.crowdArea > 0 && auto) {
      // 예상 인원 없이 1㎡에 1명으로 어림한 값을 다시 나누면 늘 ‘여유’가 되므로 셈하지 않음
      checks.push({
        id: 'density', title: '인파 밀집', level: 'info', value: `권장 상한 ${n0(capOk + c.seats)}명`,
        detail: `관람·대기 구역 ${n0(c.crowdArea)}㎡ (구역 ${c.crowdZones.length}곳) · 1㎡에 ${RULE.densityOk}명까지 권장, ${RULE.densityBad}명 넘으면 위험`,
        advice: `예상 인원을 넣으면 밀집도를 셉니다. 권장 상한 ${n0(capOk + c.seats)}명 (서서 ${n0(capOk)}${seatsNote}) · ${n0(capBad + c.seats)}명 넘으면 위험`,
        print: `관람·대기 구역 ${n0(c.crowdArea)}㎡ · 권장 상한 ${n0(capOk + c.seats)}명 (1㎡에 ${RULE.densityOk}명${c.seats ? ', 좌석 포함' : ''})`,
      });
    } else if (c.crowdZones.length && c.crowdArea > 0) {
      const d = standing / c.crowdArea;
      data.density = d;
      const level = d <= RULE.densityOk ? 'ok' : d <= RULE.densityBad ? 'warn' : 'bad';
      checks.push({
        id: 'density', title: '인파 밀집', level, value: `1㎡에 ${densityText(d)}명`,
        detail: `서서 있을 사람 ${n0(standing)}명 ÷ 관람·대기 구역 ${n0(c.crowdArea)}㎡ (구역 ${c.crowdZones.length}곳)`,
        advice: level === 'ok'
          ? `권장 상한 ${n0(capOk + c.seats)}명 (서서 ${n0(capOk)}${seatsNote}, 1㎡에 ${RULE.densityOk}명)`
          : `관람 구역을 넓히거나 입장을 나눠 받으세요. 권장 상한 ${n0(capOk + c.seats)}명 · ${n0(capBad + c.seats)}명 넘으면 위험 (좌석 포함)`,
        print: level === 'ok'
          ? `관람 구역 1㎡에 ${densityText(d)}명으로 권장(${RULE.densityOk}명) 안입니다 · 권장 상한 ${n0(capOk + c.seats)}명`
          : level === 'warn' ? `관람 구역 1㎡에 ${densityText(d)}명으로 권장(${RULE.densityOk}명)을 넘습니다 · 구역 확대나 나눠 입장을 검토합니다`
            : `관람 구역 1㎡에 ${densityText(d)}명으로 위험 수준(${RULE.densityBad}명 초과)입니다 · 구역 확대·입장 제한이 필요합니다`,
      });
    } else if (standing > 0) {
      checks.push({ id: 'density', title: '인파 밀집', level: 'warn', value: `서서 ${n0(standing)}명`, detail: '좌석보다 예상 인원이 많은데 서 있을 곳이 표시되지 않았습니다', advice: '영역을 고르고 ‘관람·대기 구역’에 체크하면 밀집도를 셉니다', print: `서서 관람할 ${n0(standing)}명의 관람·대기 구역이 아직 정해지지 않았습니다` });
    }

    // 2) 화장실
    const toilets = c.items.filter((it) => it.kind === '이동식 화장실').length;
    if (N > 0) {
      const need = Math.ceil(N / RULE.perToilet);
      if (c.indoor) {
        // 실내 행사장: 건물 화장실을 쓰므로 칸 수만 알려 줌 (이동식 화장실은 더해지는 칸)
        checks.push({
          id: 'toilet', title: '화장실', level: 'info', value: toilets ? `이동식 ${toilets}칸 + 건물 · 권장 ${need}칸` : `권장 ${need}칸`,
          detail: `실내 행사장 (건물 화장실을 씀) · ${RULE.perToilet}명에 1칸 어림 (예상 ${n0(N)}명)`,
          advice: `건물 화장실${toilets ? '과 이동식 화장실을 합쳐' : '이'} ${need}칸을 넘는지 확인하세요${c.venue === 'auto' ? '. 야외 행사면 점검 창에서 행사장을 ‘야외’로 고르세요' : ''}`,
          print: `건물 화장실${toilets ? `과 이동식 화장실 ${toilets}칸` : ''}을 씁니다 · 권장 ${need}칸 (${RULE.perToilet}명에 1칸)`,
        });
      } else {
        const level = toilets >= need ? 'ok' : toilets >= need / 2 ? 'warn' : 'bad';
        data.toiletShort = Math.max(0, need - toilets);
        checks.push({ id: 'toilet', title: '화장실', level, value: `${toilets}칸 / 권장 ${need}칸`, detail: `${RULE.perToilet}명에 1칸 어림 (예상 ${n0(N)}명)`, advice: level === 'ok' ? '여성용을 더 많이 두면 줄이 짧아집니다' : `이동식 화장실 ${need - toilets}칸을 더 놓으세요`, print: level === 'ok' ? `이동식 화장실 ${toilets}칸 배치 · 권장 ${need}칸 (${RULE.perToilet}명에 1칸)` : `이동식 화장실 ${toilets}칸 배치 · 권장 ${need}칸으로 ${need - toilets}칸 추가가 필요합니다` });
      }
    }

    // 3) 소화기: 불 쓰는 물건마다 20m 안에 소화기
    const ext = c.items.filter((it) => it.kind === '소화기');
    data.extinguishers = ext;
    const fire = c.items.filter((it) => FIRE.has(it.kind));
    if (fire.length) {
      const far = fire.filter((it) => !ext.some((e) => Math.hypot(e.x - it.x, e.y - it.y) <= RULE.reach));
      data.uncovered = far;
      const level = far.length ? 'bad' : 'ok';
      const names = [...new Set(far.map((it) => it.kind))].slice(0, 4).join(', ');
      checks.push({
        id: 'fire', title: '소화기', level, value: far.length ? `먼 곳 ${far.length}개` : `${ext.length}개 · 모두 20m 안`,
        detail: `불을 쓰는 물건 ${fire.length}개(무대·부스·텐트·푸드트럭·발전기 등)에서 20m 안 (직선거리)`,
        advice: far.length ? `${names}${far.length > 4 ? ' 등' : ''} 가까이에 소화기를 놓으세요. 위 ‘소화기 채우기’ 버튼으로 한 번에 놓을 수 있습니다` : '소화기 자리를 안내판·지도에도 적어 두세요',
        print: far.length ? `소화기에서 20m 넘는 곳 ${far.length}개(${[...new Set(far.map((it) => it.kind))].slice(0, 3).join(', ')}${far.length > 3 ? ' 등' : ''}) · 소화기를 더 놓아야 합니다` : `소화기 ${ext.length}개 · 불을 쓰는 곳 모두 20m 안입니다`,
      });
    } else if (N >= RULE.careAt && !ext.length) {
      checks.push({ id: 'fire', title: '소화기', level: 'warn', value: '없음', detail: '불 쓰는 물건은 없지만 사람이 많습니다', advice: '입구·안내 데스크 가까이에 소화기를 두세요', print: '입구·안내 데스크 가까이에 소화기 배치가 필요합니다' });
    }

    // 4) 의료·구급: 구급차, 또는 ‘의무실’ 같은 말을 적은 물건(메모·간판 글·업체 이름)·영역(이름·메모)·글자
    const medItems = c.items.filter((it) => it.kind === '구급차' || it.kind === '의무실 텐트' || [it.memo, it.text, it.exhibitor].some((s) => MEDICAL.test(s || '')));
    const medZones = c.zones.filter((z) => MEDICAL.test(z.name || '') || MEDICAL.test(z.memo || ''));
    // 글자는 이미 센 영역 안이나 물건 가까이(3m)에 있으면 같은 곳
    const medTexts = c.texts.filter((t) => MEDICAL.test(t.content || '')
      && !medZones.some((z) => App.geom.pointInPolygon(t, z.points))
      && !medItems.some((it) => Math.hypot(it.x - t.x, it.y - t.y) <= MERGE + Math.max(it.size || 0, it.depth || 0) / 2));
    const medical = [...medItems, ...medZones, ...medTexts];
    const medHow = '구급차나 의무실 텐트(물건 › 편의·안전)를 놓거나, 의무실로 쓸 텐트·영역에 ‘의무실’이라고 적으세요 (영역 이름·메모나 글자 도구)';
    data.medicalMissing = N >= RULE.careAt && !medical.length;
    if (N >= RULE.medicalAt) {
      checks.push({ id: 'medical', title: '의료·구급', level: medical.length ? 'ok' : 'bad', value: medical.length ? `${medical.length}곳` : '없음', detail: `예상 ${n0(N)}명 (1,000명 이상)`, advice: medical.length ? '구급차가 드나들 길(차량 동선)을 비워 두세요' : medHow, print: medical.length ? `구급차·의무실 ${medical.length}곳 · 구급차 진입로를 비워 둡니다` : '1,000명 이상 행사로 구급차나 의무실 배치가 필요합니다' });
    } else if (N >= RULE.careAt) {
      checks.push({ id: 'medical', title: '의료·구급', level: medical.length ? 'ok' : 'warn', value: medical.length ? `${medical.length}곳` : '없음', detail: `예상 ${n0(N)}명`, advice: medical.length ? '응급 연락처를 안내판에 적어 두세요' : `의무 인력·응급 키트를 둘 자리를 정하세요. ${medHow}`, print: medical.length ? `구급차·의무실 ${medical.length}곳` : '의무 인력·응급 키트를 둘 자리를 정해야 합니다' });
    }

    // 5) 비상 대피: 비상 대피 동선의 끝 = 비상구 (모인 끝은 한 곳, 다른 대피 길 위에서 끝나면 갈림길), 폭으로 빠져나가는 시간 어림
    const evac = c.routes.filter((r) => r.kind === '비상 대피' && r.points.length >= 2 && App.routes.length(r) >= 500);
    if (evac.length) {
      const ex = exitsOf(evac);
      const W = ex.exits.reduce((t, x) => t + x.width, 0) / 1000; // m: 비상구마다 그곳에 닿는 가장 넓은 길
      const longest = ex.longest / 1000; // m: 갈림길은 이어지는 길까지
      const flowMin = N / Math.max(0.1, W * RULE.flow);
      const walkMin = longest / 1.3 / 60;
      const total = flowMin + walkMin;
      const blocked = evac.reduce((t, r) => t + App.routes.check(r).issues.length, 0);
      data.exits = ex.exits;
      const level = blocked ? 'bad' : total <= RULE.evacMin ? 'ok' : total <= RULE.evacMin * 1.5 ? 'warn' : 'bad';
      checks.push({
        id: 'evac', title: '비상 대피', level, value: `약 ${n1(total)}분`,
        detail: `비상구 ${ex.exits.length}곳 · 출구 폭 합계 ${n1(W)}m · 가장 긴 대피 길 ${n0(longest)}m${blocked ? ` · 걸리는 곳 ${blocked}곳` : ''}`,
        advice: blocked ? '동선 체크에서 걸리는 곳을 먼저 치우세요' : total <= RULE.evacMin ? `${RULE.evacMin}분 안에 다 나갈 수 있는 어림입니다` : '비상구를 늘리거나 출구 폭(동선 속성의 통로 폭)을 넓히세요',
        print: blocked ? `대피 길에 걸리는 곳 ${blocked}곳 · 정리가 필요합니다` : `비상구 ${ex.exits.length}곳(출구 폭 ${n1(W)}m)으로 모두 나가는 데 약 ${n1(total)}분${total <= RULE.evacMin ? ` · 권장 ${RULE.evacMin}분 안` : ` · 권장 ${RULE.evacMin}분을 넘어 비상구나 출구 폭을 늘려야 합니다`}`,
      });
    } else if (N >= RULE.careAt) {
      checks.push({ id: 'evac', title: '비상 대피', level: 'warn', value: '대피 동선 없음', detail: `예상 ${n0(N)}명`, advice: '동선 도구에서 ‘비상 대피’를 골라 자리에서 출구까지 그리세요 (끝이 비상구)', print: '비상 대피 동선과 비상구가 아직 정해지지 않았습니다' });
    }
    // 6) 전기: 놓은 물건이 쓰는 전기(어림)와 발전기 용량, 발전기에서 먼 곳
    const users = c.items.filter((it) => powerOf(it) > 0);
    const demand = kw1(users.reduce((t, it) => t + powerOf(it), 0));
    const gens = c.items.filter((it) => it.kind === '발전기');
    const supply = gens.reduce((t, g) => t + genKw(g), 0);
    data.power = { demand, supply, need: kw1(demand * RULE.powerMargin), far: [], gens: gens.length, short: 0 };
    if (demand > 0 || gens.length) {
      // 많이 쓰는 종류 셋
      const byKind = new Map();
      users.forEach((it) => byKind.set(it.kind, (byKind.get(it.kind) || 0) + powerOf(it)));
      const top = [...byKind.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${n1(v)}`).join(' · ');
      const detail0 = `필요 약 ${n1(demand)}kW${top ? ` (${top}${byKind.size > 3 ? ' …' : ''})` : ''}`;
      if (!gens.length) {
        // 발전기가 없으면 건물·상용 전원을 쓰는 것으로 보고 알려만 줌
        data.power.short = c.indoor ? 0 : data.power.need;
        checks.push({
          id: 'power', title: '전기 용량', level: 'info', value: `약 ${n1(demand)}kW 필요`,
          detail: `${detail0} · 발전기 없음${c.indoor ? ' (실내: 건물 전원)' : ''}`,
          advice: c.indoor ? '건물 분전반의 남는 용량과 콘센트 자리를 확인하세요' : `발전기(${n0(data.power.need)}kW 이상)를 놓거나 상용 전원(임시 전력) 용량을 확인하세요. 물건 속성의 ‘전기’ 칸에서 값을 고칠 수 있습니다`,
          print: `전기는 약 ${n1(demand)}kW가 필요합니다 (어림) · ${c.indoor ? '건물 전원 용량 확인' : '발전기 또는 상용 전원 확인'}이 필요합니다`,
        });
      } else {
        const far = users.filter((it) => !gens.some((g) => Math.hypot(g.x - it.x, g.y - it.y) <= RULE.cableMax));
        data.power.far = far;
        data.power.short = Math.max(0, kw1(data.power.need - supply));
        const level = supply < demand ? 'bad' : supply < data.power.need || far.length ? 'warn' : 'ok';
        const farNote = far.length ? ` · 발전기에서 50m 넘는 곳 ${far.length}개` : '';
        checks.push({
          id: 'power', title: '전기 용량', level, value: `${n0(supply)}kW / 필요 ${n1(demand)}kW`,
          detail: `${detail0} · 발전기 ${gens.length}대 ${n0(supply)}kW (여유율 ${Math.round((RULE.powerMargin - 1) * 100)}% 권장)${farNote}`,
          advice: supply < demand ? `발전기 용량이 ${n1(demand - supply)}kW 모자랍니다. 발전기를 더 놓거나 용량(속성)을 올리세요`
            : supply < data.power.need ? `돌아가지만 여유가 적습니다 (권장 ${n0(data.power.need)}kW 이상). 한꺼번에 켜면 차단될 수 있습니다`
              : far.length ? '먼 곳은 굵은 케이블을 쓰거나 가까이에 발전기를 하나 더 두세요 (전압 강하)' : '케이블은 동선을 가로지르지 않게 하고, 가로지르면 케이블 덮개를 쓰세요',
          print: supply < demand ? `필요 전력 약 ${n1(demand)}kW에 발전기 ${n0(supply)}kW로 용량이 모자랍니다 · 발전기 추가가 필요합니다`
            : `필요 전력 약 ${n1(demand)}kW · 발전기 ${gens.length}대 ${n0(supply)}kW${supply < data.power.need ? ' (여유율 부족)' : '로 여유가 있습니다'}${farNote}`,
        });
      }
    }
    return { expected: N, auto, capacity: capacity(c), seats: c.seats, crowdArea: c.crowdArea, venue: c.venue, autoIndoor: c.autoIndoor, indoor: c.indoor, excluded: c.exclude, checks, data };
  }

  /* ── 집계 ‘전체’의 묶음 ── */
  function block() {
    if (!App.modes.is('event')) return null;
    const r = run();
    if (!r.checks.length) return null;
    const worst = r.checks.some((x) => x.level === 'bad') ? 'bad' : r.checks.some((x) => x.level === 'warn') ? 'warn' : 'ok';
    // 줄은 짧게 (자세한 까닭·할 일은 ‘자세히’ 창에)
    return {
      title: '안전 점검',
      sub: `예상 ${n0(r.expected)}명 기준${r.auto ? ' (수용 인원 어림)' : ''}${r.excluded ? ' · 숨긴 레이어 뺌' : ''} · 어림값`,
      warn: worst !== 'ok',
      action: { act: 'safety-open', label: '자세히' },
      screenOnly: true, // 화면에서만 (CSV·도면+집계표 PDF·제안서 물량 집계에는 안 넣음, 제안서는 제 쪽에)
      rows: r.checks.map((x) => ({ label: `${LV[x.level].mark} ${x.title}`, value: { text: x.value, num: null, unit: '' }, note: LV[x.level].word, cls: `item lv-${LV[x.level].cls}`, cat: '안전 점검' })),
    };
  }

  /* ── 점검 창 ── */
  function listHtml(r) {
    return r.checks.length ? r.checks.map((x) => `
      <div class="sf-row lv-${LV[x.level].cls}">
        <span class="sf-badge">${LV[x.level].mark} ${LV[x.level].word}</span>
        <div class="sf-body"><b>${esc(x.title)}</b> <span class="sf-val">${esc(x.value)}</span>
          <small>${esc(x.detail)}</small><p>${esc(x.advice)}</p></div>
      </div>`).join('') : '<p class="props-meta">점검할 것이 없습니다. 좌석·관람 구역·물건을 놓으면 점검합니다.</p>';
  }
  /** 점검 창 아래 도구: 소화기에서 먼 곳이 있으면 ‘소화기 채우기’ */
  function toolsHtml(r) {
    const n = r.data.uncovered.length ? fillPlan(r).length : 0;
    const t = r.data.toiletShort || 0;
    return [
      n ? `<button type="button" class="btn" data-act="sf-fill">소화기 채우기 <small>${n}개를 놓아 먼 곳 ${r.data.uncovered.length}개를 모두 20m 안에</small></button>` : '',
      t ? `<button type="button" class="btn" data-act="sf-toilets">화장실 채우기 <small>이동식 화장실 ${t}칸을 빈 곳(있는 화장실 옆이나 가장자리)에</small></button>` : '',
      r.data.medicalMissing ? '<button type="button" class="btn" data-act="sf-medical">의무실 텐트 놓기 <small>입구·가장자리 가까운 빈 곳에 (구급차가 닿기 쉽게)</small></button>' : '',
      genPlan(r).length ? `<button type="button" class="btn" data-act="sf-power">발전기 놓기 <small>${genPlan(r).map((k) => `${k}kW`).join(' + ')}를 가장자리 빈 곳에 (필요 약 ${n1(r.data.power.demand)}kW)</small></button>` : '',
    ].join('');
  }
  /** 모자란 전기를 채울 발전기 용량들 (kW). 야외이고 3kW 넘게 모자랄 때만 */
  function genPlan(r = run()) {
    const p = r.data.power;
    if (!p || r.indoor || p.short < 3) return [];
    const out = [];
    let left = p.short;
    for (let guard = 0; left > 0 && guard < 20; guard++) {
      const k = GEN_SIZES.find((g) => g >= left) || GEN_SIZES[GEN_SIZES.length - 1];
      out.push(k);
      left -= k;
    }
    return out;
  }

  /* ── 빈 곳 찾기: w × d(mm) 자리가 다른 물건(돌린 실제 모양)·벽·동선(통로 폭)·관람 구역과 겹치지 않는 곳 중 score가 가장 낮은 곳.
     숨긴 레이어의 것도 피함. 방이 있으면(실내) 방 안에만. 돌려주는 값: { x, y, site } 또는 null ── */
  const corners = (it) => {
    const { w, h } = App.model.TYPES.item.dims(it), a = ((it.rotation || 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([lx, ly]) => ({ x: it.x + lx * c - ly * sn, y: it.y + lx * sn + ly * c }));
  };
  /** 두 볼록 사각형(점 넷)이 겹치는지 (분리축) */
  const overlap4 = (A, B) => {
    for (const P of [A, B]) {
      for (let i = 0; i < 4; i++) {
        const p = P[i], q = P[(i + 1) % 4], nx = q.y - p.y, ny = p.x - q.x;
        const pa = A.map((v) => v.x * nx + v.y * ny), pb = B.map((v) => v.x * nx + v.y * ny);
        if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
      }
    }
    return true;
  };
  function freeSpot(w, d, score, taken = []) {
    const all = [...App.doc.all()];
    const items = all.filter((e) => e.type === 'item' && !(App.catalog.itemDef(e.kind) || {}).flat);
    const zones = all.filter((e) => e.type === 'zone' && e.points && e.points.length >= 3);
    const routes = all.filter((e) => e.type === 'route' && e.points && e.points.length >= 2);
    const walls = all.filter((e) => e.type === 'wall');
    const rooms = all.filter((e) => e.type === 'room' && e.points && e.points.length >= 3 && !e.issue);
    // 현장 범위: 물건의 실제 모양과 영역 (긴 담장·관람석의 정사각형 범위로 밖까지 늘어나지 않게)
    const shapes = items.map(corners);
    const pts = [...shapes.flat(), ...zones.flatMap((z) => z.points), ...walls.flatMap((wl) => [wl.start, wl.end])];
    if (!pts.length) return null;
    const site = { minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)) };
    const siteArea = (site.maxX - site.minX) * (site.maxY - site.minY);
    // 관람 구역: 현장 거의 전체를 덮는 것(장터 전체 같은)은 피하지 않음
    const crowd = zones.filter((z) => z.crowd && App.model.TYPES.zone.area(z) < siteArea * 0.6);
    const m = 600; // 둘레 여유 (사람이 지나갈 틈)
    const takenShapes = taken.map((b) => [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }]);
    const wallShapes = walls.map((wl) => {
      const dx = wl.end.x - wl.start.x, dy = wl.end.y - wl.start.y, L = Math.hypot(dx, dy) || 1, t = (wl.thickness || 150) / 2 + 100, nx = (-dy / L) * t, ny = (dx / L) * t;
      return [{ x: wl.start.x + nx, y: wl.start.y + ny }, { x: wl.end.x + nx, y: wl.end.y + ny }, { x: wl.end.x - nx, y: wl.end.y - ny }, { x: wl.start.x - nx, y: wl.start.y - ny }];
    });
    const hw = w / 2 + m, hd = d / 2 + m;
    let best = null;
    // 겹침은 먼저 바깥 상자로 걸러 냄 (물건이 수백 개여도 빠르게)
    const solid = [...shapes, ...takenShapes, ...wallShapes].map((S) => ({ S, x0: Math.min(...S.map((p) => p.x)), x1: Math.max(...S.map((p) => p.x)), y0: Math.min(...S.map((p) => p.y)), y1: Math.max(...S.map((p) => p.y)) }));
    const step = Math.max(500, Math.min(2000, Math.round(Math.max(site.maxX - site.minX, site.maxY - site.minY) / 120)));
    for (let y = site.minY + hd; y <= site.maxY - hd; y += step) {
      for (let x = site.minX + hw; x <= site.maxX - hw; x += step) {
        const box = [{ x: x - hw, y: y - hd }, { x: x + hw, y: y - hd }, { x: x + hw, y: y + hd }, { x: x - hw, y: y + hd }];
        if (rooms.length && !rooms.some((r) => box.every((p) => App.geom.pointInPolygon(p, r.points)))) continue; // 실내: 방 안에만
        if (solid.some((o) => o.x1 > x - hw && o.x0 < x + hw && o.y1 > y - hd && o.y0 < y + hd && overlap4(box, o.S))) continue;
        if (crowd.some((z) => [{ x, y }, ...box].some((p) => App.geom.pointInPolygon(p, z.points)))) continue;
        const rect = { minX: x - hw, minY: y - hd, maxX: x + hw, maxY: y + hd };
        if (routes.some((rt) => rt.points.some((q, i) => i && segBoxDist(rt.points[i - 1], q, rect) < (rt.width || 1200) / 2))) continue;
        const sc = score(x, y, site);
        if (!best || sc < best.sc) best = { x, y, sc };
      }
    }
    return best && { x: Math.round(best.x), y: Math.round(best.y), site };
  }
  const edgeDist = (x, y, b) => Math.min(x - b.minX, b.maxX - x, y - b.minY, b.maxY - y);
  /** 선분 ab와 축에 나란한 상자 사이의 거리 (겹치면 0) */
  function segBoxDist(a, b, r) {
    if (App.geom.segmentIntersectsRect(a, b, r) || App.geom.pointInRect(a, r) || App.geom.pointInRect(b, r)) return 0;
    const box = (p) => Math.hypot(Math.max(r.minX - p.x, 0, p.x - r.maxX), Math.max(r.minY - p.y, 0, p.y - r.maxY));
    const cs = [{ x: r.minX, y: r.minY }, { x: r.maxX, y: r.minY }, { x: r.maxX, y: r.maxY }, { x: r.minX, y: r.maxY }];
    return Math.min(box(a), box(b), ...cs.map((c) => App.geom.closestOnSegment(c, a, b).dist));
  }
  /** 이동식 화장실 채우기: 모자란 칸을 한 줄(8칸까지)씩, 있는 화장실 옆을 먼저 (없으면 가장자리).
      문은 현장 안쪽을 보고, 줄 앞에는 줄 서는 통로(1.5m)를 비움 */
  function fillToilets() {
    const r = run();
    let left = r.data.toiletShort || 0;
    if (!left) { App.ui.toast('화장실이 모자라지 않습니다.'); return []; }
    const def = App.catalog.itemDef('이동식 화장실'), T = App.model.TYPES;
    const pitch = def.size + 150, d = def.depth || def.size, queue = 1500;
    const anchors = [...App.doc.all()].filter((e) => e.type === 'item' && e.kind === '이동식 화장실').map((e) => ({ x: e.x, y: e.y }));
    const taken = [], spots = [];
    const score = (x, y, b) => (anchors.length ? Math.min(...anchors.map((a) => Math.hypot(a.x - x, a.y - y))) : edgeDist(x, y, b) * 3);
    for (let guard = 0; left > 0 && guard < 200; guard++) {
      // 한 줄 8칸부터, 자리가 없으면 4·2·1칸으로 줄이고, 가로 줄이 안 되면 세로 줄
      let got = null;
      for (const k of [...new Set([Math.min(8, left), Math.min(4, left), Math.min(2, left), 1])]) {
        const w = k * pitch;
        const h = freeSpot(w, d + 2 * queue, score, taken), v = h ? null : freeSpot(d + 2 * queue, w, score, taken); // 세로 줄은 가로 줄이 안 될 때만
        const p = h ? { ...h, vertical: false } : v ? { ...v, vertical: true } : null;
        if (p) { got = { ...p, k, w }; break; }
      }
      if (!got) break;
      spots.push(got);
      taken.push(got.vertical ? { minX: got.x - d / 2 - queue, maxX: got.x + d / 2 + queue, minY: got.y - got.w / 2, maxY: got.y + got.w / 2 } : { minX: got.x - got.w / 2, maxX: got.x + got.w / 2, minY: got.y - d / 2 - queue, maxY: got.y + d / 2 + queue });
      anchors.push(got);
      left -= got.k;
    }
    if (!spots.length) { App.ui.toast('화장실을 놓을 빈 곳을 찾지 못했습니다. 자리를 비우거나 직접 놓으세요.'); return []; }
    const ids = [];
    App.doc.transact('화장실 채우기', () => spots.forEach((sp) => {
      // 문(앞)이 현장 가운데 쪽
      const cx = (sp.site.minX + sp.site.maxX) / 2, cy = (sp.site.minY + sp.site.maxY) / 2;
      const rot = sp.vertical ? (sp.x < cx ? 270 : 90) : sp.y < cy ? 0 : 180;
      for (let i = 0; i < sp.k; i++) {
        const o = -sp.w / 2 + pitch * (i + 0.5);
        const it = T.item.create(sp.vertical ? { x: sp.x, y: Math.round(sp.y + o) } : { x: Math.round(sp.x + o), y: sp.y }, def.category, def, rot, null);
        App.doc.add(it);
        ids.push(it.id);
      }
    }));
    const shown = ids.filter((id) => App.layers.visible(App.doc.get(id)));
    App.selection.set(shown);
    App.ui.toast(left > 0 ? `이동식 화장실 ${ids.length}칸을 놓았습니다. 빈 곳이 모자라 ${left}칸은 직접 놓으세요.` : `이동식 화장실 ${ids.length}칸을 놓았습니다. 자리는 옮겨도 됩니다 (한 번에 되돌리기 Ctrl+Z).`);
    return ids;
  }
  /** 의무실 텐트: 입구(관람 동선 시작·대피 동선 끝)와 가장자리에 가까운 빈 곳 */
  function placeMedical() {
    const def = App.catalog.itemDef('의무실 텐트'), T = App.model.TYPES;
    const routes = [...App.doc.all()].filter((e) => e.type === 'route' && e.points && e.points.length >= 2);
    const doors = routes.map((rt) => (rt.kind === '비상 대피' ? rt.points[rt.points.length - 1] : rt.points[0]));
    const p = freeSpot(def.size, def.depth || def.size, (x, y, b) => edgeDist(x, y, b) * 2 + (doors.length ? Math.min(...doors.map((q) => Math.hypot(q.x - x, q.y - y))) : 0));
    if (!p) { App.ui.toast('의무실 텐트를 놓을 빈 곳을 찾지 못했습니다. 직접 놓으세요.'); return []; }
    let id;
    App.doc.transact('의무실 텐트 놓기', () => { const it = T.item.create(p, def.category, def, 0, null); App.doc.add(it); id = it.id; });
    App.selection.set(App.layers.visible(App.doc.get(id)) ? [id] : []);
    App.ui.toast('의무실 텐트를 놓았습니다. 구급차가 닿기 쉬운 곳으로 옮겨도 됩니다 (되돌리기 Ctrl+Z).');
    return [id];
  }

  /** 발전기 놓기: 모자란 용량만큼, 가장자리이면서 전기를 가장 많이 쓰는 것(무대 등)에 가까운 빈 곳 */
  function placeGenerators(o = {}) {
    const r = run(), sizes = genPlan(r);
    if (!sizes.length) { if (!o.quiet) App.ui.toast('발전기가 모자라지 않습니다.'); return []; }
    const def = App.catalog.itemDef('발전기'), T = App.model.TYPES;
    const users = [...App.doc.all()].filter((e) => powerOf(e) > 0).sort((a, b) => powerOf(b) - powerOf(a));
    const big = users[0];
    const taken = [], ids = [];
    const spots = sizes.map((kw) => {
      const p = freeSpot(def.size, def.depth || def.size, (x, y, b) => edgeDist(x, y, b) * 2 + (big ? Math.hypot(big.x - x, big.y - y) : 0), taken);
      if (p) taken.push({ minX: p.x - def.size / 2 - 600, maxX: p.x + def.size / 2 + 600, minY: p.y - 1100, maxY: p.y + 1100 });
      return p && { ...p, kw };
    }).filter(Boolean);
    if (!spots.length) { if (!o.quiet) App.ui.toast('발전기를 놓을 빈 곳을 찾지 못했습니다. 직접 놓으세요.'); return []; }
    App.doc.transact('발전기 놓기', () => spots.forEach((sp) => {
      const it = T.item.create({ x: sp.x, y: sp.y }, def.category, def, 0, null);
      it.kw = sp.kw;
      App.doc.add(it);
      ids.push(it.id);
    }));
    if (!o.quiet) {
      App.selection.set(ids.filter((id) => App.layers.visible(App.doc.get(id))));
      App.ui.toast(`발전기 ${spots.map((sp) => `${sp.kw}kW`).join(' + ')}를 놓았습니다. 소음이 있으니 객석에서 먼 곳으로 옮겨도 됩니다 (되돌리기 Ctrl+Z).`);
    }
    return ids;
  }

  /* ── 소화기 채우기: 소화기에서 먼 불 쓰는 물건이 모두 20m 안에 들도록 적은 수로 놓음 (가장 많이 덮는 자리부터) ── */
  let fillCache = null; // 같은 도면이면 다시 셈하지 않음 (예상 인원과 상관없음)
  function fillPlan(r = run()) {
    const key = `${App.doc.version}|${App.layers.excludeHidden()}|${(App.current.hiddenLayers || []).join(',')}`;
    if (fillCache && fillCache.key === key) return fillCache.out.map((p) => ({ ...p }));
    const reach = RULE.reach - 500; // 0.5m 여유
    const T = App.model.TYPES.item;
    const items = [...App.doc.all()].filter((e) => e.type === 'item' && !(App.catalog.itemDef(e.kind) || {}).flat);
    const routes = [...App.doc.all()].filter((e) => e.type === 'route' && e.points && e.points.length >= 2);
    // 놓아도 되는 자리: 다른 물건 위가 아니고, 동선(통로 폭) 위가 아닌 곳
    const okAt = (p) => !items.some((it) => Math.abs(it.x - p.x) < 40000 && T.distance(it, p) < 300)
      && !routes.some((rt) => rt.points.some((q, i) => i && App.geom.closestOnSegment(p, rt.points[i - 1], q).dist < (rt.width || 1200) / 2 + 300));
    // 물건마다 자리 후보: 앞쪽 두 모서리, 양옆, 뒤쪽 두 모서리, 앞 가운데 (모서리를 먼저: 무대·부스 앞 가운데는 통로·버진로드)
    const spots = (it) => {
      const a = ((it.rotation || 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
      const hw = (it.size || 1000) / 2, hd = (it.depth != null ? it.depth : it.size || 1000) / 2, m = 600;
      const W = (lx, ly) => ({ x: Math.round(it.x + lx * c - ly * sn), y: Math.round(it.y + lx * sn + ly * c) });
      return [W(-hw - m * 0.3, hd + m), W(hw + m * 0.3, hd + m), W(-hw - m, 0), W(hw + m, 0), W(-hw - m * 0.3, -hd - m), W(hw + m * 0.3, -hd - m), W(0, hd + m)];
    };
    const covers = (p, o) => Math.hypot(o.x - p.x, o.y - p.y) <= reach;
    let left = r.data.uncovered.slice();
    const out = [];
    for (let guard = 0; left.length && guard < 300; guard++) {
      let best = null;
      left.forEach((it) => {
        const cands = spots(it).filter((p) => covers(p, it));
        const good = cands.filter(okAt);
        (good.length ? good : cands.length ? cands : [{ x: it.x, y: it.y }]).forEach((p, k) => {
          const n = left.filter((o) => covers(p, o)).length;
          const score = n * 10 + (good.length ? 5 : 0) - k * 0.01; // 많이 덮는 곳, 걸리지 않는 곳, 모서리 순
          if (!best || score > best.score) best = { p, score };
        });
      });
      out.push(best.p);
      left = left.filter((o) => !covers(best.p, o));
    }
    fillCache = { key, out };
    return out.map((p) => ({ ...p }));
  }
  function fillExtinguishers() {
    const pts = fillPlan();
    if (!pts.length) { App.ui.toast('소화기에서 먼 곳이 없습니다.'); return []; }
    const def = App.catalog.itemDef('소화기');
    const ids = [];
    App.doc.transact('소화기 채우기', () => pts.forEach((p) => {
      const it = App.model.TYPES.item.create(p, def.category, def, 0, null);
      App.doc.add(it);
      ids.push(it.id);
    }));
    // 숨긴 레이어에 놓였으면 고르지 않고 알려 줌 (보이지 않는 것을 지우거나 옮기지 않게)
    const shown = ids.filter((id) => App.layers.visible(App.doc.get(id)));
    App.selection.set(shown);
    App.ui.toast(shown.length === ids.length ? `소화기 ${ids.length}개를 놓았습니다. 자리는 옮겨도 됩니다 (한 번에 되돌리기 Ctrl+Z).`
      : `소화기 ${ids.length}개를 놓았지만 숨긴 레이어라 보이지 않습니다. 위쪽 ‘레이어’에서 켜세요 (되돌리기 Ctrl+Z).`);
    return ids;
  }

  async function open() {
    if (!App.modes.is('event')) { App.ui.toast('안전 점검은 조감도(행사) 모드에서 씁니다.'); return; }
    const r0 = run();
    await App.ui.dialog({
      title: '행사 안전 점검',
      html: `
        <div class="field"><label class="field-label" for="sfExpected">예상 인원 <small>비우면 수용 인원 어림 ${n0(r0.capacity)}명</small></label>
          <div class="field-box"><input id="sfExpected" type="text" inputmode="numeric" autocomplete="off" value="${r0.auto ? '' : r0.expected}" placeholder="${n0(r0.capacity)}"><span class="field-unit">명</span></div></div>
        <div class="field"><label class="field-label" for="sfVenue">행사장 <small>실내면 건물 화장실을 쓰는 것으로 봄</small></label>
          <div class="field-box"><select id="sfVenue" class="field-select">
            <option value="auto">자동 (벽이 있으면 실내${r0.autoIndoor ? ' · 지금 실내' : ' · 지금 야외'})</option>
            <option value="outdoor"${r0.venue === 'outdoor' ? ' selected' : ''}>야외</option>
            <option value="indoor"${r0.venue === 'indoor' ? ' selected' : ''}>실내 (건물 화장실을 씀)</option>
          </select></div></div>
        <label class="check-row"><input type="checkbox" id="sfView" ${App.current.safetyView ? 'checked' : ''}><span>도면에 겹쳐 보기<small>소화기 닿는 거리(20m)·먼 물건·관람 구역 밀집도·비상구 (화면에서만, 내보낼 때는 빠짐)</small></span></label>
        <div class="sf-tools">${toolsHtml(r0)}</div>
        <div class="sf-list" aria-live="polite">${listHtml(r0)}</div>
        <p class="props-meta">현장에서 흔히 쓰는 어림 기준입니다: 화장실 ${RULE.perToilet}명에 1칸, 소화기 20m, 밀집 1㎡에 ${RULE.densityOk}명까지 권장·${RULE.densityBad}명 넘으면 위험, 출구 폭 1m에 1분 ${RULE.flow}명, 대피 ${RULE.evacMin}분, 전기는 물건 종류별 어림값(속성의 ‘전기’ 칸에서 고침)에 발전기 여유율 ${Math.round((RULE.powerMargin - 1) * 100)}%. 법정 기준·인허가는 관할 기관에 확인하세요.</p>`,
      actions: [{ id: 'close', label: '닫기', primary: true }],
      onOpen(body) {
        const list = body.querySelector('.sf-list'), tools = body.querySelector('.sf-tools');
        const refresh = () => {
          const r = run();
          list.innerHTML = listHtml(r);
          tools.innerHTML = toolsHtml(r);
          save();
          if (showing()) App.plan.requestRender(); // 겹쳐 보기의 밀집도 색·숫자도 바로
        };
        tools.addEventListener('click', (e) => {
          const b = e.target.closest('[data-act]');
          if (!b) return;
          if (b.dataset.act === 'sf-fill') fillExtinguishers();
          else if (b.dataset.act === 'sf-toilets') fillToilets();
          else if (b.dataset.act === 'sf-medical') placeMedical();
          else if (b.dataset.act === 'sf-power') placeGenerators();
          else return;
          refresh();
        });
        body.querySelector('#sfExpected').addEventListener('input', (e) => {
          const v = Number(String(e.target.value).replace(/[^\d]/g, ''));
          App.current.expected = v > 0 ? v : null;
          refresh();
        });
        body.querySelector('#sfVenue').addEventListener('change', (e) => {
          App.current.venue = e.target.value === 'auto' ? null : e.target.value;
          refresh();
        });
        body.querySelector('#sfView').addEventListener('change', (e) => {
          App.current.safetyView = e.target.checked;
          save();
          App.plan.requestRender();
        });
      },
    });
    if (App.summary && App.summary.render) App.summary.render();
  }
  const save = () => { if (App.projects && App.projects.saveNow) App.projects.saveNow(); };

  /* ── 도면에 겹쳐 그리기 (draw.js에서 도면 좌표계로 부름) ── */
  let forced = false; // 제안서 쪽: 설정과 상관없이 그림
  // 화면에서 켰을 때만 (PNG·PDF 내보내기, 제안서 평면도에는 안 나옴. 제안서 안전 점검 쪽은 withOverlay로)
  const showing = () => App.modes.is('event') && (forced || (!!App.current.safetyView && !App.exporting));
  // 겹쳐 보기 공통: 화면에 보이는 것만, 아주 긴 점선은 실선으로 (점선 조각이 많으면 크게 확대할 때 느려짐)
  function overlayCtx(plan) {
    const s = plan.view.scale, k = 1 / s, ctx = plan.ctx;
    const vr = plan.view.worldRect(plan.width, plan.height);
    return {
      r: run(), ctx, s, k,
      seen: (b) => b.maxX >= vr.minX && b.minX <= vr.maxX && b.maxY >= vr.minY && b.minY <= vr.maxY,
      vis: (e) => App.layers.visible(e),
      dash: (lenWorld, a, b) => ctx.setLineDash(lenWorld * s > 6000 ? [] : [a * k, b * k]),
      reachBox: (e) => ({ minX: e.x - RULE.reach, maxX: e.x + RULE.reach, minY: e.y - RULE.reach, maxY: e.y + RULE.reach }),
    };
  }
  const densityRGB = (d) => (d <= RULE.densityOk ? '47,158,68' : d <= RULE.densityBad ? '232,89,12' : '224,49,49');
  /** 물건 아래에 까는 색 (영역 다음, 물건 전에): 관람 구역 밀집도 색, 소화기가 닿는 곳(겹쳐도 한 번만 칠함) */
  function drawUnder(plan) {
    if (!showing()) return;
    const { r, ctx, seen, vis, reachBox } = overlayCtx(plan);
    ctx.save();
    if (r.data.density != null) {
      ctx.fillStyle = `rgba(${densityRGB(r.data.density)},0.2)`;
      r.data.crowdZones.forEach((z) => {
        if (!vis(z) || !seen(App.model.TYPES.zone.bounds(z))) return;
        ctx.beginPath();
        z.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
      });
    }
    // 소화기 20m: 모든 원을 한 길로 칠해 겹친 곳이 더 진해지지 않게 (잘 덮을수록 빨개지던 것), 위험색이 아닌 파랑
    const ext = r.data.extinguishers.filter((e) => vis(e) && seen(reachBox(e)));
    if (ext.length) {
      ctx.beginPath();
      ext.forEach((e) => { ctx.moveTo(e.x + RULE.reach, e.y); ctx.arc(e.x, e.y, RULE.reach, 0, Math.PI * 2); });
      ctx.fillStyle = 'rgba(28,126,214,0.07)';
      ctx.fill('nonzero');
    }
    ctx.restore();
  }
  /** 물건 위에 긋는 선: 관람 구역 테두리, 소화기 20m 테두리, 소화기에서 먼 물건의 빨간 테두리 */
  function drawOverlay(plan) {
    if (!showing()) return;
    const { r, ctx, k, seen, vis, dash, reachBox } = overlayCtx(plan);
    ctx.save();
    if (r.data.density != null) {
      const col = densityRGB(r.data.density);
      r.data.crowdZones.forEach((z) => {
        if (!vis(z) || !seen(App.model.TYPES.zone.bounds(z))) return;
        ctx.beginPath();
        z.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        dash(App.geom.perimeter(z.points), 8, 5);
        ctx.lineWidth = 2.5 * k;
        ctx.strokeStyle = `rgba(${col},0.9)`;
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }
    r.data.extinguishers.forEach((e) => {
      if (!vis(e) || !seen(reachBox(e))) return;
      ctx.beginPath();
      ctx.arc(e.x, e.y, RULE.reach, 0, Math.PI * 2);
      dash(Math.PI * 2 * RULE.reach, 10, 6);
      ctx.lineWidth = 1.5 * k;
      ctx.strokeStyle = 'rgba(28,126,214,0.6)';
      ctx.stroke();
      ctx.setLineDash([]);
    });
    r.data.uncovered.forEach((it) => {
      if (!vis(it)) return;
      const b = App.model.TYPES.item.bounds(it);
      if (!seen(b)) return;
      const pad = 6 * k;
      ctx.lineWidth = 3 * k;
      ctx.strokeStyle = '#e03131';
      ctx.strokeRect(b.minX - pad, b.minY - pad, b.maxX - b.minX + pad * 2, b.maxY - b.minY + pad * 2);
    });
    ctx.restore();
  }
  /** 밀집도 글자: 문턱(2명·4명) 근처에서 반올림 때문에 ‘2명 · 주의’로 보이지 않게 */
  function densityText(d) {
    const one = Math.round(d * 10) / 10;
    const over = (t) => d > t && one <= t;
    return over(RULE.densityOk) || over(RULE.densityBad) ? (Math.ceil(d * 100) / 100).toLocaleString('ko-KR') : one.toLocaleString('ko-KR');
  }
  /** 화면 좌표계 글자 (밀집도 숫자, 비상구, 먼 물건 표시). 다른 글자와 겹치는 ‘소화기 멀음’은 쓰지 않음 (빨간 테두리로 보임) */
  function drawLabels(plan) {
    if (!showing()) return;
    const r = run(), ctx = plan.ctx, v = plan.view;
    const font = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif`;
    const placed = [];
    const tag = (x, y, text, bg, fg = '#fff', optional = false) => {
      ctx.font = font(800, 12);
      const w = ctx.measureText(text).width + 12;
      const box = { x0: x - w / 2 - 2, x1: x + w / 2 + 2, y0: y - 12, y1: y + 12 };
      if (optional && placed.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) return;
      placed.push(box);
      ctx.fillStyle = bg;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - w / 2, y - 10, w, 20, 6); else ctx.rect(x - w / 2, y - 10, w, 20);
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 0.5);
    };
    ctx.save();
    // 비상구를 먼저 (빠지면 안 되는 글자)
    r.data.exits.forEach((x) => {
      if (!x.routes.some((rt) => App.layers.visible(rt))) return;
      const p = v.toScreen(x.at.x, x.at.y);
      tag(p.x, p.y - 16, '비상구', '#2b8a3e');
    });
    if (r.data.density != null) {
      // 평균은 가장 넓은 관람 구역에 한 번만 (구역마다 같은 숫자를 쓰면 붐비는 곳이 가려짐), 다른 구역은 권장 상한 인원
      const d = r.data.density, bg = d <= RULE.densityOk ? '#2f9e44' : d <= RULE.densityBad ? '#e8590c' : '#e03131';
      const zs = r.data.crowdZones.filter((z) => App.layers.visible(z));
      const area = (z) => App.model.TYPES.zone.area(z);
      const big = zs.reduce((m, z) => (!m || area(z) > area(m) ? z : m), null);
      zs.forEach((z) => {
        const c = App.geom.interiorPoint(z.points), p = v.toScreen(c.x, c.y);
        const text = z === big ? `${zs.length > 1 ? '평균 ' : ''}1㎡에 ${densityText(d)}명` : `권장 상한 ${n0((area(z) / 1e6) * RULE.densityOk)}명`;
        tag(p.x, p.y + 34, text, z === big ? bg : 'rgba(73,80,87,0.85)', '#fff', z !== big); // 영역 이름·넓이 글자 아래
      });
    }
    r.data.uncovered.forEach((it) => {
      if (!App.layers.visible(it)) return;
      const p = v.toScreen(it.x, it.y);
      tag(p.x, p.y - 18, '소화기 멀음', '#e03131', '#fff', true);
    });
    ctx.restore();
  }
  /** fn을 부르는 동안 겹쳐 보기를 켬 (제안서의 안전 점검 쪽 도면) */
  function withOverlay(fn) {
    forced = true;
    try { return fn(); } finally { forced = false; }
  }

  App.safety = { RULE, LV, run, block, open, expected, fillPlan, fillExtinguishers, fillToilets, placeMedical, placeGenerators, genPlan, powerOf, powerDefault, GEN_SIZES, freeSpot, drawUnder, drawOverlay, drawLabels, withOverlay, densityText, get showing() { return showing(); } };
})();
