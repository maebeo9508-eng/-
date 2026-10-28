/* 화면 구성: 도구 바, 상단 메뉴, 속성·집계 탭, 모바일 서랍, 안내 문구 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // 도구 목록. stage: 만들 단계(아직 없는 도구 안내용), action: 누르면 바로 실행되는 버튼
  const TOOLS = [
    { id: 'select', label: '선택', key: 'V' },
    { sep: true },
    { id: 'wall', label: '벽', key: 'W', stage: 2 },
    { id: 'room', label: '방', key: 'R', stage: 3 },
    { id: 'door', label: '문', key: 'D', stage: 4 },
    { id: 'window', label: '창문', key: 'N', stage: 4 },
    { id: 'column', label: '기둥', key: 'C' },
    { sep: true },
    { id: 'elec', label: '전기', key: 'E', stage: 5 },
    { id: 'mech', label: '설비', key: 'F', stage: 5 },
    { id: 'line', label: '선', key: 'L', stage: 5 },
    { sep: true },
    { id: 'zone', label: '영역', key: 'A' },
    { id: 'text', label: '텍스트', key: 'T' },
    { id: 'dim', label: '치수', key: 'M' },
    { sep: true },
    { id: 'erase', label: '지우개', key: 'Del', action: true },
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
      initSheet();
    },
    setTool,
    toast,
    hint,
  });

  /* ── 도구 바 ───────────────────────────── */
  function buildToolbar() {
    const bar = $('#toolbar');
    bar.innerHTML = TOOLS.map((t) =>
      t.sep
        ? '<span class="tool-sep" role="separator"></span>'
        : `<button type="button" class="tool" data-tool="${t.id}" title="${t.label} (${t.key})"` +
          `${t.action ? '' : ' aria-pressed="false"'}>` +
          `<span class="ico" data-icon="${t.id}"></span><span class="tool-label">${t.label}</span>` +
          `<kbd class="tool-key">${t.key}</kbd></button>`
    ).join('');
    App.icons.apply(bar);
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('.tool');
      if (btn) onToolClick(btn.dataset.tool);
    });
    setTool(ui.tool);
  }

  function onToolClick(id) {
    const t = TOOLS.find((x) => x.id === id);
    if (t.action) {
      toast('선택한 항목이 없습니다.');
      return;
    }
    setTool(id);
    if (id !== 'select') {
      hint(t.stage ? `‘${t.label}’ 도구는 ${t.stage}단계에서 만듭니다.` : `‘${t.label}’ 도구는 아직 만들기 전입니다.`);
    }
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
    $('#btnSettings').addEventListener('click', () => toast('설정 화면은 7단계에서 만듭니다.'));
    $('#btnUnits').addEventListener('click', () => toast('단위 설정은 7단계에서 만듭니다.'));
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
  function hint(msg) {
    const el = $('#toolHint');
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => el.classList.remove('is-show'), 2600);
  }
})();
