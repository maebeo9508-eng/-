/* 속성 패널: 선택한 항목의 속성을 보고 고친다.
   숫자는 설정 단위로 보여 주고 mm로 저장. 잘못된 값(숫자 아님, 0 이하, 너무 큼)은 막고 안내 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const G = App.geom;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const COORD_LIMIT = 10000000; // 좌표 범위 ±10km
  const NAME_MAX = 40;

  /* 숫자 칸 정의. min이 0보다 크면 0 이하는 막음. apply가 있으면 그것으로 반영 */
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
      thickness: { label: '두께', min: 10, max: 2000, get: (w) => w.thickness, set: (w, v) => ({ thickness: v }) },
      height: { label: '높이', min: 100, max: 20000, get: (w) => w.height, set: (w, v) => ({ height: v }) },
      sx: { label: 'X', min: -COORD_LIMIT, max: COORD_LIMIT, get: (w) => w.start.x, set: (w, v) => ({ start: { x: v, y: w.start.y } }) },
      sy: { label: 'Y', min: -COORD_LIMIT, max: COORD_LIMIT, get: (w) => w.start.y, set: (w, v) => ({ start: { x: w.start.x, y: v } }) },
      ex: { label: 'X', min: -COORD_LIMIT, max: COORD_LIMIT, get: (w) => w.end.x, set: (w, v) => ({ end: { x: v, y: w.end.y } }) },
      ey: { label: 'Y', min: -COORD_LIMIT, max: COORD_LIMIT, get: (w) => w.end.y, set: (w, v) => ({ end: { x: w.end.x, y: v } }) },
    },
    room: {
      ceilingHeight: { label: '천장 높이', min: 100, max: 20000, get: (r) => r.ceilingHeight, set: (r, v) => ({ ceilingHeight: v }) },
      // 방의 벽 높이를 바꾸면 그 방을 둘러싼 벽들의 높이도 함께 바꿈
      wallHeight: {
        label: '벽 높이', min: 100, max: 20000, get: (r) => r.wallHeight,
        apply: (rooms, v) => rooms.forEach((r) => {
          App.doc.update(r.id, { wallHeight: v });
          r.wallIds.forEach((id) => App.doc.has(id) && App.doc.update(id, { height: v }));
        }),
      },
    },
  };

  let pane = null;
  let shownKey = null;
  let els = [];
  let fields = {}; // 지금 보이는 종류의 숫자 칸 정의

  function validate(text, f) {
    const mm = App.units.parseLength(text);
    if (String(text).trim() === '' || Number.isNaN(mm)) return { error: '숫자를 입력하세요.' };
    if (f.min > 0 && mm <= 0) return { error: '0보다 큰 값을 입력하세요.' };
    if (mm < f.min) return { error: `${App.units.formatLength(f.min)} 이상으로 입력하세요.` };
    if (mm > f.max) return { error: `${App.units.formatLength(f.max)} 이하로 입력하세요.` };
    const problem = f.check && els.map(f.check).find(Boolean);
    if (problem) return { error: problem };
    return { value: mm };
  }

  /** 여러 개 선택했을 때 값이 모두 같으면 그 값, 다르면 null */
  const common = (get) => {
    const first = get(els[0]);
    return els.every((e) => Math.abs(get(e) - first) < 0.001) ? first : null;
  };
  const commonText = (get) => (els.every((e) => get(e) === get(els[0])) ? get(els[0]) : null);

  function numberField(key) {
    const f = fields[key];
    const v = common(f.get);
    const value = v === null ? '' : App.units.inputLength(v);
    return `
      <div class="field" data-field="${key}">
        <label class="field-label" for="f-${key}">${f.label}</label>
        <div class="field-box">
          <input id="f-${key}" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off"
            value="${esc(value)}" ${v === null ? 'placeholder="여러 값"' : ''}>
          <span class="field-unit">${App.units.lengthLabel()}</span>
        </div>
        <div class="field-error" role="alert" hidden></div>
      </div>`;
  }

  function stat(label, value, id) {
    return `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value" ${id ? `id="${id}"` : ''}>${esc(value)}</span></div>`;
  }

  function commonFields(single) {
    const layer = commonText((e) => e.layer) || '';
    const memo = commonText((e) => e.memo);
    return `
      <div class="field">
        <label class="field-label" for="f-layer">레이어</label>
        <select id="f-layer" class="field-select">
          ${layer ? '' : '<option value="" selected>여러 값</option>'}
          ${App.model.LAYERS.map((l) => `<option value="${l.id}" ${l.id === layer ? 'selected' : ''}>${l.label}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field-label" for="f-memo">메모</label>
        <textarea id="f-memo" class="field-text" rows="2" ${memo === null ? 'placeholder="여러 값"' : ''}>${esc(memo || '')}</textarea>
      </div>
      ${single ? `<div class="props-meta">만든 시각 ${esc(new Date(els[0].createdAt).toLocaleString('ko-KR'))}</div>` : ''}`;
  }

  /** 이 벽을 둘러싼 방 이름들 */
  function roomsOfWall(id) {
    const names = [];
    for (const el of App.doc.all()) if (el.type === 'room' && el.wallIds.includes(id)) names.push(el.name || '이름 없음');
    return names.join(', ') || '없음';
  }

  function wallForm() {
    const single = els.length === 1;
    const total = els.reduce((sum, w) => sum + G.dist(w.start, w.end), 0);
    return `
      <div class="props-head">
        <span class="props-title">벽</span>
        <span class="props-sub" id="p-sub">${single ? '' : `${els.length}개 선택 · 총 길이 ${App.units.formatLength(total)}`}</span>
      </div>
      <div class="field-grid">
        ${single ? numberField('length') : ''}
        ${numberField('thickness')}
        ${numberField('height')}
      </div>
      ${single ? `
        <div class="field-group-label">시작점</div>
        <div class="field-grid">${numberField('sx')}${numberField('sy')}</div>
        <div class="field-group-label">끝점</div>
        <div class="field-grid">${numberField('ex')}${numberField('ey')}</div>
        ${stat('방', roomsOfWall(els[0].id), 'p-rooms')}` : ''}
      ${commonFields(single)}
      <button type="button" class="btn btn-danger" data-act="delete">${single ? '이 벽 삭제' : `${els.length}개 삭제`}</button>`;
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
    return `
      <div class="props-head">
        <span class="props-title">방</span>
        <span class="props-sub">${single ? '' : `${els.length}개 선택`}</span>
      </div>
      ${els.some((e) => e.issue) ? `<div class="notice notice-danger" id="p-issue">${esc(ISSUE_TEXT[(els.find((e) => e.issue)).issue])}</div>` : ''}
      ${single ? `
        <div class="field">
          <label class="field-label" for="f-name">이름</label>
          <div class="field-box"><input id="f-name" type="text" maxlength="${NAME_MAX}" enterkeyhint="done" autocomplete="off" value="${esc(r.name)}"></div>
        </div>` : ''}
      <div class="stats">
        ${stat(single ? '바닥 면적' : '바닥 면적 합계', App.units.formatArea(area), 'p-area')}
        ${single ? stat('둘레', App.units.formatLength(G.perimeter(r.points)), 'p-perimeter') : ''}
      </div>
      <div class="field-grid">
        ${numberField('ceilingHeight')}
        ${numberField('wallHeight')}
      </div>
      ${commonFields(single)}
      <button type="button" class="btn btn-danger" data-act="delete">${single ? '이 방 삭제' : `${els.length}개 삭제`}</button>
      <p class="props-meta">방을 지워도 벽은 남습니다.</p>`;
  }

  function mixedForm() {
    const counts = {};
    els.forEach((e) => { counts[e.type] = (counts[e.type] || 0) + 1; });
    const parts = Object.entries(counts).map(([t, n]) => `${App.model.TYPES[t].label} ${n}`).join(', ');
    return `
      <div class="props-head"><span class="props-title">${els.length}개 선택</span><span class="props-sub">${parts}</span></div>
      ${commonFields(false)}
      <button type="button" class="btn btn-danger" data-act="delete">${els.length}개 삭제</button>`;
  }

  function emptyState() {
    const tips = {
      wall: '벽 도구로 그린 뒤 ‘선택’ 도구로 벽을 누르면 길이, 두께, 높이를 여기서 고칠 수 있습니다.',
      room: '벽으로 닫힌 곳 안쪽을 누르면 방으로 등록되고 바닥 면적이 계산됩니다.',
    };
    return `
      <div class="empty">
        <div class="empty-title">선택한 항목 없음</div>
        <p>${tips[App.tools.id] || '도면에서 벽이나 방을 누르면 크기, 이름, 메모, 레이어를 여기서 고칠 수 있습니다.'}</p>
      </div>`;
  }

  function build() {
    const types = new Set(els.map((e) => e.type));
    const type = types.size === 1 ? [...types][0] : null;
    fields = (type && FIELDS[type]) || {};
    if (!els.length) pane.innerHTML = emptyState();
    else if (type === 'wall') pane.innerHTML = wallForm();
    else if (type === 'room') pane.innerHTML = roomForm();
    else pane.innerHTML = mixedForm();
  }

  /** 같은 선택이면 입력 중인 칸은 건드리지 않고 값만 새로 고침 */
  function updateValues() {
    pane.querySelectorAll('.field[data-field]').forEach((box) => {
      const input = box.querySelector('input');
      if (document.activeElement === input) return;
      const v = common(fields[box.dataset.field].get);
      input.value = v === null ? '' : App.units.inputLength(v);
    });
    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    const types = new Set(els.map((e) => e.type));
    const type = types.size === 1 ? els[0].type : null; // 여러 종류를 함께 고른 경우는 공통 칸만
    if (type === 'wall') {
      if (els.length > 1) {
        const total = els.reduce((sum, w) => sum + G.dist(w.start, w.end), 0);
        set('p-sub', `${els.length}개 선택 · 총 길이 ${App.units.formatLength(total)}`);
      } else {
        set('p-rooms', roomsOfWall(els[0].id));
      }
    }
    if (type === 'room') {
      const R = App.model.TYPES.room;
      set('p-area', App.units.formatArea(els.reduce((sum, r) => sum + R.floorArea(r), 0)));
      if (els.length === 1) set('p-perimeter', App.units.formatLength(G.perimeter(els[0].points)));
      const name = document.getElementById('f-name');
      if (name && document.activeElement !== name) name.value = els[0].name;
      // 경고가 생기거나 없어지면 다시 그림
      const hasIssue = els.some((e) => e.issue);
      if (hasIssue !== !!document.getElementById('p-issue')) build();
    }
  }

  function refresh() {
    els = App.selection.list().map((id) => App.doc.get(id)).filter(Boolean);
    const key = els.map((e) => e.id).join(',') + (els.length ? '' : `|${App.tools.id}`);
    if (key !== shownKey) {
      shownKey = key;
      build();
    } else if (els.length) {
      updateValues();
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
    const v = common(f.get);
    input.value = v === null ? '' : App.units.inputLength(v);
  }

  function init() {
    pane = document.getElementById('pane-props');

    // 입력하는 동안 바로 안내
    pane.addEventListener('input', (e) => {
      const box = e.target.closest('.field[data-field]');
      if (!box) return;
      showError(box, validate(e.target.value, fields[box.dataset.field]).error);
    });

    // 확정(엔터·칸 벗어남): 올바르면 반영, 아니면 원래 값으로 되돌리고 안내 유지
    pane.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'f-layer') {
        if (t.value) apply('레이어 변경', () => ({ layer: t.value }));
        return;
      }
      if (t.id === 'f-memo') {
        apply('메모 수정', () => ({ memo: t.value }));
        return;
      }
      if (t.id === 'f-name') {
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
      if (t.value.trim() === '' && els.length > 1) return; // '여러 값' 칸을 비운 채 두면 그대로
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
        if (box) {
          showError(box, '');
          revert(e.target, fields[box.dataset.field]);
        } else if (e.target.id === 'f-name') {
          e.target.value = els[0].name;
        }
        e.target.blur();
      }
    });

    pane.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="delete"]')) App.actions.deleteSelection();
    });

    App.selection.onChange(refresh);
    App.doc.onChange(refresh);
    App.ui.on('tool', () => queueMicrotask(refresh));
    refresh();
  }

  App.props = { init, refresh, validate, FIELDS };
})();
