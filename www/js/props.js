/* 속성 패널: 선택한 항목의 속성을 보고 고친다.
   숫자는 설정 단위로 보여 주고 mm로 저장. 잘못된 값(숫자 아님, 0 이하, 너무 큼)은 막고 안내 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const G = App.geom;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const COORD_LIMIT = 10000000; // 좌표 범위 ±10km

  /* 벽 숫자 칸. min이 0보다 크면 0 이하는 막음 */
  const WALL_FIELDS = {
    length: {
      label: '길이', min: 1, max: 1000000, single: true,
      get: (w) => G.dist(w.start, w.end),
      // 시작점은 두고 끝점을 같은 방향으로 옮김
      set: (w, v) => {
        const d = G.unit({ x: w.end.x - w.start.x, y: w.end.y - w.start.y });
        return { end: { x: w.start.x + d.x * v, y: w.start.y + d.y * v } };
      },
    },
    thickness: { label: '두께', min: 10, max: 2000, get: (w) => w.thickness, set: (w, v) => ({ thickness: v }) },
    height: { label: '높이', min: 100, max: 20000, get: (w) => w.height, set: (w, v) => ({ height: v }) },
    sx: { label: 'X', min: -COORD_LIMIT, max: COORD_LIMIT, single: true, get: (w) => w.start.x, set: (w, v) => ({ start: { x: v, y: w.start.y } }) },
    sy: { label: 'Y', min: -COORD_LIMIT, max: COORD_LIMIT, single: true, get: (w) => w.start.y, set: (w, v) => ({ start: { x: w.start.x, y: v } }) },
    ex: { label: 'X', min: -COORD_LIMIT, max: COORD_LIMIT, single: true, get: (w) => w.end.x, set: (w, v) => ({ end: { x: v, y: w.end.y } }) },
    ey: { label: 'Y', min: -COORD_LIMIT, max: COORD_LIMIT, single: true, get: (w) => w.end.y, set: (w, v) => ({ end: { x: w.end.x, y: v } }) },
  };

  let pane = null;
  let shownKey = null;
  let els = [];

  function validate(text, f) {
    const mm = App.units.parseLength(text);
    if (String(text).trim() === '' || Number.isNaN(mm)) return { error: '숫자를 입력하세요.' };
    if (f.min > 0 && mm <= 0) return { error: '0보다 큰 값을 입력하세요.' };
    if (mm < f.min) return { error: `${App.units.formatLength(f.min)} 이상으로 입력하세요.` };
    if (mm > f.max) return { error: `${App.units.formatLength(f.max)} 이하로 입력하세요.` };
    if (f.single && f === WALL_FIELDS.length && G.dist(els[0].start, els[0].end) < 0.001) {
      return { error: '길이가 0인 벽은 방향이 없어 길이를 바꿀 수 없습니다.' };
    }
    return { value: mm };
  }

  /** 여러 개 선택했을 때 값이 모두 같으면 그 값, 다르면 null */
  const common = (get) => {
    const first = get(els[0]);
    return els.every((e) => Math.abs(get(e) - first) < 0.001) ? first : null;
  };

  function numberField(key, f, readOnly) {
    const v = common(f.get);
    const value = v === null ? '' : App.units.inputLength(v);
    return `
      <div class="field" data-field="${key}">
        <label class="field-label" for="f-${key}">${f.label}</label>
        <div class="field-box">
          <input id="f-${key}" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off"
            value="${esc(value)}" ${v === null ? 'placeholder="여러 값"' : ''} ${readOnly ? 'readonly' : ''}>
          <span class="field-unit">${App.units.lengthLabel()}</span>
        </div>
        <div class="field-error" role="alert" hidden></div>
      </div>`;
  }

  function wallForm() {
    const single = els.length === 1;
    const layer = els.every((e) => e.layer === els[0].layer) ? els[0].layer : '';
    const memo = els.every((e) => e.memo === els[0].memo) ? els[0].memo : null;
    const totalLength = els.reduce((sum, w) => sum + G.dist(w.start, w.end), 0);
    return `
      <div class="props-head">
        <span class="props-title">벽</span>
        <span class="props-sub">${single ? '' : `${els.length}개 선택 · 총 길이 ${App.units.formatLength(totalLength)}`}</span>
      </div>
      <div class="field-grid">
        ${single ? numberField('length', WALL_FIELDS.length) : ''}
        ${numberField('thickness', WALL_FIELDS.thickness)}
        ${numberField('height', WALL_FIELDS.height)}
      </div>
      ${single ? `
        <div class="field-group-label">시작점</div>
        <div class="field-grid">${numberField('sx', WALL_FIELDS.sx)}${numberField('sy', WALL_FIELDS.sy)}</div>
        <div class="field-group-label">끝점</div>
        <div class="field-grid">${numberField('ex', WALL_FIELDS.ex)}${numberField('ey', WALL_FIELDS.ey)}</div>` : ''}
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
      ${single ? `<div class="props-meta">만든 시각 ${esc(new Date(els[0].createdAt).toLocaleString('ko-KR'))}</div>` : ''}
      <button type="button" class="btn btn-danger" data-act="delete">${single ? '이 벽 삭제' : `${els.length}개 삭제`}</button>`;
  }

  function emptyState() {
    const wall = App.tools.id === 'wall';
    return `
      <div class="empty">
        <div class="empty-title">선택한 항목 없음</div>
        <p>${wall
          ? '벽 도구로 그린 뒤 ‘선택’ 도구로 벽을 누르면 길이, 두께, 높이를 여기서 고칠 수 있습니다.'
          : '도면에서 벽을 누르면 길이, 두께, 높이, 메모, 레이어를 여기서 고칠 수 있습니다.'}</p>
      </div>`;
  }

  function build() {
    if (!els.length) {
      pane.innerHTML = emptyState();
      return;
    }
    if (els.every((e) => e.type === 'wall')) pane.innerHTML = wallForm();
    else pane.innerHTML = `<div class="empty"><div class="empty-title">${els.length}개 선택</div></div>`;
  }

  /** 같은 선택이면 입력 중인 칸은 건드리지 않고 값만 새로 고침 */
  function updateValues() {
    pane.querySelectorAll('.field[data-field]').forEach((box) => {
      const input = box.querySelector('input');
      if (document.activeElement === input) return;
      const f = WALL_FIELDS[box.dataset.field];
      const v = common(f.get);
      input.value = v === null ? '' : App.units.inputLength(v);
    });
    const sub = pane.querySelector('.props-sub');
    if (sub && els.length > 1) {
      const total = els.reduce((sum, w) => sum + G.dist(w.start, w.end), 0);
      sub.textContent = `${els.length}개 선택 · 총 길이 ${App.units.formatLength(total)}`;
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

  function init() {
    pane = document.getElementById('pane-props');

    // 입력하는 동안 바로 안내
    pane.addEventListener('input', (e) => {
      const box = e.target.closest('.field[data-field]');
      if (!box) return;
      const r = validate(e.target.value, WALL_FIELDS[box.dataset.field]);
      showError(box, r.error);
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
      const box = t.closest('.field[data-field]');
      if (!box) return;
      const f = WALL_FIELDS[box.dataset.field];
      if (t.value.trim() === '' && els.length > 1) return; // '여러 값' 칸을 비운 채 두면 그대로
      const r = validate(t.value, f);
      if (r.error) {
        showError(box, `${r.error} 값은 바뀌지 않았습니다.`);
        const v = common(f.get);
        t.value = v === null ? '' : App.units.inputLength(v);
        return;
      }
      showError(box, '');
      apply(`벽 ${f.label} 변경`, (el) => f.set(el, r.value));
    });

    pane.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur();
      if (e.key === 'Escape' && e.target.tagName === 'INPUT') {
        const box = e.target.closest('.field[data-field]');
        if (box) {
          showError(box, '');
          const v = common(WALL_FIELDS[box.dataset.field].get);
          e.target.value = v === null ? '' : App.units.inputLength(v);
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

  App.props = { init, refresh, validate, WALL_FIELDS };
})();
