/* 프로젝트(도면) 저장: 고친 뒤 1초 지나면 이 기기에 자동 저장, 새로 열어도 그대로.
   여러 도면을 목록으로 관리하고, JSON 파일로 백업·불러오기, 새 도면은 템플릿에서 시작.
   저장 데이터에는 구조 버전(dataVersion)을 넣어 나중에 구조가 바뀌어도 읽을 수 있게 함 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const S = () => App.storage;
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const FILE_KIND = 'hyeonjang-domyeon'; // 백업 파일 표시
  const SAVE_DELAY = 1000;
  const KEY_INDEX = 'hjdm.projects';
  const KEY_CURRENT = 'hjdm.current';
  const keyOf = (id) => `hjdm.p.${id}`;
  const NAME_MAX = 40;

  let current = null;       // { id, name, createdAt }
  let timer = 0;
  let loading = false;      // 도면을 바꿔 끼우는 동안에는 저장하지 않음
  let stopped = false;      // 전체 초기화 중
  let warned = false;       // 저장 실패 경고는 한 번만 크게
  let quietVersion = -1;    // 연 직후의 도면 버전 (열기만 한 것은 고친 것으로 보지 않음)

  const newId = () => `prj-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const index = () => {
    const list = S().read(KEY_INDEX);
    return Array.isArray(list) ? list.filter((p) => p && p.id) : [];
  };
  const drawnCount = (elements) => elements.filter((e) => App.model.TYPES[e.type] && !App.model.TYPES[e.type].catalog).length;
  const timeText = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  /* ── 저장 상태 표시 (위쪽 막대) ── */
  function setState(state) {
    const el = $('#saveState');
    if (!el) return;
    el.dataset.state = state;
    el.textContent = state === 'saved' ? '저장됨' : state === 'pending' ? '저장 중…' : '저장 실패';
    $('#btnProject').title = state === 'failed'
      ? '이 기기에 저장하지 못했습니다. 백업 파일로 내려받으세요.'
      : `도면 목록 · ${state === 'saved' ? `마지막 저장 ${new Date().toLocaleTimeString('ko-KR')}` : '저장 중'}`;
  }
  function showName() {
    $('#projectName').textContent = current ? current.name : '';
    document.title = current ? `${current.name} · 현장도면` : '현장도면';
  }

  /* ── 도면 ↔ 저장 데이터 ── */
  function snapshot() {
    const v = App.plan.view;
    return {
      kind: FILE_KIND,
      dataVersion: App.model.DATA_VERSION,
      appVersion: App.settingsUI.APP_VERSION,
      id: current.id,
      name: current.name,
      createdAt: current.createdAt,
      savedAt: new Date().toISOString(),
      current: { ...App.current },
      // 화면 가운데의 도면 좌표와 배율: 화면 크기가 달라도(휴대폰 회전 등) 같은 곳이 가운데 오게
      view: { scale: v.scale, cx: (App.plan.width / 2 - v.ox) / v.scale, cy: (App.plan.height / 2 - v.oy) / v.scale },
      elements: [...App.doc.all()],
    };
  }

  /** 조감도 물건·영역을 지금 구조로: 새로 생긴 값(모양·의자 수·통로 등)에 기본값을 채우고, 없어진 종류는 이어받은 종류로 */
  function migrateItem(e) {
    if (e.type === 'zone' && e.surface == null) e.surface = '';
    if (e.type !== 'item' || e.category !== 'event') return;
    if (e.kind === '배너·포토월') e.kind = '포토월';
    const def = App.catalog.itemDef(e.kind);
    if (!def) return;
    if (def.kind === '의자 배열') {
      // 예전: 자리 크기 안에 의자를 고르게 폄 → 지금: 의자 간격·줄 간격으로 자리 크기가 정해짐
      const cols = Math.max(1, e.cols || 1), rows = Math.max(1, e.rows || 1);
      if (e.seatW == null) e.seatW = Math.round(e.size / cols);
      if (e.gap == null) e.gap = Math.round(e.depth / rows);
      if (e.aisles == null) e.aisles = 0;
      if (e.aisleW == null) e.aisleW = 1200;
      if (e.count == null) e.count = cols * rows;
    }
    if ((def.kind === '원형 테이블' || def.kind === '테이블') && e.chairs == null) {
      e.chairs = parseInt((String(e.variant || '').match(/\d+/) || [0])[0], 10) || 0; // 예전에는 '의자 8개' 같은 선택 값
      e.variant = null;
    }
    Object.entries(def.numbers || {}).forEach(([k, o]) => { if (e[k] == null) e[k] = o.default; });
    Object.entries(def.options || {}).forEach(([k, o]) => { if (!o.values.includes(e[k])) e[k] = o.default; });
    if (def.styles && !def.styles.includes(e.style)) e.style = def.styleDefault || def.styles[0];
  }

  /** 저장된 데이터를 지금 구조로 맞춤. 모르는 요소 종류는 빼고 개수를 알려 줌 */
  function migrate(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.elements)) throw new Error('도면 데이터가 아닙니다.');
    const version = Number(data.dataVersion) || 1;
    const TYPES = App.model.TYPES;
    const elements = data.elements.filter((e) => e && typeof e.id === 'string' && TYPES[e.type]);
    const dropped = data.elements.length - elements.length;
    // 벽 종류·프리셋 목록이 없으면 기본 목록을 넣음
    if (!elements.some((e) => e.type === 'wallType')) elements.push(...App.catalog.defaultElements());
    // 마감재(아트보드·데코타일 등)가 생기기 전에 만든 도면에는 기본 마감재를 넣음
    else if (!elements.some((e) => e.type === 'preset' && e.kind === 'finish')) elements.push(...App.catalog.defaultFinishes());
    elements.forEach(migrateItem);
    // (dataVersion 1 이후 구조가 바뀌면 여기서 옛 데이터를 고침)
    return { ...data, elements, dropped, newer: version > App.model.DATA_VERSION };
  }

  /** 지금 도면을 바로 저장. 성공하면 true */
  function saveNow() {
    clearTimeout(timer);
    timer = 0;
    if (!current || loading || stopped) return true;
    const data = snapshot();
    const ok = S().write(keyOf(current.id), data);
    if (ok) {
      const list = index().filter((p) => p.id !== current.id);
      list.unshift({
        id: current.id, name: current.name, createdAt: current.createdAt, updatedAt: data.savedAt,
        count: drawnCount(data.elements),
        underlays: [...new Set(data.elements.filter((e) => e.type === 'underlay').map((e) => e.dataId))],
        images: [...App.images.used(data.elements)],
        mode: data.current.mode,
      });
      S().write(KEY_INDEX, list);
      S().write(KEY_CURRENT, current.id);
      warned = false;
    }
    setState(ok ? 'saved' : 'failed');
    if (!ok && !warned) {
      warned = true;
      App.ui.dialog({
        title: '이 기기에 저장하지 못했습니다',
        html: `<p>저장 공간이 부족하거나 브라우저가 저장을 막고 있습니다. 고친 내용은 앱을 닫으면 사라질 수 있습니다.</p>
          <p class="dialog-note is-warn">지금 <b>백업 파일</b>로 내려받아 두세요. 가져온 도면(밑그림)을 지우거나 오래된 도면을 정리하면 공간이 생깁니다.</p>`,
        actions: [{ id: 'later', label: '나중에' }, { id: 'backup', label: '백업 저장', primary: true }],
      }).then((r) => { if (r.id === 'backup') exportBackup(); });
    }
    return ok;
  }

  function schedule() {
    if (loading || stopped || !current || App.doc.version === quietVersion) return;
    setState('pending');
    clearTimeout(timer);
    timer = setTimeout(saveNow, SAVE_DELAY);
  }
  /** 앱이 가려지거나 닫힐 때: 기다리지 않고 바로 저장 */
  function flush() {
    if (timer) saveNow();
  }

  /** 저장 데이터를 화면에 띄움 */
  async function apply(data, meta) {
    const m = migrate(data);
    loading = true;
    try {
      if (App.tools.current && App.tools.current.cancel) App.tools.current.cancel();
      App.ui.setTool('select');
      App.selection.set([]);
      App.doc.reset(m.elements);
      quietVersion = App.doc.version;
      App.current = { ...(m.current || {}) };
      App.current.mode = App.modes.infer(m.current, m.elements); // 예전 도면은 내용을 보고 모드를 정함
      App.catalog.ensureCurrent();
      current = { id: meta.id, name: meta.name, createdAt: meta.createdAt };
      const v = m.view;
      if (v && Number.isFinite(v.scale) && v.scale > 0 && Number.isFinite(v.cx) && Number.isFinite(v.cy)) {
        App.plan.view.scale = v.scale;
        App.plan.view.ox = App.plan.width / 2 - v.cx * v.scale;
        App.plan.view.oy = App.plan.height / 2 - v.cy * v.scale;
        App.plan.requestRender();
      } else {
        App.plan.fitToContent();
      }
    } finally {
      loading = false;
    }
    showName();
    App.ui.updateHistory();
    App.ui.emit('project');
    setState('saved');
    App.images.loadAll(m.elements); // 넣은 이미지(현수막·벽보 등)를 미리 읽어 둠
    const missing = await App.underlay.loadAll();
    if (missing) App.ui.toast(`가져온 도면 ${missing}개의 밑그림 데이터를 이 기기에서 찾지 못했습니다. 지우고 다시 불러오세요.`);
    if (m.dropped) App.ui.toast(`이 앱이 모르는 항목 ${m.dropped}개는 빼고 열었습니다.`);
    return m;
  }

  async function open(id) {
    if (current && id === current.id) return true;
    flush();
    const data = S().read(keyOf(id));
    if (!data) {
      App.ui.toast('그 도면을 찾지 못했습니다.');
      return false;
    }
    const meta = index().find((p) => p.id === id) || {};
    await apply(data, { id, name: meta.name || data.name || '이름 없는 도면', createdAt: meta.createdAt || data.createdAt });
    S().write(KEY_CURRENT, id);
    return true;
  }

  /* ── 템플릿 ── */
  const TEMPLATES = [
    { id: 'blank', mode: 'interior', name: '빈 도면', desc: '벽 종류·문·창문 목록만 들어 있습니다.' },
    { id: 'room', mode: 'interior', name: '방 1개', desc: '3 × 4 m 방 하나와 문이 그려져 있습니다.' },
    { id: 'studio', mode: 'interior', name: '원룸 예시', desc: '방·욕실, 문·창문, 콘센트·스위치·조명, 전선관까지 들어 있어 집계를 바로 볼 수 있습니다.' },
    { id: 'furnished', mode: 'interior', name: '원룸 + 가구 예시', desc: '원룸 예시에 침대·소파·식탁·액자까지 놓았습니다. 3D로 걸어서 둘러보기 좋습니다.' },
    { id: 'event-blank', mode: 'event', name: '빈 행사장', desc: '아무것도 없는 바닥에서 시작합니다. 물건·영역·동선을 놓아 보세요.' },
    { id: 'ceremony', mode: 'event', name: '야외 기념식 예시', desc: '건물 앞마당에 무대·백월·의자 300석·텐트·스피커·주차장·동선까지 놓았습니다. 3D 조감도와 걸어서 둘러보기를 바로 볼 수 있습니다.' },
    { id: 'seminar', mode: 'event', name: '실내 세미나 예시', desc: '강당에 무대·LED 화면·의자 배열·등록 데스크와 입장·대피 동선을 놓았습니다.' },
    { id: 'soccer', mode: 'event', name: '축구 대회 예시 (운동장)', desc: '축구장·관람석·선수 벤치·점수판·시상대·팀 텐트·주차장까지 놓은 운동장입니다.' },
    { id: 'festival', mode: 'event', name: '야외 축제 예시 (광장)', desc: '부스 거리·무대·푸드트럭·분수·풍선 아치를 놓은 광장 축제입니다. 밤 장면으로 보면 조명이 켜집니다.' },
    { id: 'gym', mode: 'event', name: '실내 체육관 예시', desc: '체육관 안에 농구장·관람석·점수판·시상대를 놓았습니다.' },
  ];

  /** 템플릿 요소 만들기: 빈 도면에서 시작해 도면 API로 그린 뒤 결과를 돌려줌 */
  function templateElements(id) {
    const doc = App.doc;
    doc.reset(App.catalog.defaultElements());
    const tpl = TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
    App.current = { mode: tpl.mode, ground: tpl.mode === 'event' ? 'asphalt' : '' };
    App.catalog.ensureCurrent();
    if (id === 'blank' || id === 'event-blank') return [...doc.all()];
    const T = App.model.TYPES, C = App.catalog;
    /** 조감도 물건 놓기: 가운데 (x, y), 회전(도), 고칠 값들 (크기·글자·색 등, 숫자 값을 바꾸면 자리 크기도 맞춤) */
    const put = (kind, x, y, rotation = 0, patch = {}) => {
      const def = C.itemDef(kind);
      const it = T.item.create({ x, y }, def.category, def, rotation, null);
      Object.assign(it, patch);
      if (def.resize) Object.assign(it, def.resize(it));
      if (it.kind === '의자 배열') it.count = patch.count || it.cols * it.rows;
      doc.add(it);
      return it;
    };
    const zone = (x0, y0, x1, y1, name, surface, color = '#2f9e44') =>
      doc.add(T.zone.create([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], name, color, surface));
    const route = (kind, name, pts) => {
      const d = App.routes.def(kind);
      return doc.add(T.route.create(pts.map(([x, y]) => ({ x, y })), name, d.kind, d.color, d.width));
    };
    const wall = (a, b) => {
      const w = T.wall.create({ x: a[0], y: a[1] }, { x: b[0], y: b[1] });
      doc.add(w);
      return w;
    };
    const ring = (pts) => pts.map((p, i) => wall(p, pts[(i + 1) % pts.length]));
    const addRooms = (names) => {
      App.rooms.faces().forEach((f) => {
        const name = names.find((n) => App.geom.pointInPolygon(n.at, f.points));
        doc.add(T.room.create(f.points, f.wallIds, name ? name.name : App.rooms.nextName()));
      });
    };
    const preset = (kind, name) => C.presets(kind).find((p) => p.name === name) || C.presets(kind)[0];
    // 벽에 붙는 기호: 시계 방향으로 그린 바깥 벽은 왼쪽(+1)이 방 안쪽
    const mounted = (w, t, kind, side = 1) => {
      const def = C.itemDef(kind);
      const m = App.model.mountPoint(w, t, side, def.size * def.aspect);
      const it = T.item.create(m, C.ITEM_KINDS.elec.includes(def) ? 'elec' : 'mech', def, m.rotation, { wallId: w.id, t, side });
      doc.add(it);
      return it;
    };
    const free = (x, y, kind) => {
      const def = C.itemDef(kind);
      const it = T.item.create({ x, y }, C.ITEM_KINDS.elec.includes(def) ? 'elec' : 'mech', def, 0, null);
      doc.add(it);
      return it;
    };

    if (id === 'ceremony') {
      // 건물 앞마당의 야외 기념식 (대지 60 × 44 m). 위쪽이 건물, 아래쪽이 입구
      doc.transact('템플릿', () => {
        zone(2000, 14000, 16000, 36000, '잔디 1', 'grass');
        zone(44000, 14000, 58000, 36000, '잔디 2', 'grass');
        zone(22000, 22300, 38000, 32700, '카펫 1', 'carpet', '#e03131');
        put('건물', 30000, 6000, 0, { size: 30000, depth: 10000, floors: 2, text: '시민 문화센터', color: '#f5f0e1' });
        put('주차 구획', 52500, 6500, 0, { count: 5 });
        put('승용차', 48750, 6400, 90, { color: '#ffffff' });
        put('승용차', 53750, 6400, 90, { color: '#1e3a8a' });
        put('무대', 30000, 17500, 0, { size: 9000, depth: 5400 });
        put('백월', 30000, 15100, 0, { size: 9000, depth: 400, h3: 3200, text: '2026 시민 문화센터\n개관 기념식', color: '#1e3a8a' });
        put('계단', 26400, 20650, 0);
        put('연단', 27600, 18700, 0);
        put('사람', 27600, 18100, 0, { style: '정장' });
        put('모니터 스피커', 29000, 19700, 180);
        put('모니터 스피커', 31300, 19700, 180);
        put('라인어레이', 24000, 19300, 0);
        put('라인어레이', 36000, 19300, 0);
        put('LED 스크린', 40500, 17000, 0, { text: '실시간 중계' });
        put('발전기', 41500, 12800, 0);
        put('의자 배열', 30000, 27500, 180, { cols: 20, rows: 8, seatW: 600, gap: 1000, aisles: 1, aisleW: 1500, style: '의자 커버' });
        put('콘솔 데스크', 35500, 34300, 180);
        put('사람', 30000, 12600, 0, { count: 10, perRow: 10, style: '정장' });
        put('대형 텐트', 9000, 25000, 90, { size: 20000, depth: 10000 });
        [[6500, 19000], [11500, 19000], [6500, 25000], [11500, 25000], [6500, 31000], [11500, 31000]].forEach(([x, y]) => put('원형 테이블', x, y, 0, { chairs: 8 }));
        [18500, 24000, 29500].forEach((y) => put('몽골텐트', 51000, y, 90, { variant: '뒤·양옆' }));
        put('푸드트럭', 51000, 33800, 90);
        put('이동식 화장실', 56500, 39300, 0);
        put('이동식 화장실', 55100, 39300, 0);
        put('쓰레기통', 46500, 33500, 0);
        put('소화기', 23300, 21000, 0);
        put('데스크', 23500, 37600, 0, { text: '등록 · 안내' });
        put('사람', 23500, 37000, 0, { style: '스태프' });
        put('포토월', 37500, 37000, 0, { text: 'PHOTO ZONE', color: '#ec4899' });
        put('X배너', 33300, 39600, 0, { text: '행사장\n안내' });
        put('에어아치', 30000, 41000, 0, { text: '환영합니다', color: '#2563eb' });
        put('담장', 9000, 42500, 0, { size: 14000 });
        put('담장', 51000, 42500, 0, { size: 14000 });
        [[4000, 16000], [4000, 34000], [14000, 16000], [56000, 16000], [56000, 34000], [46000, 16000]].forEach(([x, y], i) => put('나무', x, y, 0, { style: i % 3 === 2 ? '벚나무' : '활엽수' }));
        put('가로등', 19500, 38500, 0);
        put('가로등', 40500, 38500, 0);
        put('화분', 25200, 22000, 0, { style: '축하 화환' });
        put('화분', 34800, 22000, 0, { style: '축하 화환' });
        route('관람객', '관람객 동선 1', [[30000, 44500], [30000, 35800], [30000, 23600]]);
        route('비상 대피', '비상 대피 동선 1', [[38300, 27500], [42000, 27500], [42000, 44500]]);
      });
      return [...doc.all()];
    }
    if (id === 'soccer') {
      // 운동장 110 × 90 m: 가운데 8인제 축구장, 위쪽 관람석, 아래쪽 벤치·본부석
      App.current.ground = 'soil';
      doc.transact('템플릿', () => {
        put('축구장', 55000, 45000, 0, { size: 68000, depth: 50000 });
        put('관람석', 55000, 12000, 0, { size: 36000, depth: 5000, tiers: 6 });
        put('선수 벤치', 41000, 76500, 180, { color: '#dc2626' });
        put('선수 벤치', 69000, 76500, 180, { color: '#2563eb' });
        put('몽골텐트', 55000, 79500, 180, { variant: '뒤·양옆' });
        put('테이블', 55000, 78500, 0, { chairs: 3 });
        put('점수판', 97500, 45000, 90, { size: 4000, text: 'HOME 2 : 1 AWAY' });
        put('시상대', 55000, 85500, 0);
        put('트로피', 59000, 85500, 0);
        put('사람', 47000, 45000, 90, { style: '선수', count: 6, perRow: 3, color: '#dc2626' });
        put('사람', 63000, 45000, 270, { style: '선수', count: 6, perRow: 3, color: '#2563eb' });
        put('사람', 55000, 10800, 0, { style: '일반', count: 24, perRow: 12 });
        [28000, 38000, 52000, 62000].forEach((y, i) => put('몽골텐트', 9000, y, 270, { variant: '뒤', color: i % 2 ? '#2563eb' : '#dc2626' }));
        put('에어아치', 2500, 45000, 90, { size: 8000, text: '시장기 축구대회', color: '#16a34a' });
        put('주차 구획', 27000, 3200, 0, { count: 10 });
        put('버스', 92000, 3500, 0);
        put('버스', 78000, 3500, 0, { color: '#2563eb' });
        put('구급차', 102000, 70000, 270);
        [22000, 23500, 25000].forEach((y) => put('이동식 화장실', 103000, y, 270));
        put('푸드트럭', 102500, 50000, 270);
        put('푸드트럭', 102500, 58500, 270, { color: '#dc2626' });
        put('분리수거함', 100500, 36000, 270);
        put('현수막', 55000, 16500, 0, { size: 10000, text: '제10회 시장기 생활체육 축구대회', color: '#16a34a' });
        [[17000, 14000], [93000, 14000], [17000, 76000], [93000, 76000]].forEach(([x, y]) => put('깃발', x, y, 0, { color: '#f59e0b' }));
        [[3000, 30000], [3000, 60000], [106000, 12000], [106000, 80000]].forEach(([x, y]) => put('나무', x, y, 0, { style: '활엽수' }));
        route('관람객', '관람객 동선 1', [[-2000, 45000], [14500, 45000], [14500, 12000], [35000, 12000]]);
      });
      return [...doc.all()];
    }
    if (id === 'festival') {
      // 광장 60 × 48 m: 왼쪽이 입구, 가운데 부스 거리, 오른쪽 끝에 무대
      App.current.ground = 'paver';
      doc.transact('템플릿', () => {
        zone(8000, 1500, 52000, 11000, '잔디 1', 'grass');
        put('분수', 30000, 6200, 0);
        [[24000, 6200, 90], [36000, 6200, 270]].forEach(([x, y, r]) => put('벤치', x, y, r));
        [[10000, 3500], [18000, 9000], [42000, 9000], [50000, 3500]].forEach(([x, y], i) => put('나무', x, y, 0, { style: ['단풍나무', '은행나무', '활엽수', '벚나무'][i] }));
        [10000, 14500, 19000, 23500, 28000].forEach((x, i) => {
          put('몽골텐트', x, 17500, 0, { size: 3000, depth: 3000, variant: '뒤·양옆', color: ['#dc2626', '#f59e0b', '#16a34a', '#2563eb', '#7c3aed'][i] });
          put('몽골텐트', x, 30500, 180, { size: 3000, depth: 3000, variant: '뒤·양옆', color: ['#0ea5e9', '#ec4899', '#facc15', '#16a34a', '#f97316'][i] });
        });
        put('무대', 50000, 24000, 90, { size: 9000, depth: 5400, variant: '트러스 지붕' });
        put('LED 스크린', 52200, 24000, 90, { size: 6000, text: '가을 문화 축제' });
        put('라인어레이', 46500, 17500, 90);
        put('라인어레이', 46500, 30500, 90);
        put('의자 배열', 39000, 24000, 270, { cols: 10, rows: 6, seatW: 550, gap: 950, aisles: 1, aisleW: 1400, style: '플라스틱' });
        put('풍선 아치', 3500, 24000, 90, { size: 6000 });
        put('입체 글자', 9000, 13200, 0, { text: 'FESTA', color: '#e11d48' });
        put('매표소', 5500, 33000, 90, { text: '안내·매표' });
        [[6500, 19500], [6500, 28500]].forEach(([x, y], i) => put('윙배너', x, y, 90, { text: '축제', color: i ? '#2563eb' : '#e11d48' }));
        [12000, 20000, 28000].forEach((x, i) => put('푸드트럭', x, 43500, 180, { color: ['#f59e0b', '#dc2626', '#16a34a'][i] }));
        [14000, 22000, 30000, 38000].forEach((x) => put('피크닉 테이블', x, 37500, 0));
        put('분리수거함', 36000, 44500, 180);
        put('이동식 화장실', 56000, 44000, 180);
        put('이동식 화장실', 57500, 44000, 180);
        put('풍선 다발', 33000, 17000, 0);
        put('풍선 다발', 33000, 31000, 0, { color: '#2563eb' });
        [[4000, 12000], [34000, 13500], [36500, 34500], [56000, 36000]].forEach(([x, y]) => put('가로등', x, y, 0));
        put('사람', 20000, 24500, 90, { style: '일반', count: 8, perRow: 4 });
        put('사람', 28000, 39500, 0, { style: '어린이', count: 4, perRow: 4 });
        route('관람객', '관람객 동선 1', [[0, 24000], [33500, 24000]]);
        route('비상 대피', '비상 대피 동선 1', [[33500, 34500], [33500, 46500], [44000, 46500]]);
      });
      return [...doc.all()];
    }
    if (id === 'gym') {
      // 체육관 44 × 28 m, 높이 9 m: 가운데 농구장, 양옆 관람석
      const concrete = C.wallTypes().find((t) => t.name.includes('콘크리트'));
      doc.transact('템플릿', () => {
        const pts = [[0, 0], [44000, 0], [44000, 28000], [0, 28000]];
        const ws = pts.map((p, i) => {
          const q = pts[(i + 1) % pts.length];
          const w = T.wall.create({ x: p[0], y: p[1] }, { x: q[0], y: q[1] }, { typeId: concrete ? concrete.id : undefined, height: 9000 });
          w.color = '#e8e2d2';
          return doc.add(w);
        });
        const wide = { width: 2400, height: 2400, style: '자동문' };
        doc.add(T.door.create(ws[2].id, 0.5, wide, 1, 'start'));
        doc.add(T.door.create(ws[3].id, 0.5, wide, 1, 'start'));
      });
      doc.transact('방', () => App.rooms.faces().forEach((f) => { const r = T.room.create(f.points, f.wallIds, '체육관'); r.ceilingHeight = 9000; r.wallHeight = 9000; doc.add(r); }));
      doc.transact('물건', () => {
        zone(600, 600, 43400, 27400, '체육관 마루 1', 'court', '#d2a66a');
        put('농구장', 22000, 14000, 0);
        put('관람석', 22000, 3000, 0, { size: 24000, depth: 3600, tiers: 5, color: '#dc2626' });
        put('관람석', 22000, 24200, 180, { size: 24000, depth: 3600, tiers: 5 });
        put('점수판', 42500, 14000, 90, { text: '72 : 68' });
        put('선수 벤치', 14000, 5800, 0, { size: 4000 });
        put('선수 벤치', 30000, 5800, 0, { size: 4000, color: '#dc2626' });
        put('데스크', 22000, 5600, 0, { text: '기록석' });
        put('시상대', 3500, 22000, 90);
        put('트로피', 3500, 18500, 0);
        put('사람', 22000, 14000, 0, { style: '선수', count: 5, perRow: 5, color: '#f59e0b' });
        put('현수막', 22000, 800, 0, { size: 10000, text: '생활체육 농구대회' });
        route('관람객', '관람객 동선 1', [[22000, 31000], [22000, 27000], [38000, 27000], [38000, 21500]]);
      });
      return [...doc.all()];
    }
    if (id === 'seminar') {
      // 강당 18 × 12 m. 위쪽이 무대, 아래쪽 벽에 문 두 개
      const concrete = C.wallTypes().find((t) => t.name.includes('콘크리트'));
      let bottom;
      doc.transact('템플릿', () => {
        const pts = [[0, 0], [18000, 0], [18000, 12000], [0, 12000]];
        const ws = pts.map((p, i) => {
          const q = pts[(i + 1) % pts.length];
          const w = T.wall.create({ x: p[0], y: p[1] }, { x: q[0], y: q[1] }, { typeId: concrete ? concrete.id : undefined, height: 4000 });
          w.height = 4000;
          return doc.add(w);
        });
        bottom = ws[2];
        const wide = { width: 1800, height: 2100, style: '자동문' };
        doc.add(T.door.create(bottom.id, 0.75, wide, 1, 'start')); // x = 4500 (벽은 오른쪽에서 왼쪽으로 그려짐)
        doc.add(T.door.create(bottom.id, 0.25, wide, 1, 'start')); // x = 13500
      });
      doc.transact('방', () => {
        App.rooms.faces().forEach((f) => {
          const r = T.room.create(f.points, f.wallIds, '강당');
          r.ceilingHeight = 4000;
          r.wallHeight = 4000;
          doc.add(r);
        });
      });
      doc.transact('물건', () => {
        put('무대', 9000, 2000, 0, { size: 5400, depth: 3600, h3: 450 });
        put('LED 스크린', 9000, 420, 0, { text: '2026 신제품 발표회' });
        put('연단', 7200, 2900, 0);
        put('사람', 7200, 2300, 0, { style: '정장' });
        put('스피커', 5400, 3300, 0);
        put('스피커', 12600, 3300, 0);
        put('의자 배열', 9000, 7300, 180, { cols: 14, rows: 5, seatW: 550, gap: 950, aisles: 1, aisleW: 1500, style: '연회 의자' });
        put('데스크', 1300, 8600, 270, { text: '등록' });
        put('X배너', 6300, 13300, 0, { text: '세미나\n입장' });
        put('포토월', 1750, 11450, 180, { size: 2400, text: 'PHOTO' });
        put('화분', 600, 600, 0);
        put('화분', 17400, 600, 0);
        put('소화기', 17500, 11500, 0);
        route('관람객', '관람객 동선 1', [[4500, 13800], [4500, 10800], [9000, 10800], [9000, 4600]]);
        route('비상 대피', '비상 대피 동선 1', [[14300, 7300], [16300, 7300], [16300, 10600], [13500, 10600], [13500, 13800]]);
      });
      return [...doc.all()];
    }
    if (id === 'room') {
      doc.transact('템플릿', () => {
        const [, , bottom] = ring([[0, 0], [3000, 0], [3000, 4000], [0, 4000]]);
        doc.add(T.door.create(bottom.id, 0.75, preset('door', '방문'), 1, 'start'));
      });
      doc.transact('방', () => addRooms([{ at: { x: 1500, y: 2000 }, name: '방 1' }]));
    } else if (id === 'studio' || id === 'furnished') {
      let top, right, bottom, left, part;
      doc.transact('템플릿', () => {
        [top, right, bottom, left] = ring([[0, 0], [6600, 0], [6600, 5400], [0, 5400]]);
        wall([0, 3300], [1800, 3300]);
        part = wall([1800, 3300], [1800, 5400]);
        doc.add(T.window.create(top.id, 0.5, preset('window', '거실 창')));
        doc.add(T.window.create(right.id, 0.3, preset('window', '방 창')));
        doc.add(T.door.create(bottom.id, 0.45, preset('door', '현관 방화문'), 1, 'end'));
        doc.add(T.door.create(part.id, 0.5, preset('door', '욕실문'), -1, 'start'));
      });
      doc.transact('방', () => addRooms([{ at: { x: 4000, y: 2500 }, name: '거실·방' }, { at: { x: 900, y: 4350 }, name: '욕실' }]));
      doc.transact('기호', () => {
        mounted(top, 0.15, '콘센트');
        mounted(top, 0.85, '콘센트');
        mounted(right, 0.75, '콘센트');
        const sw = mounted(bottom, 0.25, '스위치');
        const light = free(4200, 2200, '조명');
        free(900, 3900, '조명');
        mounted(left, 0.85, '분전반');
        mounted(right, 0.3, '에어컨 실내기');
        free(900, 4950, '배수구');
        const conduit = C.presets('line').find((p) => p.category === '전선관');
        doc.add(T.line.create({ x: sw.x, y: sw.y }, { x: sw.x, y: light.y }, conduit));
        doc.add(T.line.create({ x: sw.x, y: light.y }, { x: light.x, y: light.y }, conduit));
      });
      if (id === 'furnished') {
        doc.transact('가구', () => {
          // 등(기호 위쪽)을 벽에 대도록 돌려 놓음: 0 위쪽 벽, 90 오른쪽 벽, 180 아래쪽 벽, 270 왼쪽 벽
          put('침대', 5560, 900, 90, { size: 1500, depth: 2000 });
          put('옷장', 6270, 3400, 90, { size: 1800, depth: 600 });
          put('소파', 1300, 480, 0, { size: 2000, depth: 850 });
          put('TV장', 900, 3070, 180, { size: 1500, depth: 400 });
          put('식탁', 3300, 1800, 0, { size: 1200, depth: 800 });
          put('냉장고', 2650, 4990, 180, { size: 700, depth: 750 });
          put('싱크대', 5300, 5070, 180, { size: 1800, depth: 600 });
          put('변기', 380, 4700, 270);
          put('세면대', 700, 3555, 0);
          const def = C.itemDef('액자·벽보');
          const m = App.model.mountPoint(left, 0.6, 1, def.depth);
          const frame = T.item.create(m, def.category, def, m.rotation, { wallId: left.id, t: 0.6, side: 1 });
          frame.text = '우리 집';
          doc.add(frame);
        });
      }
    }
    return [...doc.all()];
  }

  /** 새 도면 만들어 열기 */
  async function create(name, templateId = 'blank') {
    flush();
    loading = true;
    let elements;
    try {
      elements = templateElements(templateId);
    } finally {
      loading = false;
    }
    const meta = { id: newId(), name: name.slice(0, NAME_MAX), createdAt: new Date().toISOString() };
    await apply({ elements, current: { ...App.current } }, meta);
    App.plan.fitToContent();
    saveNow();
    return meta.id;
  }

  /* ── 백업 파일 ── */
  const safeFile = (s) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || '도면';

  async function exportBackup() {
    saveNow();
    const data = snapshot();
    const underlays = {};
    data.elements.filter((e) => e.type === 'underlay').forEach((e) => {
      const u = App.underlay.exportData(e.dataId);
      if (u) underlays[e.dataId] = u;
    });
    data.underlays = underlays;
    data.images = {};
    for (const id of App.images.used(data.elements)) {
      const rec = await App.images.exportData(id);
      if (rec) data.images[id] = rec;
    }
    const name = `${safeFile(current.name)}_${App.exporter.stamp()}.json`;
    App.exporter.download(name, JSON.stringify(data), 'application/json');
    App.ui.toast(`‘${name}’을 저장했습니다. 다른 기기에서는 ‘파일 → 백업 불러오기’로 열 수 있습니다.`);
  }

  async function importBackup(file) {
    let data;
    try {
      data = JSON.parse(await file.text());
      if (data.kind !== FILE_KIND && !Array.isArray(data.elements)) throw new Error();
      migrate(data);
    } catch (_) {
      await App.ui.dialog({ title: '백업 파일을 읽지 못했습니다', html: '<p>이 앱에서 저장한 도면 백업(.json) 파일인지 확인하세요.</p>' });
      return false;
    }
    flush();
    App.ui.busy('백업을 여는 중…');
    let lost = 0;
    try {
      for (const u of Object.values(data.underlays || {})) if (!(await App.underlay.importData(u))) lost++;
      for (const rec of Object.values(data.images || {})) if (!(await App.images.importData(rec))) lost++;
    } finally {
      App.ui.busy(false);
    }
    const names = new Set(index().map((p) => p.name));
    let name = String(data.name || file.name.replace(/\.json$/i, '')).slice(0, NAME_MAX);
    if (names.has(name)) name = `${name} (불러옴)`.slice(0, NAME_MAX);
    const meta = { id: newId(), name, createdAt: data.createdAt || new Date().toISOString() };
    const m = await apply(data, meta);
    saveNow();
    App.ui.toast(`‘${name}’ 도면을 열었습니다.${lost ? ' 밑그림·이미지 일부는 이 기기에 저장하지 못했습니다.' : ''}`);
    if (m.newer) App.ui.toast('더 새 버전의 앱에서 만든 파일입니다. 일부 항목이 빠졌을 수 있습니다.');
    return meta.id;
  }

  /* ── 목록·이름·복제·삭제 ── */
  function rename(id, name) {
    const n = name.trim().slice(0, NAME_MAX);
    if (!n) return false;
    if (current && id === current.id) {
      current.name = n;
      showName();
      saveNow();
      return true;
    }
    const list = index();
    const p = list.find((x) => x.id === id);
    const data = S().read(keyOf(id));
    if (!p || !data) return false;
    p.name = n;
    data.name = n;
    return S().write(keyOf(id), data) && S().write(KEY_INDEX, list);
  }

  function duplicate(id) {
    if (current && id === current.id) saveNow();
    const data = S().read(keyOf(id));
    const p = index().find((x) => x.id === id);
    if (!data || !p) return null;
    const copy = { ...data, id: newId(), name: `${p.name} 사본`.slice(0, NAME_MAX), createdAt: new Date().toISOString() };
    if (!S().write(keyOf(copy.id), copy)) return null;
    const list = index();
    list.splice(list.findIndex((x) => x.id === id) + 1, 0, { ...p, id: copy.id, name: copy.name, createdAt: copy.createdAt, updatedAt: copy.createdAt });
    S().write(KEY_INDEX, list);
    return copy.id;
  }

  async function remove(id) {
    S().remove(keyOf(id));
    const list = index().filter((p) => p.id !== id);
    S().write(KEY_INDEX, list);
    if (current && id === current.id) {
      current = null;
      if (list.length) await open(list[0].id);
      else await create('새 도면', 'blank');
    }
    cleanupBlobs();
  }

  /** 어느 도면에서도 쓰지 않는 밑그림·이미지 데이터를 지움 */
  const cleanupBlobs = () => {
    App.underlay.cleanup(usedUnderlays());
    const used = new Set();
    index().forEach((p) => (p.images || []).forEach((id) => used.add(id)));
    App.images.used(App.doc.all()).forEach((id) => used.add(id));
    App.images.cleanup(used);
  };

  const usedUnderlays = () => {
    const used = new Set();
    index().forEach((p) => (p.underlays || []).forEach((id) => used.add(id)));
    if (current) App.underlay.list().forEach((u) => used.add(u.dataId));
    return used;
  };

  /* ── 화면: 새 도면, 도면 목록 ── */
  function defaultName() {
    const names = new Set(index().map((p) => p.name));
    for (let i = 1; ; i++) if (!names.has(`현장 ${i}`)) return `현장 ${i}`;
  }

  async function newDialog() {
    // 지금 쓰는 모드의 템플릿부터 보여 줌. 위쪽에서 모드를 바꿀 수 있음
    let mode = App.modes.get();
    let pick = TEMPLATES.find((t) => t.mode === mode).id;
    const tplHtml = () => TEMPLATES.filter((t) => t.mode === mode).map((t) => `<button type="button" class="tpl" role="radio" data-tpl="${t.id}" aria-checked="${t.id === pick}">
      <b>${t.name}</b><small>${t.desc}</small></button>`).join('');
    const r = await App.ui.dialog({
      title: '새 도면',
      html: `
        <div class="field">
          <label class="field-label" for="d-pname">이름</label>
          <div class="field-box"><input id="d-pname" type="text" maxlength="${NAME_MAX}" autocomplete="off" value="${esc(defaultName())}"></div>
        </div>
        <div class="seg seg-mode" role="tablist" aria-label="모드">
          ${App.modes.LIST.map((m) => `<button type="button" class="seg-btn" role="tab" data-newmode="${m.id}" aria-selected="${m.id === mode}">${m.title}</button>`).join('')}
        </div>
        <div class="tpl-list" role="radiogroup" aria-label="시작 모양">${tplHtml()}</div>
        <p class="props-meta">지금 도면은 자동 저장되어 ‘도면 목록’에 남습니다. 모드는 나중에 화면 왼쪽 위에서 바꿀 수 있습니다.</p>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '만들기', primary: true }],
      onOpen(body) {
        body.addEventListener('click', (e) => {
          const m = e.target.closest('[data-newmode]');
          if (m) {
            mode = m.dataset.newmode;
            pick = TEMPLATES.find((t) => t.mode === mode).id;
            body.querySelectorAll('[data-newmode]').forEach((x) => x.setAttribute('aria-selected', String(x === m)));
            body.querySelector('.tpl-list').innerHTML = tplHtml();
            return;
          }
          const b = e.target.closest('[data-tpl]');
          if (!b) return;
          pick = b.dataset.tpl;
          body.querySelectorAll('[data-tpl]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        });
      },
    });
    if (r.id !== 'ok') return;
    const name = r.body.querySelector('#d-pname').value.trim() || defaultName();
    await create(name, pick);
    App.ui.toast(`‘${name}’ 도면을 만들었습니다.${TEMPLATES.find((t) => t.id === pick).mode === 'event' ? ' 오른쪽 아래 3D 버튼으로 조감도를 볼 수 있습니다.' : ''}`);
  }

  function listHtml() {
    if (current) saveNow();
    const list = index();
    return `
      <div class="prj-list">
        ${list.map((p) => `
          <div class="prj${current && p.id === current.id ? ' is-current' : ''}" data-id="${esc(p.id)}">
            <button type="button" class="prj-open" data-act="open">
              <b>${esc(p.name)}</b>
              <small>${current && p.id === current.id ? '지금 연 도면 · ' : ''}그린 것 ${p.count || 0}개 · ${esc(timeText(p.updatedAt))}</small>
            </button>
            <div class="prj-acts">
              <button type="button" class="btn" data-act="rename">이름</button>
              <button type="button" class="btn" data-act="dup">복제</button>
              <button type="button" class="btn btn-danger" data-act="del">삭제</button>
            </div>
          </div>`).join('') || '<p class="props-meta">저장된 도면이 없습니다.</p>'}
      </div>`;
  }

  async function listDialog() {
    const r = await App.ui.dialog({
      title: '도면 목록',
      html: listHtml(),
      actions: [{ id: 'new', label: '새 도면' }, { id: 'close', label: '닫기', primary: true }],
      onOpen(body) {
        body.addEventListener('click', async (e) => {
          const act = e.target.closest('[data-act]');
          const row = act && act.closest('[data-id]');
          if (!row) return;
          const id = row.dataset.id;
          const p = index().find((x) => x.id === id);
          if (act.dataset.act === 'open') {
            document.querySelector('#dialogFoot [data-id="close"]').click();
            if (await open(id)) App.ui.toast(`‘${p.name}’ 도면을 열었습니다.`);
          } else if (act.dataset.act === 'rename') {
            // 그 줄을 이름 칸으로 바꿈
            row.innerHTML = `
              <div class="field-box prj-name" data-keys="local"><input type="text" maxlength="${NAME_MAX}" autocomplete="off" value="${esc(p.name)}" aria-label="도면 이름"></div>
              <div class="prj-acts">
                <button type="button" class="btn btn-primary" data-act="rename-ok">저장</button>
                <button type="button" class="btn" data-act="cancel">취소</button>
              </div>`;
            const input = row.querySelector('input');
            input.select();
            input.addEventListener('keydown', (k) => {
              if (k.key === 'Enter') { k.preventDefault(); k.stopPropagation(); row.querySelector('[data-act="rename-ok"]').click(); }
              if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); body.innerHTML = listHtml(); }
            });
          } else if (act.dataset.act === 'rename-ok') {
            if (!rename(id, row.querySelector('input').value)) {
              App.ui.toast('이름을 비워 둘 수 없습니다.');
              return;
            }
            body.innerHTML = listHtml();
          } else if (act.dataset.act === 'cancel') {
            body.innerHTML = listHtml();
          } else if (act.dataset.act === 'dup') {
            if (duplicate(id)) body.innerHTML = listHtml();
            else App.ui.toast('복제하지 못했습니다. 저장 공간이 부족할 수 있습니다.');
          } else if (act.dataset.act === 'del') {
            // 실수로 지우지 않게 한 번 더 누르게 함
            act.dataset.act = 'del-ok';
            act.textContent = '정말 삭제';
            act.classList.add('is-armed');
            setTimeout(() => {
              if (act.isConnected && act.dataset.act === 'del-ok') {
                act.dataset.act = 'del';
                act.textContent = '삭제';
                act.classList.remove('is-armed');
              }
            }, 3000);
          } else if (act.dataset.act === 'del-ok') {
            await remove(id);
            body.innerHTML = listHtml();
            App.ui.toast(`‘${p.name}’ 도면을 지웠습니다.`);
          }
        });
      },
    });
    if (r.id === 'new') newDialog();
  }

  /* ── 시작 ── */
  async function init() {
    App.doc.onChange(schedule);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    window.addEventListener('beforeunload', flush);
    // 안드로이드 앱이 뒤로 숨을 때도 바로 저장
    const C = window.Capacitor;
    if (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.App) C.Plugins.App.addListener('pause', flush);
    App.ui.on('settings', schedule); // 기본 벽 종류 등 고른 값도 저장
    App.ui.on('current', schedule);

    const fileInput = $('#projectFile');
    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0];
      fileInput.value = '';
      if (f) importBackup(f);
    });
    const menu = (sel, fn) => $(sel).addEventListener('click', () => {
      $('#fileMenu').hidden = true;
      $('#btnFile').setAttribute('aria-expanded', 'false');
      fn();
    });
    menu('#menuNew', newDialog);
    menu('#menuProjects', listDialog);
    menu('#menuBackup', exportBackup);
    menu('#menuRestore', () => fileInput.click());
    $('#btnProject').addEventListener('click', listDialog);

    const list = index();
    const lastId = S().read(KEY_CURRENT);
    const target = list.find((p) => p.id === lastId) || list[0];
    let opened = false;
    if (target) {
      try {
        opened = await open(target.id);
      } catch (e) {
        App.ui.toast('마지막 도면을 열지 못해 새 도면으로 시작합니다.');
      }
    }
    if (!opened) await create('새 도면', 'blank');
    cleanupBlobs();
  }

  App.projects = {
    init, saveNow, flush, open, create, exportBackup, importBackup, rename, duplicate, remove, newDialog, listDialog, TEMPLATES,
    stopSaving() {
      stopped = true;
      clearTimeout(timer);
    },
    get current() { return current; },
    list: index,
  };
})();
