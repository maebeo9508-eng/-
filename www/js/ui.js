/* 화면 구성: 도구 바, 상단 메뉴, 속성·집계 탭, 모바일 서랍, 안내 문구 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // 모든 도구. 도구 줄에 무엇이 어떤 순서로 나오는지는 모드가 정함 (modes.js)
  const TOOLS = [
    { id: 'select', label: '선택', key: 'V' },
    { id: 'wall', label: '벽', key: 'W' },
    { id: 'room', label: '방', key: 'R' },
    { id: 'door', label: '문', key: 'D' },
    { id: 'window', label: '창문', key: 'N' },
    { id: 'column', label: '기둥', key: 'C' },
    { id: 'elec', label: '전기', key: 'E' },
    { id: 'mech', label: '설비', key: 'F' },
    { id: 'furn', label: '가구', key: 'U' },
    { id: 'event', label: '물건', key: 'H' },
    { id: 'route', label: '동선', key: 'P' },
    { id: 'line', label: '선', key: 'L' },
    { id: 'zone', label: '영역', key: 'A' },
    { id: 'text', label: '텍스트', key: 'T' },
    { id: 'photo', label: '사진', key: 'O' },
    { id: 'dim', label: '치수', key: 'M' },
    { id: 'erase', label: '지우개', key: 'Del' },
  ];

  // 도구를 고를 때 보여 줄 사용법
  const USAGE = {
    wall: {
      pc: '끌거나 클릭으로 점을 이어 벽을 그립니다 · Shift: 직교 잠깐 전환 · Esc: 끝내기',
      touch: '끌어서 벽을 그리거나, 점을 차례로 눌러 이어 그립니다',
    },
    room: { pc: '벽으로 닫힌 곳 안쪽을 클릭하면 방이 됩니다', touch: '벽으로 닫힌 곳 안쪽을 누르면 방이 됩니다' },
    photo: { pc: '사진을 꽂을 자리를 클릭하고 사진을 고르세요 (여러 장) · 꽂힌 핀을 누르면 사진을 봅니다', touch: '누른 자리에 사진 핀 · 꽂힌 핀을 누르면 사진 보기' },
    door: { pc: '벽 위를 클릭하면 문이 붙습니다 · 마우스가 있는 쪽으로 열림', touch: '벽 위를 누르면 문이 붙습니다 · 누른 쪽으로 열림' },
    window: { pc: '벽 위를 클릭하면 창문이 붙습니다', touch: '벽 위를 누르면 창문이 붙습니다' },
    column: { pc: '기둥을 놓을 곳을 클릭하세요', touch: '기둥을 놓을 곳을 누르세요' },
    elec: { pc: '위쪽 팔레트에서 기호를 고르고 클릭 · 콘센트·스위치는 벽 가까이면 벽면에 붙음', touch: '위쪽에서 기호를 고르고 누르세요 · 벽 가까이면 벽면에 붙음' },
    mech: { pc: '위쪽 팔레트에서 기호를 고르고 클릭 · 배관·덕트를 고르면 선 그리기', touch: '위쪽에서 기호를 고르고 누르세요 · 배관·덕트는 선 그리기' },
    event: { pc: '위쪽에서 분류와 물건을 고르고 클릭 · 놓은 뒤 속성에서 크기·색·의자 수·글자·이미지 · 3D 버튼으로 조감도', touch: '위쪽에서 분류와 물건을 고르고 누르세요 · 3D 버튼으로 조감도' },
    route: { pc: '입구부터 점을 차례로 클릭해 길을 그립니다 · 같은 점을 한 번 더 누르거나 Esc로 끝 · 걸리는 곳은 빨갛게 표시', touch: '입구부터 점을 차례로 눌러 길을 그리고 ‘그리기 끝내기’ · 걸리는 곳은 빨갛게 표시' },
    furn: { pc: '위쪽에서 가구를 고르고 클릭 · 벽 가까이 놓으면 등을 벽에 대고 붙음', touch: '위쪽에서 가구를 고르고 누르세요 · 벽 가까이면 등을 벽에 대고 붙음' },
    line: { pc: '끌거나 클릭으로 점을 이어 그립니다 · 기구 가운데·끝점에 붙음 · Esc: 끝내기', touch: '끌거나 점을 차례로 눌러 그립니다' },
    get zone() { return App.modes.is('event') ? ZONE_EVENT_USAGE : ZONE_USAGE; },
    text: { pc: '글자를 넣을 곳을 클릭 · Enter로 확정, Shift+Enter 줄바꿈', touch: '글자를 넣을 곳을 누르고 입력하세요' },
    get dim() { return DIM_USAGE[App.current.dimMode] || DIM_USAGE.clear; },
    erase: { pc: '지울 항목을 클릭하거나 문지르세요', touch: '지울 항목을 누르거나 문지르세요' },
  };

  const ZONE_USAGE = { pc: '끌면 사각형, 클릭으로 점을 찍으면 다각형 · 처음 점을 다시 누르면 닫힘', touch: '끌면 사각형, 점을 차례로 누르면 다각형' };
  const ZONE_EVENT_USAGE = { pc: '위쪽에서 바닥(잔디·아스팔트 등)을 고르고 끌면 사각형, 클릭으로 점을 찍으면 다각형 · 3D에서 그 바닥으로 보임', touch: '위쪽에서 바닥을 고르고 끌면 사각형, 점을 차례로 누르면 다각형' };
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
    fitMenu: (m) => fitMenu(m),
    mobile: window.matchMedia('(max-width: 768px)'),
    on(name, fn) {
      (handlers[name] = handlers[name] || []).push(fn);
    },
    emit(name, ...args) {
      (handlers[name] || []).forEach((fn) => fn(...args));
    },
    init() {
      // 알림·읽는 중 덮개는 앱 칸 밖(body)으로: 3D 화면·사진 보기 위에도 보이게 (앱 칸은 따로 쌓이는 층이라 z-index가 안 먹음)
      document.body.appendChild($('#toast'));
      document.body.appendChild($('#busy'));
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
    rebuildToolbar,
    updateHistory,
    toast,
    hint,
    dialog,
    busy,
    openLength,
    closeTop,
    openPicker,
    openEstimate,
  });

  /* ── 도구 바 ───────────────────────────── */
  function buildToolbar() {
    $('#toolbar').addEventListener('click', (e) => {
      const btn = e.target.closest('.tool');
      if (btn) pickTool(btn.dataset.tool);
    });
    rebuildToolbar();
  }
  /** 지금 모드의 도구들로 도구 줄을 다시 만듦. 쓰던 도구가 이 모드에 없으면 '선택'으로 */
  function rebuildToolbar() {
    const bar = $('#toolbar');
    const ids = App.modes.tools();
    const html = ids.map((id) => {
      if (id === '|') return '<span class="tool-sep" role="separator"></span>';
      const t = TOOLS.find((x) => x.id === id);
      return `<button type="button" class="tool" data-tool="${t.id}" title="${t.label} (${t.key})" aria-pressed="false">` +
        `<span class="ico" data-icon="${t.id}"></span><span class="tool-label">${t.label}</span>` +
        `<kbd class="tool-key">${t.key}</kbd></button>`;
    }).join('');
    if (bar.dataset.tools !== ids.join(',')) {
      bar.dataset.tools = ids.join(',');
      bar.innerHTML = html;
      App.icons.apply(bar);
      bar.scrollTo({ left: 0, top: 0 });
    }
    setTool(ids.includes(ui.tool) ? ui.tool : 'select');
  }

  const isTouch = () => window.matchMedia('(hover: none), (pointer: coarse)').matches;

  /** 도구 버튼·단축키로 도구를 고를 때 */
  function pickTool(id) {
    const t = TOOLS.find((x) => x.id === id);
    // 지우개: 선택한 것이 있으면 바로 지우고, 없으면 지우개 모드 (스케치업과 같음)
    if (id === 'erase' && App.actions.deleteSelection()) return;
    setTool(id);
    if (USAGE[id]) hint(isTouch() ? USAGE[id].touch : USAGE[id].pc, 4000);
    else if (!App.tools.implemented(id)) hint(`‘${t.label}’ 도구는 아직 쓸 수 없습니다.`);
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

  /** 펼친 메뉴가 화면 오른쪽·왼쪽 밖으로 나가면 안으로 밀어 넣음 */
  function fitMenu(menu) {
    menu.style.transform = '';
    menu.style.maxHeight = '';
    // 아래로도: 메뉴가 열린 자리에서 화면(또는 도면 칸) 아래 끝까지만, 넘치면 메뉴 안에서 스크롤
    const r0 = menu.getBoundingClientRect(), vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    // (휴대폰의 레이어 메뉴는 열린 동안 아래 서랍보다 위에 그려지므로 서랍 높이로 줄이지 않음)
    const stage = menu.closest('.stage');
    const bottom = Math.min(vh, stage ? stage.getBoundingClientRect().bottom : vh);
    if (r0.bottom > bottom - 8) menu.style.maxHeight = `${Math.max(120, Math.floor(bottom - 8 - r0.top))}px`;
    const r = menu.getBoundingClientRect(), W = document.documentElement.clientWidth;
    let dx = 0;
    if (r.right > W - 8) dx = W - 8 - r.right;
    if (r.left + dx < 8) dx = 8 - r.left;
    if (dx) menu.style.transform = `translateX(${Math.round(dx)}px)`;
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
      if (open) fitMenu(menu);
    });
    // 서랍 높이·화면 크기가 바뀌면 펼친 메뉴도 다시 맞춤
    const refit = () => ['#fileMenu', '#layerMenu'].forEach((sel) => { const m = $(sel); if (m && !m.hidden) fitMenu(m); });
    ui.on('sheet', refit);
    window.addEventListener('resize', refit);
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
    item('#menuLayout', () => App.exporter.layoutDialog());
    // 견적서: 집계 탭의 '견적' 보기를 열고, 단가를 하나라도 넣었으면 바로 PDF로
    item('#menuEstimate', () => openEstimate());
    item('#menuProposal', () => App.proposal.open());
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
    const wrap = $('#snapWrap');
    const toggle = $('#btnSnap');
    const sync = () => {
      bar.querySelectorAll('[data-snap]').forEach((b) => b.setAttribute('aria-pressed', String(!!App.settings[b.dataset.snap])));
      const shown = [...bar.querySelectorAll('[data-snap]')].filter((b) => !b.hidden);
      $('#snapCount').textContent = `${shown.filter((b) => App.settings[b.dataset.snap]).length}/${shown.length}`;
    };
    // 휴대폰: '스냅'을 누르면 체크 목록이 열리고, 바깥을 누르면 닫힘
    const setOpen = (open) => {
      wrap.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => setOpen(!wrap.classList.contains('is-open')));
    document.addEventListener('pointerdown', (e) => {
      if (wrap.classList.contains('is-open') && !e.target.closest('#snapWrap')) setOpen(false);
    });
    ui.closeSnap = () => {
      if (!wrap.classList.contains('is-open')) return false;
      setOpen(false);
      return true;
    };
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
    ui.on('tool', (id) => {
      bar.querySelectorAll('[data-only]').forEach((b) => { b.hidden = b.dataset.only !== id; });
      sync();
    });

    $('#btnFinish').addEventListener('click', () => App.tools.finish());
    ui.on('toolstate', (tool) => {
      const chaining = !!(tool && tool.isChaining && tool.isChaining());
      $('#btnFinish').hidden = !chaining;
      $('#btnLength').hidden = !chaining || !tool.addLength; // 길이를 숫자로 넣을 수 있는 도구만
      if (!chaining) closeLength();
    });
    bindLength();
  }

  /* ── 길이를 숫자로 넣기 (벽·선·치수 이어 그리기 중) ──
     휴대폰: 숫자를 넣고 화살표로 방향. PC: 숫자 키를 누르면 바로 열리고 Enter는 커서 쪽 */
  const DIRS = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
  const chainTool = () => {
    const t = App.tools.current;
    return t && t.addLength && t.isChaining && t.isChaining() ? t : null;
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
    if (App.photos && App.photos.isOpen()) { App.photos.close(); return true; }
    if (App.view3d && App.view3d.close()) return true;
    if (ui.closeSnap && ui.closeSnap()) return true;
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
      // 뒤로 가기로 닫아도 메뉴 버튼·서랍 위 표시를 원래대로
      document.querySelectorAll('.stage-top.menu-open').forEach((e) => e.classList.remove('menu-open'));
      const owner = document.querySelector(`[aria-controls="${menu.id}"]`);
      if (owner) owner.setAttribute('aria-expanded', 'false');
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
        // 서랍이 방금 고른 것을 덮으면 도면을 위로 밀어 보이게 (빠른 막대 자리까지 비움)
        requestAnimationFrame(() => {
          const b = App.doc.bounds(App.selection.list());
          if (!b) return;
          const P = App.plan, qb = document.getElementById('quickBar'), cr = P.canvas.getBoundingClientRect();
          // 빠른 막대(두 줄일 수 있음) 위까지가 보이는 칸
          const bottom = (qb && !qb.hidden ? qb.getBoundingClientRect().top - cr.top : P.height - (P.insets.bottom || 0)) - 12;
          // 고른 것의 가운데(작은 것은 아래 끝까지)가 보이면 그대로 — 긴 벽처럼 큰 것은 다 보이게 하려고 크게 밀지 않음
          const top = P.view.toScreen(0, b.minY).y, low = P.view.toScreen(0, b.maxY).y, mid = (top + low) / 2;
          const want = Math.min(low, mid + 40);
          if (want <= bottom) return;
          const dy = Math.max(bottom - want, 64 - top); // 위쪽 버튼 줄 밑으로는 올리지 않음
          if (dy < 0) { P.view.panBy(0, dy); P.render(); }
        });
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
        // 조감도 모드: 바닥 종류(잔디·아스팔트 등)를 고름. '색만'이면 영역 색으로
        if (App.modes.is('event')) {
          return {
            label: '바닥', key: 'zoneSurface',
            list: () => App.catalog.SURFACES.map(([id, name, color]) => ({ id, name, color: color || App.current.zoneColor })),
            text: (c) => c.name, sub: (c) => (c.id === '' ? '영역 색으로만 칠함 (구역 표시)' : c.id === 'carpet' ? '영역 색의 카펫' : ''), swatch: (c) => c.color,
          };
        }
        return {
          label: '영역 색', key: 'zoneColor',
          list: () => App.catalog.COLORS.map(([id, name]) => ({ id, name })),
          text: (c) => c.name, sub: () => '', swatch: (c) => c.id,
        };
      case 'route':
        return {
          label: '동선', key: 'routeKind',
          list: () => App.routes.KINDS.map((k) => ({ id: k.kind, name: k.kind, color: k.color, width: k.width })),
          text: (c) => c.name, sub: (c) => `통로 폭 ${App.units.formatLength(c.width)}`, swatch: (c) => c.color,
          actions: [{ act: 'route-check', label: '동선 체크 (걸리는 곳 찾기)' }, { act: 'safety-check', label: '안전 점검 (화장실·소화기·대피)' }],
        };
      case 'dim':
        return {
          label: '치수', key: 'dimMode',
          list: () => DIM_MODES,
          text: (m) => m.name, sub: (m) => m.sub,
          actions: [
            { act: 'dims-outside-clear', label: '바깥 치수 한 번에 · 안목 (내벽에서 내벽까지)' },
            { act: 'dims-outside', label: '바깥 치수 한 번에 · 벽 중심' },
            { act: 'dims-rooms', label: '방마다 안목 한 번에 (가로·세로)' },
            { act: 'wall-lengths', label: App.settings.showWallLengths ? '벽 길이 글자 숨기기' : '벽 길이 글자 보이기' },
          ],
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

  /** 전기·설비·가구·조감도 물건 팔레트. 조감도 물건은 분류 탭으로 나눠 보여 줌 */
  function renderPalette() {
    const pal = $('#palette'), cats = $('#paletteCats');
    const cat = ['elec', 'mech', 'furn', 'event'].includes(ui.tool) ? ui.tool : null;
    const grouped = cat === 'event' || cat === 'furn'; // 분류 탭과 미리보기 그림으로 고름
    pal.hidden = !cat;
    cats.hidden = !grouped;
    if (!cat) return;
    App.catalog.ensureCurrent();
    const current = App.current[`${cat}Kind`];
    let list = App.catalog.ITEM_KINDS[cat];
    pal.classList.toggle('is-pictures', grouped);
    if (grouped) {
      const groups = App.catalog.palette(cat), curCat = App.current[`${cat}Cat`];
      cats.innerHTML = `<button type="button" class="cat-btn cat-all" data-picker="1" title="모든 ${cat === 'furn' ? '가구' : '물건'}를 그림으로 보고 고르기">▦ 전체 보기</button>`
        + groups.map((g) => `<button type="button" class="cat-btn" data-cat="${escHtml(g.cat)}" aria-pressed="${g.cat === curCat}">${escHtml(g.cat)}</button>`).join('');
      list = (groups.find((g) => g.cat === curCat) || groups[0]).kinds;
      // 3D 미리보기 그림으로 (아직 못 그렸으면 기호로 두었다가 바뀜)
      App.sprites.prefer(list.map((d) => d.kind));
      pal.innerHTML = list.map((d) => picCard(d, d.kind === current)).join('');
      return;
    }
    pal.innerHTML = list.map((d) => {
      const name = d.kind || d.line;
      const icon = d.kind ? App.draw.itemIcon(d.kind) : App.draw.lineIcon(d.line);
      return `<button type="button" class="pal-btn" data-kind="${escHtml(name)}" aria-pressed="${name === current}" title="${escHtml(name)}${d.line ? ' (선 그리기)' : ''}">
        <span class="ico" style="--ico:url('${icon}')"></span><span>${escHtml(name)}</span></button>`;
    }).join('');
  }

  /** 물건 한 칸: 미리보기 그림과 이름 */
  function picCard(d, pressed) {
    const url = App.sprites.thumb(d.kind);
    const pic = url ? `<img class="pal-thumb" src="${url}" alt="" draggable="false">` : `<span class="pal-thumb pal-wait" data-wait="${escHtml(d.kind)}"><span class="ico" style="--ico:url('${App.draw.itemIcon(d.kind)}')"></span></span>`;
    return `<button type="button" class="pal-btn pal-pic" data-kind="${escHtml(d.kind)}" aria-pressed="${pressed}" title="${escHtml(d.kind)}">${pic}<span>${escHtml(d.kind)}</span></button>`;
  }
  /** 그림이 다 만들어지면 기다리던 칸을 그림으로 바꿈 */
  function fillThumbs(root) {
    root.querySelectorAll('.pal-wait[data-wait]').forEach((w) => {
      const url = App.sprites.thumb(w.dataset.wait);
      if (!url) return;
      const img = document.createElement('img');
      img.className = 'pal-thumb';
      img.alt = '';
      img.draggable = false;
      img.src = url;
      w.replaceWith(img);
    });
  }

  /** 모든 물건을 분류별 그림으로 보고 고르는 창 */
  /** 물건 찾기에서 같이 걸리는 말 (이름에 없는 비슷한 말) */
  const PICK_TAGS = {
    몽골텐트: '천막 캐노피', '대형 텐트': '천막 캐노피', 파라솔: '우산 그늘막', 무대: '스테이지 단상', 트러스: '게이트 아치 구조물', 부스: '전시 판매대',
    에어아치: '게이트 출발 결승', '돔 텐트': '천막 에어돔', 파고라: '그늘막 정자', 관람석: '스탠드 좌석 객석 응원석', 컨테이너: '사무실 창고', 매표소: '티켓 안내소',
    '의자 배열': '좌석 객석', 벤치: '의자', 'VIP 소파': '의자 귀빈', 스피커: '음향', 라인어레이: '스피커 음향', '모니터 스피커': '음향', '콘솔 데스크': '음향 믹서',
    'LED 스크린': '전광판 화면', '조명 타워': '라이트', 스크린: '빔 프로젝터 화면', 난로: '히터 난방', 카메라: '촬영 방송 중계',
    백월: '배경', 현수막: '배너 플래카드', 포토월: '포토존 배경', X배너: '입간판', 윙배너: '깃발', 'A형 입간판': '배너 안내판', '풍선 아치': '장식', '풍선 다발': '장식',
    '입체 글자': '조형물 포토존 간판', 화분: '꽃 화환 화단', 데스크: '안내 접수 등록', '이동식 화장실': '간이', 푸드트럭: '음식 먹거리', 펜스: '울타리 바리케이드 안전',
    차단봉: '벨트 줄 안전', 러버콘: '꼬깔 라바콘 안전', 구급차: '응급 의료 앰뷸런스', 축구장: '운동장 경기장 구장', 풋살장: '축구 경기장',
    농구장: '코트 경기장 체육관', 배구장: '코트 경기장 체육관', 테니스장: '코트 경기장', 배드민턴장: '코트 경기장 체육관', '육상 트랙': '달리기 운동장 마라톤',
    골대: '축구 골', 농구대: '골대', 시상대: '단상 포디움 메달', 점수판: '스코어 전광판', '선수 벤치': '대기석 덕아웃', 트로피: '우승컵 축구컵',
    사람: '관객 인원', 승용차: '차 자동차', 버스: '차', 트럭: '차 화물', 건물: '빌딩 집', 나무: '조경 가로수', 담장: '울타리 벽 난간',
    '주차 구획': '주차장', 가로등: '조명', 생울타리: '조경 나무', 횡단보도: '도로',
    // 가구
    침대: '침실 베드', 소파: '쇼파 거실', 'L자 소파': '쇼파 코너 거실', 안락의자: '1인 소파 쇼파', 식탁: '테이블 주방 식당', '식탁 의자': '의자',
    '거실 테이블': '소파 테이블 커피', 책장: '선반 책꽂이 서재', 피아노: '악기', 협탁: '사이드 테이블 침실', 화장대: '거울 침실', 책상: '서재 공부',
    '아일랜드 식탁': '주방 바 아일랜드', '바 테이블': '스툴 카페 식당', '사무용 의자': '의자 오피스 사무실', '회의 테이블': '회의실 사무실 테이블',
    파티션: '칸막이 사무실', '서류 캐비닛': '서랍 사무실', 카운터: '계산대 매장 카페 포스', 진열장: '쇼케이스 매장 유리장', 러그: '카펫 깔개',
    '실내 화분': '화분 식물 나무', '스탠드 조명': '조명 램프', 냉장고: '주방 가전', 세탁기: '가전 세탁실', 싱크대: '주방 개수대',
    쿡탑: '가스레인지 인덕션 주방', 변기: '화장실 욕실', 세면대: '화장실 욕실', 욕조: '욕실', 샤워부스: '욕실 샤워', 신발장: '현관',
    옷장: '붙박이장 침실', 수납장: '서랍장', TV장: '거실 티비', '액자·벽보': '그림 포스터 사진',
  };
  /** 찾기에 쓰는 글: 이름 + 분류 + 모양들 + 비슷한 말 (빈칸 없이) */
  function pickText(kind) {
    const d = App.catalog.itemDef(kind) || {};
    return `${kind} ${d.cat || ''} ${(d.styles || []).join(' ')} ${PICK_TAGS[kind] || ''}`.replace(/\s/g, '');
  }

  async function openPicker() {
    const category = ui.tool === 'furn' ? 'furn' : 'event';
    const groups = App.catalog.palette(category);
    const r = await dialog({
      title: category === 'furn' ? '가구 고르기' : '물건 고르기',
      html: `
        <div class="field-box picker-search"><input id="pickerSearch" type="search" placeholder="${category === 'furn' ? '찾기 (예: 소파, 침대, 주방, 사무실)' : '찾기 (예: 천막, 축구, 의자, 조명)'}" autocomplete="off" enterkeyhint="search"></div>
        <div class="picker" id="pickerBody">
          ${groups.map((g) => `<section class="picker-sec" data-sec><h3>${escHtml(g.cat)} <small>${g.kinds.length}</small></h3>
            <div class="picker-grid">${g.kinds.map((d) => picCard(d, d.kind === App.current[`${category}Kind`])).join('')}</div></section>`).join('')}
          <p class="props-meta picker-none" hidden>찾는 물건이 없습니다.</p>
        </div>`,
      actions: [{ id: 'close', label: '닫기', primary: true }],
      onOpen(body) {
        body.dataset.keys = 'local';
        const pick = (kind) => {
          const d = App.catalog.itemDef(kind);
          App.current[`${category}Kind`] = kind;
          // 조감도 팔레트에 같이 나오는 가구(액자·벽보)는 조감도의 '안내·장식'으로
          App.current[`${category}Cat`] = category === 'event' && d && d.category !== 'event' ? '안내·장식' : (d && d.cat) || groups[0].cat;
          ui.emit('current');
          document.querySelector('#dialogFoot [data-id="close"]').click();
          setTool(category);
          hint(`${kind}: 놓을 곳을 누르세요`, 3500);
        };
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-kind]');
          if (b) pick(b.dataset.kind);
        });
        body.querySelector('#pickerSearch').addEventListener('input', (e) => {
          const q = e.target.value.trim().replace(/\s/g, '');
          let any = false;
          body.querySelectorAll('[data-sec]').forEach((sec) => {
            let n = 0;
            sec.querySelectorAll('[data-kind]').forEach((b) => {
              const hit = !q || pickText(b.dataset.kind).includes(q);
              b.hidden = !hit;
              if (hit) n++;
            });
            sec.hidden = !n;
            any = any || n > 0;
          });
          body.querySelector('.picker-none').hidden = any;
        });
      },
    });
    return r;
  }

  /* ── 조감도 모드: 고른 것을 바로 돌리고 복제하는 막대 ── */
  function renderQuick() {
    const bar = $('#quickBar');
    const els = App.selection.list().map((id) => App.doc.get(id)).filter(Boolean);
    const show = els.length > 0 && ui.tool === 'select' && (App.modes.is('event') || els.some((e) => e.type === 'item' || e.type === 'column' || e.type === 'text'));
    bar.hidden = !show;
    if (!show) return;
    const items = els.filter((e) => e.type === 'item' && !e.wallId && !e.locked);
    const one = els.length === 1 ? els[0] : null;
    const name = one ? (one.type === 'item' ? one.kind : one.name || App.model.TYPES[one.type].label) : `${els.length}개 고름`;
    const key = `${name}|${items.length}|${els.length}`;
    if (bar.dataset.key === key) return;
    bar.dataset.key = key;
    bar.innerHTML = `
      <span class="quick-name">${escHtml(name)}</span>
      ${items.length ? `<button type="button" class="btn" data-q="rot-" title="왼쪽으로 15° 돌리기" aria-label="왼쪽으로 15도 돌리기">↺ 15°</button>
        <button type="button" class="btn" data-q="rot+" title="오른쪽으로 15° 돌리기" aria-label="오른쪽으로 15도 돌리기">↻ 15°</button>` : ''}
      <button type="button" class="btn" data-q="rot90" title="90° 돌리기 (Q)">90°</button>
      <button type="button" class="btn" data-q="dup" title="복제 (Ctrl+D)">복제</button>
      <button type="button" class="btn" data-q="array" title="같은 간격으로 여러 개 늘어놓기">줄 세우기</button>
      <button type="button" class="btn btn-danger" data-q="del" title="삭제 (Del)">삭제</button>`;
  }
  function quickAction(act) {
    const ids = App.selection.list().filter((id) => App.doc.has(id));
    const items = ids.map((id) => App.doc.get(id)).filter((e) => e.type === 'item' && !e.wallId && !e.locked);
    if (act === 'rot-' || act === 'rot+') {
      const d = act === 'rot+' ? 15 : -15;
      App.doc.transact('돌리기', () => items.forEach((it) => App.doc.update(it.id, { rotation: (((it.rotation || 0) + d) % 360 + 360) % 360 })));
    } else if (act === 'rot90') App.actions.rotateSelection();
    else if (act === 'dup') App.edit.duplicate();
    else if (act === 'del') App.actions.deleteSelection();
    else if (act === 'array') arrayDialog(ids);
  }
  /** 줄 세우기: 고른 것을 같은 간격으로 여러 개 */
  async function arrayDialog(ids) {
    // 고른 것 전체의 실제 폭·깊이 (물건은 돌린 모양 그대로의 실제 크기, 나머지는 범위). 물건 범위(bounds)는 돌려도 되게
    // 긴 변 기준 정사각형이라 짧은 쪽으로 늘어놓으면 틈이 커지므로 쓰지 않음
    const T = App.model.TYPES;
    let b = null;
    App.edit.expand(ids).forEach((el) => {
      if (!el || !T[el.type] || T[el.type].catalog) return;
      let e;
      if (el.type === 'item' && el.size != null) {
        const ex = T.item.extent(el, { x: 1, y: 0 }), ey = T.item.extent(el, { x: 0, y: 1 });
        e = { minX: el.x - ex, maxX: el.x + ex, minY: el.y - ey, maxY: el.y + ey };
      } else e = T[el.type].bounds(el);
      if (!e) return;
      b = b ? { minX: Math.min(b.minX, e.minX), minY: Math.min(b.minY, e.minY), maxX: Math.max(b.maxX, e.maxX), maxY: Math.max(b.maxY, e.maxY) } : e;
    });
    if (!b) return;
    const span = { x: Math.round(b.maxX - b.minX), y: Math.round(b.maxY - b.minY) };
    const r = await dialog({
      title: '줄 세우기',
      html: `
        <div class="field-grid">
          <div class="field"><label class="field-label" for="arrN">한 줄에 몇 개</label><div class="field-box"><input id="arrN" type="text" inputmode="numeric" value="5"><span class="field-unit">개</span></div></div>
          <div class="field"><label class="field-label" for="arrGap">사이 틈</label><div class="field-box"><input id="arrGap" type="text" inputmode="decimal" value="${App.units.inputLength(1000)}"><span class="field-unit">${App.units.lengthLabel()}</span></div></div>
          <div class="field"><label class="field-label" for="arrRows">줄 수 <small>격자로</small></label><div class="field-box"><input id="arrRows" type="text" inputmode="numeric" value="1"><span class="field-unit">줄</span></div></div>
          <div class="field"><label class="field-label" for="arrRowGap">줄 사이 틈 <small>통로</small></label><div class="field-box"><input id="arrRowGap" type="text" inputmode="decimal" value="${App.units.inputLength(3000)}"><span class="field-unit">${App.units.lengthLabel()}</span></div></div>
        </div>
        <div class="field"><span class="field-label">방향</span>
          <div class="seg seg-inline" role="radiogroup" id="arrDir">
            ${[['right', '오른쪽 →'], ['down', '아래 ↓'], ['left', '← 왼쪽'], ['up', '위 ↑']].map(([id, t], i) => `<button type="button" class="seg-btn" role="radio" data-dir="${id}" aria-checked="${i === 0}">${t}</button>`).join('')}
          </div></div>
        <p class="props-meta">고른 것을 포함해 같은 간격으로 늘어놓습니다. 사이 틈은 물건과 물건 사이의 빈 거리입니다. 줄 수를 2 이상으로 하면 옆 방향으로 줄을 더 놓아 격자가 됩니다 (부스 장터·연회 테이블).</p>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '늘어놓기', primary: true }],
      onOpen(body) {
        body.querySelector('#arrDir').addEventListener('click', (e) => {
          const t = e.target.closest('[data-dir]');
          if (t) body.querySelectorAll('[data-dir]').forEach((x) => x.setAttribute('aria-checked', String(x === t)));
        });
      },
    });
    if (r.id !== 'ok') return;
    const rows = Math.max(1, Math.min(50, parseInt(r.body.querySelector('#arrRows').value, 10) || 1));
    const n = Math.max(rows > 1 ? 1 : 2, Math.min(200, parseInt(r.body.querySelector('#arrN').value, 10) || 0));
    const gap = App.units.parseLength(r.body.querySelector('#arrGap').value);
    const rowGap = App.units.parseLength(r.body.querySelector('#arrRowGap').value);
    const dir = (r.body.querySelector('[data-dir][aria-checked="true"]') || {}).dataset.dir || 'right';
    if (!(gap >= 0)) { toast('사이 틈을 숫자로 넣으세요.'); return; }
    if (rows > 1 && !(rowGap >= 0)) { toast('줄 사이 틈을 숫자로 넣으세요.'); return; }
    if (n * rows > 400) { toast('한 번에 400개까지 놓을 수 있습니다.'); return; }
    const v = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] }[dir];
    const step = (v[0] ? span.x : span.y) + gap;
    // 줄은 옆으로: 가로로 늘어놓으면 아래로, 세로로 늘어놓으면 오른쪽으로
    const w = v[0] ? [0, 1] : [1, 0];
    const rowStep = (w[0] ? span.x : span.y) + (rows > 1 ? rowGap : 0);
    const src = App.edit.expand(ids);
    const made = [];
    App.doc.transact(rows > 1 ? '격자로 놓기' : '줄 세우기', () => {
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < n; i++) {
          if (!i && !j) continue;
          App.edit.clones(src, v[0] * step * i + w[0] * rowStep * j, v[1] * step * i + w[1] * rowStep * j).forEach((c) => { App.doc.add(c); made.push(c.id); });
        }
      }
    });
    const all = [...ids, ...made.filter((id) => App.doc.has(id))];
    App.selection.set(all);
    // 늘어놓은 것이 화면 밖으로 나갔으면 다 보이게 맞춤
    const nb = App.doc.bounds(all), vr = App.plan.view.worldRect(App.plan.width, App.plan.height);
    if (nb && (nb.minX < vr.minX || nb.maxX > vr.maxX || nb.minY < vr.minY || nb.maxY > vr.maxY)) App.plan.fitToContent();
    // 여럿을 골라 늘어놓으면 묶음째 복제되므로 실제로 놓인 수를 알림, 줄 사이는 넣은 틈(통로) 그대로
    const placed = all.length, unit = src.length > 1 ? ` (고른 ${src.length}개씩)` : '';
    toast(rows > 1 ? `${rows}줄 × ${n}${src.length > 1 ? '묶음' : '개'} = ${placed.toLocaleString('ko-KR')}개를 놓았습니다${unit} (줄 사이 틈 ${App.units.formatLength(rowGap)}).` : `${n}${src.length > 1 ? '묶음' : '개'}(${placed.toLocaleString('ko-KR')}개)를 ${App.units.formatLength(step)} 간격으로 늘어놓았습니다.`);
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
    // 조감도 물건 분류 탭: 그 분류의 첫 물건을 바로 고름
    $('#paletteCats').addEventListener('click', (e) => {
      if (e.target.closest('[data-picker]')) { openPicker(); return; }
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      const tool = ui.tool === 'furn' ? 'furn' : 'event';
      App.current[`${tool}Cat`] = b.dataset.cat;
      const group = App.catalog.palette(tool).find((g) => g.cat === b.dataset.cat);
      if (group && !group.kinds.some((d) => d.kind === App.current[`${tool}Kind`])) App.current[`${tool}Kind`] = group.kinds[0].kind;
      ui.emit('current');
      setTool(ui.tool);
      $('#palette').scrollTo({ left: 0 });
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
      if (item && !item.dataset.act) {
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
      } else {
        const act = e.target.closest('[data-act]');
        const run = act && {
          'dims-outside-clear': () => App.dims.outside('clear'),
          'dims-outside': () => App.dims.outside('center'),
          'dims-rooms': () => App.dims.rooms(),
          'route-check': () => App.routes.report(),
          'safety-check': () => App.safety.open(),
          'wall-lengths': () => {
            App.settings.showWallLengths = !App.settings.showWallLengths;
            App.saveSettings();
            ui.emit('settings');
            App.plan.requestRender();
            toast(App.settings.showWallLengths ? '벽 길이 글자를 다시 보입니다.' : '벽 길이 글자를 숨겼습니다. 설정 → 화면에서도 바꿀 수 있습니다.');
          },
        }[act.dataset.act];
        if (!run) return;
        closeToolMenu();
        run();
      }
    });
    document.addEventListener('pointerdown', (e) => {
      if (!menu.hidden && !e.target.closest('.tool-opt-wrap')) closeToolMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeToolMenu();
    });
    ui.on('tool', updateToolOption);
    ui.on('mode', updateToolOption);
    // 미리보기 그림이 만들어지면 기다리던 칸을 채움
    ui.on('sprites', () => { fillThumbs($('#palette')); const pk = document.getElementById('pickerBody'); if (pk) fillThumbs(pk); });
    // 빠른 막대
    $('#quickBar').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) quickAction(b.dataset.q); });
    const quick = () => queueMicrotask(renderQuick);
    App.selection.onChange(quick);
    App.doc.onChange(quick);
    ui.on('tool', quick);
    ui.on('mode', quick);
    // 이름표 켜고 끄기
    const names = $('#btnNames');
    const syncNames = () => names.setAttribute('aria-pressed', String(App.settings.itemNames !== false));
    names.addEventListener('click', () => {
      App.settings.itemNames = App.settings.itemNames === false;
      App.saveSettings();
      syncNames();
      App.plan.requestRender();
    });
    ui.on('settings', syncNames); // 설정 화면에서 바꿨을 때도 맞춤
    syncNames();
    ui.on('settings', updateToolOption);
    App.doc.onChange(updateToolOption);

    // 캔버스 위쪽 버튼 묶음 높이: 안내 문구와 '화면 맞춤'이 그 아래를 쓰도록
    const top = $('#stageTop');
    const setTop = () => $('#stage').style.setProperty('--stage-top-h', `${top.offsetHeight}px`);
    if ('ResizeObserver' in window) new ResizeObserver(setTop).observe(top);
    setTop();
  }

  /** 집계 탭의 '견적' 보기를 엶 (휴대폰은 서랍을 크게) */
  function openEstimate() {
    const tab = $('#tab-summary');
    if (tab.getAttribute('aria-selected') !== 'true') tab.click();
    App.summary.setView('cost');
    if (ui.mobile.matches) sheet.set(sheet.max());
    hint('단가를 넣고 위쪽 ‘견적서’ 버튼을 누르면 PDF로 저장됩니다', 4000);
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
      document.documentElement.style.setProperty('--sheet-h', this.h + 'px'); // 앱 칸 밖으로 옮긴 알림도 서랍 위에 뜨게
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
        document.documentElement.style.removeProperty('--sheet-h');
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
    document.querySelectorAll('.stage-top.menu-open').forEach((e) => e.classList.remove('menu-open'));
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
    // 손가락으로 쓰는 기기: 글자 칸에 바로 포커스하면 자판이 올라와 목록·템플릿을 가리므로 주 버튼에 (칸은 눌러서 씀)
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const first = (!coarse && body.querySelector('input, select, textarea')) || $('#dialogFoot .btn-primary') || $('#dialogFoot button');
    if (first) first.focus({ preventScroll: true });
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
