/* 목록 편집 창: 벽 종류(틀·석고 구성)와 문·창문·기둥 프리셋을 추가·수정·복제·삭제.
   고친 내용은 바로 도면에 반영되고 실행 취소할 수 있다 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NAME_MAX = 40;

  const FRAME_OPTIONS = [['wood', '다루끼 (목재)'], ['metal', '경량 스터드'], ['none', '없음']];

  /* 칸 정의. group이 바뀌는 곳에 소제목. show(항목)이 false면 숨김 */
  const hasFrame = (t) => t.frameKind !== 'none';
  const hasBoard = (t) => t.boardFace + t.boardBack > 0;
  const SPECS = {
    wallType: {
      tab: '벽 종류',
      addLabel: '벽 종류',
      fields: [
        { key: 'name', label: '이름', kind: 'text', group: '기본' },
        { key: 'frameKind', label: '틀 종류', kind: 'select', options: () => FRAME_OPTIONS, group: '틀',
          note: '틀 깊이는 벽 두께 방향 치수. 가로재 간격이 0이면 위·아래 한 줄씩만 셉니다.' },
        { key: 'frameDepth', label: '틀 깊이', kind: 'mm', min: 1, max: 300, show: hasFrame },
        { key: 'frameSpacing', label: '세로재 간격', kind: 'mm', min: 100, max: 1200, show: hasFrame },
        { key: 'frameRowSpacing', label: '가로재 간격', kind: 'mm', min: 0, max: 5000, show: hasFrame },
        { key: 'framePiece', label: '1본 길이', kind: 'mm', min: 300, max: 12000, show: hasFrame },
        { key: 'frameLoss', label: '틀 로스', kind: 'pct', show: hasFrame },
        { key: 'base', label: '두께', kind: 'mm', min: 0, max: 2000, group: '기존 벽 (콘크리트·조적)', note: '0이면 기존 벽 없이 새로 세우는 벽입니다.' },
        { key: 'boardFace', label: '마감 쪽 겹 수', kind: 'int', min: 0, max: 4, group: '석고보드',
          note: '틀이 붙는 쪽이 마감 쪽입니다. 벽마다 ‘마감 면 뒤집기’로 바꿀 수 있습니다.' },
        { key: 'boardBack', label: '반대쪽 겹 수', kind: 'int', min: 0, max: 4 },
        { key: 'boardT', label: '두께', kind: 'mm', min: 1, max: 50, show: hasBoard },
        { key: 'boardW', label: '폭', kind: 'mm', min: 100, max: 3000, show: hasBoard },
        { key: 'boardL', label: '길이', kind: 'mm', min: 100, max: 6000, show: hasBoard },
        { key: 'boardLoss', label: '석고 로스', kind: 'pct', show: hasBoard },
      ],
      list: () => App.catalog.wallTypes(),
      describe: (t) => App.catalog.describe(t),
      usage: (t) => { const n = App.catalog.usage(t.id); return n ? `벽 ${n}개` : ''; },
      blank: () => ({
        name: '새 벽 종류', base: 0, frameKind: 'wood', frameDepth: 30, frameSpacing: 450, frameRowSpacing: 900, framePiece: 3600,
        boardT: 9.5, boardW: 900, boardL: 1800, boardFace: 1, boardBack: 1, frameLoss: 0, boardLoss: 0,
      }),
    },
    door: {
      tab: '문',
      addLabel: '문 프리셋',
      fields: [
        { key: 'name', label: '이름', kind: 'text' },
        { key: 'style', label: '종류', kind: 'select', options: () => App.model.TYPES.door.KINDS.map((k) => [k, k]) },
        { key: 'width', label: '폭', kind: 'mm', min: 300, max: 6000 },
        { key: 'height', label: '높이', kind: 'mm', min: 500, max: 6000 },
      ],
      list: () => App.catalog.presets('door'),
      describe: (p) => App.catalog.describePreset(p),
      usage: () => '',
      blank: () => ({ name: '새 문', style: '여닫이', width: 900, height: 2100 }),
    },
    window: {
      tab: '창문',
      addLabel: '창문 프리셋',
      fields: [
        { key: 'name', label: '이름', kind: 'text' },
        { key: 'style', label: '종류', kind: 'select', options: () => App.model.TYPES.window.KINDS.map((k) => [k, k]) },
        { key: 'width', label: '폭', kind: 'mm', min: 100, max: 10000 },
        { key: 'height', label: '높이', kind: 'mm', min: 100, max: 6000 },
        { key: 'sill', label: '하단 높이', kind: 'mm', min: 0, max: 6000 },
      ],
      list: () => App.catalog.presets('window'),
      describe: (p) => App.catalog.describePreset(p),
      usage: () => '',
      blank: () => ({ name: '새 창문', style: '미서기', width: 1200, height: 1200, sill: 900 }),
    },
    column: {
      tab: '기둥',
      addLabel: '기둥 프리셋',
      fields: [
        { key: 'name', label: '이름', kind: 'text' },
        { key: 'shape', label: '모양', kind: 'select', options: () => Object.entries(App.catalog.SHAPE_NAMES) },
        { key: 'width', label: '폭·지름', kind: 'mm', min: 50, max: 5000 },
        { key: 'depth', label: '깊이', kind: 'mm', min: 50, max: 5000, show: (p) => p.shape !== 'circle' },
      ],
      list: () => App.catalog.presets('column'),
      describe: (p) => App.catalog.describePreset(p),
      usage: () => '',
      blank: () => ({ name: '새 기둥', shape: 'rect', width: 400, depth: 400 }),
    },
    line: {
      tab: '선',
      addLabel: '선 종류',
      fields: [
        { key: 'name', label: '이름', kind: 'text', note: '전선관은 점선, 배관은 실선, 덕트는 지름·폭만큼 굵게 그립니다. 집계는 이름별로 나뉩니다.' },
        { key: 'category', label: '분류', kind: 'select', options: () => App.catalog.LINE_CATEGORIES.map((c) => [c, c]) },
        { key: 'color', label: '색', kind: 'select', options: () => App.catalog.COLORS },
        { key: 'size', label: '지름·폭', kind: 'mm', min: 1, max: 3000 },
        { key: 'runHeight', label: '높이 (비우면 천장)', kind: 'mm', min: 0, max: 20000, allowEmpty: true, emptyText: '천장', group: '배관 높이',
          note: '선이 지나가는 높이입니다. 선 끝이 콘센트·스위치 같은 기구에 붙으면 이 높이와 기구 설치 높이의 차이만큼 수직 길이를 자동으로 더합니다. 바닥 배관은 0, 천장 속은 비워 두세요.' },
      ],
      list: () => App.catalog.presets('line'),
      describe: (p) => App.catalog.describePreset(p),
      usage: (p) => {
        let n = 0;
        for (const el of App.doc.all()) if (el.type === 'line' && el.presetId === p.id) n++;
        return n ? `선 ${n}개` : '';
      },
      blank: () => ({ name: '새 선 종류', category: '배관', color: '#1c7ed6', size: 20, runHeight: 0 }),
    },
  };

  // 바꾸면 보이는 칸이 달라지는 값: 이 값이 바뀔 때만 항목을 다시 그림
  const STRUCTURAL = new Set(['frameKind', 'boardFace', 'boardBack', 'shape']);

  let kind = 'wallType';
  const openIds = new Set();
  let modal, body;
  let ownVersion = -1; // 이 창에서 고친 직후의 도면 버전 (그 알림으로는 목록 전체를 다시 그리지 않음)

  function validate(f, text) {
    if (f.kind === 'text') {
      const v = text.trim();
      if (!v) return { error: '이름을 입력하세요.' };
      return { value: v.slice(0, NAME_MAX) };
    }
    if (f.kind === 'select') return { value: text };
    const s = String(text).replace(/[,\s]/g, '');
    if (f.allowEmpty && s === '') return { value: null };
    if (f.kind === 'int') {
      if (!/^\d+$/.test(s)) return { error: '0 이상의 정수를 입력하세요.' };
      const v = Number(s);
      if (v < f.min || v > f.max) return { error: `${f.min}~${f.max} 사이로 입력하세요.` };
      return { value: v };
    }
    if (f.kind === 'pct') {
      if (!/^\d+(\.\d+)?$/.test(s)) return { error: '0 이상의 숫자를 입력하세요. (예: 5)' };
      const v = Number(s);
      if (v > 100) return { error: '100% 이하로 입력하세요.' };
      return { value: v };
    }
    const mm = App.units.parseLength(text);
    if (Number.isNaN(mm)) return { error: '숫자를 입력하세요.' };
    if (f.min > 0 && mm <= 0) return { error: '0보다 큰 값을 입력하세요.' };
    if (mm < f.min) return { error: `${App.units.formatLength(f.min)} 이상으로 입력하세요.` };
    if (mm > f.max) return { error: `${App.units.formatLength(f.max)} 이하로 입력하세요.` };
    return { value: mm };
  }

  function fieldHtml(item, f) {
    const id = `c-${item.id}-${f.key}`;
    const v = item[f.key];
    let control;
    if (f.kind === 'select') {
      control = `<select id="${id}" class="field-select" data-key="${f.key}">${f.options().map(([val, text]) =>
        `<option value="${esc(val)}" ${val === v ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select>`;
    } else {
      const unit = f.kind === 'mm' ? App.units.lengthLabel() : f.kind === 'pct' ? '%' : f.kind === 'int' ? '겹' : '';
      const value = v == null ? '' : f.kind === 'mm' ? App.units.inputLength(v) : v;
      control = `<div class="field-box"><input id="${id}" data-key="${f.key}" type="text" autocomplete="off" enterkeyhint="done"
        ${f.kind === 'text' ? `maxlength="${NAME_MAX}"` : 'inputmode="decimal"'} value="${esc(value)}" ${f.emptyText ? `placeholder="${f.emptyText}"` : ''}>${unit ? `<span class="field-unit">${unit}</span>` : ''}</div>`;
    }
    return `<div class="field${f.kind === 'text' ? ' field-wide' : ''}"><label class="field-label" for="${id}">${f.label}</label>${control}
      <div class="field-error" role="alert" hidden></div></div>`;
  }

  function formHtml(item) {
    const spec = SPECS[kind];
    let html = '';
    let group = null;
    spec.fields.forEach((f) => {
      if (f.group && f.group !== group) {
        if (group !== null) html += '</div>';
        group = f.group;
        html += `<div class="field-group-label">${f.group}</div>${f.note ? `<p class="props-meta">${f.note}</p>` : ''}<div class="field-grid">`;
      } else if (group === null) {
        group = '';
        html += `${f.note ? `<p class="props-meta">${f.note}</p>` : ''}<div class="field-grid">`;
      }
      if (!f.show || f.show(item)) html += fieldHtml(item, f);
    });
    html += '</div>';
    if (kind === 'wallType') html += `<div class="stats"><div class="stat"><span class="stat-label">전체 두께</span><span class="stat-value" data-thickness>${App.units.formatLength(App.catalog.thickness(item))}</span></div></div>`;
    return html;
  }

  function descHtml(item) {
    const spec = SPECS[kind];
    const usage = spec.usage(item);
    return `${esc(spec.describe(item))}${usage ? ` · <b>${esc(usage)}</b>` : ''}`;
  }

  function cardHtml(item) {
    return `
      <details class="cat-item" data-id="${item.id}" ${openIds.has(item.id) ? 'open' : ''}>
        <summary>
          <span class="cat-name">${esc(item.name)}</span>
          <span class="cat-desc">${descHtml(item)}</span>
        </summary>
        <div class="cat-form">${formHtml(item)}</div>
        <div class="btn-row">
          <button type="button" class="btn" data-act="dup">복제</button>
          <button type="button" class="btn btn-danger" data-act="del">삭제</button>
        </div>
      </details>`;
  }

  function render() {
    const spec = SPECS[kind];
    document.querySelectorAll('#catalogTabs [role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.kind === kind)));
    const items = spec.list();
    body.innerHTML = `
      ${kind === 'wallType' ? '<p class="props-meta">벽 종류를 고치면 그 종류로 그린 벽의 두께와 자재 물량이 모두 함께 바뀝니다. 로스는 현장 기준이 정해지면 넣으세요.</p>' : ''}
      ${items.map(cardHtml).join('') || '<p class="props-meta">목록이 비었습니다.</p>'}
      <button type="button" class="btn btn-add" data-act="add">+ ${spec.addLabel} 추가</button>`;
  }

  /** 입력칸은 그대로 두고 제목·설명·두께만 고침 */
  function updateSummary(card, item) {
    card.querySelector('.cat-name').textContent = item.name;
    card.querySelector('.cat-desc').innerHTML = descHtml(item);
    const th = card.querySelector('[data-thickness]');
    if (th) th.textContent = App.units.formatLength(App.catalog.thickness(item));
  }

  /** 이 창에서 고친 것 (도면 변경 알림이 와도 목록 전체를 다시 그리지 않음) */
  function edit(label, fn) {
    App.doc.transact(label, fn);
    ownVersion = App.doc.version;
  }

  /** 한 항목만 다시 그림. 글자를 치던 칸이 있으면 그 칸으로 돌아감 */
  function rerenderCard(id) {
    const card = body.querySelector(`.cat-item[data-id="${id}"]`);
    const item = App.doc.get(id);
    if (!card || !item) return render();
    const focusId = document.activeElement && document.activeElement.id;
    card.outerHTML = cardHtml(item);
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) el.focus();
    }
  }

  function create(params) {
    const T = App.model.TYPES;
    return kind === 'wallType' ? T.wallType.create(params) : T.preset.create(kind, params);
  }
  const copyParams = (item) => {
    const p = App.model.clone(item);
    ['id', 'type', 'layer', 'room', 'memo', 'createdAt', 'kind'].forEach((k) => delete p[k]);
    return p;
  };

  function onAction(act, card) {
    const id = card && card.dataset.id;
    const item = id && App.doc.get(id);
    if (act === 'add' || act === 'dup') {
      const params = act === 'add' ? SPECS[kind].blank() : { ...copyParams(item), name: `${item.name} 사본`.slice(0, NAME_MAX) };
      const el = create(params);
      edit(`${SPECS[kind].addLabel} 추가`, () => App.doc.add(el));
      openIds.add(el.id);
      render();
      const added = body.querySelector(`.cat-item[data-id="${el.id}"]`);
      if (added) added.scrollIntoView({ block: 'nearest' });
    } else if (act === 'del') {
      if (kind === 'line') {
        const used = SPECS.line.usage(item);
        if (used) return App.ui.toast(`이 선 종류로 그린 ${used}가 있어 지울 수 없습니다. 선을 다른 종류로 바꾼 뒤 지우세요.`);
      }
      if (kind === 'wallType') {
        const n = App.catalog.usage(id);
        if (n) return App.ui.toast(`이 벽 종류로 그린 벽이 ${n}개 있어 지울 수 없습니다. 벽을 다른 종류로 바꾼 뒤 지우세요.`);
        if (App.catalog.wallTypes().length <= 1) return App.ui.toast('벽 종류는 하나 이상 있어야 합니다.');
      }
      edit(`${SPECS[kind].addLabel} 삭제`, () => App.doc.remove(id));
      App.ui.toast(`‘${item.name}’을 지웠습니다. 실행 취소로 되돌릴 수 있습니다.`);
      render();
    }
    App.catalog.ensureCurrent();
  }

  function init() {
    modal = $('#catalogModal');
    body = $('#catalogBody');

    $('#catalogTabs').addEventListener('click', (e) => {
      const tab = e.target.closest('[role="tab"]');
      if (!tab) return;
      kind = tab.dataset.kind;
      render();
    });
    $('#catalogClose').addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close(); // 바깥(어두운 곳)을 누르면 닫기
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) {
        e.stopPropagation();
        close();
      }
    }, true);

    body.addEventListener('toggle', (e) => {
      const card = e.target.closest && e.target.closest('.cat-item');
      if (!card) return;
      if (card.open) openIds.add(card.dataset.id);
      else openIds.delete(card.dataset.id);
    }, true);

    body.addEventListener('input', (e) => {
      const key = e.target.dataset.key;
      if (!key || e.target.tagName === 'SELECT') return;
      const f = SPECS[kind].fields.find((x) => x.key === key);
      const err = e.target.closest('.field').querySelector('.field-error');
      const r = validate(f, e.target.value);
      err.textContent = r.error || '';
      err.hidden = !r.error;
    });

    body.addEventListener('change', (e) => {
      const key = e.target.dataset.key;
      if (!key) return;
      const card = e.target.closest('.cat-item');
      const item = App.doc.get(card.dataset.id);
      const f = SPECS[kind].fields.find((x) => x.key === key);
      const r = validate(f, e.target.value);
      const err = e.target.closest('.field').querySelector('.field-error');
      if (r.error) {
        err.textContent = `${r.error} 값은 바뀌지 않았습니다.`;
        err.hidden = false;
        e.target.value = item[key] == null ? '' : f.kind === 'mm' ? App.units.inputLength(item[key]) : item[key];
        return;
      }
      err.hidden = true;
      if (r.value === item[key]) return;
      const patch = { [key]: r.value };
      // 원형 기둥은 깊이 = 지름
      if (kind === 'column' && (key === 'shape' || key === 'width') && (key === 'shape' ? r.value : item.shape) === 'circle') {
        patch.depth = key === 'width' ? r.value : item.width;
      }
      const oldRun = item.runHeight ?? null; // update가 item을 바로 고치므로 미리 기억
      edit(`${SPECS[kind].addLabel} 수정`, () => {
        App.doc.update(item.id, patch);
        // 배관 높이: 이 종류로 그린 선 중 따로 고치지 않은(옛 값 그대로인) 선도 함께
        if (kind === 'line' && key === 'runHeight') {
          for (const el of App.doc.all()) {
            if (el.type === 'line' && el.presetId === item.id && (el.runHeight ?? null) === oldRun) App.doc.update(el.id, { runHeight: r.value });
          }
        }
      });
      if (STRUCTURAL.has(key)) rerenderCard(item.id);
      else updateSummary(card, App.doc.get(item.id));
    });

    body.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur();
    });

    body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (btn) onAction(btn.dataset.act, btn.closest('.cat-item'));
    });

    // 실행 취소 등 이 창 밖에서 목록이 바뀌면 다시 그림 (글자를 치는 중이면 그대로)
    App.doc.onChange(() => {
      if (modal.hidden || App.doc.version === ownVersion) return;
      const typing = body.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
      if (!typing) render();
    });
  }

  function open(which, focusId) {
    kind = which || kind;
    if (focusId) openIds.add(focusId);
    render();
    modal.hidden = false;
    const card = focusId && body.querySelector(`.cat-item[data-id="${focusId}"]`);
    if (card) card.scrollIntoView({ block: 'nearest' });
    else $('#catalogClose').focus();
  }

  function close() {
    if (document.activeElement && body.contains(document.activeElement)) document.activeElement.blur(); // 치던 값 확정
    modal.hidden = true;
  }

  App.catalogUI = { init, open, close, SPECS };
})();
