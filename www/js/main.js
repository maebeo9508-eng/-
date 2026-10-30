/* 앱 시작: 도면 데이터, 캔버스, 도구, 화면 구성을 연결 */
(function () {
  'use strict';
  const App = window.App;

  // 설정 기본값. 설정 화면(settings.js)에서 고치고 기기에 저장되어 다음 실행 때도 유지
  App.DEFAULT_SETTINGS = {
    lengthUnit: 'mm',
    areaUnit: '㎡',
    decimals: 0,
    runUnit: 'm',         // 배관·전선관 길이: 'm' 고정 또는 'unit' 길이 단위 따름
    gridSize: 100,
    showGrid: true,
    snapGrid: true,
    snapEnd: true,
    snapMid: true,
    snapFace: true,       // 벽면·선 위
    ortho: true,          // 직교 고정. Shift를 누르는 동안 반대로
    stretchWalls: true,   // 벽을 옮길 때 이어진 벽도 같이 늘림 (끄면 고른 것만 이동)
    wallHeight: 2400,     // 새 벽 높이
    ceilingHeight: 2400,  // 새 방 천장 높이
    dimTextSize: 150,     // 치수 글자 크기(mm). 화면에서는 11~22px 안에서
    theme: 'light',       // light | dark | auto(기기 설정 따라)
  };
  App.SETTING_CHOICES = {
    lengthUnit: ['mm', 'cm', 'm', 'ft'],
    areaUnit: ['㎡', '평', 'ft²'],
    decimals: [0, 1, 2, 3],
    runUnit: ['m', 'unit'],
    theme: ['light', 'dark', 'auto'],
  };
  App.settings = App.storage.loadSettings(App.DEFAULT_SETTINGS, App.SETTING_CHOICES);
  App.saveSettings = () => App.storage.saveSettings(App.settings);
  App.settingsUI.applyTheme(); // 캔버스가 색을 읽기 전에

  // 그린 것이 없을 때 '화면 맞춤' 범위(mm): 10m × 8m
  App.DEFAULT_VIEW_RECT = { minX: 0, minY: 0, maxX: 10000, maxY: 8000 };

  App.icons.apply(document);

  App.doc = new App.model.Doc();
  // 기록 직전에 딸린 데이터를 같은 실행 취소 단계 안에서 맞춤: 벽 두께·없어진 벽의 문·창문, 그다음 방 경계
  App.doc.beforeCommit((tx) => App.catalog.syncHook(tx));
  App.doc.beforeCommit((tx) => App.rooms.syncRooms(tx));
  App.doc.beforeCommit((tx) => App.catalog.roomHook(tx)); // 아이템·기둥이 속한 방
  App.doc.reset(App.catalog.defaultElements()); // 새 도면: 기본 벽 종류·프리셋 (8단계에서 저장된 도면 불러오기)
  App.current = {}; // 도구가 쓸 지금 고른 벽 종류·프리셋
  App.catalog.ensureCurrent();
  App.selection = new App.Selection();
  const plan = (App.plan = new App.PlanCanvas(document.getElementById('plan'), document.getElementById('stage')));
  const nav = (App.nav = new App.ViewNavigator(plan));

  plan.addLayer((p) => App.draw.scene(p));
  plan.addLayer((p) => App.tools.overlay(p));

  // 축척 막대: 화면에서 110px 안팎이 되는 1·2·5 단위 길이
  const scaleBar = document.getElementById('scaleBar');
  const scaleLabel = document.getElementById('scaleLabel');
  let lastScale = 0;
  App.ui.on('settings', () => { lastScale = 0; }); // 단위가 바뀌면 축척 글자도 다시
  plan.onRender(() => {
    const scale = plan.view.scale;
    if (scale === lastScale) return;
    lastScale = scale;
    const raw = 110 / scale;
    const pow = 10 ** Math.floor(Math.log10(raw));
    const n = raw / pow;
    const len = (n >= 5 ? 5 : n >= 2 ? 2 : 1) * pow;
    scaleBar.style.width = len * scale + 'px';
    scaleLabel.textContent = App.units.formatLength(len);
  });

  // 마우스 위치 좌표 (PC)
  const coords = document.getElementById('coords');
  nav.onHover((w) => {
    coords.hidden = !w;
    if (w) coords.textContent = `X ${App.units.formatLength(w.x, false)}  Y ${App.units.formatLength(w.y)}`;
  });

  // 모바일 서랍이 캔버스 아래쪽을 덮는 만큼 화면 맞춤에서 피함
  App.ui.on('sheet', (h) => {
    plan.insets.bottom = h;
  });
  App.ui.on('tool', (id) => App.tools.set(id));

  App.doc.onChange(() => {
    App.tools.onDocChange();
    App.ui.updateHistory();
    plan.requestRender();
  });

  App.ui.init();
  App.props.init();
  App.catalogUI.init();
  App.summary.init();
  App.underlay.init();
  App.edit.init();
  App.settingsUI.init();
  App.textEditor.init();
  App.keys.init();
  App.ui.updateHistory();

  // 화면 맞춤 때 위쪽 버튼 묶음에 도면이 가리지 않게
  const stageTop = document.getElementById('stageTop');
  const setTopInset = () => {
    plan.insets.top = stageTop.offsetTop + stageTop.offsetHeight;
  };
  document.getElementById('btnFit').addEventListener('click', () => {
    setTopInset();
    plan.fitToContent();
  });

  plan.resize();
  setTopInset();
  App.projects.init(); // 마지막에 열었던 도면과 화면 위치를 불러옴 (처음이면 새 도면, 화면 맞춤)

  // 오프라인 동작: 앱 파일을 기기에 담아 둠 (웹 주소로 열었을 때. 파일로 직접 열거나 Capacitor 앱 안에서는 필요 없음)
  const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !native) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(() => { /* 안 되면 온라인에서만 */ });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) App.ui.toast('앱이 새 버전으로 바뀌었습니다. 다시 열면 적용됩니다.');
    });
  }
})();
