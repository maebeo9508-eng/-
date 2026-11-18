/* 거래처별 자재 발주서 (인테리어): 집계한 물량을 공종(목재·석고 → 문 → 창호 → 도배 → 도장 → 타일 → 바닥 → 전기 → 설비 → 가구)으로 나눠
   공종마다 거래처·납품일을 정하고, 줄마다 주문 수량·제품 메모를 넣어 카톡·문자로 보낼 주문 글을 만들고, 주문 전 → 주문함 → 받음으로 챙김.
   - 현장 정보·공종별 거래처·납품일·줄마다 주문 수량·제품·상태는 이 도면에 저장 (App.current.orders — 고칠 때만 만듦)
   - 거래처 목록(이름·전화)은 이 기기에 저장 (hjdm.vendors) — 다른 도면에서도 고를 수 있게
   - 줄 열쇠는 ‘공종|품명|규격|단위’ 글자라 도면이 바뀌어도 같은 자재면 이어짐 (문·창문 기호 D1·W1은 다시 매겨질 수 있어 열쇠에 넣지 않음)
   - 주문한 뒤 도면을 고쳐 계산 수량이 주문한 양보다 많아지면 ‘추가 필요 +N’ — 누르면 모자란 만큼이 ‘주문 전’ 추가분이 됨
   - 넓이만 있는 줄(바닥·천장·도배 면적)과 철거는 주문할 자재가 아니라 넣지 않음 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KEY_VENDORS = 'hjdm.vendors';
  const ADD = '__add'; // 거래처 고르기의 ‘+ 거래처’
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  /** 공종 (이 순서로 묶음). task: 납품일 처음 값으로 쓸 공정표의 공정 */
  const TRADES = [
    { id: 'wood', name: '목재·석고', task: 'wood' },
    { id: 'door', name: '문', task: 'wood' },
    { id: 'win', name: '창호', task: 'win' },
    { id: 'paper', name: '도배', task: 'paper' },
    { id: 'paint', name: '도장', task: 'paint' },
    { id: 'tile', name: '타일', task: 'tile' },
    { id: 'floor', name: '바닥', task: 'floor' },
    { id: 'elec', name: '전기', task: 'elec' },
    { id: 'mech', name: '설비', task: 'mech' },
    { id: 'furn', name: '가구', task: 'furn' },
  ];
  const TILE = ['walltile', 'tile', 'tileL', 'tileS', 'marble'];
  const FLOOR = ['plank', 'wide', 'chevron', 'vinyl', 'deco', 'carpet', 'concrete', 'epoxy'];
  const STATE_NAME = { todo: '주문 전', ordered: '주문함', received: '받음' };
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;
  const fmt = (v) => Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
  const num = (v) => String(r1(Number(v) || 0)); // 입력 칸 값 (쉼표 없이)
  /** 수량 입력: 쉼표는 천 단위로 보고 뺌. 비었거나 숫자가 아니면 null */
  const numIn = (s) => {
    const v = parseFloat(String(s == null ? '' : s).replace(/,/g, '').replace(/[^\d.]/g, ''));
    return Number.isFinite(v) && v >= 0 ? r1(Math.min(v, 1e7)) : null;
  };
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const projectName = () => (App.projects && App.projects.current ? App.projects.current.name : '');
  const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '_').trim() || '도면';
  const tel = (p) => String(p || '').replace(/[^\d+]/g, '');
  let saveTimer = 0;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (App.projects && App.projects.saveNow) App.projects.saveNow();
  };
  /** 글자를 치는 동안은 조금 뒤에 한 번 저장 */
  const saveLater = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 600); };

  /* ── 날짜 ── */
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return Number.isNaN(d.getTime()) || d.getDate() !== +m[3] ? null : d;
  };
  const today = () => iso(new Date());
  const md = (s) => { const d = parse(s); return d ? `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})` : ''; };
  const short = (s) => { const d = parse(s); return d ? `${d.getMonth() + 1}/${d.getDate()}` : ''; };
  const ampmName = (g) => (g.ampm === 'pm' ? '오후' : '오전');

  /* ── 저장: 읽기만 할 때는 빈 그릇을 만들지 않음 (창을 열어 보기만 해도 고친 도면이 되지 않게). 쓸 때는 …W() ── */
  function stored() {
    const o = App.current && App.current.orders;
    return isObj(o) ? o : null;
  }
  function storedW() {
    let o = stored();
    if (!o) o = App.current.orders = {};
    if (!isObj(o.site)) o.site = {};
    if (!isObj(o.groups)) o.groups = {};
    if (!isObj(o.lines)) o.lines = {};
    return o;
  }
  const part = (k) => { const o = stored(); return o && isObj(o[k]) ? o[k] : {}; };
  const recOf = (key) => { const r = part('lines')[key]; return isObj(r) ? r : null; };
  const recW = (key) => { const L = storedW().lines; if (!isObj(L[key])) L[key] = {}; return L[key]; };
  const groupOf = (id) => { const g = part('groups')[id]; return isObj(g) ? g : {}; };
  const groupW = (id) => { const G = storedW().groups; if (!isObj(G[id])) G[id] = {}; return G[id]; };
  const siteVal = (k) => { const v = part('site')[k]; return typeof v === 'string' ? v.trim() : ''; };
  /** 빈 값·알 수 없는 값은 지우고, 남은 것이 없으면 줄 기록도 지움 */
  function tidy(key) {
    const L = part('lines'), r = L[key];
    if (!isObj(r)) { if (key in L) delete L[key]; return; }
    if (r.state !== 'ordered' && r.state !== 'received') delete r.state;
    if (typeof r.product !== 'string') delete r.product;
    if (typeof r.qty !== 'number' || !Number.isFinite(r.qty)) delete r.qty;
    Object.keys(r).forEach((k) => { if (r[k] == null || r[k] === '') delete r[k]; });
    if (!Object.keys(r).length) delete L[key];
  }

  /* ── 거래처 목록 (이 기기) ── */
  function vendors() {
    const v = App.storage.read(KEY_VENDORS);
    if (!Array.isArray(v)) return [];
    return v.filter((x) => isObj(x) && typeof x.name === 'string' && x.name.trim())
      .map((x) => ({ name: x.name.trim(), phone: typeof x.phone === 'string' ? x.phone.trim() : '' }));
  }
  function addVendor(name, phone) {
    const list = vendors();
    const same = list.find((x) => x.name === name);
    if (same) { if (phone) same.phone = phone; } else list.push({ name, phone });
    return App.storage.write(KEY_VENDORS, list);
  }
  const phoneOf = (name) => (name ? (vendors().find((x) => x.name === name) || {}).phone || '' : '');

  /* ── 발주할 줄: { trade, key, name, spec, mark, sub, label, qty, unit, note } ── */
  function lines(s = App.summary.compute(), o = {}) {
    const out = [];
    /** o.mark: 창호 기호, o.sub: 화면·문자에 품명 뒤에 붙일 글자 (없으면 규격) */
    const push = (trade, name, spec, qty, unit, o = {}) => {
      qty = r1(qty);
      if (!(qty > 0)) return;
      const key = `${trade}|${name}|${spec}|${unit}`;
      const same = out.find((l) => l.key === key);
      if (same) { same.qty = r1(same.qty + qty); return; }
      const sub = o.sub != null ? o.sub : spec;
      out.push({ trade, key, name, spec, mark: o.mark || '', sub, label: [o.mark, name, sub].filter(Boolean).join(' '), qty, unit, note: o.note || '' });
    };
    const loss = (v) => (v ? ` · 로스 ${v}%` : '');
    const area = (mm2) => App.units.formatArea(mm2);
    /** 마감재(방 속성에서 고른 벽·바닥 마감): 한 장 크기가 있으면 장, 없으면 ㎡ (로스 붙여 0.1㎡ 올림) */
    const finish = (trade, f) => {
      const p = f.preset || {};
      const note = `${area(f.area)}${loss(p.loss)} · 방 ${f.rooms}곳`;
      if (f.sheets != null) push(trade, f.name, `${p.unitW}×${p.unitL}`, f.sheets, '장', { note });
      else push(trade, f.name, f.target === 'wall' ? '벽' : '바닥', Math.ceil((f.area * (1 + (p.loss || 0) / 100)) / 1e5 - 1e-9) / 10, '㎡', { note });
    };
    // 1) 목재·석고: 새로 세우는 벽의 다루끼·스터드·런너(본)와 석고보드(장), 벽 마감재(아트보드 등)
    s.materials.frames.forEach((f) => push('wood', f.name, `${r2(f.piece / 1000)}m`, f.pieces, '본', { note: `${App.measure.meters(f.length)}${loss(f.loss)}` })); // 1본 길이 그대로 (2.44m 등)
    s.materials.boards.forEach((b) => {
      const m = /^(\S+)\s+(.+)$/.exec(b.spec); // ‘석고보드 9.5T 900×1800’ → 품명 · 규격
      push('wood', m ? m[1] : b.spec, m ? m[2] : '', b.sheets, '장', { note: `${area(b.area)}${loss(b.loss)}` });
    });
    s.finishes.filter((f) => f.target === 'wall').forEach((f) => finish('wood', f));
    // 2) 문·창호: 창호 일람표 기호(D1·W1)마다 개수와 다는 방 (숨긴 레이어를 집계에서 빼면 여기서도 뺌)
    const hide = !o.includeHidden && App.layers.excludeHidden();
    App.openings.marks().list.forEach((g) => {
      const els = g.ids.map((id) => App.doc.get(id)).filter((e) => e && (!hide || App.layers.visible(e)));
      if (!els.length) return;
      const rooms = [];
      els.forEach((e) => { const r = App.measure.openingRoom(e); const n = r ? r.name || '이름 없음' : ''; if (n && !rooms.includes(n)) rooms.push(n); });
      const spec = `${g.width}×${g.height}${g.type === 'window' && g.sill ? ` · 창대 ${g.sill}` : ''}`;
      push(g.type === 'door' ? 'door' : 'win', g.kind || (g.type === 'door' ? '문' : '창문'), spec, els.length, '개', {
        mark: g.mark, note: rooms.length > 4 ? `${rooms.slice(0, 4).join('·')} 외 ${rooms.length - 4}곳` : rooms.join('·'),
      });
    });
    // 3) 도배·도장·타일·바닥: 방마다 고른 벽·천장 마감, 바닥 모양으로 센 마감 자재 + 바닥 마감재
    const paint = App.materials.basis().paint;
    const where = (spec) => (spec ? `(${spec})` : ''); // 부위·색: ‘실크 벽지 (벽)’, ‘강마루 (월넛)’
    s.matLines.forEach((l) => {
      if (l.mat === 'silk' || l.mat === 'paper') push('paper', l.name, l.spec, l.qty, l.unit, { sub: where(l.spec), note: l.note });
      else if (l.mat === 'paint') {
        // 페인트는 통으로 주문: 필요한 리터 ÷ 한 통, 올림
        push('paint', l.name, `${l.spec} · ${fmt(paint.can)}L 통`, Math.ceil(l.qty / paint.can - 1e-9), '통', {
          sub: `${fmt(paint.can)}L 통 ${where(l.spec)}`.trim(), note: `${fmt(l.qty)}L 필요 · ${area(l.area)} · ${paint.coats}회 칠`,
        });
      } else if (TILE.includes(l.mat)) push('tile', l.name, l.spec, l.qty, l.unit, { sub: where(l.spec), note: l.note });
      else if (FLOOR.includes(l.mat)) push('floor', l.name, l.spec, l.qty, l.unit, { sub: where(l.spec), note: l.note });
    });
    s.finishes.filter((f) => f.target !== 'wall').forEach((f) => finish('floor', f));
    // 4) 전기·설비·가구: 기호 종류별 개수, 전선관·배관·덕트는 m (올림)
    const recs = (sec, trade, unit) => {
      const by = new Map();
      s.records.filter((r) => r.sec === sec).forEach((r) => {
        const c = by.get(r.key) || { group: r.group, qty: 0 };
        c.qty += r.qty;
        by.set(r.key, c);
      });
      by.forEach(({ group, qty }, key) => {
        const [name, spec] = key.startsWith(`${group} `) ? [group, key.slice(group.length + 1).replace(/^· /, '')] : [key, ''];
        if (unit === 'm') push(trade, name, spec, Math.ceil(qty / 1000 - 1e-9), 'm', { note: `도면 길이 ${fmt(r1(qty / 1000))}m` });
        else push(trade, name, spec, qty, unit);
      });
    };
    recs('elec', 'elec', '개');
    recs('line:전선관', 'elec', 'm');
    recs('mech', 'mech', '개');
    recs('line:배관', 'mech', 'm');
    recs('line:덕트', 'mech', 'm');
    recs('furn', 'furn', '개');
    return out;
  }

  /** 줄의 지금 상태. 주문한 줄의 주문 수량은 주문한 양, 주문 전 줄은 고친 값 → (추가분이면 모자란 만큼) → 계산 수량 */
  function view(l) {
    const rec = recOf(l.key) || {};
    const state = rec.state === 'ordered' || rec.state === 'received' ? rec.state : 'todo';
    const prev = Number(rec.orderedQty) > 0 ? r1(Number(rec.orderedQty)) : 0; // 지금까지 주문한 양
    let qty;
    if (state !== 'todo') qty = prev;
    else if (typeof rec.qty === 'number' && Number.isFinite(rec.qty)) qty = rec.qty;
    else qty = prev > 0 ? Math.max(0, r1(l.qty - (typeof rec.calc === 'number' ? Math.max(rec.calc, prev) : prev))) : l.qty; // 추가분: 지금 모자란 만큼 (도면이 더 바뀌어도 따라감)
    // 추가 필요: 주문할 때의 계산 수량보다 지금 계산이 많을 때만 (일부러 적게 주문한 것은 아님). 예전 기록은 주문한 양과 비교
    // (계산보다 많이 주문했으면 주문한 양을 넘어설 때부터)
    const base = typeof rec.calc === 'number' ? Math.max(rec.calc, prev) : prev;
    const more = state !== 'todo' && l.qty > base + 1e-9 ? r1(l.qty - base) : 0;
    return { state, prev, qty, more, product: typeof rec.product === 'string' ? rec.product : '', at: rec.at || '', gotAt: rec.gotAt || '' };
  }
  function counts(ls) {
    const c = { todo: 0, ordered: 0, received: 0, more: 0 };
    ls.forEach((l) => { const v = view(l); c[v.state]++; if (v.more) c.more++; });
    return c;
  }

  /* ── 창에서 쓰는 지금 물량 (창이 떠 있는 동안 도면은 바뀌지 않음) ── */
  let cur = [], byKey = new Map(), starts = {};
  /** 공정표의 공정 시작일 (공정 열쇠 → 'YYYY-MM-DD') — 납품일 처음 값 */
  function taskStarts(s) {
    const out = {};
    if (!App.schedule) return out;
    try {
      const sc = App.current.schedule;
      const p = App.schedule.plan(sc && Array.isArray(sc.tasks) ? App.schedule.tasks() : App.schedule.auto(s));
      p.tasks.forEach((t) => { if (t.from && !out[t.key]) out[t.key] = iso(t.from); });
    } catch (e) {
      console.warn('공정표 날짜를 읽지 못함', e);
    }
    return out;
  }
  function load() {
    const s = App.summary.compute();
    cur = lines(s);
    byKey = new Map(cur.map((l) => [l.key, l]));
    hiddenKeys = new Set();
    if (App.layers.excludeHidden()) lines(App.summary.compute({ includeHidden: true }), { includeHidden: true }).forEach((l) => { if (!byKey.has(l.key)) hiddenKeys.add(l.key); });
    starts = taskStarts(s);
  }
  const tradeOf = (id) => TRADES.find((t) => t.id === id);
  /** 납품일: 고른 날짜(지운 것 포함) → 없으면 공정표 그 공정의 시작일 */
  const dateOf = (t) => { const g = groupOf(t.id); return typeof g.date === 'string' ? g.date : starts[t.task] || ''; };
  const withDay = (word, s) => (short(s) ? `${word} ${short(s)}` : word);
  const stateText = (v) => (v.state === 'ordered' ? withDay('주문함', v.at) : v.state === 'received' ? withDay('받음', v.gotAt) : '주문 전');
  const countText = (n, c) => `${n}줄${c.ordered ? ` · 주문함 ${c.ordered}` : ''}${c.received ? ` · 받음 ${c.received}` : ''}${c.more ? ` · 추가 필요 ${c.more}` : ''}`;

  /* ── 창 ── */
  function infoHtml(l, v) {
    const bits = [`계산 <b>${fmt(l.qty)}${esc(l.unit)}</b>`];
    if (l.note) bits.push(esc(l.note));
    if (v.state === 'todo' && v.prev) bits.push(`앞서 ${fmt(v.prev)}${esc(l.unit)} 주문${v.at ? ` (${short(v.at)})` : ''} · 이번은 추가분`);
    return `<small>${bits.join(' · ')}</small>${v.more ? `<button type="button" class="od-more" data-act="od-more" title="누르면 모자란 만큼이 ‘주문 전’ 추가분이 됩니다">추가 필요 +${fmt(v.more)}${esc(l.unit)}</button>` : ''}`;
  }
  function lineHtml(l) {
    const v = view(l);
    return `
      <div class="od-line is-${v.state}" data-key="${esc(l.key)}">
        <div class="od-name">${l.mark ? `<span class="od-mark is-${l.trade}">${esc(l.mark)}</span>` : ''}<b>${esc(l.name)}</b>${l.sub ? ` <span>${esc(l.sub)}</span>` : ''}<div class="od-info">${infoHtml(l, v)}</div></div>
        <button type="button" class="od-chip is-${v.state}" data-act="od-state" title="누를 때마다 주문 전 → 주문함 → 받음">${esc(stateText(v))}</button>
        <div class="od-ins">
          <label class="od-qty"><span>주문</span><input type="text" inputmode="decimal" data-f="qty" value="${num(v.qty)}" aria-label="${esc(l.label)} 주문 수량" autocomplete="off"><span>${esc(l.unit)}</span></label>
          <input class="od-prod" type="text" data-f="product" value="${esc(v.product)}" maxlength="60" placeholder="제품·색상 메모" aria-label="${esc(l.label)} 제품 메모" autocomplete="off">
        </div>
      </div>`;
  }
  function vendorOptions(sel) {
    const names = vendors().map((x) => x.name);
    if (sel && !names.includes(sel)) names.push(sel); // 다른 기기에서 고른 거래처 (이 기기 목록에 없음)
    return `<option value="">고르기</option>${names.map((n) => `<option value="${esc(n)}"${n === sel ? ' selected' : ''}>${esc(n)}</option>`).join('')}<option value="${ADD}">+ 거래처</option>`;
  }
  function groupHtml(t, ls) {
    const g = groupOf(t.id), phone = phoneOf(g.vendor);
    return `
      <section class="od-grp" data-trade="${t.id}">
        <h3 class="od-gtitle">${esc(t.name)} <small class="od-gcount">${esc(countText(ls.length, counts(ls)))}</small></h3>
        <div class="od-ghead">
          <label class="od-field od-vendor"><span class="field-label">거래처</span><select class="field-select" data-g="vendor" aria-label="${esc(t.name)} 거래처">${vendorOptions(g.vendor || '')}</select></label>
          <a class="btn od-call" data-call href="${phone ? `tel:${esc(tel(phone))}` : '#'}" title="${esc(phone)}" ${phone ? '' : 'hidden'}>전화</a>
          <label class="od-field od-date"><span class="field-label">납품일</span><input type="date" data-g="date" value="${esc(dateOf(t))}" aria-label="${esc(t.name)} 납품일"></label>
          <label class="od-field od-ampm"><span class="field-label">시간</span><select class="field-select" data-g="ampm" aria-label="${esc(t.name)} 납품 시간"><option value="am">오전</option><option value="pm"${g.ampm === 'pm' ? ' selected' : ''}>오후</option></select></label>
          <button type="button" class="btn btn-primary od-send" data-act="od-send">문자로 보내기</button>
        </div>
        <div class="od-vform" data-vform hidden>
          <div class="field"><span class="field-label">새 거래처 이름</span><div class="field-box"><input type="text" data-vf="name" maxlength="30" placeholder="예: ○○자재 김사장" autocomplete="off" aria-label="새 거래처 이름"></div></div>
          <div class="field"><span class="field-label">전화</span><div class="field-box"><input type="tel" data-vf="phone" maxlength="20" placeholder="010-0000-0000" autocomplete="off" aria-label="새 거래처 전화"></div></div>
          <div class="btn-row"><button type="button" class="btn btn-primary" data-act="od-vadd">추가</button><button type="button" class="btn" data-act="od-vcancel">취소</button></div>
        </div>
        <div class="od-out" data-out hidden></div>
        <div class="od-lines">${ls.map(lineHtml).join('')}</div>
      </section>`;
  }
  /** 도면에서 사라진 주문: 저장된 줄 가운데 지금 물량에 없는 것 */
  let hiddenKeys = new Set(); // 숨긴 레이어라 지금 목록에는 없지만 도면에는 있는 줄
  const goneKeys = () => Object.keys(part('lines')).filter((k) => !byKey.has(k) && !hiddenKeys.has(k));
  function goneRow(k) {
    const p = k.split('|'), r = recOf(k) || {};
    const unit = p.length > 3 ? p[p.length - 1] : '';
    const name = [p[1], p.slice(2, -1).join('|')].filter(Boolean).join(' ');
    const qty = r.orderedQty != null ? r.orderedQty : r.qty;
    const what = [`${STATE_NAME[r.state] || '주문 전'}${r.at ? ` ${short(r.at)}` : ''}`, qty != null ? `${fmt(qty)}${unit}` : '', r.product || ''].filter(Boolean).join(' · ');
    return `
      <div class="od-gone-row" data-gone="${esc(k)}">
        <span><b>${esc((tradeOf(p[0]) || {}).name || p[0])}</b> ${esc(name)}<small>${esc(what)}</small></span>
        <button type="button" class="btn" data-act="od-forget" aria-label="${esc(name)} 지우기">지우기</button>
      </div>`;
  }
  function goneHtml(keys) {
    if (!keys.length) return '';
    return `
      <details class="od-gone">
        <summary>도면에서 사라진 주문 <small data-gone-count>${keys.length}줄</small></summary>
        <p class="props-meta">도면을 고쳐 지금 물량에 없는 줄입니다. 이미 주문했다면 거래처에 알리고, 필요 없으면 지우세요.</p>
        ${keys.map(goneRow).join('')}
      </details>`;
  }
  const siteSum = () => [siteVal('addr'), siteVal('to')].filter(Boolean).join(' · ') || '주문 글에 들어감 · 이 도면';
  function bodyHtml() {
    const groups = TRADES.map((t) => ({ t, ls: cur.filter((l) => l.trade === t.id) })).filter((x) => x.ls.length);
    const field = (id, k, label, ph, max, type = 'text') => `<div class="field"><label class="field-label" for="${id}">${label}</label><div class="field-box"><input id="${id}" type="${type}" data-site="${k}" value="${esc(part('site')[k] || '')}" maxlength="${max}" placeholder="${esc(ph)}" autocomplete="off"></div></div>`;
    return `
      ${App.layers.excludeHidden() ? `<p class="dialog-note is-warn">숨긴 레이어(${esc(App.layers.hidden().map((id) => (App.layers.list().find((x) => x.id === id) || {}).label).filter(Boolean).join(', '))})의 자재는 빠져 있습니다 (위쪽 ‘레이어’ 메뉴의 ‘숨긴 레이어는 집계에서도 빼기’). 주문 기록은 그대로 남습니다.</p>` : ''}
      <p class="dialog-note">공종마다 거래처와 납품일을 정하고 <b>문자로 보내기</b>를 누르면 카톡·문자로 보낼 주문 글이 만들어집니다. 보낸 줄은 ‘주문함’이 되고, 자재를 받으면 상태를 눌러 ‘받음’으로 바꾸세요.</p>
      <details class="est-info od-site" ${siteVal('addr') || siteVal('to') ? '' : 'open'}>
        <summary>현장 정보 <small data-site-sum>${esc(siteSum())}</small></summary>
        ${field('odAddr', 'addr', '현장 주소', '예: 서울시 ○○구 ○○로 12, 101동 1203호', 80)}
        <div class="field-grid od-two">
          ${field('odTo', 'to', '받는 사람', '예: 김실장', 20)}
          ${field('odPhone', 'phone', '연락처', '010-0000-0000', 20, 'tel')}
        </div>
        ${field('odMemo', 'memo', '반입 메모', '예: 관리사무소 신고, 엘리베이터 보양, 반입 9~17시', 120)}
      </details>
      ${groups.length ? groups.map((x) => groupHtml(x.t, x.ls)).join('') : `
        <div class="empty"><div class="empty-title">발주할 자재가 없습니다</div><p>벽·문·창문·전기·설비를 그리고 방마다 바닥·벽·천장 마감을 고르면 공종별로 주문할 양이 여기에 나옵니다.</p></div>`}
      ${goneHtml(goneKeys())}
      <div class="btn-row od-tools">
        <button type="button" class="btn" data-act="od-csv" ${cur.length || goneKeys().length ? '' : 'disabled'}>CSV 저장</button>
        <button type="button" class="btn" data-act="od-reset" ${Object.keys(part('lines')).some((k) => (recOf(k) || {}).state) ? '' : 'disabled'}>모두 주문 전으로</button>
      </div>
      <p class="dialog-note">수량은 도면 물량으로 어림한 값(로스 포함)입니다. 주문 수량·제품을 고치면 이 도면에 저장됩니다. 주문한 뒤 도면을 고쳐 모자라면 ‘추가 필요’가 뜨고, 누르면 모자란 만큼을 다시 보낼 수 있습니다. 거래처 목록은 이 기기에 저장됩니다.</p>`;
  }

  /** 줄의 입력 칸은 그대로 두고 상태·안내·추가 필요만 다시 씀 (다른 칸으로 옮겨 가며 치는 중에도 끊기지 않게) */
  /* 칸을 고치고 바로 같은 줄의 단추를 누를 때: blur→change의 다시 그리기를 누르기(click)가 끝난 뒤로 미룸 (공정표·견적과 같은 방식).
     터치는 pointerup이 mousedown보다 먼저 오므로 click이 오면 바로, 안 오면 0.6초 뒤에 */
  let pointerIsDown = false, pending = [], pointerHooked = false, upTimer = 0;
  function hookPointer() {
    if (pointerHooked) return;
    pointerHooked = true;
    const flush = () => {
      clearTimeout(upTimer);
      pointerIsDown = false;
      if (pending.length) { const fs = pending; pending = []; setTimeout(() => fs.forEach((f) => f()), 0); }
    };
    const down = () => { clearTimeout(upTimer); pointerIsDown = true; };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('mousedown', down, true);
    document.addEventListener('click', flush, true);
    document.addEventListener('pointerup', () => { clearTimeout(upTimer); upTimer = setTimeout(flush, 600); }, true);
    document.addEventListener('pointercancel', flush, true);
  }
  const afterPointer = (fn) => { if (pointerIsDown) pending.push(fn); else fn(); };
  function paintLine(el) {
    const l = el && byKey.get(el.dataset.key);
    if (!l) return;
    const v = view(l);
    el.className = `od-line is-${v.state}`;
    const chip = el.querySelector('.od-chip');
    chip.className = `od-chip is-${v.state}`;
    chip.textContent = stateText(v);
    el.querySelector('.od-info').innerHTML = infoHtml(l, v);
    const q = el.querySelector('[data-f="qty"]');
    if (q !== document.activeElement) q.value = num(v.qty);
    paintTitle(el.closest('.od-grp'));
  }
  function paintTitle(sec) {
    if (!sec) return;
    const ls = cur.filter((l) => l.trade === sec.dataset.trade);
    sec.querySelector('.od-gcount').textContent = countText(ls.length, counts(ls));
  }
  function paintCall(sec) {
    const a = sec.querySelector('[data-call]'), phone = phoneOf(groupOf(sec.dataset.trade).vendor);
    a.hidden = !phone;
    a.href = phone ? `tel:${tel(phone)}` : '#';
    a.title = phone;
  }
  function paintTools(body) {
    const b = body.querySelector('[data-act="od-reset"]');
    if (b && !b.dataset.armed) b.disabled = !Object.keys(part('lines')).some((k) => (recOf(k) || {}).state);
  }
  function redraw(body) {
    const scroll = body.scrollTop;
    const site = body.querySelector('.od-site');
    const siteOpen = site ? site.open : null;
    body.innerHTML = `<div class="od" data-keys="local">${bodyHtml()}</div>`;
    if (siteOpen != null) body.querySelector('.od-site').open = siteOpen;
    body.scrollTop = scroll;
  }
  const lineEl = (body, key) => body.querySelector(`.od-line[data-key="${CSS.escape(key)}"]`);

  /* ── 고치기 ── */
  /** 주문 수량·제품 메모. 주문한 줄의 수량을 고치면 ‘주문한 양’을 고침 */
  function setField(key, f, raw) {
    const l = byKey.get(key);
    if (!l) return;
    const r = recW(key);
    if (f === 'product') r.product = String(raw).trim().slice(0, 60);
    else if (f === 'qty') {
      const v = numIn(raw), todo = view(l).state === 'todo';
      if (v == null) { if (todo) delete r.qty; } // 비우면 처음 값(계산 수량)으로
      else if (todo) r.qty = v;
      else r.orderedQty = v;
    }
    tidy(key);
  }
  /** 주문함으로: 주문한 양 = 앞서 주문한 양(추가분일 때) + 이번 주문 수량 */
  function markOrdered(items) {
    const d = today();
    items.forEach(({ l, v }) => {
      const r = recW(l.key);
      r.orderedQty = r1((v.state === 'todo' ? v.prev : 0) + v.qty);
      r.calc = l.qty; // 주문할 때의 계산 수량 (뒤에 도면이 바뀌어 늘었는지 볼 기준)
      r.state = 'ordered';
      r.at = d;
      delete r.qty;
      delete r.gotAt;
    });
  }
  /** 상태 칩: 주문 전 → 주문함(오늘) → 받음(오늘) → 주문 전 */
  function cycle(body, el) {
    const key = el.dataset.key, l = byKey.get(key);
    if (!l) return;
    const v = view(l);
    if (v.state === 'todo') markOrdered([{ l, v }]);
    else {
      const r = recW(key);
      if (v.state === 'ordered') { r.state = 'received'; r.gotAt = today(); }
      else ['state', 'at', 'gotAt', 'orderedQty', 'calc'].forEach((k) => delete r[k]);
      tidy(key);
    }
    save();
    paintLine(el);
    paintTools(body);
  }
  /** ‘추가 필요’를 누름: 주문 전 추가분으로 (앞서 주문한 양·날짜는 남겨 두고, 주문 수량은 모자란 만큼) */
  function more(body, el) {
    const key = el.dataset.key;
    if (!byKey.has(key)) return;
    const r = recW(key);
    ['state', 'gotAt', 'qty'].forEach((k) => delete r[k]); // 주문 수량은 비워 둠 → 지금 모자란 만큼 (view)
    tidy(key);
    save();
    paintLine(el);
    paintTools(body);
    el.querySelector('.od-chip').focus();
    App.ui.toast('모자란 만큼을 ‘주문 전’ 추가분으로 바꿨습니다. ‘문자로 보내기’로 보내세요.');
  }
  /** 보낼 줄: 주문 전이고 수량이 있는 줄. 하나도 없으면 주문함인 줄을 다시 보냄 (거래처가 못 받았을 때 — 상태는 그대로) */
  function toSend(trade) {
    const ls = cur.filter((l) => l.trade === trade).map((l) => ({ l, v: view(l) }));
    const todo = ls.filter((x) => x.v.state === 'todo' && x.v.qty > 0);
    if (todo.length) return { items: todo, again: false };
    return { items: ls.filter((x) => x.v.state === 'ordered' && x.v.qty > 0), again: true, got: ls.some((x) => x.v.state === 'received') };
  }

  /** 주문 글에 들어가는 것의 서명: 같으면 마지막 글을 그대로 다시 보내고, 바뀌었으면(납품일·시간·현장·수량·제품) 바뀐 글로 */
  function orderSig(t, items) {
    const g = groupOf(t.id);
    return JSON.stringify([dateOf(t), g.ampm === 'pm' ? 'pm' : 'am', ['addr', 'to', 'phone', 'memo'].map(siteVal), items.map(({ l, v }) => [l.key, v.qty, v.product])]);
  }

  /* ── 주문 글 ── */
  function orderText(t, items) {
    const g = groupOf(t.id), date = dateOf(t);
    const co = App.estimate && App.estimate.company ? App.estimate.company() : {};
    const out = [`[발주] ${[projectName(), siteVal('addr')].filter(Boolean).join(' / ') || '현장'}`];
    out.push(`납품: ${parse(date) ? `${md(date)} ${ampmName(g)}` : '날짜 협의'}`);
    const to = [siteVal('to'), siteVal('phone')].filter(Boolean).join(' ');
    if (to) out.push(`받는 분: ${to}`);
    items.forEach(({ l, v }, i) => out.push(`${i + 1}. ${l.label} — ${fmt(v.qty)}${l.unit}${v.state === 'todo' && v.prev ? ' (추가분)' : ''}${v.product ? ` (${v.product})` : ''}`));
    if (siteVal('memo')) out.push(`반입: ${siteVal('memo')}`);
    const me = [co.name, co.phone].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
    if (me) out.push(me);
    return out.join('\n');
  }
  /** 공유: 앱(Capacitor) 공유 창 → 브라우저 공유 창 → 복사. 돌려주는 값 'share' · 'copy' · 'cancel'(공유 창을 닫음) · 'fail' */
  async function share(text) {
    const C = window.Capacitor;
    const S = C && C.Plugins && C.Plugins.Share;
    try {
      if (S && (!C.isNativePlatform || C.isNativePlatform())) { await S.share({ text }); return 'share'; }
      if (navigator.share) { await navigator.share({ text }); return 'share'; }
    } catch (e) {
      if (/AbortError|cancel/i.test(`${e && e.name} ${e && e.message}`)) return 'cancel';
      // 공유 창을 띄우지 못함 → 복사로
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        App.ui.toast('복사했습니다. 카톡·문자에 붙여 넣으세요');
        return 'copy';
      }
    } catch (_) { /* 복사도 막힘 → 글을 보여 주고 손으로 복사 */ }
    return 'fail';
  }
  async function send(body, sec) {
    if (sec.dataset.sending) return; // 공유 창이 떠 있는 동안 두 번 누름
    sec.dataset.sending = '1';
    try {
      await sendNow(body, sec);
    } finally {
      delete sec.dataset.sending;
    }
  }
  async function sendNow(body, sec) {
    const t = tradeOf(sec.dataset.trade);
    const { items, again, got } = toSend(t.id);
    if (!items.length) {
      App.ui.toast(got ? '이 공종은 모두 받았습니다. 다시 주문하려면 상태를 눌러 ‘주문 전’으로 돌리세요.' : '보낼 수량이 없습니다. 주문 수량을 넣으세요.');
      return;
    }
    const g = groupOf(t.id);
    // 다시 보내기: 보낸 뒤 바뀐 게 없으면 마지막 글 그대로 [재발송], 바뀌었으면 지금 내용으로 [변경],
    // 전화로 주문하고 상태만 바꿔 둔 줄(보낸 글 없음)이면 그냥 주문 글
    const last = typeof g.lastText === 'string' && g.lastText ? g.lastText : '';
    const same = again && last && g.lastSig === orderSig(t, items);
    const fresh = orderText(t, items);
    const text = !again ? fresh : same ? `[재발송]\n${last}` : last ? `[변경]\n${fresh}` : fresh;
    const out = sec.querySelector('[data-out]');
    out.hidden = true;
    out.innerHTML = '';
    const how = await share(text);
    // 공유 창을 닫음: 휴대폰은 그대로, PC(공유 창에 카톡이 없음)는 글을 보여 줘 복사하게 (주문함으로 바꾸지는 않음)
    if (how === 'cancel' && window.matchMedia('(pointer: coarse)').matches) return;
    if (how === 'fail' || how === 'cancel') {
      out.innerHTML = `<p class="props-meta">이 기기에서는 바로 보낼 수 없습니다. 아래 글을 길게 눌러 모두 고른 뒤 복사해서 카톡·문자에 붙여 넣으세요.</p>
        <textarea class="field-text od-text" rows="8" readonly aria-label="${esc(t.name)} 주문 글">${esc(text)}</textarea>
        ${again ? '' : '<button type="button" class="btn btn-primary" data-act="od-mark">보냈으면 누르세요 · 주문함으로</button>'}`;
      out.hidden = false;
      const ta = out.querySelector('textarea');
      ta.focus();
      ta.select();
      return;
    }
    if (again) {
      if (!same) { const gw = groupW(t.id); gw.lastText = fresh; gw.lastSig = orderSig(t, items); save(); } // 바뀐 글을 보낸 것으로 기억
      if (how === 'share') App.ui.toast(same ? '주문한 내용을 다시 보냈습니다.' : '바뀐 주문 내용을 보냈습니다.');
      return;
    }
    sent(body, sec, items, how === 'share', text);
  }
  /** 보낸 줄을 주문함으로 */
  function sent(body, sec, items, tell, text) {
    markOrdered(items);
    // 보낸 납품일·시간을 고정하고 보낸 글을 기억 (공정표가 바뀌거나 날이 지나도 보낸 그대로)
    const t = tradeOf(sec.dataset.trade), g = groupW(t.id);
    if (typeof g.date !== 'string') g.date = dateOf(t);
    if (!g.ampm) g.ampm = groupOf(t.id).ampm === 'pm' ? 'pm' : 'am';
    g.lastText = text || orderText(t, items);
    g.lastSig = orderSig(t, toSend(t.id).items); // 주문함이 된 줄로 (다시 보낼 때 견줄 기준)
    save();
    items.forEach(({ l }) => paintLine(lineEl(body, l.key)));
    paintTools(body);
    if (tell) App.ui.toast(`${tradeOf(sec.dataset.trade).name} ${items.length}줄을 ‘주문함’으로 표시했습니다.`);
  }

  /* ── 거래처 고르기·넣기 ── */
  function groupField(sec, el) {
    const id = sec.dataset.trade;
    if (el.dataset.g === 'vendor') {
      if (el.value === ADD) {
        el.value = groupOf(id).vendor || '';
        const f = sec.querySelector('[data-vform]');
        f.hidden = false;
        f.querySelectorAll('input').forEach((i) => { i.value = ''; });
        f.querySelector('[data-vf="name"]').focus();
        return false;
      }
      const g = groupW(id);
      if (el.value) g.vendor = el.value;
      else delete g.vendor;
      paintCall(sec);
    } else if (el.dataset.g === 'date') groupW(id).date = parse(el.value) ? el.value : ''; // 지우면 ‘날짜 협의’
    else if (el.dataset.g === 'ampm') groupW(id).ampm = el.value === 'pm' ? 'pm' : 'am';
    return true;
  }
  function addVendorFrom(body, sec) {
    const f = sec.querySelector('[data-vform]');
    const nameIn = f.querySelector('[data-vf="name"]');
    const name = nameIn.value.trim().slice(0, 30), phone = f.querySelector('[data-vf="phone"]').value.trim().slice(0, 20);
    if (!name) {
      App.ui.toast('거래처 이름을 넣으세요.');
      nameIn.focus();
      return;
    }
    if (!addVendor(name, phone)) App.ui.toast('이 기기에 저장하지 못했습니다. 저장 공간을 확인하세요.');
    groupW(sec.dataset.trade).vendor = name;
    save();
    f.hidden = true;
    // 모든 공종의 거래처 고르기에 새 거래처를 넣음 (고른 것은 그대로)
    body.querySelectorAll('.od-grp').forEach((x) => {
      x.querySelector('[data-g="vendor"]').innerHTML = vendorOptions(groupOf(x.dataset.trade).vendor || '');
      paintCall(x);
    });
    sec.querySelector('[data-g="vendor"]').focus();
    App.ui.toast(`거래처 ‘${name}’을 넣었습니다 (이 기기에 저장).`);
  }

  /* ── 모두 주문 전으로 (한 번 더 눌러야 함) · 사라진 주문 지우기 ── */
  function reset(body, b) {
    if (b.dataset.armed !== '1') {
      b.dataset.armed = '1';
      b.textContent = '정말 모두 되돌리기';
      b.classList.add('is-armed');
      setTimeout(() => {
        if (b.isConnected && b.dataset.armed === '1') {
          delete b.dataset.armed;
          b.textContent = '모두 주문 전으로';
          b.classList.remove('is-armed');
        }
      }, 3000);
      return;
    }
    const L = part('lines');
    Object.keys(L).forEach((k) => {
      const r = L[k], l = byKey.get(k);
      if (isObj(r)) {
        if (typeof r.orderedQty === 'number') {
          // 계산과 다르게 주문한 양만 주문 수량으로 남김 (주문 때의 계산과 견줌, 예전 기록은 지금 계산과). 주문 전 추가분 수량은 버림
          const base = typeof r.calc === 'number' ? r.calc : l ? l.qty : null;
          if (base == null || Math.abs(r.orderedQty - base) > 1e-9) r.qty = r.orderedQty;
          else delete r.qty;
        }
        ['state', 'at', 'gotAt', 'orderedQty', 'calc'].forEach((f) => delete r[f]);
      }
      tidy(k);
    });
    Object.values(part('groups')).forEach((g) => { if (isObj(g)) { delete g.lastText; delete g.lastSig; } });
    save();
    redraw(body);
    App.ui.toast('모든 줄을 ‘주문 전’으로 되돌렸습니다. 주문 수량·제품 메모는 그대로입니다.');
  }
  function forget(body, b) {
    const row = b.closest('[data-gone]');
    if (!row) return;
    delete part('lines')[row.dataset.gone];
    save();
    const box = row.closest('.od-gone');
    row.remove();
    const left = box.querySelectorAll('[data-gone]').length;
    if (!left) box.remove();
    else box.querySelector('[data-gone-count]').textContent = `${left}줄`;
    paintTools(body);
  }

  function bind(body) {
    body.addEventListener('input', (e) => {
      const el = e.target;
      if (el.dataset.site) { storedW().site[el.dataset.site] = el.value; saveLater(); return; }
      const line = el.closest('.od-line');
      if (!line || !el.dataset.f) return;
      setField(line.dataset.key, el.dataset.f, el.value); // 바로 보내기를 눌러도 친 값이 들어가게
      saveLater();
    });
    hookPointer();
    body.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset.site) {
        const site = storedW().site, k = el.dataset.site;
        site[k] = el.value.trim();
        if (!site[k]) delete site[k];
        el.value = site[k] || '';
        body.querySelector('[data-site-sum]').textContent = siteSum();
        save();
        return;
      }
      const sec = el.closest('.od-grp');
      if (el.dataset.g && sec) {
        if (groupField(sec, el)) save();
        return;
      }
      const line = el.closest('.od-line');
      if (!line || !el.dataset.f) return;
      setField(line.dataset.key, el.dataset.f, el.value);
      if (el.dataset.f === 'product') el.value = view(byKey.get(line.dataset.key)).product;
      afterPointer(() => { if (line.isConnected) paintLine(line); }); // 칸을 벗어나며 누른 ‘추가 필요’ 단추가 다시 그리기로 사라지지 않게
      save();
    });
    body.addEventListener('keydown', (e) => {
      const el = e.target;
      const form = el.closest && el.closest('[data-vform]');
      if (form && e.key === 'Enter' && el.matches('input')) { e.preventDefault(); addVendorFrom(body, el.closest('.od-grp')); return; }
      if (form && e.key === 'Escape') { e.preventDefault(); form.hidden = true; el.closest('.od-grp').querySelector('[data-g="vendor"]').focus(); return; }
      // 칸의 Enter는 창을 닫지 않고 고친 값을 확정 (창 전체가 data-keys="local"이라 창의 Enter·Esc 처리를 받지 않음)
      if (e.key === 'Enter' && el.matches('input[type="text"], input[type="tel"]')) { e.preventDefault(); el.blur(); return; }
      if (e.key === 'Escape') {
        e.preventDefault();
        const close = document.querySelector('#dialogFoot [data-id="close"]');
        if (close) close.click();
      }
    });
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const sec = b.closest('.od-grp'), line = b.closest('.od-line');
      switch (b.dataset.act) {
        case 'od-state': cycle(body, line); break;
        case 'od-more': more(body, line); break;
        case 'od-send': send(body, sec); break;
        case 'od-mark': {
          const { items, again } = toSend(sec.dataset.trade);
          const ta = sec.querySelector('[data-out] textarea');
          if (!again && items.length) sent(body, sec, items, true, ta ? ta.value : '');
          b.remove();
          break;
        }
        case 'od-vadd': addVendorFrom(body, sec); break;
        case 'od-vcancel': sec.querySelector('[data-vform]').hidden = true; break;
        case 'od-csv': exportCsv(); break;
        case 'od-reset': reset(body, b); break;
        case 'od-forget': forget(body, b); break;
        default:
      }
    });
  }

  async function open() {
    if (App.modes.is('event')) {
      App.ui.toast('발주서는 인테리어 도면에서 씁니다.');
      return;
    }
    load();
    await App.ui.dialog({
      title: '자재 발주서',
      html: `<div class="od" data-keys="local">${bodyHtml()}</div>`,
      actions: [{ id: 'close', label: '닫기', primary: true }],
      onOpen: bind,
    });
    if (saveTimer) save(); // 치다가 닫았으면 바로 저장
    // 집계 ‘전체’의 발주 묶음(주문 전·주문함·추가 필요)을 새로
    if (App.summary && App.summary.view === 'all') App.summary.render();
  }

  /* ── CSV: 공종 · 거래처 · 품명 · 규격 · 계산 수량 · 주문 수량 · 단위 · 제품 · 납품일 · 상태 ── */
  function csvRows() {
    const rows = [['공종', '거래처', '품명', '규격', '계산 수량', '주문 수량', '단위', '제품', '납품일', '상태']];
    TRADES.forEach((t) => {
      const g = groupOf(t.id), date = dateOf(t);
      cur.filter((l) => l.trade === t.id).forEach((l) => {
        const v = view(l);
        const st = v.state === 'ordered' ? `주문함 ${v.at}` : v.state === 'received' ? `받음 ${v.gotAt}` : v.prev ? '주문 전 (추가분)' : '주문 전';
        rows.push([t.name, g.vendor || '', [l.mark, l.name].filter(Boolean).join(' '), l.spec, l.qty, v.qty, l.unit, v.product,
          parse(date) ? `${date} ${ampmName(g)}` : '', `${st.trim()}${v.more ? ` · 추가 필요 +${fmt(v.more)}${l.unit}` : ''}`]);
      });
    });
    // 도면에서 사라진 주문도 기록으로 (이미 주문했을 수 있음)
    goneKeys().forEach((k) => {
      const p = k.split('|'), r = recOf(k) || {};
      const t = tradeOf(p[0]) || { name: p[0] }, g = groupOf(p[0]);
      const qty = r.orderedQty != null ? r.orderedQty : r.qty != null ? r.qty : '';
      rows.push([t.name, g.vendor || '', p[1] || '', p.slice(2, -1).join('|'), '', qty, p.length > 3 ? p[p.length - 1] : '', r.product || '', '',
        `${STATE_NAME[r.state] || '주문 전'}${r.at ? ` ${r.at}` : ''} · 도면에서 사라짐`]);
    });
    return rows;
  }
  function exportCsv() {
    load();
    if (!cur.length && !goneKeys().length) {
      App.ui.toast('발주할 자재가 없습니다. 먼저 도면을 그리세요.');
      return false;
    }
    const name = `발주서_${safeName(projectName())}_${App.exporter.stamp()}.csv`;
    App.exporter.saved(App.exporter.download(name, App.exporter.csvText(csvRows()), 'text/csv;charset=utf-8'), `‘${name}’을 저장했습니다. 엑셀에서 바로 열 수 있습니다.`);
    return true;
  }

  /* ── 집계 ‘전체’의 발주 묶음 (화면에서만 — PDF·CSV·제안서에는 안 들어감). 발주서를 쓴 도면에서만 ── */
  function block(s) {
    if (App.modes.is('event') || !stored()) return null;
    const ls = lines(s || App.summary.compute());
    const c = counts(ls);
    const keys = new Set(ls.map((l) => l.key));
    if (App.layers.excludeHidden()) lines(App.summary.compute({ includeHidden: true }), { includeHidden: true }).forEach((l) => keys.add(l.key)); // 숨긴 레이어 것은 사라진 게 아님
    const gone = Object.keys(part('lines')).filter((k) => !keys.has(k)).length;
    const row = (label, n, note = '', cls = '') => ({ label, value: { text: `${n.toLocaleString('ko-KR')}줄`, num: n, unit: '줄' }, note, cls, cat: '발주' });
    const rows = [row('주문 전', c.todo), row('주문함', c.ordered)];
    if (c.received) rows.push(row('받음', c.received));
    if (c.more) rows.push(row('추가 필요', c.more, '주문한 뒤 도면이 바뀌어 모자람', 'item lv-warn'));
    if (gone) rows.push(row('도면에서 사라진 주문', gone, '발주서 창 맨 아래'));
    return { title: '발주', sub: c.more ? '추가로 주문할 줄이 있습니다' : '거래처별 자재 발주서', warn: !!c.more, action: { act: 'orders', label: '열기' }, screenOnly: true, rows };
  }

  App.orders = {
    open, lines, block, exportCsv, TRADES,
    /** CSV 줄 (지금 도면으로 다시 셈) */
    csvRows: () => { load(); return csvRows(); },
  };
})();
