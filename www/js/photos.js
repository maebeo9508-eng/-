/* 현장 사진 핀: 번호(놓은 순서), 사진 크게 보기(넘기기·지우기), 사진 더하기.
   핀은 도면 요소(type 'photo'), 사진은 이미지 저장소(images.js)에 줄여서 들어감 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** 핀 목록: 놓은 순서대로 */
  const all = () => [...App.doc.all()].filter((e) => e.type === 'photo').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)));
  let numCache = { version: -1, map: new Map() };
  /** 핀 번호 (1부터, 놓은 순서) */
  function numberOf(id) {
    if (numCache.version !== App.doc.version) numCache = { version: App.doc.version, map: new Map(all().map((p, i) => [p.id, i + 1])) };
    return numCache.map.get(id) || 0;
  }
  const dateText = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const title = (ph) => ph.title || `사진 ${numberOf(ph.id)}`;

  /** 사진 고르기. 안드로이드 앱은 파일 고르는 창에 카메라가 없어서 ‘찍기 / 고르기’를 먼저 물음
      (아이폰·휴대폰 브라우저는 고르는 창에서 바로 찍을 수 있음) */
  async function pick() {
    const androidApp = App.platform.native && /android/i.test(navigator.userAgent);
    if (!androidApp) return App.images.pickMany();
    const r = await App.ui.dialog({
      title: '현장 사진',
      html: '<p><b>카메라</b>로 바로 찍거나, <b>사진첩</b>에서 찍어 둔 사진을 여러 장 고르세요.</p>',
      actions: [{ id: 'cancel', label: '취소' }, { id: 'pick', label: '사진첩' }, { id: 'camera', label: '카메라', primary: true }],
    });
    if (r.id === 'camera') return App.images.pickMany({ camera: true });
    if (r.id === 'pick') return App.images.pickMany();
    return [];
  }

  /** 핀에 사진 더하기 */
  async function addTo(id) {
    const ph = App.doc.get(id);
    if (!ph) return 0;
    const more = await pick();
    if (!more.length || !App.doc.has(id)) return 0;
    App.doc.transact('사진 더하기', () => App.doc.update(id, { photos: [...(App.doc.get(id).photos || []), ...more] }));
    App.ui.toast(`사진 ${more.length}장을 더했습니다.`);
    return more.length;
  }
  function removeAt(id, i) {
    const ph = App.doc.get(id);
    if (!ph || ph.locked) return false;
    const photos = (ph.photos || []).filter((_, k) => k !== i);
    App.doc.transact('사진 빼기', () => App.doc.update(id, { photos }));
    return true;
  }

  /* ── 사진 크게 보기: 넘기기(←→·밀기), 지우기, 닫기(Esc·뒤로) ── */
  let viewer = null;
  function ensureViewer() {
    if (viewer) return viewer;
    const el = document.createElement('div');
    el.className = 'photo-viewer';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '사진 보기');
    el.innerHTML = `
      <div class="pv-top"><div class="pv-title"></div><button type="button" class="btn" data-pv="close" aria-label="닫기">✕</button></div>
      <div class="pv-stage"><img class="pv-img" alt=""><p class="pv-missing" hidden>이 기기에서 사진을 찾지 못했습니다.</p></div>
      <div class="pv-bottom">
        <button type="button" class="btn" data-pv="prev" aria-label="앞 사진">‹</button>
        <span class="pv-count"></span>
        <button type="button" class="btn" data-pv="next" aria-label="다음 사진">›</button>
        <button type="button" class="btn btn-danger" data-pv="del">이 사진 빼기</button>
      </div>`;
    document.body.appendChild(el);
    viewer = { el, id: null, i: 0 };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pv]');
      if (!b) {
        if (performance.now() - (viewer.swiped || 0) < 500) return; // 마우스로 밀어 넘긴 뒤의 클릭은 닫기가 아님
        if (e.target === el || e.target.classList.contains('pv-stage')) close();
        return;
      }
      const act = b.dataset.pv;
      if (act === 'close') close();
      else if (act === 'prev') go(-1);
      else if (act === 'next') go(1);
      else if (act === 'del') {
        const ph = App.doc.get(viewer.id);
        if (!ph) return close();
        if (ph.locked) { App.ui.toast('잠긴 핀입니다. 속성에서 잠금을 풀고 빼세요.'); return; }
        removeAt(viewer.id, viewer.i);
        App.ui.toast('사진을 뺐습니다. 되돌리기: Ctrl+Z (휴대폰은 닫은 뒤 위쪽 ↶)');
        const left = (App.doc.get(viewer.id).photos || []).length;
        if (!left) close();
        else { viewer.i = Math.min(viewer.i, left - 1); show(); }
      }
    });
    // 밀어서 넘기기
    let sx = null;
    el.addEventListener('pointerdown', (e) => { sx = e.clientX; });
    el.addEventListener('pointerup', (e) => {
      if (sx != null && Math.abs(e.clientX - sx) > 50) { go(e.clientX < sx ? 1 : -1); viewer.swiped = performance.now(); }
      sx = null;
    });
    // 보는 동안에는 도면 단축키가 먹지 않게 (화살표로 핀이 옮겨지거나 Delete로 핀이 지워지지 않게)
    document.addEventListener('keydown', (e) => {
      if (el.hidden) return;
      if (e.key === 'Tab') return; // 버튼 사이 옮기기는 그대로
      const mod = e.ctrlKey || e.metaKey;
      if (mod && /^[zy]$/i.test(e.key)) return; // 되돌리기·다시 하기는 그대로 (보기도 바로 바뀜)
      e.stopPropagation();
      if (mod || e.altKey || /^F\d+$/.test(e.key)) return; // 브라우저 확대·새로 고침 같은 것은 그대로 (도면 단축키로는 안 감)
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key !== 'Enter' && e.key !== ' ') e.preventDefault();
    }, true);
    App.ui.on('images', () => { if (!el.hidden) show(); });
    // 되돌리기·다른 곳에서 고친 것도 바로 반영 (핀이 지워지면 닫음)
    App.doc.onChange(() => { if (!el.hidden) show(); });
    return viewer;
  }
  function show() {
    const v = viewer, ph = App.doc.get(v.id);
    if (!ph || !(ph.photos || []).length) return close();
    const list = ph.photos;
    v.i = Math.max(0, Math.min(list.length - 1, v.i));
    const p = list[v.i], url = App.images.url(p.id);
    v.el.querySelector('.pv-title').innerHTML = `<b>${esc(numberOf(ph.id))}. ${esc(title(ph))}</b>${p.at ? `<small>${esc(dateText(p.at))}</small>` : ''}`;
    const img = v.el.querySelector('.pv-img');
    if (url) img.src = url;
    img.hidden = !url;
    v.el.querySelector('.pv-missing').hidden = !!url || !App.images.missing(p.id);
    v.el.querySelector('.pv-count').textContent = `${v.i + 1} / ${list.length}`;
    v.el.querySelector('[data-pv="prev"]').disabled = v.i === 0;
    v.el.querySelector('[data-pv="next"]').disabled = v.i >= list.length - 1;
    v.el.querySelector('[data-pv="del"]').disabled = !!ph.locked;
  }
  function go(d) {
    const ph = App.doc.get(viewer.id);
    if (!ph) return;
    viewer.i = Math.max(0, Math.min((ph.photos || []).length - 1, viewer.i + d));
    show();
  }
  function open(id, i = 0) {
    const ph = App.doc.get(id);
    if (!ph || !(ph.photos || []).length) return false;
    ensureViewer();
    viewer.id = id;
    viewer.i = Math.max(0, Math.min(ph.photos.length - 1, i));
    viewer.back = document.activeElement;
    viewer.el.hidden = false;
    show();
    viewer.el.querySelector('[data-pv="close"]').focus({ preventScroll: true });
    return true;
  }
  function close() {
    if (!viewer || viewer.el.hidden) return;
    viewer.el.hidden = true;
    const back = viewer.back;
    viewer.back = null;
    if (back && back.focus && document.contains(back)) back.focus({ preventScroll: true });
  }
  const isOpen = () => !!viewer && !viewer.el.hidden;

  App.photos = { all, numberOf, title, dateText, pick, addTo, removeAt, open, close, isOpen };
})();
