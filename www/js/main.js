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
    showRulers: false,    // 위·왼쪽 눈금자
    showWallLengths: true, // 벽마다 중심선 길이 글자 (치수를 넣었으면 꺼서 깔끔하게)
    showDistances: true,   // 기호·가구·기둥을 고르거나 옮길 때 벽까지 거리
    itemNames: true,       // 조감도 모드: 물건 이름표
    planPictures: true,    // 조감도 물건을 위에서 본 그림으로 (끄면 기호)
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
    // 화면 돌리기: 휴대폰(짧은 쪽 600 미만)은 세로 고정이 기본 — 도면을 만지다 화면이 저절로 돌아가지 않게. 태블릿·PC는 기기 따라
    rotate: Math.min((window.screen && window.screen.width) || 9999, (window.screen && window.screen.height) || 9999) < 600 ? 'lock' : 'free',
  };
  App.SETTING_CHOICES = {
    lengthUnit: ['mm', 'cm', 'm', 'ft'],
    areaUnit: ['㎡', '평', 'ft²'],
    decimals: [0, 1, 2, 3],
    runUnit: ['m', 'unit'],
    theme: ['light', 'dark', 'auto'],
    rotate: ['lock', 'free'],
  };
  App.settings = App.storage.loadSettings(App.DEFAULT_SETTINGS, App.SETTING_CHOICES);
  App.saveSettings = () => App.storage.saveSettings(App.settings);
  App.settingsUI.applyTheme(); // 캔버스가 색을 읽기 전에
  App.settingsUI.applyRotation(); // 휴대폰은 세로 고정 (설정 → 화면에서 바꿈)

  // 그린 것이 없을 때 '화면 맞춤' 범위(mm): 10m × 8m
  App.DEFAULT_VIEW_RECT = { minX: 0, minY: 0, maxX: 10000, maxY: 8000 };

  App.icons.apply(document);

  App.doc = new App.model.Doc();
  // 기록 직전에 딸린 데이터를 같은 실행 취소 단계 안에서 맞춤: 벽 두께·없어진 벽의 문·창문, 그다음 방 경계
  App.doc.beforeCommit((tx) => App.catalog.syncHook(tx));
  App.doc.beforeCommit((tx) => App.rooms.syncRooms(tx));
  App.doc.onChange(() => App.rooms.flushNotice()); // 칸막이로 나뉜 쪽이 방이 아니면 알림
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
    // 단위가 m 등일 때 0.2처럼 작은 값도 보이게, ft는 1·2·5 ft 단위로 (내보내기 그림과 같은 계산)
    const bar = App.units.niceBar(110, scale);
    scaleBar.style.width = bar.mm * scale + 'px';
    scaleLabel.textContent = bar.text;
  });

  // 마우스 위치 좌표 (PC). 눈금자에도 표시
  const coords = document.getElementById('coords');
  nav.onHover((w) => {
    coords.hidden = !w;
    if (w) coords.textContent = `X ${App.units.formatLength(w.x, false)}  Y ${App.units.formatLength(w.y)}`;
    if (plan.rulerSize || plan.rulerHover) {
      plan.rulerHover = w;
      plan.requestRender();
    }
  });

  // 눈금자: 켜면 위쪽 버튼 묶음과 축척 표시가 자 안쪽으로 비켜남
  const stage = document.getElementById('stage');
  const applyRulers = () => {
    stage.classList.toggle('has-rulers', !!plan.rulerSize);
    plan.insets.left = plan.rulerSize;
    plan.requestRender();
  };
  App.ui.on('settings', applyRulers);
  App.ui.on('mode', applyRulers); // 설계 모드에서는 눈금자를 그리지 않음 (도면에 치수가 있고, 자리가 아까움)

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
  App.modes.init();
  App.props.init();
  App.catalogUI.init();
  App.summary.init();
  App.underlay.init();
  App.edit.init();
  App.settingsUI.init();
  App.libraryUI.init();
  App.designUI.init();
  App.textEditor.init();
  App.keys.init();
  App.ui.updateHistory();

  // 화면 맞춤 때 위쪽 버튼 묶음에 도면이 가리지 않게
  const stageTop = document.getElementById('stageTop');
  const setTopInset = () => {
    plan.insets.top = stageTop.offsetTop + stageTop.offsetHeight;
  };
  document.getElementById('btn3d').addEventListener('click', () => (App.modes.is('design') ? App.designUI.open3d() : App.view3d.open()));
  document.getElementById('btnFit').addEventListener('click', () => {
    setTopInset();
    plan.fitToContent();
  });

  applyRulers();
  plan.resize();
  setTopInset();
  App.projects.init(); // 마지막에 열었던 도면과 화면 위치를 불러옴 (처음이면 새 도면, 화면 맞춤)

  /* ── 아이폰·아이패드 ── */
  if (App.platform.ios) {
    // 버튼·속성 칸을 두 손가락으로 벌리면 화면 전체가 커지던 것을 막음 (도면은 캔버스가 따로 확대)
    ['gesturestart', 'gesturechange'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
    // 사파리는 모르는 확장자(.dwg·.dxf)를 고를 수 없게 흐리게 보여 줌 → 아무 파일이나 고르고 앱이 확인
    document.getElementById('importFile').removeAttribute('accept');
    document.documentElement.classList.add('is-ios');
  }
  // 브라우저가 저장 공간이 부족할 때 도면을 지우지 않게 부탁 (지원하는 브라우저만)
  if (!App.platform.native && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  // 아이폰 사파리로 열었으면 한 번만: 홈 화면에 추가하면 앱처럼 쓰고, 도면도 지워지지 않음
  if (App.platform.ios && !App.platform.standalone && !App.platform.native && /^https?:$/.test(location.protocol)) {
    let seen = false;
    try { seen = localStorage.getItem('hjdm.iosHint') === '1'; } catch (_) { /* 저장이 막혀 있으면 매번 안내 */ }
    if (!seen) {
      // 처음 안내 창이 열려 있으면 닫힌 뒤에
      const show = () => {
        if (!document.getElementById('dialog').hidden) { setTimeout(show, 1000); return; }
        App.ui.dialog({
          title: '아이폰에서 앱처럼 쓰기',
          html: `<ol class="ios-steps">
              <li>사파리 아래쪽(아이패드는 위쪽)의 <b>공유 버튼</b> <span class="ios-share" aria-hidden="true">⬆︎</span>을 누르세요.</li>
              <li>목록에서 <b>홈 화면에 추가</b>를 누르세요.</li>
              <li>홈 화면의 <b>현장도면</b> 아이콘으로 여세요. 인터넷이 없어도 열립니다.</li>
            </ol>
            <p class="props-meta">사파리에서만 쓰면 오래 열지 않을 때 기기가 저장한 도면을 지울 수 있습니다. 홈 화면 앱으로 쓰고, 중요한 도면은 파일 → 백업 저장으로 보관하세요.</p>`,
          actions: [{ id: 'ok', label: '알겠습니다', primary: true }],
        }).then(() => { try { localStorage.setItem('hjdm.iosHint', '1'); } catch (_) { /* 무시 */ } });
      };
      setTimeout(show, 2500);
    }
  }

  // 오프라인 동작: 앱 파일을 기기에 담아 둠 (웹 주소로 열었을 때. 파일로 직접 열거나 Capacitor 앱 안에서는 필요 없음)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !App.platform.native) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(() => { /* 안 되면 온라인에서만 */ });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) App.ui.toast('앱이 새 버전으로 바뀌었습니다. 다시 열면 적용됩니다.');
    });
  }
})();
