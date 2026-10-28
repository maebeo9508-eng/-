/* 앱 시작: 도면 데이터, 캔버스, 도구, 화면 구성을 연결 */
(function () {
  'use strict';
  const App = window.App;

  // 7단계에서 설정 화면과 저장 기능으로 옮김
  App.settings = {
    lengthUnit: 'mm',
    areaUnit: '㎡',
    decimals: 0,
    gridSize: 100,
    showGrid: true,
    snapGrid: true,
    snapEnd: true,
    snapMid: true,
    ortho: true,          // 직교 고정. Shift를 누르는 동안 반대로
    wallThickness: 100,
    wallHeight: 2400,
  };
  // 그린 것이 없을 때 '화면 맞춤' 범위(mm): 10m × 8m
  App.DEFAULT_VIEW_RECT = { minX: 0, minY: 0, maxX: 10000, maxY: 8000 };

  App.icons.apply(document);

  App.doc = new App.model.Doc();
  App.doc.beforeCommit((tx) => App.rooms.syncRooms(tx)); // 벽이 바뀌면 방 경계도 같은 실행 취소 단계에서 맞춤
  App.selection = new App.Selection();
  const plan = (App.plan = new App.PlanCanvas(document.getElementById('plan'), document.getElementById('stage')));
  const nav = (App.nav = new App.ViewNavigator(plan));

  plan.addLayer((p) => App.draw.scene(p));
  plan.addLayer((p) => App.tools.overlay(p));

  // 축척 막대: 화면에서 110px 안팎이 되는 1·2·5 단위 길이
  const scaleBar = document.getElementById('scaleBar');
  const scaleLabel = document.getElementById('scaleLabel');
  let lastScale = 0;
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
  App.keys.init();
  App.ui.updateHistory();

  // 화면 맞춤 때 위쪽 스냅 버튼 줄에 도면이 가리지 않게
  const snapbar = document.getElementById('snapbar');
  const fit = () => {
    plan.insets.top = snapbar.offsetTop + snapbar.offsetHeight;
    plan.fitToContent();
  };
  document.getElementById('btnFit').addEventListener('click', fit);

  plan.resize();
  fit();
})();
