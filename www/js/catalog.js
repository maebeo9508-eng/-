/* 목록: 벽 종류(틀·석고 구성)와 문·창문·기둥 프리셋.
   목록 항목은 도면 데이터 안에 함께 저장되어, 고치면 실행 취소가 되고 프로젝트 파일에도 따라간다.
   벽 두께는 벽 종류에서 정해지고, 벽 종류를 고치면 그 종류의 벽이 모두 함께 바뀐다. */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const BOARD = { boardT: 9.5, boardW: 900, boardL: 1800 };
  const WOOD = { frameKind: 'wood', frameDepth: 30, frameSpacing: 450, frameRowSpacing: 900, framePiece: 3600 };
  const METAL = { frameKind: 'metal', frameDepth: 65, frameSpacing: 450, frameRowSpacing: 0, framePiece: 3000 };
  const NO_FRAME = { frameKind: 'none', frameDepth: 30, frameSpacing: 450, frameRowSpacing: 0, framePiece: 3600 };
  // 로스는 현장 기준이 아직 없어 0%. 벽 종류마다 고칠 수 있음
  const NO_LOSS = { frameLoss: 0, boardLoss: 0 };

  // 층 순서(마감 쪽 → 반대쪽): [마감 쪽 석고][틀][기존 벽][반대쪽 석고]
  const DEFAULT_WALL_TYPES = [
    { name: '가벽 · 다루끼', base: 0, ...WOOD, ...BOARD, boardFace: 1, boardBack: 1, ...NO_LOSS },
    { name: '가벽 · 경량 스터드', base: 0, ...METAL, ...BOARD, boardFace: 2, boardBack: 2, ...NO_LOSS },
    { name: '덧방 · 다루끼', base: 150, ...WOOD, ...BOARD, boardFace: 1, boardBack: 0, ...NO_LOSS },
    { name: '기존 벽 · 콘크리트', base: 150, ...NO_FRAME, ...BOARD, boardFace: 0, boardBack: 0, ...NO_LOSS },
  ];

  const DEFAULT_PRESETS = [
    ['door', { name: '방문', style: '여닫이', width: 900, height: 2100 }],
    ['door', { name: '욕실문', style: '여닫이', width: 800, height: 2100 }],
    ['door', { name: '현관 방화문', style: '방화문', width: 1000, height: 2100 }],
    ['door', { name: '미닫이문', style: '미닫이', width: 900, height: 2100 }],
    ['window', { name: '방 창', style: '미서기', width: 1200, height: 1200, sill: 900 }],
    ['window', { name: '거실 창', style: '미서기', width: 2400, height: 2100, sill: 300 }],
    ['window', { name: '욕실 창', style: '프로젝트창', width: 600, height: 600, sill: 1500 }],
    ['column', { name: '사각 기둥', shape: 'rect', width: 400, depth: 400 }],
    ['column', { name: '원형 기둥', shape: 'circle', width: 400, depth: 400 }],
    // 선 종류: size는 관·덕트 지름(폭). 덕트는 이 폭으로 그림
    // runHeight: 배관이 지나가는 높이(mm, null이면 천장 속). 기구까지 오르내리는 수직 길이를 자동 계산할 때 씀
    ['line', { name: '전선관 CD 16C', category: '전선관', color: '#e03131', size: 16, runHeight: null }],
    ['line', { name: '전선관 CD 22C', category: '전선관', color: '#c2255c', size: 22, runHeight: null }],
    ['line', { name: '급수 배관 15A', category: '배관', color: '#1c7ed6', size: 20, runHeight: 0 }],
    ['line', { name: '배수 배관 50A', category: '배관', color: '#2f9e44', size: 60, runHeight: 0 }],
    ['line', { name: '덕트 Ø100', category: '덕트', color: '#0c8599', size: 100, runHeight: null }],
    ['line', { name: '덕트 Ø150', category: '덕트', color: '#0c8599', size: 150, runHeight: null }],
  ];

  /* 전기·설비 아이템 종류
     size: 기본 기호 폭(mm), aspect: 깊이/폭, wall: 벽 가까이 놓으면 벽면에 붙고 벽을 따라감
     height: 설치 높이(바닥에서 기구 가운데까지, mm). null이면 천장 (방의 천장 높이)
     options: 고르는 값 (구수·형식 등), numbers: 숫자 값 (회로 수 등)
     line: 팔레트에서 고르면 선 그리기로 바뀌는 항목 (선 종류의 분류) */
  const GANG = { label: '구수', values: ['1구', '2구', '3구', '4구'] };
  const ITEM_KINDS = {
    elec: [
      {
        kind: '콘센트', size: 250, aspect: 1, wall: true, height: 300,
        options: { gang: { ...GANG, default: '2구' }, variant: { label: '형식', values: ['일반(접지)', '방수형', '전용', '바닥형'], default: '일반(접지)' } },
      },
      {
        kind: '스위치', size: 200, aspect: 1, wall: true, height: 1200,
        options: { gang: { ...GANG, default: '1구' }, variant: { label: '형식', values: ['일반', '3로(두 곳에서 켜기)', '디밍'], default: '일반' } },
      },
      {
        kind: '조명', size: 400, aspect: 1, height: null,
        options: { variant: { label: '형식', values: ['다운라이트', 'LED 평판등', '등기구', '간접등', '센서등'], default: '다운라이트' } },
      },
      {
        kind: '분전반', size: 600, aspect: 0.5, wall: true, height: 1500,
        numbers: { circuits: { label: '회로 수', unit: '회로', default: 12, min: 1, max: 200 } },
      },
      { line: '전선관' },
    ],
    mech: [
      {
        kind: '에어컨 실내기', size: 900, aspect: 0.3, wall: true, height: 2100,
        options: { variant: { label: '형식', values: ['벽걸이', '스탠드', '천장형'], default: '벽걸이' } },
      },
      {
        kind: '에어컨 실외기', size: 800, aspect: 0.45, height: 0,
        options: { variant: { label: '설치', values: ['바닥', '벽 거치대', '옥상'], default: '바닥' } },
      },
      {
        kind: '환기구', size: 250, aspect: 1, height: null,
        options: { variant: { label: '형식', values: ['천장형', '벽부형'], default: '천장형' } },
      },
      {
        kind: '배수구', size: 150, aspect: 1, height: 0,
        options: { variant: { label: '규격', values: ['50A', '75A', '100A'], default: '50A' } },
      },
      { line: '배관' },
      { line: '덕트' },
    ],
  };
  const LINE_CATEGORIES = ['전선관', '배관', '덕트', '기타'];
  const COLORS = [
    ['#e03131', '빨강'], ['#c2255c', '자홍'], ['#e8590c', '주황'], ['#f08c00', '노랑'], ['#2f9e44', '초록'],
    ['#0c8599', '청록'], ['#1c7ed6', '파랑'], ['#7048e8', '보라'], ['#495057', '회색'],
  ];

  const FRAME_NAMES = { none: '없음', wood: '다루끼', metal: '경량 스터드' };
  const SHAPE_NAMES = { rect: '사각', circle: '원형' };
  const num = (v) => String(Number(v));
  const G_dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  const catalog = {
    FRAME_NAMES,
    SHAPE_NAMES,
    ITEM_KINDS,
    LINE_CATEGORIES,
    COLORS,

    itemDef(kind) {
      return [...ITEM_KINDS.elec, ...ITEM_KINDS.mech].find((d) => d.kind === kind) || null;
    },
    /** 종류의 기본 속성값 (설치 높이, 구수·형식, 회로 수) */
    itemDefaults(def) {
      const v = { height: def.height ?? null };
      Object.entries(def.options || {}).forEach(([k, o]) => { v[k] = o.default; });
      Object.entries(def.numbers || {}).forEach(([k, o]) => { v[k] = o.default; });
      return v;
    },
    /** 집계용 이름: '콘센트 2구 · 일반(접지)', '분전반 12회로' */
    itemLabel(it) {
      const parts = [it.kind + (it.gang ? ` ${it.gang}` : '') + (it.circuits ? ` ${it.circuits}회로` : '')];
      if (it.variant) parts.push(it.variant);
      return parts.join(' · ');
    },
    /** 선 분류에 맞는 레이어: 전선관은 전기, 나머지는 설비 */
    lineLayer(category) {
      return category === '전선관' ? 'elec' : 'mech';
    },
    colorName(hex) {
      const c = COLORS.find(([h]) => h === hex);
      return c ? c[1] : hex;
    },

    /** 새 도면의 기본 목록 */
    defaultElements() {
      const T = App.model.TYPES;
      return [
        ...DEFAULT_WALL_TYPES.map((p) => T.wallType.create(p)),
        ...DEFAULT_PRESETS.map(([kind, p]) => T.preset.create(kind, p)),
      ];
    },

    /** 벽 종류의 전체 두께(mm) */
    thickness(t) {
      return (t.base || 0) + (t.frameKind !== 'none' ? t.frameDepth : 0) + t.boardT * (t.boardFace + t.boardBack);
    },

    typeOf(wall) {
      const t = wall.typeId && App.doc.get(wall.typeId);
      return t && t.type === 'wallType' ? t : null;
    },
    wallTypes() {
      return [...App.doc.all()].filter((e) => e.type === 'wallType');
    },
    presets(kind) {
      return [...App.doc.all()].filter((e) => e.type === 'preset' && e.kind === kind);
    },
    /** 이 벽 종류를 쓰는 벽 수 */
    usage(typeId) {
      let n = 0;
      for (const el of App.doc.all()) if (el.type === 'wall' && el.typeId === typeId) n++;
      return n;
    },
    /** 한쪽만 마감하는 종류인지 (뒤집기 버튼이 필요한지) */
    isOneSided(t) {
      return t.boardFace !== t.boardBack || (t.frameKind !== 'none' && t.base > 0);
    },

    /** 한 줄 설명: '다루끼 30 @450 · 석고 9.5T 양면 1겹 · 49 mm' */
    describe(t) {
      const parts = [];
      if (t.base > 0) parts.push(`기존 벽 ${num(t.base)}`);
      if (t.frameKind !== 'none') parts.push(`${FRAME_NAMES[t.frameKind]} ${num(t.frameDepth)} @${num(t.frameSpacing)}`);
      const f = t.boardFace, b = t.boardBack;
      if (f || b) {
        const layers = f === b ? `양면 ${f}겹` : !b ? `한쪽 ${f}겹` : !f ? `반대쪽 ${b}겹` : `${f}+${b}겹`;
        parts.push(`석고 ${num(t.boardT)}T ${layers}`);
      }
      parts.push(App.units.formatLength(catalog.thickness(t)));
      return parts.join(' · ');
    },
    describePreset(p) {
      if (p.kind === 'line') {
        const run = p.runHeight == null ? '천장' : p.runHeight === 0 ? '바닥' : `높이 ${num(p.runHeight)}`;
        return `${p.category} · ${p.category === '덕트' ? `폭 ${num(p.size)}` : catalog.colorName(p.color)} · ${run}`;
      }
      if (p.kind === 'column') {
        return p.shape === 'circle' ? `원형 Ø${num(p.width)}` : `사각 ${num(p.width)}×${num(p.depth)}`;
      }
      const size = `${num(p.width)}×${num(p.height)}`;
      return p.kind === 'window' ? `${p.style} ${size} · 하단 ${num(p.sill)}` : `${p.style} ${size}`;
    },

    /** 도구가 쓸 '지금 고른' 벽 종류·프리셋이 없어졌으면 목록의 첫 항목으로 */
    ensureCurrent() {
      const cur = (App.current = App.current || {});
      const valid = (id, ok) => id && App.doc.has(id) && ok(App.doc.get(id));
      if (!valid(cur.wallTypeId, (e) => e.type === 'wallType')) cur.wallTypeId = (catalog.wallTypes()[0] || {}).id || null;
      ['door', 'window', 'column', 'line'].forEach((kind) => {
        const key = `${kind}PresetId`;
        if (!valid(cur[key], (e) => e.type === 'preset' && e.kind === kind)) cur[key] = (catalog.presets(kind)[0] || {}).id || null;
      });
      if (!cur.elecKind) cur.elecKind = '콘센트';
      if (!cur.mechKind) cur.mechKind = '에어컨 실내기';
      if (!cur.zoneColor) cur.zoneColor = '#7048e8'; // 선택 표시(주황)·방 바닥(파랑)과 헷갈리지 않는 보라
      if (!cur.textSize) cur.textSize = '200';
    },

    /** 이번 변경에 들어 있는 요소 종류들 */
    touchedTypes(tx) {
      const types = new Set();
      for (const [id, before] of tx.before) {
        const now = App.doc.get(id);
        types.add((now || before || {}).type);
      }
      return types;
    },

    /** 기록 직전 훅: 벽이 없어진 문·창문은 지우고, 벽 두께를 벽 종류에, 선 분류·레이어를 선 종류에 맞추고,
        벽에 붙은 기호를 벽 위치에 다시 맞춤 (같은 실행 취소 단계) */
    syncHook(tx) {
      const types = catalog.touchedTypes(tx);
      const walls = types.has('wall') || types.has('wallType');
      const lines = types.has('line') || types.has('preset');
      const items = walls || types.has('item');
      if (!walls && !lines && !items) return;
      for (const el of [...App.doc.all()]) {
        if (walls && (el.type === 'door' || el.type === 'window') && !App.doc.has(el.wallId)) App.doc.remove(el.id);
        if (walls && el.type === 'wall') {
          const t = catalog.typeOf(el);
          if (t && el.thickness !== catalog.thickness(t)) App.doc.update(el.id, { thickness: catalog.thickness(t) });
        }
      }
      for (const el of [...App.doc.all()]) {
        if (items && el.type === 'item' && el.wallId) {
          const w = App.doc.get(el.wallId);
          if (!w || G_dist(w.start, w.end) < 1) {
            App.doc.update(el.id, { wallId: null, t: null, side: null }); // 벽이 없어지면 그 자리에 남김
          } else {
            const def = catalog.itemDef(el.kind) || { aspect: 1 };
            const m = App.model.mountPoint(w, el.t, el.side, el.size * def.aspect);
            if (Math.abs(m.x - el.x) > 0.01 || Math.abs(m.y - el.y) > 0.01 || m.rotation !== el.rotation) App.doc.update(el.id, m);
          }
        }
        if (lines && el.type === 'line') {
          const p = App.doc.get(el.presetId);
          if (p && (el.category !== p.category || el.layer !== catalog.lineLayer(p.category))) {
            App.doc.update(el.id, { category: p.category, layer: catalog.lineLayer(p.category) });
          }
        }
      }
    },

    /** 방 경계를 맞춘 뒤 실행: 아이템·기둥이 들어 있는 방을 room에 기록 (방별 집계용) */
    roomHook(tx) {
      const types = catalog.touchedTypes(tx);
      if (!['item', 'column', 'room', 'wall'].some((t) => types.has(t))) return;
      const rooms = [...App.doc.all()].filter((e) => e.type === 'room');
      for (const el of [...App.doc.all()]) {
        if (el.type !== 'item' && el.type !== 'column') continue;
        let best = null, bestArea = Infinity;
        rooms.forEach((r) => {
          if (!App.geom.pointInPolygon({ x: el.x, y: el.y }, r.points)) return;
          const a = Math.abs(App.geom.signedArea(r.points));
          if (a < bestArea) { best = r.id; bestArea = a; }
        });
        if (el.room !== best) App.doc.update(el.id, { room: best });
      }
    },
  };

  App.catalog = catalog;
})();
