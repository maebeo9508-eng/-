/* 공정표: 집계한 물량으로 공정마다 일수·인원을 어림해 간트 차트로 보여 주고 PDF(A4 가로)·CSV로 내보냄.
   - 인테리어: 보양 → 철거 → 설비·전기 → 목공·창호 → 타일 → 도장 → 도배 → 바닥 → 가구·설치 → 마무리 청소
   - 조감도: 반입·자리 표시 → 무대·구조물·텐트·부스 → 전기·조명·음향·영상 → 좌석·펜스·안내 → 리허설 → 행사 → 철수
   - 하루 8시간, 한 사람 작업량으로 어림한 값(현장마다 다름). 일수·인원·순서를 고치면 이 도면에 저장되고
     (App.current.schedule.tasks) 도면을 바꿔도 그대로, ‘물량대로 다시 어림’을 누르면 다시 도면 물량을 따름
   - 날짜: 인테리어는 착공일부터, 조감도는 행사일(첫날)에 맞춰 거꾸로 설치 시작일을 정함. 쉬는 날(일요일·토일·없음)은 건너뜀 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const HOURS = 8; // 하루 작업 시간
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  const isEvent = () => App.modes.is('event');
  /** 일수 단위: 인테리어 0.5일(반나절), 조감도 0.25일(2시간) — 행사 설치는 몇 시간 단위로 움직임 */
  const step = () => (isEvent() ? 0.25 : 0.5);
  const roundD = (v) => { const k = step(); return Math.max(k, Math.ceil(v / k - 1e-9) * k); };
  const r1 = (v) => Math.round(v * 10) / 10;
  const fmt = (v) => Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  const m2 = (mm2) => mm2 / 1e6;
  const m2t = (mm2) => `${fmt(r1(m2(mm2)))}㎡`;
  const mt = (mm) => `${fmt(r1(mm / 1000))}m`;
  const projectName = () => (App.projects && App.projects.current ? App.projects.current.name : '도면');
  const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || '도면';
  const save = () => { if (App.projects && App.projects.saveNow) App.projects.saveNow(); };

  /* 공정 색 (간트 막대) */
  const COLORS = {
    prep: '#868e96', demo: '#e03131', mech: '#1c7ed6', elec: '#f08c00', wood: '#a0522d', win: '#15aabf', tile: '#7048e8',
    paint: '#2f9e44', paper: '#d6336c', floor: '#d9480f', furn: '#5c940d', clean: '#495057',
    stage: '#c2255c', tent: '#e8590c', power: '#f59f00', av: '#1971c2', seat: '#2b8a3e', site: '#0c8599', sports: '#6741d9',
    rehearsal: '#868e96', event: '#c54b08', teardown: '#495057',
  };
  const colorOf = (t) => (t.kind === 'event' ? COLORS.event : COLORS[t.key] || '#5c7cfa');

  /** 기간 글자: 조감도의 설치·철수는 하루 안이면 시간으로 (2시간 단위), 나머지는 일 */
  const inHours = (t) => isEvent() && t.kind !== 'event';
  const durText = (t) => (inHours(t) && t.days < 1 ? `${fmt(t.days * HOURS)}시간` : `${fmt(t.days)}일`);

  /* ── 인테리어: 물량 ÷ 한 사람 하루 작업량(어림) = 인·일 → 인원으로 나눠 0.5일 단위 ── */
  const FLOOR_RATE = { plank: 25, wide: 22, chevron: 15, vinyl: 60, deco: 35, carpet: 40, concrete: 30, epoxy: 30 }; // ㎡/인·일
  function interiorTasks(s) {
    const out = [];
    const sumSec = (sec) => s.records.filter((r) => r.sec === sec).reduce((t, r) => t + r.qty, 0);
    const mat = (keys) => s.matLines.filter((l) => keys.includes(l.mat)).reduce((t, l) => t + l.area, 0);
    const fin = (target) => s.finishes.filter((f) => f.target === target).reduce((t, f) => t + f.area, 0);
    const has = (key) => out.some((t) => t.key === key);
    /** parts: [양, 한 사람 하루 작업량, 근거 글자] — 양이 0인 것은 빼고, 하나도 없으면 공정을 만들지 않음 */
    const task = (key, name, crew, parts, o = {}) => {
      const used = parts.filter(([q]) => q > 0);
      if (!used.length) return;
      const md = used.reduce((t, [q, rate]) => t + q / rate, 0);
      out.push({ key, name, crew, days: roundD(md / crew), with: !!o.with, kind: 'work', note: used.map((p) => p[2]).join(' · ') });
    };
    const ph = s.phases;
    if (ph) {
      const ops = ph.demoDoors + ph.demoWindows;
      task('demo', '철거', 3, [
        [m2(ph.demo.area), 8, `철거 벽 ${m2t(ph.demo.area)}`],
        [ops, 6, `문·창문 ${ops}개`],
        [m2(ph.demoFloor), 30, `바닥재 ${m2t(ph.demoFloor)}`],
        [m2(ph.demoCeil), 20, `천장 ${m2t(ph.demoCeil)}`],
        [m2(ph.demoWall), 50, `벽지·도장 ${m2t(ph.demoWall)}`],
      ]);
    }
    const mech = sumSec('mech'), pipe = sumSec('line:배관'), duct = sumSec('line:덕트');
    task('mech', '설비', 2, [[mech, 3, `설비 기구 ${mech}개`], [pipe / 1000, 15, `배관 ${mt(pipe)}`], [duct / 1000, 10, `덕트 ${mt(duct)}`]]);
    const elec = sumSec('elec'), conduit = sumSec('line:전선관');
    task('elec', '전기', 2, [[elec, 10, `전기 기구 ${elec}개`], [conduit / 1000, 30, `전선관 ${mt(conduit)}`]], { with: has('mech') });
    // 목공: 새로 세우는 벽(리모델링이면 신설 벽만)·문틀·벽 마감재(아트보드 등)
    const wallArea = ph ? ph.new.area : s.arch.wallArea, doors = sumSec('door'), wfin = fin('wall');
    task('wood', '목공', 3, [[m2(wallArea), 10, `새 벽 ${m2t(wallArea)}`], [doors, 3, `문 ${doors}개`], [m2(wfin), 15, `벽 마감재 ${m2t(wfin)}`]]);
    const wins = sumSec('window');
    task('win', '창호', 2, [[wins, 4, `창문 ${wins}개`]], { with: has('wood') });
    const wt = mat(['walltile']), ft = mat(['tile', 'tileL', 'tileS', 'marble']);
    task('tile', '타일', 2, [[m2(wt), 8, `벽 타일 ${m2t(wt)}`], [m2(ft), 12, `바닥 타일 ${m2t(ft)}`]]);
    const paint = mat(['paint']);
    task('paint', '도장', 2, [[m2(paint), 40, `페인트 ${m2t(paint)}`]]);
    const silk = mat(['silk']), paper = mat(['paper']);
    task('paper', '도배', 2, [[m2(silk), 45, `실크 벽지 ${m2t(silk)}`], [m2(paper), 60, `합지 벽지 ${m2t(paper)}`]]);
    const floors = new Map();
    s.matLines.filter((l) => FLOOR_RATE[l.mat]).forEach((l) => {
      const c = floors.get(l.mat) || { name: l.name, area: 0 };
      c.area += l.area;
      floors.set(l.mat, c);
    });
    const ff = fin('floor');
    task('floor', '바닥', 2, [...[...floors].map(([k, c]) => [m2(c.area), FLOOR_RATE[k], `${c.name} ${m2t(c.area)}`]), [m2(ff), 25, `바닥 마감재 ${m2t(ff)}`]]);
    const furn = sumSec('furn');
    task('furn', '가구·설치', 2, [[furn, 5, `가구 ${furn}개`]]);
    if (!out.length) return out;
    out.unshift({ key: 'prep', name: '보양·준비', crew: 2, days: 0.5, with: false, kind: 'work', note: '바닥·승강기 보양, 자재 반입' });
    const floor = s.arch.floor;
    out.push({ key: 'clean', name: '마무리 청소', crew: 2, days: roundD(m2(floor) / 80 / 2), with: false, kind: 'work', note: floor > 0 ? `바닥 ${m2t(floor)}` : '' });
    return out;
  }

  /* ── 조감도: 물건마다 설치 시간(인·시간, 어림)을 더해 공정으로 ── */
  const W = (it) => (it.size || 0) / 1000;
  const D = (it) => ((it.depth != null ? it.depth : it.size) || 0) / 1000;
  const EFFORT = {
    무대: (it) => ['stage', 2 + W(it) * D(it) * (/지붕/.test(it.variant || '') ? 0.75 : 0.5)],
    계단: () => ['stage', 0.5],
    트러스: (it) => ['stage', 1 + 0.5 * W(it)],
    'LED 스크린': (it) => ['stage', 3 + 1.5 * W(it)],
    관람석: (it) => ['stage', 2 + 0.3 * W(it) * D(it)],
    라인어레이: () => ['stage', 4],
    몽골텐트: (it) => ['tent', 1 + 0.15 * W(it) * D(it)],
    '대형 텐트': (it) => ['tent', 2 + 0.15 * W(it) * D(it)],
    '돔 텐트': (it) => ['tent', 2 + 0.15 * W(it) * D(it)],
    부스: (it) => ['tent', 1.5 + 0.2 * W(it) * D(it)],
    파라솔: () => ['tent', 0.2],
    파고라: () => ['tent', 3],
    컨테이너: () => ['tent', 1.5],
    매표소: () => ['tent', 1.5],
    '의무실 텐트': () => ['tent', 2],
    발전기: () => ['power', 2],
    '조명 타워': () => ['power', 1.5],
    스피커: () => ['av', 0.5],
    '모니터 스피커': () => ['av', 0.3],
    '콘솔 데스크': () => ['av', 2],
    카메라: () => ['av', 1],
    스크린: () => ['av', 1.5],
    펜스: (it) => ['site', 0.1 * W(it)],
    차단봉: () => ['site', 0.2],
    러버콘: () => ['site', 0.02],
    '이동식 화장실': () => ['site', 0.5],
    푸드트럭: () => ['site', 0.5],
    구급차: () => null,
    소화기: () => ['site', 0.05],
    쓰레기통: () => ['site', 0.05],
    분리수거함: () => ['site', 0.1],
    현수막: () => ['site', 0.5],
    백월: (it) => ['site', 1 + 0.5 * W(it)],
    포토월: () => ['site', 2],
    '풍선 아치': () => ['site', 2],
    에어아치: () => ['site', 1],
    '입체 글자': () => ['site', 2],
    분수: () => ['site', 3],
    조형물: () => ['site', 2],
    레드카펫: (it) => ['site', 0.2 + 0.05 * Math.max(W(it), D(it))],
    '바닥 이미지': () => ['site', 0.5],
    '육상 트랙': () => ['sports', 6],
    트로피: () => null,
  };
  /** 따로 정하지 않은 물건은 분류로 (건물·나무·사람·차 같은 배경은 설치하지 않음) */
  const CAT_GROUP = { 좌석: 'seat', '안내·장식': 'site', '편의·안전': 'site', 장비: 'av', 구조물: 'tent', '운동·경기': 'sports' };
  function effortOf(it) {
    if (it.type !== 'item' || it.category !== 'event') return null;
    if (EFFORT[it.kind]) return EFFORT[it.kind](it);
    const def = App.catalog.itemDef(it.kind);
    const g = def && CAT_GROUP[def.cat];
    if (!g) return null;
    if (g === 'seat') {
      const st = App.catalog.seats(it);
      return ['seat', (it.kind === '의자 배열' || it.kind === '의자' ? 0 : 0.25) + 0.03 * (st ? st.count : 0)];
    }
    return [g, g === 'sports' ? 1 : g === 'tent' ? 1 + 0.1 * W(it) * D(it) : g === 'av' ? 0.5 : 0.3];
  }
  /* 묶음 1(구조물·텐트·펜스·경기 시설)은 반입 뒤 조마다 같이 시작, 묶음 2(전기·음향·좌석)는 구조물이 선 뒤 */
  const EV_TASKS = [
    { key: 'stage', name: '무대·구조물', crew: 8, cluster: 1 },
    { key: 'tent', name: '텐트·부스', crew: 6, cluster: 1 },
    { key: 'site', name: '펜스·안내·편의', crew: 4, cluster: 1 },
    { key: 'sports', name: '경기 시설', crew: 4, cluster: 1 },
    { key: 'power', name: '전기·조명', crew: 3, cluster: 2 },
    { key: 'av', name: '음향·영상', crew: 4, cluster: 2 },
    { key: 'seat', name: '좌석·테이블', crew: 6, cluster: 2 },
  ];
  function eventTasks(s) {
    const mh = {}, kinds = {};
    let seats = 0, cables = 0;
    s.items.forEach((it) => {
      const e = effortOf(it);
      if (e && e[1] > 0) {
        mh[e[0]] = (mh[e[0]] || 0) + e[1];
        const k = kinds[e[0]] || (kinds[e[0]] = new Map());
        k.set(it.kind, (k.get(it.kind) || 0) + 1);
        if (e[0] === 'seat') { const st = App.catalog.seats(it); seats += st ? st.count : 0; }
      }
      // 전기 쓰는 물건마다 배선 (발전기·분전에서 끌어 주기)
      if (App.safety && App.safety.powerOf(it) > 0) {
        mh.power = (mh.power || 0) + 0.3;
        cables++;
      }
    });
    const noteOf = (key) => {
      const m = kinds[key];
      const list = m ? [...m].sort((a, b) => b[1] - a[1]) : [];
      const head = list.slice(0, 3).map(([k, n]) => `${k} ${n}`).join(' · ') + (list.length > 3 ? ` 외 ${list.length - 3}종` : '');
      if (key === 'seat' && seats) return `좌석 ${seats.toLocaleString('ko-KR')}석${head ? ` · ${head}` : ''}`;
      if (key === 'power' && cables) return [head, `전기 쓰는 물건 ${cables}개 배선`].filter(Boolean).join(' · ');
      return head;
    };
    const out = [];
    let last = 0, setup = 0;
    EV_TASKS.forEach((d) => {
      const h = mh[d.key];
      if (!(h > 0)) return;
      setup += h;
      // 같은 묶음은 다른 조가 같은 때 시작
      out.push({ key: d.key, name: d.name, crew: d.crew, days: roundD(h / HOURS / d.crew), with: last === d.cluster, kind: 'work', note: noteOf(d.key) });
      last = d.cluster;
    });
    if (!out.length) return out;
    const n = App.safety ? App.safety.expected() : 0;
    // 반입은 설치 시간의 1/10쯤(4명), 리허설은 무대·음향이 크면 반나절
    out.unshift({ key: 'prep', name: '반입·자리 표시', crew: 4, days: roundD((setup * 0.1) / HOURS / 4), with: false, kind: 'work', note: '자재·장비 반입, 바닥에 자리 표시' });
    out.push({ key: 'rehearsal', name: '리허설·점검', crew: 4, days: (mh.stage || 0) + (mh.av || 0) > 24 ? 0.5 : 0.25, with: false, kind: 'work', note: '음향·조명·동선·안전 점검' });
    out.push({ key: 'event', name: '행사', crew: 0, days: 1, with: false, kind: 'event', note: n ? `예상 ${n.toLocaleString('ko-KR')}명` : '' });
    out.push({ key: 'teardown', name: '철수', crew: 8, days: roundD((setup * 0.6) / HOURS / 8), with: false, kind: 'work', note: '설치 시간의 약 60%' });
    return out;
  }

  /** 도면 물량으로 어림한 공정 (저장하지 않음) */
  function auto(s = App.summary.compute()) {
    return isEvent() ? eventTasks(s) : interiorTasks(s);
  }

  /* ── 저장 ── */
  function stored() {
    const sc = App.current.schedule;
    return sc && typeof sc === 'object' ? sc : null;
  }
  function storedW() {
    if (!stored()) App.current.schedule = {};
    return App.current.schedule;
  }
  const clean = (t) => ({
    key: String(t.key || 'custom'), name: String(t.name || '').trim() || '공정',
    days: Math.min(365, t.kind === 'event' ? Math.max(0.5, Math.ceil((Number(t.days) || 0) * 2 - 1e-9) / 2) : roundD(Number(t.days) || 0)), crew: Math.max(0, Math.min(999, Math.round(Number(t.crew) || 0))),
    with: !!t.with, kind: t.kind === 'event' ? 'event' : 'work', note: String(t.note || ''),
  });
  /** 지금 공정: 고친 것이 있으면 그것, 없으면 물량으로 어림 */
  function tasks() {
    const sc = stored();
    return sc && Array.isArray(sc.tasks) ? sc.tasks.map(clean) : auto();
  }
  function restOf() {
    const r = (stored() || {}).rest;
    return r === 'sun' || r === 'weekend' || r === 'none' ? r : isEvent() ? 'none' : 'sun';
  }

  /* ── 날짜 ── */
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return Number.isNaN(d.getTime()) || d.getDate() !== +m[3] ? null : d;
  };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const isRest = (d, rest) => (rest === 'sun' && d.getDay() === 0) || (rest === 'weekend' && (d.getDay() === 0 || d.getDay() === 6));
  const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const md = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
  const mdShort = (d) => `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`;
  const dayDiff = (a, b) => Math.round((b - a) / 864e5); // 서머타임이 있어도 하루 단위로
  /** 쉬는 날이면 다음 작업일 */
  const firstWork = (d, rest) => { let x = d; for (let i = 0; i < 7 && isRest(x, rest); i++) x = addDays(x, 1); return x; };
  /** 행사일에서 작업일 n일 앞 */
  function back(day, n, rest) {
    let x = firstWork(day, rest);
    for (let k = 0; k < n;) { x = addDays(x, -1); if (!isRest(x, rest)) k++; }
    return x;
  }

  /** 공정 배치: 작업일(0.5·0.25일 단위)로 앞에서부터 놓고(‘같이’는 앞 공정과 같은 때 시작), 작업일을 날짜로.
      돌려주는 값 { tasks: [{ ...공정, start, end(작업일), from, to(Date) }], start, end, work, cal, manDays, rest, days, eventDay, edited, moved } */
  function plan(list = tasks()) {
    const rest = restOf();
    let cursor = 0, prevStart = 0;
    const laid = list.map((t, i) => {
      let start = t.with && i > 0 ? prevStart : cursor, end;
      if (t.kind === 'event') {
        // 행사: 설치가 정오 전에 끝나면 그날 오후부터, 아니면 다음 날 아침부터. 하루 넘게 하는 행사는 그날 끝까지를 하루로 셈
        if (start - Math.floor(start + 1e-9) > 0.5 + 1e-9) start = Math.ceil(start - 1e-9);
        end = t.days >= 1 ? Math.floor(start + 1e-9) + t.days : start + t.days;
      } else end = start + t.days;
      prevStart = start;
      cursor = Math.max(cursor, end);
      return { ...t, start, end };
    });
    const work = cursor;
    const sc = stored() || {};
    const ev = isEvent() ? laid.find((t) => t.kind === 'event') : null;
    let start, moved = false;
    if (ev && parse(sc.eventDay)) {
      const day = parse(sc.eventDay);
      start = back(day, Math.floor(ev.start + 1e-9), rest); // 행사가 놓이는 작업일(설치가 정오 전에 끝나면 그날)이 행사일
      moved = isRest(day, rest); // 행사일이 쉬는 날이면 다음 작업일로 밀림
    } else start = firstWork(parse(sc.start) || today(), rest);
    const days = [];
    for (let d = start, need = Math.ceil(work - 1e-9) + 1; days.length < need; d = addDays(d, 1)) if (!isRest(d, rest)) days.push(d);
    const dayOf = (k) => days[Math.max(0, Math.min(days.length - 1, k))];
    laid.forEach((t) => {
      t.from = dayOf(Math.floor(t.start + 1e-9));
      t.to = dayOf(Math.max(Math.floor(t.start + 1e-9), Math.ceil(t.end - 1e-9) - 1));
    });
    const end = laid.length ? dayOf(Math.ceil(work - 1e-9) - 1) : start;
    return {
      tasks: laid, start, end, work, cal: dayDiff(start, end) + 1, rest, days,
      manDays: laid.filter((t) => t.kind !== 'event').reduce((n, t) => n + t.days * t.crew, 0),
      eventDay: ev ? ev.from : null, edited: Array.isArray(sc.tasks), moved,
    };
  }
  /** 막대 자리: 달력 첫날부터 며칠째(소수: 반나절)에서 며칠째까지 */
  function spans(p) {
    const ci = p.days.map((d) => dayDiff(p.start, d));
    const at = (k) => ci[Math.max(0, Math.min(ci.length - 1, k))];
    const xs = (v) => { const f = Math.floor(v + 1e-9); return at(f) + (v - f); };
    const xe = (v) => { const f = Math.floor(v + 1e-9); return v - f < 1e-9 ? at(f - 1) + 1 : at(f) + (v - f); };
    return p.tasks.map((t) => [xs(t.start), Math.max(xs(t.start) + 0.25, xe(t.end))]);
  }
  const restName = (r) => ({ sun: '일요일', weekend: '토·일요일', none: '없음' })[r];
  const periodText = (p) => `${md(p.start)} ~ ${md(p.end)} · 달력 ${p.cal}일 (작업 ${fmt(p.work)}일)${p.manDays ? ` · 연인원 ${fmt(r1(p.manDays))}인` : ''}`;
  const whenText = (t) => `${mdShort(t.from)}${dayDiff(t.from, t.to) > 0 ? ` ~ ${mdShort(t.to)}` : ''}`;

  /* ── 창: 간트 차트 + 공정 목록 (바로 고침) ── */
  function chartSvg(p) {
    const n = Math.max(1, p.cal);
    const DW = n > 60 ? 14 : n > 30 ? 20 : 28, RH = 28, HEAD = 38, PADR = 150;
    const Wd = n * DW + PADR, H = HEAD + p.tasks.length * RH + 6;
    const sp = spans(p);
    let svg = `<svg class="sc-svg" width="${Wd}" height="${H}" viewBox="0 0 ${Wd} ${H}" role="img" aria-label="공정표 간트 차트">`;
    for (let i = 0; i < n; i++) {
      const d = addDays(p.start, i), x = i * DW;
      if (isRest(d, p.rest)) svg += `<rect x="${x}" y="${HEAD - 16}" width="${DW}" height="${H - HEAD + 16}" class="sc-rest"/>`;
      if (i === 0 || d.getDate() === 1) svg += `<text x="${x + 2}" y="12" class="sc-month">${d.getFullYear() !== p.start.getFullYear() || i === 0 ? `${d.getFullYear()}년 ` : ''}${d.getMonth() + 1}월</text>`;
      if (DW >= 20 || d.getDay() === 1 || i === 0) svg += `<text x="${x + DW / 2}" y="${HEAD - 4}" text-anchor="middle" class="sc-day${d.getDay() === 0 ? ' is-sun' : d.getDay() === 6 ? ' is-sat' : ''}">${d.getDate()}</text>`;
      svg += `<line x1="${x + 0.5}" y1="${HEAD}" x2="${x + 0.5}" y2="${H}" class="sc-grid"/>`;
    }
    p.tasks.forEach((t, i) => {
      const [a, b] = sp[i], y = HEAD + i * RH + 5, x0 = a * DW, x1 = b * DW, bh = RH - 10;
      svg += `<rect x="${x0.toFixed(1)}" y="${y}" width="${(x1 - x0).toFixed(1)}" height="${bh}" rx="4" fill="${colorOf(t)}"/>`;
      svg += `<text x="${(x1 + 6).toFixed(1)}" y="${y + bh / 2 + 4}" class="sc-bar-t">${esc(t.name)} ${durText(t)}</text>`;
    });
    return `${svg}</svg>`;
  }
  /** 기간 칸 값: 조감도 설치·철수는 시간(2시간 단위), 나머지는 일 */
  const daysValue = (t) => (inHours(t) ? fmt(t.days * HOURS) : fmt(t.days));
  function rowHtml(t, i, n) {
    const ev = t.kind === 'event';
    return `
      <div class="sc-row${ev ? ' is-event' : ''}" data-i="${i}">
        <span class="sc-dot" style="background:${colorOf(t)}"></span>
        <input class="sc-name" type="text" data-f="name" value="${esc(t.name)}" maxlength="30" aria-label="공정 이름" autocomplete="off">
        <label class="sc-num"><input type="text" inputmode="decimal" data-f="days" value="${daysValue(t)}" aria-label="${esc(t.name)} ${inHours(t) ? '시간' : '일수'}" autocomplete="off"><span>${inHours(t) ? '시간' : '일'}</span></label>
        <label class="sc-num"><input type="text" inputmode="numeric" data-f="crew" value="${ev ? '' : t.crew}" ${ev ? 'disabled placeholder="–"' : ''} aria-label="${esc(t.name)} 인원" autocomplete="off"><span>명</span></label>
        <label class="sc-with" title="앞 공정과 같은 때 시작 (다른 조가 같이 일함)"><input type="checkbox" data-f="with" ${t.with ? 'checked' : ''} ${i ? '' : 'disabled'}><span>같이</span></label>
        <span class="sc-btns">
          <button type="button" class="btn sc-mini" data-act="sc-up" ${i ? '' : 'disabled'} aria-label="${esc(t.name)} 위로" title="위로">↑</button>
          <button type="button" class="btn sc-mini" data-act="sc-down" ${i < n - 1 ? '' : 'disabled'} aria-label="${esc(t.name)} 아래로" title="아래로">↓</button>
          <button type="button" class="btn sc-mini" data-act="sc-del" aria-label="${esc(t.name)} 지우기" title="지우기">×</button>
        </span>
        <small class="sc-when"><b data-when="${i}">${whenText(t)}</b>${t.note ? ` · ${esc(t.note)}` : ''}</small>
      </div>`;
  }
  function bodyHtml() {
    const p = plan();
    const evAnchor = isEvent() && p.tasks.some((t) => t.kind === 'event');
    const date = iso(evAnchor ? p.eventDay || p.start : p.start);
    return `
      <div class="field-grid sc-head">
        <div class="field"><label class="field-label" for="scDate">${evAnchor ? '행사일 <small>첫날 · 설치는 그 앞</small>' : isEvent() ? '시작일' : '착공일'}</label><div class="field-box"><input id="scDate" type="date" value="${date}" required></div></div>
        <div class="field"><label class="field-label" for="scRest">쉬는 날</label><div class="field-box"><select id="scRest" class="field-select">${[['sun', '일요일'], ['weekend', '토·일요일'], ['none', '없음 (매일 작업)']].map(([v, l]) => `<option value="${v}"${p.rest === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
      </div>
      <p class="sc-sum" id="scSum">${p.tasks.length ? periodText(p) : ''}</p>
      <p class="dialog-note is-warn" id="scMoved" ${p.moved ? '' : 'hidden'}>행사일이 쉬는 날이라 다음 작업일로 밀렸습니다. 쉬는 날을 바꾸세요.</p>
      ${p.tasks.length ? `<div class="sc-chart" id="scChart">${chartSvg(p)}</div>` : `
        <div class="empty"><div class="empty-title">어림할 공정이 없습니다</div><p>${isEvent() ? '무대·텐트·좌석 같은 물건을 놓으면' : '벽·문·창문·전기·설비를 그리고 방 마감을 고르면'} 물량으로 공정을 어림합니다. 아래 ‘+ 공정 추가’로 직접 넣을 수도 있습니다.</p></div>`}
      <p class="dialog-note sc-state">${p.edited ? '<b>직접 고친 공정표</b> — 도면을 바꿔도 그대로입니다.' : '도면 물량으로 어림한 공정표 — 도면을 바꾸면 따라 바뀝니다. 고치면 이 도면에 저장됩니다.'}</p>
      <div class="sc-list" id="scList" data-keys="local">${p.tasks.map((t, i) => rowHtml(t, i, p.tasks.length)).join('')}</div>
      <div class="btn-row sc-add">
        <button type="button" class="btn" data-act="sc-add">+ 공정 추가</button>
        ${p.edited ? '<button type="button" class="btn" data-act="sc-auto" title="고친 것을 버리고 지금 도면 물량으로 다시 어림">물량대로 다시 어림</button>' : ''}
      </div>
      <div class="btn-row sc-tools">
        <button type="button" class="btn btn-primary" data-act="sc-pdf" ${p.tasks.length ? '' : 'disabled'}>공정표 PDF</button>
        <button type="button" class="btn" data-act="sc-csv" ${p.tasks.length ? '' : 'disabled'}>CSV</button>
        <button type="button" class="btn" data-act="sc-est" ${p.manDays ? '' : 'disabled'} title="공정마다 연인원을 견적의 기타 항목(인건비)으로">견적에 인건비 넣기</button>
      </div>
      <p class="dialog-note">하루 8시간, 한 사람 작업량으로 어림한 값입니다 (연인원 = 일수 × 인원${isEvent() ? ', 설치·철수는 2시간 단위' : ''}). 현장 여건에 맞게 ${isEvent() ? '시간' : '일수'}·인원을 고치세요. 공휴일은 따로 빼지 않습니다.</p>`;
  }
  /** 입력 칸은 그대로 두고 날짜·막대·합계만 다시 씀 (글자를 치는 중에도 끊기지 않게) */
  function refresh(body) {
    const p = plan();
    const sum = body.querySelector('#scSum');
    if (sum) sum.textContent = p.tasks.length ? periodText(p) : '';
    const chart = body.querySelector('#scChart');
    if (chart) chart.innerHTML = chartSvg(p);
    p.tasks.forEach((t, i) => { const w = body.querySelector(`[data-when="${i}"]`); if (w) w.textContent = whenText(t); });
    const mv = body.querySelector('#scMoved');
    if (mv) mv.hidden = !p.moved;
    const est = body.querySelector('[data-act="sc-est"]');
    if (est) est.disabled = !p.manDays;
  }
  function redraw(body, focus) {
    const scroll = body.scrollTop;
    body.innerHTML = `<div class="sc">${bodyHtml()}</div>`;
    body.scrollTop = scroll;
    if (focus) { const el = body.querySelector(focus); if (el) { el.focus(); if (el.select) el.select(); } }
  }
  /** 공정 목록을 고침: 지금 목록(어림이면 어림값)을 저장한 뒤 바꿈 */
  function edit(fn) {
    const list = tasks();
    fn(list);
    storedW().tasks = list.map(clean);
    save();
  }
  const numIn = (s) => parseFloat(String(s == null ? '' : s).replace(/,/g, '.').replace(/[^\d.]/g, ''));
  function bind(body) {
    body.addEventListener('change', (e) => {
      const el = e.target;
      if (el.id === 'scDate') {
        if (!parse(el.value)) return;
        const evAnchor = isEvent() && tasks().some((t) => t.kind === 'event');
        storedW()[evAnchor ? 'eventDay' : 'start'] = el.value;
        save();
        refresh(body);
        return;
      }
      if (el.id === 'scRest') {
        storedW().rest = el.value;
        save();
        refresh(body);
        return;
      }
      const row = el.closest('[data-i]');
      if (!row || !el.dataset.f) return;
      const i = +row.dataset.i, f = el.dataset.f;
      const wasEdited = Array.isArray((stored() || {}).tasks);
      edit((list) => {
        const t = list[i];
        if (!t) return;
        if (f === 'name') t.name = el.value.trim() || t.name;
        else if (f === 'days') { const v = numIn(el.value); if (v > 0) t.days = inHours(t) ? v / HOURS : v; }
        else if (f === 'crew') { const v = numIn(el.value); if (v >= 0) t.crew = v; }
        else if (f === 'with') t.with = el.checked;
      });
      const t = tasks()[i];
      if (t && f !== 'with') el.value = f === 'name' ? t.name : f === 'days' ? daysValue(t) : String(t.crew);
      if (!wasEdited) redraw(body); // ‘직접 고친 공정표’ 안내와 ‘다시 어림’ 버튼이 생김
      else refresh(body);
    });
    body.addEventListener('keydown', (e) => {
      // 공정 칸의 Enter는 창을 닫지 않고 고친 값을 확정 (목록은 data-keys="local"이라 창의 Enter·Esc 처리를 받지 않음)
      if (e.key === 'Enter' && e.target.matches('.sc-row input[type="text"]')) { e.preventDefault(); e.target.blur(); }
    });
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const row = b.closest('[data-i]'), i = row ? +row.dataset.i : -1;
      switch (b.dataset.act) {
        case 'sc-up': if (i > 0) { edit((l) => { [l[i - 1], l[i]] = [l[i], l[i - 1]]; }); redraw(body, `[data-i="${i - 1}"] [data-act="sc-up"]`); } break;
        case 'sc-down': edit((l) => { if (i < l.length - 1) [l[i + 1], l[i]] = [l[i], l[i + 1]]; }); redraw(body, `[data-i="${i + 1}"] [data-act="sc-down"]`); break;
        case 'sc-del': edit((l) => { l.splice(i, 1); }); redraw(body); break;
        case 'sc-add': {
          let n = 0;
          edit((l) => { l.push({ key: 'custom', name: '새 공정', days: 1, crew: 2, with: false, kind: 'work', note: '' }); n = l.length; });
          redraw(body, `[data-i="${n - 1}"] .sc-name`);
          break;
        }
        case 'sc-auto': delete storedW().tasks; save(); redraw(body); break;
        case 'sc-pdf': exportPdf(); break;
        case 'sc-csv': exportCsv(); break;
        case 'sc-est':
          if (toEstimate()) {
            const close = document.querySelector('#dialogFoot [data-id="close"]');
            if (close) close.click();
            App.ui.openEstimate();
          }
          break;
        default:
      }
    });
  }
  async function open() {
    await App.ui.dialog({
      title: '공정표',
      html: `<div class="sc">${bodyHtml()}</div>`,
      actions: [{ id: 'close', label: '닫기', primary: true }],
      onOpen: bind,
    });
  }

  /* ── 견적: 공정마다 연인원을 기타 항목 ‘○○ 인건비’로 (다시 넣으면 바꿔 넣고 단가는 이어받음) ── */
  function toEstimate() {
    const p = plan();
    const list = p.tasks.filter((t) => t.kind !== 'event' && t.crew > 0).map((t) => ({ name: `${t.name} 인건비`, qty: r1(t.days * t.crew), unit: '인' }));
    if (!list.length) {
      App.ui.toast('인원을 넣은 공정이 없습니다.');
      return false;
    }
    App.estimate.putExtras('schedule', list);
    App.ui.toast(`견적 기타 항목에 공정별 인건비 ${list.length}줄 (연인원 ${fmt(r1(p.manDays))}인)을 넣었습니다. 1인 하루 단가를 넣으세요.`, 5500);
    return true;
  }

  /* ── CSV ── */
  function csvRows(p = plan()) {
    const rows = [['순서', '공정', '시작일', '끝일', '일수', '시간', '인원', '연인원', '같이 시작', '근거']];
    p.tasks.forEach((t, i) => {
      const ev = t.kind === 'event';
      rows.push([i + 1, t.name, iso(t.from), iso(t.to), t.days, ev ? '' : t.days * HOURS, ev ? '' : t.crew, ev ? '' : r1(t.days * t.crew), t.with ? '예' : '', t.note]);
    });
    rows.push(['', '합계', iso(p.start), iso(p.end), p.work, '', '', r1(p.manDays), '', `달력 ${p.cal}일 · 쉬는 날 ${restName(p.rest)}`]);
    return rows;
  }
  function exportCsv() {
    const p = plan();
    if (!p.tasks.length) {
      App.ui.toast('공정이 없습니다. 도면을 그리거나 공정을 추가하세요.');
      return false;
    }
    const name = `공정표_${safeName(projectName())}_${App.exporter.stamp()}.csv`;
    App.exporter.saved(App.exporter.download(name, App.exporter.csvText(csvRows(p)), 'text/csv;charset=utf-8'), `‘${name}’을 저장했습니다. 엑셀에서 바로 열 수 있습니다.`);
    return true;
  }

  /* ── PDF: A4 가로 200dpi. 왼쪽 표(공정·기간·일수·인원), 오른쪽 간트 ── */
  const DPI = 200;
  const PX = (mm) => Math.round((mm / 25.4) * DPI);
  const PT = (px) => (px / DPI) * 72;
  const PAGE = { W: PX(297), H: PX(210) };
  const FONT = () => getComputedStyle(document.documentElement).getPropertyValue('--font-ui') || 'sans-serif';
  const PM = 110, TOP = 330, ROW = 58, FOOT = 150;
  const COLS = [['', 56, 'center'], ['공정', 330, 'left'], ['기간', 290, 'left'], ['일수', 96, 'right'], ['인원', 96, 'right']];
  /** 쪽 나누기. 공정이 없으면 null, 있으면 { W, H, count, p, draw(ctx, k, o) } — o: { page, pages, footer } (제안서에 끼울 때) */
  function layout(p = plan()) {
    if (!p.tasks.length) return null;
    const per = Math.floor((PAGE.H - TOP - FOOT - 70) / ROW);
    const chunks = [];
    for (let i = 0; i < p.tasks.length; i += per) chunks.push(i);
    return { W: PAGE.W, H: PAGE.H, count: chunks.length, p, draw: (ctx, k, o = {}) => drawPage(ctx, p, chunks[k], per, { page: o.page || k + 1, pages: o.pages || chunks.length, footer: o.footer }) };
  }
  function drawPage(ctx, p, from, per, o) {
    const { W: PW, H: PH } = PAGE, f = FONT(), ink = '#1f2937', mute = '#6b7280', faint = '#9ca3af', line = '#d1d5db';
    const text = (s, x, y, size, weight = 400, color = ink, align = 'left', maxW = 0) => {
      ctx.font = `${weight} ${size}px ${f}`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      let v = String(s == null ? '' : s);
      if (maxW) while (v.length > 1 && ctx.measureText(v).width > maxW) v = `${v.slice(0, -2)}…`;
      ctx.fillText(v, x, y);
      return ctx.measureText(v).width;
    };
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, PW, PH);
    // 머리글
    text('공 정 표', PM, PM + 40, 64, 800);
    text(projectName(), PW - PM, PM + 22, 32, 700, ink, 'right', PW * 0.5);
    text(`${isEvent() ? '설치~철수' : '공사 기간'} ${periodText(p)}`, PW - PM, PM + 70, 26, 500, mute, 'right', PW * 0.62);
    ctx.fillStyle = ink;
    ctx.fillRect(PM, PM + 112, PW - 2 * PM, 4);
    text(`쉬는 날: ${restName(p.rest)}${p.eventDay ? ` · 행사일 ${md(p.eventDay)}` : ''} · 하루 8시간 기준 어림`, PM, PM + 150, 24, 400, mute);
    // 표 + 간트
    const tw = COLS.reduce((t, c) => t + c[1], 0), cx0 = PM + tw + 24, cx1 = PW - PM, cw = cx1 - cx0;
    const n = Math.max(1, p.cal), dw = cw / n;
    const y0 = TOP, head = 70, rows = p.tasks.slice(from, from + per);
    // 표 머리
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(PM, y0, PW - 2 * PM, head);
    let x = PM;
    COLS.forEach(([name, w, al]) => {
      text(name, al === 'right' ? x + w - 12 : al === 'center' ? x + w / 2 : x + 12, y0 + head / 2, 25, 700, ink, al);
      x += w;
    });
    // 날짜 머리: 위 줄 월, 아래 줄 날 (칸이 좁으면 몇 칸마다)
    const every = Math.max(1, Math.ceil(30 / dw));
    const yB = y0 + head + rows.length * ROW;
    for (let i = 0; i < n; i++) {
      const d = addDays(p.start, i), xx = cx0 + i * dw;
      if (isRest(d, p.rest)) { ctx.fillStyle = '#eceff3'; ctx.fillRect(xx, y0 + head, dw, yB - y0 - head); }
      if (i === 0 || d.getDate() === 1) text(`${d.getMonth() + 1}월`, xx + 4, y0 + 18, 20, 700, mute);
      if (i % every === 0) text(String(d.getDate()), xx + dw / 2, y0 + 50, dw >= 26 ? 20 : 17, 600, d.getDay() === 0 ? '#e03131' : d.getDay() === 6 ? '#1c7ed6' : ink, 'center');
      ctx.fillStyle = i % every === 0 ? line : '#eef0f3';
      ctx.fillRect(xx, y0 + head, 1.5, yB - y0 - head);
    }
    ctx.fillStyle = ink;
    ctx.fillRect(PM, y0, PW - 2 * PM, 3);
    ctx.fillRect(PM, y0 + head, PW - 2 * PM, 2);
    // 줄
    const sp = spans(p);
    rows.forEach((t, k) => {
      const i = from + k, y = y0 + head + k * ROW, cy = y + ROW / 2, ev = t.kind === 'event';
      if (ev) { ctx.fillStyle = '#fff4e6'; ctx.fillRect(PM, y, tw, ROW); }
      let xx = PM;
      const cells = [String(i + 1), t.name, whenText(t), durText(t), ev ? '–' : `${t.crew}명`];
      cells.forEach((v, c) => {
        const [, w, al] = COLS[c];
        text(v, al === 'right' ? xx + w - 12 : al === 'center' ? xx + w / 2 : xx + 12, c === 1 && t.note ? cy - 9 : cy, c === 1 ? 25 : 23, c === 1 ? 700 : 400, c === 0 ? mute : ink, al, w - 20);
        xx += w;
      });
      if (t.note) text(t.note, PM + COLS[0][1] + 12, cy + 16, 16, 400, faint, 'left', COLS[1][1] - 20);
      // 막대
      const [a, b] = sp[i], bx0 = cx0 + a * dw, bx1 = cx0 + b * dw, bh = ROW - 22;
      ctx.fillStyle = colorOf(t);
      const r = Math.min(8, bh / 2, (bx1 - bx0) / 2);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx0, y + 11, bx1 - bx0, bh, r); else ctx.rect(bx0, y + 11, bx1 - bx0, bh);
      ctx.fill();
      // 막대 글자: 안에 들어가면 안에, 아니면 오른쪽(넘치면 왼쪽)
      const label = `${durText(t)}${ev ? '' : ` · ${t.crew}명`}`;
      ctx.font = `700 20px ${f}`;
      const lw = ctx.measureText(label).width;
      if (lw + 16 < bx1 - bx0) text(label, (bx0 + bx1) / 2, cy, 20, 700, '#fff', 'center');
      else if (bx1 + 10 + lw < cx1) text(label, bx1 + 10, cy, 20, 700, ink);
      else text(label, bx0 - 10, cy, 20, 700, ink, 'right');
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(PM, y + ROW - 1.5, PW - 2 * PM, 1.5);
    });
    // 세로 칸 줄 (표)
    ctx.fillStyle = line;
    x = PM;
    COLS.forEach(([, w]) => { x += w; ctx.fillRect(x, y0, 1.5, yB - y0); });
    ctx.fillStyle = ink;
    ctx.fillRect(PM, yB, PW - 2 * PM, 2.5);
    // 합계·안내
    if (from + per >= p.tasks.length) {
      text(`합계: 작업 ${fmt(p.work)}일 · 달력 ${p.cal}일${p.manDays ? ` · 연인원 ${fmt(r1(p.manDays))}인` : ''}`, PM, yB + 44, 26, 800);
      text('※ 물량으로 어림한 일정입니다. 날씨·자재 수급·현장 여건에 따라 달라질 수 있습니다.', PM, yB + 86, 21, 400, mute, 'left', PW - 2 * PM);
    }
    const co = App.estimate && App.estimate.company ? App.estimate.company() : {};
    text(`${o.page} / ${o.pages}`, PW / 2, PH - 64, 22, 400, mute, 'center');
    text(o.footer || `${co.name ? `${co.name} · ` : ''}현장도면으로 만든 공정표`, PW - PM, PH - 64, 19, 400, faint, 'right', PW * 0.4);
    text(new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }), PM, PH - 64, 19, 400, faint);
  }
  function exportPdf() {
    const L = layout();
    if (!L) {
      App.ui.toast('공정이 없습니다. 도면을 그리거나 공정을 추가하세요.');
      return false;
    }
    const canvas = document.createElement('canvas');
    canvas.width = L.W;
    canvas.height = L.H;
    const ctx = canvas.getContext('2d');
    const pages = [];
    for (let k = 0; k < L.count; k++) {
      L.draw(ctx, k);
      pages.push({ jpeg: App.exporter.jpegBytes(canvas, 0.9), w: L.W, h: L.H });
    }
    const blob = App.exporter.pdfFromPages(pages, PT(L.W), PT(L.H));
    const name = `공정표_${safeName(projectName())}_${App.exporter.stamp()}.pdf`;
    App.exporter.saved(App.exporter.download(name, blob, 'application/pdf'), `‘${name}’을 저장했습니다 (${L.count}쪽).`);
    return true;
  }

  App.schedule = { open, auto, tasks, plan, layout, csvRows, exportCsv, exportPdf, toEstimate, effortOf, PT, md };
})();
