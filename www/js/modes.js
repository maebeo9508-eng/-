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
      tools: ['select', '|', 'wall', 'room', 'door', 'window', 'column', '|', 'elec', 'mech', 'furn', 'line', '|', 'zone', 'text', 'photo', 'dim', '|', 'erase'],
    },
    {
      id: 'event', label: '조감도', icon: 'event',
      title: '조감도 (행사)', desc: '텐트·무대·좌석 배치, 동선 체크, 3D로 걸어서 둘러보기',
      tools: ['select', '|', 'event', 'route', 'zone', '|', 'text', 'photo', 'dim', '|', 'wall', 'door', 'window', 'column', '|', 'erase'],
    },
  ];
  const byId = (id) => LIST.find((m) => m.id === id) || LIST[0];

  /* 처음 쓰는 사람 안내: 모드마다 한 번 (파일 → 사용 안내로 다시 봄). 자동 시험(웹드라이버) 중에는 띄우지 않음 */
  const GUIDE = {
    interior: {
      title: '인테리어 도면 — 이렇게 쓰세요',
      steps: [
        ['벽', '<b>벽</b>(W)으로 외곽을 그리고 <b>방</b>(R)으로 벽 안쪽을 누르면 바닥·벽·천장 면적이 바로 나옵니다.'],
        ['door', '<b>문·창문·전기·설비·가구</b>를 놓으세요. 가구는 분류를 고르고 그림을 누르면 됩니다. 고른 가구는 둥근 손잡이로 돌리고, 아래 막대로 복제·줄 세우기.'],
        ['room', '방을 고르면 <b>바닥 모양</b>(마루·타일·대리석…)과 <b>벽지 색</b>을 바꿀 수 있습니다. 평면과 3D에 바로 보입니다.'],
        ['sum', '<b>집계</b> 탭에서 자재·수량을 보고, <b>견적</b>에 단가를 넣으면 금액·부가세가 계산되어 견적서 PDF가 나옵니다. <b>사진</b>(O)으로 현장 사진을 그 자리에 꽂아 두세요.'],
        ['cube', '<b>3D 보기</b>로 돌려 보고 <b>걷기</b>로 방 안을 둘러보세요. <b>영상</b>으로 동영상도 저장합니다. 파일 → <b>제안서</b>는 표지·3D·도면·견적·사진을 PDF 한 묶음으로 만듭니다.'],
      ],
    },
    event: {
      title: '조감도 (행사) — 이렇게 쓰세요',
      steps: [
        ['event', '<b>물건</b>(H) → 위쪽 분류(구조물·좌석·운동·경기…)를 고르고 그림을 눌러 놓습니다. <b>전체 보기</b>로 91가지를 찾을 수 있습니다. 부스는 속성에서 <b>번호·업체</b>를 붙입니다.'],
        ['turn', '고른 물건은 <b>둥근 손잡이</b>로 돌리고 네모 손잡이로 크기를 바꿉니다. 아래 막대: 15° 돌리기·복제·줄 세우기.'],
        ['route', '<b>동선</b>(P)을 그리면 통로 폭 안에 걸리는 물건을 빨갛게 알려 줍니다. 영역을 고르면 <b>좌석·주차 칸 채우기</b>, <b>둘레 펜스</b>를 한 번에 할 수 있습니다.'],
        ['sum', '<b>집계</b>에서 <b>구역별</b> 물건·좌석 수와 <b>안전 점검</b>(화장실·소화기·의료·밀집·대피·안전 요원·전기)을 보고 <b>체크리스트</b>(반입·설치·점검·철거)를 뽑습니다. <b>견적</b>에 렌탈 단가를 넣으면 견적서, 파일 → <b>제안서</b>는 PDF 한 묶음.'],
        ['cube', '<b>3D 보기</b>: 낮·노을·밤, 걷기, 이름표·<b>인파</b>·<b>걷는 사람</b>·시점 저장, 사진·<b>영상</b> 저장. 파일 → <b>현장 배치도</b>로 인쇄용 한 장. 파일 → 새 도면의 <b>자동 배치</b>는 종류·인원·크기·입구 쪽만 넣으면 무대·객석·부스·화장실·펜스·동선·안전 요원까지 한 번에 놓습니다 (예시도 거기에).'],
      ],
    },
  };
  function guide(id = modes.get(), force = false) {
    const g = GUIDE[id];
    if (!g || !App.ui || !App.ui.dialog) return;
    const key = `hjdm.guide.${id}`;
    if (!force) {
      if (navigator.webdriver) return;
      try { if (localStorage.getItem(key)) return; } catch (_) { return; }
      if (!document.getElementById('dialog').hidden) return; // 다른 창이 열려 있으면 다음에
    }
    App.ui.dialog({
      title: g.title,
      html: `<ol class="guide-steps">${g.steps.map(([, html], i) => `<li><span class="guide-no">${i + 1}</span><p>${html}</p></li>`).join('')}</ol>
        <p class="props-meta">이 안내는 파일 메뉴의 ‘사용 안내’에서 다시 볼 수 있습니다. PC에서는 ? 키로 단축키를 봅니다.</p>`,
      actions: [{ id: 'ok', label: '시작하기', primary: true }],
    }).then(() => { try { localStorage.setItem(key, '1'); } catch (_) { /* 무시 */ } });
  }

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
    /** 화면을 지금 모드에 맞춤 (도면을 열었을 때, 모드를 바꿨을 때): 도구 줄, 화면 색, 위쪽 이름 */
    sync() {
      const m = modes.def();
      const changed = document.documentElement.dataset.mode !== m.id;
      document.documentElement.dataset.mode = m.id;
      document.querySelectorAll('#modeSwitch [data-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === m.id)));
      const sub = $('#brandSub');
      if (sub) sub.textContent = m.id === 'event' ? '행사 조감도' : '물량 집계';
      if (changed && App.plan) App.plan.readTheme(); // 모드마다 강조색이 다름
      App.ui.rebuildToolbar();
      App.ui.emit('mode', m.id);
      if (App.plan) App.plan.requestRender();
      if (changed) setTimeout(() => guide(m.id), 900);
    },
    guide,
    init() {
      $('#modeSwitch').addEventListener('click', (e) => {
        const b = e.target.closest('[data-mode]');
        if (b && b.dataset.mode !== modes.get()) modes.set(b.dataset.mode);
      });
      App.ui.on('project', () => modes.sync()); // 다른 도면을 열면 그 도면의 모드로
      modes.sync();
    },
  };

  App.modes = modes;
})();
