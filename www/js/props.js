/* 속성 패널: 선택한 항목의 속성을 보고 고친다.
   숫자는 설정 단위로 보여 주고 mm로 저장. 잘못된 값(숫자 아님, 0 이하, 너무 큼)은 막고 안내 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const G = App.geom;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const COORD_LIMIT = 10000000; // 좌표 범위 ±10km
  const NAME_MAX = 40;

  const wallOf = (el) => App.doc.get(el.wallId);
  const geomOf = (el) => App.model.openingGeom(el);

  /** 같은 벽의 다른 문·창문과 겹치는지 (가운데 c, 폭 width 기준) */
  function overlaps(el, c, width) {
    return App.measure.openingsOf(el.wallId).some((o) => {
      if (o.id === el.id) return false;
      const g = geomOf(o);
      return g && Math.abs(g.c - c) < g.half + width / 2 - 0.5;
    });
  }

  /* 숫자 칸 정의. min이 0보다 크면 0 이하는 막음. check(요소, 새 값)는 막을 이유를 돌려줌. apply가 있으면 그것으로 반영 */
  const OPENING = {
    width: {
      label: '폭', min: 100, max: 20000, get: (o) => o.width, set: (o, v) => ({ width: v }),
      check: (o, v) => {
        const g = geomOf(o);
        if (!g) return null;
        if (v > g.L) return `벽 길이(${App.units.formatLength(g.L)})보다 넓을 수 없습니다.`;
        const c = G.clamp(o.t * g.L, v / 2, g.L - v / 2);
        return overlaps(o, c, v) ? '넓히면 다른 문·창문과 겹칩니다.' : null;
      },
    },
    height: {
      label: '높이', min: 100, max: 20000, get: (o) => o.height, set: (o, v) => ({ height: v }),
      check: (o, v) => {
        const w = wallOf(o);
        const top = v + (o.type === 'window' ? o.sill : 0);
        return w && top > w.height ? `벽 높이(${App.units.formatLength(w.height)})를 넘습니다.` : null;
      },
    },
    offset: {
      label: '벽 시작에서', min: 0, max: 1000000,
      get: (o) => { const g = geomOf(o); return g ? g.c - g.half : 0; },
      set: (o, v) => { const g = geomOf(o); return { t: (v + g.half) / g.L }; },
      check: (o, v) => {
        const g = geomOf(o);
        if (!g) return null;
        if (v + g.half * 2 > g.L + 0.5) return `벽 끝을 넘습니다. ${App.units.formatLength(g.L - g.half * 2)} 이하로 입력하세요.`;
        return overlaps(o, v + g.half, g.half * 2) ? '그 자리에는 다른 문·창문이 있습니다.' : null;
      },
    },
  };

  /* 벽까지 거리 칸: 가장자리에서 그 방향 벽 면까지. 고치면 그만큼 떨어지게 옮김 (벽에 붙은 기호는 벽을 따라) */
  const GAPS = [['gapLeft', 'left', '← 왼쪽 벽까지'], ['gapRight', 'right', '→ 오른쪽 벽까지'], ['gapUp', 'up', '↑ 위쪽 벽까지'], ['gapDown', 'down', '↓ 아래쪽 벽까지']];
  function movedPatch(el, dx, dy) {
    const w = el.type === 'item' && el.wallId && App.doc.get(el.wallId);
    if (w) {
      const L = G.dist(w.start, w.end);
      const t = ((el.x + dx - w.start.x) * (w.end.x - w.start.x) + (el.y + dy - w.start.y) * (w.end.y - w.start.y)) / (L * L);
      return { t: G.clamp(t, 0, 1) };
    }
    return { x: el.x + dx, y: el.y + dy };
  }
  const gapFields = () => Object.fromEntries(GAPS.map(([key, dir, label]) => [key, {
    label, min: 0, max: 1000000,
    get: (el) => { const c = App.dims.clearance(el); return c && c[dir] ? c[dir].edge : null; },
    set: (el, v) => {
      const c = App.dims.clearance(el);
      if (!c || !c[dir]) return {};
      const k = c[dir], move = k.edge - v;
      return movedPatch(el, k.dir.x * move, k.dir.y * move);
    },
  }]));

  /** 벽 끝을 숫자로 옮길 때: '늘리기'가 켜져 있으면 그 끝에 이어진 다른 벽 끝도 같이 옮김 (손잡이로 끌 때와 같게).
      안 그러면 모서리가 떨어져 방이 '경계 끊김'이 되거나 벽이 모서리 밖으로 삐져나옴 */
  const wallEndApply = (set) => (walls, v) => {
    const ids = new Set(walls.map((w) => w.id));
    walls.forEach((w0) => {
      const w = App.doc.get(w0.id);
      if (!w) return;
      const patch = set(w, v);
      const moves = ['start', 'end'].filter((end) => patch[end] && !G.samePoint(patch[end], w[end], 0.01)).map((end) => ({ from: { ...w[end] }, to: patch[end] }));
      App.doc.update(w.id, patch);
      if (!App.settings.stretchWalls) return;
      moves.forEach((m) => {
        for (const el of App.doc.all()) {
          if (el.type !== 'wall' || ids.has(el.id) || el.locked) continue;
          ['start', 'end'].forEach((end) => { if (G.samePoint(el[end], m.from, 1)) App.doc.update(el.id, { [end]: { ...m.to } }); });
        }
      });
    });
  };
  const wallEnd = (f) => ({ ...f, apply: wallEndApply(f.set) });

  const FIELDS = {
    wall: {
      length: wallEnd({
        label: '길이', min: 1, max: 1000000,
        get: (w) => G.dist(w.start, w.end),
        // 시작점은 두고 끝점을 같은 방향으로 옮김
        set: (w, v) => {
          const d = G.unit({ x: w.end.x - w.start.x, y: w.end.y - w.start.y });
          return { end: { x: w.start.x + d.x * v, y: w.start.y + d.y * v } };
        },
        check: (w) => (G.dist(w.start, w.end) < 0.001 ? '길이가 0인 벽은 방향이 없어 길이를 바꿀 수 없습니다.' : null),
      }),
      height: { label: '높이', min: 100, max: 20000, get: (w) => w.height, set: (w, v) => ({ height: v }) },
      sx: wallEnd({ label: 'X', min: -COORD_LIMIT, max: COORD_LIMIT, get: (w) => w.start.x, set: (w, v) => ({ start: { x: v, y: w.start.y } }) }),
      sy: wallEnd({ label: 'Y', min: -COORD_LIMIT, max: COORD_LIMIT, get: (w) => w.start.y, set: (w, v) => ({ start: { x: w.start.x, y: v } }) }),
      ex: wallEnd({ label: 'X', min: -COORD_LIMIT, max: COORD_LIMIT, get: (w) => w.end.x, set: (w, v) => ({ end: { x: v, y: w.end.y } }) }),
      ey: wallEnd({ label: 'Y', min: -COORD_LIMIT, max: COORD_LIMIT, get: (w) => w.end.y, set: (w, v) => ({ end: { x: w.end.x, y: v } }) }),
    },
    room: {
      ceilingHeight: { label: '천장 높이', min: 100, max: 20000, get: (r) => r.ceilingHeight, set: (r, v) => ({ ceilingHeight: v }) },
      // 면적 칸: 설정 면적 단위로 입력. 비우면 바닥 면적과 같음 (천장이 없는 곳은 0)
      ceilingArea: {
        label: '천장 면적 (비우면 바닥과 같음)', area: true, min: 0, max: 1e12, allowEmpty: true, emptyText: '바닥과 같음',
        get: (r) => r.ceilingArea, set: (r, v) => ({ ceilingArea: v }),
      },
      // 방의 벽 높이를 바꾸면 그 방을 둘러싼 벽들의 높이도 함께 바꿈
      wallHeight: {
        label: '벽 높이', min: 100, max: 20000, get: (r) => r.wallHeight,
        apply: (rooms, v) => rooms.forEach((r) => {
          App.doc.update(r.id, { wallHeight: v });
          r.wallIds.forEach((id) => App.doc.has(id) && App.doc.update(id, { height: v }));
        }),
      },
    },
    door: OPENING,
    window: {
      ...OPENING,
      sill: {
        label: '하단 높이', min: 0, max: 20000, get: (o) => o.sill, set: (o, v) => ({ sill: v }),
        check: (o, v) => {
          const w = wallOf(o);
          return w && v + o.height > w.height ? `창 위가 벽 높이(${App.units.formatLength(w.height)})를 넘습니다.` : null;
        },
      },
    },
    item: {
      size: { label: '기호 크기', min: 50, max: 100000, get: (it) => it.size, set: (it, v) => ({ size: v }) },
      depth: { label: '깊이', min: 10, max: 100000, get: (it) => it.depth, set: (it, v) => ({ depth: v }) },
      h3: { label: '높이 (3D)', min: 1, max: 50000, get: (it) => App.catalog.itemHeight3(it), set: (it, v) => ({ h3: v }) },
      height: {
        label: '설치 높이 (비우면 천장)', min: 0, max: 20000, allowEmpty: true, emptyText: '천장',
        get: (it) => it.height, set: (it, v) => ({ height: v }),
      },
      x: { label: 'X', min: -COORD_LIMIT, max: COORD_LIMIT, get: (it) => it.x, set: (it, v) => ({ x: v }) },
      y: { label: 'Y', min: -COORD_LIMIT, max: COORD_LIMIT, get: (it) => it.y, set: (it, v) => ({ y: v }) },
      ...gapFields(),
    },
    line: {
      length: {
        label: '평면 길이', min: 1, max: 1000000,
        get: (l) => G.dist(l.start, l.end),
        set: (l, v) => {
          const d = G.unit({ x: l.end.x - l.start.x, y: l.end.y - l.start.y });
          return { end: { x: l.start.x + d.x * v, y: l.start.y + d.y * v } };
        },
        check: (l) => (G.dist(l.start, l.end) < 0.001 ? '길이가 0인 선은 방향이 없어 길이를 바꿀 수 없습니다.' : null),
      },
      runHeight: {
        label: '배관 높이 (비우면 천장)', min: 0, max: 20000, allowEmpty: true, emptyText: '천장',
        get: (l) => l.runHeight, set: (l, v) => ({ runHeight: v }),
      },
      rise: { label: '추가 수직 길이', min: 0, max: 100000, get: (l) => l.rise || 0, set: (l, v) => ({ rise: v }) },
      sx: { label: 'X', min: -COORD_LIMIT, max: COORD_LIMIT, get: (l) => l.start.x, set: (l, v) => ({ start: { x: v, y: l.start.y } }) },
      sy: { label: 'Y', min: -COORD_LIMIT, max: COORD_LIMIT, get: (l) => l.start.y, set: (l, v) => ({ start: { x: l.start.x, y: v } }) },
      ex: { label: 'X', min: -COORD_LIMIT, max: COORD_LIMIT, get: (l) => l.end.x, set: (l, v) => ({ end: { x: v, y: l.end.y } }) },
      ey: { label: 'Y', min: -COORD_LIMIT, max: COORD_LIMIT, get: (l) => l.end.y, set: (l, v) => ({ end: { x: l.end.x, y: v } }) },
    },
    text: {
      size: { label: '글자 크기', min: 10, max: 5000, get: (t) => t.size, set: (t, v) => ({ size: v }) },
    },
    route: {
      width: { label: '통로 폭', min: 300, max: 30000, get: (r) => r.width, set: (r, v) => ({ width: v }) },
    },
    dim: {
      manual: {
        label: '표시 값 (비우면 자동)', min: 0, max: 1000000, allowEmpty: true,
        get: (d) => d.manual, set: (d, v) => ({ manual: v }),
      },
      offset: { label: '치수선 띄우기', min: -100000, max: 100000, get: (d) => d.offset || 0, set: (d, v) => ({ offset: v }) },
    },
    underlay: {
      x: { label: 'X', min: -COORD_LIMIT, max: COORD_LIMIT, get: (u) => u.x, set: (u, v) => ({ x: v }) },
      y: { label: 'Y', min: -COORD_LIMIT, max: COORD_LIMIT, get: (u) => u.y, set: (u, v) => ({ y: v }) },
    },
    column: {
      width: {
        label: '폭', min: 50, max: 5000, get: (c) => c.width,
        set: (c, v) => (c.shape === 'circle' ? { width: v, depth: v } : { width: v }),
      },
      depth: { label: '깊이', min: 50, max: 5000, get: (c) => c.depth, set: (c, v) => ({ depth: v }) },
      x: { label: 'X', min: -COORD_LIMIT, max: COORD_LIMIT, get: (c) => c.x, set: (c, v) => ({ x: v }) },
      y: { label: 'Y', min: -COORD_LIMIT, max: COORD_LIMIT, get: (c) => c.y, set: (c, v) => ({ y: v }) },
      ...gapFields(),
    },
  };

  let pane = null;
  let shownKey = null;
  let els = [];
  let fields = {}; // 지금 보이는 종류의 숫자 칸 정의

  function validate(text, f) {
    if (f.allowEmpty && String(text).trim() === '') return { value: null };
    const U = App.units;
    const mm = f.area ? U.parseArea(text) : U.parseLength(text);
    const fmt = (v) => (f.area ? U.formatArea(v) : U.formatLength(v));
    if (String(text).trim() === '' || Number.isNaN(mm)) return { error: '숫자를 입력하세요.' };
    if (f.min > 0 && mm <= 0) return { error: '0보다 큰 값을 입력하세요.' };
    if (mm < f.min) return { error: `${fmt(f.min)} 이상으로 입력하세요.` };
    if (mm > f.max) return { error: `${fmt(f.max)} 이하로 입력하세요.` };
    const problem = f.check && els.map((e) => f.check(e, mm)).find(Boolean);
    if (problem) return { error: problem };
    return { value: mm };
  }

  const sameNumber = (a, b) => a === b || (a != null && b != null && Math.abs(a - b) < 0.001);
  /** 여러 개 선택했을 때 값이 모두 같으면 그 값, 다르면 null */
  const common = (get) => {
    const first = get(els[0]);
    return els.every((e) => sameNumber(get(e), first)) ? first : null;
  };
  /** 숫자 칸에 보일 글자와 빈칸 안내: 값이 여러 개면 '여러 값', 비워 둔 값(천장·자동)이면 그 뜻 */
  function shown(f) {
    const first = f.get(els[0]);
    if (!els.every((e) => sameNumber(f.get(e), first))) return { value: '', placeholder: '여러 값' };
    if (first == null) return { value: '', placeholder: f.emptyText || '자동' };
    return { value: f.area ? App.units.inputArea(first) : App.units.inputLength(first), placeholder: '' };
  }
  const commonText = (get) => (els.every((e) => get(e) === get(els[0])) ? get(els[0]) : null);

  function numberField(key, label) {
    const f = fields[key];
    const { value, placeholder } = shown(f);
    return `
      <div class="field" data-field="${key}">
        <label class="field-label" for="f-${key}">${label || f.label}</label>
        <div class="field-box">
          <input id="f-${key}" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off"
            value="${esc(value)}" ${placeholder ? `placeholder="${placeholder}"` : ''}>
          <span class="field-unit">${f.area ? App.units.areaLabel() : App.units.lengthLabel()}</span>
        </div>
        <div class="field-error" role="alert" hidden></div>
      </div>`;
  }

  function selectField(id, label, options, current, extra = '') {
    return `
      <div class="field">
        <label class="field-label" for="${id}">${label}</label>
        <div class="field-row">
          <select id="${id}" class="field-select">
            ${current === null ? '<option value="" data-mixed="1" selected disabled hidden>여러 값</option>' : ''}
            ${options.map(([v, text]) => `<option value="${esc(v)}" ${v === current ? 'selected' : ''}>${esc(text)}</option>`).join('')}
          </select>
          ${extra}
        </div>
      </div>`;
  }

  function stat(label, value, note) {
    return `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${esc(value)}${note ? `<small>${esc(note)}</small>` : ''}</span></div>`;
  }

  /** 묶음: 고른 것이 한 묶음이면 '묶음 풀기', 두 개 이상 골랐으면 '묶기' */
  function groupRow() {
    const g = commonText((e) => e.group || null);
    if (g) {
      let n = 0;
      for (const el of App.doc.all()) if (el.group === g) n++;
      return `<div class="group-row"><span class="group-tag">묶음 · ${n}개</span>
        <button type="button" class="btn" data-act="ungroup" title="Ctrl+Shift+G">묶음 풀기</button></div>`;
    }
    if (els.length < 2) return '';
    return `<div class="group-row"><button type="button" class="btn" data-act="group" title="Ctrl+G">묶기 (함께 선택·이동)</button></div>`;
  }

  /* 미세 이동: 한 번 누를 때 움직일 거리(mm). 패널을 다시 그려도 유지 */
  const NUDGE_STEPS = [1, 10, 100];
  let nudgeStep = 10;
  const NUDGE_DIRS = [['up', 0, -1, '위로'], ['left', -1, 0, '왼쪽으로'], ['right', 1, 0, '오른쪽으로'], ['down', 0, 1, '아래로']];

  /** 화살표로 조금씩 옮기기. 벽에 붙은 기호는 벽을 따라 움직임. 누르고 있으면 계속 */
  function nudgeRow() {
    if (!els.some((e) => !['door', 'window', 'room'].includes(e.type))) return '';
    return `
      <div class="field-group-label">미세 이동</div>
      <div class="nudge">
        <div class="nudge-pad">
          ${NUDGE_DIRS.map(([id, , , label]) => `<button type="button" class="btn nudge-${id}" data-nudge="${id}" aria-label="${label} ${nudgeStep}mm"><span class="ico" data-icon="chevron"></span></button>`).join('')}
        </div>
        <div class="nudge-steps" role="group" aria-label="한 번에 움직일 거리">
          ${NUDGE_STEPS.map((v) => `<button type="button" class="btn" data-nudge-step="${v}" aria-pressed="${v === nudgeStep}">${v}mm</button>`).join('')}
        </div>
      </div>`;
  }

  /** 복제·돌리기·정렬·잠금 (휴대폰에서도 단축키 없이) */
  function editRow() {
    const locked = els.every((e) => e.locked);
    const align = els.length >= 2 ? `
      <div class="field-group-label">정렬</div>
      <div class="align-row">
        <button type="button" class="btn" data-align="left">왼쪽</button>
        <button type="button" class="btn" data-align="hcenter">가로 가운데</button>
        <button type="button" class="btn" data-align="right">오른쪽</button>
        <button type="button" class="btn" data-align="top">위</button>
        <button type="button" class="btn" data-align="vcenter">세로 가운데</button>
        <button type="button" class="btn" data-align="bottom">아래</button>
      </div>` : '';
    return `
      <div class="btn-row">
        <button type="button" class="btn" data-act="duplicate" title="Ctrl+D">복제</button>
        <button type="button" class="btn" data-act="rotate-any" title="Q">90° 돌리기</button>
      </div>
      ${nudgeRow()}
      ${align}
      <label class="check-row" for="f-lock">
        <input type="checkbox" id="f-lock" ${locked ? 'checked' : ''}>
        <span><b>잠금</b><small>고를 수는 있지만 움직이거나 지워지지 않습니다.</small></span>
      </label>`;
  }

  function commonFields(single) {
    const layer = commonText((e) => e.layer) || '';
    const memo = commonText((e) => e.memo);
    return `
      ${editRow()}
      ${groupRow()}
      ${selectField('f-layer', '레이어', App.model.LAYERS.map((l) => [l.id, l.label]), layer || null)}
      <div class="field">
        <label class="field-label" for="f-memo">메모</label>
        <textarea id="f-memo" class="field-text" rows="2" ${memo === null ? 'placeholder="여러 값"' : ''}>${esc(memo || '')}</textarea>
      </div>
      ${single ? `<div class="props-meta">만든 시각 ${esc(new Date(els[0].createdAt).toLocaleString('ko-KR'))}</div>` : ''}`;
  }

  function head(title, sub) {
    return `<div class="props-head"><span class="props-title">${esc(title)}</span><span class="props-sub">${esc(sub || '')}</span></div>`;
  }
  const deleteButton = (what) => `<button type="button" class="btn btn-danger" data-act="delete">${els.length === 1 ? `이 ${what} 삭제` : `${els.length}개 삭제`}</button>`;

  /** 이 벽을 둘러싼 방 이름들 */
  function roomsOfWall(id) {
    const names = [];
    for (const el of App.doc.all()) if (el.type === 'room' && el.wallIds.includes(id)) names.push(el.name || '이름 없음');
    return names.join(', ') || '없음';
  }

  /** 자재 물량 줄: 다루끼·스터드·런너는 길이와 본 수, 석고보드는 면적과 장 수 */
  function materialRows(walls) {
    const m = App.measure.materials(walls);
    if (!m.frames.length && !m.boards.length) return '';
    const lossNote = (loss) => (loss ? `, 로스 ${loss}%` : '');
    return `
      <div class="field-group-label">자재</div>
      <div class="stats">
        ${m.frames.map((f) => stat(f.name, `${App.measure.meters(f.length)} · ${f.pieces}본`, `${Number(f.piece / 1000)}m 기준${lossNote(f.loss)}`)).join('')}
        ${m.boards.map((b) => stat(b.spec, `${App.units.formatArea(b.area)} · ${b.sheets}장`, lossNote(b.loss).replace(/^, /, ''))).join('')}
      </div>`;
  }

  function wallForm() {
    const single = els.length === 1;
    const C = App.catalog;
    const types = C.wallTypes();
    const typeId = commonText((w) => w.typeId);
    const oneSided = els.some((w) => { const t = C.typeOf(w); return t && C.isOneSided(t); });
    const qs = els.map((w) => App.measure.wall(w));
    const area = qs.reduce((s, q) => s + q.area, 0);
    const openings = qs.reduce((s, q) => s + q.openings, 0);
    const total = qs.reduce((s, q) => s + q.length, 0);
    const thickness = common((w) => w.thickness);
    return `
      ${head('벽', single ? '' : `${els.length}개 선택 · 총 길이 ${App.units.formatLength(total)}`)}
      ${selectField('f-wallType', '벽 종류', types.map((t) => [t.id, `${t.name} · ${App.units.formatLength(C.thickness(t))}`]), typeId,
        '<button type="button" class="btn" data-act="edit-type">편집</button>')}
      ${typeId && C.typeOf(els[0]) ? `<p class="props-meta">${esc(C.describe(C.typeOf(els[0])))}</p>` : ''}
      ${selectField('f-wallPhase', '공사 <small>리모델링: 기존 벽은 회색, 철거 벽은 빨간 점선</small>', [['', '신설 (새로 세움)'], ['keep', '기존 (그대로 둠)'], ['demo', '철거']], common((w) => w.phase || ''))}
      ${oneSided ? '<button type="button" class="btn" data-act="flip">마감 면 뒤집기 (석고·틀이 붙는 쪽)</button>' : ''}
      <div class="field-grid">
        ${single ? numberField('length') : ''}
        ${numberField('height')}
      </div>
      <div class="stats">
        ${stat('두께', thickness === null ? '여러 값' : App.units.formatLength(thickness), '벽 종류에서 정해짐')}
        ${single && qs[0].overlap > 0.5 ? stat('실제 길이', App.units.formatLength(qs[0].length), `붙은 벽 안으로 들어간 ${App.units.formatLength(qs[0].overlap)} 뺌 · 물량 기준`) : ''}
        ${stat(single ? '벽 면적 (한 면)' : '벽 면적 합계 (한 면)', App.units.formatArea(area), openings ? `문·창문 ${openings}개 뺌` : '')}
        ${single ? stat('방', roomsOfWall(els[0].id)) : ''}
      </div>
      ${wallLook()}
      ${App.modes.is('event') ? '' : materialRows(els)}
      ${qs.some((q) => q.frameDetail && q.frameDetail.jambs) ? '<p class="props-meta">문·창문 양옆 세로재, 그 위·아래 토막, 인방·창대 가로재까지 넣은 물량입니다.</p>' : ''}
      ${single ? `
        <div class="field-group-label">시작점</div>
        <div class="field-grid">${numberField('sx')}${numberField('sy')}</div>
        <div class="field-group-label">끝점</div>
        <div class="field-grid">${numberField('ex')}${numberField('ey')}</div>` : ''}
      ${commonFields(single)}
      ${deleteButton('벽')}`;
  }

  /** 색 고르기: 목록 + 다른 색(색상판). cur: 지금 색('' 기본) 또는 null(여러 값) */
  function colorField(id, label, cur, base = '기본 색', colors = App.catalog.ITEM_COLORS) {
    const list = [['', base], ...colors];
    if (cur && !list.some(([v]) => v === cur)) list.push([cur, '고른 색']);
    return selectField(id, label, list, cur,
      `<input type="color" class="color-pick" id="${id}Pick" value="${esc(cur || '#ffffff')}" title="다른 색 고르기" aria-label="다른 색 고르기">`);
  }
  /** 벽의 색과 사진 (3D에서 보임) */
  function wallLook() {
    const img = els.length === 1 && els[0].imageId ? App.images.url(els[0].imageId) : null;
    const has = els.some((w) => w.imageId);
    return `
      <div class="field-group-label">벽 색·사진 (3D에서 보임)</div>
      ${colorField('f-wallColor', '벽 색', commonText((w) => w.color || ''), '기본 (밝은 회색)', [...App.catalog.WALL_COLORS, ...App.catalog.ITEM_COLORS.filter(([v]) => !App.catalog.WALL_COLORS.some(([w]) => w === v))])}
      ${img ? `<img class="face-thumb" src="${esc(img)}" alt="벽에 붙인 사진">` : ''}
      <div class="btn-row">
        <button type="button" class="btn" data-act="wall-image">${has ? '사진 바꾸기' : '사진 붙이기 (사진첩)'}</button>
        ${has ? '<button type="button" class="btn" data-act="wall-image-clear">사진 떼기</button>' : ''}
      </div>
      ${has ? `<div class="field-grid">
        ${selectField('f-wallImageSide', '붙이는 면', [['both', '양쪽 면'], ['left', '한쪽 면'], ['right', '반대쪽 면']], commonText((w) => w.imageSide || 'both'))}
        ${selectField('f-wallImageFit', '채우는 방법', [['fit', '사진 다 보이게'], ['cover', '벽에 꽉 채우기'], ['stretch', '벽 크기로 늘이기'], ['tile', '무늬처럼 반복']], commonText((w) => w.imageFit || 'fit'))}
      </div>` : ''}
      <p class="props-meta">사진은 벽 한 면에 붙습니다 (문·창문 자리는 비움). 현수막·벽화는 '사진 다 보이게', 벽지·타일 무늬는 '무늬처럼 반복'(사진 한 장이 1.2m 높이)이 잘 맞습니다. 3D에서 확인하세요.</p>`;
  }

  const ISSUE_TEXT = {
    open: '둘러싼 벽이 끊겨 방 경계를 다시 찾지 못했습니다. 면적은 마지막으로 닫혀 있던 모양 기준입니다. 벽을 다시 이어 붙이면 자동으로 맞춰지고, 필요 없는 방이면 지우세요.',
    overlap: '다른 방과 경계가 같아졌습니다. 칸막이 벽을 없앴다면 이 방을 지우세요.',
  };

  function roomForm() {
    const single = els.length === 1;
    const R = App.model.TYPES.room;
    const area = els.reduce((sum, r) => sum + R.floorArea(r), 0);
    const r = els[0];
    const issue = els.find((e) => e.issue);
    const qs = els.map((e) => App.measure.room(e));
    const total = (k) => qs.reduce((t, q) => t + q[k], 0);
    const boards = new Map();
    qs.forEach((q) => q.boards.forEach((b) => boards.set(b.spec, (boards.get(b.spec) || 0) + b.area)));
    return `
      ${head('방', single ? '' : `${els.length}개 선택`)}
      ${issue ? `<div class="notice notice-danger" id="p-issue">${esc(ISSUE_TEXT[issue.issue])}</div>` : ''}
      ${single ? `
        <div class="field">
          <label class="field-label" for="f-name">이름</label>
          <div class="field-box"><input id="f-name" type="text" maxlength="${NAME_MAX}" enterkeyhint="done" autocomplete="off" value="${esc(r.name)}"></div>
        </div>` : ''}
      <div class="stats">
        ${stat(single ? '바닥 면적' : '바닥 면적 합계', App.units.formatArea(area), '벽 중심 기준')}
        ${stat('바닥 면적 (안목)', App.units.formatArea(total('clearArea')), '벽 면 안쪽 · 바닥재 기준')}
        ${stat(single ? '천장 면적' : '천장 면적 합계', App.units.formatArea(total('ceiling')), els.some((e) => e.ceilingArea != null) ? '직접 입력' : '바닥과 같음')}
        ${stat('벽 면적 (방 쪽)', App.units.formatArea(total('wallArea')), `벽 중심 × 벽 높이${total('openingArea') ? ` · 문·창문 ${App.units.formatArea(total('openingArea'))} 뺌` : ''}`)}
        ${stat('도배·도장 면적 (안목)', App.units.formatArea(total('paintArea')), '안목 둘레 × 천장 높이 · 문·창문 뺌')}
        ${[...boards].map(([spec, a]) => stat(`${spec} (방 쪽)`, App.units.formatArea(a), '겹 수 반영')).join('')}
        ${single ? stat('둘레', App.units.formatLength(G.perimeter(r.points)), '벽 중심 기준') : ''}
        ${stat('걸레받이', App.units.formatLength(total('baseboard')), total('doorWidth') ? `안목 둘레 − 문 폭 ${App.units.formatLength(total('doorWidth'))}` : '안목 둘레')}
        ${stat('천장 몰딩', App.units.formatLength(total('clearPerimeter')), '안목 둘레')}
      </div>
      <div class="field-grid">
        ${numberField('ceilingHeight')}
        ${numberField('wallHeight')}
      </div>
      ${numberField('ceilingArea')}
      <div class="menu-label">철거 (리모델링)</div>
      ${[['demoFloor', '바닥재 철거', '안목 바닥 면적'], ['demoCeil', '천장 철거', '천장 면적'], ['demoWall', '벽지·도장 제거', '도배·도장 면적']].map(([k, label, note]) => `<label class="menu-check seat-check"><input type="checkbox" id="f-${k}" ${els.every((e) => e[k]) ? 'checked' : ''}><span>${label} <small>${note} → 집계 ‘철거·신설’·견적</small></span></label>`).join('')}
      ${roomLook()}
      ${finishRows(qs)}
      ${commonFields(single)}
      ${deleteButton('방')}
      <p class="props-meta">방을 지워도 벽은 남습니다.</p>`;
  }

  /** 방 꾸미기: 바닥 모양과 벽지 색 (평면 색·무늬와 3D에 보임). 바닥 모양은 마감 자재(마루 박스·타일 장)에도 들어감 */
  function roomLook() {
    const looks = [['', '자동 (바닥 마감 따라)'], ...App.catalog.FLOOR_LOOKS.map((l) => [l.id, l.name])];
    return `
      <div class="field-group-label">방 꾸미기 (평면·3D, 바닥 모양은 마감 자재에도)</div>
      ${selectField('f-floorLook', '바닥 모양', looks, commonText((r) => r.floorLook || ''))}
      ${colorField('f-roomWallColor', '벽지 색', commonText((r) => r.wallColor || ''), '기본 (흰색)', App.catalog.WALL_COLORS)}
      <div class="field-grid">
        ${selectField('f-wallWork', '벽 마감 (물량)', App.materials.WALL_WORKS, commonText((r) => r.wallWork || ''))}
        ${selectField('f-ceilWork', '천장 마감 (물량)', App.materials.CEIL_WORKS, commonText((r) => r.ceilWork || ''))}
      </div>
      ${matStats()}
      <div class="btn-row">
        ${els.length === 1 ? '<button type="button" class="btn" data-act="look-all">이 꾸미기를 모든 방에 똑같이</button>' : ''}
        <button type="button" class="btn" data-act="mat-basis" title="벽지 1롤 면적, 박스·장 면적, 로스 %">자재 기준</button>
      </div>`;
  }
  /** 고른 방들의 마감 자재 수량 (바닥 모양을 직접 고른 바닥, 벽·천장 마감) */
  function matStats() {
    const rooms = els.filter((r) => !r.issue).map((r) => ({ ...r, q: App.measure.room(r) }));
    const ls = App.materials.lines(rooms);
    if (!ls.length) return '<p class="props-meta">바닥 모양을 고르거나 벽·천장 마감을 고르면 벽지 롤 수, 페인트 양, 마루 박스·타일 장 수가 계산됩니다.</p>';
    return `<div class="stats">${ls.map((l) => stat(`${l.name}${l.spec ? ` (${l.spec})` : ''}`, `${l.qty.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}${l.unit}`, l.note)).join('')}</div>`;
  }

  /** 방 마감재: 벽 마감·바닥 마감 고르기와 그 물량 */
  function finishRows(qs) {
    const opt = (list) => [['', '없음'], ...list.map((p) => [p.id, `${p.name} · ${App.catalog.describePreset(p)}`])];
    const edit = '<button type="button" class="btn" data-act="edit-finish">편집</button>';
    const byId = new Map();
    qs.forEach((q) => q.finishes.forEach((f) => {
      const cur = byId.get(f.id) || { ...f, area: 0 };
      cur.area += f.area;
      byId.set(f.id, cur);
    }));
    return `
      <div class="field-group-label">마감재</div>
      ${selectField('f-wallFinish', '벽 마감', opt(App.catalog.finishes('wall')), commonText((r) => r.wallFinishId || ''), edit)}
      ${selectField('f-floorFinish', '바닥 마감', opt(App.catalog.finishes('floor')), commonText((r) => r.floorFinishId || ''))}
      ${byId.size ? `<div class="stats">${[...byId.values()].map((f) => {
        const sheets = App.measure.finishSheets(f.preset, f.area);
        return stat(f.name, `${App.units.formatArea(f.area)}${sheets != null ? ` · ${sheets.toLocaleString('ko-KR')}장` : ''}`,
          f.target === 'wall' ? `바닥에서 ${App.units.formatLength(f.from)} 위로 천장까지 · 문·창문 뺌` : '안목 바닥 면적');
      }).join('')}</div>` : ''}
      ${els.length === 1 ? '<button type="button" class="btn" data-act="finish-all">이 마감을 모든 방에 똑같이</button>' : ''}`;
  }

  function presetSelect(kind) {
    const presets = App.catalog.presets(kind);
    if (!presets.length) return '';
    return `
      <div class="field">
        <label class="field-label" for="f-preset">프리셋 적용</label>
        <select id="f-preset" class="field-select">
          <option value="" selected>프리셋 고르기…</option>
          ${presets.map((p) => `<option value="${p.id}">${esc(p.name)} · ${esc(App.catalog.describePreset(p))}</option>`).join('')}
        </select>
      </div>`;
  }

  function openingForm(type) {
    const single = els.length === 1;
    const T = App.model.TYPES[type];
    const kind = commonText((e) => e.kind);
    const swings = els.every((e) => e.type === 'door' && (e.kind === '여닫이' || e.kind === '방화문'));
    const flips = els.every((e) => e.type === 'door' && e.kind !== '자동문');
    const area = els.reduce((s, e) => s + T.area(e), 0);
    const g = single && geomOf(els[0]);
    const wallType = g && App.catalog.typeOf(g.wall);
    return `
      ${head(T.label, single ? (kind || '') : `${els.length}개 선택`)}
      ${presetSelect(type)}
      ${selectField('f-kind', '종류', T.KINDS.map((k) => [k, k]), kind)}
      ${selectField('f-opPhase', '공사 <small>정하지 않으면 달린 벽을 따름</small>', [['', `벽 따라 (지금 ${({ new: '신설', keep: '기존', demo: '철거' })[App.model.phaseOf({ type, wallId: els[0].wallId })]})`], ['new', '신설 (새로 닮)'], ['keep', '기존 (그대로 둠)'], ['demo', '철거']], common((e) => e.phase || ''))}
      <div class="field-grid">
        ${numberField('width')}
        ${numberField('height')}
        ${type === 'window' ? numberField('sill') : ''}
        ${single ? numberField('offset') : ''}
      </div>
      ${swings || flips ? `<div class="btn-row">
        ${flips ? '<button type="button" class="btn" data-act="swing">열리는 쪽 뒤집기</button>' : ''}
        ${swings ? '<button type="button" class="btn" data-act="hinge">경첩 위치 바꾸기</button>' : ''}
      </div>` : ''}
      <div class="stats">
        ${stat(single ? '면적' : '면적 합계', App.units.formatArea(area), '벽 면적에서 뺌')}
        ${type === 'window' && single ? stat('창 위 높이', App.units.formatLength(els[0].sill + els[0].height)) : ''}
        ${g ? stat('붙은 벽', wallType ? wallType.name : '벽', App.units.formatLength(g.L)) : ''}
        ${single && App.openings && !App.modes.is('event') && App.openings.groupOf(els[0]) ? stat('창호 기호', App.openings.markOf(els[0]), `같은 규격 ${App.openings.groupOf(els[0]).ids.length}개 · 집계 ‘전체’의 창호 일람표`) : ''}
      </div>
      ${commonFields(single)}
      ${deleteButton(T.label)}`;
  }

  function columnForm() {
    const single = els.length === 1;
    const shape = commonText((c) => c.shape);
    const circle = shape === 'circle';
    return `
      ${head('기둥', single ? App.catalog.SHAPE_NAMES[els[0].shape] : `${els.length}개 선택`)}
      ${presetSelect('column')}
      ${selectField('f-shape', '모양', Object.entries(App.catalog.SHAPE_NAMES), shape)}
      <div class="field-grid">
        ${numberField('width', circle ? '지름' : '폭')}
        ${circle ? '' : numberField('depth')}
      </div>
      ${single ? `<div class="field-group-label">가운데 위치</div><div class="field-grid">${numberField('x')}${numberField('y')}</div>` : ''}
      ${gapRows()}
      ${pairRows()}
      ${commonFields(single)}
      ${deleteButton('기둥')}`;
  }

  const roomName = (id) => {
    const r = id && App.doc.get(id);
    return r ? r.name || '이름 없음' : '없음';
  };

  /** 정수 칸 (회로 수 등). 길이가 아니라 단위 변환 없음 */
  function intField(key, o, get = (e) => e[key] ?? null) {
    const v = commonText(get);
    return `
      <div class="field" data-int="${key}">
        <label class="field-label" for="f-num-${key}">${esc(o.label)}</label>
        <div class="field-box">
          <input id="f-num-${key}" type="text" inputmode="numeric" enterkeyhint="done" autocomplete="off"
            value="${v == null ? '' : esc(v)}" ${v == null ? 'placeholder="여러 값"' : ''}>
          <span class="field-unit">${esc(o.unit || '')}</span>
        </div>
        <div class="field-error" role="alert" hidden></div>
      </div>`;
  }

  function validateInt(text, o) {
    const s = String(text).replace(/[,\s]/g, '');
    if (!/^\d+$/.test(s)) return { error: '정수를 입력하세요.' };
    const v = Number(s);
    if (v < o.min || v > o.max) return { error: `${o.min}~${o.max} 사이로 입력하세요.` };
    return { value: v };
  }

  /** 지금 고른 기호들이 모두 같은 종류면 그 종류 정의 */
  const commonDef = () => {
    const kind = commonText((e) => e.kind);
    return kind ? App.catalog.itemDef(kind) : null;
  };

  /** 실제 크기로 그리는 것(가구·시스템 에어컨·점검구 등): 규격 고르기와 폭·깊이 */
  function sizeRows(def) {
    const sizeKey = commonText((e) => `${e.size}x${e.depth}`);
    const sizes = def && def.sizes ? def.sizes.map(([name, w, d]) => [`${w}x${d}`, `${name} · ${w}×${d}`]) : [];
    const custom = sizeKey !== null && !sizes.some(([v]) => v === sizeKey);
    return `
      ${sizes.length ? selectField('f-furnSize', '규격', custom ? [[sizeKey, '직접 넣은 크기'], ...sizes] : sizes, sizeKey) : ''}
      <div class="field-grid">
        ${numberField('size', '폭')}
        ${numberField('depth')}
      </div>`;
  }

  /** 하나만 골랐을 때: 네 방향 벽까지 거리 (가장자리 기준, 숫자를 넣으면 옮김)와 벽까지 치수 넣기 */
  function gapRows() {
    if (els.length !== 1) return '';
    const c = App.dims.clearance(els[0]);
    const keys = c ? GAPS.filter(([, dir]) => c[dir]) : [];
    if (!keys.length) return '';
    return `
      <div class="field-group-label">벽까지 거리 (가장자리에서 벽 면까지)</div>
      <div class="field-grid">${keys.map(([key]) => numberField(key)).join('')}</div>
      <p class="props-meta">가운데에서: ${keys.map(([, dir, label]) => `${label.split(' ')[0]} ${esc(App.units.formatLength(c[dir].center))}`).join(' · ')}. 숫자를 넣으면 벽에서 그만큼 떨어지게 옮깁니다.</p>
      <div class="btn-row">
        <button type="button" class="btn" data-act="gap-dims-edge">벽까지 치수 넣기</button>
        <button type="button" class="btn" data-act="gap-dims-center">가운데에서 치수 넣기</button>
      </div>`;
  }

  /** 기호·가구·기둥 두 개를 골랐을 때: 둘 사이 거리 */
  function pairRows() {
    if (els.length !== 2) return '';
    const [a, b] = els;
    const Ta = App.model.TYPES[a.type], Tb = App.model.TYPES[b.type];
    if (!Ta.extent || !Tb.extent) return '';
    const X = { x: 1, y: 0 }, Y = { x: 0, y: 1 };
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
    const gx = dx - Ta.extent(a, X) - Tb.extent(b, X), gy = dy - Ta.extent(a, Y) - Tb.extent(b, Y);
    const L = (v) => App.units.formatLength(v);
    return `
      <div class="field-group-label">고른 두 개 사이</div>
      <div class="stats">
        ${stat('가운데 사이', `가로 ${L(dx)} · 세로 ${L(dy)}`, `곧은 거리 ${L(Math.hypot(dx, dy))}`)}
        ${stat('가장자리 사이', `가로 ${gx > 0.5 ? L(gx) : '-'} · 세로 ${gy > 0.5 ? L(gy) : '-'}`, '나란히 있는 방향만')}
      </div>`;
  }

  const ANGLE = { label: '회전 각도', unit: '°', min: 0, max: 359 };
  /** 정수 칸의 범위: 회전 각도, 의자 배열의 총 의자 수, 그 밖에는 종류에 정해 둔 숫자 값 */
  function intSpec(key) {
    const def = commonDef();
    if (key === 'rotation') return ANGLE;
    if (key === 'count' && def && def.kind === '의자 배열') return { label: '총 의자 수', min: 1, max: 40000 };
    return (def && def.numbers && def.numbers[key]) || null;
  }

  /** 가구·조감도 물건: 종류, 모양·색, 규격·크기(의자 배열·사람 등은 수량), 높이, 글자·이미지, 회전, 위치 */
  /** 내 사물(등록한 제품 사진·3D 모형·설계한 것): 종류·가격·링크와 고치기 */
  function customInfo(kind) {
    const m = App.library.meta(kind);
    if (!m) return '';
    const missing = App.library.state(m.id) === 'missing';
    return `
      <div class="stats">
        ${stat('종류', esc(App.library.TYPES[m.type]), m.brand ? esc(m.brand) : '')}
        ${stat('가격', m.price ? `${m.price.toLocaleString('ko-KR')}원` : '없음', m.price ? '견적 단가로 들어감' : '사물 정보에서 넣을 수 있음')}
      </div>
      ${missing ? '<p class="dialog-note is-warn">이 사물의 그림·모형이 이 기기에 없어 자리 상자로 보입니다. 만든 기기에서 도면 백업이나 사물 묶음 파일을 받아 열면 그대로 보입니다.</p>' : ''}
      <div class="btn-row">
        ${App.library.byId(m.id) && App.library.list().some((x) => x.id === m.id) ? '<button type="button" class="btn" data-act="obj-edit">사물 정보 고치기</button>' : ''}
        ${m.url ? '<button type="button" class="btn" data-act="obj-link">구매 링크 열기</button>' : ''}
      </div>`;
  }

  function furnForm(cat = 'furn') {
    const single = els.length === 1;
    const event = cat === 'event';
    const title = event ? '조감도 물건' : '가구';
    const kind = commonText((e) => e.kind);
    const def = kind ? App.catalog.itemDef(kind) : null;
    const counts = {};
    els.forEach((e) => { const k = App.catalog.itemLabel(e); counts[k] = (counts[k] || 0) + 1; });
    const seats = els.reduce((n, e) => n + ((App.catalog.seats(e) || {}).count || 0), 0);
    const kinds = event
      ? App.catalog.ITEM_KINDS.event.filter((d) => !def || d.cat === def.cat)
      : App.catalog.ITEM_KINDS.furn;
    const auto = def && def.resize ? def.resize(els[0]) : {}; // 숫자 값으로 정해지는 크기 (그 칸은 감춤)
    const numbers = def && def.numbers ? Object.entries(def.numbers) : [];
    const img = single && els[0].imageId ? App.images.url(els[0].imageId) : null;
    const mounted = els.filter((e) => e.wallId && App.doc.has(e.wallId));
    return `
      ${head(def && def.custom ? '내 사물' : title, single ? App.catalog.itemLabel(els[0]) : `${els.length}개 선택`)}
      ${def && def.custom ? customInfo(kind) : selectField('f-itemKind', '종류', kinds.map((d) => [d.kind, d.kind]), kind)}
      ${def && def.options ? Object.entries(def.options).map(([key, o]) =>
        selectField(`f-opt-${key}`, esc(o.label), o.values.map((v) => [v, v]), commonText((e) => e[key] ?? null))).join('') : ''}
      ${def && def.styles ? selectField('f-opt-style', def.kind === '나무' || def.kind === '담장' || def.kind === '화분' || def.kind === '사람' ? '모양' : '의자 모양', def.styles.map((v) => [v, v]), commonText((e) => e.style ?? null)) : ''}
      ${def && def.colors ? colorField('f-itemColor', esc(def.colors), commonText((e) => e.color || '')) : ''}
      ${kind === '의자 배열' ? `<div class="field-grid">${intField('count', { label: '총 의자 수', unit: '개' }, (e) => App.catalog.seats(e).count)}</div>` : ''}
      ${numbers.length ? `<div class="field-grid">${numbers.map(([key, o]) => intField(key, o)).join('')}</div>` : ''}
      ${event && App.safety && els.every((e) => App.safety.powerDefault(e) != null) ? powerField() : ''}
      ${kind === '의자 배열' ? '<p class="props-meta">총 의자 수를 넣으면 줄 수가 맞춰지고, 모자라는 자리는 맨 뒷줄에서 빠집니다. 의자는 기호의 아래쪽(앞)을 보고 앉습니다. 놓을 때 가까운 무대 쪽을 보게 돌려 놓습니다.</p>' : ''}
      ${kind === '의자 배열' ? seatNoFields() : ''}
      ${event && App.booths && els.some((e) => App.booths.isBooth(e)) ? boothFields() : ''}
      ${'size' in auto ? '' : sizeRows(def)}
      ${def && !def.flat && !('h3' in auto) && (event || def.custom) ? `<div class="field-grid">${numberField('h3')}</div>` : ''}
      ${!event && def && def.face ? `<div class="field-grid">${numberField('h3', '그림 높이')}${numberField('height', '걸리는 높이 (가운데)')}</div>` : ''}
      ${def && def.face ? `
        <div class="field-group-label">${esc(def.face)}·이미지 (3D에서 앞면에 보임)</div>
        <div class="field">
          <label class="field-label" for="f-faceText">글자 (줄을 바꿔 여러 줄)</label>
          <textarea id="f-faceText" class="field-text" rows="2" ${commonText((e) => e.text || '') === null ? 'placeholder="여러 값"' : 'placeholder="예: 2026 가을 축제"'}>${esc(commonText((e) => e.text || '') || '')}</textarea>
        </div>
        ${img ? `<img class="face-thumb" src="${esc(img)}" alt="넣은 이미지">` : ''}
        <div class="btn-row">
          <button type="button" class="btn" data-act="face-image">${img ? '이미지 바꾸기' : '이미지 넣기 (사진첩)'}</button>
          ${els.some((e) => e.imageId) ? '<button type="button" class="btn" data-act="face-image-clear">이미지 빼기</button>' : ''}
        </div>
        <p class="props-meta">이미지를 넣으면 글자 대신 이미지가 보입니다. 글자만 넣으면 자동으로 현수막 모양으로 꾸며 줍니다.</p>` : ''}
      ${seats ? `<div class="stats">${stat('좌석', `${seats.toLocaleString('ko-KR')}석`, single && 'size' in auto ? `${App.units.formatLength(els[0].size)} × ${App.units.formatLength(els[0].depth)} 자리` : '')}</div>` : ''}
      <div class="field-grid">${intField('rotation', ANGLE)}
        <div class="field"><span class="field-label">&nbsp;</span><button type="button" class="btn" data-act="rotate">90° 돌리기</button></div>
      </div>
      ${single && !mounted.length ? `<div class="field-group-label">가운데 위치</div><div class="field-grid">${numberField('x')}${numberField('y')}</div>` : ''}
      ${gapRows()}
      ${pairRows()}
      <div class="stats">
        ${single ? stat('방', roomName(els[0].room)) : Object.entries(counts).map(([k, n]) => stat(k, `${n}개`)).join('')}
        ${mounted.length ? stat('벽에 붙음', `${mounted.length}개`, '벽을 옮기면 따라갑니다') : ''}
      </div>
      ${mounted.length ? '<button type="button" class="btn" data-act="detach">벽에서 떼기</button>' : ''}
      <p class="props-meta">벽 가까이로 끌면 벽면에 딱 붙습니다. 아래 미세 이동 화살표로 1mm까지 맞출 수 있습니다.${event ? ' 오른쪽 아래 3D 버튼으로 조감도를 보고 걸어서 둘러볼 수 있습니다.' : ''}</p>
      ${commonFields(single)}
      ${deleteButton(event ? '물건' : '가구')}`;
  }

  /** 전기 (kW): 안전 점검의 전기 용량에 쓰는 값. 비우면 종류별 기본값 */
  function powerField() {
    const custom = commonText((e) => (e.kw != null && e.kw !== '' ? String(e.kw) : ''));
    const defs = [...new Set(els.map((e) => App.safety.powerDefault(e)))];
    const hint = defs.length === 1 ? `${defs[0]}` : '종류별 기본값';
    return `
      <div class="field">
        <label class="field-label" for="f-kw">전기 <small>비우면 기본값 ${esc(hint)}${defs.length === 1 ? 'kW' : ''} · 안전 점검의 전기 용량에 씀</small></label>
        <div class="field-box"><input id="f-kw" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="${esc(custom || '')}" placeholder="${custom === null ? '여러 값' : esc(hint)}"><span class="field-unit">kW</span></div>
      </div>`;
  }

  /** 부스 배정: 번호·업체 (여럿이면 번호는 ‘번호 매기기’로), 배정표 CSV */
  function boothFields() {
    // 섞어 고른 경우(소화기·가로등 등과 함께)에도 부스만 다룸
    const booths = els.filter((e) => App.booths.isBooth(e));
    const single = booths.length === 1;
    const commonEx = booths.every((e) => (e.exhibitor || '') === (booths[0].exhibitor || '')) ? booths[0].exhibitor || '' : null;
    return `
      <div class="field-group-label">부스 배정${booths.length < els.length ? ` <small>고른 것 중 부스 ${booths.length}개</small>` : ''}</div>
      <div class="field-grid">
        <div class="field"><label class="field-label" for="f-boothNo">부스 번호</label><div class="field-box"><input id="f-boothNo" type="text" maxlength="12" autocomplete="off" ${single ? `value="${esc(booths[0].boothNo || '')}" placeholder="예: A-1"` : 'disabled placeholder="여러 개: 번호 매기기"'}></div></div>
        <div class="field"><label class="field-label" for="f-exhibitor">업체·이름</label><div class="field-box"><input id="f-exhibitor" type="text" maxlength="30" autocomplete="off" value="${esc(commonEx || '')}" placeholder="${commonEx === null ? '여러 값' : '예: 한빛상회'}"></div></div>
      </div>
      <div class="btn-row"><button type="button" class="btn" data-act="booth-number">번호 매기기…</button><button type="button" class="btn" data-act="booth-csv">배정표 CSV</button></div>`;
  }

  /** 좌석 번호: 보이기, 번호 방향, 첫 열 글자, 첫 번호, 좌석표 CSV */
  function seatNoFields() {
    const on = els.every((e) => e.seatNo);
    return `
      <div class="field-group-label">좌석 번호</div>
      <label class="menu-check seat-check"><input type="checkbox" id="f-seatNo" ${on ? 'checked' : ''}><span>평면에 좌석 번호 보이기 <small>A열이 무대 쪽 앞줄</small></span></label>
      <div class="field-grid">
        ${selectField('f-seatFrom', '번호 시작 (관객 기준)', [['left', '왼쪽부터'], ['right', '오른쪽부터']], commonText((e) => e.seatFrom || 'left'))}
        <div class="field"><label class="field-label" for="f-seatRow0">첫 열 글자</label><div class="field-box"><input id="f-seatRow0" type="text" maxlength="2" autocomplete="off" value="${esc(commonText((e) => e.seatRow0 || 'A') || '')}"></div></div>
        <div class="field"><label class="field-label" for="f-seatNum0">첫 번호</label><div class="field-box"><input id="f-seatNum0" type="text" inputmode="numeric" autocomplete="off" value="${esc(commonText((e) => String(e.seatNum0 || 1)) || '')}"></div></div>
      </div>
      <button type="button" class="btn" data-act="seat-csv">좌석표 CSV (모든 의자 배열)</button>`;
  }

  function itemForm() {
    const single = els.length === 1;
    const cat = commonText((e) => e.category);
    if (cat === 'furn' || cat === 'event') return furnForm(cat);
    const kinds = cat ? App.catalog.ITEM_KINDS[cat].filter((d) => d.kind).map((d) => [d.kind, d.kind]) : [];
    const rotation = commonText((e) => String(e.rotation));
    const def = commonDef();
    const counts = {};
    els.forEach((e) => { const k = App.catalog.itemLabel(e); counts[k] = (counts[k] || 0) + 1; });
    const mounted = els.filter((e) => e.wallId && App.doc.has(e.wallId));
    const ceilingOnes = els.filter((e) => e.height == null);
    const ceiling = single && ceilingOnes.length ? App.measure.itemHeight(els[0]) : null;
    const wallType = single && mounted.length && App.catalog.typeOf(App.doc.get(mounted[0].wallId));
    return `
      ${head(cat === 'elec' ? '전기' : cat === 'mech' ? '설비' : '아이템', single ? App.catalog.itemLabel(els[0]) : `${els.length}개 선택`)}
      ${kinds.length ? selectField('f-itemKind', '종류', kinds, commonText((e) => e.kind)) : ''}
      ${def && def.options ? Object.entries(def.options).map(([key, o]) =>
        selectField(`f-opt-${key}`, esc(o.label), o.values.map((v) => [v, v]), commonText((e) => e[key] ?? null))).join('') : ''}
      ${def && def.depth ? sizeRows(def) : ''}
      <div class="field-grid">
        ${numberField('height')}
        ${def && def.numbers ? Object.entries(def.numbers).map(([key, o]) => intField(key, o)).join('') : ''}
        ${def && def.depth ? '' : numberField('size')}
      </div>
      ${ceilingOnes.length ? `<p class="props-meta">설치 높이를 비우면 그 방의 천장 높이${single ? `(${esc(App.units.formatLength(ceiling))})` : ''}에 다는 것으로 봅니다. 높이는 배관·전선관 수직 길이 계산에 쓰입니다.</p>`
        : '<p class="props-meta">설치 높이는 바닥에서 기구 가운데까지입니다. 배관·전선관 수직 길이 계산에 쓰입니다.</p>'}
      ${selectField('f-rotation', '회전', [['0', '0°'], ['90', '90°'], ['180', '180°'], ['270', '270°']], rotation,
        '<button type="button" class="btn" data-act="rotate">90° 돌리기</button>')}
      ${single && !mounted.length ? `<div class="field-group-label">가운데 위치</div><div class="field-grid">${numberField('x')}${numberField('y')}</div>` : ''}
      ${gapRows()}
      ${pairRows()}
      <div class="stats">
        ${single ? stat('방', roomName(els[0].room)) : Object.entries(counts).map(([k, n]) => stat(k, `${n}개`)).join('')}
        ${mounted.length ? stat('벽에 붙음', single ? (wallType ? wallType.name : '벽') : `${mounted.length}개`, '벽을 옮기면 따라갑니다') : ''}
      </div>
      ${mounted.length ? '<button type="button" class="btn" data-act="detach">벽에서 떼기</button>' : ''}
      ${commonFields(single)}
      ${deleteButton('기호')}`;
  }

  function lineForm() {
    const single = els.length === 1;
    const presets = App.catalog.presets('line');
    const presetId = commonText((l) => l.presetId);
    const M = App.measure, U = App.units;
    const groups = new Map();
    els.forEach((l) => {
      const p = App.doc.get(l.presetId);
      const key = p ? p.name : l.category;
      const q = M.line(l);
      const g = groups.get(key) || { plan: 0, auto: 0, extra: 0 };
      g.plan += q.plan;
      g.auto += q.auto;
      g.extra += q.extra;
      groups.set(key, g);
    });
    const run = U.formatRun;
    const breakdown = (g) => [`평면 ${run(g.plan)}`, g.auto ? `기구 수직 ${run(g.auto)}` : '', g.extra ? `추가 ${run(g.extra)}` : '']
      .filter(Boolean).join(' + ');
    const rows = [...groups.entries()].map(([name, g]) => stat(name, run(g.plan + g.auto + g.extra), breakdown(g))).join('');
    // 선 하나: 끝마다 어느 기구까지 얼마나 오르내리는지
    const ends = single ? M.line(els[0]).ends.map((e) => stat(`${e.item.kind} 수직`, run(e.drop),
      `${e.run === 0 ? '바닥' : `배관 ${U.formatLength(e.run)}`} ↔ 기구 ${U.formatLength(e.height)}`)).join('') : '';
    return `
      ${head('선', single ? (App.doc.get(els[0].presetId) || {}).name || els[0].category : `${els.length}개 선택`)}
      ${selectField('f-linePreset', '선 종류', presets.map((p) => [p.id, `${p.name} · ${App.catalog.describePreset(p)}`]), presetId,
        '<button type="button" class="btn" data-act="edit-line">편집</button>')}
      <div class="field-grid">
        ${single ? numberField('length') : ''}
        ${numberField('runHeight')}
        ${numberField('rise')}
      </div>
      <p class="props-meta">선 끝을 콘센트·스위치 같은 기구 가운데에 붙이면 배관 높이와 기구 설치 높이 차이만큼 수직 길이를 자동으로 더합니다. 그 밖의 오르내림은 추가 수직 길이에 넣으세요.</p>
      <div class="stats">${rows}${ends}</div>
      ${single ? `
        <div class="field-group-label">시작점</div>
        <div class="field-grid">${numberField('sx')}${numberField('sy')}</div>
        <div class="field-group-label">끝점</div>
        <div class="field-grid">${numberField('ex')}${numberField('ey')}</div>` : ''}
      ${commonFields(single)}
      ${deleteButton('선')}`;
  }

  function zoneForm() {
    const single = els.length === 1;
    const Z = App.model.TYPES.zone;
    const area = els.reduce((s, z) => s + Z.area(z), 0);
    return `
      ${head('영역', single ? '' : `${els.length}개 선택`)}
      ${single ? `
        <div class="field">
          <label class="field-label" for="f-zoneName">이름</label>
          <div class="field-box"><input id="f-zoneName" type="text" maxlength="${NAME_MAX}" enterkeyhint="done" autocomplete="off" value="${esc(els[0].name)}"></div>
        </div>` : ''}
      ${selectField('f-zoneSurface', '바닥 (3D 조감도에서 보이는 재질)', App.catalog.SURFACES.map(([id, name]) => [id, name]), commonText((z) => z.surface || ''))}
      ${els.every((z) => !z.surface || z.surface === 'carpet') ? selectField('f-zoneColor', '색', [...(els.every((z) => !z.surface) ? [['clear', '투명 (선만)']] : []), ...App.catalog.COLORS.map(([hex, name]) => [hex, name])], commonText((z) => (z.clear && !z.surface ? 'clear' : z.color))) : ''}
      <div class="stats">
        ${stat(single ? '면적' : '면적 합계', App.units.formatArea(area))}
        ${single ? stat('둘레', App.units.formatLength(G.perimeter(els[0].points))) : ''}
        ${App.modes.is('event') ? stat('서서 볼 수 있는 인원 (어림)', `여유 있게 ${Math.floor(area / 1e6).toLocaleString('ko-KR')}명 · 빽빽하게 ${Math.floor(area / 5e5).toLocaleString('ko-KR')}명`, '1㎡에 1~2명으로 어림한 값') : ''}
      </div>
      ${App.modes.is('event') ? `<label class="menu-check seat-check"><input type="checkbox" id="f-zoneCrowd" ${els.every((z) => z.crowd) ? 'checked' : ''}><span>관람·대기 구역 <small>집계의 수용 인원에 넣음</small></span></label>` : ''}
      ${App.modes.is('event') && els.length === 1 ? '<div class="btn-row"><button type="button" class="btn" data-act="zone-fence" title="둘레를 따라 펜스·차단봉·러버콘·생울타리를 놓음 (입구는 비움)">둘레에 펜스 두르기…</button><button type="button" class="btn" data-act="zone-parking" title="영역을 표준 주차 칸 줄로 채움 (줄 — 통로 — 줄)">주차 칸 채우기…</button><button type="button" class="btn" data-act="zone-seating" title="영역을 의자 줄로 채움 (무대 쪽을 보고, 통로·좌석 번호)">좌석 채우기…</button><button type="button" class="btn" data-act="zone-wizard" title="네모난 영역에 무대·객석·부스·화장실·펜스·동선을 한 번에 놓음 (행사 종류·인원을 물어봄)">이 영역에 자동 배치…</button></div>' : ''}
      <p class="props-meta">동그란 꼭짓점을 끌면 모양을 고칠 수 있습니다.</p>
      ${commonFields(single)}
      ${deleteButton('영역')}`;
  }

  /** 동선: 이름, 종류, 통로 폭, 길이·걸리는 시간, 걸리는 곳 */
  function routeForm() {
    const single = els.length === 1;
    const R = App.routes, U = App.units;
    const results = els.map((r) => R.check(r));
    const total = results.reduce((s, x) => s + x.length, 0);
    const issues = results.reduce((n, x) => n + x.issues.length, 0);
    const kind = commonText((r) => r.kind);
    const color = commonText((r) => r.color);
    const colors = [...R.KINDS.map((k) => [k.color, `${k.kind} 색`]), ...App.catalog.COLORS.filter(([hex]) => !R.KINDS.some((k) => k.color === hex))];
    return `
      ${head('동선', single ? '' : `${els.length}개 선택`)}
      ${single ? `
        <div class="field">
          <label class="field-label" for="f-routeName">이름</label>
          <div class="field-box"><input id="f-routeName" type="text" maxlength="${NAME_MAX}" enterkeyhint="done" autocomplete="off" value="${esc(els[0].name)}"></div>
        </div>` : ''}
      ${selectField('f-routeKind', '종류', R.KINDS.map((k) => [k.kind, k.kind]), kind)}
      ${selectField('f-routeColor', '색', colors, color)}
      <div class="field-grid">${numberField('width')}</div>
      <div class="stats">
        ${stat(single ? '길이' : '길이 합계', U.formatRun(total))}
        ${single ? stat('걸리는 시간', R.timeText(results[0].time), `${els[0].kind} 빠르기 초속 ${R.def(els[0].kind).speed} m`) : ''}
        ${stat('걸리는 곳', issues ? `${issues}곳` : '없음', issues ? '도면에 빨갛게 표시' : '통로 폭만큼 비어 있음')}
      </div>
      ${single && issues ? results[0].issues.map((x, i) => `<button type="button" class="btn btn-list route-issue${x.blocked ? ' is-blocked' : ''}" data-act="route-issue" data-i="${i}"><span>${esc(R.issueText(els[0], x))}</span></button>`).join('') : ''}
      <div class="btn-row">
        ${single ? '<button type="button" class="btn btn-primary" data-act="route-walk">3D로 이 길 걸어 보기</button>' : ''}
        <button type="button" class="btn" data-act="route-reverse">방향 뒤집기</button>
        <button type="button" class="btn" data-act="route-check">동선 체크 (전체)</button>
      </div>
      <p class="props-meta">동그란 꼭짓점을 끌면 길 모양을 고칠 수 있습니다. 동선 가운데에서 통로 폭의 절반 안에 물건·기둥·벽이 있으면 걸리는 곳으로 표시합니다. 문 자리, 텐트·현수막 아래는 지나갈 수 있습니다.</p>
      ${commonFields(single)}
      ${deleteButton('동선')}`;
  }

  function textForm() {
    const single = els.length === 1;
    return `
      ${head('텍스트', single ? '' : `${els.length}개 선택`)}
      ${single ? `
        <div class="field">
          <label class="field-label" for="f-content">내용</label>
          <textarea id="f-content" class="field-text" rows="3">${esc(els[0].content)}</textarea>
        </div>` : ''}
      <div class="field-grid">${numberField('size')}</div>
      <p class="props-meta">도면에서 고른 글자를 한 번 더 누르면 그 자리에서 고칠 수 있습니다.</p>
      ${editRow()}
      ${groupRow()}
      ${selectField('f-layer', '레이어', App.model.LAYERS.map((l) => [l.id, l.label]), commonText((e) => e.layer))}
      ${deleteButton('텍스트')}`;
  }

  /** 현장 사진 핀: 제목·메모, 사진 썸네일(누르면 크게), 사진 더하기 */
  function photoForm() {
    const single = els.length === 1, ph = els[0];
    const P = App.photos;
    const thumbs = single ? (ph.photos || []).map((p, i) => {
      const url = App.images.url(p.id);
      return `<button type="button" class="ph-thumb" data-ph-open="${i}" aria-label="사진 ${i + 1} 크게 보기">${url ? `<img src="${esc(url)}" alt="">` : `<span>${App.images.missing(p.id) ? '없음' : '…'}</span>`}<small>${esc(p.at ? P.dateText(p.at) : '')}</small></button>`;
    }).join('') : '';
    const total = els.reduce((n, e) => n + (e.photos || []).length, 0);
    return `
      ${head('현장 사진', single ? `${P.numberOf(ph.id)}번 핀 · 사진 ${(ph.photos || []).length}장` : `${els.length}개 · 사진 ${total}장`)}
      ${single ? `
        <div class="field">
          <label class="field-label" for="f-photoTitle">제목</label>
          <div class="field-box"><input id="f-photoTitle" type="text" value="${esc(ph.title || '')}" placeholder="예: 거실 창 쪽 누수 자리" maxlength="40" autocomplete="off"></div>
        </div>
        <div class="ph-grid">${thumbs}</div>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" data-act="photo-add" ${ph.locked ? 'disabled' : ''}>+ 사진 더하기</button>
          ${(ph.photos || []).length ? '<button type="button" class="btn" data-act="photo-view">크게 보기</button>' : ''}
        </div>
        <p class="props-meta">사진은 이 기기에 줄여서 저장되고 백업 파일과 제안서 PDF에 함께 들어갑니다.</p>` : ''}
      ${commonFields(single)}
      ${deleteButton('사진 핀')}`;
  }

  function dimForm() {
    const single = els.length === 1;
    const D = App.model.TYPES.dim;
    return `
      ${head('치수', single ? '' : `${els.length}개 선택`)}
      ${single ? `<div class="stats">${stat('잰 길이', App.units.formatLength(D.geom(els[0]).length), els[0].manual != null ? '표시는 수동 값' : '')}</div>` : ''}
      <div class="field-grid">
        ${numberField('manual')}
        ${numberField('offset')}
      </div>
      <p class="props-meta">치수선 띄우기는 잰 선에서 치수선을 옆으로 옮기는 거리입니다 (반대쪽은 음수).</p>
      ${editRow()}
      ${groupRow()}
      ${selectField('f-layer', '레이어', App.model.LAYERS.map((l) => [l.id, l.label]), commonText((e) => e.layer))}
      ${deleteButton('치수')}`;
  }

  /** 가져온 도면 (DXF 밑그림) */
  function underlayForm() {
    const single = els.length === 1;
    const u = els[0];
    const d = App.underlay.data(u);
    const U = App.units;
    const check = (id, label, on, note) => `
      <label class="check-row" for="${id}">
        <input type="checkbox" id="${id}" ${on ? 'checked' : ''}>
        <span><b>${label}</b>${note ? `<small>${note}</small>` : ''}</span>
      </label>`;
    const opacity = Math.round(commonText((e) => e.opacity) * 100) || 60;
    // 사진 밑그림(항공사진·지도)이면 사진에 맞는 말로
    const photo = els.every((e) => { const x = App.underlay.data(e); return x && x.kind === 'image'; });
    const img = photo && single && d ? App.images.get(u.imageId || d.imageId) : null;
    return `
      ${head(photo ? '사진 밑그림' : '가져온 도면', single ? u.name : `${els.length}개 선택`)}
      ${check('f-visible', '보이기', els.every((e) => e.visible))}
      ${check('f-locked', '잠금', els.every((e) => e.locked), '잠겨 있으면 도면에서 눌러도 골라지지 않아 그 위에 바로 그릴 수 있습니다. 옮기려면 잠금을 푸세요.')}
      <div class="field">
        <label class="field-label" for="f-opacity">진하기 <output id="o-opacity">${opacity}%</output></label>
        <input type="range" id="f-opacity" class="field-range" min="10" max="100" step="5" value="${opacity}">
      </div>
      ${single && d ? `
        <div class="stats">
          ${stat('크기', `${U.formatLength(d.width * u.scale)} × ${U.formatLength(d.height * u.scale)}`)}
          ${photo ? (img ? stat('사진', `${img.naturalWidth || img.width} × ${img.naturalHeight || img.height} 화소`) : '') : stat('내용', `선 ${d.lines.toLocaleString('ko-KR')}개 · 글자 ${d.textCount.toLocaleString('ko-KR')}개`)}
        </div>
        <div class="field">
          <label class="field-label" for="f-scale">배율</label>
          <div class="field-box"><input id="f-scale" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="${Number(u.scale.toFixed(6))}"><span class="field-unit">배</span></div>
          <div class="field-error" role="alert" hidden></div>
        </div>
        <button type="button" class="btn" data-act="calibrate">두 점으로 길이 맞추기</button>
        <p class="props-meta">${photo ? '사진 크기가 실제와 다르면 사진에서 길이를 아는 두 점(도로 폭, 건물 한 변, 주차 칸 등)을 눌러 실제 길이를 넣으세요.' : '밑그림 크기가 실제와 다르면 길이를 아는 두 점(벽 끝과 끝 등)을 눌러 실제 길이를 넣으세요.'}</p>
        <div class="field-group-label">왼쪽 위 위치</div>
        <div class="field-grid">${numberField('x')}${numberField('y')}</div>
        ${selectField('f-urot', '회전', [['0', '0°'], ['90', '90°'], ['180', '180°'], ['270', '270°']], String(u.rotation || 0))}
        <button type="button" class="btn" data-act="fit-underlay">${photo ? '이 사진에 화면 맞추기' : '이 도면에 화면 맞추기'}</button>` : ''}
      <button type="button" class="btn btn-danger" data-act="delete">${single ? (photo ? '이 사진 지우기' : '이 도면 지우기') : `${els.length}개 지우기`}</button>
      <p class="props-meta">${photo ? '사진 밑그림은 집계에 들어가지 않습니다. 그 위에 물건·영역·동선을 놓으면 집계되고, 3D에서는 바닥에 깔립니다.' : '밑그림은 집계에 들어가지 않습니다. 벽·문·기호를 그 위에 따라 그리면 집계됩니다.'}</p>`;
  }

  function mixedForm() {
    const counts = {};
    els.forEach((e) => { counts[e.type] = (counts[e.type] || 0) + 1; });
    const parts = Object.entries(counts).map(([t, n]) => `${App.model.TYPES[t].label} ${n}`).join(', ');
    const walls = els.filter((e) => e.type === 'wall');
    return `
      ${head(`${els.length}개 선택`, parts)}
      ${walls.length ? materialRows(walls) : ''}
      ${pairRows()}
      ${commonFields(false)}
      <button type="button" class="btn btn-danger" data-act="delete">${els.length}개 삭제</button>`;
  }

  function emptyState() {
    const tips = {
      elec: '위쪽 팔레트에서 기호를 고른 뒤 누르세요. 콘센트·스위치·분전반은 벽 가까이 누르면 벽면에 붙습니다.',
      mech: '위쪽 팔레트에서 기호를 고른 뒤 누르세요. 배관·덕트를 고르면 선을 그립니다.',
      line: '위쪽에서 선 종류를 고른 뒤 끌거나 점을 차례로 눌러 그리세요. 기구 가운데와 끝점에 붙습니다.',
      zone: App.modes.is('event')
        ? '위쪽에서 바닥(잔디·아스팔트·보도블록 등)을 고른 뒤 끌면 사각형, 점을 차례로 누르면 다각형이 됩니다. 3D 조감도에서 그 바닥으로 보입니다.'
        : '끌면 사각형, 점을 차례로 누르면 다각형 영역이 됩니다. 처음 점을 다시 누르면 닫힙니다.',
      event: '위쪽에서 분류(구조물·좌석·장비 등)와 물건을 고른 뒤 놓을 곳을 누르세요. 놓은 뒤 여기서 크기·색·의자 수·글자·이미지를 고칩니다.',
      route: '입구부터 점을 차례로 눌러 사람이 다니는 길을 그리세요. 통로 폭 안에 물건이나 벽이 걸리면 빨갛게 표시됩니다. 3D에서는 이 길을 따라 걸어 볼 수 있습니다.',
      furn: '위쪽에서 가구를 고른 뒤 놓을 곳을 누르세요. 벽 가까이면 등을 벽에 대고 붙습니다.',
      text: '글자를 넣을 곳을 누르고 입력하세요. Enter로 확정합니다.',
      dim: '잴 두 점을 차례로 누르거나 끌어 치수를 넣으세요.',
      wall: '위쪽에서 벽 종류(다루끼·경량 스터드·덧방 등)를 고른 뒤 그리세요. 그린 벽을 ‘선택’ 도구로 누르면 자재 물량이 여기에 나옵니다.',
      room: '벽으로 닫힌 곳 안쪽을 누르면 방으로 등록되고 바닥 면적이 계산됩니다.',
      door: '위쪽에서 문 프리셋을 고른 뒤 벽 위를 누르세요. 누른 쪽으로 문이 열립니다.',
      window: '위쪽에서 창문 프리셋을 고른 뒤 벽 위를 누르세요.',
      column: '위쪽에서 기둥 프리셋을 고른 뒤 놓을 곳을 누르세요.',
    };
    const underlays = App.underlay.list();
    return `
      <div class="empty">
        <div class="empty-title">선택한 항목 없음</div>
        <p>${tips[App.tools.id] || (App.modes.is('event')
          ? '도면에서 물건·영역·동선을 누르면 크기·색·의자 수·글자·이미지를 여기서 고칠 수 있습니다. 아래쪽 ‘물건’ 도구로 텐트·무대·의자를 놓고, 오른쪽 아래 3D 버튼으로 조감도를 보세요.'
          : '도면에서 벽, 문, 창문, 기둥, 방을 누르면 크기와 자재 물량을 여기서 보고 고칠 수 있습니다.')}</p>
      </div>
      ${underlays.length ? `
        <div class="field-group-label">가져온 도면</div>
        ${underlays.map((u) => `<button type="button" class="btn btn-list" data-act="select-underlay" data-id="${esc(u.id)}">
          <span>${esc(u.name)}</span><small>${u.visible ? (u.locked ? '잠김' : '잠금 풀림') : '숨김'} · 설정</small></button>`).join('')}` : ''}`;
  }

  function build() {
    const types = new Set(els.map((e) => e.type));
    const type = types.size === 1 ? [...types][0] : null;
    fields = (type && FIELDS[type]) || {};
    const scroll = pane.scrollTop;
    if (!els.length) pane.innerHTML = emptyState();
    else if (type === 'wall') pane.innerHTML = wallForm();
    else if (type === 'room') pane.innerHTML = roomForm();
    else if (type === 'door' || type === 'window') pane.innerHTML = openingForm(type);
    else if (type === 'column') pane.innerHTML = columnForm();
    else if (type === 'item') pane.innerHTML = itemForm();
    else if (type === 'line') pane.innerHTML = lineForm();
    else if (type === 'zone') pane.innerHTML = zoneForm();
    else if (type === 'route') pane.innerHTML = routeForm();
    else if (type === 'text') pane.innerHTML = textForm();
    else if (type === 'photo') pane.innerHTML = photoForm();
    else if (type === 'dim') pane.innerHTML = dimForm();
    else if (type === 'underlay') pane.innerHTML = underlayForm();
    else pane.innerHTML = mixedForm();
    App.icons.apply(pane);
    pane.scrollTop = scroll;
  }

  /** 입력 중인 칸이 있으면 그 칸만 두고 숫자 칸 값만 새로 고침 */
  function updateNumbers() {
    pane.querySelectorAll('.field[data-field]').forEach((box) => {
      const input = box.querySelector('input');
      if (document.activeElement === input) return;
      const { value, placeholder } = shown(fields[box.dataset.field]);
      input.value = value;
      input.placeholder = placeholder;
    });
  }

  let stale = false; // 숨어 있는 동안 바뀌어 다시 그려야 함
  function refresh() {
    els = App.selection.list().map((id) => App.doc.get(id)).filter(Boolean);
    const key = els.map((e) => e.id).join(',') + (els.length ? '' : `|${App.tools.id}`);
    // 끄는 중(기록 전)에 같은 것을 고른 채면: 숨어 있으면 나중에, 보이면 숫자만 고침 (패널을 통째로 다시 만들지 않음)
    if (App.doc.tx && key === shownKey) {
      if (pane.hidden) stale = true;
      else if (els.length) updateNumbers();
      return;
    }
    stale = false;
    // 글자를 치는 중인 칸이 있으면 패널을 다시 그리지 않음 (선택 상자는 바로 다시 그려도 됨)
    // 색 고르기 칸은 글자를 치는 칸이 아니므로, 색을 고르고 나면 목록(고른 색)까지 새로 그림
    const editing = pane.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) && document.activeElement.type !== 'color';
    if (key !== shownKey || !editing) {
      shownKey = key;
      build();
    } else if (els.length) {
      updateNumbers();
    }
    const badge = document.getElementById('propsBadge');
    badge.textContent = els.length;
    badge.hidden = !els.length;
  }

  function showError(box, msg) {
    const err = box.querySelector('.field-error');
    const input = box.querySelector('input');
    err.textContent = msg || '';
    err.hidden = !msg;
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    box.querySelector('.field-box').classList.toggle('is-invalid', !!msg);
  }

  function apply(label, patchFor) {
    App.doc.transact(label, () => els.forEach((el) => App.doc.update(el.id, patchFor(el))));
  }

  function revert(input, f) {
    input.value = shown(f).value;
  }

  /** 프리셋 값을 고른 문·창문·기둥에 적용 (크기가 벽에 맞지 않으면 막음) */
  function applyPreset(p) {
    if (p.kind !== 'column') {
      const f = fields;
      const problem = els.map((e) => f.width.check(e, p.width) || f.height.check(e, p.height)).find(Boolean)
        || (p.kind === 'window' && els.map((e) => f.sill.check({ ...e, height: p.height }, p.sill)).find(Boolean));
      if (problem) {
        App.ui.toast(`‘${p.name}’을 적용할 수 없습니다. ${problem}`);
        return;
      }
      apply('프리셋 적용', () => (p.kind === 'window'
        ? { width: p.width, height: p.height, sill: p.sill, kind: p.style }
        : { width: p.width, height: p.height, kind: p.style }));
    } else {
      apply('프리셋 적용', () => ({ shape: p.shape, width: p.width, depth: p.shape === 'circle' ? p.width : p.depth }));
    }
  }

  function init() {
    pane = document.getElementById('pane-props');

    // 입력하는 동안 바로 안내
    pane.addEventListener('input', (e) => {
      if (e.target.id === 'f-opacity') document.getElementById('o-opacity').textContent = `${e.target.value}%`;
      const intBox = e.target.closest('.field[data-int]');
      const spec = intBox && intSpec(intBox.dataset.int);
      if (spec) showError(intBox, validateInt(e.target.value, spec).error);
      const box = e.target.closest('.field[data-field]');
      if (!box) return;
      showError(box, validate(e.target.value, fields[box.dataset.field]).error);
    });

    // 확정(엔터·칸 벗어남): 올바르면 반영, 아니면 원래 값으로 되돌리고 안내 유지
    pane.addEventListener('change', (e) => {
      const t = e.target;
      const id = t.id;
      // '여러 값' 자리표는 고를 수 없음 (값 ''인 '없음'·'기본'과 헷갈리지 않게 따로 표시)
      if (t.tagName === 'SELECT' && t.selectedOptions[0] && t.selectedOptions[0].dataset.mixed) return;
      if (id === 'f-layer') {
        if (t.value) apply('레이어 변경', () => ({ layer: t.value }));
        return;
      }
      if (id === 'f-memo') {
        apply('메모 수정', () => ({ memo: t.value }));
        return;
      }
      if (id === 'f-photoTitle') {
        apply('사진 제목', () => ({ title: t.value.trim().slice(0, 40) }));
        return;
      }
      if (id === 'f-lock') {
        App.edit.setLocked(els.map((e) => e.id), t.checked);
        return;
      }
      if (id === 'f-visible' || id === 'f-locked') {
        const key = id === 'f-visible' ? 'visible' : 'locked';
        apply(key === 'visible' ? (t.checked ? '밑그림 보이기' : '밑그림 숨기기') : (t.checked ? '밑그림 잠금' : '밑그림 잠금 풀기'), () => ({ [key]: t.checked }));
        return;
      }
      if (id === 'f-opacity') {
        apply('밑그림 진하기', () => ({ opacity: Number(t.value) / 100 }));
        return;
      }
      if (id === 'f-urot') {
        apply('밑그림 회전', () => ({ rotation: Number(t.value) }));
        return;
      }
      if (id === 'f-scale') {
        const box = t.closest('.field');
        const v = Number(String(t.value).replace(/[,\s]/g, ''));
        if (!(v > 0) || v > 100000) {
          showError(box, '0보다 큰 숫자를 넣으세요. 값은 바뀌지 않았습니다.');
          t.value = Number(els[0].scale.toFixed(6));
          return;
        }
        showError(box, '');
        apply('밑그림 배율', () => ({ scale: v }));
        return;
      }
      if (id === 'f-wallType') {
        if (t.value) apply('벽 종류 변경', () => ({ typeId: t.value }));
        return;
      }
      if (id === 'f-wallPhase') {
        if (t.value !== '__mixed') apply(t.value === 'demo' ? '철거 벽으로' : t.value === 'keep' ? '기존 벽으로' : '신설 벽으로', () => ({ phase: t.value || null }));
        return;
      }
      if (id === 'f-kind') {
        if (t.value) apply('종류 변경', () => ({ kind: t.value }));
        return;
      }
      if (id === 'f-shape') {
        if (t.value) apply('모양 변경', (c) => ({ shape: t.value, depth: t.value === 'circle' ? c.width : c.depth }));
        return;
      }
      if (id === 'f-itemKind') {
        // 종류를 바꾸면 크기·설치 높이·구수 같은 속성도 새 종류의 기본값으로. 벽에 붙지 않는 종류면 벽에서 뗌
        const def = App.catalog.itemDef(t.value);
        if (def) {
          apply('종류 변경', () => ({
            kind: def.kind, size: def.size, gang: null, variant: null, circuits: null, h3: null, style: null, kw: null, ...App.catalog.itemDefaults(def),
            ...(def.depth ? { depth: def.depth } : {}),
            ...(def.wall ? {} : { wallId: null, t: null, side: null }),
            // 부스가 아닌 종류로 바꾸면 부스 번호·업체도 지움 (배정표에서 빠진 채 이름표만 남지 않게)
            ...(App.booths && App.booths.KINDS.has(def.kind) ? {} : { boothNo: null, exhibitor: null }),
          }));
        }
        return;
      }
      if (id.startsWith('f-opt-')) {
        if (t.value) apply(`${t.closest('.field').querySelector('label').textContent} 변경`, () => ({ [id.slice(6)]: t.value }));
        return;
      }
      if (id.startsWith('f-num-')) {
        const box = t.closest('.field');
        const key = id.slice(6);
        const o = intSpec(key);
        if (!o) return;
        if (t.value.trim() === '' && els.length > 1) return;
        const r = validateInt(t.value, o);
        if (r.error) {
          showError(box, `${r.error} 값은 바뀌지 않았습니다.`);
          const v = commonText((e) => e[key] ?? null);
          t.value = v == null ? '' : v;
          return;
        }
        showError(box, '');
        // 의자 배열: 총 의자 수를 넣으면 줄 수를 맞추고, 한 줄 의자 수·줄 수를 바꾸면 꽉 채운 수로. 그다음 자리 크기도 같이
        apply(`${o.label} 변경`, (el) => {
          const patch = { [key]: r.value };
          if (el.kind === '의자 배열') {
            if (key === 'count') patch.rows = Math.max(1, Math.ceil(r.value / Math.max(1, el.cols || 1)));
            else if (key === 'cols' || key === 'rows') patch.count = (key === 'cols' ? r.value : el.cols) * (key === 'rows' ? r.value : el.rows);
          }
          return key === 'rotation' ? patch : App.catalog.resized(el, patch);
        });
        return;
      }
      if (id === 'f-itemColor' || id === 'f-wallColor') {
        apply('색 변경', () => ({ color: t.value || null }));
        return;
      }
      if (id === 'f-itemColorPick' || id === 'f-wallColorPick') {
        apply('색 변경', () => ({ color: t.value }));
        return;
      }
      if (id === 'f-wallImageSide') {
        if (t.value) apply('사진 붙이는 면', () => ({ imageSide: t.value }));
        return;
      }
      if (id === 'f-wallImageFit') {
        if (t.value) apply('사진 채우는 방법', () => ({ imageFit: t.value }));
        return;
      }
      if (id === 'f-faceText') {
        apply('글자 변경', () => ({ text: t.value.replace(/\s+$/, '') }));
        return;
      }
      if (id === 'f-seatNo') { apply('좌석 번호', () => ({ seatNo: t.checked })); return; }
      if (id === 'f-kw') {
        // 1,000처럼 세 자리마다 찍은 쉼표는 천 단위, 1,5처럼 쓴 쉼표는 소수점으로 읽음
        const raw = t.value.trim(), v = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw) ? raw.replace(/,/g, '') : raw.replace(',', '.');
        if (v === '') { apply('전기', () => ({ kw: null })); return; }
        const n = Number(v);
        if (!(n >= 0) || n > 5000) { App.ui.toast('전기는 0~5000 사이 숫자(kW)로 넣으세요. 비우면 기본값을 씁니다.'); refresh(); return; }
        apply('전기', () => ({ kw: Math.round(n * 10) / 10 }));
        return;
      }
      if (id === 'f-boothNo') { apply('부스 번호', (e) => (App.booths.isBooth(e) ? { boothNo: t.value.trim() } : {})); return; }
      if (id === 'f-exhibitor') { apply('업체·이름', (e) => (App.booths.isBooth(e) ? { exhibitor: t.value.trim() } : {})); return; }
      if (id === 'f-seatFrom') { if (t.value) apply('좌석 번호 방향', () => ({ seatFrom: t.value })); return; }
      if (id === 'f-seatRow0') {
        const v = t.value.trim().toUpperCase();
        if (/^[A-Z]{1,2}$/.test(v)) apply('첫 열 글자', () => ({ seatRow0: v }));
        else { App.ui.toast('첫 열 글자는 A~Z 또는 AA~ZZ로 넣으세요.'); refresh(); }
        return;
      }
      if (id === 'f-seatNum0') {
        const v = parseInt(t.value, 10);
        if (v >= 1 && v <= 9999) apply('첫 번호', () => ({ seatNum0: v }));
        else { App.ui.toast('첫 번호는 1 이상 숫자로 넣으세요.'); refresh(); }
        return;
      }
      if (id === 'f-zoneCrowd') { apply('관람 구역', () => ({ crowd: t.checked })); return; }
      if (id === 'f-demoFloor' || id === 'f-demoCeil' || id === 'f-demoWall') { const k = id.slice(2); apply('철거 항목', () => ({ [k]: t.checked || null })); return; }
      if (id === 'f-opPhase') { apply(t.value === 'demo' ? '문·창문 철거로' : t.value === 'keep' ? '기존 문·창문으로' : t.value === 'new' ? '신설 문·창문으로' : '공사: 벽 따라', () => ({ phase: t.value || null })); return; }
      if (id === 'f-wallWork' || id === 'f-ceilWork') {
        const key = id === 'f-wallWork' ? 'wallWork' : 'ceilWork';
        apply(id === 'f-wallWork' ? '벽 마감' : '천장 마감', () => ({ [key]: t.value || null }));
        return;
      }
      if (id === 'f-floorLook') {
        apply('바닥 모양', () => ({ floorLook: t.value || null }));
        return;
      }
      if (id === 'f-roomWallColor') {
        apply('벽지 색', () => ({ wallColor: t.value || null }));
        return;
      }
      if (id === 'f-roomWallColorPick') {
        apply('벽지 색', () => ({ wallColor: t.value }));
        return;
      }
      if (id === 'f-wallFinish' || id === 'f-floorFinish') {
        const key = id === 'f-wallFinish' ? 'wallFinishId' : 'floorFinishId';
        apply(id === 'f-wallFinish' ? '벽 마감 변경' : '바닥 마감 변경', () => ({ [key]: t.value || null }));
        return;
      }
      if (id === 'f-furnSize') {
        const [w, d] = t.value.split('x').map(Number);
        if (w > 0 && d > 0) apply('규격 변경', () => ({ size: w, depth: d }));
        return;
      }
      if (id === 'f-rotation') {
        if (t.value) apply('회전', () => ({ rotation: Number(t.value) }));
        return;
      }
      if (id === 'f-linePreset') {
        const p = t.value && App.doc.get(t.value);
        if (p) {
          apply('선 종류 변경', () => ({
            presetId: p.id, category: p.category, layer: App.catalog.lineLayer(p.category), runHeight: p.runHeight ?? null,
          }));
        }
        return;
      }
      if (id === 'f-zoneColor') {
        if (t.value === 'clear') apply('영역 투명', () => ({ clear: true }));
        else if (t.value) apply('영역 색 변경', () => ({ color: t.value, clear: false }));
        return;
      }
      if (id === 'f-zoneSurface') {
        apply('바닥 변경', () => ({ surface: t.value }));
        return;
      }
      if (id === 'f-routeKind') {
        // 종류를 바꾸면 색과 통로 폭도 그 종류의 기본값으로
        const k = t.value && App.routes.KINDS.find((x) => x.kind === t.value);
        if (k) apply('동선 종류 변경', () => ({ kind: k.kind, color: k.color, width: k.width }));
        return;
      }
      if (id === 'f-routeColor') {
        if (t.value) apply('동선 색 변경', () => ({ color: t.value }));
        return;
      }
      if (id === 'f-routeName') {
        const value = t.value.trim().slice(0, NAME_MAX);
        if (!value) {
          t.value = els[0].name;
          App.ui.toast('동선 이름을 비워 둘 수 없습니다.');
          return;
        }
        apply('동선 이름 변경', () => ({ name: value }));
        return;
      }
      if (id === 'f-zoneName' || id === 'f-content') {
        const value = id === 'f-zoneName' ? t.value.trim().slice(0, NAME_MAX) : t.value.replace(/\s+$/, '');
        if (!value) {
          t.value = id === 'f-zoneName' ? els[0].name : els[0].content;
          App.ui.toast(id === 'f-zoneName' ? '영역 이름을 비워 둘 수 없습니다.' : '내용을 비울 수 없습니다. 지우려면 삭제를 누르세요.');
          return;
        }
        apply(id === 'f-zoneName' ? '영역 이름 변경' : '메모 고치기', () => (id === 'f-zoneName' ? { name: value } : { content: value }));
        return;
      }
      if (id === 'f-preset') {
        const p = t.value && App.doc.get(t.value);
        t.value = '';
        if (p) applyPreset(p);
        return;
      }
      if (id === 'f-name') {
        const name = t.value.trim().slice(0, NAME_MAX);
        if (!name) {
          t.value = els[0].name;
          App.ui.toast('방 이름을 비워 둘 수 없습니다.');
          return;
        }
        apply('방 이름 변경', () => ({ name }));
        return;
      }
      const box = t.closest('.field[data-field]');
      if (!box) return;
      const f = fields[box.dataset.field];
      if (t.value.trim() === '' && shown(f).placeholder === '여러 값') return; // '여러 값' 칸을 비운 채 두면 그대로
      const r = validate(t.value, f);
      if (r.error) {
        showError(box, `${r.error} 값은 바뀌지 않았습니다.`);
        revert(t, f);
        return;
      }
      showError(box, '');
      const label = `${App.model.TYPES[els[0].type].label} ${f.label} 변경`;
      if (f.apply) App.doc.transact(label, () => f.apply(els, r.value));
      else apply(label, (el) => f.set(el, r.value));
    });

    pane.addEventListener('keydown', (e) => {
      if (e.target.tagName !== 'INPUT') return;
      if (e.key === 'Enter') e.target.blur();
      if (e.key === 'Escape') {
        const box = e.target.closest('.field[data-field]');
        const intBox = e.target.closest('.field[data-int]');
        if (box) {
          showError(box, '');
          revert(e.target, fields[box.dataset.field]);
        } else if (intBox) {
          showError(intBox, '');
          const v = commonText((el) => el[intBox.dataset.int] ?? null);
          e.target.value = v == null ? '' : v;
        } else if (e.target.id === 'f-name') {
          e.target.value = els[0].name;
        }
        e.target.blur();
      }
    });

    // 미세 이동: 누르는 순간 한 번, 누르고 있으면 계속 (패널이 다시 그려져도 손을 뗄 때까지)
    let repeat = null;
    const stopRepeat = () => { clearTimeout(repeat); clearInterval(repeat); repeat = null; };
    const nudgeBy = (id) => {
      const [, x, y] = NUDGE_DIRS.find((d) => d[0] === id);
      return App.edit.nudge(x * nudgeStep, y * nudgeStep);
    };
    pane.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-nudge]');
      if (!b || e.button > 0) return;
      e.preventDefault();
      stopRepeat();
      const id = b.dataset.nudge;
      if (!nudgeBy(id)) return;
      repeat = setTimeout(() => { repeat = setInterval(() => nudgeBy(id) || stopRepeat(), 90); }, 400);
    });
    ['pointerup', 'pointercancel', 'blur'].forEach((ev) => window.addEventListener(ev, stopRepeat));

    pane.addEventListener('click', (e) => {
      const po = e.target.closest('[data-ph-open]');
      if (po && els.length === 1) { App.photos.open(els[0].id, Number(po.dataset.phOpen)); return; }
      const pa = e.target.closest('[data-act="photo-add"], [data-act="photo-view"]');
      if (pa && els.length === 1) {
        if (pa.dataset.act === 'photo-add') App.photos.addTo(els[0].id);
        else App.photos.open(els[0].id, 0);
        return;
      }
      const nb = e.target.closest('[data-nudge]');
      if (nb) {
        if (e.detail === 0) nudgeBy(nb.dataset.nudge); // 키보드(Enter·Space)로 누른 경우
        return;
      }
      const ns = e.target.closest('[data-nudge-step]');
      if (ns) {
        nudgeStep = Number(ns.dataset.nudgeStep);
        pane.querySelectorAll('[data-nudge-step]').forEach((b) => b.setAttribute('aria-pressed', String(b === ns)));
        pane.querySelectorAll('[data-nudge]').forEach((b) => {
          const d = NUDGE_DIRS.find((x) => x[0] === b.dataset.nudge);
          b.setAttribute('aria-label', `${d[3]} ${nudgeStep}mm`);
        });
        return;
      }
      const al = e.target.closest('[data-align]');
      if (al) {
        App.edit.align(al.dataset.align);
        return;
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      switch (act.dataset.act) {
        case 'delete': App.actions.deleteSelection(); break;
        case 'flip': apply('마감 면 뒤집기', (w) => ({ flip: !w.flip })); break;
        case 'swing': apply('열리는 쪽 뒤집기', (d) => ({ side: -(d.side || 1) })); break;
        case 'hinge': apply('경첩 위치 바꾸기', (d) => ({ hinge: d.hinge === 'end' ? 'start' : 'end' })); break;
        case 'edit-type': App.catalogUI.open('wallType', commonText((w) => w.typeId)); break;
        case 'edit-line': App.catalogUI.open('line', commonText((l) => l.presetId)); break;
        case 'rotate': App.actions.rotateSelection(); break;
        case 'detach': apply('벽에서 떼기', (it) => (it.wallId ? { wallId: null, t: null, side: null } : {})); break;
        case 'gap-dims-edge': App.dims.clearanceDims(els[0], 'edge'); break;
        case 'face-image':
          App.images.pick().then((id) => { if (id) apply('이미지 넣기', () => ({ imageId: id })); });
          break;
        case 'face-image-clear': apply('이미지 빼기', () => ({ imageId: null })); break;
        case 'obj-edit': { const m = els[0] && App.library.meta(els[0].kind); if (m) App.libraryUI.edit(m.id).then(() => { shownKey = null; refresh(); }); break; }
        case 'obj-link': { const m = els[0] && App.library.meta(els[0].kind); if (m && m.url) window.open(m.url, '_blank', 'noopener'); break; }
        case 'wall-image':
          App.images.pick().then((id) => { if (id) apply('벽에 사진 붙이기', () => ({ imageId: id })); });
          break;
        case 'wall-image-clear': apply('벽 사진 떼기', () => ({ imageId: null })); break;
        case 'route-check': App.routes.report(); break;
        case 'route-reverse': apply('방향 뒤집기', (r) => ({ points: r.points.slice().reverse() })); break;
        case 'route-walk': App.view3d.open({ walk: true, routeId: els[0].id }); break;
        case 'route-issue': {
          const x = App.routes.check(els[0]).issues[Number(act.dataset.i)];
          if (x) {
            const m = Math.max(3000, els[0].width * 2);
            App.plan.fitToContent({ minX: x.at.x - m, minY: x.at.y - m, maxX: x.at.x + m, maxY: x.at.y + m });
            if (App.ui.mobile.matches) App.ui.sheet.collapse();
          }
          break;
        }
        case 'edit-finish': App.catalogUI.open('finish', commonText((r) => r.wallFinishId) || commonText((r) => r.floorFinishId)); break;
        case 'finish-all': {
          const { wallFinishId = null, floorFinishId = null } = els[0];
          const rooms = [...App.doc.all()].filter((e) => e.type === 'room');
          App.doc.transact('마감 모든 방에', () => rooms.forEach((r) => App.doc.update(r.id, { wallFinishId, floorFinishId })));
          App.ui.toast(`방 ${rooms.length}곳에 같은 마감을 넣었습니다.`);
          break;
        }
        case 'mat-basis': App.materials.openBasis(); break;
        case 'booth-number': App.booths.numberDialog(); break;
        case 'zone-fence': App.fences.dialog(els[0].id); break;
        case 'zone-parking': App.parking.dialog(els[0].id); break;
        case 'zone-seating': App.seating.dialog(els[0].id); break;
        case 'zone-wizard': App.wizard.intoZone(els[0].id); break;
        case 'booth-csv': App.booths.exportCsv(); break;
        case 'seat-csv': {
          const arrays = [...App.doc.all()].filter((e) => e.type === 'item' && e.kind === '의자 배열');
          const rows = [['구역', '열', '번호', '좌석']];
          arrays.forEach((it, i) => App.catalog.seatLabels(it).forEach((l) => rows.push([it.name || `의자 배열 ${i + 1}`, l.row, l.no, l.label])));
          const name = `좌석표_${App.exporter.stamp()}.csv`;
          App.exporter.saved(App.exporter.download(name, App.exporter.csvText(rows), 'text/csv;charset=utf-8'), `좌석 ${rows.length - 1}석을 ‘${name}’로 저장했습니다.`);
          break;
        }
        case 'look-all': {
          const { floorLook = null, wallColor = null, wallWork = null, ceilWork = null } = els[0];
          const rooms = [...App.doc.all()].filter((e) => e.type === 'room');
          App.doc.transact('꾸미기 모든 방에', () => rooms.forEach((r) => App.doc.update(r.id, { floorLook, wallColor, wallWork, ceilWork })));
          App.ui.toast(`방 ${rooms.length}곳에 같은 바닥·벽지·마감을 넣었습니다.`);
          break;
        }
        case 'gap-dims-center': App.dims.clearanceDims(els[0], 'center'); break;
        case 'group': App.actions.groupSelection(); break;
        case 'calibrate': App.underlay.calibrate(els[0].id); break;
        case 'duplicate': App.edit.duplicate(); break;
        case 'rotate-any': App.edit.rotate(); break;
        case 'select-underlay': App.selection.set([act.dataset.id]); break;
        case 'fit-underlay': {
          const b = App.doc.bounds(els.map((e) => e.id));
          if (b) App.plan.fitToContent(b);
          break;
        }
        case 'ungroup': App.actions.ungroupSelection(); break;
      }
    });

    App.selection.onChange(refresh);
    App.doc.onChange(refresh);
    App.ui.on('tab', (id) => { if (id === 'tab-props' && stale) refresh(); });
    App.ui.on('images', () => { if (els.length === 1 && els[0].type === 'photo' && !pane.contains(document.activeElement)) build(); });
    App.ui.on('images', refresh); // 넣은 이미지를 다 읽으면 미리 보기가 나오게
    App.ui.on('mode', refresh);
    App.ui.on('tool', () => queueMicrotask(refresh));
    refresh();
  }

  App.props = { init, refresh, validate, FIELDS };
})();
