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

  const FIELDS = {
    wall: {
      length: {
        label: '길이', min: 1, max: 1000000,
        get: (w) => G.dist(w.start, w.end),
        // 시작점은 두고 끝점을 같은 방향으로 옮김
        set: (w, v) => {
          const d = G.unit({ x: w.end.x - w.start.x, y: w.end.y - w.start.y });
          return { end: { x: w.start.x + d.x * v, y: w.start.y + d.y * v } };
        },
        check: (w) => (G.dist(w.start, w.end) < 0.001 ? '길이가 0인 벽은 방향이 없어 길이를 바꿀 수 없습니다.' : null),
      },
      height: { label: '높이', min: 100, max: 20000, get: (w) => w.height, set: (w, v) => ({ height: v }) },
      sx: { label: 'X', min: -COORD_LIMIT, max: COORD_LIMIT, get: (w) => w.start.x, set: (w, v) => ({ start: { x: v, y: w.start.y } }) },
      sy: { label: 'Y', min: -COORD_LIMIT, max: COORD_LIMIT, get: (w) => w.start.y, set: (w, v) => ({ start: { x: w.start.x, y: v } }) },
      ex: { label: 'X', min: -COORD_LIMIT, max: COORD_LIMIT, get: (w) => w.end.x, set: (w, v) => ({ end: { x: v, y: w.end.y } }) },
      ey: { label: 'Y', min: -COORD_LIMIT, max: COORD_LIMIT, get: (w) => w.end.y, set: (w, v) => ({ end: { x: w.end.x, y: v } }) },
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
      size: { label: '기호 크기', min: 50, max: 5000, get: (it) => it.size, set: (it, v) => ({ size: v }) },
      height: {
        label: '설치 높이 (비우면 천장)', min: 0, max: 20000, allowEmpty: true, emptyText: '천장',
        get: (it) => it.height, set: (it, v) => ({ height: v }),
      },
      x: { label: 'X', min: -COORD_LIMIT, max: COORD_LIMIT, get: (it) => it.x, set: (it, v) => ({ x: v }) },
      y: { label: 'Y', min: -COORD_LIMIT, max: COORD_LIMIT, get: (it) => it.y, set: (it, v) => ({ y: v }) },
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
            ${current === null ? '<option value="" selected>여러 값</option>' : ''}
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

  function commonFields(single) {
    const layer = commonText((e) => e.layer) || '';
    const memo = commonText((e) => e.memo);
    return `
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
      ${oneSided ? '<button type="button" class="btn" data-act="flip">마감 면 뒤집기 (석고·틀이 붙는 쪽)</button>' : ''}
      <div class="field-grid">
        ${single ? numberField('length') : ''}
        ${numberField('height')}
      </div>
      <div class="stats">
        ${stat('두께', thickness === null ? '여러 값' : App.units.formatLength(thickness), '벽 종류에서 정해짐')}
        ${stat(single ? '벽 면적 (한 면)' : '벽 면적 합계 (한 면)', App.units.formatArea(area), openings ? `문·창문 ${openings}개 뺌` : '')}
        ${single ? stat('방', roomsOfWall(els[0].id)) : ''}
      </div>
      ${materialRows(els)}
      ${single ? `
        <div class="field-group-label">시작점</div>
        <div class="field-grid">${numberField('sx')}${numberField('sy')}</div>
        <div class="field-group-label">끝점</div>
        <div class="field-grid">${numberField('ex')}${numberField('ey')}</div>` : ''}
      ${commonFields(single)}
      ${deleteButton('벽')}`;
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
        ${stat(single ? '바닥 면적' : '바닥 면적 합계', App.units.formatArea(area))}
        ${stat(single ? '천장 면적' : '천장 면적 합계', App.units.formatArea(total('ceiling')), els.some((e) => e.ceilingArea != null) ? '직접 입력' : '바닥과 같음')}
        ${stat('벽 면적 (방 쪽)', App.units.formatArea(total('wallArea')), total('openingArea') ? `문·창문 ${App.units.formatArea(total('openingArea'))} 뺌` : '')}
        ${[...boards].map(([spec, a]) => stat(`${spec} (방 쪽)`, App.units.formatArea(a), '겹 수 반영')).join('')}
        ${single ? stat('둘레', App.units.formatLength(G.perimeter(r.points))) : ''}
      </div>
      <div class="field-grid">
        ${numberField('ceilingHeight')}
        ${numberField('wallHeight')}
      </div>
      ${numberField('ceilingArea')}
      ${commonFields(single)}
      ${deleteButton('방')}
      <p class="props-meta">방을 지워도 벽은 남습니다.</p>`;
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
      ${commonFields(single)}
      ${deleteButton('기둥')}`;
  }

  const roomName = (id) => {
    const r = id && App.doc.get(id);
    return r ? r.name || '이름 없음' : '없음';
  };

  /** 정수 칸 (회로 수 등). 길이가 아니라 단위 변환 없음 */
  function intField(key, o) {
    const v = commonText((e) => e[key] ?? null);
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

  function itemForm() {
    const single = els.length === 1;
    const cat = commonText((e) => e.category);
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
      <div class="field-grid">
        ${numberField('height')}
        ${def && def.numbers ? Object.entries(def.numbers).map(([key, o]) => intField(key, o)).join('') : ''}
        ${numberField('size')}
      </div>
      ${ceilingOnes.length ? `<p class="props-meta">설치 높이를 비우면 그 방의 천장 높이${single ? `(${esc(App.units.formatLength(ceiling))})` : ''}에 다는 것으로 봅니다. 높이는 배관·전선관 수직 길이 계산에 쓰입니다.</p>`
        : '<p class="props-meta">설치 높이는 바닥에서 기구 가운데까지입니다. 배관·전선관 수직 길이 계산에 쓰입니다.</p>'}
      ${selectField('f-rotation', '회전', [['0', '0°'], ['90', '90°'], ['180', '180°'], ['270', '270°']], rotation,
        '<button type="button" class="btn" data-act="rotate">90° 돌리기</button>')}
      ${single && !mounted.length ? `<div class="field-group-label">가운데 위치</div><div class="field-grid">${numberField('x')}${numberField('y')}</div>` : ''}
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
      ${selectField('f-zoneColor', '색', App.catalog.COLORS.map(([hex, name]) => [hex, name]), commonText((z) => z.color))}
      <div class="stats">
        ${stat(single ? '면적' : '면적 합계', App.units.formatArea(area))}
        ${single ? stat('둘레', App.units.formatLength(G.perimeter(els[0].points))) : ''}
      </div>
      ${commonFields(single)}
      ${deleteButton('영역')}`;
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
      ${groupRow()}
      ${selectField('f-layer', '레이어', App.model.LAYERS.map((l) => [l.id, l.label]), commonText((e) => e.layer))}
      ${deleteButton('텍스트')}`;
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
    return `
      ${head('가져온 도면', single ? u.name : `${els.length}개 선택`)}
      ${check('f-visible', '보이기', els.every((e) => e.visible))}
      ${check('f-locked', '잠금', els.every((e) => e.locked), '잠겨 있으면 도면에서 눌러도 골라지지 않아 그 위에 바로 그릴 수 있습니다. 옮기려면 잠금을 푸세요.')}
      <div class="field">
        <label class="field-label" for="f-opacity">진하기 <output id="o-opacity">${opacity}%</output></label>
        <input type="range" id="f-opacity" class="field-range" min="10" max="100" step="5" value="${opacity}">
      </div>
      ${single && d ? `
        <div class="stats">
          ${stat('크기', `${U.formatLength(d.width * u.scale)} × ${U.formatLength(d.height * u.scale)}`)}
          ${stat('내용', `선 ${d.lines.toLocaleString('ko-KR')}개 · 글자 ${d.textCount.toLocaleString('ko-KR')}개`)}
        </div>
        <div class="field">
          <label class="field-label" for="f-scale">배율</label>
          <div class="field-box"><input id="f-scale" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="${Number(u.scale.toFixed(6))}"><span class="field-unit">배</span></div>
          <div class="field-error" role="alert" hidden></div>
        </div>
        <button type="button" class="btn" data-act="calibrate">두 점으로 길이 맞추기</button>
        <p class="props-meta">밑그림 크기가 실제와 다르면 길이를 아는 두 점(벽 끝과 끝 등)을 눌러 실제 길이를 넣으세요.</p>
        <div class="field-group-label">왼쪽 위 위치</div>
        <div class="field-grid">${numberField('x')}${numberField('y')}</div>
        ${selectField('f-urot', '회전', [['0', '0°'], ['90', '90°'], ['180', '180°'], ['270', '270°']], String(u.rotation || 0))}
        <button type="button" class="btn" data-act="fit-underlay">이 도면에 화면 맞추기</button>` : ''}
      <button type="button" class="btn btn-danger" data-act="delete">${single ? '이 도면 지우기' : `${els.length}개 지우기`}</button>
      <p class="props-meta">밑그림은 집계에 들어가지 않습니다. 벽·문·기호를 그 위에 따라 그리면 집계됩니다.</p>`;
  }

  function mixedForm() {
    const counts = {};
    els.forEach((e) => { counts[e.type] = (counts[e.type] || 0) + 1; });
    const parts = Object.entries(counts).map(([t, n]) => `${App.model.TYPES[t].label} ${n}`).join(', ');
    const walls = els.filter((e) => e.type === 'wall');
    return `
      ${head(`${els.length}개 선택`, parts)}
      ${walls.length ? materialRows(walls) : ''}
      ${commonFields(false)}
      <button type="button" class="btn btn-danger" data-act="delete">${els.length}개 삭제</button>`;
  }

  function emptyState() {
    const tips = {
      elec: '위쪽 팔레트에서 기호를 고른 뒤 누르세요. 콘센트·스위치·분전반은 벽 가까이 누르면 벽면에 붙습니다.',
      mech: '위쪽 팔레트에서 기호를 고른 뒤 누르세요. 배관·덕트를 고르면 선을 그립니다.',
      line: '위쪽에서 선 종류를 고른 뒤 끌거나 점을 차례로 눌러 그리세요. 기구 가운데와 끝점에 붙습니다.',
      zone: '끌면 사각형, 점을 차례로 누르면 다각형 영역이 됩니다. 처음 점을 다시 누르면 닫힙니다.',
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
        <p>${tips[App.tools.id] || '도면에서 벽, 문, 창문, 기둥, 방을 누르면 크기와 자재 물량을 여기서 보고 고칠 수 있습니다.'}</p>
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
    else if (type === 'text') pane.innerHTML = textForm();
    else if (type === 'dim') pane.innerHTML = dimForm();
    else if (type === 'underlay') pane.innerHTML = underlayForm();
    else pane.innerHTML = mixedForm();
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

  function refresh() {
    els = App.selection.list().map((id) => App.doc.get(id)).filter(Boolean);
    const key = els.map((e) => e.id).join(',') + (els.length ? '' : `|${App.tools.id}`);
    // 글자를 치는 중인 칸이 있으면 패널을 다시 그리지 않음 (선택 상자는 바로 다시 그려도 됨)
    const editing = pane.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
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
      const def = intBox && commonDef();
      if (def) showError(intBox, validateInt(e.target.value, def.numbers[intBox.dataset.int]).error);
      const box = e.target.closest('.field[data-field]');
      if (!box) return;
      showError(box, validate(e.target.value, fields[box.dataset.field]).error);
    });

    // 확정(엔터·칸 벗어남): 올바르면 반영, 아니면 원래 값으로 되돌리고 안내 유지
    pane.addEventListener('change', (e) => {
      const t = e.target;
      const id = t.id;
      if (id === 'f-layer') {
        if (t.value) apply('레이어 변경', () => ({ layer: t.value }));
        return;
      }
      if (id === 'f-memo') {
        apply('메모 수정', () => ({ memo: t.value }));
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
            kind: def.kind, size: def.size, gang: null, variant: null, circuits: null, ...App.catalog.itemDefaults(def),
            ...(def.wall ? {} : { wallId: null, t: null, side: null }),
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
        const def = commonDef();
        if (!def) return;
        const key = id.slice(6), o = def.numbers[key];
        if (t.value.trim() === '' && els.length > 1) return;
        const r = validateInt(t.value, o);
        if (r.error) {
          showError(box, `${r.error} 값은 바뀌지 않았습니다.`);
          const v = commonText((e) => e[key] ?? null);
          t.value = v == null ? '' : v;
          return;
        }
        showError(box, '');
        apply(`${o.label} 변경`, () => ({ [key]: r.value }));
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
        if (t.value) apply('영역 색 변경', () => ({ color: t.value }));
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

    pane.addEventListener('click', (e) => {
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
        case 'group': App.actions.groupSelection(); break;
        case 'calibrate': App.underlay.calibrate(els[0].id); break;
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
    App.ui.on('tool', () => queueMicrotask(refresh));
    refresh();
  }

  App.props = { init, refresh, validate, FIELDS };
})();
