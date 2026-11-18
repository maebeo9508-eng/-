/* 안전관리계획서 초안 (조감도): 행사 개요·안전 조직·비상 연락처를 넣으면 안전 점검 결과와 도면으로 A4 세로 4쪽 PDF를 만듦.
   1쪽 행사 개요·안전 조직표·비상 연락망   2쪽 배치도·대피 경로도 (안전 겹쳐 보기 + 안전 요원 S1…, 범례·방위표·축척)
   3쪽 시설·인력 현황 + 구역별 안전 요원 배치표   4쪽 비상 대응 요령 (화재·정전·강풍·호우·인파 밀집·응급 환자·미아·분실) + 비상 연락처
   - 안전 점검 창의 ‘안전관리계획서 (PDF)’ 버튼으로 엶. ‘글만 복사’는 같은 내용을 글자로 (문서·메신저에 붙여 넣기)
   - 넣은 값은 이 도면에 저장 (App.current.safetyPlan: 고친 칸만, 안 고친 칸은 처음 값을 따름). 예상 인원은 안전 점검과 같은 값(App.current.expected)
   - 수치는 안전 점검(safety.js)의 현장 어림값. 법정 기준·신고 기한은 적지 않음 (대상·기한·양식은 관할 지자체에 확인)
   - 쪽마다 200dpi 그림으로 그려 JPEG로 넣음 (제안서 PDF와 같은 방식·모양: 여백·머리글 줄·쪽 번호) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const str = (v) => (v == null ? '' : String(v));
  const n0 = (v) => Math.round(v).toLocaleString('ko-KR');
  const n1 = (v) => (Math.round(v * 10) / 10).toLocaleString('ko-KR');
  const num = (s) => { const v = Number(str(s).replace(/[^\d]/g, '')); return v > 0 ? v : 0; };

  const DPI = 200;
  const PX = (mm) => Math.round((mm / 25.4) * DPI);
  const PT = (px) => (px / DPI) * 72;
  const W = PX(210), H = PX(297); // A4 세로
  const M = 130, TOP = 260, FOOT = 190; // 제안서와 같은 여백·머리글 아래·바닥글 위
  const K = 2.2; // 배치도: 화면 1px을 그림 몇 px로 (글자·기호 크기)
  let curK = K; // 지금 그리는 배치도의 배율 (300m 넘는 큰 부지는 줄여서 칸에 다 들어가게)
  const INK = '#1f2937', MUTE = '#6b7280', FAINT = '#9ca3af', LINE = '#e5e7eb', SOFT = '#f3f4f6', ACCENT = '#c54b08', STAFF = '#6741d9';
  const LV_COLOR = { ok: '#2f9e44', warn: '#e8590c', bad: '#e03131', info: '#868e96' };
  const BADGE_W = 112;
  const HEADNOTE = '지역축제·공연 안전관리계획 신고용 초안 — 대상·기한·양식은 관할 지자체에 확인';
  const FOOTER = '초안 · 현장 어림 기준 · 제출 기한과 양식은 관할 기관 확인';
  const ROLES = ['총괄 책임자', '안전관리 책임자', '구역 책임자', '의료 담당', '전기·소방 담당', '주차·교통 담당'];
  const CONTACTS = [['화재·구급', '119'], ['경찰', '112'], ['관할 소방서', ''], ['관할 경찰서', ''], ['가까운 응급실', ''], ['시·군·구 담당 부서', ''], ['발전기·전기 업체', '']];
  const MAX = { org: 16, contacts: 12 }; // 1쪽에 다 들어가는 줄 수
  // 행사 개요 칸 (id는 창의 입력 칸)
  const FIELDS = [
    { k: 'name', id: 'sppName', label: '행사 이름', wide: true, max: 60 },
    { k: 'date', id: 'sppDate', label: '날짜', hint: '여러 날이면 ~로 이어서', ph: '예: 2026-12-12', max: 40 },
    { k: 'time', id: 'sppTime', label: '시간', ph: '예: 10:00 ~ 21:00', max: 40 },
    { k: 'address', id: 'sppAddress', label: '장소 주소', wide: true, ph: '예: ○○시 ○○구 ○○로 12 (○○광장)', max: 120 },
    { k: 'host', id: 'sppHost', label: '주최', max: 60 },
    { k: 'organizer', id: 'sppOrganizer', label: '주관', max: 60 },
    { k: 'expected', id: 'sppExpected', label: '예상 인원', num: true },
    { k: 'peak', id: 'sppPeak', label: '순간 최대 인원', num: true },
    { k: 'program', id: 'sppProgram', label: '주요 프로그램', wide: true, area: true, ph: '예: 개막 공연 18:00, 체험 부스 10:00~17:00, 불꽃놀이 20:30', max: 600 },
  ];

  const FONT = () => getComputedStyle(document.documentElement).getPropertyValue('--font-ui') || 'sans-serif';
  const projectName = () => (App.projects && App.projects.current ? App.projects.current.name : '도면');
  const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || '도면';
  const save = () => { if (App.projects && App.projects.saveNow) App.projects.saveNow(); };
  /** 창을 닫거나 PDF·복사할 때: 고친 게 있을 때만 저장 (열어 보기만 한 도면이 도면 목록 맨 위로 올라가지 않게) */
  const settle = () => { if (App.projects && App.projects.flush) App.projects.flush(); };

  /* ── 저장한 값 ── */
  function stored() {
    const v = App.current.safetyPlan;
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }
  function storedW() {
    if (stored() !== App.current.safetyPlan) App.current.safetyPlan = {};
    return App.current.safetyPlan;
  }
  /** 처음 값: 행사 이름은 도면 이름, 날짜는 공정표의 행사일 */
  function defaults() {
    const sc = App.current.schedule;
    let day = sc && typeof sc === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(sc.eventDay || '') ? sc.eventDay : '';
    // 여러 날 행사면 공정표의 행사 기간 (행사일을 공정표에서 골랐을 때만)
    if (day && App.schedule) {
      try {
        const p = App.schedule.plan(), ev = p.eventSet ? p.tasks.find((t) => t.kind === 'event') : null;
        const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
        if (ev && ev.to > ev.from) day = `${iso(ev.from)} ~ ${iso(ev.to)}`;
      } catch (e) { /* 공정표를 못 읽으면 첫날만 */ }
    }
    return { name: projectName(), date: day, time: '', address: '', host: '', organizer: '', peak: '', program: '' };
  }
  /** 칸 값: 고친 값(빈 칸으로 고친 것도), 없으면 처음 값 */
  function values() {
    const s = stored(), d = defaults(), out = {};
    Object.keys(d).forEach((k) => { out[k] = typeof s[k] === 'string' ? s[k] : d[k]; });
    return out;
  }
  const blankRow = (kind) => (kind === 'org' ? { role: '', name: '', phone: '', radio: '' } : { org: '', phone: '' });
  /** 안전 조직·비상 연락처 줄: 고친 목록, 없으면 처음 목록 */
  function rowsOf(kind) {
    const s = stored()[kind];
    if (!Array.isArray(s)) return kind === 'org' ? ROLES.map((role) => ({ ...blankRow('org'), role })) : CONTACTS.map(([org, phone]) => ({ org, phone }));
    return s.filter((r) => r && typeof r === 'object').slice(0, MAX[kind]).map((r) => (kind === 'org'
      ? { role: str(r.role), name: str(r.name), phone: str(r.phone), radio: str(r.radio) } : { org: str(r.org), phone: str(r.phone) }));
  }
  /** 줄 목록 고치기: 지금 목록(처음 목록이면 그것)을 저장한 뒤 바꿈 */
  function editRows(kind, fn) {
    const list = rowsOf(kind);
    fn(list);
    storedW()[kind] = list;
  }

  /* ── 날짜 글자: 2026-12-12 → 2026년 12월 12일 (토). 그 밖의 글자는 넣은 그대로 ── */
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  function isoText(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return s;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return Number.isNaN(d.getTime()) || d.getDate() !== +m[3] ? s : `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
  }
  function dateText(s) {
    const v = str(s).trim();
    const m = /^(\d{4}-\d{2}-\d{2})\s*~\s*(.+)$/.exec(v);
    if (!m) return isoText(v);
    const a = isoText(m[1]), b = isoText(m[2].trim());
    // 같은 해·같은 달이면 줄여서: 2026년 12월 12일 (토) ~ 14일 (월)
    const ma = /^(\d+)년 (\d+)월 (.+)$/.exec(a), mb = /^(\d+)년 (\d+)월 (.+)$/.exec(b);
    if (ma && mb && ma[1] === mb[1]) return `${a} ~ ${ma[2] === mb[2] ? mb[3] : `${mb[2]}월 ${mb[3]}`}`;
    return `${a} ~ ${b}`;
  }

  /* ── 안전 요원·구역 ── */
  const isStaff = (e) => e.type === 'item' && e.kind === '사람' && /스태프/.test(e.style || '');
  /** 이어진 번호는 묶어서: [1,2,3,5] → ‘S1–S3, S5’ */
  function rangeText(nums) {
    const out = [];
    for (let i = 0; i < nums.length;) {
      let j = i;
      while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
      out.push(j - i >= 2 ? `S${nums[i]}–S${nums[j]}` : nums.slice(i, j + 1).map((n) => `S${n}`).join(', '));
      i = j + 1;
    }
    return out.join(', ');
  }
  /** 구역(영역)과 안전 요원: 요원은 놓인 가장 작은 영역의 것 (집계 ‘구역별’과 같은 규칙: 안이거나 경계에서 0.3m 안).
      번호는 구역 차례대로, 구역 안에서는 위 → 아래·왼쪽 → 오른쪽 (여러 명 묶음은 S3–S5처럼 사람 수만큼).
      숨긴 레이어는 안전 점검·집계와 같게 (‘숨긴 레이어는 집계에서도 빼기’를 켰을 때만 뺌) */
  function layout() {
    const G = App.geom, EDGE = 300;
    const zones = App.summary.compute().zones.map((z) => {
      const el = App.doc.get(z.id), pts = el && el.points ? el.points : [];
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      return { ...z, points: pts, box: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) } };
    }).filter((z) => z.points.length >= 3);
    const bySize = zones.slice().sort((a, b) => a.area - b.area);
    const onEdge = (p, pts) => pts.some((q, i) => G.closestOnSegment(p, q, pts[(i + 1) % pts.length]).dist <= EDGE);
    const inZone = (p, z) => p.x >= z.box.minX - EDGE && p.x <= z.box.maxX + EDGE && p.y >= z.box.minY - EDGE && p.y <= z.box.maxY + EDGE && (G.pointInPolygon(p, z.points) || onEdge(p, z.points));
    const exclude = App.layers.excludeHidden();
    const order = new Map(zones.map((z, i) => [z.id, i]));
    const staff = [...App.doc.all()].filter((e) => isStaff(e) && (!exclude || App.layers.visible(e))).map((it) => {
      const z = bySize.find((x) => inZone(it, x));
      return { it, id: it.id, zone: z ? z.id : null, n: Math.max(1, Math.round(Number(it.count) || 1)) };
    });
    const zi = (s) => (s.zone != null ? order.get(s.zone) : zones.length);
    staff.sort((a, b) => zi(a) - zi(b) || Math.floor(a.it.y / 4000) - Math.floor(b.it.y / 4000) || a.it.x - b.it.x || a.it.y - b.it.y);
    let k = 0;
    staff.forEach((s) => {
      s.from = k + 1;
      s.to = k + s.n;
      k += s.n;
      s.label = s.n > 1 ? `S${s.from}–S${s.to}` : `S${s.from}`;
    });
    const RULE = App.safety.RULE;
    const numsOf = (list) => list.flatMap((s) => Array.from({ length: s.n }, (_, i) => s.from + i));
    const row = (name, z, list) => {
      const nums = numsOf(list);
      return { name, area: z ? z.area : null, crowd: !!(z && z.crowd), max: z && z.crowd ? Math.floor((z.area / 1e6) * RULE.densityOk) : null, nums, staffText: nums.length ? `${rangeText(nums)} (${nums.length}명)` : '' };
    };
    const rows = zones.map((z) => row(z.name, z, staff.filter((s) => s.zone === z.id)));
    const outside = staff.filter((s) => s.zone == null);
    if (!zones.length) rows.push(row('행사장 전체', null, staff));
    else if (outside.length) rows.push(row('구역 밖', null, outside));
    return { zones, staff, rows, count: k };
  }

  /* ── PDF에 넣을 것 모으기 ── */
  function gather() {
    const r = App.safety.run();
    const exclude = App.layers.excludeHidden();
    const items = [...App.doc.all()].filter((e) => e.type === 'item' && (!exclude || App.layers.visible(e)));
    const L = layout();
    const v = values();
    return {
      v, r, RULE: App.safety.RULE, L, staff: L.staff, staffN: L.count,
      count: (kind) => items.filter((it) => it.kind === kind).length,
      title: v.name.trim() || projectName(),
      made: new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
      org: rowsOf('org'), contacts: rowsOf('contacts'),
      ballast: App.safety.ballast(),
      cap: r.crowdArea > 0 ? Math.floor(r.crowdArea * App.safety.RULE.densityOk + r.seats) : 0, // 관람 구역 권장 상한 (좌석 포함)
      rect: App.exporter.planRect(),
    };
  }
  /** 행사 개요: [이름, 값] */
  function overview(d) {
    const v = d.v, peak = num(v.peak);
    return [
      ['행사 이름', d.title],
      ['날짜', dateText(v.date)],
      ['시간', v.time.trim()],
      ['장소', v.address.trim()],
      ['주최', v.host.trim()],
      ['주관', v.organizer.trim()],
      ['예상 인원', `${n0(d.r.expected)}명${d.r.auto ? ' (좌석·관람 구역으로 어림)' : ''}`],
      ['순간 최대 인원', [peak ? `${n0(peak)}명` : '', d.cap ? `(관람 구역 권장 상한 ${n0(d.cap)}명)` : ''].filter(Boolean).join(' ')],
      ['주요 프로그램', v.program.trim()],
    ];
  }
  /** 시설·인력 현황: [{ item, now, rule, level, res }] — 안전 점검의 결과(수준)와 어림 기준 */
  function facility(d) {
    const { r, RULE } = d, N = r.expected, p = r.data.power || {};
    const ck = (id) => r.checks.find((c) => c.id === id);
    const lv = (c, def = 'info') => (c ? c.level : def);
    const out = [];
    // 화장실
    const toilets = d.count('이동식 화장실'), needT = Math.ceil(N / RULE.perToilet), cT = ck('toilet');
    out.push({
      item: '이동식 화장실', now: r.indoor ? `건물 화장실${toilets ? ` + 이동식 ${toilets}칸` : ''}` : `${toilets}칸`,
      rule: `${RULE.perToilet}명에 1칸 → 권장 ${n0(needT)}칸`, level: lv(cT),
      res: r.indoor ? '건물 칸 수 확인' : toilets >= needT ? '충분' : `${n0(needT - toilets)}칸 모자람`,
    });
    // 소화기
    const cF = ck('fire'), far = r.data.uncovered.length;
    out.push({ item: '소화기', now: `${d.count('소화기')}개`, rule: `불 쓰는 곳마다 ${RULE.reach / 1000}m 안 (무대·부스·텐트·푸드트럭·발전기)`, level: lv(cF), res: cF ? (far ? `${RULE.reach / 1000}m 넘는 곳 ${far}개` : cF.level === 'ok' ? `모두 ${RULE.reach / 1000}m 안` : '입구·안내소에 두기') : '불 쓰는 물건 없음' });
    // 의무실·구급차
    const tent = d.count('의무실 텐트'), amb = d.count('구급차'), cM = ck('medical');
    out.push({
      item: '의무실·구급차', now: [cM ? cM.value : '', tent ? `의무실 텐트 ${tent}` : '', amb ? `구급차 ${amb}` : ''].filter(Boolean).join(' · ') || '없음',
      rule: `${n0(RULE.medicalAt)}명 이상 구급차·의무실, ${n0(RULE.careAt)}명 이상 의무 인력`, level: lv(cM),
      res: cM ? (cM.level === 'ok' ? '자리 있음' : '자리 정해야 함') : `${n0(RULE.careAt)}명 미만`,
    });
    // 발전기
    const cP = ck('power');
    out.push({
      item: '발전기', now: p.gens ? `${p.gens}대 · ${n0(p.supply)}kW` : '없음',
      rule: p.demand > 0 ? `필요 약 ${n1(p.demand)}kW → 권장 ${n0(Math.ceil(p.need))}kW 이상 (여유 ${Math.round((RULE.powerMargin - 1) * 100)}%)` : '전기 쓰는 물건 없음',
      level: lv(cP),
      res: !p.gens ? (p.demand > 0 ? (r.indoor ? '건물 전원 확인' : '상용 전원 확인') : '—')
        : p.supply < p.demand ? `${n1(p.demand - p.supply)}kW 모자람` : p.supply < p.need ? '여유 적음' : (p.far || []).length ? `50m 넘는 곳 ${p.far.length}개` : '여유 있음',
    });
    // 조명 타워 (야간)
    const towers = d.count('조명 타워'), lamps = d.count('가로등'), cL = ck('light'), dark = (r.data.dark || []).length;
    out.push({
      item: '조명 타워', now: `${towers}개${lamps ? ` · 가로등 ${lamps}개` : ''}`,
      rule: App.current.night && !r.indoor ? `관람 구역·동선을 모두 밝게 (타워 반경 ${RULE.lightTower / 1000}m)` : '해진 뒤까지 하면 관람 구역·동선 조명',
      level: lv(cL), res: cL ? (dark ? '어두운 곳 있음' : '모두 밝음') : r.indoor ? '실내' : '낮 행사',
    });
    // 비상구
    const cE = ck('evac'), all = r.data.exits || [], exits = all.filter((x) => x.routes.some((rt) => App.layers.visible(rt))), width = exits.reduce((t, x) => t + x.width, 0) / 1000;
    out.push({
      item: '비상구·대피', now: exits.length ? `${exits.length}곳 · 출구 폭 합계 ${n1(width)}m` : all.length ? '대피 동선이 숨긴 레이어에 있음' : '대피 동선 없음',
      rule: `${RULE.evacMin}분 안에 모두 대피 (출구 폭 1m에 1분 ${RULE.flow}명)`, level: lv(cE),
      res: cE ? (exits.length ? `대피 ${cE.value}` : '대피 길 정해야 함') : '—',
    });
    // 고정 추 (바람 대비, 야외)
    const b = d.ballast;
    out.push({
      item: '고정 추', now: b.legs ? `${n0(b.legs)}개 · 약 ${n0(b.kg)}kg` : r.indoor ? '실내 (해당 없음)' : '고정할 것 없음',
      rule: '텐트 지붕 1㎡에 8kg 어림 · 초속 10m 넘는 바람이면 옆막 걷기, 15m 넘으면 접기', level: 'info', res: b.legs ? '렌탈사 기준 확인' : '—',
    });
    // 안전 요원 (안전 점검처럼 예상 인원이 적으면 알려만 줌 — 작은 행사는 진행 요원이 겸하기도 함)
    const needS = Math.max(RULE.staffMin, Math.ceil(N / RULE.perStaff)), cS = ck('staff'), s = d.staffN;
    out.push({
      item: '안전 요원', now: s ? `${n0(s)}명 (S1~S${s})` : '없음',
      rule: `${RULE.perStaff}명에 1명, 적어도 ${RULE.staffMin}명 → 권장 ${n0(needS)}명${cS ? '' : ` (${n0(RULE.careAt)}명 이상일 때)`}`,
      level: cS ? cS.level : 'info', res: s >= needS ? '충분' : cS ? `${n0(needS - s)}명 모자람` : `${n0(RULE.careAt)}명 미만 행사`,
    });
    // 인파 밀집
    const cD = ck('density');
    out.push({
      item: '인파 밀집', now: r.crowdArea > 0 ? `관람 구역 ${n0(r.crowdArea)}㎡${r.data.density != null ? ` · 1㎡에 ${App.safety.densityText(r.data.density)}명` : ''}` : '관람 구역 없음',
      rule: `1㎡에 ${RULE.densityOk}명까지 권장, ${RULE.densityBad}명 넘으면 위험`, level: lv(cD),
      res: d.cap ? `권장 상한 ${n0(d.cap)}명` : cD ? cD.value : '—',
    });
    return out;
  }
  /** 비상 대응 요령 (현장에서 흔히 하는 순서, 쉬운 말) */
  function response(d) {
    const RULE = d.RULE, peak = num(d.v.peak);
    return [
      { title: '화재', color: '#e03131', steps: [
        '“불이야” 크게 알리고 119에 신고합니다 (장소·탄 것·다친 사람).',
        `가까운 소화기로 처음 불을 끄고, 불이 커지면 바로 물러납니다.`,
        '전기·가스를 끄고 관람객을 연기 반대쪽 비상구로 안내합니다.',
        '안전 요원은 맡은 비상구를 열고 모두 나갔는지 확인합니다.',
      ] },
      { title: '정전', color: '#495057', steps: [
        '무전으로 정전 구역을 알리고 “제자리에 잠시 멈춰 주세요” 방송합니다.',
        '비상 조명·손전등을 켜고 출입구·비상구·계단에 요원을 세웁니다.',
        '발전기·분전반을 살피고, 까닭을 알기 전에는 다시 켜지 않습니다.',
        '오래 걸리면 공연을 멈추고 구역마다 차례로 내보냅니다.',
      ] },
      { title: '강풍·호우', color: '#1c7ed6', steps: [
        '바람이 초속 10m를 넘으면 텐트 옆막을 걷고 현수막·아치를 내립니다.',
        '초속 15m를 넘으면 텐트를 접고 무대 지붕·LED 화면 아래를 비웁니다.',
        '고정 추가 밀리거나 빠진 곳을 돌아보고 다시 묶습니다.',
        '비가 많이 오면 전기 연결부를 끄고 덮으며, 천둥·번개가 치면 행사를 멈춥니다.',
      ] },
      { title: '인파 밀집', color: '#e8590c', steps: [
        `1㎡에 ${RULE.densityBad}명을 넘으면 입장을 멈추고 다른 구역·출구 쪽으로 나눕니다.`,
        '무대 앞·출입구처럼 몰리는 곳에 요원을 더 세우고 한 방향으로 걷게 합니다.',
        '밀리거나 넘어진 사람이 있으면 공연을 멈추고 뒤쪽부터 물러나게 방송합니다.',
        `구역별 인원을 무전으로 자주 알리고 순간 최대 ${peak ? `${n0(peak)}명` : '인원'}을 넘지 않게 합니다.`,
      ] },
      { title: '응급 환자', color: '#2f9e44', steps: [
        '환자 곁을 지키며 119와 의료 담당에게 알립니다.',
        '의식·호흡이 없으면 바로 심폐소생술을 하고 자동심장충격기(AED)를 가져옵니다.',
        '구급차가 들어올 길을 비우고, 요원이 입구에서 맞아 안내합니다.',
        '다친 시간·장소·한 일을 적어 둡니다.',
      ] },
      { title: '미아·분실', color: '#7048e8', steps: [
        '보호자를 안내소로 모시고 아이의 나이·옷차림·사진을 받습니다.',
        '무전으로 모든 요원에게 알리고 출입구부터 지킵니다.',
        '찾은 아이는 안내소에서 보호자를 확인한 뒤 넘겨줍니다.',
        '맡겨진 물건은 받은 시간·자리·물건을 적어 안내소에 둡니다.',
      ] },
    ];
  }

  /* ── 그리기 도구 (제안서와 같은 글자 그리기) ── */
  function pen(ctx) {
    const f = FONT();
    const font = (size, weight = 400) => { ctx.font = `${weight} ${size}px ${f}`; };
    /** 한 줄 글자. maxW를 넘으면 끝을 줄임표로 */
    const text = (s, x, y, size, weight = 400, color = INK, align = 'left', maxW = 0) => {
      font(size, weight);
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      let v = str(s);
      if (maxW) while (v.length > 1 && ctx.measureText(v).width > maxW) v = `${v.slice(0, -2)}…`;
      ctx.fillText(v, x, y);
      return ctx.measureText(v).width;
    };
    /** 여러 줄로 나눔: 띄어쓰기에서 먼저 끊고, 한 낱말이 너무 길면 글자 단위로 */
    const wrap = (s, size, maxW, weight = 400) => {
      font(size, weight);
      const out = [];
      str(s).split(/\r?\n/).forEach((para) => {
        let line = '';
        for (const word of para.split(/(\s+)/)) {
          if (!word) continue;
          const next = line + word;
          if (ctx.measureText(next).width <= maxW) { line = next; continue; }
          if (line.trim()) out.push(line.trimEnd());
          line = word.trimStart();
          while (line && ctx.measureText(line).width > maxW) {
            let n = line.length;
            while (n > 1 && ctx.measureText(line.slice(0, n)).width > maxW) n--;
            out.push(line.slice(0, n));
            line = line.slice(n);
          }
        }
        out.push(line.trimEnd());
      });
      while (out.length && !out[out.length - 1]) out.pop();
      return out;
    };
    const round = (x, y, w, h, r) => {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
      else ctx.rect(x, y, w, h);
    };
    return { ctx, font, text, wrap, round };
  }

  /** 표. cols: [{ w, head, align }], rows: [[칸…]] — 칸은 글자 또는 { t, span(칸 수), shade(회색 바탕), weight, color, lines(줄 수 한도), badge(점검 수준) }.
      o: { size(글자), rowH(가장 낮은 줄 높이), vpad(글자 위아래 여백 합, 기본 22), headH, lines, dry(재기만) }. 돌려주는 값: 표 아래 y */
  function table(P, x, y, cols, rows, o = {}) {
    const ctx = P.ctx, size = o.size || 24, pad = 16, rowH = o.rowH || 60, draw = !o.dry;
    const total = cols.reduce((t, c) => t + c.w, 0), top = y;
    const tx = (cx, w, al) => (al === 'right' ? cx + w - pad : al === 'center' ? cx + w / 2 : cx + pad);
    if (cols.some((c) => c.head)) {
      const hh = o.headH || 50;
      if (draw) {
        ctx.fillStyle = SOFT;
        ctx.fillRect(x, y, total, hh);
        let cx = x;
        cols.forEach((c) => {
          if (cx > x) { ctx.fillStyle = LINE; ctx.fillRect(cx, y, 1.5, hh); }
          if (c.head) P.text(c.head, tx(cx, c.w, c.align), y + hh / 2, Math.round(size * 0.86), 700, MUTE, c.align || 'left', c.w - 2 * pad);
          cx += c.w;
        });
        ctx.fillStyle = LINE;
        ctx.fillRect(x, y + hh - 1.5, total, 1.5);
      }
      y += hh;
    }
    rows.forEach((row) => {
      let ci = 0, cx = x;
      const cells = row.map((raw) => {
        const c = raw && typeof raw === 'object' ? raw : { t: raw };
        const span = c.span || 1, w = cols.slice(ci, ci + span).reduce((t, k) => t + k.w, 0);
        const sz = c.size || size, wt = c.weight || 400, room = w - 2 * pad - (c.badge ? BADGE_W + 12 : 0);
        let lines = P.wrap(str(c.t), sz, room, wt);
        const max = c.lines || o.lines || 1;
        if (lines.length > max) {
          lines = lines.slice(0, max);
          lines[max - 1] = `${lines[max - 1].slice(0, Math.max(1, lines[max - 1].length - 1))}…`;
        }
        const cell = { ...c, x: cx, w, al: c.align || cols[ci].align || 'left', sz, wt, room, lines: lines.length ? lines : [''] };
        ci += span;
        cx += w;
        return cell;
      });
      const vpad = o.vpad != null ? o.vpad : 22;
      const h = Math.max(rowH, ...cells.map((c) => c.lines.length * Math.round(c.sz * 1.4) + vpad));
      if (draw) {
        cells.forEach((c) => {
          if (c.shade) { ctx.fillStyle = SOFT; ctx.fillRect(c.x, y, c.w, h); }
          if (c.x > x) { ctx.fillStyle = LINE; ctx.fillRect(c.x, y, 1.5, h); }
          let lx = tx(c.x, c.w, c.al), al = c.al;
          if (c.badge) {
            const lv = App.safety.LV[c.badge] || App.safety.LV.info;
            ctx.fillStyle = LV_COLOR[lv.cls];
            P.round(c.x + pad, y + h / 2 - 20, BADGE_W, 40, 20);
            ctx.fill();
            P.text(`${lv.mark} ${lv.word}`, c.x + pad + BADGE_W / 2, y + h / 2 + 1, 20, 800, '#ffffff', 'center');
            lx = c.x + pad + BADGE_W + 12;
            al = 'left';
          }
          const lh = Math.round(c.sz * 1.4), y0 = y + h / 2 - ((c.lines.length - 1) * lh) / 2;
          c.lines.forEach((l, i) => P.text(l, lx, y0 + i * lh, c.sz, c.wt, c.color || INK, al, c.room));
        });
        ctx.fillStyle = LINE;
        ctx.fillRect(x, y + h - 1.5, total, 1.5);
      }
      y += h;
    });
    if (draw) {
      ctx.fillStyle = INK;
      ctx.fillRect(x, top, total, 3);
      ctx.fillRect(x, y - 2.5, total, 2.5);
    }
    return y;
  }
  /** 소제목: 주황 막대 + 제목 (+ 작은 설명). 돌려주는 값: 아래 y */
  function heading(P, title, y, sub = '') {
    P.ctx.fillStyle = ACCENT;
    P.ctx.fillRect(M, y + 10, 8, 34);
    const tw = P.text(title, M + 22, y + 28, 32, 800, INK);
    if (sub) P.text(sub, M + 22 + tw + 18, y + 30, 22, 400, MUTE, 'left', W - 2 * M - tw - 44);
    return y + 64;
  }

  /* ── 쪽 틀: 흰 바탕, 바닥글(작성일·쪽 번호·초안 알림) ── */
  function blank(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
  }
  function footer(P, d, no, total) {
    P.text(`작성 ${d.made}`, M, H - 70, 20, 400, FAINT, 'left', W * 0.24);
    P.text(`${no} / ${total}`, W / 2, H - 70, 24, 400, MUTE, 'center');
    P.text(FOOTER, W - M, H - 70, 21, 600, MUTE, 'right', W * 0.44);
  }
  /** 2~4쪽 머리글 (제안서와 같은 모양: 주황 막대·쪽 번호·제목·행사 이름·회색 줄) */
  function frame(ctx, d, no, total, title) {
    blank(ctx);
    const P = pen(ctx);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(M, M - 8, 64, 8);
    P.text(String(no).padStart(2, '0'), M, M + 40, 30, 800, ACCENT);
    P.text(title, M + 64, M + 40, 40, 800, INK, 'left', W * 0.46);
    P.text(d.title, W - M, M + 40, 26, 600, MUTE, 'right', W * 0.36);
    ctx.fillStyle = LINE;
    ctx.fillRect(M, M + 82, W - 2 * M, 3);
    footer(P, d, no, total);
    return P;
  }

  /* ── 1쪽: 행사 개요 + 안전 조직표 + 비상 연락망 ── */
  function drawOverview(ctx, d, no, total) {
    blank(ctx);
    const P = pen(ctx), cw = W - 2 * M;
    ctx.fillStyle = ACCENT;
    ctx.fillRect(M, M - 8, 64, 8);
    P.text(HEADNOTE, M, M + 34, 25, 700, ACCENT, 'left', cw);
    P.text('안전관리계획서 (초안)', M, M + 110, 62, 800, INK, 'left', cw);
    P.text(d.title, M, M + 186, 36, 700, '#374151', 'left', cw);
    ctx.fillStyle = INK;
    ctx.fillRect(M, M + 230, cw, 4);
    footer(P, d, no, total);
    // 행사 개요: 이름 | 값 | 이름 | 값 (긴 것은 한 줄 전체)
    const ov = new Map(overview(d));
    const lab = (t) => ({ t, shade: true, weight: 700, color: MUTE, size: 22 });
    const OV = [{ w: 220 }, { w: 477 }, { w: 220 }, { w: 477 }];
    const ovRows = [
      [lab('행사 이름'), { t: ov.get('행사 이름'), span: 3, weight: 700 }],
      [lab('날짜'), { t: ov.get('날짜'), lines: 2 }, lab('시간'), { t: ov.get('시간'), lines: 2 }],
      [lab('장소'), { t: ov.get('장소'), span: 3, lines: 2 }],
      [lab('주최'), { t: ov.get('주최'), lines: 2 }, lab('주관'), { t: ov.get('주관'), lines: 2 }],
      [lab('예상 인원'), { t: ov.get('예상 인원'), lines: 2 }, lab('순간 최대 인원'), { t: ov.get('순간 최대 인원'), lines: 2 }],
      [lab('주요 프로그램'), { t: ov.get('주요 프로그램'), span: 3, lines: 5 }],
    ];
    // 안전 조직·비상 연락망 줄 높이: 남은 자리에 맞춤 (줄이 없으면 손으로 적을 빈 줄)
    const org = d.org.length ? d.org : Array.from({ length: 4 }, () => blankRow('org'));
    const cons = d.contacts.length ? d.contacts : Array.from({ length: 4 }, () => blankRow('contacts'));
    const pairs = [];
    for (let i = 0; i < cons.length; i += 2) pairs.push([cons[i], cons[i + 1] || null]);
    const y0 = M + 266, bottom = H - FOOT - 10;
    const ovH = table(P, M, 0, OV, ovRows, { size: 24, rowH: 60, dry: true });
    // 칸 너비: 역할·이름은 30자까지 두 줄에 들어가게 넓게, 연락처·무전 채널은 그만큼 좁게 (합계는 그대로)
    const ORG = [{ w: 380, head: '역할' }, { w: 430, head: '이름' }, { w: 330, head: '연락처' }, { w: 254, head: '무전 채널' }];
    const orgRows = (n) => org.map((o) => [{ t: o.role, weight: 700, lines: n }, { t: o.name, lines: n }, { t: o.phone, lines: n }, { t: o.radio, lines: n }]);
    const CON = [{ w: 420, head: '기관' }, { w: 277, head: '전화' }, { w: 420, head: '기관' }, { w: 277, head: '전화' }];
    const conRows = (n) => pairs.map(([a, b]) => [{ t: a.org, weight: 700, lines: n }, { t: a.phone, weight: 700, lines: n }, { t: b ? b.org : '', weight: 700, lines: n }, { t: b ? b.phone : '', weight: 700, lines: n }]);
    // 안전 조직·비상 연락망: 실제로 재어 남은 자리에 들어가는 가장 넉넉한 줄 높이·글자 (빈칸은 손으로 적기 좋게 넉넉히).
    // 긴 글은 두 줄까지 — 줄이 아주 많아 두 줄로는 가장 작은 글자로도 1쪽에 안 들어갈 때만 한 줄(…)로
    const room = bottom - y0 - (3 * 64 + 2 * 34) - ovH;
    let fit = { size: 18, rowH: 33, vpad: 8, n: 1 };
    search: for (const n of [2, 1]) {
      for (const size of [24, 22, 20, 18]) {
        const lh = Math.round(size * 1.4);
        for (let rowH = 76; rowH >= lh + 8; rowH -= 2) {
          const o = { size, rowH, vpad: Math.min(22, rowH - lh), dry: true };
          if (table(P, M, 0, ORG, orgRows(n), o) + table(P, M, 0, CON, conRows(n), o) <= room) { fit = { ...o, n }; break search; }
        }
      }
    }
    const opt = { size: fit.size, rowH: fit.rowH, vpad: fit.vpad };
    let y = heading(P, '행사 개요', y0);
    y = table(P, M, y, OV, ovRows, { size: 24, rowH: 60 }) + 34;
    y = heading(P, '안전 조직', y, '역할·이름·연락처·무전 채널');
    y = table(P, M, y, ORG, orgRows(fit.n), opt) + 34;
    y = heading(P, '비상 연락망', y);
    table(P, M, y, CON, conRows(fit.n), opt);
  }

  /* ── 2쪽: 배치도·대피 경로도 ── */
  /** 방위표 (위가 북쪽): 도면 위에 놓이므로 흰 바탕 원 */
  function north(ctx, x, y, size, f) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.arc(x, y - size * 0.2, size * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#212529';
    ctx.strokeStyle = '#212529';
    ctx.lineWidth = Math.max(2, size / 22);
    ctx.beginPath();
    ctx.moveTo(x, y - size / 2); ctx.lineTo(x + size * 0.28, y + size / 2); ctx.lineTo(x, y + size * 0.28); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - size / 2); ctx.lineTo(x - size * 0.28, y + size / 2); ctx.lineTo(x, y + size * 0.28); ctx.closePath();
    ctx.stroke();
    ctx.font = `800 ${Math.round(size * 0.42)}px ${f}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('N', x, y - size / 2 - size * 0.08);
    ctx.restore();
  }
  /** 겹쳐 보기의 ‘비상구’ 글자 상자 (safety.js drawLabels와 같은 자리·글꼴, 그림 px) */
  function exitTag(ctx, T, x) {
    const q = T.toPage(x.at);
    const k = curK;
    ctx.font = `800 ${12 * k}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif`;
    const w = ctx.measureText('비상구').width + 12 * k, y = q.y - 16 * k;
    return { x0: q.x - w / 2 - 2 * k, x1: q.x + w / 2 + 2 * k, y0: y - 12 * k, y1: y + 12 * k, cy: y };
  }
  /** 비상구 번호 동그라미(반지름 17) 자리: ‘비상구’ 글자 오른쪽. 도면 칸을 넘으면 왼쪽, 거기도 안 되면 아래 — 번호가 잘리지 않게 칸 안으로 */
  const BADGE_R = 20; // 반지름 + 흰 테두리
  function badgeAt(b, clip) {
    let cx = b.x1 + 20, cy = b.cy;
    if (clip && cx + BADGE_R > clip.x + clip.width) {
      if (b.x0 - 20 - BADGE_R >= clip.x) cx = b.x0 - 20;
      else { cx = (b.x0 + b.x1) / 2; cy = b.y1 + 22; }
    }
    if (clip) {
      cx = Math.min(Math.max(cx, clip.x + BADGE_R), clip.x + clip.width - BADGE_R);
      cy = Math.min(Math.max(cy, clip.y + BADGE_R), clip.y + clip.height - BADGE_R);
    }
    return { cx, cy };
  }
  /** 도면 위 글자(비상구·밀집도·영역 이름) 자리: 안전 요원 번호가 그 위에 겹치지 않게 (밀집도·영역 이름은 어림 크기) */
  function labelBoxes(ctx, d, T, ex, clip) {
    const out = [];
    const k = curK;
    const box = (p, dy, w, h) => { const q = T.toPage(p); out.push({ x0: q.x - (w / 2) * k, x1: q.x + (w / 2) * k, y0: q.y + (dy - h / 2) * k, y1: q.y + (dy + h / 2) * k }); };
    ex.forEach((x) => {
      const b = exitTag(ctx, T, x.x);
      if (!x.badge) { out.push(b); return; }
      const c = badgeAt(b, clip); // 번호 동그라미까지 한 상자로
      out.push({ x0: Math.min(b.x0, c.cx - BADGE_R), x1: Math.max(b.x1, c.cx + BADGE_R), y0: Math.min(b.y0, c.cy - BADGE_R), y1: Math.max(b.y1, c.cy + BADGE_R) });
    });
    (d.r.data.crowdZones || []).filter((z) => App.layers.visible(z)).forEach((z) => box(App.geom.interiorPoint(z.points), 34, 130, 24));
    d.L.zones.forEach((z) => box(App.geom.interiorPoint(z.points), 0, 90, 36));
    return out;
  }
  /** 비상구는 있는데 동선이 모두 숨긴 레이어에 있음 */
  const hiddenExits = (d) => (d.r.data.exits || []).length > 0 && !(d.r.data.exits || []).some((x) => x.routes.some((rt) => App.layers.visible(rt)));
  /** 비상구: 번호·출구 폭·이어진 대피 동선·가장 가까운 안전 요원 (도면에 ‘비상구’ 글자가 있는 곳만) */
  function exitRows(d) {
    return (d.r.data.exits || []).filter((x) => x.routes.some((rt) => App.layers.visible(rt))).map((x, i) => {
      let best = null;
      d.staff.forEach((s) => { const dist = Math.hypot(s.it.x - x.at.x, s.it.y - x.at.y); if (!best || dist < best.dist) best = { s, dist }; });
      return {
        no: i + 1, x, width: x.width,
        routes: x.routes.map((rt) => `${rt.name || '비상 대피 동선'} · ${n1(App.routes.length(rt) / 1000)}m`).join(', '),
        staff: best ? `${best.s.label} (약 ${n0(best.dist / 1000)}m)` : '',
      };
    });
  }
  /** 안전 요원 번호 꼬리표 S1…: 자리에 점을 찍고 겹치지 않는 쪽(위·아래·옆)에 꼬리표. 돌려주는 값: 그린 꼬리표 수 */
  function staffTags(ctx, P, d, T, clip, ex, extra = []) {
    const placed = [...labelBoxes(ctx, d, T, ex, clip), ...extra];
    const inside = (b) => b.x0 >= clip.x && b.x1 <= clip.x + clip.width && b.y0 >= clip.y && b.y1 <= clip.y + clip.height;
    const hit = (b) => placed.some((q) => q.x0 < b.x1 && b.x0 < q.x1 && q.y0 < b.y1 && b.y0 < q.y1);
    let n = 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(clip.x, clip.y, clip.width, clip.height);
    ctx.clip();
    d.staff.forEach((s) => {
      const p = T.toPage(s.it);
      P.font(22, 800);
      const w = Math.ceil(ctx.measureText(s.label).width) + 20, h = 34, g = 16;
      const offs = [[0, -(h / 2 + g)], [0, h / 2 + g], [w / 2 + g, 0], [-(w / 2 + g), 0], [w / 2 + g, -(h / 2 + g)], [-(w / 2 + g), -(h / 2 + g)],
        [w / 2 + g, h / 2 + g], [-(w / 2 + g), h / 2 + g], [0, -(h * 1.5 + g * 2)], [0, h * 1.5 + g * 2]];
      const boxes = offs.map(([dx, dy]) => ({ x0: p.x + dx - w / 2, x1: p.x + dx + w / 2, y0: p.y + dy - h / 2, y1: p.y + dy + h / 2 }));
      const b = boxes.find((x) => inside(x) && !hit(x)) || boxes.find(inside) || boxes[0];
      placed.push(b);
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      ctx.strokeStyle = STAFF;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = STAFF;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = STAFF;
      P.round(b.x0, b.y0, w, h, 9);
      ctx.fill();
      P.text(s.label, cx, cy + 1, 22, 800, '#ffffff', 'center');
      n++;
    });
    ctx.restore();
    return n;
  }
  /** 범례: [그리기(ctx, x, y), 글자] — 도면에 겹친 표시만 */
  function legendKeys(d, P) {
    const ctx = P.ctx, r = d.r, RULE = d.RULE;
    const keys = [
      [(x, y) => {
        ctx.strokeStyle = '#e03131'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30, y); ctx.stroke();
        ctx.fillStyle = '#e03131'; ctx.beginPath(); ctx.moveTo(x + 40, y); ctx.lineTo(x + 26, y - 9); ctx.lineTo(x + 26, y + 9); ctx.closePath(); ctx.fill();
        ctx.lineCap = 'butt';
      }, '비상 대피 동선'],
      [(x, y) => { ctx.fillStyle = '#2b8a3e'; P.round(x, y - 13, 40, 26, 7); ctx.fill(); }, '비상구'],
      [(x, y) => {
        ctx.fillStyle = STAFF; P.round(x, y - 15, 40, 30, 8); ctx.fill();
        P.text('S', x + 20, y + 1, 20, 800, '#ffffff', 'center');
      }, '안전 요원 (번호)'],
      [(x, y) => {
        ctx.beginPath(); ctx.arc(x + 20, y, 15, 0, Math.PI * 2); ctx.fillStyle = 'rgba(28,126,214,0.12)'; ctx.fill();
        ctx.setLineDash([6, 4]); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(28,126,214,0.8)'; ctx.stroke(); ctx.setLineDash([]);
      }, `소화기 닿는 거리 ${RULE.reach / 1000}m`],
    ];
    if (r.data.uncovered.length) keys.push([(x, y) => { ctx.lineWidth = 4; ctx.strokeStyle = '#e03131'; ctx.strokeRect(x + 6, y - 13, 28, 26); }, '소화기에서 먼 곳']);
    if (r.data.density != null) keys.push([(x, y) => { ['#2f9e44', '#e8590c', '#e03131'].forEach((c, i) => { ctx.fillStyle = c; ctx.globalAlpha = 0.55; ctx.fillRect(x + 4 + i * 11, y - 12, 10, 24); }); ctx.globalAlpha = 1; }, '관람 구역 밀집 (여유·주의·위험)']);
    if (App.current.night && !r.indoor) {
      keys.push([(x, y) => { ctx.beginPath(); ctx.arc(x + 20, y, 15, 0, Math.PI * 2); ctx.setLineDash([6, 4]); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(245,159,0,0.9)'; ctx.stroke(); ctx.setLineDash([]); }, '조명이 닿는 곳']);
      if ((r.data.dark || []).length) keys.push([(x, y) => { ctx.beginPath(); ctx.arc(x + 20, y, 9, 0, Math.PI * 2); ctx.fillStyle = 'rgba(33,37,41,0.6)'; ctx.fill(); }, '어두운 곳']);
    }
    return keys;
  }
  /** 범례를 줄에 나눠 담음: 돌려주는 값 [[{ draw, label, w }]] */
  function legendRows(P, keys, width) {
    const rows = [[]];
    let x = 0;
    keys.forEach(([draw, label]) => {
      P.font(22, 600);
      const w = 52 + P.ctx.measureText(label).width + 34;
      if (x > 0 && x + w > width) { rows.push([]); x = 0; }
      rows[rows.length - 1].push({ draw, label, w });
      x += w;
    });
    return rows;
  }
  function drawPlanPage(ctx, d, no, total) {
    const P = frame(ctx, d, no, total, '배치도·대피 경로도');
    const f = FONT(), cw = W - 2 * M, r = d.r;
    const evac = r.checks.find((c) => c.id === 'evac');
    const shown = exitRows(d).length; // 배치도·표·글과 같은 비상구 (숨긴 동선은 뺌)
    const sum = [`예상 ${n0(r.expected)}명${r.auto ? ' (어림)' : ''}`, `비상구 ${shown}곳`, `안전 요원 ${n0(d.staffN)}명${d.staffN ? ` (S1~S${d.staffN})` : ''}`,
      `소화기 ${d.count('소화기')}개`, evac && shown ? `대피 ${evac.value}` : ''].filter(Boolean).join(' · ');
    P.text(sum, M, TOP + 40, 27, 700, INK, 'left', cw);
    const rows = legendRows(P, legendKeys(d, P), cw);
    const top = TOP + 88, maxH = H - FOOT - 30 - rows.length * 48 - top;
    let boxH = d.rect ? maxH : Math.min(maxH, 900); // 빈 도면: 손으로 그릴 칸 (아래에 비상구·집결지 칸)
    // 가로로 긴 도면이면 칸 높이를 도면 모양에 맞춰 줄임 (범례가 도면 바로 아래에 오게)
    if (d.rect) {
      const rw = Math.max(1, d.rect.maxX - d.rect.minX), rh = Math.max(1, d.rect.maxY - d.rect.minY);
      boxH = Math.min(maxH, Math.max(900, (cw - 32) * (rh / rw) + 32 + 64));
    }
    // 남는 자리에 비상구 표 + 집결지 (도면 칸이 쪽을 다 쓰면 뺌). 표를 넣을 때만 도면의 비상구 옆에 번호
    const ex = exitRows(d);
    const exTop = top + boxH + 22 + rows.length * 48 + 16, exRoom = H - FOOT - 24 - exTop;
    const exRows = Math.max(1, Math.min(ex.length, Math.floor((exRoom - 64 - 50 - 24 - 60) / 56)));
    const showEx = exRoom >= 64 + 50 + 56 + 24 + 60;
    if (showEx) ex.forEach((x) => { x.badge = true; });
    const box = { x: M, y: top, width: cw, height: boxH };
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    let tags = 0;
    if (d.rect) {
      const inner = { x: box.x + 16, y: box.y + 16, width: box.width - 32, height: box.height - 32 - 64 };
      // 화면 배율 하한(0.002px/mm) 때문에 300m쯤 넘는 부지는 잘리므로, 그만큼 글자·기호 배율을 줄여 칸에 다 넣음
      const rw = Math.max(1, d.rect.maxX - d.rect.minX), rh = Math.max(1, d.rect.maxY - d.rect.minY);
      curK = Math.min(K, (inner.width / (rw * 0.002)) * 0.99, (inner.height / (rh * 0.002)) * 0.99);
      const scale = App.safety.withOverlay(() => App.exporter.drawPlan(ctx, inner, d.rect, curK));
      const T = App.exporter.planTransform(inner, d.rect, curK);
      if (showEx) {
        // 비상구 번호: 겹쳐 보기의 ‘비상구’ 글자 옆에 초록 동그라미 (칸 끝이면 왼쪽·아래로)
        ctx.save();
        ctx.beginPath();
        ctx.rect(inner.x, inner.y, inner.width, inner.height);
        ctx.clip();
        ex.forEach((x) => {
          const { cx, cy } = badgeAt(exitTag(ctx, T, x.x), inner);
          ctx.beginPath();
          ctx.arc(cx, cy, 17, 0, Math.PI * 2);
          ctx.fillStyle = '#2b8a3e';
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
          P.text(String(x.no), cx, cy + 1, 20, 800, '#ffffff', 'center');
        });
        ctx.restore();
      }
      const nx = inner.x + inner.width - 58, ny = inner.y + 84; // 방위표 자리 (번호 꼬리표가 그 밑에 깔리지 않게)
      tags = staffTags(ctx, P, d, T, inner, ex, [{ x0: nx - 54, x1: nx + 54, y0: ny - 68, y1: ny + 42 }]);
      north(ctx, nx, ny, 64, f);
      App.exporter.scaleBar(ctx, box.x + 36, box.y + box.height - 30, scale, Math.round(W * 0.12), `600 26px ${f}`);
    } else {
      P.text('도면에 그린 것이 없습니다. 이 칸에 배치도를 그려 넣으세요.', box.x + box.width / 2, box.y + box.height / 2, 30, 600, FAINT, 'center', box.width - 80);
    }
    // 범례
    let ly = box.y + box.height + 40;
    rows.forEach((row) => {
      let lx = M;
      row.forEach((k) => {
        k.draw(lx, ly);
        P.text(k.label, lx + 52, ly + 1, 22, 600, MUTE);
        lx += k.w;
      });
      ly += 48;
    });
    if (showEx) {
      let y = heading(P, '비상구·대피 동선', exTop, ex.length ? '번호는 배치도의 비상구 옆 숫자 · 맡은 요원이 출구를 열고 안내' : '');
      const cells = ex.slice(0, exRows).map((x) => [{ t: `비상구 ${x.no}`, weight: 700 }, `${n1(x.width / 1000)}m`, { t: x.routes, lines: 2 }, { t: x.staff, weight: 600, color: STAFF }]);
      if (!ex.length) cells.push([{ t: hiddenExits(d) ? '비상 대피 동선이 숨긴 레이어에 있습니다 — 레이어 메뉴에서 동선을 켜면 배치도와 이 표에 나옵니다.' : '비상 대피 동선이 도면에 없습니다. 비상구와 대피 길을 현장에서 정해 적어 넣으세요.', span: 4, color: MUTE }]);
      else if (ex.length > exRows) cells.push([{ t: `… 외 ${ex.length - exRows}곳`, span: 4, color: MUTE }]);
      y = table(P, M, y, [{ w: 200, head: '비상구' }, { w: 150, head: '출구 폭', align: 'right' }, { w: 604, head: '이어진 대피 동선' }, { w: 440, head: '가까운 안전 요원' }], cells, { size: 22, rowH: 56 }) + 24;
      const lab = (t) => ({ t, shade: true, weight: 700, color: MUTE, size: 22 });
      table(P, M, y, [{ w: 220 }, { w: 477 }, { w: 220 }, { w: 477 }], [[lab('집결지 (모이는 곳)'), '', lab('대피 안내 방송'), '']], { size: 22, rowH: 60 });
    }
    return tags;
  }

  /* ── 3쪽: 시설·인력 현황 + 구역별 안전 요원 배치표 ── */
  function drawFacilityPage(ctx, d, no, total) {
    const P = frame(ctx, d, no, total, '시설·인력 현황');
    const r = d.r, RULE = d.RULE, cw = W - 2 * M;
    P.text(`예상 ${n0(r.expected)}명 기준${r.auto ? ' (수용 인원 어림)' : ''} · 현장에서 흔히 쓰는 어림값 (법정 기준이 아님)`, M, TOP + 40, 25, 500, '#374151', 'left', cw);
    let y = TOP + 80;
    const fac = facility(d);
    y = table(P, M, y, [{ w: 220, head: '항목' }, { w: 400, head: '현황' }, { w: 440, head: '기준 (어림)' }, { w: 334, head: '점검' }],
      fac.map((x) => [{ t: x.item, weight: 700 }, { t: x.now, weight: 600, lines: 2 }, { t: x.rule, color: '#4b5563', lines: 2, size: 21 }, { t: x.res, badge: x.level, lines: 2, size: 21, weight: 600, color: LV_COLOR[(App.safety.LV[x.level] || App.safety.LV.info).cls] }]),
      { size: 23, rowH: 66 }) + 40;
    y = heading(P, '구역별 안전 요원 배치표', y, '번호는 2쪽 배치도의 S 번호 · 이름은 현장에서 적어 넣기');
    // 줄이 많으면 줄 높이를 줄이고, 그래도 넘치면 요원·관람 구역이 있는 줄을 먼저 남김 — 실제로 재어 아래 안내 글 자리까지 남김
    const limit = H - FOOT - 20 - 128;
    const all = d.L.rows;
    const ZC = [{ w: 300, head: '구역' }, { w: 170, head: '넓이', align: 'right' }, { w: 250, head: '권장 최대 인원', align: 'right' }, { w: 400, head: '안전 요원 (번호)' }, { w: 274, head: '이름' }];
    const zoneCells = (z) => [{ t: z.name, weight: 700 }, z.area != null ? App.units.formatArea(z.area) : '—', z.max != null ? `${n0(z.max)}명` : '—', { t: z.staffText, weight: 600, color: z.nums.length ? STAFF : INK }, ''];
    const pick = (n) => {
      if (n >= all.length) return all;
      const keep = new Set(all.filter((z) => z.nums.length || z.crowd).slice(0, n));
      all.forEach((z) => { if (keep.size < n && !keep.has(z)) keep.add(z); });
      return all.filter((z) => keep.has(z));
    };
    const build = (n, blanks) => {
      const rows = pick(n), out = rows.map(zoneCells);
      if (rows.length < all.length) out.push([{ t: `… 외 ${all.length - rows.length}곳 (‘글만 복사’에 모두 있음)`, span: 5, color: MUTE }]);
      for (let i = 0; i < blanks; i++) out.push(['', '', '', '', '']);
      return out;
    };
    let best = null;
    search: for (let n = all.length; n >= 1; n--) {
      for (let rowH = 58; rowH >= 40; rowH -= 2) {
        const o = { size: 22, rowH, vpad: Math.min(22, rowH - 31), dry: true };
        if (y + table(P, M, 0, ZC, build(n, 0), o) <= limit) { best = { n, o }; break search; }
      }
    }
    if (!best) best = { n: 1, o: { size: 22, rowH: 40, vpad: 9 } };
    // 줄이 적으면 손으로 적을 빈 줄 (입구·주차장처럼 도면에 영역이 없는 자리) — 6줄까지, 들어가는 만큼
    let blanks = Math.max(0, 6 - (best.n + (best.n < all.length ? 1 : 0)));
    while (blanks > 0 && y + table(P, M, 0, ZC, build(best.n, blanks), best.o) > limit) blanks--;
    const cells = build(best.n, blanks);
    y = table(P, M, y, ZC, cells, { size: best.o.size, rowH: best.o.rowH, vpad: best.o.vpad });
    const notes = [`권장 최대 인원은 관람 구역만 (1㎡에 ${RULE.densityOk}명).`];
    if (blanks) notes.push('빈 줄에는 입구·주차장처럼 도면에 없는 자리를 적어 넣으세요.');
    if (!d.staffN) notes.push('안전 요원 자리가 아직 도면에 없어 번호 칸은 현장에서 적어 넣습니다.');
    const nl = P.wrap(notes.join(' '), 21, cw);
    nl.slice(0, 3).forEach((l, i) => P.text(l, M, y + 32 + i * 32, 21, 400, MUTE, 'left', cw));
  }

  /* ── 4쪽: 비상 대응 요령 + 비상 연락처 ── */
  function drawResponsePage(ctx, d, no, total) {
    const P = frame(ctx, d, no, total, '비상 대응 요령');
    const cw = W - 2 * M, gap = 36, colW = (cw - gap) / 2, pad = 26, numW = 44;
    P.text('상황마다 먼저 할 일입니다. 현장에 맞게 고쳐 쓰고, 모든 요원과 미리 나눠 보세요.', M, TOP + 40, 25, 500, '#374151', 'left', cw);
    const cons = d.contacts.length ? d.contacts : Array.from({ length: 4 }, () => blankRow('contacts'));
    const pairs = [];
    for (let i = 0; i < cons.length; i += 2) pairs.push([cons[i], cons[i + 1] || null]);
    const conH = 64 + 50 + pairs.length * 50;
    const top = TOP + 84, bottom = H - FOOT - 10 - conH - 34;
    const blocks = response(d);
    // 글자 크기: 다 들어갈 때까지 줄임
    let L = null;
    for (const size of [25, 24, 23, 22, 21, 20]) {
      const lh = Math.round(size * 1.42);
      const sized = blocks.map((b) => {
        const steps = b.steps.map((s) => P.wrap(s, size, colW - 2 * pad - numW));
        return { ...b, steps, h: pad + 52 + steps.reduce((t, l) => t + l.length * lh + 10, 0) + pad - 10 };
      });
      const rowsH = [];
      for (let i = 0; i < sized.length; i += 2) rowsH.push(Math.max(sized[i].h, sized[i + 1] ? sized[i + 1].h : 0));
      L = { size, lh, sized, rowsH, height: rowsH.reduce((t, h) => t + h, 0) + (rowsH.length - 1) * 28 };
      if (top + L.height <= bottom) break;
    }
    let y = top;
    for (let i = 0; i < L.sized.length; i += 2) {
      const rh = L.rowsH[i / 2];
      [L.sized[i], L.sized[i + 1]].forEach((b, j) => {
        if (!b) return;
        const x = M + j * (colW + gap);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = LINE;
        ctx.lineWidth = 3;
        P.round(x, y, colW, rh, 16);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = b.color;
        P.round(x, y, 12, rh, [16, 0, 0, 16]);
        ctx.fill();
        P.text(b.title, x + pad + 6, y + pad + 22, 32, 800, b.color);
        let sy = y + pad + 52 + L.lh / 2 + 4;
        b.steps.forEach((lines, k) => {
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.arc(x + pad + 6 + 15, sy, 15, 0, Math.PI * 2);
          ctx.fill();
          P.text(String(k + 1), x + pad + 6 + 15, sy + 1, 19, 800, '#ffffff', 'center');
          lines.forEach((l, li) => P.text(l, x + pad + 6 + numW, sy + li * L.lh, L.size, 400, INK, 'left', colW - 2 * pad - numW));
          sy += lines.length * L.lh + 10;
        });
      });
      y += rh + 28;
    }
    y = heading(P, '비상 연락처', y + 4);
    const CON = [{ w: 420, head: '기관' }, { w: 277, head: '전화' }, { w: 420, head: '기관' }, { w: 277, head: '전화' }];
    table(P, M, y, CON, pairs.map(([a, b]) => [{ t: a.org, weight: 700, lines: 2 }, { t: a.phone, weight: 800, lines: 2 }, { t: b ? b.org : '', weight: 700, lines: 2 }, { t: b ? b.phone : '', weight: 800, lines: 2 }]), { size: 23, rowH: 50 });
  }

  /* ── 만들기 ── */
  let running = false;
  /** o: { noSave } — 돌려주는 값: { blob, name, pages, tags(배치도에 그린 번호 꼬리표 수), staff: ['S1', …], zones } 또는 null */
  async function build(o = {}) {
    if (running) return null;
    running = true;
    try {
      return await buildNow(o);
    } finally {
      running = false;
      App.ui.busy(false);
    }
  }
  async function buildNow(o) {
    const step = async (msg) => { App.ui.busy(msg); await new Promise((r) => setTimeout(r, 20)); };
    await step('안전관리계획서를 준비하는 중…');
    if (App.images && App.images.loadAll) await App.images.loadAll([...App.doc.all()]); // 현수막·바닥 그림 (배치도)
    const d = gather();
    const jobs = [drawOverview, drawPlanPage, drawFacilityPage, drawResponsePage];
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const out = [];
    let tags = 0;
    for (let i = 0; i < jobs.length; i++) {
      await step(`안전관리계획서를 만드는 중… (${i + 1}/${jobs.length}쪽)`);
      const t = jobs[i](ctx, d, i + 1, jobs.length);
      if (jobs[i] === drawPlanPage) tags = t;
      out.push({ jpeg: App.exporter.jpegBytes(canvas, 0.9), w: W, h: H });
    }
    const blob = App.exporter.pdfFromPages(out, PT(W), PT(H));
    const name = `안전관리계획서_${safeName(d.title)}_${App.exporter.stamp()}.pdf`;
    if (!o.noSave) {
      App.ui.busy(false);
      App.exporter.saved(App.exporter.download(name, blob, 'application/pdf'), `‘${name}’을 저장했습니다 (A4 ${out.length}쪽 초안). 대상·기한·양식은 관할 지자체에 확인하세요.`);
    }
    return { blob, name, pages: out.length, tags, staff: d.staff.map((s) => s.label), zones: d.L.rows.map((z) => ({ name: z.name, staff: z.staffText })) };
  }

  /* ── 글만 복사: PDF와 같은 내용을 글자로 ── */
  function text() {
    const d = gather();
    const out = [`안전관리계획서 (초안) — ${d.title}`, HEADNOTE, `작성 ${d.made}`, '', '■ 행사 개요'];
    overview(d).forEach(([k, v]) => out.push(`${k}: ${v}`));
    out.push('', '■ 안전 조직 (역할 / 이름 / 연락처 / 무전 채널)');
    d.org.forEach((x) => out.push(`- ${[x.role, x.name, x.phone, x.radio].map((s) => s.trim()).join(' / ')}`));
    out.push('', '■ 비상 연락망');
    d.contacts.forEach((x) => out.push(`- ${x.org.trim()}: ${x.phone.trim()}`));
    out.push('', '■ 비상구·대피 동선');
    const ex = exitRows(d);
    if (!ex.length) out.push(hiddenExits(d) ? '- 비상 대피 동선이 숨긴 레이어에 있습니다 (레이어를 켜면 배치도에 나옴)' : '- 비상 대피 동선이 도면에 없습니다 (현장에서 정해 적어 넣기)');
    ex.forEach((x) => out.push(`- 비상구 ${x.no}: 출구 폭 ${n1(x.width / 1000)}m · ${x.routes}${x.staff ? ` · 가까운 안전 요원 ${x.staff}` : ''}`));
    out.push('- 집결지 (모이는 곳): ', '- 대피 안내 방송: ');
    out.push('', `■ 시설·인력 현황 (예상 ${n0(d.r.expected)}명 기준, 현장 어림값)`);
    facility(d).forEach((x) => out.push(`- ${x.item}: ${x.now} · 기준 ${x.rule} · ${(App.safety.LV[x.level] || App.safety.LV.info).word}${x.res && x.res !== '—' ? ` (${x.res})` : ''}`));
    out.push('', '■ 구역별 안전 요원 배치 (번호는 배치도의 S 번호)');
    d.L.rows.forEach((z) => out.push(`- ${z.name}${z.area != null ? ` (${App.units.formatArea(z.area)}${z.max != null ? `, 권장 최대 ${n0(z.max)}명` : ''})` : ''}: ${z.staffText || '안전 요원 없음'}`));
    out.push('', '■ 비상 대응 요령');
    response(d).forEach((b) => { out.push(`[${b.title}]`); b.steps.forEach((s, i) => out.push(`${i + 1}. ${s}`)); });
    out.push('', FOOTER);
    return out.join('\n');
  }
  /** 클립보드에 복사 (안 되면 숨긴 글 칸으로, 그래도 안 되면 창 안에 글을 보여 줌) */
  async function copy(root) {
    const t = text();
    let done = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(t); done = true; }
    } catch (_) {
      done = false;
    }
    if (!done) {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { done = document.execCommand('copy'); } catch (_) { done = false; }
      ta.remove();
    }
    if (done) {
      App.ui.toast('안전관리계획서 글을 복사했습니다. 문서·메신저에 붙여 넣으세요.');
    } else if (root) {
      // 복사를 막는 기기: 글을 보여 주고 직접 고르게
      let box = root.querySelector('.spp-copy');
      if (!box) {
        box = document.createElement('textarea');
        box.className = 'field-text spp-copy';
        box.rows = 8;
        box.readOnly = true;
        box.setAttribute('aria-label', '안전관리계획서 글');
        root.appendChild(box);
      }
      box.value = t;
      box.focus();
      box.select();
      App.ui.toast('복사하지 못했습니다. 아래 글을 길게 눌러 모두 고른 뒤 복사하세요.');
    }
    return t;
  }

  /* ── 창 ── */
  function fieldHtml(f, v, r, cap) {
    let hint = f.hint || '';
    if (f.k === 'expected') hint = r.auto ? '안전 점검과 같은 값 · 지금은 좌석·관람 구역으로 어림' : '안전 점검과 같은 값';
    if (f.k === 'peak') hint = cap ? `관람 구역 권장 상한 ${n0(cap)}명` : '';
    const ph = f.k === 'expected' ? n0(r.capacity) : f.ph || ''; // 예상 인원을 비우면 수용 인원 어림으로 셈
    const label = `<label class="field-label" for="${f.id}">${f.label}${hint ? ` <small>${esc(hint)}</small>` : ''}</label>`;
    const cls = `field${f.wide ? ' spp-wide' : ''}`;
    if (f.area) return `<div class="${cls}">${label}<textarea id="${f.id}" class="field-text" data-k="${f.k}" rows="3" maxlength="${f.max}" placeholder="${esc(ph)}">${esc(v)}</textarea></div>`;
    return `<div class="${cls}">${label}<div class="field-box"><input id="${f.id}" type="text" data-k="${f.k}" ${f.num ? 'inputmode="numeric" maxlength="9"' : `maxlength="${f.max}"`} value="${esc(v)}" placeholder="${esc(ph)}" autocomplete="off">${f.num ? '<span class="field-unit">명</span>' : ''}</div></div>`;
  }
  function rowHtml(kind, x, i) {
    const del = (who) => `<button type="button" class="btn spp-del" data-act="spp-del" aria-label="${who} 줄 지우기" title="이 줄 지우기">×</button>`;
    const inp = (f, val, ph, label, o = '') => `<input type="${f === 'phone' ? 'tel' : 'text'}" data-f="${f}" value="${esc(val)}" placeholder="${ph}" aria-label="${label}" autocomplete="off" ${o}>`;
    if (kind === 'org') {
      const who = esc(x.role.trim() || `${i + 1}번째 사람`);
      return `<div class="spp-row spp-org" data-i="${i}">${inp('role', x.role, '역할', `역할 (${i + 1}번째 줄)`, 'maxlength="30"')}${inp('name', x.name, '이름', `${who} 이름`, 'maxlength="30"')}${inp('phone', x.phone, '연락처', `${who} 연락처`, 'maxlength="30" inputmode="tel"')}${inp('radio', x.radio, '무전 채널', `${who} 무전 채널`, 'maxlength="12"')}${del(who)}</div>`;
    }
    const who = esc(x.org.trim() || `${i + 1}번째 연락처`);
    return `<div class="spp-row spp-con" data-i="${i}">${inp('org', x.org, '기관', `기관 (${i + 1}번째 줄)`, 'maxlength="40"')}${inp('phone', x.phone, '전화', `${who} 전화`, 'maxlength="30" inputmode="tel"')}${del(who)}</div>`;
  }
  function listHtml(kind) {
    const head = kind === 'org' ? '<div class="spp-row spp-org spp-head" aria-hidden="true"><span>역할</span><span>이름</span><span>연락처</span><span>무전 채널</span><span></span></div>'
      : '<div class="spp-row spp-con spp-head" aria-hidden="true"><span>기관</span><span>전화</span><span></span></div>';
    const rows = rowsOf(kind);
    return `${head}${rows.map((x, i) => rowHtml(kind, x, i)).join('')}${rows.length ? '' : `<p class="props-meta spp-empty">${kind === 'org' ? '사람이 없습니다. PDF에는 손으로 적을 빈 줄이 들어갑니다.' : '연락처가 없습니다. PDF에는 손으로 적을 빈 줄이 들어갑니다.'}</p>`}`;
  }
  function bodyHtml() {
    const v = values(), r = App.safety.run();
    const cap = r.crowdArea > 0 ? Math.floor(r.crowdArea * App.safety.RULE.densityOk + r.seats) : 0;
    const val = (f) => (f.k === 'expected' ? String(r.expected || '') : v[f.k]);
    const add = (kind, label) => `<button type="button" class="btn btn-add" data-act="spp-add" data-list="${kind}" ${rowsOf(kind).length >= MAX[kind] ? 'disabled' : ''} title="${MAX[kind]}줄까지">${label}</button>`;
    return `
      <p class="dialog-note">지역축제·공연 안전관리계획을 신고할 때 쓸 초안을 A4 4쪽 PDF로 만듭니다: 행사 개요·안전 조직·비상 연락망, 배치도·대피 경로도(안전 요원 S1…), 시설·인력 현황, 비상 대응 요령. 신고 대상·기한·양식은 관할 지자체에 확인하세요.</p>
      <h3 class="spp-h">행사 개요</h3>
      <div class="field-grid spp-grid">${FIELDS.map((f) => fieldHtml(f, val(f), r, cap)).join('')}</div>
      <h3 class="spp-h">안전 조직 <small>역할·이름·연락처·무전 채널</small></h3>
      <div class="spp-list" data-list="org">${listHtml('org')}</div>
      ${add('org', '+ 사람 추가')}
      <h3 class="spp-h">비상 연락처</h3>
      <div class="spp-list" data-list="contacts">${listHtml('contacts')}</div>
      ${add('contacts', '+ 연락처 추가')}
      <p class="dialog-note">이름·전화번호는 이 도면 파일(백업 포함)에 저장됩니다.</p>
      <div class="btn-row spp-tools">
        <button type="button" class="btn btn-primary" data-act="spp-pdf">PDF 만들기</button>
        <button type="button" class="btn" data-act="spp-copy">글만 복사</button>
      </div>
      <p class="props-meta">시설·인력 현황은 안전 점검의 어림값(화장실·소화기·의료·전기·조명·대피·고정 추·안전 요원·밀집)입니다. 법정 기준을 대신하지 않습니다.</p>`;
  }
  /** 줄 목록을 다시 그림 (추가·지우기 뒤) */
  function redrawList(root, kind, focus) {
    const box = root.querySelector(`.spp-list[data-list="${kind}"]`);
    box.innerHTML = listHtml(kind);
    const add = root.querySelector(`[data-act="spp-add"][data-list="${kind}"]`);
    if (add) add.disabled = rowsOf(kind).length >= MAX[kind];
    if (focus) { const el = box.querySelector(focus); if (el) el.focus(); }
  }
  function bind(body) {
    const root = body.querySelector('.spp');
    root.addEventListener('input', (e) => {
      const el = e.target;
      if (el.dataset.k === 'expected') {
        // 예상 인원은 안전 점검과 같은 값 (비우면 수용 인원 어림)
        App.current.expected = num(el.value) || null;
      } else if (el.dataset.k) {
        storedW()[el.dataset.k] = el.value;
      } else {
        const row = el.closest('[data-i]'), list = el.closest('[data-list]');
        if (!row || !list || !el.dataset.f) return;
        editRows(list.dataset.list, (l) => { if (l[+row.dataset.i]) l[+row.dataset.i][el.dataset.f] = el.value; });
      }
      App.ui.emit('current'); // 잠시 뒤 저장
    });
    root.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset.k === 'expected' || el.dataset.k === 'peak') {
        const v = num(el.value);
        el.value = v ? String(v) : '';
        if (el.dataset.k === 'peak') storedW().peak = el.value;
      }
      save();
    });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const list = b.closest('[data-list]'), kind = b.dataset.list || (list && list.dataset.list);
      if (b.dataset.act === 'spp-add') {
        let n = 0;
        editRows(kind, (l) => { if (l.length < MAX[kind]) l.push(blankRow(kind)); n = l.length; });
        save();
        redrawList(root, kind, `[data-i="${n - 1}"] input`);
      } else if (b.dataset.act === 'spp-del') {
        const i = +b.closest('[data-i]').dataset.i;
        editRows(kind, (l) => { l.splice(i, 1); });
        save();
        const left = rowsOf(kind).length;
        redrawList(root, kind, left ? `[data-i="${Math.min(i, left - 1)}"] [data-act="spp-del"]` : null);
      } else if (b.dataset.act === 'spp-pdf') {
        settle();
        build().catch((err) => { console.warn('안전관리계획서 PDF 실패', err); App.ui.toast('PDF를 만들지 못했습니다. 다시 눌러 보세요.'); });
      } else if (b.dataset.act === 'spp-copy') {
        settle();
        copy(root);
      }
    });
    root.addEventListener('keydown', (e) => {
      // 창은 data-keys="local": Enter는 다음 칸으로 (한글 조합 중에는 그대로), Esc는 닫기
      if (e.key === 'Escape') {
        e.preventDefault();
        const close = document.querySelector('#dialogFoot [data-id="close"]');
        if (close) close.click();
      } else if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        const all = [...root.querySelectorAll('input, textarea')].filter((x) => !x.disabled && !x.readOnly && x.offsetParent !== null);
        const i = all.indexOf(e.target);
        if (i >= 0 && i < all.length - 1) all[i + 1].focus();
        else e.target.blur();
      }
    });
  }
  async function open() {
    if (!App.modes.is('event')) { App.ui.toast('안전관리계획서는 조감도(행사) 모드에서 만듭니다.'); return false; }
    await App.ui.dialog({
      title: '안전관리계획서 (초안)',
      html: `<div class="spp" data-keys="local">${bodyHtml()}</div>`,
      actions: [{ id: 'close', label: '닫기', primary: true }],
      onOpen: bind,
    });
    settle();
    if (App.summary && App.summary.render) App.summary.render(); // 예상 인원을 고쳤으면 안전 점검 묶음도
    return true;
  }

  /** 시험·확인용: 안전 요원 번호 [{ id, label, n, zone }] */
  const staff = () => layout().staff.map((s) => ({ id: s.id, label: s.label, n: s.n, zone: s.zone }));

  App.safetyplan = { open, build, text, copy, staff, facility: () => facility(gather()), ROLES, CONTACTS };
})();
