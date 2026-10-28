/* 앱 시작: 캔버스, 화면 이동, 화면 구성을 연결 */
(function () {
  'use strict';
  const App = window.App;

  // 7단계에서 설정 화면과 저장 기능으로 옮김
  App.settings = { gridSize: 100, showGrid: true };
  // 그린 것이 없을 때 '화면 맞춤' 범위(mm): 10m × 8m
  App.DEFAULT_VIEW_RECT = { minX: 0, minY: 0, maxX: 10000, maxY: 8000 };

  const fmt = (n) => (Math.round(n) || 0).toLocaleString('ko-KR');

  App.icons.apply(document);

  const plan = (App.plan = new App.PlanCanvas(document.getElementById('plan'), document.getElementById('stage')));
  const nav = (App.nav = new App.ViewNavigator(plan));

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
    scaleLabel.textContent = fmt(len) + ' mm';
  });

  // 마우스 위치 좌표 (PC)
  const coords = document.getElementById('coords');
  nav.onHover((w) => {
    coords.hidden = !w;
    if (w) coords.textContent = `X ${fmt(w.x)}  Y ${fmt(w.y)} mm`;
  });

  // 모바일 서랍이 캔버스 아래쪽을 덮는 만큼 화면 맞춤에서 피함
  App.ui.on('sheet', (h) => {
    plan.insets.bottom = h;
  });

  App.ui.init();
  document.getElementById('btnFit').addEventListener('click', () => plan.fitToContent());

  plan.resize();
  plan.fitToContent();
})();
