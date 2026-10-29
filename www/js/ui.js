/* 화면 구성: 도구 바, 상단 메뉴, 속성·집계 탭, 모바일 서랍, 안내 문구 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // 도구 목록. stage: 만들 단계(아직 없는 도구 안내용)
  const TOOLS = [
    { id: 'select', label: '선택', key: 'V' },
    { sep: true },
    { id: 'wall', label: '벽', key: 'W', stage: 2 },
    { id: 'room', label: '방', key: 'R', stage: 3 },
    { id: 'door', label: '문', key: 'D', stage: 4 },
    { id: 'window', label: '창문', key: 'N', stage: 4 },
    { id: 'column', label: '기둥', key: 'C', stage: 4 },
    { sep: true },
    { id: 'elec', label: '전기', key: 'E', stage: 5 },
    { id: 'mech', label: '설비', key: 'F', stage: 5 },
    { id: 'line', label: '선', key: 'L', stage: 5 },
    { sep: true },
    { id: 'zone', label: '영역', key: 'A', stage: 5 },
    { id: 'text', label: '텍스트', key: 'T', stage: 5 },
    { id: 'dim', label: '치수', key: 'M', stage: 5 },
    { sep: true },
    { id: 'erase', label: '지우개', key: 'Del' },
  ];

  // 도구를 고를 때 보여 줄 사용법
  const USAGE = {
    wall: {
      pc: '끌거나 클릭으로 점을 이어 벽을 그립니다 · Shift: 직교 잠깐 전환 · Esc: 끝내기',
      touch: '끌어서 벽을 그리거나, 점을 차례로 눌러 이어 그립니다',
    },
    room: { pc: '벽으로 닫힌 곳 안쪽을 클릭하면 방이 됩니다', touch: '벽으로 닫힌 곳 안쪽을 누르면 방이 됩니다' },
    door: { pc: '벽 위를 클릭하면 문이 붙습니다 · 마우스가 있는 쪽으로 열림', touch: '벽 위를 누르면 문이 붙습니다 · 누른 쪽으로 열림' },
    window: { pc: '벽 위를 클릭하면 창문이 붙습니다', touch: '벽 위를 누르면 창문이 붙습니다' },
    column: { pc: '기둥을 놓을 곳을 클릭하세요', touch: '기둥을 놓을 곳을 누르세요' },
    elec: { pc: '위쪽 팔레트에서 기호를 고르고 클릭 · 콘센트·스위치는 벽 가까이면 벽면에 붙음', touch: '위쪽에서 기호를 고르고 누르세요 · 벽 가까이면 벽면에 붙음' },
    mech: { pc: '위쪽 팔레트에서 기호를 고르고 클릭 · 배관·덕트를 고르면 선 그리기', touch: '위쪽에서 기호를 고르고 누르세요 · 배관·덕트는 선 그리기' },
    line: { pc: '끌거나 클릭으로 점을 이어 그립니다 · 기구 가운데·끝점에 붙음 · Esc: 끝내기', touch: '끌거나 점을 차례로 눌러 그립니다' },
    zone: { pc: '끌면 사각형, 클릭으로 점을 찍으면 다각형 · 처음 점을 다시 누르면 닫힘', touch: '끌면 사각형, 점을 차례로 누르면 다각형' },
    text: { pc: '글자를 넣을 곳을 클릭 · Enter로 확정, Shift+Enter 줄바꿈', touch: '글자를 넣을 곳을 누르고 입력하세요' },
    dim: { pc: '잴 두 점을 차례로 클릭하거나 끌기', touch: '잴 두 점을 차례로 누르거나 끄세요' },
    erase: { pc: '지울 항목을 클릭하거나 문지르세요', touch: '지울 항목을 누르거나 문지르세요' },
  };

  const handlers = {};
  const ui = (App.ui = {
    TOOLS,
    tool: 'select',
    mobile: window.matchMedia('(max-width: 768px)'),
    on(name, fn) {
      (handlers[name] = handlers[name] || []).push(fn);
    },
    emit(name, ...args) {
      (handlers[name] || []).forEach((fn) => fn(...args));
    },
    init() {
      buildToolbar();
      bindTopbar();
      bindTabs();
      bindCanvasControls();
      bindToolOptions();
      initSheet();
    },
    setTool,
    pickTool,
    updateHistory,
    toast,
    hint,
  });

  /* ── 도구 바 ───────────────────────────── */
  function buildToolbar() {
    const bar = $('#toolbar');
    bar.innerHTML = TOOLS.map((t) =>
      t.sep
        ? '<span class="tool-sep" role="separator"></span>'
        : `<button type="button" class="tool" data-tool="${t.id}" title="${t.label} (${t.key})" aria-pressed="false">` +
          `<span class="ico" data-icon="${t.id}"></span><span class="tool-label">${t.label}</span>` +
          `<kbd class="tool-key">${t.key}</kbd></button>`
    ).join('');
    App.icons.apply(bar);
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('.tool');
      if (btn) pickTool(btn.dataset.tool);
    });
    setTool(ui.tool);
  }

  const isTouch = () => window.matchMedia('(hover: none), (pointer: coarse)').matches;

  /** 도구 버튼·단축키로 도구를 고를 때 */
  function pickTool(id) {
    const t = TOOLS.find((x) => x.id === id);
    // 지우개: 선택한 것이 있으면 바로 지우고, 없으면 지우개 모드 (스케치업과 같음)
    if (id === 'erase' && App.actions.deleteSelection()) return;
    setTool(id);
    if (USAGE[id]) hint(isTouch() ? USAGE[id].touch : USAGE[id].pc, 4000);
    else if (!App.tools.implemented(id)) hint(`‘${t.label}’ 도구는 ${t.stage}단계에서 만듭니다.`);
    else $('#toolHint').classList.remove('is-show'); // 이전 도구 안내가 남지 않게
  }

  function setTool(id) {
    ui.tool = id;
    const bar = $('#toolbar');
    bar.querySelectorAll('.tool[aria-pressed]').forEach((b) => {
      const on = b.dataset.tool === id;
      b.setAttribute('aria-pressed', String(on));
      if (on) revealInBar(bar, b);
    });
    ui.emit('tool', id);
  }

  /** 도구 바가 스크롤될 때 현재 도구가 가려지지 않게 */
  function revealInBar(bar, btn) {
    const horizontal = bar.scrollWidth > bar.clientWidth;
    const start = horizontal ? btn.offsetLeft : btn.offsetTop;
    const size = horizontal ? btn.offsetWidth : btn.offsetHeight;
    const view = horizontal ? bar.clientWidth : bar.clientHeight;
    const pos = horizontal ? bar.scrollLeft : bar.scrollTop;
    let next = pos;
    if (start < pos) next = start - 8;
    else if (start + size > pos + view) next = start + size - view + 8;
    if (next !== pos) bar.scrollTo({ [horizontal ? 'left' : 'top']: next, behavior: 'smooth' });
  }

  /* ── 상단바 ───────────────────────────── */
  function bindTopbar() {
    const btn = $('#btnFile');
    const menu = $('#fileMenu');
    const close = () => {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    };
    btn.addEventListener('click', () => {
      const open = menu.hidden;
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('pointerdown', (e) => {
      if (!menu.hidden && !e.target.closest('.menu-wrap')) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    $('#btnUndo').addEventListener('click', () => App.actions.undo());
    $('#btnRedo').addEventListener('click', () => App.actions.redo());
    $('#btnSettings').addEventListener('click', () => toast('설정 화면은 7단계에서 만듭니다.'));
    $('#btnUnits').addEventListener('click', () => toast('단위 설정은 7단계에서 만듭니다.'));
  }

  function updateHistory() {
    $('#btnUndo').disabled = !App.doc.canUndo();
    $('#btnRedo').disabled = !App.doc.canRedo();
  }

  /* ── 캔버스 위 버튼: 스냅 켜고 끄기, 그리기 끝내기 ── */
  function bindCanvasControls() {
    const bar = $('#snapbar');
    const sync = () => bar.querySelectorAll('[data-snap]').forEach((b) => {
      b.setAttribute('aria-pressed', String(!!App.settings[b.dataset.snap]));
    });
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-snap]');
      if (!b) return;
      const key = b.dataset.snap;
      App.settings[key] = !App.settings[key];
      sync();
      if (key === 'stretchWalls') {
        toast(App.settings[key] ? '벽을 옮기면 이어진 벽도 같이 늘어납니다.' : '고른 벽만 옮깁니다. 이어진 벽은 그대로 둡니다.');
      }
      App.nav.refreshTool(false);
      App.plan.requestRender();
    });
    sync();

    // 특정 도구에서만 의미 있는 버튼 (예: '늘리기'는 선택 도구에서만)
    ui.on('tool', (id) => bar.querySelectorAll('[data-only]').forEach((b) => {
      b.hidden = b.dataset.only !== id;
    }));

    $('#btnFinish').addEventListener('click', () => App.tools.finish());
    ui.on('toolstate', (tool) => {
      $('#btnFinish').hidden = !(tool && tool.isChaining && tool.isChaining());
    });
  }

  /* ── 도구 옵션: 지금 쓸 벽 종류·프리셋·색 등을 고르는 칩, 전기·설비는 기호 팔레트 ── */
  const presetOption = (label, key, kind) => ({
    label, key, edit: kind,
    list: () => App.catalog.presets(kind),
    text: (p) => p.name,
    sub: (p) => App.catalog.describePreset(p),
  });
  /** 지금 고른 전기·설비 팔레트 항목이 선(전선관·배관·덕트)이면 그 분류 */
  const paletteLine = (cat) => {
    const def = App.catalog.ITEM_KINDS[cat].find((d) => (d.kind || d.line) === App.current[`${cat}Kind`]);
    return def && def.line ? def.line : null;
  };
  function toolOption(tool) {
    switch (tool) {
      case 'wall':
        return {
          label: '벽 종류', key: 'wallTypeId', edit: 'wallType',
          list: () => App.catalog.wallTypes(),
          text: (t) => `${t.name} · ${App.units.formatLength(App.catalog.thickness(t))}`,
          sub: (t) => App.catalog.describe(t),
        };
      case 'door': return presetOption('문', 'doorPresetId', 'door');
      case 'window': return presetOption('창문', 'windowPresetId', 'window');
      case 'column': return presetOption('기둥', 'columnPresetId', 'column');
      case 'line': return { ...presetOption('선 종류', 'linePresetId', 'line'), swatch: (p) => p.color };
      case 'elec':
      case 'mech': {
        const cat = paletteLine(tool);
        if (!cat) return null;
        const o = presetOption('선 종류', 'linePresetId', 'line');
        return { ...o, swatch: (p) => p.color, list: () => App.catalog.presets('line').filter((p) => p.category === cat) };
      }
      case 'zone':
        return {
          label: '영역 색', key: 'zoneColor',
          list: () => App.catalog.COLORS.map(([id, name]) => ({ id, name })),
          text: (c) => c.name, sub: () => '', swatch: (c) => c.id,
        };
      case 'text':
        return {
          label: '글자 크기', key: 'textSize',
          list: () => ['100', '150', '200', '300', '500'].map((id) => ({ id, name: `${id} mm` })),
          text: (c) => c.name, sub: () => '',
        };
      default: return null;
    }
  }

  const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const swatchHtml = (color) => (color ? `<span class="swatch" style="background:${escHtml(color)}"></span>` : '');

  function updateToolOption() {
    renderPalette();
    const o = toolOption(ui.tool);
    const btn = $('#toolOpt');
    btn.hidden = !o;
    if (!o) {
      closeToolMenu();
      return;
    }
    App.catalog.ensureCurrent();
    const cur = o.list().find((it) => it.id === App.current[o.key]) || o.list()[0];
    if (cur && cur.id !== App.current[o.key]) App.current[o.key] = cur.id; // 팔레트 분류가 바뀌면 그 분류의 첫 선 종류로
    $('#toolOptLabel').textContent = o.label;
    $('#toolOptValue').innerHTML = cur ? `${swatchHtml(o.swatch && o.swatch(cur))}${escHtml(o.text(cur))}` : '목록이 비었습니다';
    if (!$('#toolOptMenu').hidden) renderToolMenu();
  }

  function renderToolMenu() {
    const o = toolOption(ui.tool);
    if (!o) return;
    $('#toolOptMenu').innerHTML = `
      ${o.list().map((item) => `
        <button type="button" class="menu-item opt-item" role="menuitemradio" aria-checked="${item.id === App.current[o.key]}" data-id="${escHtml(item.id)}">
          <span class="opt-text"><b>${swatchHtml(o.swatch && o.swatch(item))}${escHtml(item.name)}</b>${o.sub(item) ? `<small>${escHtml(o.sub(item))}</small>` : ''}</span>
        </button>`).join('')}
      ${o.edit ? '<div class="menu-sep" role="separator"></div><button type="button" class="menu-item" role="menuitem" data-act="edit">목록 편집…</button>' : ''}`;
  }

  /** 전기·설비 기호 팔레트 */
  function renderPalette() {
    const pal = $('#palette');
    const cat = ui.tool === 'elec' || ui.tool === 'mech' ? ui.tool : null;
    pal.hidden = !cat;
    if (!cat) return;
    const current = App.current[`${cat}Kind`];
    pal.innerHTML = App.catalog.ITEM_KINDS[cat].map((d) => {
      const name = d.kind || d.line;
      const icon = d.kind ? App.draw.itemIcon(d.kind) : App.draw.lineIcon(d.line);
      return `<button type="button" class="pal-btn" data-kind="${escHtml(name)}" aria-pressed="${name === current}" title="${escHtml(name)}${d.line ? ' (선 그리기)' : ''}">
        <span class="ico" style="--ico:url('${icon}')"></span><span>${escHtml(name)}</span></button>`;
    }).join('');
  }

  function closeToolMenu() {
    $('#toolOptMenu').hidden = true;
    $('#toolOpt').setAttribute('aria-expanded', 'false');
  }

  function bindToolOptions() {
    const btn = $('#toolOpt');
    const menu = $('#toolOptMenu');
    btn.addEventListener('click', () => {
      if (!menu.hidden) return closeToolMenu();
      renderToolMenu();
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    });
    $('#palette').addEventListener('click', (e) => {
      const b = e.target.closest('[data-kind]');
      if (!b) return;
      App.current[`${ui.tool}Kind`] = b.dataset.kind;
      setTool(ui.tool); // 기호 놓기 ↔ 선 그리기 바꿈
      const line = paletteLine(ui.tool);
      hint(line ? `${line}: 끌거나 점을 차례로 눌러 그립니다` : `${b.dataset.kind}: 놓을 곳을 누르세요`);
    });
    menu.addEventListener('click', (e) => {
      const o = toolOption(ui.tool);
      const item = e.target.closest('[data-id]');
      if (item) {
        App.current[o.key] = item.dataset.id;
        closeToolMenu();
        updateToolOption();
        App.nav.refreshTool(false);
        App.plan.requestRender();
      } else if (e.target.closest('[data-act="edit"]')) {
        closeToolMenu();
        App.catalogUI.open(o.edit, App.current[o.key]);
      }
    });
    document.addEventListener('pointerdown', (e) => {
      if (!menu.hidden && !e.target.closest('.tool-opt-wrap')) closeToolMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeToolMenu();
    });
    ui.on('tool', updateToolOption);
    App.doc.onChange(updateToolOption);

    // 캔버스 위쪽 버튼 묶음 높이: 안내 문구와 '화면 맞춤'이 그 아래를 쓰도록
    const top = $('#stageTop');
    const setTop = () => $('#stage').style.setProperty('--stage-top-h', `${top.offsetHeight}px`);
    if ('ResizeObserver' in window) new ResizeObserver(setTop).observe(top);
    setTop();
  }

  /* ── 속성·집계 탭 ─────────────────────── */
  function bindTabs() {
    const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
    tabs.forEach((tab) =>
      tab.addEventListener('click', () => {
        if (performance.now() < sheet.suppressClickUntil) return;
        const wasSelected = tab.getAttribute('aria-selected') === 'true';
        tabs.forEach((t) => {
          const on = t === tab;
          t.setAttribute('aria-selected', String(on));
          document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
        });
        ui.emit('tab', tab.id);
        if (ui.mobile.matches) {
          if (!sheet.isOpen()) sheet.open();
          else if (wasSelected) sheet.collapse(); // 열린 상태에서 같은 탭을 다시 누르면 접기
        }
      })
    );
  }

  /* ── 모바일 서랍 ──────────────────────── */
  const sheet = {
    h: 0,
    lastOpen: 0,
    suppressClickUntil: 0,
    peek() {
      return $('#sheetHead').offsetHeight + 1; // 손잡이와 탭만 보이는 높이
    },
    max() {
      const top = $('.topbar').getBoundingClientRect().bottom;
      const bottom = $('#toolbar').getBoundingClientRect().top;
      return Math.max(this.peek(), bottom - top - 12);
    },
    set(h) {
      this.h = clamp(h, this.peek(), this.max());
      $('#app').style.setProperty('--sheet-h', this.h + 'px');
      ui.emit('sheet', this.h);
    },
    isOpen() {
      return this.h > this.peek() + 1;
    },
    open() {
      this.set(this.lastOpen || this.max() * 0.5);
    },
    collapse() {
      if (this.isOpen()) this.lastOpen = this.h;
      this.set(this.peek());
    },
  };
  ui.sheet = sheet;

  function initSheet() {
    const head = $('#sheetHead');
    const panel = $('#panel');
    let drag = null;

    head.addEventListener('pointerdown', (e) => {
      if (!ui.mobile.matches || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = { id: e.pointerId, y: e.clientY, h: sheet.h, moved: false };
    });
    head.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = drag.y - e.clientY;
      if (!drag.moved) {
        if (Math.abs(dy) < 6) return;
        drag.moved = true;
        try { head.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
        panel.classList.add('is-dragging');
      }
      sheet.set(drag.h + dy);
    });
    // 빠르게 튕겨 올린 뒤 바로 누른 버튼이 무시되지 않게 브라우저 자체 제스처(관성 스크롤)를 막음
    head.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) {
        panel.classList.remove('is-dragging');
        sheet.suppressClickUntil = performance.now() + 100; // 끌기 끝에 탭이 눌리지 않게
        if (sheet.h < sheet.peek() + 48) sheet.set(sheet.peek());
        else sheet.lastOpen = sheet.h;
      } else if (!e.target.closest('[role="tab"]')) {
        sheet.isOpen() ? sheet.collapse() : sheet.open(); // 손잡이를 톡 치면 열고 닫기
      }
      drag = null;
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);

    const applyLayout = () => {
      if (ui.mobile.matches) {
        sheet.set(sheet.h || sheet.peek());
      } else {
        $('#app').style.removeProperty('--sheet-h');
        sheet.h = 0;
        ui.emit('sheet', 0);
      }
      ui.emit('layout', ui.mobile.matches);
      const active = $(`.tool[data-tool="${ui.tool}"]`);
      if (active) revealInBar($('#toolbar'), active);
    };
    ui.mobile.addEventListener('change', applyLayout);
    window.addEventListener('resize', () => {
      if (ui.mobile.matches) sheet.set(sheet.h); // 화면 회전 등으로 최대 높이가 바뀔 때
    });
    applyLayout();
  }

  /* ── 안내 문구 ────────────────────────── */
  let toastTimer = 0;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-show'), 2200);
  }

  let hintTimer = 0;
  function hint(msg, ms = 2600) {
    const el = $('#toolHint');
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => el.classList.remove('is-show'), ms);
  }
})();
