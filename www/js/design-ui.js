/* 설계 모드 화면: 설계물 고르기·새로 만들기, 값 고치기(속성 칸), 부재표(집계 칸), 부재 고르기·끌기·그리기 도구, 3D 보기, 내 사물로 등록.
   설계물은 도면 요소(type 'design')라서 실행 취소·자동 저장·백업을 그대로 따른다. 지금 보는 설계물은 App.current.designId */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const D = () => App.design, DD = () => App.designDraw;
  const fmt = (v) => DD().fmt(v);
  const isMode = () => App.modes.is('design');
  const cur = () => D().current();
  const render = () => { if (App.plan) App.plan.requestRender(); renderQuick(); previewKick(); if (App.design3d) App.design3d.kick(); };
  const numIn = (v) => { const n = Number(String(v == null ? '' : v).replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : NaN; };
  let sel = null;       // 고른 부재 id
  let formKey = '';     // 속성 칸을 통째로 다시 그릴지
  const uid = () => `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  /** 화면 맞춤: 위쪽 버튼 줄(보는 그림·설계물 막대) 높이를 다시 재고 맞춤 */
  function fit() {
    const st = document.getElementById('stageTop');
    if (st && App.plan && st.offsetHeight) App.plan.insets.top = App.ui.topInset ? App.ui.topInset() : st.offsetTop + st.offsetHeight;
    App.plan.fitToContent();
  }
  /* 맞춘 화면을 사용자가 손으로 확대·이동했는지: 맞춘 직후의 화면 값을 기억해 두고 견줌.
     그대로면 값이 바뀌거나 서랍을 여닫을 때 다시 맞추고, 손댔으면 그 화면을 지켜 줌 (확대해서 고치는 중에 화면이 튀지 않게) */
  let fitSig = '';
  const viewSig = () => { const v = App.plan && App.plan.view; return v ? `${v.ox.toFixed(1)}|${v.oy.toFixed(1)}|${v.scale.toFixed(6)}` : ''; };
  const autoFitted = () => !!fitSig && fitSig === viewSig();
  /* ── 설계물 다루기 ── */
  function setCurrent(id, doFit = true) {
    if (App.current.designId !== id) { App.current.designId = id; App.ui.emit('current'); }
    sel = null;
    formKey = '';
    syncBar();
    refreshPanes();
    previewSync();
    sync3d();
    if (doFit && isMode()) fit();
    render();
  }
  function add(kind, preset, name) {
    const names = new Set(D().all().map((e) => e.name));
    let nm = name || D().KINDS[kind].label.replace(/\s*\(.*$/, '');
    if (names.has(nm)) { let i = 2; while (names.has(`${nm} ${i}`)) i++; nm = `${nm} ${i}`; }
    const el = D().create(kind, preset, nm);
    App.doc.transact('새 설계', () => App.doc.add(el));
    if (App.current.designView && App.current.designView !== 'front') { App.current.designView = 'front'; } // 새 설계는 정면도부터
    setCurrent(el.id);
    return el;
  }
  /** 고른 부재가 지금 그림(정면·평면·측면)에서 차지하는 종이 위 네모 */
  function selRect() {
    const el = cur(), v = viewNow(), view = ORTHO.includes(v) ? v : v === 'all' ? 'front' : null;
    const q = el && sel && view ? D().build(el).parts.find((x) => x.id === sel) : null;
    if (!q) return null;
    const L = DD().layout(el), sp = DD().partSpan(q, view), p0 = DD().paperOf(L, view, sp.lo[0], sp.lo[1]), p1 = DD().paperOf(L, view, sp.hi[0], sp.hi[1]);
    return { minX: Math.min(p0.x, p1.x), maxX: Math.max(p0.x, p1.x), minY: Math.min(p0.y, p1.y), maxY: Math.max(p0.y, p1.y) };
  }
  /** 고친 뒤 화면 살피기.
      direct(부재를 끌거나 눌러서 직접 고침): 화면을 그대로 둠 — 고치는 동안 화면이 저절로 줄거나 움직이면 일을 방해함. 고친 부재가 화면 밖에 있을 때만 맞춤.
      그 밖(속성의 값을 바꿈): 도면이 화면 밖으로 나갔거나 너무 작아졌으면 다시 맞춤 */
  function keepInView(direct = false) {
    if (!isMode() || !cur() || !App.plan) return;
    if (App.design3d && App.design3d.active()) return; // 3D 작업 화면은 따로 맞춤
    const P = App.plan, i = P.insets || {}, b = DD().bounds();
    if (!b) return;
    // 보이는 칸 (위쪽 버튼 줄·서랍을 뺀 곳)
    const a = P.view.toWorld(i.left || 0, i.top || 0), z = P.view.toWorld(P.width - (i.right || 0), P.height - (i.bottom || 0));
    if (direct) {
      const r = selRect() || DD().viewRect(cur());
      if (r) { const cx = (r.minX + r.maxX) / 2, cy = (r.minY + r.maxY) / 2; if (cx < a.x || cx > z.x || cy < a.y || cy > z.y) fit(); }
      return;
    }
    if (autoFitted()) { // 맞춘 그대로: 도면이 커져 넘치거나 훨씬 작아졌으면 다시 맞춤
      const eps = 3 / P.view.scale;
      const out = b.minX < a.x - eps || b.maxX > z.x + eps || b.minY < a.y - eps || b.maxY > z.y + eps;
      const small = b.maxX - b.minX < (z.x - a.x) * 0.45 && b.maxY - b.minY < (z.y - a.y) * 0.45;
      if (out || small) fit();
      return;
    }
    // 손으로 확대·이동한 화면: 그대로 둠. 그림이 화면에서 아주 사라졌을 때만 다시 맞춤
    const r = DD().viewRect(cur());
    if (r && (r.maxX < a.x || r.minX > z.x || r.maxY < a.y || r.minY > z.y)) fit();
  }
  let viewTimer = 0;
  const keepSoon = (direct = false) => { clearTimeout(viewTimer); viewTimer = setTimeout(() => keepInView(direct), 0); };
  /** 고치는 앞뒤로 같은 설계 좌표가 화면의 같은 자리에 있게 화면을 따라 옮김.
      (부재가 전체 범위 밖으로 나가면 그림의 기준점이 바뀌어 다른 부재들이 한꺼번에 밀려 보임 — 그 밀림을 없앰) */
  let anchor = null; // { id, view, x, y }: 지금 그림에서 설계 좌표 (0, 0)이 놓인 종이 자리
  function anchorNow() {
    const el = isMode() ? cur() : null, v = viewNow(), view = ORTHO.includes(v) ? v : v === 'all' ? 'front' : null;
    if (!el || !view || el.kind === 'model' || (App.design3d && App.design3d.active())) return null;
    const p = DD().toPaper(el, view, 0, 0);
    return { id: el.id, view, x: p.x, y: p.y };
  }
  /** 설계물이 바뀐 뒤(고치기·되돌리기·다시 하기): 그림의 기준점이 밀렸으면 화면을 그만큼 따라 옮겨, 화면에서는 아무것도 튀지 않게 */
  function holdAnchor() {
    const now = anchorNow(), P = App.plan;
    if (anchor && now && P && anchor.id === now.id && anchor.view === now.view) {
      const dx = (anchor.x - now.x) * P.view.scale, dy = (anchor.y - now.y) * P.view.scale;
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) { const auto = autoFitted(); P.view.panBy(dx, dy); if (auto) fitSig = viewSig(); P.requestRender(); }
    }
    anchor = now;
  }
  function steady(fn) {
    const out = fn();
    holdAnchor();
    return out;
  }
  /** 설계물을 고침. direct: 부재를 직접 고친 것(옮기기·늘이기·넣기·지우기) — 화면을 그대로 둠 */
  const patch = (el, label, p, direct = false) => {
    const run = () => App.doc.transact(label, () => App.doc.update(el.id, p));
    if (direct) steady(run); else run();
    keepSoon(direct);
  };
  function setParam(el, k, v) {
    patch(el, '설계 값 바꾸기', { p: { ...el.p, [k]: v } });
  }
  function remove(el) {
    App.doc.transact('설계 지우기', () => App.doc.remove(el.id));
    const left = D().all();
    setCurrent(left.length ? left[left.length - 1].id : null);
  }
  function duplicate(el) {
    const copy = D().create(el.kind, JSON.parse(JSON.stringify(el.p || {})), `${el.name} 복사`);
    copy.parts = JSON.parse(JSON.stringify(el.parts || []));
    if (el.objId) copy.objId = el.objId;
    App.doc.transact('설계 복제', () => App.doc.add(copy));
    setCurrent(copy.id);
  }
  /** 값으로 만든 부재를 하나씩 고칠 수 있게 풀어 놓음 (자유 설계로 바뀜) */
  function explode(el) {
    const B = D().build(el);
    const face = (v) => (v && v[0] > 0.5 ? 'r' : v && v[0] < -0.5 ? 'l' : v && v[1] > 0.5 ? 'b' : null);
    const parts = B.parts.filter((q) => q.role === 'panel' || q.role === 'bar' || q.role === 'slab' || (q.role === 'fix' && !q.hd) || (q.role === 'lite' && !q.halo)).map((q) => {
      const c = { id: uid(), s: q.s, n: q.n, m: q.m, ...(q.c ? { c: q.c, fin: q.fin || '' } : {}) };
      if (q.s === 'bar') Object.assign(c, { a: q.a.slice(), b: q.b.slice() }); else Object.assign(c, { x: q.x, y: q.y, z: q.z, w: q.w, d: q.d, h: q.h });
      if (q.s === 'poly' || q.s === 'arc') Object.assign(c, { pts: q.pts.map((p) => p.slice()), ...(q.s === 'arc' ? { t: q.t } : {}) }); // 곡선 부재
      if (q.role === 'slab' || q.role === 'fix') Object.assign(c, { role: q.role, ...(q.mn ? { mn: q.mn } : {}), ...(q.gl ? { gl: true } : {}), ...(q.metal ? { metal: true } : {}) });
      if (q.eb > 0) c.eb = q.eb;
      if (q.role === 'lite') Object.assign(c, { role: 'lite', lt: q.lt, k: q.k, pf: q.pf, ...(q.run ? { run: q.run } : {}) });
      if (q.an && q.s !== 'bar') { // 3D에서 열리는 것은 풀어도 열리게
        const mo = face(q.an.t === 'door' ? q.an.out : q.an.v);
        if (q.an.t === 'door') c.mv = q.an.dir < 0 ? 'dl' : 'dr'; else { c.mv = q.front && q.role === 'panel' && !/^속서랍/.test(q.n) ? 'df' : 'dw'; c.mx = q.an.max; }
        if (mo) c.mo = mo;
      }
      return c;
    });
    const keepP = { ...(el.p && el.p.handle === 'none' ? { handle: 'none' } : {}), ...['ledType', 'ledK', 'ledProf'].reduce((t, k) => (el.p && el.p[k] ? { ...t, [k]: el.p[k] } : t), {}), ...(B.spec && B.spec.length ? { spec: B.spec.slice() } : {}), ...(typeof B.cam === 'number' ? { cam: B.cam } : {}) };
    patch(el, '부재로 풀기', { kind: 'free', p: keepP, parts });
    sel = null; formKey = '';
    refreshPanes();
  }
  const userParts = (el) => (Array.isArray(el.parts) ? el.parts : []);
  function setPart(el, id, p, label = '부재 고치기') {
    patch(el, label, { parts: userParts(el).map((q) => (q.id === id ? { ...q, ...p } : q)) }, true);
  }
  function deletePart() {
    const el = cur();
    if (!el || !sel) return false;
    const q = userParts(el).find((x) => x.id === sel);
    if (!q) { App.ui.toast('값으로 만든 부재는 지울 수 없습니다. 위 값(선반·문짝 수 등)을 바꾸거나 ‘부재로 풀기’ 한 뒤 지우세요.'); return false; }
    patch(el, '부재 지우기', { parts: userParts(el).filter((x) => x.id !== sel) }, true);
    sel = null; formKey = '';
    refreshPanes();
    return true;
  }
  function addPart(el, part, label = '부재 넣기') {
    const p = { id: uid(), ...part };
    sel = p.id; formKey = ''; // 넣은 부재가 화면 밖이면 그때만 맞추도록 먼저 고른 것으로 해 둠
    patch(el, label, { parts: [...userParts(el), p] }, true);
    refreshPanes();
    return p;
  }

  /* ── 위쪽 막대: 설계물 고르기 ── */
  function syncBar() {
    const bar = document.getElementById('designBar');
    if (!bar) return;
    bar.hidden = !isMode();
    if (!isMode()) return;
    const el = cur(), list = D().all();
    bar.innerHTML = `<button type="button" class="cat-btn cat-all" data-act="ds-new" title="자유 설계·내려받은 3D 모델·수납장·테이블·각파이프 틀·전광판">＋ 새 설계</button>`
      + list.map((e) => `<button type="button" class="cat-btn" data-design="${esc(e.id)}" aria-pressed="${!!el && e.id === el.id}" title="${esc(D().KINDS[e.kind] ? D().KINDS[e.kind].label : '')}">${esc(e.name)}</button>`).join('');
    // 휴대폰: 설계물 줄 대신 위쪽 단추 하나(지금 설계물 이름)와 그 메뉴 안의 목록
    const nm = document.getElementById('dsShowName'), menu = document.getElementById('dsMenuList');
    if (nm) nm.textContent = el ? el.name : '설계물';
    if (menu) {
      const kind = (e) => (D().KINDS[e.kind] ? D().KINDS[e.kind].label.replace(/\s*\(.*$/, '') : '');
      menu.innerHTML = list.map((e) => `<button type="button" class="ds-menu-item" data-design="${esc(e.id)}" aria-pressed="${!!el && e.id === el.id}"><b>${esc(e.name)}</b><small>${esc(kind(e))}</small></button>`).join('')
        + `<button type="button" class="ds-menu-item ds-menu-new" data-act="ds-new">＋ 새 설계</button>`;
    }
    const dims = document.getElementById('btnDsDims'), hid = document.getElementById('btnDsHidden');
    if (dims) dims.setAttribute('aria-pressed', String(App.current.designDims !== false));
    if (hid) hid.setAttribute('aria-pressed', String(App.current.designHidden !== false));
    const drs = document.getElementById('btnDsDoors');
    if (drs) { drs.setAttribute('aria-pressed', String(App.current.designDoors !== false)); drs.hidden = !(el && el.kind !== 'model' && D().movable(el).doors); }
    const v = viewNow();
    document.querySelectorAll('#dsViews [data-dview]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.dview === v)));
    syncEmpty();
  }
  function refreshPanes() {
    if (!isMode()) return;
    if (App.props && App.props.refresh) App.props.refresh();
    if (App.summary && App.summary.render) App.summary.render();
  }

  /* ── 새 설계 창 ── */
  async function newDialog() {
    const K = D().KINDS;
    let made = null;
    await App.ui.dialog({
      title: '새 설계',
      html: `
        <div class="ds-new" data-keys="local">
          <section class="ds-kind"><h3>직접 만들기</h3>
            <div class="ds-starts">
              <button type="button" class="ds-start is-main" data-kind="free"><b>자유 설계</b><span>판·막대를 하나씩 넣어 직접 모델링</span></button>
              <button type="button" class="ds-start" data-kind="model"><b>내려받은 3D 모델</b><span>GLB·<wbr>OBJ·<wbr>DAE·<wbr>STL·<wbr>zip 파일 열어 보기</span></button>
            </div>
          </section>
          <div class="ds-new-sub">규격 예시에서 고르기</div>
          ${['kitchen', 'closet', 'archwall', 'cabinet', 'table', 'shelf', 'counter', 'frame', 'led'].filter((k) => K[k]).map((k) => `
            <section class="ds-kind"><h3>${esc(K[k].label)}</h3>
              <div class="ds-presets">${K[k].presets.map(([name], i) => `<button type="button" class="chip" data-kind="${k}" data-preset="${i}">${esc(name)}</button>`).join('')}</div>
            </section>`).join('')}
          <p class="props-meta">규격 예시를 고르면 바로 만들어지고, 오른쪽 <b>속성</b>에서 치수·자재·선반 수를 바꾸면 도면과 <b>부재표</b>(집계)가 따라 바뀝니다. 다 되면 ‘사물로 등록’해서 인테리어·조감도 도면에 놓을 수 있습니다.</p>
        </div>`,
      actions: [{ id: 'close', label: '닫기', primary: true }],
      onOpen(body) {
        const close = () => document.querySelector('#dialogFoot [data-id="close"]').click();
        body.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-kind]');
          if (!b) return;
          const kind = b.dataset.kind;
          if (kind === 'model') made = 'model';
          else if (kind === 'free') made = add('free', null, '자유 설계');
          else { const pr = K[kind].presets[+b.dataset.preset]; made = add(kind, pr[1], pr[0].replace(/\s*\(.*$/, '')); }
          close();
        });
      },
    });
    if (made === 'model') return openModel();
    if (made && made.kind === 'free') { App.ui.pickTool('dselect'); App.ui.toast('아래 ‘+가로판’·‘+세로판’·‘+막대’를 누르면 바로 생깁니다. ‘판’·‘막대’ 도구로 끌어 그려도 됩니다.'); }
    return made;
  }
  /** 내려받은 3D 모델을 열어 설계 화면에서 봄 (내 사물에도 등록됨) */
  async function openModel() {
    const id = await App.libraryUI.register({ place: false });
    if (!id) return null;
    const m = App.library.byId(id);
    if (!m || m.type !== 'mesh') { App.ui.toast('3D 모델 파일(GLB·OBJ·DAE·STL 또는 그 압축파일)을 골라 주세요. 사진은 ‘내 사물’에 등록되었습니다.'); return null; }
    const el = D().create('model', null, m.name);
    el.objId = id;
    App.doc.transact('모델 보기', () => App.doc.add(el));
    setCurrent(el.id);
    return el;
  }

  /* ── 속성 칸 ── */
  function fieldHtml(el, f) {
    const v = el.p ? el.p[f.k] : undefined;
    if (f.type === 'check') return `<label class="check-row ds-check"><input type="checkbox" data-p="${f.k}" ${v ? 'checked' : ''}><span>${esc(f.label)}</span></label>`;
    let control;
    if (f.type === 'sheet') {
      const list = D().SHEETS.filter((s) => (f.min == null || s.t >= f.min) && (f.max == null || s.t <= f.max));
      control = `<select data-p="${f.k}">${f.none ? `<option value="none" ${!v || v === 'none' ? 'selected' : ''}>${esc(f.none)}</option>` : ''}${list.map((s) => `<option value="${s.id}" ${s.id === v ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`;
    } else if (f.type === 'bar') {
      control = `<select data-p="${f.k}">${D().BARS.filter((b) => b.id !== 'rod25').map((b) => `<option value="${b.id}" ${b.id === v ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`;
    } else if (f.type === 'finish') { // 마감 색
      const cur = v == null ? (f.same ? 'same' : 'none') : v;
      control = `<select data-p="${f.k}">${f.same ? `<option value="same" ${cur === 'same' ? 'selected' : ''}>${esc(f.same)}</option>` : ''}${D().FINISHES.map((x) => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`;
    } else if (f.type === 'select') {
      control = `<select data-p="${f.k}" ${f.num ? 'data-num="1"' : ''} ${f.rebuild ? 'data-rebuild="1"' : ''}>${f.options.map(([val, label]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
    } else {
      control = `<input type="text" inputmode="decimal" data-p="${f.k}" ${f.int ? 'data-int="1"' : ''} ${f.optional ? 'data-optional="1"' : ''} value="${v == null ? '' : esc(v)}" autocomplete="off">${f.unit ? `<span class="field-unit">${esc(f.unit)}</span>` : ''}`;
    }
    const isSelect = f.type === 'sheet' || f.type === 'bar' || f.type === 'select' || f.type === 'finish';
    // 글이 긴 고르기 칸(파이프 규격·세우는 방식 등)은 한 줄을 다 써서 잘리지 않게
    const wide = f.type === 'bar' || (f.type === 'finish' && !!f.same) || (f.type === 'select' && Math.max(...f.options.map((o) => String(o[1]).length)) > 9);
    return `<div class="field${wide ? ' field-wide' : ''}"><label class="field-label">${esc(f.label)}</label><div class="${isSelect ? 'field-row' : 'field-box'}">${isSelect ? control.replace('<select ', '<select class="field-select" ') : control}</div></div>`;
  }
  /** 목록 칸 (붙박이장의 칸, 주방의 모듈): 줄마다 종류·폭(·위쪽), 차례 바꾸기·지우기 */
  function listHtml(el, f) {
    const list = Array.isArray(el.p[f.k]) ? el.p[f.k] : [];
    const tall = new Set(f.tall || []);
    // 한 칸 = 두 줄: (종류 · 폭) / (위에 올리는 것 · 차례 바꾸기·지우기) — 좁은 속성 칸에서도 종류 이름이 다 보이게
    const ctl = (it, c) => {
      if (c.options) {
        if (c.k === 'u' && tall.has(it.t)) return '<span class="ds-li-na">위까지 한 통</span>';
        const pre = c.label ? `${c.label}: ` : '';
        return `<select class="field-select ds-li-${c.k}" data-li="${c.k}" aria-label="${esc(c.label || '종류')}">${c.options.map(([val, label]) => `<option value="${esc(val)}" ${String(val) === String(it[c.k] == null ? c.options[0][0] : it[c.k]) ? 'selected' : ''}>${esc(pre + label)}</option>`).join('')}</select>`;
      }
      if (c.k !== 'w') return `<span class="field-box ds-li-n"><span class="ds-li-lab">${esc(c.label || '')}</span><input type="text" inputmode="numeric" data-li="${c.k}" value="${it[c.k] == null ? '' : esc(it[c.k])}" autocomplete="off" aria-label="${esc(c.label || c.k)} (mm)"></span>`;
      return `<span class="field-box ds-li-w"><input type="text" inputmode="numeric" data-li="${c.k}" value="${it[c.k] == null ? '' : esc(it[c.k])}" autocomplete="off" aria-label="폭 (mm)" title="폭 (mm)"></span>`;
    };
    const row = (it, i) => `
      <div class="ds-li" data-i="${i}">
        <span class="ds-li-no">${i + 1}</span>
        <div class="ds-li-main">${f.item.slice(0, 2).map((c) => ctl(it, c)).join('')}</div>
        <div class="ds-li-sub${f.item.length > 3 ? ' is-wrap' : ''}">${f.item.slice(2).filter((c) => !c.when || c.when(it)).map((c) => ctl(it, c)).join('')}
          <span class="ds-li-btns">
            <button type="button" class="btn ds-li-btn" data-act="ds-li-up" title="앞으로" aria-label="앞으로" ${i ? '' : 'disabled'}>▲</button>
            <button type="button" class="btn ds-li-btn" data-act="ds-li-down" title="뒤로" aria-label="뒤로" ${i < list.length - 1 ? '' : 'disabled'}>▼</button>
            <button type="button" class="btn ds-li-btn" data-act="ds-li-del" title="지우기" aria-label="지우기">✕</button>
          </span>
        </div>
      </div>`;
    const total = list.reduce((t, it) => t + (Number(it.w) || 0), 0);
    return `<div class="ds-list" data-list="${f.k}">
        <div class="field-group-label">${esc(f.label)} <small>${esc(f.hint || '')} · 폭 합 ${fmt(total)} mm</small></div>
        ${list.map(row).join('')}
        <button type="button" class="btn ds-li-add" data-act="ds-li-add">＋ ${esc(f.addLabel || (f.k === 'cols' ? '칸' : '모듈'))} 추가</button>
        ${f.note ? `<p class="props-meta ds-li-note">${esc(f.note)}</p>` : ''}
      </div>`;
  }
  /** 지금 값에서 보여 줄 칸들 */
  const LED_FIELDS = () => [
    { k: 'ledType', label: 'LED 종류', type: 'select', options: App.ledstrip.TYPES.map((t) => [t.id, t.name]) },
    { k: 'ledK', label: 'LED 색온도', type: 'select', options: App.ledstrip.TEMPS },
    { k: 'ledProf', label: 'LED 프로파일', type: 'select', options: App.ledstrip.PROFILES },
  ];
  const hasLite = (el) => el.kind !== 'model' && D().build(el).parts.some((q) => q.role === 'lite');
  const fieldsOf = (el) => {
    const own = (D().KINDS[el.kind] || D().KINDS.free).fields.filter((f) => !f.when || f.when(el.p || {}, el));
    return hasLite(el) ? [...own, ...LED_FIELDS().filter((f) => !own.some((x) => x.k === f.k))] : own;
  };
  const listSig = (el) => fieldsOf(el).filter((f) => f.type === 'list').map((f) => `${f.k}:${(Array.isArray(el.p[f.k]) ? el.p[f.k] : []).map((it) => it.t).join(',')}`).join(';');

  function infoHtml(el) {
    if (el.kind === 'model') {
      const m = el.objId ? App.library.byId(el.objId) : null;
      if (!m) return '<p class="dialog-note is-warn">이 모델은 내 사물 목록에서 지워졌습니다.</p>';
      const st = App.library.state(m.id);
      return `<div class="stats">
          <div class="stat"><span class="stat-label">크기</span><span class="stat-value">${fmt(m.w)} × ${fmt(m.d)} × ${fmt(m.h)} mm</span><small>폭 × 깊이 × 높이</small></div>
          <div class="stat"><span class="stat-label">모형</span><span class="stat-value">삼각형 ${m.tris.toLocaleString('ko-KR')}개</span><small>${esc(m.src || '')}${st === 'missing' ? ' · 이 기기에 데이터 없음' : ''}</small></div>
        </div>`;
    }
    const B = D().build(el);
    const rows = [['전체 크기', `${fmt(B.size.w)} × ${fmt(B.size.d)} × ${fmt(B.size.h)} mm`, '폭 × 깊이 × 높이'], ...(B.info || [])];
    return `<div class="stats">${rows.map(([a, b, c]) => `<div class="stat"><span class="stat-label">${esc(a)}</span><span class="stat-value">${esc(b)}</span>${c ? `<small>${esc(c)}</small>` : ''}</div>`).join('')}</div>`;
  }
  function partHtml(el) {
    if (!sel || el.kind === 'model') return '';
    const q = D().build(el).parts.find((x) => x.id === sel);
    if (!q) return '';
    const M = D().mat(q.m) || {};
    const user = !!q.user;
    const f = (k, label, v) => `<div class="field"><label class="field-label">${label}</label><div class="field-box"><input type="text" inputmode="decimal" data-part="${k}" value="${fmt(v).replace(/,/g, '')}" autocomplete="off" aria-label="${label} (mm)"></div></div>`; // 칸이 좁아 단위(mm)는 묶음 이름에
    const mats = `<select data-part="m">${q.s === 'bar' ? '' : D().SHEETS.map((s) => `<option value="${s.id}" ${s.id === q.m ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}${(q.s === 'poly' || q.s === 'arc') ? '' : D().BARS.map((b) => `<option value="${b.id}" ${b.id === q.m ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`;
    const curved = q.s === 'poly' || q.s === 'arc';
    const sizeText = q.s === 'rnd' ? `${[q.w, q.d, q.h].sort((a, b) => b - a).map(fmt).join(' × ')} mm · ${q.full ? '원·타원' : `모서리 R${fmt(q.r)}`}` : q.s === 'arc' ? `곡선 길이 ${fmt(D().arcLen(q))} × ${fmt(q.d)} × ${fmt(q.t)} mm (휘어 붙임)` : q.s === 'poly' ? `${fmt(q.w)} × ${fmt(q.h)} × ${fmt(q.d)} mm (곡선 윤곽)` : q.s === 'bar' ? `길이 ${fmt(D().lenOf(q))} mm (비스듬히)` : q.role === 'bar' ? `길이 ${fmt(D().lenOf(q))} mm` : `${[q.w, q.d, q.h].sort((a, b) => b - a).map(fmt).join(' × ')} mm`;
    if (!user) {
      return `<div class="field-group-label">고른 부재</div>
        <div class="stats"><div class="stat"><span class="stat-label">${esc(q.n)}</span><span class="stat-value">${esc(sizeText)}</span><small>${esc(M.name || '')} · 자리 X ${fmt(q.s === 'bar' ? q.a[0] : q.x)} · Y ${fmt(q.s === 'bar' ? q.a[1] : q.y)} · Z ${fmt(q.s === 'bar' ? q.a[2] : q.z)}</small></div></div>
        <p class="props-meta">값으로 만든 부재입니다. 크기·자리는 위 값에서 바꾸세요. 하나씩 고치려면 ‘부재로 풀기’.</p>`;
    }
    const special = q.role === 'slab' || q.role === 'fix' || q.role === 'lite'; // 풀어 놓은 상판·기기·LED: 자재·색은 그대로 두고 자리만
    const panel = q.s !== 'bar' && q.role === 'panel';
    const fins = D().FINISHES, finNow = q.c ? (fins.find((x) => x.color && x.color.toLowerCase() === String(q.c).toLowerCase()) || { id: 'keep' }).id : 'none';
    const MV = [['', '움직이지 않음'], ['dl', '문 — 왼쪽 경첩'], ['dr', '문 — 오른쪽 경첩'], ['df', '서랍 앞판 (앞으로 나옴)'], ['dw', '서랍 통 (앞판과 함께)']];
    const sel2 = (k, opts, now) => `<select class="field-select" data-part="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === now ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    return `<div class="field-group-label">고른 부재 <small>${esc(sizeText)}</small></div>
      <div class="field"><label class="field-label">이름</label><div class="field-box"><input type="text" data-part="n" maxlength="30" value="${esc(q.n)}" autocomplete="off"></div></div>
      ${special ? `<p class="props-meta">${q.role === 'slab' ? `상판 — ${esc(q.mn || '')}` : q.role === 'lite' ? `LED 라인 — ${esc(App.ledstrip.type(q.lt).name)} · ${esc(App.ledstrip.tempName(q.k))} (종류·색은 위 LED 칸에서 설계 전체로)` : '사 오는 기기·철물 (부재표에는 안 들어감)'}</p>` : `<div class="field"><label class="field-label">자재</label><div class="field-row">${mats.replace('<select ', '<select class="field-select" ')}</div></div>`}
      ${panel ? `<div class="field-grid ds-fields">
        <div class="field"><label class="field-label">마감 색</label><div class="field-row">${sel2('fin', [...fins.map((x) => [x.id, x.name]), ...(finNow === 'keep' ? [['keep', '지금 색 그대로']] : [])], finNow)}</div></div>
        <div class="field"><label class="field-label">3D에서 움직임</label><div class="field-row">${sel2('mv', MV, q.mv || '')}</div></div>
      </div>` : ''}
      ${q.s === 'bar' ? `
        <div class="field-group-label">시작 점 <small>mm</small></div><div class="field-grid ds-3">${f('a0', 'X', q.a[0])}${f('a1', 'Y (깊이)', q.a[1])}${f('a2', 'Z (높이)', q.a[2])}</div>
        <div class="field-group-label">끝 점 <small>mm</small></div><div class="field-grid ds-3">${f('b0', 'X', q.b[0])}${f('b1', 'Y (깊이)', q.b[1])}${f('b2', 'Z (높이)', q.b[2])}</div>` : `
        <div class="field-group-label">자리 <small>왼쪽·앞·아래 구석, mm</small></div><div class="field-grid ds-3">${f('x', 'X', q.x)}${f('y', 'Y (깊이)', q.y)}${f('z', 'Z (높이)', q.z)}</div>
        ${curved ? '<p class="props-meta">곡선 부재는 크기를 값으로 바꿀 수 없습니다. 자리만 옮기고, 모양은 원래 설계(되돌리기)에서 고치세요.</p>' : `<div class="field-group-label">크기 <small>mm</small></div><div class="field-grid ds-3">${f('w', '폭 (X)', q.w)}${f('d', '깊이 (Y)', q.d)}${f('h', '높이 (Z)', q.h)}</div>`}`}
      ${q.s === 'bar' || curved ? '' : `<div class="field-group-label">돌리기 <small>가운데는 그대로, 두 치수를 맞바꿈</small></div>
      <div class="btn-row ds-rot"><button type="button" class="btn" data-act="ds-part-rot" data-ax="z" title="위에서 봐서 90° (폭 ↔ 깊이)">폭 ↔ 깊이</button><button type="button" class="btn" data-act="ds-part-rot" data-ax="x" title="세우기·눕히기 (깊이 ↔ 높이)">깊이 ↔ 높이</button><button type="button" class="btn" data-act="ds-part-rot" data-ax="y" title="세우기·눕히기 (폭 ↔ 높이)">폭 ↔ 높이</button></div>`}
      <div class="field-group-label">모양 고치기</div>
      <div class="btn-row ds-ops"><button type="button" class="btn" data-act="ds-part-cut" title="한 방향으로 여러 조각으로 (같은 크기로, 또는 길이를 정해서)">자르기</button><button type="button" class="btn" data-act="ds-part-bend" title="정한 자리에서 끝 쪽을 꺾어 ㄱ자로">꺾기</button><button type="button" class="btn" data-act="ds-part-round" title="원·타원으로, 모서리만 둥글게, 네모로 되돌리기">둥글게</button></div>
      <div class="btn-row"><button type="button" class="btn" data-act="ds-part-copy">부재 복제</button><button type="button" class="btn btn-danger" data-act="ds-part-del">부재 지우기</button></div>`;
  }
  function toolHtml() {
    const t = App.ui.tool;
    if (t === 'dled') return '<p class="props-meta">정면도·평면도·측면도 안에서 끌어 LED 라인(스트립)을 그립니다. 그린 뒤 고르면 시작·끝 점을 숫자로 맞추고, LED 종류·색온도·프로파일은 아래 LED 칸에서 바꿉니다. 집계에 길이·전력·SMPS가 나옵니다.</p>';
    if (t !== 'dbox' && t !== 'dbar') return '';
    const sheet = App.current.dsSheet || 'ply18', bar = App.current.dsBar || 'sq50';
    return t === 'dbox'
      ? `<div class="field"><label class="field-label">그릴 판</label><div class="field-row"><select class="field-select" data-draw="dsSheet">${D().SHEETS.map((s) => `<option value="${s.id}" ${s.id === sheet ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div></div>
         <p class="props-meta">정면도·평면도·측면도 안에서 끌면 그 면을 보는 판이 생깁니다 (두께는 고른 판의 두께). 다른 그림에서 끌어 자리를 맞추세요.</p>`
      : `<div class="field"><label class="field-label">그릴 막대</label><div class="field-row"><select class="field-select" data-draw="dsBar">${D().BARS.filter((b) => b.id !== 'rod25').map((b) => `<option value="${b.id}" ${b.id === bar ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div></div>
         <p class="props-meta">정면도·평면도·측면도 안에서 시작점부터 끝점까지 끌면 막대가 생깁니다. 거의 가로·세로면 곧게 맞추고, 비스듬히 끌면 버팀대가 됩니다.</p>`;
  }
  function propsHtml(el) {
    const K = D().KINDS[el.kind] || D().KINDS.free;
    const param = el.kind !== 'free' && el.kind !== 'model';
    const F = fieldsOf(el), lists = F.filter((f) => f.type === 'list');
    const grid = F.filter((f) => f.type !== 'check' && f.type !== 'list'), checks = F.filter((f) => f.type === 'check');
    return `
      <div class="ds-props">
        <div class="props-head"><h2>설계</h2><small>${esc(K.label)}</small></div>
        <div class="field"><label class="field-label" for="dsName">이름</label><div class="field-box"><input id="dsName" type="text" maxlength="30" value="${esc(el.name)}" autocomplete="off"></div></div>
        ${toolHtml()}
        ${param && K.presets.length ? `<div class="field"><label class="field-label">규격 예시</label><div class="field-row"><select class="field-select" id="dsPreset"><option value="">고르면 그 치수로 바뀝니다</option>${K.presets.map(([n], i) => `<option value="${i}">${esc(n)}</option>`).join('')}</select></div></div>` : ''}
        ${lists.map((f) => listHtml(el, f)).join('')}
        ${grid.length ? `<div class="field-grid ds-fields">${grid.map((f) => fieldHtml(el, f)).join('')}</div>` : ''}
        ${checks.map((f) => fieldHtml(el, f)).join('')}
        <div id="dsInfo">${infoHtml(el)}</div>
        <div id="dsPart">${partHtml(el)}</div>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" data-act="ds-3d">3D로 보기</button>
          <button type="button" class="btn" data-act="ds-pdf">설계도면 PDF</button>
        </div>
        <div class="btn-row">
          ${el.kind === 'model' ? '' : '<button type="button" class="btn" data-act="ds-object" title="인테리어·조감도 도면에 가구·물건처럼 놓을 수 있게 내 사물로 등록">사물로 등록 (도면에 놓기)</button>'}
          ${param ? '<button type="button" class="btn" data-act="ds-explode" title="값으로 만든 부재를 하나씩 옮기고 고칠 수 있게 풀어 놓음">부재로 풀기</button>' : ''}
        </div>
        <div class="btn-row">
          <button type="button" class="btn" data-act="ds-copy">설계 복제</button>
          <button type="button" class="btn btn-danger" data-act="ds-del">설계 지우기</button>
        </div>
        <p class="props-meta">${el.kind === 'model' ? '내려받은 모델을 네 방향에서 본 그림입니다. 치수는 등록할 때 넣은 크기입니다 (내 사물에서 고칠 수 있음).' : '위쪽에서 정면·평면·측면·입체·전체 그림을 고릅니다. 부재를 누르면 아래 빠른 막대로 옮기고·돌리고·복제하고, 주황 점을 끌면 크기, 치수 숫자를 누르면 숫자로 고칩니다. 휠·두 손가락으로 확대, 빈 곳을 끌면 화면 이동.'}</p>
      </div>`;
  }
  function emptyHtml() {
    return `<div class="ds-props"><div class="empty"><div class="empty-title">설계물이 없습니다</div>
      <p><b>자유 설계</b>로 판·막대를 하나씩 넣어 직접 만들거나, 수납장·책장, 테이블, 선반, 카운터, 각파이프 틀, 전광판(LED) 틀을 치수로 만들고 재단표와 설계도면(PDF·DXF)을 뽑습니다. 내려받은 3D 모델(GLB·OBJ·DAE·STL, 압축파일째로도)을 열어 볼 수도 있습니다.</p>
      <button type="button" class="btn btn-primary" data-act="ds-new">＋ 새 설계</button></div></div>`;
  }
  /** 속성 칸을 그림 (props.js가 설계 모드일 때 부름) */
  function renderProps(pane) {
    const el = cur();
    const key = el ? `${el.id}|${el.kind}|${sel || ''}|${App.ui.tool}|${userParts(el).length}|${listSig(el)}|${fieldsOf(el).map((f) => f.k).join(',')}` : 'none';
    const badge = document.getElementById('propsBadge');
    if (badge) { badge.hidden = true; App.ui.syncSheetButton(); }
    if (key !== formKey || !pane.querySelector('.ds-props')) {
      formKey = key;
      const top = pane.scrollTop;
      pane.innerHTML = el ? propsHtml(el) : emptyHtml();
      App.icons.apply(pane);
      pane.scrollTop = top;
      return;
    }
    if (!el) return;
    // 같은 설계물: 치는 중인 칸은 두고 값·계산 결과만 새로
    const active = document.activeElement;
    pane.querySelectorAll('[data-p]').forEach((inp) => {
      if (inp === active) return;
      const v = el.p ? el.p[inp.dataset.p] : undefined;
      if (inp.type === 'checkbox') inp.checked = !!v;
      else if (inp.tagName === 'SELECT') inp.value = v == null ? (inp.querySelector('option[value="none"]') ? 'none' : inp.value) : String(v);
      else inp.value = v == null ? '' : v;
    });
    pane.querySelectorAll('[data-list]').forEach((box) => { // 목록의 폭·종류 값 (실행 취소로 바뀐 것도 따라오게)
      const list = Array.isArray(el.p[box.dataset.list]) ? el.p[box.dataset.list] : [];
      box.querySelectorAll('[data-i]').forEach((row) => {
        const it = list[+row.dataset.i];
        if (it) row.querySelectorAll('[data-li]').forEach((inp) => { if (inp !== active && it[inp.dataset.li] != null) inp.value = it[inp.dataset.li]; });
      });
      const sm = box.querySelector('.field-group-label small');
      if (sm) sm.textContent = sm.textContent.replace(/폭 합 [\d,.]+ mm/, `폭 합 ${fmt(list.reduce((t, it) => t + (Number(it.w) || 0), 0))} mm`);
    });
    const nm = pane.querySelector('#dsName');
    if (nm && nm !== active) nm.value = el.name;
    const info = pane.querySelector('#dsInfo');
    if (info) info.innerHTML = infoHtml(el);
    const part = pane.querySelector('#dsPart');
    if (part && !part.contains(active)) part.innerHTML = partHtml(el);
  }

  /* ── 집계 칸: 부재표 ── */
  function summaryHtml(el) {
    const head = `<div class="sum-bar is-two"><div class="sum-views" role="tablist"><button type="button" class="seg-btn" role="tab" aria-selected="true">부재표</button></div>
        <button type="button" class="btn btn-primary" data-act="ds-pdf" ${el ? '' : 'disabled'} title="설계도면과 부재표를 PDF로">설계도면</button>
        <button type="button" class="btn" data-act="ds-csv" ${el && el.kind !== 'model' ? '' : 'disabled'} title="부재표를 엑셀에서 열 수 있는 CSV로">CSV</button></div>`;
    if (!el) return `${head}<div class="empty"><div class="empty-title">설계물이 없습니다</div><p>위쪽 ‘＋ 새 설계’로 시작하세요.</p></div>`;
    if (el.kind === 'model') return `${head}<div class="empty"><div class="empty-title">${esc(el.name)}</div><p>내려받은 3D 모델은 부재표가 없습니다. 크기는 속성에서 보고, ‘내 사물’에서 도면에 놓을 수 있습니다.</p></div>`;
    const b = D().bom(el);
    const sec = (title, sub, rows, cls = '') => (rows.length ? `<section class="sum-sec${cls}"><h3 class="sum-title">${esc(title)}${sub ? ` <small>${esc(sub)}</small>` : ''}</h3><table class="sum-table"><tbody>${rows.join('')}</tbody></table></section>` : '');
    const tr = (label, value, note = '', cls = '') => `<tr${cls ? ` class="is-${cls}"` : ''}><th scope="row">${esc(label)}</th><td>${esc(value)}${note ? `<small>${esc(note)}</small>` : ''}</td></tr>`;
    let html = head;
    if (b.spec.length) html += sec('마감사양', '', b.spec.map((t) => { const i = t.indexOf(':'); return tr(i > 0 ? t.slice(0, i) : t, i > 0 ? t.slice(i + 1).trim() : ''); }));
    b.sheets.forEach((s) => {
      const rows = b.panels.filter((r) => r.g === s.g).map((r) => tr(r.n, `${r.q}장`, `${fmt(r.l)} × ${fmt(r.w)} × ${fmt(r.t)} mm`));
      rows.push(tr(`원장 (${s.sh} × ${s.sw})`, `${s.count}장`, `넓이 ${s.area}㎡ · 약 ${s.kg}kg · 톱날 3mm 어림`, 'total'));
      html += sec(s.mat, '재단 치수: 길이 × 폭 × 두께', rows);
    });
    b.stocks.forEach((s) => {
      const rows = b.bars.filter((r) => r.m === s.m).map((r) => tr(r.n, `${r.q}개`, `${fmt(r.len)} mm${r.slant ? ' · 비스듬히 (끝을 각도에 맞춰)' : ''}`));
      rows.push(tr(`원자재 ${s.stock / 1000}m`, `${s.count}본`, `모두 ${(s.total / 1000).toFixed(1)}m · 자투리 ${(s.waste / 1000).toFixed(1)}m · 약 ${s.kg}kg${s.joined ? ` · 원자재보다 긴 것 ${s.joined}개 (이어야 함)` : ''}`, 'total'));
      html += sec(s.mat, `1m에 약 ${s.kgm}kg`, rows);
    });
    if (b.tops.length) html += sec('상판', '길이 × 깊이 × 두께', b.tops.map((t) => tr(`${t.n} · ${t.mat}`, `${t.q}개`, `${fmt(t.l)} × ${fmt(t.w)} × ${fmt(t.t)} mm`)));
    if (b.led) html += sec('전광판', '제품마다 다르니 사양서로 확인', [tr('LED 캐비닛', `${b.led.count}개`, `${b.led.cab.name} mm · ${b.led.cols} × ${b.led.rows}`), tr('화면 무게', `약 ${Math.round(b.led.kgScreen)}kg`), tr('최대 전력', `${(b.led.maxW / 1000).toFixed(1)}kW`, `20A 회로 ${b.led.circuits}개 넘게`)]);
    if (b.lite) html += sec('LED 조명', `${b.lite.text} · 어림`, b.lite.lines.map((l) => tr(l.name, `${l.qty}${l.unit}`, l.note)));
    if (b.hw.length || b.edge) html += sec('철물·부속', '', [...(b.edge ? [tr('엣지 밴딩', `약 ${b.edge}m`, '보이는 마구리 · 여유 10% 더함')] : []), ...b.hw.map((h) => tr(h.n, `${h.q}개`))]);
    html += sec('총계', '', [tr('전체 크기', `${fmt(b.size.w)} × ${fmt(b.size.d)} × ${fmt(b.size.h)} mm`), tr('무게', `약 ${b.kg}kg`, '철물 빼고 · 자재 무게 어림')], ' is-grand');
    // 재료비: 단가를 적으면 합계가 나옴 (단가는 이 기기에 기억)
    const c = D().cost(el), won = (v) => `${Math.round(v).toLocaleString('ko-KR')}원`;
    html += `<details class="est-info ds-cost" ${c.priced || costOpen ? 'open' : ''}>
        <summary>재료비 ${c.priced ? `<b>${won(c.total)}</b>` : '<small>단가를 넣으면 계산됩니다</small>'}</summary>
        <table class="sum-table ds-cost-table"><tbody>
          ${c.lines.map((l) => `<tr><th scope="row">${esc(l.name)}<small>${l.qty}${esc(l.unit)}</small></th>
            <td><span class="field-box ds-price"><input type="text" inputmode="numeric" data-dprice="${esc(l.key)}" value="${l.price ? l.price.toLocaleString('ko-KR') : ''}" placeholder="단가" autocomplete="off" aria-label="${esc(l.name)} 단가"><span class="field-unit">원</span></span><small class="ds-amt">${l.price ? won(l.amount) : ''}</small></td></tr>`).join('')}
          <tr class="is-total"><th scope="row">재료비 합계</th><td id="dsCostTotal">${c.priced ? won(c.total) : '-'}</td></tr>
        </tbody></table>
        <p class="props-meta">단가는 원장 한 장·원자재 한 본·상판과 엣지 1m·철물 하나 값입니다 (이 기기에 기억되어 다른 설계에도 쓰임). 인건비·운반비는 견적에서 더하세요.</p>
      </details>`;
    html += `<div class="btn-row ds-sum-acts"><button type="button" class="btn" data-act="ds-estimate" title="원장·원자재 수와 철물을 견적의 기타 항목으로 넣음 (적어 둔 단가도 함께)">견적에 넣기</button><button type="button" class="btn" data-act="ds-dxf">CAD 도면 (DXF)</button><button type="button" class="btn" data-act="ds-glb" title="다른 3D 프로그램에서 열 수 있는 모델 파일">3D 파일 (GLB)</button></div>
      <p class="props-meta">재단 치수는 맞댐 이음 기준입니다. 원장·원자재 수는 톱날 3mm로 어림한 것이라 결 방향·여유는 따로 보세요.</p>`;
    return html;
  }
  let costOpen = false;
  function renderSummary(pane) {
    const top = pane.scrollTop;
    pane.innerHTML = summaryHtml(cur());
    pane.scrollTop = top;
  }
  /** 부재표를 견적의 기타 항목으로 */
  function toEstimate(el) {
    const b = D().bom(el), P = D().prices(), list = [];
    const furn = ['cabinet', 'table', 'shelf', 'counter', 'closet', 'kitchen'].includes(el.kind);
    const hwKey = (n) => `hw:${n.replace(/\s*\d+mm/, '')}`;
    b.sheets.forEach((s) => list.push({ name: `${el.name} · ${s.mat} 원장`, qty: s.count, unit: '장', trade: furn ? '가구' : '목공', price: P[`sheet:${s.g}`] || 0 }));
    b.stocks.forEach((s) => list.push({ name: `${el.name} · ${s.mat} ${s.stock / 1000}m`, qty: s.count, unit: '본', trade: furn ? '가구' : /각재|구조목/.test(s.mat) ? '목공' : '기타', price: P[`bar:${s.m}`] || 0 }));
    b.tops.forEach((t) => list.push({ name: `${el.name} · ${t.n} ${t.mat}`, qty: Math.round((t.l * t.q) / 100) / 10, unit: 'm', trade: '가구', price: P[`top:${t.mat}`] || 0 }));
    if (b.edge) list.push({ name: `${el.name} · 엣지 밴딩`, qty: b.edge, unit: 'm', trade: '가구', price: P.edge || 0 });
    if (b.led) list.push({ name: `${el.name} · LED 캐비닛 ${b.led.cab.name}`, qty: b.led.count, unit: '개', trade: '기타', price: P[`led:${b.led.cab.id}`] || 0 });
    b.hw.forEach((h) => list.push({ name: `${el.name} · ${h.n}`, qty: h.q, unit: '개', trade: furn ? '가구' : '기타', price: P[hwKey(h.n)] || 0 }));
    list.push({ name: `${el.name} · 제작·설치 인건비`, qty: 1, unit: '식', trade: furn ? '가구' : '기타' });
    const n = App.estimate.putExtras(`design:${el.id}`, list);
    App.ui.toast(`견적의 기타 항목에 ${n}줄을 넣었습니다. 인테리어·조감도 모드의 집계 → 견적에서 단가를 넣으세요.`);
    return n;
  }

  /* ── 3D 보기 ── */
  let orbit = null;
  let st3d = null; // 3D 창의 움직임 상태 (시험·디버그용으로도 읽음)
  async function open3d(el = cur()) {
    if (!el) return false;
    const isModel = el.kind === 'model';
    let model = null;
    if (isModel) {
      const m = el.objId ? App.library.byId(el.objId) : null;
      if (m) { await App.library.ready(m.id); const e = App.library.data(m.id); model = e ? e.view || e.mesh : null; }
    } else model = D().toModel(el, { pick: sel });
    if (!model) { App.ui.toast('보여 줄 부재가 없습니다.'); return false; }
    const mv = isModel ? { doors: false, drawers: false } : D().movable(el);
    const openLabel = mv.doors && mv.drawers ? '문·서랍 열기' : mv.doors ? '문 열기' : '서랍 열기';
    const st = (st3d = { open: 0, to: 0, hide: false, ex: 0, exTo: 0, raf: 0, last: 0 });
    await App.ui.dialog({
      title: `${el.name} — 3D`,
      html: `<div class="ds-3d" data-keys="local"><canvas class="obj-canvas ds-3d-canvas" id="ds3dCanvas" aria-label="3D 보기 (끌어서 돌리기)"></canvas>
        ${isModel ? '' : `<div class="btn-row ds-3d-moves">
          ${mv.doors || mv.drawers ? `<button type="button" class="btn btn-primary" data-act="ds3d-open" aria-pressed="false">${openLabel}</button>` : ''}
          ${mv.doors ? '<button type="button" class="btn" data-act="ds3d-hide" aria-pressed="false">문 떼고 속 보기</button>' : ''}
          <button type="button" class="btn" data-act="ds3d-explode" aria-pressed="false">분해도</button>
          ${hasLite(el) ? '<button type="button" class="btn" data-act="ds3d-night" aria-pressed="false">LED 켜고 밤으로</button>' : ''}
        </div>`}
        <div class="btn-row"><button type="button" class="btn" data-act="ds3d-png">사진 저장 (PNG)</button>${isModel ? '' : '<button type="button" class="btn" data-act="ds-glb">3D 파일 (GLB)</button>'}</div>
        <p class="props-meta">끌어서 돌리고 휠·두 손가락으로 확대합니다.${sel && !isModel ? ' 고른 부재는 주황색으로 보입니다.' : ''}</p></div>`,
      actions: [{ id: 'close', label: '닫기', primary: true }],
      onOpen(body) {
        const cv = body.querySelector('#ds3dCanvas');
        orbit = new App.libraryUI.Orbit(cv);
        const cam0 = isModel ? null : D().build(el).cam; // ㄱ자 주방은 오른쪽 앞에서 (모듈 앞면이 보이게)
        if (typeof cam0 === 'number') orbit.cam.yaw = cam0;
        if (orbit.ok) orbit.set(App.library.sceneOf(model));
        else cv.insertAdjacentHTML('afterend', '<p class="obj-nogl">이 기기에서는 3D 보기를 쓸 수 없습니다.</p>');
        const show = () => {
          if (!orbit || !orbit.ok || isModel) return;
          const m = D().toModel(el, { pick: sel, open: st.open, hideDoors: st.hide, explode: st.ex });
          if (m) orbit.set(App.library.sceneOf(m), true);
        };
        // 문·서랍이 스르륵 열리게: 0.55초에 걸쳐
        const step = (now) => {
          st.raf = 0;
          const dt = Math.min(250, now - (st.last || now - 16)); // 느린 기기에서도 걸리는 시간은 비슷하게 (프레임만 줄어듦)
          st.last = now;
          const go = (v, to) => (Math.abs(to - v) < 0.002 ? to : v + Math.sign(to - v) * Math.min(Math.abs(to - v), dt / 550));
          st.open = go(st.open, st.to);
          const ex0 = st.ex;
          st.ex = go(st.ex, st.exTo);
          if (orbit && st.ex !== ex0) orbit.cam.dist *= (1 + 0.55 * st.ex) / (1 + 0.55 * ex0); // 분해도는 벌어진 만큼 물러나서 봄
          show();
          if (st.open !== st.to || st.ex !== st.exTo) st.raf = requestAnimationFrame(step); else st.last = 0;
        };
        const kick = () => { if (!st.raf) { st.last = 0; st.raf = requestAnimationFrame(step); } };
        body.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); document.querySelector('#dialogFoot [data-id="close"]').click(); } });
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-act]');
          if (!b) return;
          const a = b.dataset.act;
          if (a === 'ds3d-png' && orbit && orbit.ok) {
            orbit.now();
            cv.toBlob((blob) => { if (blob) { const name = `${el.name.replace(/[\\/:*?"<>|]+/g, '_')}_3D_${App.exporter.stamp()}.png`; App.exporter.saved(App.exporter.download(name, blob, 'image/png'), `‘${name}’을 저장했습니다.`); } }, 'image/png');
          } else if (a === 'ds-glb') App.designOut.exportGlb(el);
          else if (a === 'ds3d-open') { st.to = st.to ? 0 : 1; b.setAttribute('aria-pressed', String(!!st.to)); b.textContent = st.to ? '닫기' : openLabel; kick(); }
          else if (a === 'ds3d-hide') { st.hide = !st.hide; b.setAttribute('aria-pressed', String(st.hide)); b.textContent = st.hide ? '문 달기' : '문 떼고 속 보기'; show(); }
          else if (a === 'ds3d-night' && orbit) { orbit.night = !orbit.night; st.night = orbit.night; b.setAttribute('aria-pressed', String(orbit.night)); b.textContent = orbit.night ? '낮으로' : 'LED 켜고 밤으로'; orbit.draw(); }
          else if (a === 'ds3d-explode') { st.exTo = st.exTo ? 0 : 1; b.setAttribute('aria-pressed', String(!!st.exTo)); b.textContent = st.exTo ? '다시 모으기' : '분해도'; kick(); }
        });
      },
    });
    if (st.raf) cancelAnimationFrame(st.raf);
    st3d = null;
    if (orbit) { orbit.dispose(); orbit = null; }
    pv.el = null; previewKick(); // 창이 덮는 동안 쉬던 전체 미리보기를 새로
    return true;
  }

  /* ── 내 사물로 등록 ── */
  async function toObject(el = cur()) {
    if (!el || el.kind === 'model') return null;
    let look = {}, lookName = '';
    if (D().movable(el).doors) { // 문짝이 있으면 도면에 놓을 모습을 고름
      const r = await App.ui.dialog({
        title: '사물로 등록',
        html: '<p>문짝이 있는 설계입니다. 도면에 놓을 모습을 고르세요.</p><p class="props-meta">문을 떼면 3D에서 속의 선반·서랍·옷걸이 봉이 보입니다. 다시 ‘사물로 등록’을 누르면 언제든 바꿀 수 있습니다.</p>',
        actions: [{ id: 'cancel', label: '취소' }, { id: 'open', label: '문 연 모습' }, { id: 'nodoor', label: '문 뗀 모습' }, { id: 'closed', label: '문 닫힌 모습', primary: true }],
      });
      if (!['open', 'nodoor', 'closed'].includes(r.id)) return null;
      if (r.id === 'open') { look = { open: 1 }; lookName = ' (문 연 모습)'; } else if (r.id === 'nodoor') { look = { hideDoors: true }; lookName = ' (문 뗀 모습)'; }
    }
    const model = D().toModel(el, look);
    if (!model) { App.ui.toast('등록할 부재가 없습니다.'); return null; }
    App.ui.busy('사물로 등록하는 중…');
    let id = null, again = false;
    try {
      const M = App.meshio, low = M.reduce(model, M.PLACE_TRIS), B = D().build(el);
      const data = { mesh: M.pack(low), view: low === model ? null : M.pack(model), thumb: null };
      // 크기: 문을 열거나 뗀 모습은 그 모형의 실제 범위로 (문이 앞으로 나온 만큼 깊어짐)
      const ms = M.stats(model).size, sz = look.open || look.hideDoors ? { w: ms[0], h: ms[1], d: ms[2] } : B.size; // 닫힌 모습은 설계 치수 그대로 (손잡이는 그 안에 들어가게 맞춰짐)
      const meta = { name: el.name, type: 'mesh', w: Math.round(sz.w), d: Math.round(sz.d), h: Math.round(sz.h), tris: M.stats(low).tris, src: '설계', lift: model.lift || 0, design: el.id };
      const old = App.library.list().find((m) => m.design === el.id);
      if (old) { again = true; id = old.id; await App.library.replaceData(id, data, { w: meta.w, d: meta.d, h: meta.h, tris: meta.tris, lift: meta.lift, name: el.name }); }
      else id = await App.library.add(meta, data);
      const m = App.library.byId(id);
      const url = m && App.sprites && App.sprites.thumbNow ? App.sprites.thumbNow(m.name) : null;
      if (url) await App.library.setThumb(id, url);
    } catch (e) {
      App.ui.toast(e && e.message ? e.message : '등록하지 못했습니다.');
      return null;
    } finally {
      App.ui.busy(false);
    }
    const m = App.library.byId(id);
    const r = await App.ui.dialog({
      title: again ? '내 사물을 새로 고쳤습니다' : '내 사물에 등록했습니다',
      html: `<p>‘${esc(m.name)}’${esc(lookName)} (${fmt(m.w)} × ${fmt(m.d)} × ${fmt(m.h)} mm)${again ? '을 지금 설계대로 바꿨습니다. 이미 도면에 놓인 것도 새 모양으로 보입니다.' : '을 내 사물에 넣었습니다.'}</p>
        <p class="props-meta">인테리어의 <b>가구</b>, 조감도의 <b>물건</b> 도구 → <b>내 사물</b>에서 골라 도면에 놓고 3D로 볼 수 있습니다. 설계를 고친 뒤 다시 ‘사물로 등록’을 누르면 놓인 것까지 바뀝니다.</p>`,
      actions: [{ id: 'close', label: '닫기' }, { id: 'event', label: '조감도에 놓기' }, { id: 'interior', label: '인테리어에 놓기', primary: true }],
    });
    if (r.id === 'interior' || r.id === 'event') { App.modes.set(r.id, true); App.libraryUI.placeNow(m.name); }
    return id;
  }

  /* ── 도구: 고르기·끌기 / 판 그리기 / 막대 그리기 ── */
  const AX = () => DD().AXES;
  const viewNow = () => DD().viewNow();
  const ORTHO = ['front', 'top', 'side'];
  const dragged = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) > (App.pointerTouch ? 8 : 4);
  /** 지금 배율에서 붙는 간격(mm): 화면 5px(손가락은 8px)쯤 되는 1·5·10·50·100 */
  const grid = () => { const s = App.plan.view.scale, min = App.pointerTouch ? 8 : 5; return [1, 5, 10, 50, 100].find((g) => g * s >= min) || 100; };
  const snapTo = (v, g) => Math.round(v / g) * g;
  const r1 = (v) => Math.round(v * 10) / 10;
  const POS = ['x', 'y', 'z'], SIZE = ['w', 'd', 'h'];
  const hitPx = () => (App.pointerTouch ? 26 : 10);   // 손잡이를 잡는 거리 (화면 픽셀)
  const nearPx = () => (App.pointerTouch ? 14 : 5);   // 얇은 판·막대를 고르는 거리 (화면 픽셀)
  /** 그림의 축: [가로, 세로, 깊이], 깊이 쪽에서 보는 사람에게 다가오는 방향(+1·−1). 입체도는 정면처럼 */
  const axesOf = (view) => {
    if (view === 'iso' && App.design3d && App.design3d.active()) return App.design3d.axes(); // 3D 화면: 보는 방향 기준 (→가 화면 오른쪽, 앞이 보는 사람 쪽)
    const [ha, va] = AX()[view] || AX().front;
    return { ha, hs: 1, va, ta: 3 - ha - va, toward: view === 'top' || view === 'side' ? 1 : -1 };
  };
  /** 다른 부재의 면에 붙임: vals(움직이는 것의 면들)가 faces 가운데 하나와 tol 안이면 그만큼 옮길 값 */
  function faceSnap(vals, faces, tol) {
    let best = null;
    vals.forEach((v) => faces.forEach((f) => { const d = f - v; if (Math.abs(d) <= tol && (best == null || Math.abs(d) < Math.abs(best))) best = d; }));
    return best;
  }
  function facesOf(el, skipId, axis) {
    const out = [];
    D().build(el).parts.forEach((q) => { if (q.id === skipId || q.halo) return; const c = D().corners(q); out.push(Math.min(...c.map((p) => p[axis])), Math.max(...c.map((p) => p[axis]))); });
    return out;
  }
  /** 값 하나를 다른 부재의 면에, 아니면 간격에 붙임. guides를 주면 면에 붙었을 때 그 자리(안내선)를 적어 둠 */
  const snap1 = (el, id, axis, v, step, tol, free, guides = null) => {
    if (free) return v;
    const f = faceSnap([v], facesOf(el, id, axis), tol);
    if (f != null && guides) guides.push({ axis, at: v + f });
    return f != null ? v + f : snapTo(v, step);
  };

  /* ── 손잡이: 고른 부재의 크기(모서리·변)와 막대 끝, 값으로 만든 설계의 전체 크기 ── */
  const shownViews = () => { const v = viewNow(); return v === 'all' ? ORTHO : ORTHO.includes(v) ? [v] : []; };
  /** 고른 부재의 손잡이: [{ view, kind: 'box'(sa, sb: 그 축의 아래(−1)·위(1) 끝을 움직임, 0은 그대로) | 'end'(end: 'a'|'b'), x, y(종이) }].
      화면에서 얇은 쪽(18mm 판의 두께 따위)은 손잡이를 빼서 손가락으로 잡기 쉽게 */
  function handlesOf(el) {
    const q = sel && el && el.kind !== 'model' ? userParts(el).find((x) => x.id === sel) : null;
    if (!q || q.s === 'poly' || q.s === 'arc' || App.ui.tool !== 'dselect') return [];
    const L = DD().layout(el), min = (App.pointerTouch ? 40 : 24) / App.plan.view.scale, out = [];
    shownViews().forEach((view) => {
      const { ha, va } = axesOf(view);
      if (q.s === 'bar') { ['a', 'b'].forEach((end) => { const p = DD().paperOf(L, view, q[end][ha], q[end][va]); out.push({ view, kind: 'end', end, x: p.x, y: p.y }); }); return; }
      const sp = DD().partSpan(q, view), wide = sp.hi[0] - sp.lo[0] >= min, tall = sp.hi[1] - sp.lo[1] >= min;
      const use = (sa, sb) => (wide && tall ? true : wide ? !sb : tall ? !sa : sa === 1 && sb === 1);
      for (const sa of [-1, 0, 1]) for (const sb of [-1, 0, 1]) {
        if ((!sa && !sb) || !use(sa, sb)) continue;
        const a = sa < 0 ? sp.lo[0] : sa > 0 ? sp.hi[0] : (sp.lo[0] + sp.hi[0]) / 2, b = sb < 0 ? sp.lo[1] : sb > 0 ? sp.hi[1] : (sp.lo[1] + sp.hi[1]) / 2;
        const p = DD().paperOf(L, view, a, b);
        out.push({ view, kind: 'box', sa, sb, x: p.x, y: p.y });
      }
    });
    return out;
  }
  /** 값으로 만든 설계(수납장·테이블·선반·아치 벽 따위)의 전체 크기 손잡이: 오른쪽 끝(폭·깊이)과 위 끝(높이·깊이).
      그 값이 실제 전체 크기와 같은 것만 (주방처럼 값과 크기가 다른 것은 빼고) */
  function sizeHandles(el) {
    if (!el || sel || el.kind === 'model' || el.kind === 'free' || App.ui.tool !== 'dselect') return [];
    const B = D().build(el), has = (ax) => DD().sizeParam(el, ax, B);
    const L = DD().layout(el), out = [], mid = (ax) => (B.min[ax] + B.max[ax]) / 2;
    shownViews().forEach((view) => {
      const { ha, va } = axesOf(view), kh = has(ha), kv = has(va);
      if (kh) { const p = DD().paperOf(L, view, B.max[ha], mid(va)); out.push({ view, kind: 'size', ax: ha, key: kh, dir: 'h', x: p.x, y: p.y }); }
      if (kv) { const p = DD().paperOf(L, view, mid(ha), B.max[va]); out.push({ view, kind: 'size', ax: va, key: kv, dir: 'v', x: p.x, y: p.y }); }
    });
    return out;
  }

  /* ── 숫자 넣기 창 (치수 글자를 눌렀을 때 따위): 1200-36 같은 셈도 됨 ── */
  function calc(text) {
    const t = String(text == null ? '' : text).replace(/,/g, '').trim();
    if (!t) return NaN;
    if (/^[\d.\s+\-*/()]+$/.test(t)) { try { const v = Function(`"use strict";return (${t});`)(); return Number.isFinite(v) ? v : NaN; } catch (_) { return NaN; } }
    return numIn(t);
  }
  async function askNumber(title, value, note = '') {
    const pr = App.ui.dialog({
      title,
      html: `<div class="field"><div class="field-box"><input id="dsNum" type="text" inputmode="decimal" enterkeyhint="done" value="${esc(String(r1(value)))}" autocomplete="off" aria-label="${esc(title)}"><span class="field-unit">mm</span></div></div><p class="props-meta">${esc(note || '1200-36 처럼 셈을 넣어도 됩니다.')}</p>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '바꾸기', primary: true }],
      onOpen(body) { body.querySelector('#dsNum').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); document.querySelector('#dialogFoot [data-id="ok"]').click(); } }); },
    });
    const inp = document.querySelector('#dialogBody #dsNum');
    if (inp) { inp.focus(); inp.select(); } // 숫자를 바로 치게 (휴대폰도 자판이 올라옴)
    const r = await pr;
    if (r.id !== 'ok') return null;
    const v = calc(r.body.querySelector('#dsNum').value);
    if (!Number.isFinite(v)) { App.ui.toast('숫자를 넣어 주세요.'); return null; }
    return v;
  }
  const AXNAME = { front: ['폭', '높이'], top: ['폭', '깊이'], side: ['깊이', '높이'] };
  /** 고른 부재의 치수 글자를 눌렀을 때: 크기 또는 끝에서 떨어진 거리를 숫자로 */
  async function editDim(lab) {
    const el = cur();
    if (!el) return;
    if (lab.key === 'param') { // 값으로 만든 설계의 전체 폭·깊이·높이
      const name = { W: '폭', D: '깊이', T: '두께', H: '높이' }[lab.k] || lab.k;
      const v = await askNumber(`전체 ${name}`, lab.v, '설계 값이 바뀌고 부재가 그에 맞춰 다시 만들어집니다. 1200-36 처럼 셈도 됩니다.');
      if (v == null || !cur()) return;
      setParam(cur(), lab.k, Math.max(lab.k === 'T' ? 30 : 100, Math.min(30000, Math.round(v))));
      formKey = ''; refreshPanes();
      return;
    }
    const q = userParts(el).find((x) => x.id === lab.id);
    if (!q) { App.ui.toast('값으로 만든 부재입니다. 크기·자리는 속성의 값에서 바꾸거나 ‘부재로 풀기’ 한 뒤 고치세요.'); return; }
    if (lab.key === 'size' && (q.s === 'poly' || q.s === 'arc')) { App.ui.toast('곡선 부재는 크기를 바꿀 수 없습니다. 자리(떨어진 거리)만 고칠 수 있습니다.'); return; }
    const nm = AXNAME[lab.view][lab.ax], end = lab.ax === 0 ? (lab.view === 'side' ? ['앞 끝', '뒤 끝'] : ['왼쪽 끝', '오른쪽 끝']) : lab.view === 'top' ? ['앞 끝', '뒤 끝'] : ['아래 끝', '위 끝'];
    const title = lab.key === 'size' ? `부재 ${nm}` : lab.key === 'lo' ? `${end[0]}에서 떨어진 거리` : `${end[1]}까지 남는 거리`;
    const v = await askNumber(title, lab.v, lab.key === 'size' ? `${end[0]}은 그대로 두고 늘이거나 줄입니다. 1200-36 처럼 셈도 됩니다.` : '부재 크기는 그대로 두고 옮깁니다. 1200-36 처럼 셈도 됩니다.');
    if (v == null) return;
    const now = cur(), qq = now && userParts(now).find((x) => x.id === lab.id);
    if (!qq) return;
    const ax = AX()[lab.view][lab.ax], B = D().build(now), c = D().corners(qq), lo = Math.min(...c.map((p) => p[ax])), hi = Math.max(...c.map((p) => p[ax]));
    if (lab.key === 'size') {
      const want = Math.max(1, v);
      if (qq.s === 'bar') { const e = qq.a[ax] >= qq.b[ax] ? 'a' : 'b', P = qq[e].slice(); P[ax] = r1(lo + want); setPart(now, qq.id, { [e]: P }, '부재 크기 바꾸기'); }
      else setPart(now, qq.id, { [SIZE[ax]]: r1(want) }, '부재 크기 바꾸기');
    } else {
      const to = lab.key === 'lo' ? B.min[ax] + v : B.max[ax] - v - (hi - lo);
      shiftBy(now, qq, ax, to - lo, '부재 옮기기');
    }
    refreshPanes();
  }
  /** 부재 하나를 축 하나로 d만큼 */
  function moved(q, sh) {
    if (q.s === 'bar') return { a: q.a.map((v, i) => r1(v + sh[i])), b: q.b.map((v, i) => r1(v + sh[i])) };
    return { x: r1(q.x + sh[0]), y: r1(q.y + sh[1]), z: r1(q.z + sh[2]) };
  }
  function shiftBy(el, q, ax, d, label) {
    if (!d) return;
    const sh = [0, 0, 0]; sh[ax] = d;
    setPart(el, q.id, moved(q, sh), label);
  }

  let cycleTip = false;
  let closeShow = () => {};
  /** 접어 둔 휴대폰 화면: 위 막대에서 고른 뒤 막대를 닫음 */
  const closeTopBar = () => { if (App.ui.bars) App.ui.bars.set('top', false); }; // 휴대폰의 설계물·표시 메뉴 닫기 (init에서 채움)
  class DSelect {
    activate() { this.drag = null; this.pan = null; this.press = null; this.label = null; }
    down(ev) {
      const el = cur();
      this.press = ev; this.drag = null; this.pan = null; this.label = null;
      if (!el) return;
      const s = App.plan.view.scale, w = ev.world, v = viewNow();
      // 치수 글자 (고른 부재의 크기·자리, 아무것도 안 골랐으면 전체 폭·높이): 누르고 떼면 숫자로 고침
      this.label = DD().tapDims().find((t) => (t.key === 'param' ? !sel : t.id === sel) && w.x >= t.r.x0 && w.x <= t.r.x1 && w.y >= t.r.y0 && w.y <= t.r.y1) || null;
      const h = DD().hit(el, w, 0, v, nearPx() / s);
      // 1) 손잡이: 끌면 크기 (고른 부재 안을 누르면 옮기기가 먼저, 손잡이 바로 위면 크기). 끌지 않고 떼면 치수 글자 고치기
      const hs = sel ? handlesOf(el) : sizeHandles(el);
      let best = null, bd = hitPx() / s;
      hs.forEach((k) => { const d = Math.hypot(k.x - w.x, k.y - w.y); if (d < bd) { bd = d; best = k; } });
      const onSel = !!(h && h.part && h.part.id === sel);
      if (best && (!onSel || bd < (hitPx() * 0.5) / s)) {
        const orig = best.kind === 'size' ? { ...el.p } : JSON.parse(JSON.stringify(userParts(el).find((x) => x.id === sel)));
        this.drag = { el, kind: best.kind, h: best, view: best.view, id: sel, orig, started: false };
        return;
      }
      // 2) 치수 글자 위: 끌면 화면 이동
      if (this.label) { this.pan = { x: ev.x, y: ev.y }; return; }
      // 3) 부재 고르기 → 직접 그린 부재는 끌어 옮김 (값으로 만든 부재는 끌면 화면 이동).
      //    이미 고른 부재가 이 자리 아래(다른 부재 뒤)에 있으면 그대로 두고, 손을 떼면 그 뒤 부재로 넘어감
      this.stack = null; this.cellTap = null;
      // 빈 칸의 안쪽(뒤판 위)을 누름: 뒤판보다 그 칸을 먼저 고름 (선반·서랍·문짝을 넣을 자리) — 같은 칸을 다시 누르면 뒤판이 골라짐. 끌면 화면 이동
      if (h && h.part && h.view === 'front' && h.at && h.part.id !== sel) {
        const c = cellAt(el, h.at[0], h.at[1]);
        if (c && behindCell(h.part, c) && !sameCell(c, cell)) { this.cellTap = c; this.pan = { x: ev.x, y: ev.y }; return; }
      }
      if (h && h.part) {
        const stack = DD().hitAll(el, w, v, nearPx() / s), under = sel ? stack.find((x) => x.id === sel) : null;
        const part = under || h.part;
        if (under && stack.length > 1) this.stack = stack;
        if (sel !== part.id) { sel = part.id; formKey = ''; refreshPanes(); render(); }
        const q = part.user && h.view !== 'iso' ? userParts(el).find((x) => x.id === part.id) : null;
        if (q) this.drag = { el, kind: 'move', id: q.id, view: h.view, orig: JSON.parse(JSON.stringify(q)), started: false };
        else this.pan = { x: ev.x, y: ev.y };
      } else this.pan = { x: ev.x, y: ev.y };
    }
    move(ev) {
      if (this.pan) {
        if (this.label && !dragged(ev, this.press)) return;
        this.label = null;
        App.plan.view.panBy(ev.x - this.pan.x, ev.y - this.pan.y); this.pan = { x: ev.x, y: ev.y }; render(); return;
      }
      const g = this.drag;
      if (!g || !this.press || (!g.started && !dragged(ev, this.press))) return;
      this.label = null;
      if (!g.started) { g.started = true; App.doc.begin(g.kind === 'move' ? '부재 옮기기' : g.kind === 'size' ? '크기 바꾸기' : '부재 크기 바꾸기'); DD().freeze(g.el); }
      const { ha, va } = axesOf(g.view);
      const du = ev.world.x - this.press.world.x, dv = -(ev.world.y - this.press.world.y); // 종이의 y는 아래로, 부재의 세로 축은 위로
      const o = g.orig, step = ev.alt ? 1 : grid(), tol = (App.pointerTouch ? 10 : 7) / App.plan.view.scale, dz = (App.pointerTouch ? 8 : 3) / App.plan.view.scale;
      this.at = ev.world;
      const guides = (g.guides = []); // 다른 부재의 면에 붙은 자리 (분홍 안내선)
      if (g.kind === 'size') { // 값으로 만든 설계의 전체 폭·깊이·높이
        const k = g.h.key, v0 = Number(o[k]) || 0, d = g.h.ax === ha ? du : dv;
        const v = Math.max(k === 'T' ? 30 : 100, Math.min(30000, snapTo(v0 + d, Math.max(step, 10))));
        const cur0 = App.doc.get(g.el.id);
        if (cur0 && Number(cur0.p[k]) !== v) App.doc.update(g.el.id, { p: { ...o, [k]: v } });
        g.text = `${{ W: '폭', D: '깊이', T: '두께', H: '높이' }[k]} ${fmt(v)}`;
        render(); return;
      }
      let next;
      if (g.kind === 'box') { // 모서리·변을 끌어 크기
        next = {};
        [[ha, du, g.h.sa], [va, dv, g.h.sb]].forEach(([ax, d, sg]) => {
          if (!sg) return;
          const lo = o[POS[ax]], hi = lo + o[SIZE[ax]];
          if (Math.abs(d) < dz) return; // 거의 안 움직인 쪽은 그대로 (손가락이 조금 비뚤어도 다른 치수가 붙어 바뀌지 않게)
          if (sg > 0) { const v = Math.max(lo + 5, snap1(g.el, g.id, ax, hi + d, step, tol, ev.alt, guides)); next[SIZE[ax]] = r1(v - lo); }
          else { const v = Math.min(hi - 5, snap1(g.el, g.id, ax, lo + d, step, tol, ev.alt, guides)); next[POS[ax]] = r1(v); next[SIZE[ax]] = r1(hi - v); }
        });
        const nq = { ...o, ...next };
        g.text = `${AXNAME[g.view][0]} ${fmt(nq[SIZE[ha]])} × ${AXNAME[g.view][1]} ${fmt(nq[SIZE[va]])}`;
      } else if (g.kind === 'end') { // 막대·LED 끝
        const P = o[g.h.end].slice(), Q = o[g.h.end === 'a' ? 'b' : 'a'];
        P[ha] = r1(snap1(g.el, g.id, ha, o[g.h.end][ha] + du, step, tol, ev.alt, guides));
        P[va] = r1(snap1(g.el, g.id, va, o[g.h.end][va] + dv, step, tol, ev.alt, guides));
        if (!ev.alt) { const ang = (Math.atan2(Math.abs(P[va] - Q[va]), Math.abs(P[ha] - Q[ha])) * 180) / Math.PI; if (ang < 4) P[va] = Q[va]; else if (ang > 86) P[ha] = Q[ha]; } // 거의 가로·세로면 곧게
        if (Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]) < 10) return;
        next = { [g.h.end]: P };
        g.text = `길이 ${fmt(Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]))}`;
      } else { // 옮기기: 다른 부재의 면에 붙고, 아니면 간격에
        const cornersAt = (d0, d1) => { const sh = [0, 0, 0]; sh[ha] = d0; sh[va] = d1; return D().corners({ ...o, ...moved(o, sh) }); };
        const fit = (axis, d) => {
          if (Math.abs(d) < dz) return 0; // 거의 안 움직인 축은 그대로
          const c = cornersAt(axis === ha ? d : 0, axis === va ? d : 0), lo = Math.min(...c.map((p) => p[axis])), hi = Math.max(...c.map((p) => p[axis]));
          const f = ev.alt ? null : faceSnap([lo, hi], facesOf(g.el, g.id, axis), tol);
          if (f != null) { const faces = facesOf(g.el, g.id, axis), hitLo = faces.some((x) => Math.abs(x - (lo + f)) < 0.01); guides.push({ axis, at: hitLo ? lo + f : hi + f }); return d + f; }
          const base = Math.min(...D().corners(o).map((p) => p[axis]));
          return snapTo(base + d, step) - base;
        };
        const sh = [0, 0, 0]; sh[ha] = fit(ha, du); sh[va] = fit(va, dv);
        next = moved(o, sh);
        g.text = `${fmt(sh[ha])}, ${fmt(sh[va])} 옮김`;
      }
      App.doc.update(g.el.id, { parts: userParts(g.el).map((q) => (q.id === g.id ? { ...q, ...next } : q)) });
      render();
    }
    up(ev) {
      const g = this.drag, press = this.press, lab = this.label;
      this.pan = null; this.drag = null; this.press = null; this.label = null;
      if (g && g.started) { steady(() => { DD().freeze(null); App.doc.commit(); }); if (g.kind === 'size') formKey = ''; refreshPanes(); keepSoon(true); render(); return; }
      if (!press || dragged(ev, press)) { this.cellTap = null; return; }
      if (lab) { editDim(lab); return; }
      if (g && g.kind !== 'move') return; // 손잡이를 눌렀다 뗌: 그대로
      const el = cur(), stack = this.stack;
      this.stack = null;
      if (stack && sel) { // 이미 고른 부재를 다시 누름: 그 자리 뒤에 있는 부재로 (끝이면 맨 앞으로)
        const i = stack.findIndex((x) => x.id === sel);
        sel = stack[(i + 1) % stack.length].id; formKey = '';
        refreshPanes(); render();
        if (!cycleTip) { cycleTip = true; App.ui.toast('같은 자리를 다시 누르면 뒤에 있는 부재가 골라집니다.'); }
        return;
      }
      if (this.cellTap) { const c = this.cellTap; this.cellTap = null; setCell(c); return; }
      const h = el ? DD().hit(el, ev.world, 0, viewNow(), nearPx() / App.plan.view.scale) : null;
      if (!h || !h.part) {
        if (sel) { sel = null; formKey = ''; refreshPanes(); }
        // 부재가 없는 곳: 판으로 둘러싸인 칸 안이면 그 칸을 고르고, 아니면 고른 칸을 품
        setCell(h && h.view === 'front' && h.at ? cellAt(el, h.at[0], h.at[1]) : null);
        renderQuick(); render();
      }
    }
    cancel() {
      if (this.drag && this.drag.started) { DD().freeze(null); App.doc.rollback(); }
      this.pan = null; this.drag = null; this.press = null; this.label = null; this.stack = null; this.cellTap = null;
      render();
    }
    escape() { if (sel) { sel = null; formKey = ''; refreshPanes(); render(); return true; } return false; }
    overlay(plan) {
      const el = cur();
      if (!el || !isMode()) return;
      const ctx = plan.ctx, px = 1 / plan.view.scale, touch = !!App.pointerTouch;
      App.draw.worldTransform(plan);
      if (cell && cell.id === el.id && !sel && ['front', 'all'].includes(viewNow())) { // 고른 빈 칸: 옅은 청록 바탕 + 점선 테두리 + 크기
        const L = DD().layout(el), a = DD().paperOf(L, 'front', cell.x[0], cell.z[1]), z = DD().paperOf(L, 'front', cell.x[1], cell.z[0]);
        const col = plan.colors.accent || '#0b7285', w = z.x - a.x, h = z.y - a.y;
        ctx.save();
        ctx.globalAlpha = 0.14; ctx.fillStyle = col; ctx.fillRect(a.x, a.y, w, h);
        ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 1.8 * px; ctx.setLineDash([7 * px, 5 * px]); ctx.strokeRect(a.x, a.y, w, h);
        const t = `${fmt(cell.x[1] - cell.x[0])} × ${fmt(cell.z[1] - cell.z[0])}`;
        ctx.setLineDash([]); ctx.font = `700 ${12.5 * px}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif`;
        if (ctx.measureText(t).width < w - 8 * px && h > 26 * px) { ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, a.x + w / 2, a.y + h / 2); }
        ctx.restore();
      }
      const hs = sel ? handlesOf(el) : sizeHandles(el);
      hs.forEach((k) => {
        ctx.save();
        ctx.setLineDash([]);
        if (k.kind === 'size') { // 전체 크기: 청록 동그라미에 바깥쪽 화살
          const r = (touch ? 12 : 9) * px;
          ctx.beginPath(); ctx.arc(k.x, k.y, r, 0, Math.PI * 2);
          ctx.fillStyle = plan.colors.accent || '#0b7285'; ctx.fill();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * px; ctx.stroke();
          ctx.translate(k.x, k.y); if (k.dir === 'v') ctx.rotate(-Math.PI / 2);
          const a = r * 0.55;
          ctx.beginPath(); ctx.moveTo(-a, 0); ctx.lineTo(a, 0); ctx.moveTo(a - a * 0.6, -a * 0.6); ctx.lineTo(a, 0); ctx.lineTo(a - a * 0.6, a * 0.6);
          ctx.moveTo(-a + a * 0.6, -a * 0.6); ctx.lineTo(-a, 0); ctx.lineTo(-a + a * 0.6, a * 0.6);
          ctx.lineWidth = 1.8 * px; ctx.lineCap = 'round'; ctx.stroke();
        } else { // 부재 크기·막대 끝: 흰 점에 주황 테
          const r = (touch ? 8 : 5.5) * px;
          ctx.beginPath(); ctx.arc(k.x, k.y, r, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff'; ctx.fill();
          ctx.lineWidth = 2.2 * px; ctx.strokeStyle = '#e8590c'; ctx.stroke();
        }
        ctx.restore();
      });
      const g = this.drag;
      if (g && g.started && g.guides && g.guides.length && g.kind !== 'size') { // 다른 부재의 면에 붙은 자리: 분홍 안내선
        const L = DD().layout(el), { ha } = axesOf(g.view), vr = plan.view.worldRect(plan.width, plan.height);
        ctx.save();
        ctx.strokeStyle = '#e64980'; ctx.lineWidth = 1.4 * px; ctx.setLineDash([6 * px, 4 * px]);
        ctx.beginPath();
        g.guides.forEach((gd) => {
          if (gd.axis === ha) { const x = DD().paperOf(L, g.view, gd.at, 0).x; ctx.moveTo(x, vr.minY); ctx.lineTo(x, vr.maxY); }
          else { const y = DD().paperOf(L, g.view, 0, gd.at).y; ctx.moveTo(vr.minX, y); ctx.lineTo(vr.maxX, y); }
        });
        ctx.stroke();
        ctx.restore();
      }
      if (g && g.started && g.text) { // 끄는 동안: 크기·옮긴 거리 (손가락에 가리지 않게 위쪽에)
        const at = this.at || null;
        const t = g.text;
        ctx.save();
        ctx.font = `700 ${13 * px}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif`;
        const w = ctx.measureText(t).width + 14 * px, hgt = 22 * px;
        const vr = plan.view.worldRect(plan.width, plan.height);
        const x = Math.max(vr.minX + 6 * px, Math.min(vr.maxX - w - 6 * px, (at ? at.x : (vr.minX + vr.maxX) / 2) - w / 2)), y = Math.max(vr.minY + 70 * px, (at ? at.y : vr.minY + 90 * px) - (touch ? 70 : 34) * px);
        ctx.fillStyle = 'rgba(33,37,41,0.88)';
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, hgt, 6 * px); else ctx.rect(x, y, w, hgt); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(t, x + 7 * px, y + hgt / 2);
        ctx.restore();
      }
    }
  }

  /** 그리기 도구 공통: 어느 그림에서 시작했는지와 그 그림의 두 축 값 (그림 하나를 볼 때는 그 그림에서만) */
  function startAt(el, ev) {
    const B = D().build(el), v = viewNow();
    if (!B.parts.length) return { view: ORTHO.includes(v) ? v : 'front', at: [0, 0], empty: true, world: ev.world };
    if (v === 'iso') return null;
    const L = DD().layout(el);
    const h = DD().hit(el, ev.world, L.G * 0.45, v);
    return h ? { view: h.view, at: h.at, world: ev.world } : null;
  }
  const delta = (st, ev) => [ev.world.x - st.world.x, -(ev.world.y - st.world.y)];
  class DDraw {
    constructor(mode) { this.bar = mode === true; this.led = mode === 'led'; }
    activate() { this.st = null; this.cur = null; }
    down(ev) {
      const el = cur();
      if (!el || el.kind === 'model') { App.ui.toast(el ? '내려받은 모델에는 부재를 그릴 수 없습니다. ‘＋ 새 설계 → 자유 설계’에서 그리세요.' : '먼저 ‘＋ 새 설계’로 설계물을 만드세요.'); return; }
      this.st = startAt(el, ev);
      this.cur = ev;
      if (!this.st) App.ui.toast('정면도·평면도·측면도 안(또는 바로 옆)에서 끌어 그리세요.');
    }
    move(ev) { if (this.st) { this.cur = ev; render(); } }
    up(ev) {
      const st = this.st, el = cur();
      this.st = null; this.cur = null;
      render();
      if (!st || !el) return;
      const g = grid(), [du, dv] = delta(st, ev);
      const [ha, va] = AX()[st.view], ta = 3 - ha - va;
      const a0 = snapTo(st.at[0], g), b0 = snapTo(st.at[1], g), a1 = snapTo(st.at[0] + du, g), b1 = snapTo(st.at[1] + dv, g);
      const B = D().build(el), base = B.parts.length ? B.min[ta] : 0;
      if (this.led) { // LED 라인: 끈 대로 (거의 가로·세로면 곧게), 깊이는 앞면 바로 앞
        if (Math.hypot(a1 - a0, b1 - b0) < 30) { App.ui.toast('시작점에서 끝점까지 끌어 LED 라인을 그리세요.'); return; }
        const ang = (Math.atan2(Math.abs(b1 - b0), Math.abs(a1 - a0)) * 180) / Math.PI;
        const A = [0, 0, 0], Bp = [0, 0, 0];
        A[ha] = a0; A[va] = b0; Bp[ha] = ang > 86 ? a0 : a1; Bp[va] = ang < 4 ? b0 : b1;
        A[ta] = Bp[ta] = ta === 1 ? base - 5 : base;
        const sp = App.ledstrip.spec(el.p || {});
        addPart(el, { s: 'bar', n: 'LED 라인', m: 'ledline', role: 'lite', a: A, b: Bp, lt: sp.type, k: sp.k, pf: sp.prof }, 'LED 라인 그리기');
        if (st.empty) App.plan.fitToContent();
        return;
      }
      if (!this.bar) {
        const S = D().sheet(App.current.dsSheet || 'ply18');
        const lo = [0, 0, 0], size = [0, 0, 0];
        lo[ha] = Math.min(a0, a1); lo[va] = Math.min(b0, b1); lo[ta] = base;
        size[ha] = Math.abs(a1 - a0); size[va] = Math.abs(b1 - b0); size[ta] = S.t;
        if (size[ha] < 10 || size[va] < 10) { App.ui.toast('끌어서 판의 크기를 정하세요 (10mm 넘게).'); return; }
        addPart(el, { s: 'box', n: '판', m: S.id, x: lo[0], y: lo[1], z: lo[2], w: size[0], d: size[1], h: size[2] }, '판 그리기');
      } else {
        const M = D().bar(App.current.dsBar || 'sq50');
        const len = Math.hypot(a1 - a0, b1 - b0);
        if (len < 20) { App.ui.toast('시작점에서 끝점까지 끌어 막대의 길이를 정하세요.'); return; }
        const ang = (Math.atan2(Math.abs(b1 - b0), Math.abs(a1 - a0)) * 180) / Math.PI;
        if (ang < 4 || ang > 86) {
          // 곧은 막대: 끈 선이 가운데가 되게
          const along = ang < 4 ? ha : va, across = ang < 4 ? va : ha;
          const axis = 'xyz'[along], p = [0, 0, 0];
          const lo = along === ha ? Math.min(a0, a1) : Math.min(b0, b1), fixed = along === ha ? b0 : a0;
          const probe = D().rail('막대', M.id, axis, 0, 0, 0, len);
          const dims = [probe.w, probe.d, probe.h];
          p[along] = lo; p[across] = fixed - dims[across] / 2; p[ta] = base;
          addPart(el, { s: 'box', n: '막대', m: M.id, x: p[0], y: p[1], z: p[2], w: dims[0], d: dims[1], h: dims[2] }, '막대 그리기');
        } else {
          const A = [0, 0, 0], Bp = [0, 0, 0];
          A[ha] = a0; A[va] = b0; A[ta] = base + M.sw / 2;
          Bp[ha] = a1; Bp[va] = b1; Bp[ta] = base + M.sw / 2;
          addPart(el, { s: 'bar', n: '버팀대', m: M.id, a: A, b: Bp }, '막대 그리기');
        }
      }
      if (st.empty) App.plan.fitToContent();
    }
    cancel() { this.st = null; this.cur = null; render(); }
    escape() { if (this.st) { this.cancel(); return true; } return false; }
    overlay(plan) {
      if (!this.st || !this.cur) return;
      const ctx = plan.ctx, px = 1 / plan.view.scale;
      App.draw.worldTransform(plan);
      const a = this.st.world, b = this.cur.world;
      ctx.strokeStyle = plan.colors.accent || '#e8590c'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.6 * px; ctx.setLineDash([6 * px, 4 * px]);
      ctx.beginPath();
      if (this.bar) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } else ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.stroke();
      ctx.setLineDash([]);
      const text = this.bar ? `${fmt(Math.hypot(b.x - a.x, b.y - a.y))}` : `${fmt(Math.abs(b.x - a.x))} × ${fmt(Math.abs(b.y - a.y))}`;
      ctx.font = `700 ${12 * px}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(text, b.x + 8 * px, b.y - 8 * px);
    }
  }

  /* ── 빠른 막대: 고른 부재를 바로 옮기고·돌리고·복제하고, 아무것도 안 골랐으면 부재 넣기 (휴대폰에서 속성 칸을 덜 열게) ── */
  const STEPS = [1, 5, 10, 50, 100];
  let step = 10;          // 화살표 한 번에 옮기는 거리 (mm)
  let addOpen = null;     // 부재 넣기 줄을 펼쳤는지 (null이면 자유 설계만 펼침)
  let tipShown = false;
  const curPart = () => { const el = cur(); return el && sel ? userParts(el).find((x) => x.id === sel) || null : null; };
  const DEPTH = { front: ['앞', '뒤', '앞으로 (보는 쪽으로)', '뒤로'], iso: ['앞', '뒤', '앞으로', '뒤로'], top: ['위', '아래', '위로 (보는 쪽으로)', '아래로'], side: ['가까이', '멀리', '오른쪽으로 (보는 쪽으로)', '왼쪽으로'] };
  /** 고른 부재를 지금 그림의 축으로: [가로, 세로, 깊이(+는 보는 사람 쪽)] mm */
  function nudge(d, label = '부재 옮기기') {
    const el = cur(), q = curPart();
    if (!el || !q) return false;
    const { ha, hs, va, vs, ta, toward } = axesOf(viewNow());
    const sh = [0, 0, 0]; sh[ha] += d[0] * (hs || 1); sh[va] += d[1] * (vs || 1); sh[ta] += d[2] * toward;
    setPart(el, q.id, moved(q, sh), label);
    return true;
  }
  /** 지금 그림의 면 안에서 90° 돌리기 (가운데는 그대로) */
  function rotateInView() {
    const el = cur(), q = curPart();
    if (!el || !q) return false;
    if (q.s === 'poly' || q.s === 'arc') { App.ui.toast('곡선 부재는 돌릴 수 없습니다.'); return false; }
    const { ha, va } = axesOf(viewNow());
    if (q.s === 'bar') { // 시작 끝은 그대로, 위(또는 오른쪽)로 서게
      const du = q.b[ha] - q.a[ha], dv = q.b[va] - q.a[va];
      let ru = -dv, rv = du;
      if (rv < -0.5 || (Math.abs(rv) <= 0.5 && ru < 0)) { ru = dv; rv = -du; }
      const B = q.b.slice(); B[ha] = r1(q.a[ha] + ru); B[va] = r1(q.a[va] + rv);
      setPart(el, q.id, { b: B }, '부재 돌리기');
      return true;
    }
    // 왼쪽 아래 구석은 그대로 두고 두 치수를 맞바꿈 (선반을 세우면 그 자리에 옆판처럼 섬)
    const A = SIZE[ha], Bk = SIZE[va];
    setPart(el, q.id, { [A]: q[Bk], [Bk]: q[A], ...swapAx(q, ha, va) }, '부재 돌리기');
    return true;
  }
  /** 부재가 축 하나에서 차지하는 길이 */
  const extentOn = (q, ax) => { const c = D().corners(q); return Math.max(...c.map((p) => p[ax])) - Math.min(...c.map((p) => p[ax])); };
  /** 복제: 세운 것은 옆에(50 띄워), 눕힌 것(선반 따위)은 위에(250 띄워) */
  function dupPart() {
    const el = cur(), q = curPart();
    if (!el || !q) return null;
    const { ha, hs, va, vs } = axesOf(viewNow()), w = extentOn(q, ha), h = extentOn(q, va), sh = [0, 0, 0];
    if (w <= h) sh[ha] = r1(w + 50) * (hs || 1); else sh[va] = r1(h + 250) * (vs || 1);
    const c = JSON.parse(JSON.stringify(q));
    delete c.id;
    return addPart(el, { ...c, ...moved(c, sh) }, '부재 복제');
  }
  /** 여러 개: 같은 간격으로 몇 개 더 */
  async function arrayPart() {
    const el = cur(), q = curPart();
    if (!el || !q) return null;
    const v = viewNow(), A = axesOf(v), w = extentOn(q, A.ha), h = extentOn(q, A.va);
    const dirs = [['r', '오른쪽 →'], ['u', '위 ↑'], ['l', '← 왼쪽'], ['d', '아래 ↓'], ['f', (DEPTH[v] || DEPTH.front)[2].replace(/ \(.*\)/, '')], ['b', (DEPTH[v] || DEPTH.front)[3]]];
    const def = w <= h ? 'r' : 'u';
    let dir = def;
    const r = await App.ui.dialog({
      title: '여러 개 늘어놓기',
      html: `<div class="field-grid">
          <div class="field"><label class="field-label" for="dsArrN">몇 개 더</label><div class="field-box"><input id="dsArrN" type="text" inputmode="numeric" value="3" autocomplete="off"><span class="field-unit">개</span></div></div>
          <div class="field"><label class="field-label" for="dsArrP">중심 간격</label><div class="field-box"><input id="dsArrP" type="text" inputmode="decimal" value="${r1(def === 'r' ? w + 50 : h + 250)}" autocomplete="off"><span class="field-unit">mm</span></div></div>
        </div>
        <div class="field"><span class="field-label">방향 <small>(${esc({ front: '정면도', top: '평면도', side: '측면도', iso: '지금 보는 방향', all: '정면도' }[v] || '정면도')} 기준)</small></span>
          <div class="seg seg-inline" role="radiogroup" id="dsArrDir">${dirs.map(([id, t]) => `<button type="button" class="seg-btn" role="radio" data-dir="${id}" aria-checked="${id === def}">${esc(t)}</button>`).join('')}</div></div>
        <p class="props-meta">선반을 같은 간격으로 넣거나 칸막이·각재를 나란히 세울 때 씁니다. 한 번의 실행 취소로 모두 없어집니다.</p>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '늘어놓기', primary: true }],
      onOpen(body) {
        body.querySelector('#dsArrDir').addEventListener('click', (e) => {
          const b = e.target.closest('[data-dir]');
          if (!b) return;
          dir = b.dataset.dir;
          body.querySelectorAll('#dsArrDir [data-dir]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
          body.querySelector('#dsArrP').value = r1(dir === 'r' || dir === 'l' ? w + 50 : dir === 'u' || dir === 'd' ? h + 250 : 300);
        });
      },
    });
    if (r.id !== 'ok') return null;
    const n = Math.round(calc(r.body.querySelector('#dsArrN').value)), pitch = calc(r.body.querySelector('#dsArrP').value);
    if (!(n >= 1 && n <= 50) || !(pitch > 0)) { App.ui.toast('개수(1~50)와 간격을 넣어 주세요.'); return null; }
    const { ha, hs, va, vs, ta, toward } = A, unit = [0, 0, 0];
    if (dir === 'r' || dir === 'l') unit[ha] = (dir === 'r' ? 1 : -1) * (hs || 1); else if (dir === 'u' || dir === 'd') unit[va] = (dir === 'u' ? 1 : -1) * (vs || 1); else unit[ta] = (dir === 'f' ? 1 : -1) * toward;
    const base = JSON.parse(JSON.stringify(q));
    delete base.id;
    const made = [];
    for (let i = 1; i <= n; i++) made.push({ id: uid(), ...base, ...moved(base, unit.map((u) => u * pitch * i)) });
    patch(el, '여러 개 늘어놓기', { parts: [...userParts(el), ...made] }, true);
    sel = made[made.length - 1].id; formKey = '';
    refreshPanes();
    return made.length;
  }
  /** 부재 넣기: 'hp' 가로판(선반·바닥) · 'vp' 세로판(옆판·칸막이) · 'fp' 정면판(뒤판·문짝, 뒤쪽에) · 'bar' 막대 · 'led' LED.
      지금 설계의 크기에 맞추고, 남는 한 축은 화면 가운데에 보이는 자리로 */
  /** 설계물 안의 빈 자리를 따지는 도구 (사이에 맞춰 넣기·칸 채우기가 같이 씀).
      min·size: 지금 설계의 범위 (판 하나뿐이라 너무 좁은 쪽은 기본 크기 600 × 400 × 720으로), boxes: 부재마다 [[x0,x1],[y0,y1],[z0,z1]],
      span(ax, seed, band): 씨앗 점에서 양쪽으로 가장 가까운 부재 면까지 (다른 두 축에서 band와 겹치는 부재만 막음, 씨앗을 품는 뒤판 따위는 지나침),
      gapsOf(ax, band): 축 ax를 따라 비어 있는 칸들 [[lo, hi]] */
  function spaceOf(el) {
    const B = D().build(el), ps = B.parts.filter((q) => !q.halo && q.role !== 'lite'), has = B.parts.some((q) => !q.halo);
    const min = has ? B.min.slice() : [0, 0, 0], DEF = [600, 400, 720], size = has ? [B.size.w, B.size.d, B.size.h].map((v, i) => (v >= (i === 1 ? 100 : 200) ? v : DEF[i])) : DEF.slice();
    const mid = (k) => snapTo(min[k] + size[k] / 2, 10);
    const boxes = ps.map((q) => { const c = D().corners(q); return [0, 1, 2].map((k) => [Math.min(...c.map((p) => p[k])), Math.max(...c.map((p) => p[k]))]); });
    const span = (ax, seed, band) => {
      let lo = min[ax], hi = min[ax] + size[ax];
      boxes.forEach((bx) => {
        for (let k = 0; k < 3; k++) if (k !== ax && (bx[k][1] <= band[k][0] + 1 || bx[k][0] >= band[k][1] - 1)) return;
        const [a, b] = bx[ax];
        if (a < seed && b > seed) return;
        if (b <= seed && b > lo) lo = b;
        if (a >= seed && a < hi) hi = a;
      });
      return hi - lo >= 50 ? [lo, hi] : [min[ax], min[ax] + size[ax]];
    };
    const gapsOf = (ax, band) => {
      const blocks = [];
      boxes.forEach((bx) => { for (let k = 0; k < 3; k++) if (k !== ax && (bx[k][1] <= band[k][0] + 1 || bx[k][0] >= band[k][1] - 1)) return; blocks.push(bx[ax]); });
      blocks.sort((p, q) => p[0] - q[0]);
      const out = [], end = min[ax] + size[ax];
      let p = min[ax];
      blocks.forEach(([lo, hi]) => { if (lo > p + 0.5) out.push([p, lo]); p = Math.max(p, hi); });
      if (end > p + 0.5) out.push([p, end]);
      return out;
    };
    return { B, parts: ps, has, min, size, mid, boxes, span, gapsOf, sy: mid(1), thin: (v) => [v - 1, v + 1] };
  }
  /* ── 칸 채우기: 정면도에서 판으로 둘러싸인 빈 칸을 누르면 그 칸이 골라지고, 아래 막대에서 선반·칸막이·서랍·문짝·봉을 한 번에 넣음 ── */
  let cell = null;      // { id(설계물), x: [x0, x1], y: [앞, 뒤], z: [z0, z1], bound: { l, r, b, t } (그쪽이 판으로 막혀 있는지), front(몸통 앞면 y) }
  let cellKind = '';    // 막대에서 고른 것 ('shelf' | 'div' | 'drawer' | 'door'): 둘째 줄에 몇 개 넣을지
  const moving = (q) => !!(q.door || q.front || q.an || q.mv); // 문짝·서랍 앞판처럼 움직이는 것 (몸통 앞면을 따질 때 뺌)
  /** 정면도의 (x, z)를 품는 빈 칸. 판으로 세 쪽 이상 막힌 칸만 (탁 트인 바깥은 칸이 아님) */
  function cellAt(el, x, z) {
    if (!el || el.kind === 'model') return null;
    const S = spaceOf(el), { min, size, sy, thin, gapsOf, span } = S;
    if (!S.has || x <= min[0] || x >= min[0] + size[0] || z <= min[2] || z >= min[2] + size[2]) return null;
    const inGap = (gs, v) => gs.find(([lo, hi]) => v > lo && v < hi) || null;
    const Z0 = inGap(gapsOf(2, [thin(x), thin(sy), null]), z);
    if (!Z0) return null;
    const X = inGap(gapsOf(0, [null, thin(sy), [Z0[0] + 1, Z0[1] - 1]]), x);
    if (!X) return null;
    const Z = inGap(gapsOf(2, [[X[0] + 1, X[1] - 1], thin(sy), null]), z) || Z0; // 칸 폭 전체에서 위아래로 가장 가까운 판까지
    if (X[1] - X[0] < 80 || Z[1] - Z[0] < 80) return null; // 걸레받이 자리처럼 낮은 틈은 칸으로 치지 않음
    const e = 0.6, bound = { l: X[0] > min[0] + e, r: X[1] < min[0] + size[0] - e, b: Z[0] > min[2] + e, t: Z[1] < min[2] + size[2] - e };
    if ([bound.l, bound.r, bound.b, bound.t].filter(Boolean).length < 3) return null;
    // 몸통 앞면: 이 칸을 둘러싼 판들의 앞 끝 (문짝·서랍 앞판은 빼고) — 문짝은 그 앞에 덧대고, 선반은 거기서 시작
    let front = Infinity;
    S.boxes.forEach((bx, i) => {
      if (moving(S.parts[i])) return;
      const touchX = bx[0][1] >= X[0] - 2 && bx[0][0] <= X[1] + 2, touchZ = bx[2][1] >= Z[0] - 2 && bx[2][0] <= Z[1] + 2;
      if (touchX && touchZ && bx[1][0] < sy) front = Math.min(front, bx[1][0]);
    });
    if (!Number.isFinite(front)) front = min[1];
    const Y = span(1, sy, [[X[0] + 1, X[1] - 1], null, [Z[0] + 1, Z[1] - 1]]);
    return { id: el.id, x: X, y: [Math.max(Y[0], front), Y[1]], z: Z, bound, front };
  }
  const sameCell = (p, q) => !!p && !!q && p.id === q.id && [0, 1].every((k) => Math.abs(p.x[k] - q.x[k]) < 0.5 && Math.abs(p.z[k] - q.z[k]) < 0.5);
  let cellTip = false;
  function setCell(c) {
    if (!c && !cell) return;
    cell = c && !sameCell(c, cell) ? { ...c, B: D().build(cur()) } : null; // 같은 칸을 다시 누르면 풀림
    cellKind = '';
    if (cell && sel) { sel = null; formKey = ''; refreshPanes(); }
    quickKey = ''; renderQuick(); render();
    if (cell && !cellTip) { cellTip = true; App.ui.toast('빈 칸을 골랐습니다 — 아래에서 선반·칸막이·서랍·문짝·봉을 눌러 넣으세요.'); }
  }
  /** 눌린 부재가 그 칸의 뒤를 이루는 판(뒤판)인지 — 칸 안쪽을 누르면 뒤판보다 칸을 먼저 고름 */
  const behindCell = (q, c) => { const k = D().corners(q); return Math.min(...k.map((p) => p[1])) >= c.y[1] - 1; };
  /** 고른 칸에 넣기. kind: 'shelf'(선반 n장, 같은 간격) | 'div'(세로 칸막이 n개) | 'drawer'(서랍 n단: 앞판 + 통) | 'door'(문짝 n짝) | 'rod'(옷걸이 봉). 넣은 개수를 돌려줌 */
  function fillCell(kind, n = 1) {
    const el = cur(), c = cell && el && cell.id === el.id ? cell : null;
    if (!c) return 0;
    const S = D().sheet(App.current.dsSheet || 'ply18'), t = S.t, r = (v) => r1(v);
    const [x0, x1] = c.x, [y0, y1] = c.y, [z0, z1] = c.z, W = x1 - x0, H = z1 - z0, Dp = y1 - y0, made = [];
    const P = (name, m, x, y, z, w, d, h, o = {}) => made.push({ s: 'box', n: name, m, x: r(x), y: r(y), z: r(z), w: r(w), d: r(d), h: r(h), ...o });
    n = Math.max(1, Math.min(8, Math.round(n) || 1));
    // 문짝·서랍 앞판이 덮는 네모: 판으로 막힌 쪽은 그 판 두께의 반쯤(틈 3)을 덮음 — 옆 칸의 문짝과 부딪히지 않게
    const ov = (on) => (on ? Math.max(0, t / 2 - 1.5) : 0), G = 3;
    const fx0 = x0 - ov(c.bound.l), fx1 = x1 + ov(c.bound.r), fz0 = z0 - ov(c.bound.b), fz1 = z1 + ov(c.bound.t), fy = c.front - t;
    let label = '', note = '';
    if (kind === 'shelf') {
      const gap = (H - n * t) / (n + 1);
      if (gap < 40) { App.ui.toast(`칸 높이 ${fmt(H)}에는 선반 ${n}장이 들어가지 않습니다.`); return 0; }
      for (let i = 0; i < n; i++) P('선반', S.id, x0, y0, z0 + gap * (i + 1) + t * i, W, Dp, t);
      label = `선반 ${n}장 넣기`; note = `선반 ${n}장 (${fmt(W)} × ${fmt(Dp)}) — 칸 사이 ${fmt(r(gap))}`;
    } else if (kind === 'div') {
      const gap = (W - n * t) / (n + 1);
      if (gap < 60) { App.ui.toast(`칸 폭 ${fmt(W)}에는 칸막이 ${n}개가 들어가지 않습니다.`); return 0; }
      for (let i = 0; i < n; i++) P('칸막이', S.id, x0 + gap * (i + 1) + t * i, y0, z0, t, Dp, H);
      label = `칸막이 ${n}개 넣기`; note = `칸막이 ${n}개 (${fmt(Dp)} × ${fmt(H)}) — 칸 폭 ${fmt(r(gap))}`;
    } else if (kind === 'rod') {
      if (W < 100 || H < 120) { App.ui.toast('봉을 걸기에는 칸이 너무 작습니다.'); return 0; }
      P('옷걸이 봉', 'rod25', x0, y0 + Dp / 2 - 12.5, z1 - Math.min(80, H * 0.25) - 25, W, 25, 25);
      label = '옷걸이 봉 넣기'; note = `옷걸이 봉 ${fmt(W)}`;
    } else if (kind === 'door') {
      n = Math.min(2, n);
      const dw = (fx1 - fx0 - G * (n - 1)) / n, dh = fz1 - fz0;
      if (dw < 80 || dh < 80) { App.ui.toast('문짝을 달기에는 칸이 너무 작습니다.'); return 0; }
      for (let i = 0; i < n; i++) P('문짝', S.id, fx0 + (dw + G) * i, fy, fz0, dw, t, dh, { mv: n === 1 || i === 0 ? 'dl' : 'dr' });
      label = `문짝 ${n}짝 달기`; note = `문짝 ${n}짝 (${fmt(r(dw))} × ${fmt(r(dh))}) — 3D 보기에서 열어 볼 수 있습니다`;
    } else if (kind === 'drawer') {
      const fh = (fz1 - fz0 - G * (n - 1)) / n;
      if (fh < 70 || W < 160) { App.ui.toast(`이 칸에는 서랍 ${n}단이 들어가지 않습니다.`); return 0; }
      const T = D().sheet('ply15'), B5 = D().sheet('ply5'), tb = T.t, len = D().slideFor(Dp), box = Dp >= len + 4;
      for (let i = 0; i < n; i++) {
        const fz = fz0 + (fh + G) * i;
        P('서랍 앞판', S.id, fx0, fy, fz, fx1 - fx0, t, fh, { mv: 'df' });
        if (!box) continue; // 칸이 얕으면 앞판만
        const bw = W - 26, bh = Math.max(60, Math.min(fh - 56, 250)), bx = x0 + 13, by = c.front + 2, bz = Math.max(fz, z0) + 26;
        P('서랍 옆판', T.id, bx, by, bz, tb, len, bh, { mv: 'dw' }); P('서랍 옆판', T.id, bx + bw - tb, by, bz, tb, len, bh, { mv: 'dw' });
        P('서랍 앞뒤판', T.id, bx + tb, by, bz, bw - 2 * tb, tb, bh, { mv: 'dw' }); P('서랍 앞뒤판', T.id, bx + tb, by + len - tb, bz, bw - 2 * tb, tb, bh, { mv: 'dw' });
        P('서랍 밑판', B5.id, bx, by, bz - B5.t, bw, len, B5.t, { mv: 'dw' });
      }
      label = `서랍 ${n}단 넣기`; note = `서랍 ${n}단 (앞판 ${fmt(r(fx1 - fx0))} × ${fmt(r(fh))}${box ? ` · 통 깊이 ${fmt(len)}` : ' · 칸이 얕아 앞판만'})`;
    } else return 0;
    cell = null; cellKind = ''; sel = null; formKey = '';
    patch(el, label, { parts: [...userParts(el), ...made.map((q) => ({ id: uid(), ...q }))] }, true);
    quickKey = ''; refreshPanes(); renderQuick(); syncBar(); render();
    App.ui.toast(`${note} — 잘못 넣었으면 ↶ 되돌리기`);
    return made.length;
  }

  /* ── 통 만들기: 빈 자유 설계에서 크기만 넣어 옆판·천판·지판·뒤판(·걸레받이)을 한 번에 — 그다음 빈 칸을 눌러 채움 ── */
  let boxLast = { W: 800, H: 1200, D: 400, P: 60, back: true };
  function boxParts(o) {
    const S = D().sheet(App.current.dsSheet || 'ply18'), t = S.t, { W, H, P } = o, Dp = o.D, bk = o.back ? t : 0, out = [];
    const B = (n, x, y, z, w, d, h) => out.push({ id: uid(), s: 'box', n, m: S.id, x: r1(x), y: r1(y), z: r1(z), w: r1(w), d: r1(d), h: r1(h) });
    B('옆판', 0, 0, 0, t, Dp, H); B('옆판', W - t, 0, 0, t, Dp, H);
    B('지판', t, 0, P, W - 2 * t, Dp - bk, t); B('천판', t, 0, H - t, W - 2 * t, Dp - bk, t);
    if (o.back) B('뒤판', t, Dp - t, P, W - 2 * t, t, H - P);
    if (P >= 40) B('걸레받이', t, Math.min(30, Dp / 4), 0, W - 2 * t, t, P);
    return out;
  }
  async function makeBox() {
    const el = cur();
    if (!el || el.kind === 'model') return null;
    const L = boxLast, S = D().sheet(App.current.dsSheet || 'ply18');
    const f = (id, label, v) => `<div class="field"><label class="field-label" for="${id}">${label}</label><div class="field-box"><input id="${id}" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="${v}"><span class="field-unit">mm</span></div></div>`;
    const pr = App.ui.dialog({
      title: '통 만들기',
      html: `<div class="ds-props"><div class="field-grid">${f('dsBoxW', '폭', L.W)}${f('dsBoxH', '높이', L.H)}${f('dsBoxD', '깊이', L.D)}${f('dsBoxP', '걸레받이 높이', L.P)}</div>
        <label class="check-row" for="dsBoxB"><input type="checkbox" id="dsBoxB" ${L.back ? 'checked' : ''}><span><b>뒤판 넣기</b></span></label>
        <p class="props-meta">옆판 2 · 천판 · 지판 · 뒤판을 ${esc(S.name)}로 만듭니다 (걸레받이 높이가 0이면 바닥에 붙음). 만든 뒤 <b>빈 칸을 눌러</b> 선반·칸막이·서랍·문짝을 넣으세요.</p></div>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '만들기', primary: true }],
    });
    const first = document.querySelector('#dialogBody #dsBoxW');
    if (first) { first.focus(); first.select(); }
    const r = await pr;
    if (r.id !== 'ok' || !cur() || cur().id !== el.id) return null;
    const num = (id, lo, hi) => { const v = calc(r.body.querySelector(id).value); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : NaN; };
    const o = { W: num('#dsBoxW', 150, 6000), H: num('#dsBoxH', 150, 3000), D: num('#dsBoxD', 100, 1500), P: num('#dsBoxP', 0, 300), back: r.body.querySelector('#dsBoxB').checked };
    if (![o.W, o.H, o.D, o.P].every(Number.isFinite)) { App.ui.toast('숫자를 넣어 주세요.'); return null; }
    if (o.P > o.H - 100) o.P = 0;
    boxLast = o;
    const made = boxParts(o);
    sel = null; formKey = ''; quickKey = '';
    patch(cur(), '통 만들기', { parts: [...userParts(cur()), ...made] });
    refreshPanes(); renderQuick(); syncBar(); render();
    setTimeout(() => { if (isMode()) fit(); }, 0);
    App.ui.toast(`통을 만들었습니다 (${fmt(o.W)} × ${fmt(o.D)} × ${fmt(o.H)}) — 빈 칸을 눌러 선반·서랍·문짝을 넣으세요.`);
    return made;
  }

  /* ── 멀리 떨어진 부재: 실수로 멀리 옮겨진 부재 하나 때문에 전체 크기가 커져 도면이 깨알만 해지는 것을 한 번에 바로잡음 ── */
  let strayMemo = { B: null, S: null };
  /** 서로 닿거나 가까운(틈 150 이하) 부재끼리 묶어 가장 큰 묶음을 본체로 보고, 본체에서 far(본체 긴 쪽의 60%, 적어도 1,500) 넘게 떨어진 묶음들.
      직접 넣은 부재만 (값으로 만든 것은 떨어질 수 없음). 없으면 null */
  function strays(el = cur()) {
    if (!el || el.kind === 'model') return null;
    const B = D().build(el);
    if (strayMemo.B === B) return strayMemo.S;
    const ps = B.parts.filter((q) => !q.halo), find = (par, i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    let out = null;
    if (ps.length >= 2 && ps.length <= 600 && ps.some((q) => q.user)) {
      const bx = ps.map((q) => { const c = D().corners(q); return [0, 1, 2].map((k) => [Math.min(...c.map((p) => p[k])), Math.max(...c.map((p) => p[k]))]); });
      const par = ps.map((_, i) => i), near = (A, C) => [0, 1, 2].every((k) => A[k][0] <= C[k][1] + 150 && C[k][0] <= A[k][1] + 150);
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) if (find(par, i) !== find(par, j) && near(bx[i], bx[j])) par[find(par, i)] = find(par, j);
      const groups = new Map();
      ps.forEach((_, i) => { const g = find(par, i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i); });
      if (groups.size > 1) {
        const boxOf = (idx) => [0, 1, 2].map((k) => [Math.min(...idx.map((i) => bx[i][k][0])), Math.max(...idx.map((i) => bx[i][k][1]))]);
        const vol = (idx) => idx.reduce((sum, i) => sum + [0, 1, 2].reduce((m, k) => m * Math.max(1, bx[i][k][1] - bx[i][k][0]), 1), 0);
        const list = [...groups.values()].sort((p, q) => vol(q) - vol(p)), mb = boxOf(list[0]);
        const far = Math.max(1500, Math.max(...mb.map((v) => v[1] - v[0])) * 0.6), found = [];
        list.slice(1).forEach((idx) => {
          const b = boxOf(idx), gap = Math.max(...[0, 1, 2].map((k) => Math.max(mb[k][0] - b[k][1], b[k][0] - mb[k][1], 0)));
          if (gap > far && idx.every((i) => ps[i].user)) found.push({ ids: idx.map((i) => ps[i].id), names: idx.map((i) => ps[i].n || '부재'), box: b, gap: Math.round(gap) });
        });
        if (found.length) out = { main: mb, list: found, count: found.reduce((m, g) => m + g.ids.length, 0) };
      }
    }
    strayMemo = { B, S: out };
    return out;
  }
  /** 멀리 떨어진 부재들을 본체 오른쪽 옆(100 띄움)·본체 바닥 높이로 가져옴 (한 번에 되돌릴 수 있음). 가져온 개수 */
  function bringStrays() {
    const el = cur(), S = strays(el);
    if (!S) return 0;
    const sh = new Map();
    let x = S.main[0][1] + 100;
    S.list.forEach((g) => { const d = [x - g.box[0][0], S.main[1][0] - g.box[1][0], S.main[2][0] - g.box[2][0]]; g.ids.forEach((id) => sh.set(id, d)); x += g.box[0][1] - g.box[0][0] + 100; });
    patch(el, '멀리 떨어진 부재 가져오기', { parts: userParts(el).map((q) => (sh.has(q.id) ? { ...q, ...moved(q, sh.get(q.id)) } : q)) });
    sel = null; formKey = ''; quickKey = '';
    refreshPanes(); renderQuick(); render();
    setTimeout(() => { if (isMode()) fit(); }, 0);
    App.ui.toast(`멀리 떨어져 있던 부재 ${S.count}개를 본체 오른쪽 옆으로 가져왔습니다.`);
    return S.count;
  }

  function addShape(kind) {
    const el = cur();
    if (!el) { App.ui.toast('먼저 ‘＋ 새 설계’로 설계물을 만드세요.'); return null; }
    if (el.kind === 'model') { App.ui.toast('내려받은 모델에는 부재를 넣을 수 없습니다. ‘＋ 새 설계 → 자유 설계’에서 만드세요.'); return null; }
    const { has, min, size, mid, sy, thin, span, gapsOf } = spaceOf(el);
    // 화면 가운데가 그림 안이면 그 자리를 씀 (보고 있는 곳에 생기게)
    const v = viewNow(), P = App.plan, at = (() => {
      if (!has || !ORTHO.includes(v)) return null;
      const c = P.view.toWorld(P.width / 2, (P.height - ((P.insets && P.insets.bottom) || 0)) / 2), h = DD().hit(el, c, 0, v);
      if (!h || !h.at) return null;
      const { ha, va } = axesOf(v), o = {};
      o[ha] = snapTo(h.at[0], 10); o[va] = snapTo(h.at[1], 10);
      return o;
    })();
    const pick = (k) => (at && at[k] != null ? Math.max(min[k], Math.min(min[k] + size[k], at[k])) : mid(k));
    const S = D().sheet(App.current.dsSheet || 'ply18'), t = S.t;
    /** 새 부재(두께 th)가 들어갈 칸의 가운데: 화면을 확대해 보고 있으면 보는 자리(seed)의 칸, 전체를 보고 있으면 가장 넓은 칸 */
    const looking = !!at && !autoFitted();
    const center = (ax, seed, band, th) => {
      const gs = gapsOf(ax, band).filter(([lo, hi]) => hi - lo >= th + 20);
      if (!gs.length) return null;
      const here = looking && at[ax] != null ? gs.find(([lo, hi]) => seed >= lo && seed <= hi) || gs.slice().sort((p, q) => Math.abs((p[0] + p[1]) / 2 - seed) - Math.abs((q[0] + q[1]) / 2 - seed))[0] : null;
      const g = here || gs.slice().sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
      return { g, v: Math.max(g[0], Math.min(g[1] - th, snapTo(g[0] + (g[1] - g[0] - th) / 2, 10))) };
    };
    let part;
    if (kind === 'hp' || kind === 'bar' || kind === 'led') { // 가로로 눕는 것: 양옆 판 사이 (가로판은 뒤판 앞까지)
      const M = kind === 'bar' ? D().bar(App.current.dsBar || 'sq50') : null, r = M ? D().rail('막대', M.id, 'x', 0, 0, 0, 100) : null, th = kind === 'hp' ? t : r ? r.h : 10;
      const sx = pick(0), cz = has && kind === 'hp' ? center(2, pick(2), [thin(sx), thin(sy), null], th) : null; // 가로판은 칸(위아래 판 사이)의 가운데 높이에
      const z = cz ? cz.v : has ? Math.max(min[2], Math.min(pick(2), min[2] + size[2] - th)) : 0;
      const X = has ? span(0, sx, [null, thin(sy), [z, z + th]]) : [min[0], min[0] + size[0]];
      const Y = has && kind === 'hp' ? span(1, sy, [[X[0] + 1, X[1] - 1], null, [z, z + th]]) : [min[1], min[1] + size[1]];
      if (kind === 'hp') part = { s: 'box', n: '가로판', m: S.id, x: r1(X[0]), y: r1(Y[0]), z, w: r1(X[1] - X[0]), d: r1(Y[1] - Y[0]), h: t };
      else if (kind === 'bar') part = { s: 'box', n: '막대', m: M.id, x: r1(X[0]), y: min[1], z, w: r1(X[1] - X[0]), d: r.d, h: r.h };
      else { const sp = App.ledstrip.spec(el.p || {}), y = min[1] - 5, zz = has ? pick(2) : 0; part = { s: 'bar', n: 'LED 라인', m: 'ledline', role: 'lite', a: [r1(X[0]), y, zz], b: [r1(X[1]), y, zz], lt: sp.type, k: sp.k, pf: sp.prof }; }
    } else if (kind === 'vp') { // 세로판: 위아래 판 사이, 뒤판 앞까지
      // 세로판은 칸(위아래 판 사이)을 먼저 정하고, 그 칸의 양옆 판 사이 가운데에
      const sx = pick(0), cz = has ? center(2, pick(2), [thin(sx), thin(sy), null], 30) : null, sz = cz ? (cz.g[0] + cz.g[1]) / 2 : pick(2);
      const cx = has && cz ? center(0, sx, [null, thin(sy), [cz.g[0] + 1, cz.g[1] - 1]], t) : null;
      const x = cx ? cx.v : Math.max(min[0], Math.min(sx, min[0] + size[0] - t));
      const Z = has ? span(2, sz, [[x, x + t], thin(sy), null]) : [min[2], min[2] + size[2]];
      const Y = has ? span(1, sy, [[x, x + t], null, [Z[0] + 1, Z[1] - 1]]) : [min[1], min[1] + size[1]];
      part = { s: 'box', n: '세로판', m: S.id, x, y: r1(Y[0]), z: r1(Z[0]), w: t, d: r1(Y[1] - Y[0]), h: r1(Z[1] - Z[0]) };
    } else if (kind === 'fp') part = { s: 'box', n: '정면판', m: S.id, x: min[0], y: has ? min[1] + size[1] - t : 0, z: min[2], w: size[0], d: t, h: size[2] };
    else return null;
    const made = addPart(el, part, { hp: '가로판 넣기', vp: '세로판 넣기', fp: '정면판 넣기', bar: '막대 넣기', led: 'LED 라인 넣기' }[kind]);
    render();
    if (!has) setTimeout(() => App.plan.fitToContent(), 0);
    if (!tipShown) { tipShown = true; App.ui.toast('끌면 옮기기 · 주황 점은 크기 · 치수 숫자를 누르면 숫자로'); }
    return made;
  }
  /** 고른 부재의 숫자 칸(속성)을 엶: 휴대폰은 서랍을 올림 */
  function openPartFields() {
    const tab = document.getElementById('tab-props');
    if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
    const sh = App.ui.sheet;
    if (App.ui.mobile && App.ui.mobile.matches && sh && !sh.isOpen()) sh.set(Math.max(sh.lastOpen || 0, sh.max() * 0.55));
    setTimeout(() => { const p = document.getElementById('dsPart'); if (p) p.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60);
  }
  let quickKey = '';
  let barOpen = false;   // 좁은 화면: ‘⋯’로 펼친 줄(조금씩 옮기기·여러 개·자르기·꺾기·둥글게)
  /** 막대를 접어 둔 휴대폰 화면인지 (3.9 — 도면 말고는 접어 두고 필요할 때만 엶) */
  const foldedPhone = () => !!(App.ui.bars && App.ui.bars.folded('tools'));
  /** 화면(도면 칸)이 좁거나 낮으면 빠른 막대를 한 줄로 */
  const compactBar = () => { const st = document.getElementById('stage'); return !!st && (st.clientWidth < 900 || st.clientHeight < 520); };
  function renderQuick() {
    const bar = document.getElementById('dsQuick');
    if (!bar) return;
    const el = isMode() ? cur() : null;
    const show = !!el && el.kind !== 'model' && App.ui.tool === 'dselect';
    if (bar.hidden !== !show) { bar.hidden = !show; quickKey = ''; if (App.plan) render(); }
    const stageEl = document.getElementById('stage');
    if (!show) { if (stageEl) stageEl.classList.remove('has-dsq'); if (App.ui.syncRow) App.ui.syncRow(); return; }
    const v = viewNow(), q = sel ? D().build(el).parts.find((x) => x.id === sel && !x.halo) : null, user = q && q.user;
    const compact = compactBar(), top3d = !!axesOf(v).top; // 3D에서 내려다볼 때: 앞·뒤 단추가 위·아래
    const tight = foldedPhone(); // 접어 둔 휴대폰 화면: 넣기 줄도 접어 둠 (‘＋ 넣기’ 하나만 — 누르면 펼쳐지고, 넣거나 도면을 만지면 접힘)
    // 고른 칸: 부재를 고르거나 설계물·그림이 바뀌면 풀고, 부재가 바뀌었으면(되돌리기 따위) 같은 칸이 아직 있는지 다시 봄
    if (cell && (q || cell.id !== el.id || !(v === 'front' || v === 'all'))) { cell = null; cellKind = ''; }
    if (cell && cell.B !== D().build(el)) { const c2 = cellAt(el, (cell.x[0] + cell.x[1]) / 2, (cell.z[0] + cell.z[1]) / 2); cell = sameCell(c2, cell) ? { ...c2, B: D().build(el) } : null; if (!cell) cellKind = ''; }
    const stray = !q && !cell ? strays(el) : null;
    const blank = !q && !cell && el.kind === 'free' && !D().build(el).parts.some((x) => !x.halo); // 아직 아무것도 없는 자유 설계: 통부터 만들 수 있게
    const open = addOpen == null ? (tight ? blank : el.kind === 'free') : addOpen;
    const key = q ? `${el.id}|${q.id}|${user ? 'u' : 'g'}|${v}|${step}|${q.s}|${q.n}|${compact}|${barOpen}|${top3d}`
      : cell ? `${el.id}|cell|${cell.x.join()}|${cell.z.join()}|${cellKind}|${compact}` : `${el.id}|none|${open}|${el.kind === 'free'}|${compact}|${stray ? stray.count : 0}|${blank}|${tight}`;
    // 접어 둔 휴대폰 화면: 고른 것이 있거나 넣기 줄을 폈으면 아래 줄을 이 막대가 차지함 (도구·화면 맞춤 단추는 잠깐 숨음)
    if (stageEl) stageEl.classList.toggle('has-dsq', !!(q || cell || open));
    bar.classList.toggle('is-addopen', !q && !cell && open);
    const sizeText = q ? (q.s === 'bar' ? `길이 ${fmt(D().lenOf(q))}` : q.s === 'arc' ? `곡선 ${fmt(D().arcLen(q))}` : `${fmt(q.w)} × ${fmt(q.d)} × ${fmt(q.h)}`) : '';
    if (key !== quickKey) {
      quickKey = key;
      bar.dataset.state = q ? (user ? 'part' : 'gen') : cell ? 'cell' : 'add';
      bar.classList.toggle('is-3d', v === 'iso');
      bar.classList.toggle('is-compact', compact);
      bar.classList.toggle('is-open', !!(q && user && barOpen));
      if (q && user) {
        const dp = top3d ? DEPTH.top : DEPTH[v] || DEPTH.front, curved = q.s === 'poly' || q.s === 'arc';
        bar.innerHTML = `
          <div class="ds-q-row ds-q-main">
            <button type="button" class="btn ds-q-name" data-dq="edit" title="이름·자재·크기·자리를 숫자로 (속성 칸)"><b>${esc(q.n || '부재')}</b><small id="dsQSize">${esc(sizeText)}</small></button>
            ${curved ? '' : '<button type="button" class="btn" data-dq="rot" title="지금 보는 면에서 90° 돌리기 (세우기·눕히기)">90°</button>'}
            <button type="button" class="btn" data-dq="dup" title="옆이나 위에 하나 더 (Ctrl+D)">복제</button>
            <button type="button" class="btn btn-danger" data-dq="del" title="이 부재 지우기 (Del)">삭제</button>
            <button type="button" class="btn ds-q-morebtn" data-dq="more" aria-expanded="${barOpen}" aria-label="${barOpen ? '접기' : '더 보기: 조금씩 옮기기 · 여러 개 · 자르기 · 꺾기 · 둥글게'}" title="조금씩 옮기기 · 여러 개 · 자르기 · 꺾기 · 둥글게">${barOpen ? '접기' : '더보기'}</button>
          </div>
          <div class="ds-q-row ds-q-extra ds-q-nudge">
            <button type="button" class="btn ds-q-sq" data-dq="nudge" data-d="-1,0" aria-label="왼쪽으로" title="왼쪽으로 (←)">←</button>
            <button type="button" class="btn ds-q-sq" data-dq="nudge" data-d="0,1" aria-label="위로" title="위로 (↑)">↑</button>
            <button type="button" class="btn ds-q-sq" data-dq="nudge" data-d="0,-1" aria-label="아래로" title="아래로 (↓)">↓</button>
            <button type="button" class="btn ds-q-sq" data-dq="nudge" data-d="1,0" aria-label="오른쪽으로" title="오른쪽으로 (→)">→</button>
            <button type="button" class="btn ds-q-dp" data-dq="depth" data-d="1" title="${esc(dp[2])}">${esc(dp[0])}</button>
            <button type="button" class="btn ds-q-dp" data-dq="depth" data-d="-1" title="${esc(dp[3])}">${esc(dp[1])}</button>
            <button type="button" class="btn ds-q-step" data-dq="step" title="화살표 한 번에 옮기는 거리 (누르면 바뀜)">${step}mm</button>
          </div>
          <div class="ds-q-row ds-q-extra ds-q-ops">
            <button type="button" class="btn" data-dq="array" title="같은 간격으로 여러 개 (선반 여러 단)">여러 개</button>
            <button type="button" class="btn" data-dq="cut" title="한 방향으로 여러 조각으로">자르기</button>
            <button type="button" class="btn" data-dq="bend" title="정한 자리에서 끝 쪽을 꺾어 ㄱ자로">꺾기</button>
            <button type="button" class="btn" data-dq="round" title="원·타원으로, 모서리만 둥글게, 네모로 되돌리기">둥글게</button>
          </div>`;
      } else if (q) {
        bar.innerHTML = `
          <div class="ds-q-row ds-q-main">
            <button type="button" class="btn ds-q-name" data-dq="edit" title="이 부재의 크기·자리 보기"><b>${esc(q.n || '부재')}</b><small id="dsQSize">${esc(sizeText)}</small></button>
            ${el.kind !== 'free' ? '<button type="button" class="btn btn-primary" data-dq="explode" title="값으로 만든 부재를 하나씩 옮기고 고칠 수 있게 풀기">부재로 풀어 고치기</button>' : ''}
          </div>
          <p class="ds-q-note">값으로 만든 부재 — 크기는 속성의 값으로 바꾸거나, 풀어서 직접 고칩니다.</p>`;
      } else if (cell) { // 빈 칸을 골랐을 때: 그 칸에 넣을 것. 종류를 누르면 둘째 줄에서 몇 개인지 고름 (봉은 바로)
        const W = cell.x[1] - cell.x[0], H = cell.z[1] - cell.z[0];
        const K = [['shelf', '선반', '이 칸에 선반을 같은 간격으로'], ['div', '칸막이', '이 칸을 세로 칸막이로 나눔'], ['drawer', '서랍', '이 칸에 서랍 (앞판 + 통)'], ['door', '문짝', '이 칸 앞에 문짝 (3D에서 열림)'], ['rod', '봉', '옷걸이 봉']];
        const N = { shelf: [[1, '1장'], [2, '2장'], [3, '3장'], [4, '4장'], [5, '5장']], div: [[1, '1개'], [2, '2개'], [3, '3개']], drawer: [[1, '1단'], [2, '2단'], [3, '3단'], [4, '4단']], door: [[1, '1짝'], [2, '2짝']] }[cellKind];
        bar.innerHTML = `
          <div class="ds-q-row ds-q-main ds-q-cell" role="group" aria-label="고른 칸 ${esc(fmt(W))} × ${esc(fmt(H))}에 넣기">
            ${K.map(([k, t, tip]) => `<button type="button" class="btn" data-dq="cell" data-k="${k}" aria-pressed="${cellKind === k}" title="${tip}">${t}</button>`).join('')}
          </div>
          ${N ? `<div class="ds-q-row ds-q-count">${N.map(([n, t]) => `<button type="button" class="btn" data-dq="cell-n" data-n="${n}">${t}</button>`).join('')}</div>` : ''}`;
      } else {
        const plus = tight ? '' : '+'; // 접어 둔 휴대폰 화면: ‘＋ 넣기’로 연 줄이라 이름만 (한 줄에 들어가게)
        bar.innerHTML = `
          ${stray ? `<div class="ds-q-row ds-q-warn"><button type="button" class="btn" data-dq="bring" title="본체에서 멀리 떨어진 부재 때문에 전체 크기가 커져 도면이 작게 보입니다. 누르면 본체 옆으로 가져옵니다 (되돌릴 수 있음)">멀리 떨어진 부재 ${stray.count}개 가져오기</button></div>` : ''}
          <div class="ds-q-row ds-q-main">
            ${open ? '' : `<button type="button" class="btn ds-q-add" data-dq="add-open" title="판·막대·LED를 바로 넣기">${tight ? '＋ 넣기' : '＋ 부재 넣기'}</button>`}
            ${open && blank ? `
            <button type="button" class="btn btn-primary ds-q-add ds-q-box" data-dq="box" title="옆판·천판·지판·뒤판으로 된 빈 통을 크기만 넣어 한 번에 — 그다음 빈 칸을 눌러 선반·서랍·문짝을 넣습니다">＋ 통 만들기</button>
            <button type="button" class="btn ds-q-add" data-dq="add" data-k="hp" title="눕힌 판 하나">${plus}가로판</button>
            <button type="button" class="btn ds-q-add" data-dq="add" data-k="vp" title="세운 판 하나">${plus}세로판</button>
            <button type="button" class="btn ds-q-add" data-dq="add" data-k="bar" title="각재·각파이프">${plus}막대</button>` : open ? `
            <button type="button" class="btn ds-q-add" data-dq="add" data-k="hp" title="선반·바닥판·상판처럼 눕힌 판 (양옆 판 사이에 맞춰 들어감)">${plus}가로판</button>
            <button type="button" class="btn ds-q-add" data-dq="add" data-k="vp" title="옆판·칸막이처럼 세운 판 (위아래 판 사이에 맞춰 들어감)">${plus}세로판</button>
            <button type="button" class="btn ds-q-add" data-dq="add" data-k="fp" title="뒤판·문짝처럼 정면을 보는 판 (뒤쪽에 넣음)">${plus}정면판</button>
            <button type="button" class="btn ds-q-add" data-dq="add" data-k="bar" title="각재·각파이프 (가로로 넣음, 90°로 세움)">${plus}막대</button>
            <button type="button" class="btn ds-q-add" data-dq="add" data-k="led" title="LED 라인 (앞면에)">${plus}LED</button>
            ${el.kind !== 'free' || tight ? '<button type="button" class="btn ds-q-x" data-dq="add-close" aria-label="부재 넣기 접기" title="접기">✕</button>' : ''}` : ''}
          </div>`;
      }
      App.icons.apply(bar);
      document.documentElement.style.setProperty('--dsq-h', `${bar.offsetHeight || 54}px`); // 알림이 막대 위에 뜨게
      if (App.ui.syncRow) App.ui.syncRow();
    } else {
      const sz = bar.querySelector('#dsQSize');
      if (sz && sz.textContent !== sizeText) sz.textContent = sizeText;
    }
  }
  function quickAct(name, btn) {
    const d = btn && btn.dataset.d ? btn.dataset.d.split(',').map(Number) : null;
    switch (name) {
      case 'cell': { // 칸에 넣을 것: 봉은 바로, 나머지는 몇 개인지 둘째 줄에서
        const k = btn.dataset.k;
        if (k === 'rod') return fillCell('rod');
        cellKind = cellKind === k ? '' : k; quickKey = ''; renderQuick();
        return cellKind;
      }
      case 'cell-n': return fillCell(cellKind, Number(btn.dataset.n) || 1);
      case 'box': if (foldedPhone()) addOpen = null; makeBox(); return true;
      case 'bring': return bringStrays();
      case 'nudge': return nudge([d[0] * step, d[1] * step, 0]);
      case 'depth': return nudge([0, 0, d[0] * step]);
      case 'step': step = STEPS[(STEPS.indexOf(step) + 1) % STEPS.length]; quickKey = ''; renderQuick(); return step;
      case 'more': { // 펼친 줄이 도면 아래쪽을 가리지 않게, 맞춘 화면이면 막대 위로 다시 맞춤
        const auto = autoFitted();
        barOpen = !barOpen; quickKey = ''; renderQuick(); refitSoon(auto);
        return barOpen;
      }
      case 'rot': return rotateInView();
      case 'cut': return cutPart();
      case 'bend': return bendPart();
      case 'round': return roundPart();
      case 'dup': return dupPart();
      case 'array': return arrayPart();
      case 'del': return deletePart();
      case 'edit': return openPartFields();
      case 'explode': return act('ds-explode');
      case 'add': { const made = addShape(btn.dataset.k); if (foldedPhone() && addOpen) { addOpen = null; quickKey = ''; renderQuick(); } return made; }
      case 'add-open': addOpen = true; quickKey = ''; renderQuick(); return true;
      case 'add-close': addOpen = false; quickKey = ''; renderQuick(); return true;
      default: return null;
    }
  }
  /* ── 부재 고치기: 자르기 · 꺾기 · 둥글게 (그림·3D 공통, 고른 부재 하나) ── */
  const AXN = ['폭 (X)', '깊이 (Y)', '높이 (Z)'];
  const DIRN = { '0+': '오른쪽으로', '0-': '왼쪽으로', '1+': '뒤로', '1-': '앞으로', '2+': '위로', '2-': '아래로' };
  const sizesOf = (q) => [q.w, q.d, q.h];
  const longAx = (q) => { const z = sizesOf(q); return z.indexOf(Math.max(...z)); };
  /** 두 축을 맞바꾸면 둥근 면의 축도 따라 바뀜 */
  const swapAx = (q, i, j) => (q.s !== 'rnd' ? {} : { ax: 'xyz'[q.ax === 'xyz'[i] ? j : q.ax === 'xyz'[j] ? i : 'xyz'.indexOf(q.ax)] });
  const segHtml = (id, opts, now) => `<div class="seg seg-inline ds-seg" role="radiogroup" id="${id}">${opts.map(([v, t, dis]) => `<button type="button" class="seg-btn" role="radio" data-v="${esc(v)}" aria-checked="${v === now}" ${dis ? 'disabled' : ''}>${esc(t)}</button>`).join('')}</div>`;
  const segOn = (body, id, cb) => { const box = body.querySelector(`#${id}`); if (!box) return; box.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b || b.disabled) return; box.querySelectorAll('[data-v]').forEach((x) => x.setAttribute('aria-checked', String(x === b))); if (cb) cb(b.dataset.v); }); };
  const segVal = (body, id) => { const b = body.querySelector(`#${id} [aria-checked="true"]`); return b ? b.dataset.v : null; };
  const numField = (id, label, v, unit = 'mm') => `<div class="field"><label class="field-label" for="${id}">${label}</label><div class="field-box"><input id="${id}" type="text" inputmode="decimal" value="${esc(String(v))}" autocomplete="off"><span class="field-unit">${unit}</span></div></div>`;
  /** 부재 하나를 여러 개로 바꿈 (첫 조각은 원래 id를 이어받아 고른 채로) */
  function replacePart(el, q, pieces, label) {
    const made = pieces.map((p, i) => ({ ...JSON.parse(JSON.stringify(q)), ...p, id: i === 0 ? q.id : uid() }));
    made.forEach((p) => { if (p.s !== 'rnd') { delete p.ax; delete p.r; delete p.full; } else if (!p.full) delete p.full; });
    const list = [];
    userParts(el).forEach((x) => { if (x.id === q.id) list.push(...made); else list.push(x); });
    patch(el, label, { parts: list }, true);
    sel = made[0].id; formKey = '';
    refreshPanes();
    return made;
  }
  /** 자르기: 한 축(막대는 길이)을 따라 여러 조각으로 (같은 크기로, 또는 첫 조각 길이를 정해 둘로). 틈(톱날)을 둘 수 있음 */
  async function cutPart() {
    const el = cur(), q = curPart();
    if (!el || !q) { App.ui.toast('자를 부재를 먼저 고르세요 (직접 넣은 부재).'); return null; }
    if (q.s === 'rnd' || q.s === 'poly' || q.s === 'arc') { App.ui.toast('둥근·곡선 부재는 자를 수 없습니다. ‘둥글게 → 네모로 되돌리기’ 한 뒤 자르세요.'); return null; }
    const bar = q.s === 'bar', len0 = bar ? D().lenOf(q) : null;
    let ax = bar ? 'L' : String(longAx(q));
    const lenOfAx = (a) => (a === 'L' ? len0 : sizesOf(q)[+a]);
    const r = await App.ui.dialog({
      title: `자르기 — ${q.n || '부재'}`,
      html: `${bar ? '<p class="props-meta">막대를 길이 방향으로 자릅니다.</p>' : `<div class="field"><span class="field-label">자를 길이 방향</span>${segHtml('dsCutAx', [0, 1, 2].map((k) => [String(k), `${AXN[k]} ${fmt(sizesOf(q)[k])}`]), ax)}</div>`}
        <div class="field-grid">${numField('dsCutN', '몇 개로', 2, '개')}${numField('dsCutA', '첫 조각 길이', r1(lenOfAx(ax) / 2))}${numField('dsCutG', '틈 (톱날)', 0)}</div>
        <p class="props-meta">개수만 바꾸면 같은 크기로 나눕니다. 둘로 자를 때는 첫 조각(왼쪽·앞·아래 쪽) 길이를 정할 수 있습니다. 1200-36 같은 셈도 됩니다.</p>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '자르기', primary: true }],
      onOpen(body) {
        const n = body.querySelector('#dsCutN'), a = body.querySelector('#dsCutA');
        const sync = () => { const k = Math.round(calc(n.value)); a.disabled = k !== 2; if (k !== 2) a.value = r1(lenOfAx(ax) / Math.max(2, k || 2)); };
        segOn(body, 'dsCutAx', (v) => { ax = v; a.value = r1(lenOfAx(ax) / 2); sync(); });
        n.addEventListener('input', sync);
      },
    });
    if (r.id !== 'ok') return null;
    const N = Math.round(calc(r.body.querySelector('#dsCutN').value)), gap = Math.max(0, calc(r.body.querySelector('#dsCutG').value) || 0), total = lenOfAx(ax);
    if (!(N >= 2 && N <= 30)) { App.ui.toast('2~30개로 자를 수 있습니다.'); return null; }
    let lens;
    if (N === 2 && !r.body.querySelector('#dsCutA').disabled) { const a = calc(r.body.querySelector('#dsCutA').value); lens = [a, total - a - gap]; }
    else { const one = (total - gap * (N - 1)) / N; lens = Array.from({ length: N }, () => one); }
    if (lens.some((v) => !(v >= 1))) { App.ui.toast('조각 길이가 너무 짧습니다. 길이·틈을 확인하세요.'); return null; }
    let at = 0;
    const pieces = lens.map((L) => {
      const from = at; at += L + gap;
      if (bar) { const u = q.b.map((v, i) => (v - q.a[i]) / len0); return { a: q.a.map((v, i) => r1(v + u[i] * from)), b: q.a.map((v, i) => r1(v + u[i] * (from + L))) }; }
      const k = +ax; return { [POS[k]]: r1(q[POS[k]] + from), [SIZE[k]]: r1(L) };
    });
    return replacePart(el, q, pieces, `${N}조각으로 자르기`);
  }
  /** 꺾기: 정한 자리에서 끝 쪽을 꺾어 두 부재로 (판·각재는 90°로 세우거나 옆으로, 막대·LED는 아무 각도) */
  async function bendPart() {
    const el = cur(), q = curPart();
    if (!el || !q) { App.ui.toast('꺾을 부재를 먼저 고르세요 (직접 넣은 부재).'); return null; }
    if (q.s === 'rnd' || q.s === 'poly' || q.s === 'arc') { App.ui.toast('둥근·곡선 부재는 꺾을 수 없습니다.'); return null; }
    const bar = q.s === 'bar', L = bar ? null : longAx(q), len = bar ? D().lenOf(q) : sizesOf(q)[L];
    const u = bar ? q.b.map((v, i) => (v - q.a[i]) / len) : null;
    const dirs = Object.keys(DIRN).filter((key) => { const k = +key[0]; if (!bar) return k !== L; return Math.abs(u[k]) < 0.95; }); // 막대와 나란한 쪽은 뺌
    let dir = dirs.includes('2+') ? '2+' : dirs[0];
    const r = await App.ui.dialog({
      title: `꺾기 — ${q.n || '부재'}`,
      html: `<div class="field-grid">${numField('dsBendAt', `꺾는 자리 (시작에서, 길이 ${fmt(len)})`, r1(len / 2))}${bar ? numField('dsBendDeg', '꺾는 각도', 90, '°') : ''}</div>
        <div class="field"><span class="field-label">끝 쪽을 어느 쪽으로</span>${segHtml('dsBendDir', dirs.map((k) => [k, DIRN[k]]), dir)}</div>
        <p class="props-meta">${bar ? '막대·LED 라인은 정한 각도로 꺾여 두 토막이 이어집니다.' : '판·각재는 90°로 꺾여 ㄱ자가 됩니다 (꺾인 쪽이 앞 판 끝에 붙어 섬). 위로 꺾으면 세운 판, 뒤·앞으로 꺾으면 ㄱ자 상판처럼 됩니다.'}</p>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '꺾기', primary: true }],
      onOpen(body) { segOn(body, 'dsBendDir', (v) => { dir = v; }); },
    });
    if (r.id !== 'ok') return null;
    const sAt = calc(r.body.querySelector('#dsBendAt').value), k = +dir[0], sg = dir[1] === '+' ? 1 : -1;
    if (!(sAt >= 1 && sAt <= len - 1)) { App.ui.toast('꺾는 자리는 부재 길이 안이어야 합니다.'); return null; }
    if (bar) {
      const deg = calc(r.body.querySelector('#dsBendDeg').value), th = ((Number.isFinite(deg) ? Math.max(1, Math.min(179, deg)) : 90) * Math.PI) / 180;
      const e = [0, 0, 0]; e[k] = sg;
      const dot = e[0] * u[0] + e[1] * u[1] + e[2] * u[2], v = e.map((x, i) => x - dot * u[i]), vl = Math.hypot(...v) || 1;
      const d2 = u.map((x, i) => Math.cos(th) * x + (Math.sin(th) * v[i]) / vl), P = q.a.map((x, i) => x + u[i] * sAt), rest = len - sAt;
      return replacePart(el, q, [{ b: P.map(r1) }, { a: P.map(r1), b: P.map((x, i) => r1(x + d2[i] * rest)) }], '꺾기');
    }
    const lo = [q.x, q.y, q.z], sz = sizesOf(q), rest = len - sAt, T = 3 - L - k, p2 = {};
    p2[POS[L]] = r1(lo[L] + sAt - sz[k]); p2[SIZE[L]] = sz[k];                 // 꺾인 쪽의 두께 = 원래 그 쪽 크기
    p2[POS[k]] = r1(sg > 0 ? lo[k] + sz[k] : lo[k] - rest); p2[SIZE[k]] = r1(rest); // 꺾인 쪽 길이
    p2[POS[T]] = lo[T]; p2[SIZE[T]] = sz[T];
    return replacePart(el, q, [{ [SIZE[L]]: r1(sAt) }, p2], '꺾기');
  }
  /** 둥글게: 원·타원으로, 모서리만 둥글게(반지름), 네모로 되돌리기. 둥근 면은 판이면 넓은 면, 기둥이면 단면 */
  async function roundPart() {
    const el = cur(), q = curPart();
    if (!el || !q) { App.ui.toast('둥글게 할 부재를 먼저 고르세요 (직접 넣은 부재).'); return null; }
    if (q.s === 'bar' || q.s === 'poly' || q.s === 'arc') { App.ui.toast(q.s === 'bar' ? '비스듬한 막대·LED는 둥글게 할 수 없습니다. 둥근 파이프는 자재에서 고르세요.' : '곡선 부재는 둥글게 바꿀 수 없습니다.'); return null; }
    const z = sizesOf(q), sorted = z.slice().sort((a, b) => a - b);
    const auto = sorted[0] < sorted[1] * 0.35 ? 'xyz'[z.indexOf(sorted[0])] : sorted[2] > sorted[1] * 2.5 ? 'xyz'[z.indexOf(sorted[2])] : 'z';
    let ax = q.s === 'rnd' ? q.ax : auto, how = q.s === 'rnd' ? (q.full ? 'full' : 'r') : 'full';
    const inPlane = (a) => { const [ku, kv] = D().RND_AX[a]; return Math.min(z[ku], z[kv]); };
    const r = await App.ui.dialog({
      title: `둥글게 — ${q.n || '부재'}`,
      html: `<div class="field"><span class="field-label">모양</span>${segHtml('dsRndHow', [['full', '원·타원'], ['r', '모서리만 둥글게'], ...(q.s === 'rnd' ? [['box', '네모로 되돌리기']] : [])], how)}</div>
        ${numField('dsRndR', '모서리 반지름', q.s === 'rnd' && !q.full ? q.r : r1(Math.min(50, inPlane(ax) / 2)))}
        <div class="field"><span class="field-label">둥근 면</span>${segHtml('dsRndAx', [['z', '위에서 보면 둥근'], ['y', '앞에서 보면 둥근'], ['x', '옆에서 보면 둥근']], ax)}</div>
        <p class="props-meta">상판·판은 넓은 면이, 기둥·각재는 단면이 둥글게 됩니다 (지금 크기를 둘러싼 네모 안에서). 부재표에는 둘러싼 네모 크기와 ‘둥글게 자름’이 나옵니다.</p>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '바꾸기', primary: true }],
      onOpen(body) {
        const rr = body.querySelector('#dsRndR');
        const sync = () => { rr.disabled = how !== 'r'; };
        segOn(body, 'dsRndHow', (v) => { how = v; sync(); });
        segOn(body, 'dsRndAx', (v) => { ax = v; });
        sync();
      },
    });
    if (r.id !== 'ok') return null;
    if (how === 'box') { const c = { ...q, s: 'box' }; delete c.ax; delete c.r; delete c.full; return replacePart(el, q, [c], '네모로 되돌리기'); }
    const rad = how === 'r' ? Math.max(1, Math.min(inPlane(ax) / 2, calc(r.body.querySelector('#dsRndR').value) || 0)) : 0;
    return replacePart(el, q, [{ s: 'rnd', ax, ...(how === 'full' ? { full: true, r: 0 } : { full: false, r: r1(rad) }) }], how === 'full' ? '원·타원으로' : '모서리 둥글게');
  }

  /* ── 서랍(속성·집계)을 여닫을 때, 창 크기가 바뀔 때: 휴대폰은 설계물 줄·빠른 막대를 접고 보이는 칸에 다시 맞춤 ── */
  let sheetTimer = 0;
  function refitSoon(auto = autoFitted()) {
    clearTimeout(sheetTimer);
    sheetTimer = setTimeout(() => {
      if (!isMode() || !cur()) return;
      if (App.design3d && App.design3d.active()) { App.design3d.refit(); return; }
      if (auto) fit(); else keepInView();
    }, 140);
  }
  function syncSheet() {
    const stage = document.getElementById('stage'), sh = App.ui.sheet;
    if (!stage || !sh) return;
    const open = !!(App.ui.mobile && App.ui.mobile.matches) && sh.isOpen(), was = stage.classList.contains('ds-sheet-open'), auto = autoFitted();
    if (was !== open) { stage.classList.toggle('ds-sheet-open', open); previewSync(); quickKey = ''; renderQuick(); }
    refitSoon(auto || was !== open);
  }
  /** 설계물이 하나도 없으면 가운데 안내 카드 */
  function syncEmpty() {
    const box = document.getElementById('dsEmpty');
    if (box) box.hidden = !(isMode() && !cur());
  }
  /** 쓰는 법 (표시 → 쓰는 법) */
  function helpDialog() {
    return App.ui.dialog({
      title: '설계 모드 쓰는 법',
      html: `<div class="ds-help">
        <h3>1. 그림 고르기</h3>
        <ul><li>위쪽 <b>정면 · 평면 · 측면</b>으로 보는 방향을 바꿉니다. <b>입체</b>는 돌려 보며 고치는 3D 화면, <b>전체</b>는 네 그림 한 장(PDF와 같음).</li>
          <li>휠·두 손가락으로 확대하고 빈 곳을 끌면 화면이 움직입니다. 부재를 고치는 동안 화면은 저절로 움직이지 않습니다 (전체를 보려면 <b>화면 맞춤</b>).</li>
          ${!(App.ui.mobile && App.ui.mobile.matches) ? '' : foldedPhone()
    ? '<li><b>휴대폰</b>: 막대를 접어 두었습니다 — 위쪽 단추(<b>정면 ▾</b>)로 보는 그림을 바꾸고, <b>왼쪽 위 ☰</b>를 열면 모드·파일·설정과 <b>설계물 이름</b> 단추(설계물 바꾸기·＋ 새 설계·치수/숨은선/미리보기·3D 보기)가 나옵니다. 아래에는 <b>도구</b>·<b>＋ 넣기</b>·화면 맞춤·<b>속성·집계</b> 단추가 있고, 부재나 빈 칸을 고르면 그 자리가 고른 것의 단추로 바뀝니다.</li>'
    : '<li><b>휴대폰</b>: 위쪽의 <b>설계물 이름</b> 단추에 설계물 바꾸기·＋ 새 설계·치수/숨은선/미리보기·3D 보기가 있고, 속성·집계는 아래 도구 줄 오른쪽 끝의 <b>속성·집계</b>로 엽니다.</li>'}</ul>
        <h3>2. 부재 넣기</h3>
        <ul><li>빈 자유 설계는 <b>＋ 통 만들기</b>로 시작하면 쉽습니다 — 폭·높이·깊이만 넣으면 옆판·천판·지판·뒤판이 한 번에 생깁니다.</li>
          <li>아래 <b>+가로판 · +세로판 · +정면판 · +막대 · +LED</b>(휴대폰은 <b>＋ 넣기</b>를 누르면 펼쳐짐)를 누르면 바로 생깁니다. 가로판은 양옆 판 사이에 맞는 크기로 가장 넓은 칸 가운데에, 세로판은 위아래 판 사이에 맞춰 들어갑니다 (확대해 보고 있으면 보는 칸에).</li>
          <li><b>빈 칸을 누르면</b> 그 칸이 표시되고, 아래의 <b>선반 · 칸막이 · 서랍 · 문짝 · 봉</b>으로 한 번에 채웁니다 (선반 3장을 같은 간격으로, 서랍 3단 …).</li>
          <li>왼쪽(아래) 도구 <b>판 · 막대 · LED</b>로 끌어서 그려도 됩니다.</li></ul>
        <h3>3. 고치기</h3>
        <ul><li>부재를 눌러 고르고 <b>끌면 옮겨집니다</b> (다른 판의 면에 붙으면 분홍 선이 보임).</li>
          <li><span class="ds-dot"></span> <b>주황 점</b>을 끌면 크기가 바뀝니다. <b>주황 치수 숫자</b>를 누르면 숫자로 고칩니다 (1200-36 같은 셈도 됨).</li>
          <li>아래 막대: <b>90°</b> 세우기·눕히기, <b>복제</b>, <b>삭제</b>, <b>더보기</b>(조금씩 옮기기 · 여러 개 · 자르기 · 꺾기 · 둥글게).</li>
          <li>같은 자리를 다시 누르면 <b>뒤에 있는 부재</b>가 골라집니다.</li>
          <li><span class="ds-dot is-teal"></span> 수납장·테이블처럼 값으로 만든 설계는 청록 점을 끌거나 전체 치수 숫자를 눌러 크기를 바꾸고, 하나씩 고치려면 부재를 눌러 <b>부재로 풀어 고치기</b>.</li></ul>
        <h3>4. 입체(3D)에서</h3>
        <ul><li>빈 곳을 끌면 돌아가고, 방향 단추(앞·오른쪽·뒤·왼쪽·위)로 보는 쪽을 정합니다.</li>
          <li>고른 부재를 끌면 바닥을 따라(옆에서 보면 좌우·위아래로) 옮겨지고, 위쪽 <b>↕</b> 점은 높이, 주황 점은 그 면을 늘이고 줄입니다. 점을 그냥 누르면 숫자로 넣습니다.</li></ul>
        <h3>5. 뽑기</h3>
        <ul><li><b>집계</b>에 부재표(재단 치수·원장 수·재료비), <b>설계도면</b>(PDF)·DXF·CSV. <b>사물로 등록</b>하면 인테리어·조감도 도면에 놓을 수 있습니다.</li></ul>
      </div>`,
      actions: [{ id: 'close', label: '닫기', primary: true }],
    });
  }

  /** 보는 그림 바꾸기 (정면·평면·측면·입체·전체) */
  function setView(v, doFit = true) {
    if (!DD().VIEWS.includes(v)) return;
    App.current.designView = v;
    App.ui.emit('current');
    syncBar();
    quickKey = '';
    renderQuick();
    sync3d();
    previewSync();
    if (doFit && isMode()) fit();
    render();
  }
  /** 입체 그림이면 3D 작업 화면을 띄움 (위쪽 줄 높이가 정해진 뒤) */
  function sync3d() {
    if (!App.design3d) return;
    App.design3d.sync();
    const stage = document.getElementById('stage');
    if (stage) stage.classList.toggle('is-3d', App.design3d.active());
  }

  /* ── 전체 미리보기: 작업하는 동안 오른쪽 위에 전체 모습을 3D로 (고치는 대로 바로 바뀜, 고른 부재는 주황, 끌어서 돌리기, 누르면 3D 창) ── */
  const pv = { orbit: null, cv2: null, raf: 0, last: 0, el: null, B: null, sel: undefined, doors: null, id: null, big: false, ver: 0, down: null, failed: false };
  const pvOn = () => App.current.designPreview !== false;
  const pvBox = () => document.getElementById('dsPreview');
  /** 보일지·자리·크기를 맞춤 (모드·설계물·설정이 바뀔 때) */
  function previewSync(refit = false) {
    const box = pvBox();
    if (!box) return;
    const el = isMode() ? cur() : null, show = !!el && pvOn() && viewNow() !== 'iso'; // 입체(3D 작업 화면)에서는 미리보기가 필요 없음
    const was = !box.hidden, mobile = !!(App.ui.mobile && App.ui.mobile.matches), stage0 = document.getElementById('stage');
    if (mobile) pv.big = false; // 휴대폰은 작은 타일만 (크게 보려면 눌러서 입체 화면으로)
    box.hidden = !show;
    box.classList.toggle('is-big', pv.big);
    if (stage0) stage0.classList.toggle('has-pv', show && mobile);
    const btn = document.getElementById('btnDsPreview');
    if (btn) btn.setAttribute('aria-pressed', String(pvOn()));
    if (!show) {
      if (!isMode() && pv.orbit) { // 다른 모드에서는 3D 자원을 놓아 줌 (다시 올 때는 새 캔버스로: 놓은 캔버스는 3D를 다시 못 씀)
        pv.orbit.dispose(); pv.orbit = null; pv.el = null; pv.B = null; pv.id = null;
        const old = box.querySelector('canvas'), fresh = old.cloneNode(false);
        old.replaceWith(fresh);
      }
      if (was && isMode()) fit();
      return;
    }
    // 자리: 위쪽 버튼 줄(보는 그림·설계물 막대)과 겹치지 않게. PC에서 버튼 줄이 오른쪽까지 오지 않으면 맨 위에.
    // 휴대폰: 설계물 줄(둘째 줄) 옆에 — 줄은 타일 앞에서 끝남 (style.css .has-pv)
    const st = document.getElementById('stageTop'), stage = document.getElementById('stage');
    if (st && stage) {
      const sr = stage.getBoundingClientRect(), tr = st.getBoundingClientRect(), bw = box.offsetWidth || 120;
      const chips = document.getElementById('designBar'), cr = chips && chips.offsetParent ? chips.getBoundingClientRect() : null;
      const clear = tr.right < sr.right - bw - 24;
      box.style.top = `${Math.round(mobile ? (cr ? cr.top - sr.top : tr.bottom - sr.top + 6) : clear ? 12 : tr.bottom - sr.top + 8)}px`;
    }
    if (!pv.orbit && !pv.failed) {
      const cv = box.querySelector('canvas');
      pv.orbit = new App.libraryUI.Orbit(cv);
      if (!pv.orbit.ok) { pv.orbit = null; pv.failed = true; }
    }
    pv.el = null; // 다음 번에 새로 그림
    if (!was || refit) setTimeout(() => { if (isMode()) fit(); }, 0);
    previewKick();
  }
  function previewKick() {
    const box = pvBox();
    if (!box || box.hidden || pv.raf) return;
    pv.raf = requestAnimationFrame(previewStep);
  }
  function previewStep(now) {
    pv.raf = 0;
    const box = pvBox(), el = isMode() ? cur() : null;
    if (!box || box.hidden || !el) return;
    if (!document.getElementById('dialog').hidden) return; // 창(3D 보기 따위)이 덮는 동안은 쉼
    const doors = App.current.designDoors !== false, B = el.kind === 'model' ? el.objId : D().build(el); // 부재가 바뀌면 build가 새 결과를 돌려줌 (설계물은 그 자리에서 고쳐질 수 있어 결과로 비교)
    if (pv.el === el && pv.B === B && pv.sel === sel && pv.doors === doors) return;
    if (now - pv.last < 90) { pv.raf = requestAnimationFrame(previewStep); return; } // 끄는 동안은 1초에 10번쯤
    pv.last = now;
    pv.el = el; pv.B = B; pv.sel = sel; pv.doors = doors; pv.ver++;
    box.dataset.ver = String(pv.ver);
    if (el.kind === 'model') return previewModel(el);
    const m = D().toModel(el, { pick: sel, hideDoors: !doors }), wasEmpty = box.classList.contains('is-empty');
    box.classList.toggle('is-empty', !m);
    if (wasEmpty !== !m && App.ui.mobile && App.ui.mobile.matches) refitSoon(); // 휴대폰: 타일이 나타나거나 사라지면(첫 부재를 넣음·다 지움) 도면 자리를 다시 맞춤
    if (!m) return;
    if (pv.orbit) {
      const scene = App.library.sceneOf(m), same = pv.id === el.id;
      if (!same && typeof D().build(el).cam === 'number') pv.orbit.cam.yaw = D().build(el).cam;
      pv.orbit.set(scene, same);
      if (same) { // 같은 설계: 보는 방향·거리는 그대로 두고 가운데만 따라감 (크기가 크게 바뀌면 다시 맞춤)
        const b = scene.bounds, c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
        const r = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2 || 0.5, cam = pv.orbit.cam;
        cam.target = c;
        if (r > cam.r * 1.25 || r < cam.r * 0.7) cam.dist = Math.max((r / Math.sin(0.25)) * 1.08, pv.orbit.fitDist(b, c) * 1.06);
        cam.r = r;
        pv.orbit.draw();
      }
      pv.id = el.id;
    } else previewFlat(el);
  }
  /** 내려받은 3D 모델 */
  async function previewModel(el) {
    const m = el.objId ? App.library.byId(el.objId) : null;
    if (!m || !pv.orbit) return;
    await App.library.ready(m.id);
    const e = App.library.data(m.id), model = e ? e.view || e.mesh : null;
    if (model && pv.orbit && pv.el === el) { pv.orbit.set(App.library.sceneOf(model), pv.id === el.id); pv.id = el.id; }
  }
  /** 3D를 못 쓰는 기기: 입체도(2D)를 작게 */
  function previewFlat(el) {
    const box = pvBox();
    let cv = pv.cv2;
    if (!cv) { cv = pv.cv2 = document.createElement('canvas'); cv.className = 'ds-prev-cv'; box.querySelector('canvas').replaceWith(cv); }
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth || 120, h = cv.clientHeight || 120;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d'), L = DD().layout(el), V = L.views.iso, k = Math.min((w - 16) / V.w, (h - 16) / V.h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    ctx.translate((w - V.w * k) / 2, (h - V.h * k) / 2); ctx.scale(k, k); ctx.translate(-V.x, -V.y);
    DD().drawSheet(ctx, el, { px: 1 / k, view: 'iso', dims: false, sel, doors: App.current.designDoors !== false, caption: false });
  }
  function previewToggle(on = !pvOn()) {
    App.current.designPreview = on;
    App.ui.emit('current');
    previewSync(true);
  }

  /* ── 눌린 버튼·바뀐 칸 처리 (속성·집계 칸, 위쪽 막대) ── */
  async function act(name, btn = null) {
    const el = cur();
    switch (name) {
      case 'ds-li-add': case 'ds-li-del': case 'ds-li-up': case 'ds-li-down': { // 칸·모듈 목록
        const box = btn && btn.closest('[data-list]');
        if (!el || !box) return null;
        const k = box.dataset.list, f = fieldsOf(el).find((x) => x.k === k), row = btn.closest('[data-i]'), i = row ? +row.dataset.i : -1;
        const list = (Array.isArray(el.p[k]) ? el.p[k] : []).map((x) => ({ ...x }));
        if (name === 'ds-li-add') { if (list.length >= 24) { App.ui.toast('더 넣을 수 없습니다 (24개까지).'); return null; } list.push({ ...(f ? f.add : { t: 'door', w: 600 }) }); }
        else if (name === 'ds-li-del') list.splice(i, 1);
        else { const j = name === 'ds-li-up' ? i - 1 : i + 1; if (j < 0 || j >= list.length) return null; [list[i], list[j]] = [list[j], list[i]]; }
        patch(el, name === 'ds-li-add' ? '모듈 넣기' : name === 'ds-li-del' ? '모듈 지우기' : '모듈 차례 바꾸기', { p: { ...el.p, [k]: list } });
        formKey = ''; refreshPanes();
        return null;
      }
      case 'ds-new': return newDialog();
      case 'ds-3d': return open3d(el);
      case 'ds-pdf': return el ? App.designOut.exportPdf() : null;
      case 'ds-csv': return el ? App.designOut.exportCsv(el) : null;
      case 'ds-dxf': return el ? App.designOut.exportDxf(el) : null;
      case 'ds-glb': return el ? App.designOut.exportGlb(el) : null;
      case 'ds-object': return toObject(el);
      case 'ds-estimate': return el ? toEstimate(el) : null;
      case 'ds-copy': return el ? duplicate(el) : null;
      case 'ds-explode': {
        if (!el) return null;
        const r = await App.ui.dialog({ title: '부재로 풀기', html: `<p>‘${esc(el.name)}’의 부재를 하나씩 옮기고 고칠 수 있게 풉니다. 풀고 나면 폭·높이·선반 수 같은 값으로는 더 바꿀 수 없습니다.${el.kind === 'led' ? ' 전광판 캐비닛과 전력·무게 계산은 빠지고 틀만 남습니다.' : ''}</p><p class="props-meta">실행 취소(Ctrl+Z)로 되돌릴 수 있습니다.</p>`, actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '풀기', primary: true }] });
        if (r.id === 'ok') explode(el);
        return null;
      }
      case 'ds-del': {
        if (!el) return null;
        const r = await App.ui.dialog({ title: '설계 지우기', html: `<p>‘${esc(el.name)}’ 설계를 지울까요?</p><p class="props-meta">이미 ‘사물로 등록’한 것은 내 사물에 그대로 남습니다.</p>`, actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '지우기', danger: true }] });
        if (r.id === 'ok') remove(el);
        return null;
      }
      case 'ds-part-del': return deletePart();
      case 'ds-part-cut': return cutPart();
      case 'ds-part-bend': return bendPart();
      case 'ds-part-round': return roundPart();
      case 'ds-part-rot': { // 가운데를 지키며 두 치수를 맞바꿈
        const q = el && userParts(el).find((x) => x.id === sel);
        if (!q || q.s === 'bar' || q.s === 'poly' || q.s === 'arc') return null;
        const ax = btn && btn.dataset.ax, [a, b] = ax === 'z' ? ['w', 'd'] : ax === 'x' ? ['d', 'h'] : ['w', 'h'], pos = { w: 'x', d: 'y', h: 'z' };
        const r = (v) => Math.round(v * 10) / 10;
        setPart(el, sel, { [a]: q[b], [b]: q[a], [pos[a]]: r(q[pos[a]] + (q[a] - q[b]) / 2), [pos[b]]: r(q[pos[b]] + (q[b] - q[a]) / 2), ...swapAx(q, SIZE.indexOf(a), SIZE.indexOf(b)) }, '부재 돌리기');
        formKey = ''; refreshPanes();
        return null;
      }
      case 'ds-part-copy': {
        const q = el && userParts(el).find((x) => x.id === sel);
        if (!q) return null;
        const c = JSON.parse(JSON.stringify(q));
        delete c.id;
        if (c.s === 'bar') { c.a[0] += 100; c.b[0] += 100; } else c.x += 100;
        return addPart(el, c, '부재 복제');
      }
      default: return null;
    }
  }
  function onChange(e) {
    const t = e.target, el = cur();
    if (t.dataset.draw) { App.current[t.dataset.draw] = t.value; App.ui.emit('current'); return; }
    if (!el) return;
    if (t.dataset.dprice != null) { // 재료비 단가 (이 기기에 기억)
      D().setPrice(t.dataset.dprice, numIn(t.value) || 0);
      costOpen = true;
      refreshPanes();
      return;
    }
    if (t.dataset.li) { // 칸·모듈 목록의 값
      const box = t.closest('[data-list]'), row = t.closest('[data-i]');
      if (!box || !row) return;
      const k = box.dataset.list, i = +row.dataset.i, f = fieldsOf(el).find((x) => x.k === k);
      const list = (Array.isArray(el.p[k]) ? el.p[k] : []).map((x) => ({ ...x }));
      if (!list[i]) return;
      if (t.tagName === 'INPUT') { // 숫자 칸 (폭·높이·바닥에서)
        const k2 = t.dataset.li, v = numIn(t.value), min = k2 === 'w' ? 20 : 0;
        if (Number.isNaN(v) || v < min) { t.value = list[i][k2] == null ? '' : list[i][k2]; return; }
        list[i][k2] = Math.round(v);
      } else {
        // 종류를 바꾸면: 폭이 예전 종류의 기본 폭 그대로였으면 새 종류의 기본 폭으로
        if (t.dataset.li === 't' && f && f.defw && list[i].w === f.defw[list[i].t] && f.defw[t.value]) list[i].w = f.defw[t.value];
        // 종류마다 기본값이 있는 칸(높이·바닥에서): 예전 종류의 기본값 그대로였으면 새 종류의 기본값으로
        if (t.dataset.li === 't' && f && f.defs && f.defs[t.value]) Object.entries(f.defs[t.value]).forEach(([k3, v3]) => { const old = (f.defs[list[i].t] || {})[k3]; if (list[i][k3] == null || list[i][k3] === old) list[i][k3] = v3; });
        list[i][t.dataset.li] = t.value;
        formKey = '';
      }
      patch(el, '모듈 바꾸기', { p: { ...el.p, [k]: list } });
      refreshPanes();
      return;
    }
    if (t.id === 'dsName') { const v = t.value.replace(/\s+/g, ' ').trim().slice(0, 30); if (v && v !== el.name) { patch(el, '이름 바꾸기', { name: v }); syncBar(); } else t.value = el.name; return; }
    if (t.id === 'dsPreset') {
      const pr = (D().KINDS[el.kind].presets || [])[+t.value];
      if (t.value !== '' && pr) { patch(el, '규격 바꾸기', { p: { ...D().KINDS[el.kind].defaults, ...pr[1] } }); formKey = ''; refreshPanes(); App.plan.fitToContent(); }
      return;
    }
    if (t.dataset.p) {
      const k = t.dataset.p;
      let v;
      if (t.type === 'checkbox') v = t.checked;
      else if (t.tagName === 'SELECT') v = t.dataset.num ? Number(t.value) : t.value;
      else {
        v = numIn(t.value);
        if (Number.isNaN(v)) { if (t.dataset.optional && !t.value.trim()) v = null; else { t.value = el.p[k] == null ? '' : el.p[k]; return; } }
        else if (t.dataset.int) v = Math.round(v);
        if (v != null && v < 0) v = 0;
      }
      if (v === el.p[k]) return;
      if (['ledType', 'ledK', 'ledProf'].includes(k) && userParts(el).some((q) => q.role === 'lite' || q.m === 'ledline')) { // 직접 그린 LED 라인도 같은 종류로
        const L = App.ledstrip, nk = { ledType: 'lt', ledK: 'k', ledProf: 'pf' }[k];
        patch(el, 'LED 바꾸기', { p: { ...el.p, [k]: v }, parts: userParts(el).map((q) => (q.role === 'lite' || q.m === 'ledline' ? { ...q, [nk]: v, ...(k === 'ledK' ? { c: L.light(v) } : {}) } : q)) });
        return;
      }
      setParam(el, k, v);
      if (t.dataset.rebuild) { formKey = ''; refreshPanes(); } // 모양(일자·ㄱ자)처럼 칸 구성이 달라지는 값
      return;
    }
    if (t.dataset.part && sel) {
      const q = userParts(el).find((x) => x.id === sel);
      if (!q) return;
      const k = t.dataset.part;
      if (k === 'n') { setPart(el, sel, { n: t.value.trim().slice(0, 30) || q.n }); return; }
      if (k === 'fin') { // 마감 색
        if (t.value === 'keep') return;
        const f = D().finish(t.value);
        setPart(el, sel, f.color ? { c: f.color, fin: f.name } : { c: undefined, fin: undefined }, '마감 색 바꾸기');
        return;
      }
      if (k === 'mv') { setPart(el, sel, { mv: t.value || undefined, ...(t.value === 'dl' || t.value === 'dr' || !t.value ? { mx: undefined } : {}) }, '움직임 바꾸기'); formKey = ''; refreshPanes(); syncBar(); return; }
      if (k === 'm') {
        const isBar = !!D().BARS.find((b) => b.id === t.value);
        if (q.s === 'poly' || q.s === 'arc') { if (!isBar) setPart(el, sel, q.s === 'arc' ? { m: t.value, t: D().sheet(t.value).t } : { m: t.value, d: D().sheet(t.value).t }); }
        else if (q.s !== 'bar' && isBar !== !!D().BARS.find((b) => b.id === q.m)) {
          // 판 ↔ 막대로 바꾸면 단면을 새 자재에 맞춤
          if (isBar) { const along = q.w >= q.d && q.w >= q.h ? 'x' : q.d >= q.h ? 'y' : 'z'; const r = D().rail(q.n, t.value, along, q.x, q.y, q.z, Math.max(q.w, q.d, q.h)); setPart(el, sel, { m: t.value, w: r.w, d: r.d, h: r.h }); }
          else { const dims = [['w', q.w], ['d', q.d], ['h', q.h]].sort((a, b) => a[1] - b[1]); setPart(el, sel, { m: t.value, [dims[0][0]]: D().sheet(t.value).t }); }
        } else if (q.s !== 'bar' && !isBar) { const dims = [['w', q.w], ['d', q.d], ['h', q.h]].sort((a, b) => a[1] - b[1]); setPart(el, sel, { m: t.value, [dims[0][0]]: D().sheet(t.value).t }); }
        else if (q.s !== 'bar') { const along = q.w >= q.d && q.w >= q.h ? 'x' : q.d >= q.h ? 'y' : 'z'; const r = D().rail(q.n, t.value, along, q.x, q.y, q.z, Math.max(q.w, q.d, q.h)); setPart(el, sel, { m: t.value, w: r.w, d: r.d, h: r.h }); }
        else setPart(el, sel, { m: t.value });
        formKey = ''; refreshPanes();
        return;
      }
      const v = numIn(t.value);
      if (Number.isNaN(v)) { formKey = ''; refreshPanes(); return; }
      if (/^[ab][012]$/.test(k)) { const arr = (k[0] === 'a' ? q.a : q.b).slice(); arr[+k[1]] = v; setPart(el, sel, { [k[0]]: arr }); }
      else setPart(el, sel, { [k]: ['w', 'd', 'h'].includes(k) ? Math.max(1, v) : v });
    }
  }

  function init() {
    const T = App.model && App.model.TYPES;
    if (T && !T.design) T.design = { label: '설계', catalog: true, pick: 0, bounds: () => null }; // 평면 도면에는 그리지 않는 요소
    App.tools.register('dselect', () => new DSelect());
    App.tools.register('dbox', () => new DDraw(false));
    App.tools.register('dbar', () => new DDraw(true));
    App.tools.register('dled', () => new DDraw('led'));
    const bar = document.getElementById('designBar');
    if (bar) bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-design], [data-act]');
      if (!b) return;
      if (b.dataset.design) setCurrent(b.dataset.design); else act(b.dataset.act);
    });
    const toggle = (id, key) => { const b = document.getElementById(id); if (b) b.addEventListener('click', () => { App.current[key] = App.current[key] === false; App.ui.emit('current'); syncBar(); render(); }); };
    toggle('btnDsDims', 'designDims');
    toggle('btnDsHidden', 'designHidden');
    toggle('btnDsDoors', 'designDoors');
    // 보는 그림 (정면·평면·측면·입체·전체)
    const views = document.getElementById('dsViews');
    if (views) views.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dview]'), B = App.ui.bars;
      if (!b) return;
      // 접어 둔 휴대폰 화면: 지금 그림 단추 하나만 보임 — 누르면 다섯 탭이 펼쳐지고, 고르면 다시 접힘
      if (B && B.folded('top') && !B.top && !B.views) { B.set('views', true); return; }
      if (B) B.set('views', false);
      closeShow();
      setView(b.dataset.dview);
    });
    // 휴대폰: 치수·숨은선·문짝을 ‘표시’ 메뉴로 접음
    const showBtn = document.getElementById('btnDsShow'), shows = document.getElementById('dsShows');
    if (showBtn && shows) {
      const setOpen = (on) => { shows.classList.toggle('is-open', on); showBtn.setAttribute('aria-expanded', String(on)); if (on) shows.scrollTop = 0; };
      closeShow = () => setOpen(false);
      showBtn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!shows.classList.contains('is-open')); });
      document.addEventListener('pointerdown', (e) => { if (shows.classList.contains('is-open') && !e.target.closest('.ds-show-wrap')) setOpen(false); });
      // 메뉴 안의 설계물 목록·새 설계·3D 보기: 고르면 메뉴를 닫음 (치수·숨은선 같은 켜고 끄기는 열어 둠)
      const list = document.getElementById('dsMenuList');
      if (list) list.addEventListener('click', (e) => {
        const b = e.target.closest('[data-design], [data-act]');
        if (!b) return;
        setOpen(false);
        closeTopBar();
        if (b.dataset.design) setCurrent(b.dataset.design); else act(b.dataset.act);
      });
      const big = document.getElementById('btnDsBig3d');
      if (big) big.addEventListener('click', () => { setOpen(false); closeTopBar(); open3d(); });
    }
    const pbox = document.getElementById('dsPreview');
    if (pbox) {
      pbox.addEventListener('pointerdown', (e) => { pv.down = { x: e.clientX, y: e.clientY }; });
      pbox.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pv]');
        if (b) { e.stopPropagation(); if (b.dataset.pv === 'close') previewToggle(false); else { pv.big = !pv.big; b.setAttribute('aria-label', pv.big ? '미리보기 작게' : '미리보기 크게'); previewSync(true); if (pv.orbit) { pv.el = null; pv.id = null; previewKick(); } } return; }
        const d = pv.down; pv.down = null;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return; // 돌리려고 끈 것
        if (isMode() && cur()) setView('iso'); // 누르면 입체(3D) 작업 화면으로
      });
    }
    const pbtn = document.getElementById('btnDsPreview');
    if (pbtn) pbtn.addEventListener('click', () => previewToggle());
    window.addEventListener('resize', () => { if (isMode()) { const auto = autoFitted(); previewSync(); quickKey = ''; renderQuick(); refitSoon(auto); } });
    // 맞춤이 어디서 불리든(화면 맞춤 단추·값 바꾸기) 맞춘 화면 값을 기억
    if (App.plan && !App.plan._dsFitHook) {
      const orig = App.plan.fitToContent.bind(App.plan);
      App.plan.fitToContent = (...a) => { const r = orig(...a); if (isMode()) { fitSig = viewSig(); anchor = anchorNow(); } return r; };
      App.plan._dsFitHook = true;
    }
    App.ui.on('sheet', () => { if (isMode()) syncSheet(); });
    const help = document.getElementById('btnDsHelp');
    if (help) help.addEventListener('click', () => { closeShow(); closeTopBar(); helpDialog(); });
    // 접어 둔 휴대폰 화면: 위 막대를 닫으면 설계물 메뉴도 닫고, 접기 ↔ 늘 보이기가 바뀌면 빠른 막대를 다시 그림
    App.ui.on('bars', () => { const B = App.ui.bars; if (B && B.folded('top') && !B.top) closeShow(); if (isMode()) renderQuick(); });
    // 도면을 만지면 펴 둔 ‘넣기’ 줄을 접음 (빈 설계는 그대로 펴 둠)
    ['plan', 'ds3dView'].forEach((id) => { const c = document.getElementById(id); if (c) c.addEventListener('pointerdown', () => { if (isMode() && foldedPhone() && addOpen) { addOpen = null; quickKey = ''; renderQuick(); } }, true); });
    const empty = document.getElementById('dsEmpty');
    if (empty) empty.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act); });
    const quick = document.getElementById('dsQuick');
    if (quick) quick.addEventListener('click', (e) => { const b = e.target.closest('[data-dq]'); if (b && isMode()) quickAct(b.dataset.dq, b); });
    ['pane-props', 'pane-summary'].forEach((id) => {
      const pane = document.getElementById(id);
      pane.addEventListener('click', (e) => { if (!isMode()) return; const b = e.target.closest('[data-act^="ds"]'); if (b) act(b.dataset.act, b); });
      pane.addEventListener('change', (e) => { if (isMode() && (e.target.closest('.ds-props') || e.target.dataset.dprice != null)) onChange(e); });
      pane.addEventListener('keydown', (e) => { if (isMode() && e.key === 'Enter' && e.target.tagName === 'INPUT' && (e.target.closest('.ds-props') || e.target.dataset.dprice != null) && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); e.target.blur(); } });
    });
    App.ui.on('mode', () => {
      closeShow();
      sel = null; formKey = '';
      syncBar();
      renderQuick();
      previewSync();
      sync3d();
      const stg = document.getElementById('stage');
      if (stg) stg.classList.toggle('ds-sheet-open', isMode() && !!(App.ui.mobile && App.ui.mobile.matches) && !!App.ui.sheet && App.ui.sheet.isOpen());
      if (!isMode() && stg) stg.classList.remove('has-pv');
      if (isMode()) { const el = cur(); if (el && App.current.designId !== el.id) App.current.designId = el.id; setTimeout(() => { if (isMode()) fit(); }, 0); }
    });
    App.ui.on('project', () => { sel = null; formKey = ''; syncBar(); renderQuick(); previewSync(); sync3d(); });
    App.ui.on('tool', () => {
      if (isMode()) {
        formKey = ''; refreshPanes();
        // 그리기 도구(판·막대·LED)는 정면·평면·측면에서 끌어 그림: 입체(3D)에서 고르면 정면도로
        if (viewNow() === 'iso' && ['dbox', 'dbar', 'dled'].includes(App.ui.tool)) { setView('front'); App.ui.toast('그리기는 정면·평면·측면에서 끌어서 합니다 — 정면도로 바꿨습니다.'); }
      }
      renderQuick();
    });
    App.ui.on('library', () => { if (isMode()) { refreshPanes(); render(); } });
    App.doc.onChange(() => {
      if (!isMode()) return;
      // 실행 취소로 설계물이 사라졌으면 고른 것을 비움
      const el = cur();
      if (sel && el && !D().build(el).parts.some((q) => q.id === sel)) { sel = null; formKey = ''; }
      holdAnchor(); // 되돌리기·다시 하기로 그림의 기준점이 밀려도 화면에서는 제자리에
      syncBar();
      renderQuick();
      previewKick();
      if (App.design3d) App.design3d.kick();
    });
    if (App.design3d) App.design3d.init();
    // 화면 맞춤 단추: 3D 작업 화면이면 3D를 맞춤
    const fitBtn = document.getElementById('btnFit');
    if (fitBtn) fitBtn.addEventListener('click', () => { if (isMode() && App.design3d && App.design3d.active()) App.design3d.fit(!!sel); });
    syncBar();
    renderQuick();
    previewSync();
    sync3d();
  }

  App.designUI = {
    init, renderProps, renderSummary, newDialog, openModel, open3d, toObject, toEstimate, add, remove, duplicate, explode, setCurrent, deletePart, addPart, setParam, act,
    selected: () => sel,
    // 칸 채우기 · 멀리 떨어진 부재
    cell: () => (cell ? { x: cell.x.slice(), y: cell.y.slice(), z: cell.z.slice(), bound: { ...cell.bound }, front: cell.front } : null),
    cellAt: (x, z) => { const c = cellAt(cur(), x, z); return c ? { x: c.x, y: c.y, z: c.z, bound: c.bound, front: c.front } : null; },
    pickCell: (x, z) => { setCell(x == null ? null : cellAt(cur(), x, z)); return !!cell; },
    makeBox, boxParts, fillCell, strays: () => { const S = strays(); return S ? { count: S.count, list: S.list.map((g) => ({ names: g.names, gap: g.gap })) } : null; }, bringStrays,
    cutPart, bendPart, roundPart, helpDialog, setView, previewToggle,
    /** 고른 부재(직접 넣은 것)의 값을 바꿈 — 3D 작업 화면에서 숫자로 고칠 때 */
    setPart(id, p, label) { const el = cur(); if (!el || !userParts(el).some((q) => q.id === id)) return false; setPart(el, id, p, label); refreshPanes(); return true; },
    autoFitted: () => autoFitted(), preview: () => ({ on: pvOn(), shown: !!pvBox() && !pvBox().hidden, gl: !!pv.orbit, ver: pv.ver, big: pv.big, yaw: pv.orbit ? pv.orbit.cam.yaw : null }),
    /** 시험용: 전체 미리보기를 지금 그려 그림 주소로 */
    previewShot: () => { if (!pv.orbit) return null; pv.orbit.now(); return pvBox().querySelector('canvas').toDataURL('image/png'); }, addShape, nudge, rotateInView, dupPart, arrayPart, renderQuick, editDim, askNumber, calc,
    /** 시험용: 지금 보이는 손잡이들 (고른 부재의 크기·끝, 값으로 만든 설계의 전체 크기) */
    handles: () => { const el = cur(); return el ? (sel ? handlesOf(el) : sizeHandles(el)) : []; },
    step: () => step,
    /** 3D 창의 지금 상태 (시험·예시용): 여는 정도·문 떼기·분해 정도와 보는 방향·거리 */
    state3d: () => (st3d ? { ...st3d, dist: orbit ? orbit.cam.dist : null, yaw: orbit ? orbit.cam.yaw : null } : null),
    select(id) { sel = id; formKey = ''; refreshPanes(); render(); },
  };
})();
