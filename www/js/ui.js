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
    { id: 'furn', label: '가구', key: 'U', stage: 5 },
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
    furn: { pc: '위쪽에서 가구를 고르고 클릭 · 벽 가까이 놓으면 등을 벽에 대고 붙음', touch: '위쪽에서 가구를 고르고 누르세요 · 벽 가까이면 등을 벽에 대고 붙음' },
    line: { pc: '끌거나 클릭으로 점을 이어 그립니다 · 기구 가운데·끝점에 붙음 · Esc: 끝내기', touch: '끌거나 점을 차례로 눌러 그립니다' },
    zone: { pc: '끌면 사각형, 클릭으로 점을 찍으면 다각형 · 처음 점을 다시 누르면 닫힘', touch: '끌면 사각형, 점을 차례로 누르면 다각형' },
    text: { pc: '글자를 넣을 곳을 클릭 · Enter로 확정, Shift+Enter 줄바꿈', touch: '글자를 넣을 곳을 누르고 입력하세요' },
    get dim() { return DIM_USAGE[App.current.dimMode] || DIM_USAGE.clear; },
    erase: { pc: '지울 항목을 클릭하거나 문지르세요', touch: '지울 항목을 누르거나 문지르세요' },
  };

  // 치수 도구 방식별 사용법 (위쪽 칩에서 고름)
  const DIM_USAGE = {
    clear: { pc: '안목: 방 안을 클릭하면 가로·세로, 벽을 클릭하면 그 면 길이 · 끌면 두 점', touch: '안목: 방 안을 누르면 가로·세로, 벽을 누르면 그 면 길이' },
    center: { pc: '벽 중심: 벽을 클릭하면 이어진 벽 중심까지 · 끌면 두 점', touch: '벽 중심: 벽을 누르면 이어진 벽 중심까지' },
    free: { pc: '잴 두 점을 차례로 클릭하거나 끌기', touch: '잴 두 점을 차례로 누르거나 끄세요' },
  };
  const DIM_MODES = [
    { id: 'clear', name: '안목 (면에서 면까지)', sub: '방 안을 누르면 가로·세로, 벽을 누르면 그 면 길이' },
    { id: 'center', name: '벽 중심', sub: '벽을 누르면 이어진 벽 중심까지 길이' },
    { id: 'free', name: '두 점 직접', sub: '잴 두 점을 차례로 누르기' },
  ];

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
      bindDialog();
      bindBack();
      bindPicked();
    },
    setTool,
    pickTool,
    updateHistory,
    toast,
    hint,
    dialog,
    busy,
    openLength,
    closeTop,
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
    // 메뉴 항목: 누르면 메뉴를 닫고 실행
    const item = (sel, fn) => $(sel).addEventListener('click', () => {
      close();
      fn();
    });
    item('#menuCsv', () => App.summary.exportCsv());
    item('#menuPng', () => App.exporter.exportPng());
    item('#menuPdf', () => App.exporter.pdfDialog());
    $('#btnUndo').addEventListener('click', () => App.actions.undo());
    $('#btnRedo').addEventListener('click', () => App.actions.redo());
    $('#btnSettings').addEventListener('click', () => App.settingsUI.open());
    $('#btnUnits').addEventListener('click', () => App.settingsUI.open('units'));
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
      App.saveSettings();
      sync();
      if (key === 'stretchWalls') {
        toast(App.settings[key] ? '벽을 옮기면 이어진 벽도 같이 늘어납니다.' : '고른 벽만 옮깁니다. 이어진 벽은 그대로 둡니다.');
      }
      App.nav.refreshTool(false);
      App.plan.requestRender();
    });
    sync();
    ui.on('settings', sync); // 설정 화면에서 바꾼 것도 반영

    // 특정 도구에서만 의미 있는 버튼 (예: '늘리기'는 선택 도구에서만)
    ui.on('tool', (id) => bar.querySelectorAll('[data-only]').forEach((b) => {
      b.hidden = b.dataset.only !== id;
    }));

    $('#btnFinish').addEventListener('click', () => App.tools.finish());
    ui.on('toolstate', (tool) => {
      const chaining = !!(tool && tool.isChaining && tool.isChaining());
      $('#btnFinish').hidden = !chaining;
      $('#btnLength').hidden = !chaining;
      if (!chaining) closeLength();
    });
    bindLength();
  }

  /* ── 길이를 숫자로 넣기 (벽·선·치수 이어 그리기 중) ──
     휴대폰: 숫자를 넣고 화살표로 방향. PC: 숫자 키를 누르면 바로 열리고 Enter는 커서 쪽 */
  const DIRS = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
  const chainTool = () => {
    const t = App.tools.current;
    return t && t.isChaining && t.isChaining() ? t : null;
  };
  function openLength(prefill = '') {
    if (!chainTool()) return false;
    $('#lenUnit').textContent = App.units.lengthLabel();
    const input = $('#lenInput');
    $('#lenBox').hidden = false;
    input.value = prefill;
    input.focus();
    input.setSelectionRange(prefill.length, prefill.length);
    return true;
  }
  function closeLength() {
    const box = $('#lenBox');
    if (box.hidden) return false;
    box.hidden = true;
    if (document.activeElement === $('#lenInput')) $('#lenInput').blur();
    return true;
  }
  function applyLength(dir) {
    const t = chainTool();
    if (!t) return closeLength();
    const input = $('#lenInput');
    const mm = App.units.parseLength(input.value);
    if (!(mm > 0) || mm > 1000000) {
      toast('길이를 숫자로 넣으세요. (0보다 크게)');
      input.focus();
      return false;
    }
    const d = dir || t.currentDir();
    if (!d) {
      toast('처음 선분은 방향 화살표를 눌러 정하세요.');
      return false;
    }
    t.addLength(mm, d);
    input.value = '';
    if (chainTool()) input.focus();
    else closeLength();
    return true;
  }
  function bindLength() {
    $('#btnLength').addEventListener('click', () => openLength());
    $('#lenClose').addEventListener('click', closeLength);
    const box = $('#lenBox');
    // 화살표를 눌러도 입력 칸에서 포커스가 빠지지 않게 (휴대폰 자판이 내려갔다 올라오지 않음)
    box.addEventListener('pointerdown', (e) => { if (e.target.closest('[data-dir]')) e.preventDefault(); });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dir]');
      if (b) applyLength(DIRS[b.dataset.dir]);
    });
    $('#lenInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyLength(null);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeLength();
      }
    });
  }

  /* ── 안드로이드 뒤로 버튼: 앱을 바로 닫지 않고 열린 것부터 하나씩 닫음 ── */
  function closeTop() {
    if (!$('#busy').hidden) return true; // 읽는 중: 기다림
    if (!$('#dialog').hidden && dialogDone) {
      dialogDone('cancel');
      return true;
    }
    if (App.view3d && App.view3d.close()) return true;
    if (!$('#settingsModal').hidden) {
      App.settingsUI.close();
      return true;
    }
    if (!$('#catalogModal').hidden) {
      App.catalogUI.close();
      return true;
    }
    if (closeLength()) return true;
    const menu = document.querySelector('.menu:not([hidden])');
    if (menu) {
      menu.hidden = true;
      return true;
    }
    if (App.tools.escape()) return true; // 그리던 것 끝내기, 선택 풀기
    if (ui.mobile.matches && sheet.isOpen()) {
      sheet.collapse();
      return true;
    }
    if (ui.tool !== 'select') {
      setTool('select');
      return true;
    }
    return false;
  }
  function bindBack() {
    let armed = false;
    // 안드로이드 앱(Capacitor): 뒤로 버튼은 App 플러그인이 알려 줌 (없으면 바로 앱이 닫힘)
    const C = window.Capacitor;
    const CapApp = C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.App;
    if (CapApp) {
      CapApp.addListener('backButton', () => {
        if (closeTop()) {
          armed = false;
          return;
        }
        if (!armed) {
          armed = true;
          toast('한 번 더 누르면 앱을 닫습니다. 도면은 저장되어 있습니다.');
          setTimeout(() => { armed = false; }, 2500);
          return;
        }
        if (App.projects) App.projects.flush();
        CapApp.exitApp();
      });
      return;
    }
    // 웹·홈 화면 앱: 방문 기록 한 칸을 끼워 두고 뒤로 가기를 가로챔
    if (!window.history || !history.pushState) return;
    const guard = () => history.pushState({ hjdm: 'guard' }, '');
    history.replaceState({ hjdm: 'base' }, '');
    guard();
    window.addEventListener('popstate', () => {
      if (closeTop()) {
        armed = false;
        guard();
        return;
      }
      if (!armed) {
        armed = true;
        toast('한 번 더 뒤로 가면 앱을 닫습니다. 도면은 저장되어 있습니다.');
        guard();
        setTimeout(() => { armed = false; }, 2500);
        return;
      }
      history.back(); // 정말 나감
    });
  }

  /** 휴대폰에서 선택 도구로 누른 것: 서랍을 올려 속성을 보여 주고, 빈 곳을 누르면 다시 내림 */
  function bindPicked() {
    let auto = false;
    ui.on('picked', (hit) => {
      if (!ui.mobile.matches) return;
      if (hit) {
        const props = $('#tab-props');
        if (props.getAttribute('aria-selected') !== 'true') props.click();
        if (!sheet.isOpen()) {
          sheet.set(Math.max(sheet.lastOpen || 0, sheet.max() * 0.42));
          auto = true;
        }
      } else if (auto && sheet.isOpen()) {
        sheet.collapse();
        auto = false;
      }
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
      case 'dim':
        return {
          label: '치수', key: 'dimMode',
          list: () => DIM_MODES,
          text: (m) => m.name, sub: (m) => m.sub,
          actions: [{ act: 'dims-outside', label: '바깥 치수 한 번에 넣기 (벽 중심)' }],
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
      ${o.edit ? '<div class="menu-sep" role="separator"></div><button type="button" class="menu-item" role="menuitem" data-act="edit">목록 편집…</button>' : ''}
      ${o.actions ? `<div class="menu-sep" role="separator"></div>${o.actions.map((a) => `<button type="button" class="menu-item" role="menuitem" data-act="${escHtml(a.act)}">${escHtml(a.label)}</button>`).join('')}` : ''}`;
  }

  /** 전기·설비·가구 기호 팔레트 */
  function renderPalette() {
    const pal = $('#palette');
    const cat = ['elec', 'mech', 'furn'].includes(ui.tool) ? ui.tool : null;
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
      ui.emit('current');
      setTool(ui.tool); // 기호 놓기 ↔ 선 그리기 바꿈
      const line = paletteLine(ui.tool);
      hint(line ? `${line}: 끌거나 점을 차례로 눌러 그립니다` : `${b.dataset.kind}: 놓을 곳을 누르세요`);
    });
    menu.addEventListener('click', (e) => {
      const o = toolOption(ui.tool);
      const item = e.target.closest('[data-id]');
      if (item) {
        App.current[o.key] = item.dataset.id;
        ui.emit('current');
        closeToolMenu();
        updateToolOption();
        App.nav.refreshTool(false);
        App.plan.requestRender();
        if (ui.tool === 'dim') hint(isTouch() ? DIM_USAGE[item.dataset.id].touch : DIM_USAGE[item.dataset.id].pc, 4000);
      } else if (e.target.closest('[data-act="edit"]')) {
        closeToolMenu();
        App.catalogUI.open(o.edit, App.current[o.key]);
      } else if (e.target.closest('[data-act="dims-outside"]')) {
        closeToolMenu();
        App.dims.outside();
      }
    });
    document.addEventListener('pointerdown', (e) => {
      if (!menu.hidden && !e.target.closest('.tool-opt-wrap')) closeToolMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeToolMenu();
    });
    ui.on('tool', updateToolOption);
    ui.on('settings', updateToolOption);
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
  /** 짧은 알림. 긴 글은 읽을 시간만큼 더 보여 줌 */
  function toast(msg, ms = Math.min(6000, 1800 + String(msg).length * 45)) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-show'), ms);
  }

  /* ── 확인 창 ──
     dialog({ title, html, actions: [{ id, label, primary, danger }], onOpen(body) }) → Promise<{ id, body }>
     Esc나 바깥을 누르면 id는 'cancel'. 입력 칸에서 Enter는 주 버튼 */
  let dialogDone = null;
  function dialog({ title, html, actions = [{ id: 'ok', label: '확인', primary: true }], onOpen }) {
    if (dialogDone) dialogDone('cancel');
    document.querySelectorAll('.menu:not([hidden])').forEach((m) => { m.hidden = true; }); // 열린 메뉴는 닫음
    $('#btnFile').setAttribute('aria-expanded', 'false');
    const modal = $('#dialog');
    $('#dialogTitle').textContent = title;
    // 창마다 새 본문 칸: 앞 창에서 붙인 이벤트가 남아 두 번 실행되지 않게
    const old = $('#dialogBody');
    const body = old.cloneNode(false);
    old.replaceWith(body);
    body.innerHTML = html;
    $('#dialogFoot').innerHTML = actions.map((a) =>
      `<button type="button" class="btn${a.primary ? ' btn-primary' : ''}${a.danger ? ' btn-danger' : ''}" data-id="${escHtml(a.id)}">${escHtml(a.label)}</button>`).join('');
    modal.hidden = false;
    if (onOpen) onOpen(body);
    const first = body.querySelector('input, select, textarea') || $('#dialogFoot .btn-primary') || $('#dialogFoot button');
    if (first) first.focus();
    return new Promise((resolve) => {
      dialogDone = (id) => {
        dialogDone = null;
        modal.hidden = true;
        resolve({ id, body });
      };
    });
  }

  /** 오래 걸리는 일(도면 읽기 등) 동안 화면을 덮는 안내. busy(false)로 닫음 */
  function busy(msg) {
    const el = $('#busy');
    if (msg === false) {
      el.hidden = true;
      return;
    }
    $('#busyText').textContent = msg;
    el.hidden = false;
  }

  function bindDialog() {
    const modal = $('#dialog');
    $('#dialogFoot').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]');
      if (b && dialogDone) dialogDone(b.dataset.id);
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal && dialogDone) dialogDone('cancel');
    });
    document.addEventListener('keydown', (e) => {
      if (modal.hidden || !dialogDone) return;
      if (e.target.closest && e.target.closest('[data-keys="local"]')) return; // 창 안에서 따로 처리하는 칸 (도면 이름 고치기 등)
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        dialogDone('cancel');
      } else if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        const primary = $('#dialogFoot .btn-primary');
        e.preventDefault();
        if (primary) dialogDone(primary.dataset.id);
      }
    }, true);
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
