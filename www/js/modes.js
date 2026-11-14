/* 두 가지 모드: 인테리어 도면 / 조감도(행사).
   모드는 도면마다 저장(App.current.mode)되고, 모드에 따라 도구 줄·집계표·새 도면 템플릿이 달라진다.
   그린 것은 모드와 상관없이 그대로 보인다 (행사장을 벽으로 그린 뒤 조감도 모드에서 물건을 놓는 식으로 같이 씀) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const $ = (sel) => document.querySelector(sel);

  // tools: 도구 줄 순서. '|'는 구분선
  const LIST = [
    {
      id: 'interior', label: '인테리어', icon: 'room',
      title: '인테리어 도면', desc: '벽·방·문·창문을 그리고 자재 물량을 집계',
      tools: ['select', '|', 'wall', 'room', 'door', 'window', 'column', '|', 'elec', 'mech', 'furn', 'line', '|', 'zone', 'text', 'dim', '|', 'erase'],
    },
    {
      id: 'event', label: '조감도', icon: 'event',
      title: '조감도 (행사)', desc: '텐트·무대·좌석 배치, 동선 체크, 3D로 걸어서 둘러보기',
      tools: ['select', '|', 'event', 'route', 'zone', '|', 'text', 'dim', '|', 'wall', 'door', 'window', 'column', '|', 'erase'],
    },
  ];
  const byId = (id) => LIST.find((m) => m.id === id) || LIST[0];

  const modes = {
    LIST,
    get() {
      return byId(App.current && App.current.mode).id;
    },
    is(id) {
      return modes.get() === id;
    },
    def() {
      return byId(modes.get());
    },
    /** 지금 모드의 도구 줄 ('|'는 구분선) */
    tools() {
      return modes.def().tools;
    },
    /** 예전 도면(모드가 생기기 전): 행사 물건이 있으면 조감도, 아니면 인테리어 */
    infer(current, elements) {
      if (current && LIST.some((m) => m.id === current.mode)) return current.mode;
      return (elements || []).some((e) => e.type === 'route' || (e.type === 'item' && e.category === 'event')) ? 'event' : 'interior';
    },
    /** 모드 바꾸기: 이 도면에 저장하고 도구 줄·집계를 그 모드로 */
    set(id, quiet = false) {
      const m = byId(id);
      if (App.current.mode !== m.id) {
        App.current.mode = m.id;
        if (App.projects && App.projects.current) App.projects.saveNow();
      }
      modes.sync();
      if (!quiet) App.ui.toast(`${m.title} 모드: ${m.desc}`);
    },
    /** 화면을 지금 모드에 맞춤 (도면을 열었을 때, 모드를 바꿨을 때) */
    sync() {
      const m = modes.def();
      document.documentElement.dataset.mode = m.id;
      const btn = $('#btnMode');
      if (btn) {
        $('#modeLabel').textContent = m.label;
        const ico = $('#modeIcon');
        ico.dataset.icon = m.icon;
        App.icons.apply(btn);
        btn.title = `지금 모드: ${m.title} (눌러서 바꾸기)`;
        document.querySelectorAll('#modeMenu [data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === m.id)));
      }
      App.ui.rebuildToolbar();
      App.ui.emit('mode', m.id);
      if (App.plan) App.plan.requestRender();
    },
    init() {
      const btn = $('#btnMode'), menu = $('#modeMenu');
      menu.innerHTML = LIST.map((m) => `
        <button type="button" class="menu-item opt-item" role="menuitemradio" data-mode="${m.id}" aria-checked="false">
          <span class="opt-text"><b>${m.title}</b><small>${m.desc}</small></span>
        </button>`).join('');
      const close = () => {
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      };
      btn.addEventListener('click', () => {
        if (!menu.hidden) return close();
        menu.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
      });
      menu.addEventListener('click', (e) => {
        const b = e.target.closest('[data-mode]');
        if (!b) return;
        close();
        if (b.dataset.mode !== modes.get()) modes.set(b.dataset.mode);
      });
      document.addEventListener('pointerdown', (e) => {
        if (!menu.hidden && !e.target.closest('.mode-wrap')) close();
      });
      App.ui.on('project', () => modes.sync()); // 다른 도면을 열면 그 도면의 모드로
      modes.sync();
    },
  };

  App.modes = modes;
})();
