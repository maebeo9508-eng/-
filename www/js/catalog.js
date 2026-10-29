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
  ];

  const FRAME_NAMES = { none: '없음', wood: '다루끼', metal: '경량 스터드' };
  const SHAPE_NAMES = { rect: '사각', circle: '원형' };
  const num = (v) => String(Number(v));

  const catalog = {
    FRAME_NAMES,
    SHAPE_NAMES,

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
      ['door', 'window', 'column'].forEach((kind) => {
        const key = `${kind}PresetId`;
        if (!valid(cur[key], (e) => e.type === 'preset' && e.kind === kind)) cur[key] = (catalog.presets(kind)[0] || {}).id || null;
      });
    },

    /** 기록 직전 훅: 벽이 없어진 문·창문은 지우고, 벽 두께를 벽 종류에 맞춤 (같은 실행 취소 단계) */
    syncHook(tx) {
      let walls = false, types = false;
      for (const [id, before] of tx.before) {
        const now = App.doc.get(id);
        const type = (now || before || {}).type;
        if (type === 'wall') walls = true;
        else if (type === 'wallType') types = true;
      }
      if (!walls && !types) return;
      for (const el of [...App.doc.all()]) {
        if ((el.type === 'door' || el.type === 'window') && !App.doc.has(el.wallId)) App.doc.remove(el.id);
        if (el.type === 'wall') {
          const t = catalog.typeOf(el);
          if (t && el.thickness !== catalog.thickness(t)) App.doc.update(el.id, { thickness: catalog.thickness(t) });
        }
      }
    },
  };

  App.catalog = catalog;
})();
