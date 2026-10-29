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
    ['line', { name: '전선관 CD 16C', category: '전선관', color: '#e03131', size: 16 }],
    ['line', { name: '전선관 CD 22C', category: '전선관', color: '#c2255c', size: 22 }],
    ['line', { name: '급수 배관 15A', category: '배관', color: '#1c7ed6', size: 20 }],
    ['line', { name: '배수 배관 50A', category: '배관', color: '#2f9e44', size: 60 }],
    ['line', { name: '덕트 Ø100', category: '덕트', color: '#0c8599', size: 100 }],
    ['line', { name: '덕트 Ø150', category: '덕트', color: '#0c8599', size: 150 }],
  ];

  /* 전기·설비 아이템 종류. size: 기본 기호 폭(mm), aspect: 깊이/폭, wall: 벽 가까이 놓으면 벽면에 붙임.
     line: 팔레트에서 고르면 선 그리기로 바뀌는 항목 (선 종류의 분류) */
  const ITEM_KINDS = {
    elec: [
      { kind: '콘센트', size: 250, aspect: 1, wall: true },
      { kind: '스위치', size: 200, aspect: 1, wall: true },
      { kind: '조명', size: 400, aspect: 1 },
      { kind: '분전반', size: 600, aspect: 0.5, wall: true },
      { line: '전선관' },
    ],
    mech: [
      { kind: '에어컨 실내기', size: 900, aspect: 0.3, wall: true },
      { kind: '에어컨 실외기', size: 800, aspect: 0.45 },
      { kind: '환기구', size: 250, aspect: 1 },
      { kind: '배수구', size: 150, aspect: 1 },
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

  const catalog = {
    FRAME_NAMES,
    SHAPE_NAMES,
    ITEM_KINDS,
    LINE_CATEGORIES,
    COLORS,

    itemDef(kind) {
      return [...ITEM_KINDS.elec, ...ITEM_KINDS.mech].find((d) => d.kind === kind) || null;
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
      if (p.kind === 'line') return p.category === '덕트' ? `${p.category} · 폭 ${num(p.size)}` : `${p.category} · ${catalog.colorName(p.color)}`;
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

    /** 기록 직전 훅: 벽이 없어진 문·창문은 지우고, 벽 두께를 벽 종류에, 선 분류·레이어를 선 종류에 맞춤 (같은 실행 취소 단계) */
    syncHook(tx) {
      const types = catalog.touchedTypes(tx);
      const walls = types.has('wall') || types.has('wallType');
      const lines = types.has('line') || types.has('preset');
      if (!walls && !lines) return;
      for (const el of [...App.doc.all()]) {
        if (walls && (el.type === 'door' || el.type === 'window') && !App.doc.has(el.wallId)) App.doc.remove(el.id);
        if (walls && el.type === 'wall') {
          const t = catalog.typeOf(el);
          if (t && el.thickness !== catalog.thickness(t)) App.doc.update(el.id, { thickness: catalog.thickness(t) });
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
