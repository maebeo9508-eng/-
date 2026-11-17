/* 견적: 집계한 물량에 단가를 넣어 금액·공급가액·부가세·합계를 계산하고, 견적서(PDF)·CSV로 내보냄.
   - 단가는 도면마다 저장(App.current.prices)되고, 이 기기에도 기억되어 다음 도면에 자동으로 들어감
   - 기타 항목(인건비·운반비 등)은 직접 추가 (App.current.costExtras)
   - 두 모드 모두: 인테리어는 자재·마감·문·전기·설비, 조감도는 물건 렌탈·좌석·바닥 깔기 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KEY_MEMORY = 'hjdm.prices', KEY_COMPANY = 'hjdm.company';
  const r2 = (v) => Math.round(v * 100) / 100;
  const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
  const signedWon = (n) => (n < 0 ? `−${won(-n)}` : won(n));
  const qtyText = (q) => Number(q).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  const numIn = (s) => {
    const v = parseFloat(String(s == null ? '' : s).replace(/[^\d.]/g, ''));
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };
  /** 기타 항목 단가: 할인·단수 정리처럼 앞에 ‘-’를 붙이면 빼는 금액 */
  const numSigned = (s) => {
    const t = String(s == null ? '' : s).trim();
    const v = numIn(t);
    return /^[-−]/.test(t) || (typeof s === 'number' && s < 0) ? -v : v;
  };
  const CHAIR_KINDS = ['의자 배열', '의자', '원형 테이블', '테이블'];
  // 조감도에서 값을 매기지 않는 배경 물건 (사람·건물·나무·차 등)
  const SCENERY = ['사람', '건물', '나무', '바위', '생울타리', '주차 구획', '횡단보도', '바닥 화살표', '승용차', '버스', '자전거', '가로등', '버스 정류장'];
  let shown = []; // 지금 화면에 보이는 줄 (단가를 치는 동안 도면을 다시 세지 않게)
  /** 자주 넣는 기타 항목: [이름, 단위] */
  const EXTRA_PRESETS = {
    interior: [['인건비', '인'], ['자재 운반비', '식'], ['폐기물 처리', '식'], ['철거', '식'], ['공구·소모품', '식'], ['할인', '식']],
    event: [['설치·철거 인건비', '인'], ['운반비', '식'], ['장비 대여', '일'], ['진행 요원', '인'], ['전기 공사', '식'], ['할인', '식']],
  };

  /* ── 단가 저장 ── */
  /** 이름이 바뀐 줄의 예전 단가 열쇠 → 새 열쇠 (앞부분, 뒤의 단위는 그대로) */
  const RENAMED = [['건축|벽|방 쪽 벽 면적|', '건축|벽|도배·도장 면적 (안목)|']];
  const renamedKey = (k) => { for (const [o, n] of RENAMED) if (k.startsWith(o)) return n + k.slice(o.length); return k; };
  /** obj(열쇠 → 단가)의 예전 열쇠를 새 열쇠로 옮김 (새 열쇠에 이미 값이 있으면 그것을 둠). 바뀐 게 있으면 true */
  function migrateKeys(obj, marks) {
    let changed = false;
    Object.keys(obj).forEach((k) => {
      const nk = renamedKey(k);
      if (nk === k) return;
      if (typeof obj[nk] !== 'number') { obj[nk] = obj[k]; if (marks && marks[k]) marks[nk] = true; }
      delete obj[k];
      if (marks) delete marks[k];
      changed = true;
    });
    return changed;
  }
  function memory() {
    const m = App.storage.read(KEY_MEMORY);
    if (!m || typeof m !== 'object') return {};
    if (migrateKeys(m)) App.storage.write(KEY_MEMORY, m);
    return m;
  }
  function remember(key, price) {
    const m = memory();
    if (price > 0) m[key] = price;
    else delete m[key];
    App.storage.write(KEY_MEMORY, m);
  }
  // 읽기만 할 때는 App.current에 빈 그릇을 만들지 않음 (견적을 보기만 해도 고친 도면으로 저장되지 않게). 쓸 때는 …W()
  const NONE = Object.freeze({});
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  function prices() {
    const c = App.current;
    if (!isObj(c.prices)) return NONE;
    if (migrateKeys(c.prices, isObj(c.priceLib) ? c.priceLib : null)) save(); // 2.2 도면의 벽 단가
    return c.prices;
  }
  function pricesW() {
    const c = App.current;
    if (!isObj(c.prices)) c.prices = {};
    return c.prices;
  }
  /** 단가표에서 가져와 이 도면에 붙박은 단가 표시 (key → true) */
  function libMarks() {
    const c = App.current;
    return isObj(c.priceLib) ? c.priceLib : NONE;
  }
  function libMarksW() {
    const c = App.current;
    if (!isObj(c.priceLib)) c.priceLib = {};
    return c.priceLib;
  }
  /** 단가표 단가를 이 도면에 붙박음: 나중에 다른 도면에서 단가표가 바뀌어도 이 도면 견적 금액은 그대로이고,
      백업·다른 기기에서도 같은 금액. 단가표의 새 단가로 바꾸려면 ‘단가표 단가로 채우기’ */
  function freeze(ls) {
    const m = memory();
    let n = 0;
    ls.forEach((l) => {
      if (typeof prices()[l.key] === 'number' || typeof m[l.key] !== 'number') return;
      pricesW()[l.key] = m[l.key];
      libMarksW()[l.key] = true;
      n++;
    });
    if (n) save();
    return n;
  }
  /** 단가가 어디서 왔는지: 'project'(이 도면에 친 단가) · 'library'(단가표) · '' */
  function priceSource(key) {
    if (typeof prices()[key] === 'number') return libMarks()[key] ? 'library' : 'project';
    return typeof memory()[key] === 'number' ? 'library' : '';
  }
  /** 이 도면에 넣은 단가, 없으면 이 기기에 기억된 단가 */
  function priceOf(key) {
    const p = prices()[key];
    if (typeof p === 'number') return p;
    const m = memory()[key];
    return typeof m === 'number' ? m : 0;
  }
  function extras() {
    const c = App.current;
    return Array.isArray(c.costExtras) ? c.costExtras : [];
  }
  function extrasW() {
    const c = App.current;
    if (!Array.isArray(c.costExtras)) c.costExtras = [];
    return c.costExtras;
  }
  /** 기타 항목의 단가 (할인이면 음수): ‘-’를 쳤거나 ± 버튼·‘할인’으로 뺄 금액으로 정한 것 */
  const extraPrice = (x) => { const v = numSigned(x.price); return v < 0 ? v : x.neg ? -v : v; };
  const isNeg = (x) => numSigned(x.price) < 0 || !!x.neg; // 단가가 아직 0이어도 할인 줄
  function company() {
    const c = App.storage.read(KEY_COMPANY);
    return c && typeof c === 'object' ? c : {};
  }
  const save = () => { if (App.projects && App.projects.saveNow) App.projects.saveNow(); };

  /* ── 공종별 견적 (인테리어): 견적 줄을 공정 순서의 공종으로 묶어 공종마다 소계 ──
     공종은 줄마다 바꿀 수 있고(App.current.tradeOf, 바꾼 것만), 기타 항목은 x.trade (공정표 인건비는 그 공정의 공종) */
  const TRADES = ['가설·철거', '설비', '전기', '목공', '창호', '타일', '도장', '도배', '바닥', '가구', '기타'];
  const MAT_TRADE = { silk: '도배', paper: '도배', paint: '도장', walltile: '타일', tile: '타일', tileL: '타일', tileS: '타일', marble: '타일', plank: '바닥', wide: '바닥', chevron: '바닥', vinyl: '바닥', deco: '바닥', carpet: '바닥', concrete: '바닥', epoxy: '바닥' };
  const SEC_TRADE = { 철거: '가설·철거', '벽 자재': '목공', 문: '목공', 창문: '창호', 전기: '전기', 전선관: '전기', 설비: '설비', 배관: '설비', 덕트: '설비', 가구: '가구' };
  /** 공정표 공정(key) → 공종: ‘견적에 인건비 넣기’로 넣은 줄 */
  const TASK_TRADE = { prep: '가설·철거', demo: '가설·철거', clean: '가설·철거', mech: '설비', elec: '전기', wood: '목공', win: '창호', tile: '타일', paint: '도장', paper: '도배', floor: '바닥', furn: '가구' };
  const taskTrade = (key) => TASK_TRADE[key] || '기타';
  function defaultTrade(l) {
    if (l.sec === '마감 자재') return MAT_TRADE[l.mat] || '기타';
    if (l.sec === '마감재') return l.target === 'wall' ? '목공' : '바닥'; // 아트보드 같은 벽 마감재는 목공
    if (l.sec === '건축') return l.name === '바닥' ? '바닥' : l.name === '벽' ? '도배' : '목공'; // 천장·걸레받이·천장 몰딩은 목공
    return SEC_TRADE[l.sec] || '기타';
  }
  const tradeMap = () => (isObj(App.current.tradeOf) ? App.current.tradeOf : NONE);
  const tradeOf = (l) => { const t = tradeMap()[l.key]; return TRADES.includes(t) ? t : defaultTrade(l); };
  function extraTrade(x) {
    if (TRADES.includes(x.trade)) return x.trade;
    const n = String(x.name || '').trim();
    if (/철거|폐기물|보양|청소|가설/.test(n)) return '가설·철거';
    const t = TRADES.find((k) => k !== '기타' && n.startsWith(k));
    return t || '기타';
  }
  /** 공종별로 볼 때 (인테리어만, 이 도면) */
  const tradeMode = () => !App.modes.is('event') && App.current.estimateStyle === 'trade';
  /** 공과잡비·기업이윤(%)·단수 정리(원 단위 미만 버림)·평형 — 인테리어만, 이 도면. 처음 값은 모두 0이라 금액이 전과 같음 */
  function adj() {
    const a = !App.modes.is('event') && isObj(App.current.estimateAdj) ? App.current.estimateAdj : NONE;
    const pct = (v) => (typeof v === 'number' && v > 0 && v < 100 ? v : 0);
    return { misc: pct(a.misc), profit: pct(a.profit), round: [1000, 10000, 100000].includes(a.round) ? a.round : 0, pyeong: typeof a.pyeong === 'number' && a.pyeong > 0 ? a.pyeong : 0 };
  }
  const adjOn = (A) => !!(A.misc || A.profit || A.round);
  const ROUND_NAMES = { 1000: '천원', 10000: '만원', 100000: '십만원' };
  /** 견적 줄·기타 항목을 공종별로: [{ t, rows, xs, amount }] (빈 공종은 뺌, 할인 줄은 공종에 넣지 않음) */
  function groupsOf(ls) {
    return TRADES.map((t) => {
      const rows = ls.filter((l) => tradeOf(l) === t);
      const xs = extras().filter((x) => !isNeg(x) && extraTrade(x) === t);
      // 금액은 totals()가 줄마다 채움 (아직 안 셌으면 여기서 셈)
      const amt = (l) => (l.amount != null ? l.amount : Math.round(l.qty * priceOf(l.key)));
      const xamt = (x) => (x.amount != null ? x.amount : Math.round(numIn(x.qty) * extraPrice(x)));
      return { t, rows, xs, amount: rows.reduce((n, l) => n + amt(l), 0) + xs.reduce((n, x) => n + xamt(x), 0) };
    }).filter((g) => g.rows.length || g.xs.length);
  }
  /** 평형: 넣은 값, 없으면 바닥 면적(벽 중심)을 평으로 */
  function pyeongOf(A = adj(), s = null) {
    if (A.pyeong) return A.pyeong;
    s = s || App.summary.compute();
    const v = s.arch.floor / 1e6 / 3.305785;
    return v >= 1 ? Math.round(v * 10) / 10 : 0;
  }
  /** 합계 칸 줄: 공종별이거나 공과잡비·이윤·단수 정리를 넣었으면 직접공사비부터 나눠 보임 */
  function totalRows(t) {
    const out = [];
    if (t.detailed) {
      const A = t.adj;
      out.push(['직접공사비', t.direct]);
      if (A.misc) out.push([`공과잡비 (${A.misc}%)`, t.misc]);
      if (A.profit) out.push([`기업이윤 (${A.profit}%)`, t.profit]);
      if (t.discount) out.push(['할인', t.discount]);
      if (A.round) out.push([`단수 정리 (${ROUND_NAMES[A.round]} 미만 버림)`, t.cut]);
    }
    return out;
  }
  const perPyeong = (t, py) => (py > 0 && t.supply > 0 ? `평당 약 ${Math.round(t.supply / py / 10000).toLocaleString('ko-KR')}만원 (${py.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}평 기준 · 부가세 별도)` : '');

  /* ── 값을 매길 줄 ──
     { sec: 묶음, key: 단가 열쇠, name: 품명, spec: 규격, qty: 수량, unit: 단위, note: 비고 } */
  function lines(s = App.summary.compute()) {
    const out = [];
    const event = App.modes.is('event');
    const areaU = App.units.areaLabel();
    const area = (mm2) => r2(mm2 / App.units.areaFactor()); // 화면 소수점 설정과 상관없이 소수 둘째 자리까지
    const push = (sec, name, spec, qty, unit, note = '', extra = null) => {
      if (!(qty > 0)) return;
      out.push({ sec, key: `${sec}|${name}|${spec}|${unit}`, name, spec, qty: r2(qty), unit, note, ...(extra || {}) }); // extra: 공종 판정용 (mat·target)
    };
    if (!event) {
      s.materials.frames.forEach((f) => push('벽 자재', f.name, `${r2(f.piece / 1000)}m`, f.pieces, '본', `${App.measure.meters(f.length)}${f.loss ? ` · 로스 ${f.loss}%` : ''}`));
      s.materials.boards.forEach((b) => push('벽 자재', b.spec, '', b.sheets, '장', `${App.units.formatArea(b.area)}${b.loss ? ` · 로스 ${b.loss}%` : ''}`));
      s.finishes.forEach((f) => {
        const p = f.preset;
        if (f.sheets != null) push('마감재', f.name, `${p.unitW}×${p.unitL}`, f.sheets, '장', `${App.units.formatArea(f.area)}${p.loss ? ` · 로스 ${p.loss}%` : ''}`, { target: f.target });
        else push('마감재', f.name, f.target === 'wall' ? '벽' : '바닥', area(f.area), areaU, '', { target: f.target });
      });
    }
    if (!event && s.phases) {
      const P = s.phases; // 0이면 줄이 생기지 않음
      push('철거', '벽 철거', '한 면', area(P.demo.area), areaU, `길이 ${App.measure.meters(P.demo.length)} · 문·창문 뺌`);
      push('철거', '문·창문 철거', '', P.demoDoors + P.demoWindows, '개', '철거로 정한 것 (철거 벽에 달린 것 포함)');
      push('철거', '바닥재 철거', '', area(P.demoFloor), areaU, '고른 방의 안목 바닥');
      push('철거', '천장 철거', '', area(P.demoCeil), areaU, '고른 방의 천장');
      push('철거', '벽지·도장 제거', '', area(P.demoWall), areaU, '안목 둘레 × 천장 높이 (문·창문 뺌)');
    }
    (s.matLines || []).forEach((l) => push('마감 자재', l.name, l.spec, l.qty, l.unit, l.note, { mat: l.mat }));
    if (s.rooms.length) {
      const a = s.arch;
      push('건축', '바닥', '안목 면적', area(a.clearFloor), areaU, '바닥재·장판·마루');
      push('건축', '천장', '천장 면적', area(a.ceiling), areaU, '천장재·도장');
      push('건축', '벽', '도배·도장 면적 (안목)', area(a.paintWall), areaU, '안목 둘레 × 천장 높이 (문·창문 뺌)');
      push('건축', '걸레받이', '', r2(a.baseboard / 1000), 'm');
      push('건축', '천장 몰딩', '', r2(a.molding / 1000), 'm');
    }
    // 개수·길이로 세는 묶음 (문·창문·전기·설비·가구·행사 물건·전선관·배관…)
    App.summary.sections().forEach((sec) => {
      if (['seat', 'people', 'parking'].includes(sec.id)) return;
      const recs = s.records.filter((r) => r.sec === sec.id && !(sec.id === 'event' && ((CHAIR_KINDS.includes(r.group) && /^의자/.test(r.group)) || SCENERY.includes(r.group))));
      const byKey = new Map();
      recs.forEach((r) => {
        const cur = byKey.get(r.key) || { group: r.group, qty: 0 };
        cur.qty += r.qty;
        byKey.set(r.key, cur);
      });
      byKey.forEach(({ group, qty }, key) => {
        const [name, spec] = key.startsWith(`${group} `) ? [group, key.slice(group.length + 1).replace(/^· /, '')] : [key, ''];
        if (sec.unit === 'm') push(sec.title, name, spec, r2(qty / 1000), 'm');
        else push(sec.title, name, spec, qty, sec.unit);
      });
    });
    // 의자: 모양별 개수 (의자 배열·낱개 의자·테이블 둘레 의자를 모두 더함)
    const chairs = new Map();
    s.items.forEach((it) => {
      if (it.category !== 'event' || !CHAIR_KINDS.includes(it.kind)) return;
      const seats = App.catalog.seats(it);
      if (!seats || !seats.count) return;
      const def = App.catalog.itemDef(it.kind) || {};
      const style = it.style || (def.styles ? def.styleDefault || def.styles[0] : '');
      chairs.set(style, (chairs.get(style) || 0) + seats.count);
    });
    chairs.forEach((n, style) => push('의자', '의자', style, n, '개'));
    // 영역: 바닥 종류별 면적 (잔디·카펫 깔기 등)
    const zones = new Map();
    s.zones.forEach((z) => zones.set(z.surface || '영역', (zones.get(z.surface || '영역') || 0) + z.area));
    zones.forEach((mm2, name) => push('영역', name, '깔기', area(mm2), areaU));
    return out;
  }

  /** 금액 계산 (줄마다 price·amount를 채움) */
  function totals(ls) {
    freeze(ls);
    let direct = 0, discount = 0;
    ls.forEach((l) => {
      l.price = priceOf(l.key);
      l.amount = Math.round(l.qty * l.price);
      direct += l.amount;
    });
    extras().forEach((x) => {
      x.amount = Math.round(numIn(x.qty) * extraPrice(x));
      if (x.amount < 0) discount += x.amount;
      else direct += x.amount;
    });
    // 직접공사비 → 공과잡비(직접공사비 × %) → 기업이윤((직접공사비 + 공과잡비) × %) → 할인 → 단수 정리(버림) → 공급가액 → 부가세
    // 처음 값(0%, 단수 정리 없음)이면 공급가액 = 모든 줄의 합 (전과 같음)
    const A = adj();
    const misc = Math.round((direct * A.misc) / 100);
    const profit = Math.round(((direct + misc) * A.profit) / 100);
    const before = direct + misc + profit + discount;
    const supply = A.round && before > 0 ? Math.floor(before / A.round) * A.round : before;
    const vatOn = App.current.vat !== false;
    const vat = vatOn ? Math.round(supply * 0.1) : 0;
    return {
      supply, vat, vatOn, total: supply + vat, priced: ls.filter((l) => l.price > 0).length + extras().filter((x) => x.amount !== 0).length,
      direct, discount, misc, profit, cut: supply - before, adj: A, trade: tradeMode(), detailed: tradeMode() || adjOn(A),
    };
  }

  /** 금액을 한글로: 1357400 → 일백삼십오만칠천사백 (견적서의 '일금 …원정') */
  function hangul(n) {
    n = Math.round(Math.abs(n));
    if (!n) return '영';
    const D = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'], S = ['천', '백', '십', ''], B = ['', '만', '억', '조', '경'];
    let out = '', g = 0;
    while (n > 0) {
      const part = n % 10000;
      n = Math.floor(n / 10000);
      if (part) {
        const ds = String(part).padStart(4, '0');
        let t = '';
        for (let i = 0; i < 4; i++) if (+ds[i]) t += D[+ds[i]] + S[i];
        out = t + B[g] + out;
      }
      g++;
    }
    return out;
  }

  /* ── 집계 탭의 '견적' 보기 ── */
  const priceText = (v) => (v > 0 ? Math.round(v).toLocaleString('ko-KR') : '');
  const signedText = (v) => (v ? Math.round(v).toLocaleString('ko-KR') : '');
  function html(s) {
    const ls = lines(s);
    shown = ls;
    const t = totals(ls);
    const secs = [];
    ls.forEach((l) => {
      let g = secs.find((x) => x.sec === l.sec);
      if (!g) secs.push((g = { sec: l.sec, rows: [] }));
      g.rows.push(l);
    });
    const co = company();
    const mode = App.modes.is('event') ? 'event' : 'interior';
    const trade = t.trade, A = t.adj;
    // 공종별일 때: 줄마다 공종을 바꾸는 작은 칸
    const tradeSelect = (attr, cur) => `<select class="est-trade" ${attr} aria-label="공종">${TRADES.map((k) => `<option value="${k}"${k === cur ? ' selected' : ''}>${k}</option>`).join('')}</select>`;
    const row = (l) => `
      <div class="est-row" data-key="${esc(l.key)}">
        <div class="est-name"><b>${esc(l.name)}</b>${l.spec ? ` <span>${esc(l.spec)}</span>` : ''}${l.note ? `<small>${esc(l.note)}</small>` : ''}${trade ? tradeSelect(`data-trade="${esc(l.key)}"`, tradeOf(l)) : ''}</div>
        <div class="est-qty">${qtyText(l.qty)}<small>${esc(l.unit)}</small></div>
        <label class="est-price"><input type="text" inputmode="numeric" autocomplete="off" data-price="${esc(l.key)}" value="${priceText(l.price)}" placeholder="단가" aria-label="${esc(l.name)} 단가"><span>원</span>${l.price > 0 && priceSource(l.key) === 'library' ? '<small class="est-src" title="단가표에 기억된 단가">단가표</small>' : ''}</label>
        <div class="est-amt" data-amt="${esc(l.key)}">${l.amount ? won(l.amount) : '–'}</div>
      </div>`;
    const extraRow = (x) => `
      <div class="est-row est-extra" data-extra="${esc(x.id)}">
        <div class="est-name"><input type="text" data-x="name" value="${esc(x.name)}" placeholder="항목 이름" aria-label="항목 이름" autocomplete="off">${trade && !isNeg(x) ? tradeSelect(`data-xtrade="${esc(x.id)}"`, extraTrade(x)) : ''}</div>
        <div class="est-qty"><input type="text" inputmode="decimal" data-x="qty" value="${esc(x.qty)}" aria-label="수량" autocomplete="off"><input type="text" data-x="unit" value="${esc(x.unit)}" class="est-unit" aria-label="단위" autocomplete="off"></div>
        <div class="est-price"><button type="button" class="btn est-sign${isNeg(x) ? ' is-neg' : ''}" data-act="est-sign" aria-pressed="${isNeg(x)}" title="빼는 금액(할인)으로 바꾸기" aria-label="할인으로 바꾸기">±</button><label class="est-price-in"><input type="text" inputmode="numeric" data-x="price" value="${signedText(extraPrice(x))}" placeholder="단가" aria-label="단가" autocomplete="off"><span>원</span></label></div>
        <div class="est-amt">${x.amount ? won(x.amount) : '–'}</div>
        <button type="button" class="btn est-del" data-act="est-del" aria-label="이 항목 지우기" title="지우기">×</button>
      </div>`;
    return `
      <div class="est">
        ${s.excluded && s.excluded.length ? `<p class="dialog-note is-warn est-warn est-hidden">숨긴 레이어(${esc(s.excluded.join(', '))})는 집계와 견적에서 빠져 있습니다. 견적서에 넣으려면 레이어를 보이게 하거나 설정에서 ‘숨긴 레이어는 집계에서도 빼기’를 끄세요.</p>` : ''}
        ${s.arch && s.arch.issues ? `<p class="dialog-note is-warn est-warn">경계 확인이 필요한 방이 ${s.arch.issues}개 있습니다. 방이 벽과 맞지 않으면 바닥·벽 물량이 실제와 다를 수 있으니 도면에서 빨간 점선 방을 먼저 고치세요.${s.arch.overlaps ? ` (겹친 방 ${s.arch.overlaps}개는 물량에서 뺐습니다)` : ''}</p>` : ''}
        <p class="dialog-note">단가를 넣으면 금액이 바로 계산됩니다. 넣은 단가는 이 도면에 저장되고 <b>단가표</b>(이 기기)에도 기억되어 다음 도면에 자동으로 들어갑니다.</p>
        ${mode === 'interior' ? `<div class="est-style"><span class="field-label">묶기</span><div class="seg-inline" role="radiogroup" aria-label="견적 묶기">${[['item', '항목별'], ['trade', '공종별 (총괄표)']].map(([v, l]) => `<button type="button" class="seg-btn" role="radio" data-est-style="${v}" aria-checked="${(v === 'trade') === trade}">${l}</button>`).join('')}</div></div>` : ''}
        <div class="est-tools">
          <button type="button" class="btn" data-act="est-lib">단가표 관리 <small>${Object.keys(memory()).length}개</small></button>
          <button type="button" class="btn" data-act="est-apply" title="이 도면에서 고친 단가를 단가표 단가로 되돌림">단가표 단가로 채우기</button>
          <button type="button" class="btn" data-act="proposal" title="표지·3D 그림·평면도·물량·견적·현장 사진을 한 묶음 PDF로">제안서 만들기</button>
          <button type="button" class="btn" data-act="schedule" title="물량으로 공정마다 일수·인원을 어림한 공정표 — 공정별 인건비를 견적에 넣을 수 있음">공정표</button>
        </div>
        ${secs.length ? '' : '<div class="empty"><div class="empty-title">값을 매길 물량이 없습니다</div><p>도면을 그리면 자재·물건 수량이 여기에 나옵니다. 아래 기타 항목은 지금도 넣을 수 있습니다.</p></div>'}
        ${trade
    ? groupsOf(ls).map((g) => `<section class="est-sec" data-trade-sec="${esc(g.t)}"><h3 class="sum-title">${esc(g.t)} <small class="est-subtotal" data-sub="${esc(g.t)}">소계 ${won(g.amount)}</small></h3>${g.rows.map(row).join('')}${g.xs.map(extraRow).join('')}</section>`).join('')
    : secs.map((g) => `<section class="est-sec"><h3 class="sum-title">${esc(g.sec)}</h3>${g.rows.map(row).join('')}</section>`).join('')}
        <section class="est-sec">
          <h3 class="sum-title">기타 항목 <small>${trade ? '할인 등 · 인건비·운반비를 넣으면 이름에 맞는 공종으로 묶임' : '인건비·운반비 등 직접 넣는 것'}</small></h3>
          ${(trade ? extras().filter(isNeg) : extras()).map(extraRow).join('')}
          <div class="est-add">
            <button type="button" class="btn" data-act="est-add">+ 항목 추가</button>
            ${EXTRA_PRESETS[mode].map(([n, u]) => `<button type="button" class="chip" data-act="est-add" data-name="${esc(n)}" data-unit="${esc(u)}">${esc(n)}</button>`).join('')}
          </div>
        </section>
        <section class="est-total" aria-live="polite">
          ${totalRows(t).map(([k, v], i) => `<div class="is-sub"><span>${esc(k)}</span><b data-trow="${i}">${signedWon(v)}</b></div>`).join('')}
          <div><span>공급가액</span><b id="estSupply">${won(t.supply)}</b></div>
          <div><label class="est-vat"><input type="checkbox" id="estVatOn" ${t.vatOn ? 'checked' : ''}> 부가세 10%</label><b id="estVat">${won(t.vat)}</b></div>
          <div class="is-grand"><span>합계</span><b id="estTotal">${won(t.total)}</b></div>
          <p class="est-words" id="estWords">${t.total ? `일금 ${hangul(t.total)}원정 (${t.vatOn ? '부가세 포함' : '부가세 별도'})` : ''}</p>
          ${mode === 'interior' ? `<p class="est-words est-py" id="estPy">${perPyeong(t, pyeongOf(A, s))}</p>` : ''}
        </section>
        ${mode === 'interior' ? `<details class="est-adj"${adjOn(A) || A.pyeong ? ' open' : ''}>
          <summary>공과잡비·기업이윤·단수 정리·평당 금액</summary>
          <div class="field-grid">
            <div class="field"><label class="field-label" for="estMiscPct">공과잡비 <small>직접공사비의 %</small></label><div class="field-box"><input id="estMiscPct" type="text" inputmode="decimal" data-adj="misc" value="${A.misc || ''}" placeholder="0" autocomplete="off"><span class="field-unit">%</span></div></div>
            <div class="field"><label class="field-label" for="estProfitPct">기업이윤 <small>공사비+공과잡비의 %</small></label><div class="field-box"><input id="estProfitPct" type="text" inputmode="decimal" data-adj="profit" value="${A.profit || ''}" placeholder="0" autocomplete="off"><span class="field-unit">%</span></div></div>
            <div class="field"><label class="field-label" for="estRound">단수 정리</label><div class="field-box"><select id="estRound" class="field-select" data-adj="round">${[[0, '안 함'], [1000, '천원 미만 버림'], [10000, '만원 미만 버림'], [100000, '십만원 미만 버림']].map(([v, l]) => `<option value="${v}"${v === A.round ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
            <div class="field"><label class="field-label" for="estPyeong">평형 <small>공급 면적 · 비우면 바닥 면적</small></label><div class="field-box"><input id="estPyeong" type="text" inputmode="decimal" data-adj="pyeong" value="${A.pyeong || ''}" placeholder="${pyeongOf({ pyeong: 0 }, s) || ''}" autocomplete="off"><span class="field-unit">평</span></div></div>
          </div>
          <p class="dialog-note">계산 순서: 직접공사비 → 공과잡비 → 기업이윤 → 할인 → 단수 정리 → 공급가액 → 부가세. 평당 금액은 공급가액(부가세 별도) ÷ 평형입니다.</p>
        </details>` : ''}
        <details class="est-info">
          <summary>견적서에 넣을 정보 (받는 분·우리 회사)</summary>
          <div class="field"><label class="field-label" for="estTo">받는 분 <small>이 도면</small></label><div class="field-box"><input id="estTo" type="text" data-info="to" value="${esc(App.current.estimateTo || '')}" placeholder="예: ○○건설 김대리" autocomplete="off"></div></div>
          <div class="field-grid">
            <div class="field"><label class="field-label" for="estCo">상호 <small>이 기기</small></label><div class="field-box"><input id="estCo" type="text" data-info="name" value="${esc(co.name || '')}" autocomplete="organization"></div></div>
            <div class="field"><label class="field-label" for="estOwner">대표</label><div class="field-box"><input id="estOwner" type="text" data-info="owner" value="${esc(co.owner || '')}" autocomplete="name"></div></div>
            <div class="field"><label class="field-label" for="estPhone">연락처</label><div class="field-box"><input id="estPhone" type="tel" data-info="phone" value="${esc(co.phone || '')}" autocomplete="tel"></div></div>
            <div class="field"><label class="field-label" for="estBiz">사업자번호</label><div class="field-box"><input id="estBiz" type="text" inputmode="numeric" data-info="biz" value="${esc(co.biz || '')}" autocomplete="off"></div></div>
          </div>
          <div class="field"><label class="field-label" for="estMemo">견적서 아래에 적을 말 <small>이 도면</small></label><div class="field-box"><input id="estMemo" type="text" data-info="memo" value="${esc(App.current.estimateMemo || '')}" placeholder="예: 견적 유효기간 30일, 자재 단가 변동 시 협의" autocomplete="off"></div></div>
        </details>
      </div>`;
  }

  /** 금액 칸과 합계만 다시 씀 (입력 칸은 그대로라 글자를 치는 중에도 끊기지 않음) */
  function refreshTotals(pane) {
    const ls = shown;
    const t = totals(ls);
    ls.forEach((l) => {
      const el = pane.querySelector(`[data-amt="${CSS.escape(l.key)}"]`);
      if (el) el.textContent = l.amount ? won(l.amount) : '–';
    });
    extras().forEach((x) => {
      const el = pane.querySelector(`[data-extra="${CSS.escape(x.id)}"] .est-amt`);
      if (el) el.textContent = x.amount ? won(x.amount) : '–';
    });
    const set = (id, v) => { const el = pane.querySelector(`#${id}`); if (el) el.textContent = v; };
    totalRows(t).forEach(([, v], i) => { const el = pane.querySelector(`[data-trow="${i}"]`); if (el) el.textContent = signedWon(v); });
    if (t.trade) groupsOf(ls).forEach((g) => { const el = pane.querySelector(`[data-sub="${CSS.escape(g.t)}"]`); if (el) el.textContent = `소계 ${won(g.amount)}`; });
    if (!App.modes.is('event')) set('estPy', perPyeong(t, pyeongOf(t.adj)));
    set('estSupply', won(t.supply));
    set('estVat', won(t.vat));
    set('estTotal', won(t.total));
    set('estWords', t.total ? `일금 ${hangul(t.total)}원정 (${t.vatOn ? '부가세 포함' : '부가세 별도'})` : '');
  }

  function bind(pane) {
    const digits = (input) => {
      const v = numIn(input.value);
      return Math.round(v);
    };
    pane.addEventListener('input', (e) => {
      const t = e.target;
      if (!t.closest('.est')) return;
      if (t.dataset.price != null) {
        pricesW()[t.dataset.price] = digits(t);
        delete libMarksW()[t.dataset.price];
        refreshTotals(pane);
      } else if (t.dataset.x) {
        const row = t.closest('[data-extra]');
        const x = extras().find((v) => v.id === row.dataset.extra);
        if (!x) return;
        x[t.dataset.x] = t.dataset.x === 'price' ? Math.round(numSigned(t.value)) : t.value; // 할인 줄(±)은 양수로 쳐도 빼는 금액
        refreshTotals(pane);
      }
    });
    pane.addEventListener('change', (e) => {
      const t = e.target;
      if (!t.closest('.est')) return;
      if (t.dataset.price != null) {
        const v = digits(t);
        pricesW()[t.dataset.price] = v;
        delete libMarksW()[t.dataset.price]; // 직접 친 단가
        remember(t.dataset.price, v);
        t.value = priceText(v);
        const cnt = pane.querySelector('[data-act="est-lib"] small');
        if (cnt) cnt.textContent = `${Object.keys(memory()).length}개`;
        save();
      } else if (t.dataset.x) {
        const xr = extras().find((v) => v.id === t.closest('[data-extra]').dataset.extra);
        if (t.dataset.x === 'price') t.value = signedText(xr ? extraPrice(xr) : numSigned(t.value));
        // 기타 항목도 이름·단위로 단가를 기억 (다음에 같은 항목을 넣으면 자동으로). 할인(-)은 기억하지 않음
        const x = extras().find((v) => v.id === t.closest('[data-extra]').dataset.extra);
        if (x && x.name && extraPrice(x) > 0) remember(extraKey(x), Math.round(numIn(x.price)));
        save();
      } else if (t.dataset.trade != null || t.dataset.xtrade != null) {
        // 공종 바꾸기: 처음 판정과 같으면 바꾼 기록을 지움
        if (t.dataset.trade != null) {
          const l = shown.find((v) => v.key === t.dataset.trade);
          if (!isObj(App.current.tradeOf)) App.current.tradeOf = {};
          if (l && defaultTrade(l) === t.value) delete App.current.tradeOf[l.key];
          else App.current.tradeOf[t.dataset.trade] = t.value;
        } else {
          const x = extras().find((v) => v.id === t.dataset.xtrade);
          if (x) x.trade = t.value;
        }
        save();
        App.summary.render();
      } else if (t.dataset.adj) {
        const k = t.dataset.adj;
        if (!isObj(App.current.estimateAdj)) App.current.estimateAdj = {};
        const a = App.current.estimateAdj;
        const v = k === 'round' ? Number(t.value) : parseFloat(String(t.value).replace(/,/g, '.').replace(/[^\d.]/g, ''));
        if (Number.isFinite(v) && v > 0 && (k !== 'misc' && k !== 'profit' || v < 100)) a[k] = Math.round(v * 100) / 100;
        else delete a[k];
        if (!Object.keys(a).length) delete App.current.estimateAdj;
        save();
        App.summary.render();
      } else if (t.id === 'estVatOn') {
        App.current.vat = t.checked;
        refreshTotals(pane);
        save();
      } else if (t.dataset.info) {
        const k = t.dataset.info;
        if (k === 'to') App.current.estimateTo = t.value.trim();
        else if (k === 'memo') App.current.estimateMemo = t.value.trim();
        else {
          const co = company();
          co[k] = t.value.trim();
          App.storage.write(KEY_COMPANY, co);
        }
        save();
      }
    });
    pane.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.closest && e.target.closest('.est') && e.target.tagName === 'INPUT') e.target.blur();
    });
    pane.addEventListener('click', (e) => {
      const st = e.target.closest('[data-est-style]');
      if (st && st.closest('.est')) {
        const v = st.dataset.estStyle === 'trade' ? 'trade' : null;
        if ((App.current.estimateStyle || null) !== v) {
          if (v) App.current.estimateStyle = v;
          else delete App.current.estimateStyle;
          save();
          App.summary.render();
        }
        return;
      }
      const b = e.target.closest('[data-act]');
      if (!b || !b.closest('.est')) return;
      if (b.dataset.act === 'est-add') {
        const id = `x${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
        const nx = { id, name: b.dataset.name || '', qty: 1, unit: b.dataset.unit || '식', price: 0 };
        if (nx.name === '할인') nx.neg = true; // 숫자만 쳐도 빼는 금액 (아이폰 숫자 자판에는 ‘-’가 없음)
        else nx.price = nx.name ? memory()[extraKey(nx)] || 0 : 0;
        extrasW().push(nx);
        save();
        App.summary.render();
        const input = pane.querySelector(`[data-extra="${id}"] [data-x="${b.dataset.name ? 'price' : 'name'}"]`);
        if (input) input.focus();
      } else if (b.dataset.act === 'est-sign') {
        const x = extras().find((v) => v.id === b.closest('[data-extra]').dataset.extra);
        if (!x) return;
        const neg = isNeg(x);
        x.price = Math.abs(numSigned(x.price));
        x.neg = !neg;
        save();
        App.summary.render();
      } else if (b.dataset.act === 'est-lib') {
        openLibrary();
      } else if (b.dataset.act === 'est-apply') {
        const m = memory();
        let n = 0;
        shown.forEach((l) => { if (typeof m[l.key] === 'number' && (prices()[l.key] !== m[l.key] || !libMarks()[l.key])) { if (prices()[l.key] !== m[l.key]) n++; delete pricesW()[l.key]; delete libMarksW()[l.key]; } });
        extras().forEach((x) => { const v = m[extraKey(x)]; if (x.name && typeof v === 'number' && extraPrice(x) >= 0 && numIn(x.price) !== v) { x.price = v; n++; } });
        save();
        App.summary.render();
        App.ui.toast(n ? `${n}줄을 단가표 단가로 채웠습니다.` : '단가표와 다른 단가가 없습니다.');
      } else if (b.dataset.act === 'est-del') {
        const id = b.closest('[data-extra]').dataset.extra;
        App.current.costExtras = extras().filter((x) => x.id !== id);
        save();
        App.summary.render();
      }
    });
  }

  const extraKey = (x) => `기타|${String(x.name).trim()}||${String(x.unit || '').trim()}`;
  /** 다른 화면이 만든 기타 항목을 한꺼번에 넣음 (공정표 인건비 등): 같은 출처(src)로 넣었던 줄은 바꿔 넣고,
      같은 이름 줄에 넣어 둔 단가는 이어받음 (없으면 단가표에 기억된 단가) */
  function putExtras(src, list) {
    const xs = extrasW();
    const kept = new Map(xs.filter((x) => x.src === src).map((x) => [x.name, x]));
    for (let i = xs.length - 1; i >= 0; i--) if (xs[i].src === src) xs.splice(i, 1);
    const stamp = Date.now().toString(36);
    list.forEach((l, k) => {
      const old = kept.get(l.name);
      const nx = { id: `x${stamp}${k}`, name: l.name, qty: l.qty, unit: l.unit || '식', price: 0, src, ...(l.trade ? { trade: l.trade } : {}) };
      nx.price = old ? old.price : memory()[extraKey(nx)] || 0;
      xs.push(nx);
    });
    save();
    if (App.summary && App.summary.view === 'cost') App.summary.render();
    return list.length;
  }

  /* ── 단가표: 이 기기에 기억된 단가 모음. 고치기·지우기·CSV로 내보내기/불러오기 (다른 폰·PC와 같은 단가표 쓰기) ── */
  const splitKey = (k) => { const [sec = '', name = '', spec = '', unit = ''] = String(k).split('|'); return { sec, name, spec, unit }; };
  /** CSV 한 줄씩 → 칸 배열 (따옴표·쉼표·줄바꿈 처리) */
  function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    const t = String(text).replace(/^\ufeff/, '');
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) {
        if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
        if (c === '\r' && t[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((v) => String(v).trim()));
  }
  function libraryCsv() {
    const m = memory();
    const rows = [['구분', '품명', '규격', '단위', '단가']];
    Object.keys(m).sort().forEach((k) => { const p = splitKey(k); rows.push([p.sec, p.name, p.spec, p.unit, m[k]]); });
    return App.exporter.csvText(rows);
  }
  /** CSV 글을 단가표에 합침. 돌려주는 값: 넣은 줄 수 */
  /** 파일 글자: UTF-8이 아니면 엑셀이 저장하는 한글 윈도 인코딩(CP949)으로 */
  function decodeText(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (_) { /* UTF-8 아님 */ }
    try { return new TextDecoder('euc-kr').decode(bytes); } catch (_) { return new TextDecoder().decode(bytes); }
  }
  /** CSV 줄을 단가표에 넣음. 넣은 개수를 돌려주고, 글자가 깨진 줄 수는 importLibrary.skipped */
  function importLibrary(text) {
    const rows = parseCsv(text);
    if (rows.length && /구분/.test(rows[0][0]) && /단가/.test(rows[0].join(','))) rows.shift();
    const m = memory();
    let n = 0, bad = 0;
    rows.forEach((r) => {
      const [sec, name, spec, unit, price] = r.map((v) => String(v == null ? '' : v).trim());
      if (/\uFFFD/.test(`${sec}${name}${spec}${unit}`)) { bad++; return; }
      const v = numIn(price);
      if (!sec || !name || !(v > 0)) return;
      m[renamedKey(`${sec}|${name}|${spec}|${unit}`)] = Math.round(v);
      n++;
    });
    importLibrary.skipped = bad;
    App.storage.write(KEY_MEMORY, m);
    return n;
  }
  function openLibrary() {
    const row = (k, v) => {
      const p = splitKey(k);
      return `<div class="lib-row" data-key="${esc(k)}" data-find="${esc(`${p.sec} ${p.name} ${p.spec}`.replace(/\s/g, ''))}">
        <div class="lib-name"><b>${esc(p.name)}</b>${p.spec ? ` <span>${esc(p.spec)}</span>` : ''}<small>${esc(p.sec)}${p.unit ? ` · ${esc(p.unit)}당` : ''}</small></div>
        <label class="est-price"><input type="text" inputmode="numeric" data-lib="${esc(k)}" value="${priceText(v)}" aria-label="${esc(p.name)} 단가" autocomplete="off"><span>원</span></label>
        <button type="button" class="btn est-del" data-libdel="${esc(k)}" aria-label="지우기" title="단가표에서 지우기">×</button>
      </div>`;
    };
    const listHtml = () => {
      const m = memory(), keys = Object.keys(m).sort((a, b) => a.localeCompare(b, 'ko'));
      return keys.length ? keys.map((k) => row(k, m[k])).join('') : '<p class="props-meta lib-empty">아직 기억된 단가가 없습니다. 견적에서 단가를 넣거나, 아래 ‘CSV 불러오기’로 회사 단가표를 넣으세요.</p>';
    };
    App.ui.dialog({
      title: '단가표',
      html: `<p class="props-meta">견적에 넣은 단가가 여기에 모입니다 (이 기기). 고치면 다음 견적부터 이 단가가 들어갑니다. CSV로 내보내 다른 폰·PC에서 불러오면 같은 단가표를 씁니다.</p>
        <div class="field-box picker-search"><input id="libSearch" type="search" placeholder="찾기 (예: 석고보드, 텐트)" autocomplete="off"></div>
        <div class="lib-list" id="libList">${listHtml()}</div>
        <div class="btn-row lib-actions">
          <button type="button" class="btn" id="libExport">CSV로 내보내기</button>
          <button type="button" class="btn" id="libImport">CSV 불러오기</button>
        </div>`,
      actions: [{ id: 'close', label: '닫기', primary: true }],
      onOpen(body) {
        body.dataset.keys = 'local';
        const list = body.querySelector('#libList');
        body.addEventListener('change', (e) => {
          const t = e.target;
          if (!t.dataset.lib) return;
          const v = Math.round(numIn(t.value));
          remember(t.dataset.lib, v);
          t.value = priceText(v);
        });
        body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.lib) e.target.blur(); });
        body.addEventListener('click', (e) => {
          const del = e.target.closest('[data-libdel]');
          if (del) { remember(del.dataset.libdel, 0); del.closest('.lib-row').remove(); }
        });
        body.querySelector('#libSearch').addEventListener('input', (e) => {
          const q = e.target.value.replace(/\s/g, '');
          list.querySelectorAll('.lib-row').forEach((r) => { r.hidden = !!q && !r.dataset.find.includes(q); });
        });
        body.querySelector('#libExport').addEventListener('click', () => {
          if (!Object.keys(memory()).length) { App.ui.toast('내보낼 단가가 없습니다.'); return; }
          const name = `단가표_${App.exporter.stamp()}.csv`;
          App.exporter.saved(App.exporter.download(name, libraryCsv(), 'text/csv;charset=utf-8'), `‘${name}’을 저장했습니다. 다른 기기에서 ‘CSV 불러오기’로 넣으세요.`);
        });
        body.querySelector('#libImport').addEventListener('click', () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.csv,text/csv,text/plain';
          input.onchange = async () => {
            const f = input.files && input.files[0];
            if (!f) return;
            const n = importLibrary(decodeText(new Uint8Array(await f.arrayBuffer())));
            const bad = importLibrary.skipped;
            list.innerHTML = listHtml();
            App.ui.toast(n ? `단가 ${n}개를 단가표에 넣었습니다.${bad ? ` 글자가 깨진 ${bad}줄은 뺐습니다.` : ''}` : bad ? `글자가 깨져 넣지 못했습니다 (${bad}줄). 엑셀에서 ‘CSV UTF-8’로 저장해 보세요.` : '넣을 단가가 없습니다. 구분·품명·규격·단위·단가 순서의 CSV인지 확인하세요.');
          };
          input.click();
        });
      },
    }).then(() => App.summary.render());
  }

  /* ── CSV ── */
  function csvRows() {
    const ls = lines();
    const t = totals(ls);
    // 공종별일 때는 맨 앞에 ‘공종’ 칸과 공종마다 소계 줄. 항목별·처음 값이면 전과 같은 모양
    const pad = t.trade ? [''] : [];
    const rows = [[...(t.trade ? ['공종'] : []), '구분', '품명', '규격', '수량', '단위', '단가', '금액', '비고']];
    const lineRow = (l, g) => [...(t.trade ? [g] : []), l.sec, l.name, l.spec, l.qty, l.unit, l.price || '', l.amount || '', l.note];
    const extraRow = (x, g) => [...(t.trade ? [g] : []), '기타', x.name, '', numIn(x.qty), x.unit, extraPrice(x) || '', x.amount || '', ''];
    if (t.trade) {
      groupsOf(ls).forEach((g) => {
        g.rows.forEach((l) => rows.push(lineRow(l, g.t)));
        g.xs.filter((x) => x.name || x.amount).forEach((x) => rows.push(extraRow(x, g.t)));
        rows.push([g.t, '', `${g.t} 소계`, '', '', '', '', g.amount, '']);
      });
    } else {
      ls.forEach((l) => rows.push(lineRow(l)));
      extras().filter((x) => (x.name || x.amount) && !(t.detailed && isNeg(x))).forEach((x) => rows.push(extraRow(x)));
    }
    rows.push([]);
    totalRows(t).forEach(([k, v]) => rows.push([...pad, '', k, '', '', '', '', v, '']));
    rows.push([...pad, '', '공급가액', '', '', '', '', t.supply, '']);
    rows.push([...pad, '', t.vatOn ? '부가세 10%' : '부가세 (별도)', '', '', '', '', t.vat, '']);
    rows.push([...pad, '', '합계', '', '', '', '', t.total, t.total ? `일금 ${hangul(t.total)}원정` : '']);
    const py = t.detailed && !App.modes.is('event') ? perPyeong(t, pyeongOf(t.adj)) : '';
    if (py) rows.push([...pad, '', py, '', '', '', '', '', '']);
    return rows;
  }
  /** 견적서를 내보낸 뒤 알림: 숨긴 레이어가 빠졌거나 경계가 틀린 방이 있으면 */
  function warnLater() {
    const s = App.summary.compute();
    const msg = [];
    if (s.excluded.length) msg.push(`숨긴 레이어(${s.excluded.join(', ')})는 빠졌습니다`);
    if (s.arch.issues) msg.push(`경계 확인이 필요한 방이 ${s.arch.issues}개 있어 물량이 다를 수 있습니다`);
    if (msg.length) setTimeout(() => App.ui.toast(`주의: ${msg.join(' · ')}.`, 6500), 2500);
  }
  function exportCsv() {
    const rows = csvRows();
    warnLater();
    const name = `견적_${safeName(projectName())}_${App.exporter.stamp()}.csv`;
    App.exporter.saved(App.exporter.download(name, App.exporter.csvText(rows), 'text/csv;charset=utf-8'), `‘${name}’을 저장했습니다. 엑셀에서 바로 열 수 있습니다.`);
    return true;
  }

  /* ── 견적서 PDF: A4 세로, 200dpi 그림으로 그려 쪽마다 JPEG ── */
  const projectName = () => (App.projects && App.projects.current ? App.projects.current.name : '도면');
  const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || '도면';
  const FONT = () => getComputedStyle(document.documentElement).getPropertyValue('--font-ui') || 'sans-serif';

  function pages() {
    const ls = lines();
    const t = totals(ls);
    // 단가를 하나라도 넣었으면 단가 있는 줄만, 하나도 없으면 물량 내역서처럼 모든 줄 (손으로 적게)
    const pick = t.priced ? ls.filter((l) => l.price > 0) : ls;
    const items = [];
    if (t.trade) {
      // 공종별: 공종 머리줄 → 줄들(그 공종으로 묶인 기타 항목 포함) → ‘○○ 소계’. 1쪽은 총괄표 (layout)
      const groups = groupsOf(ls);
      groups.forEach((g) => {
        const rows = g.rows.filter((l) => pick.includes(l));
        const xs = g.xs.filter((x) => x.name || x.amount);
        if (!rows.length && !xs.length) return;
        items.push({ head: g.t });
        rows.forEach((l) => items.push(l));
        xs.forEach((x) => items.push({ name: x.name || '기타', spec: '', qty: numIn(x.qty), unit: x.unit, price: extraPrice(x), amount: x.amount, note: '' }));
        items.push({ sub: `${g.t} 소계`, amount: g.amount });
      });
      if (items.length) items.push({ sub: '직접공사비 합계', amount: t.direct, grand: true });
      return { items, t, groups, trade: true };
    }
    let sec = null;
    pick.forEach((l) => {
      if (l.sec !== sec) { items.push({ head: l.sec }); sec = l.sec; }
      items.push(l);
    });
    // 직접공사비부터 나눠 보일 때(공과잡비·이윤·단수 정리)는 할인 줄을 합계 칸에서 셈
    const ex = extras().filter((x) => (x.name || x.amount) && !(t.detailed && isNeg(x)));
    if (ex.length) {
      items.push({ head: '기타' });
      ex.forEach((x) => items.push({ name: x.name || '기타', spec: '', qty: numIn(x.qty), unit: x.unit, price: extraPrice(x), amount: x.amount, note: '' }));
    }
    return { items, t };
  }

  function drawPage(ctx, W, H, o) {
    const f = FONT();
    const M = 120, x0 = M, x1 = W - M, ink = '#111827', mute = '#4b5563', line = '#9ca3af';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'middle';
    const text = (s, x, y, size, weight = 400, color = ink, align = 'left', maxW = 0) => {
      ctx.font = `${weight} ${size}px ${f}`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      let v = String(s == null ? '' : s);
      if (maxW) while (v.length > 1 && ctx.measureText(v).width > maxW) v = `${v.slice(0, -2)}…`;
      ctx.fillText(v, x, y);
    };
    const hline = (y, color = line, w = 2) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); };
    let y = M;
    if (o.first) {
      text('견   적   서', W / 2, y + 40, 76, 800, ink, 'center');
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      [y + 92, y + 100].forEach((ly) => { ctx.beginPath(); ctx.moveTo(W / 2 - 300, ly); ctx.lineTo(W / 2 + 300, ly); ctx.stroke(); });
      y += 160;
      const event = App.modes.is('event');
      const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
      const lw = (x1 - x0) * 0.52;
      text(`${event ? '행사명' : '공사명'} : ${projectName()}`, x0, y + 20, 34, 700, ink, 'left', lw);
      text(`견적일 : ${date}`, x0, y + 78, 30, 400, mute);
      text(`${App.current.estimateTo ? `${App.current.estimateTo} 귀하` : '귀하'}`, x0, y + 136, 34, 700, ink, 'left', lw);
      text('아래와 같이 견적합니다.', x0, y + 194, 28, 400, mute);
      // 공급자 칸
      const co = company(), bx = x0 + lw + 30, bw = x1 - bx, rows = [['상호', co.name], ['대표', co.owner], ['연락처', co.phone], ['사업자번호', co.biz]];
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, y - 10, bw, 236);
      rows.forEach(([k, v], i) => {
        const ry = y - 10 + i * 59;
        if (i) { ctx.strokeStyle = line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx, ry); ctx.lineTo(bx + bw, ry); ctx.stroke(); }
        text(k, bx + 18, ry + 30, 26, 700, mute);
        text(v || '', bx + 190, ry + 30, 28, 400, ink, 'left', bw - 210);
      });
      y += 270;
      // 합계 금액
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(x0, y, x1 - x0, 96);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      ctx.strokeRect(x0, y, x1 - x0, 96);
      text('합계 금액', x0 + 30, y + 48, 32, 800);
      text(o.t.total ? `일금 ${hangul(o.t.total)}원정` : '일금 원정', x0 + 230, y + 48, 32, 700, ink, 'left', (x1 - x0) * 0.5);
      text(`(₩${o.t.total.toLocaleString('ko-KR')}${o.t.vatOn ? ', 부가세 포함' : ', 부가세 별도'})`, x1 - 30, y + 48, 28, 600, ink, 'right');
      y += 130;
    } else {
      text(`${projectName()} · ${o.detail ? '견적 내역서 (공종별)' : '견적서 (이어서)'}`, x0, y + 20, 30, 700);
      y += 70;
    }
    const RH = 50;
    /** 합계 칸: (직접공사비·공과잡비·기업이윤·할인·단수 정리) → 공급가액 → 부가세 → 합계. 앞의 나눔 줄은 공종별·조정이 있을 때만 */
    const totalsBlock = (yy, labelX) => {
      const pre = totalRows(o.t);
      const rows = [...pre, ['공급가액', o.t.supply], [o.t.vatOn ? '부가세 (10%)' : '부가세 (별도)', o.t.vat], ['합계', o.t.total]];
      rows.forEach(([k, v], i) => {
        const strong = i === rows.length - 1, sub = i < pre.length;
        if (strong) { ctx.fillStyle = '#f3f4f6'; ctx.fillRect(x0, yy, x1 - x0, RH + 6); }
        text(k, labelX, yy + (RH + (strong ? 6 : 0)) / 2, strong ? 30 : 26, sub ? 600 : 800, sub ? mute : ink, 'right');
        text(`${v.toLocaleString('ko-KR')}원`, x1 - 12, yy + (RH + (strong ? 6 : 0)) / 2, strong ? 32 : 27, sub ? 600 : 800, ink, 'right');
        yy += RH + (strong ? 6 : 0);
        hline(yy, strong ? ink : '#d1d5db', strong ? 3 : 1.2);
      });
      return yy;
    };
    /** 합계 아래: 평당 금액(공종별·조정이 있을 때) → 견적서 아래에 적을 말 */
    const tailNotes = (yy) => {
      const py = o.t.detailed && !App.modes.is('event') ? perPyeong(o.t, pyeongOf(o.t.adj)) : '';
      if (py) { text(py, x1 - 12, yy + 40, 24, 600, mute, 'right'); yy += 40; }
      if (App.current.estimateMemo) text(`※ ${App.current.estimateMemo}`, x0, yy + 50, 26, 400, mute, 'left', x1 - x0);
      return yy;
    };
    if (o.summary) {
      // 공종별 총괄표 (1쪽): 공종 · 금액 · 비율 · 항목 수 → 합계 칸
      const cols2 = [['번호', 0.08, 'center'], ['공종', 0.3, 'left'], ['금액', 0.26, 'right'], ['비율', 0.12, 'right'], ['비고', 0.24, 'left']];
      const tw2 = x1 - x0, cx2 = [];
      let acc2 = x0;
      cols2.forEach(([, k]) => { cx2.push(acc2); acc2 += k * tw2; });
      text('공종별 총괄표', x0, y + 18, 30, 800, '#c2410c');
      y += 48;
      const top2 = y;
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(x0, y, tw2, RH);
      hline(y, ink, 3);
      const at = (i, al, k) => (al === 'center' ? cx2[i] + (k * tw2) / 2 : al === 'right' ? cx2[i] + k * tw2 - 12 : cx2[i] + 12);
      cols2.forEach(([n, k, al], i) => text(n, at(i, al, k), y + RH / 2, 26, 700, ink, al));
      y += RH;
      hline(y, ink, 2);
      const base = o.groups.reduce((n, g) => n + g.amount, 0);
      o.groups.forEach((g, i) => {
        const cells = [String(i + 1), g.t === '기타' ? '기타' : `${g.t} 공사`, g.amount ? g.amount.toLocaleString('ko-KR') : '', base > 0 ? `${((g.amount / base) * 100).toFixed(1)}%` : '', `${g.rows.length + g.xs.length}개 항목`];
        cells.forEach((v, c) => { const [, k, al] = cols2[c]; text(v, at(c, al, k), y + RH / 2, c === 4 ? 21 : 25, c === 2 ? 700 : 400, c === 4 ? mute : ink, al, k * tw2 - 24); });
        y += RH;
        hline(y, '#d1d5db', 1.2);
      });
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 1.2;
      cx2.slice(1).forEach((x) => { ctx.beginPath(); ctx.moveTo(x, top2); ctx.lineTo(x, y); ctx.stroke(); });
      hline(y, ink, 2);
      y = totalsBlock(y, cx2[2] - 12);
      y = tailNotes(y);
      text('※ 공종별 세부 내역은 다음 쪽 내역서에 있습니다.', x0, y + 100, 22, 400, mute);
      text(`${o.page} / ${o.pages}`, W / 2, H - 70, 24, 400, mute, 'center');
      text(o.footer || '현장도면으로 만든 견적서', x1, H - 70, 20, 400, '#9ca3af', 'right');
      return;
    }
    // 표 머리
    const cols = [['번호', 0.06, 'center'], ['품명', 0.24, 'left'], ['규격', 0.18, 'left'], ['수량', 0.09, 'right'], ['단위', 0.07, 'center'], ['단가', 0.12, 'right'], ['금액', 0.14, 'right'], ['비고', 0.10, 'left']];
    const tw = x1 - x0, cx = [];
    let acc = x0;
    cols.forEach(([, k]) => { cx.push(acc); acc += k * tw; });
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(x0, y, tw, RH);
    hline(y, ink, 3);
    cols.forEach(([n, k, al], i) => text(n, al === 'center' ? cx[i] + (k * tw) / 2 : al === 'right' ? cx[i] + k * tw - 12 : cx[i] + 12, y + RH / 2, 26, 700, ink, al));
    y += RH;
    hline(y, ink, 2);
    o.rows.forEach((r) => {
      if (r.head) {
        ctx.fillStyle = '#f9fafb';
        ctx.fillRect(x0, y, tw, RH);
        text(r.head, x0 + 12, y + RH / 2, 25, 700, '#c2410c');
      } else if (r.sub) {
        // 공종 소계 (공종별 내역서)
        ctx.fillStyle = r.grand ? '#f3f4f6' : '#fff7ed';
        ctx.fillRect(x0, y, tw, RH);
        text(r.sub, cx[5] - 12, y + RH / 2, 25, 800, ink, 'right');
        text(r.amount.toLocaleString('ko-KR'), cx[6] + cols[6][1] * tw - 12, y + RH / 2, 25, 800, ink, 'right');
      } else {
        const cells = [String(r.no), r.name, r.spec, qtyText(r.qty), r.unit, r.price ? r.price.toLocaleString('ko-KR') : '', r.amount ? r.amount.toLocaleString('ko-KR') : '', r.note || ''];
        cells.forEach((v, i) => {
          const [, k, al] = cols[i];
          const pad = 12;
          text(v, al === 'center' ? cx[i] + (k * tw) / 2 : al === 'right' ? cx[i] + k * tw - pad : cx[i] + pad, y + RH / 2, i === 7 ? 20 : 25, i === 6 ? 700 : 400, i === 7 ? mute : ink, al, k * tw - pad * 2);
        });
      }
      y += RH;
      hline(y, '#d1d5db', 1.2);
    });
    // 세로 칸 줄
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1.2;
    cx.slice(1).forEach((x) => { ctx.beginPath(); ctx.moveTo(x, o.tableTop); ctx.lineTo(x, y); ctx.stroke(); });
    if (o.last) {
      hline(y, ink, 2);
      y = totalsBlock(y, cx[5] - 12);
      tailNotes(y);
    }
    text(`${o.page} / ${o.pages}`, W / 2, H - 70, 24, 400, mute, 'center');
    text(o.footer || '현장도면으로 만든 견적서', x1, H - 70, 20, 400, '#9ca3af', 'right');
  }

  const A4 = { DPI: 200, mmW: 210, mmH: 297 };
  /** 견적서 쪽 나누기. 넣을 항목이 없으면 null, 있으면 { W, H, count, t, draw(ctx, k, o) }.
      o: { page, pages, footer } — 제안서에 끼울 때 쪽 번호·바닥글을 바꿈 */
  function layout() {
    const P = pages();
    const { items, t } = P;
    if (!items.length) return null;
    const W = Math.round((A4.mmW / 25.4) * A4.DPI), H = Math.round((A4.mmH / 25.4) * A4.DPI);
    // 쪽 나누기: 첫 쪽은 머리글 때문에 줄이 적음, 마지막 쪽은 합계 줄 자리
    const RH = 50, firstRows = Math.floor((H - 120 - 560 - 50 - 200) / RH), nextRows = Math.floor((H - 120 - 70 - 50 - 200) / RH);
    let no = 0;
    const numbered = items.map((r) => (r.head || r.sub ? r : { ...r, no: ++no }));
    if (P.trade) {
      // 공종별: 1쪽 총괄표(합계 칸 포함), 2쪽부터 내역서 (공종 소계·직접공사비 합계)
      const parts = [];
      for (let k = 0; k < numbered.length; k += nextRows) parts.push(numbered.slice(k, k + nextRows));
      const count = parts.length + 1;
      return {
        W, H, count, t,
        draw(ctx, k, o = {}) {
          const page = o.page || k + 1, total = o.pages || count;
          if (k === 0) drawPage(ctx, W, H, { rows: [], t, first: true, summary: true, groups: P.groups, page, pages: total, footer: o.footer });
          else drawPage(ctx, W, H, { rows: parts[k - 1], t, first: false, detail: true, last: false, page, pages: total, tableTop: 120 + 70, footer: o.footer });
        },
      };
    }
    const chunks = [];
    let i = 0;
    while (i < numbered.length || !chunks.length) {
      const cap = chunks.length ? nextRows : firstRows;
      chunks.push(numbered.slice(i, i + cap));
      i += cap;
    }
    const last = chunks[chunks.length - 1];
    // 합계 줄이 들어갈 자리 (공급가액·부가세·합계·메모 4줄 + 직접공사비·공과잡비 등 나눔 줄 + 평당 금액)
    const reserve = 4 + totalRows(t).length + (t.detailed ? 1 : 0);
    if (last.length > (chunks.length > 1 ? nextRows : firstRows) - reserve) chunks.push([]);
    return {
      W, H, count: chunks.length, t,
      draw(ctx, k, o = {}) {
        const first = k === 0;
        const tableTop = first ? 120 + 160 + 270 + 130 : 120 + 70;
        drawPage(ctx, W, H, { rows: chunks[k], t, first, last: k === chunks.length - 1, page: o.page || k + 1, pages: o.pages || chunks.length, tableTop, footer: o.footer });
      },
    };
  }

  function exportPdf() {
    const L = layout();
    if (!L) {
      App.ui.toast('견적서에 넣을 항목이 없습니다. 도면을 그리거나 기타 항목을 넣으세요.');
      return false;
    }
    warnLater();
    const canvas = document.createElement('canvas');
    canvas.width = L.W;
    canvas.height = L.H;
    const ctx = canvas.getContext('2d');
    const jpegs = [];
    for (let k = 0; k < L.count; k++) {
      L.draw(ctx, k);
      jpegs.push(App.exporter.jpegBytes(canvas, 0.9));
    }
    const blob = App.exporter.pdfFromPages(jpegs.map((jpeg) => ({ jpeg, w: L.W, h: L.H })), (A4.mmW / 25.4) * 72, (A4.mmH / 25.4) * 72);
    const name = `견적서_${safeName(projectName())}_${App.exporter.stamp()}.pdf`;
    App.exporter.saved(App.exporter.download(name, blob, 'application/pdf'), `‘${name}’을 저장했습니다 (${L.count}쪽).`);
    return true;
  }

  App.estimate = { lines, totals, html, bind, refreshTotals, csvRows, exportCsv, exportPdf, layout, company, putExtras, extras, TRADES, taskTrade, tradeOf, extraTrade, groupsOf, adj, saveCompany: (co) => App.storage.write(KEY_COMPANY, co), warnLater, hangul, priceOf, priceSource, memory, EXTRA_PRESETS, openLibrary, libraryCsv, importLibrary, parseCsv };
})();
