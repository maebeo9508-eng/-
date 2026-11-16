/* 행사장 자동 배치 (조감도 모드): 행사 종류·부지 크기·예상 인원을 넣으면 무대·객석·부스·편의 시설·동선·펜스를 한 번에 놓음.
   새 도면을 만들 때 씀 (파일 → 새 도면 → 자동 배치). ‘야외 콘서트 예시’도 이것으로 만듦.
   좌석 채우기(seating)·부스 번호(booths)·둘레 두르기(fences)·주차 칸(parking)·안전 점검(safety)의 도구를 그대로 씀.
   자리: 무대가 위쪽, 입구가 아래쪽 가운데, 비상구는 양옆 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const TYPES = [
    { id: 'concert', name: '콘서트·공연', desc: '무대와 객석 (스탠딩 또는 좌석)', trucks: 2, booths: 0 },
    { id: 'festival', name: '축제', desc: '무대 + 관람 구역 + 부스 거리', trucks: 3, booths: 12 },
    { id: 'market', name: '플리마켓·장터', desc: '마주 보는 부스 줄과 휴게 공간', trucks: 3, booths: 30 },
    { id: 'ceremony', name: '기념식·개막식', desc: '무대와 좌석, 접수대', trucks: 0, booths: 0 },
  ];
  const SURFACE = { grass: ['잔디', '#2f9e44'], paver: ['보도블록', '#b98f73'], asphalt: ['아스팔트', '#5b5f66'] };
  const LIMIT = { n: [50, 30000], w: [25, 300], d: [25, 300], booths: [0, 300], trucks: [0, 12], parking: [0, 500] };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const typeOf = (id) => TYPES.find((t) => t.id === id) || TYPES[0];
  const r5 = (m) => Math.round(m / 5) * 5;
  const n0 = (v) => Math.round(v).toLocaleString('ko-KR');
  const SEATW = 500, ROWGAP = 900, AISLE = 1200; // 좌석 채우기(seating)의 기본값과 같음: 의자 폭·줄 간격·통로 폭

  /** 자리 셈 (그리지 않음): 무대·관람 자리·부스 줄·비상구·아래 띠의 좌표와 들어가는 좌석·부스·푸드트럭 수.
      권장 부지 크기(suggest)와 실제 배치(build)가 같은 셈을 씀. o: { type, n, w, d(mm), booths, trucks, seating } */
  function layout(o) {
    const W = o.w, D = o.d, N = o.n, cx = W / 2, m = 2000; // m: 펜스 안쪽 여백
    const market = o.type === 'market', ceremony = o.type === 'ceremony', festival = o.type === 'festival';
    const eg = clamp(N > 8000 ? 10000 : N > 3000 ? 8000 : 6000, 4000, W - 12000); // 입구 폭 (아래 가운데)
    const band = clamp(D * 0.22, 6500, 13000), yb = D - m, bandTop = yb - band;    // 아래쪽 편의 시설 띠 (화장실·안내·의무실·푸드트럭)
    // 비상구: 입구 + 양옆. 모두 나가는 데 6분쯤 걸리게 (출구 1m에 1분 80명). 양옆 하나씩으로 모자라면 둘씩
    const needW = (N / (80 * 6)) * 1000;
    const sgMax = clamp(Math.floor((D * 0.3) / 500) * 500, 4000, 12000);
    const sgFor = (pairs) => clamp(Math.ceil((needW - eg) / (2 * pairs) / 500) * 500, 4000, sgMax);
    const wantPairs = (needW - eg) / 2 > sgMax ? 2 : 1;
    // 부스 자리: 가운데 큰길(입구 폭)을 비우고 3.2m 간격, 가운데에서 가까운 순
    const slots = (x0, x1) => {
      const xs = [];
      for (let x = cx - eg / 2 - 1700; x - 1500 >= x0; x -= 3200) xs.push(x);
      for (let x = cx + eg / 2 + 1700; x + 1500 <= x1; x += 3200) xs.push(x);
      return xs.sort((a, b) => Math.abs(a - cx) - Math.abs(b - cx));
    };
    // 마주 보는 부스 줄 묶음: [앞이 아래] 길 [앞이 위], 다음 묶음은 등을 맞대고 1.5m 띄움
    const rowPairs = (y0, aisle) => {
      const rows = [], aisles = [];
      for (let y = y0; y + 1500 <= bandTop; y += aisle + 7500) {
        rows.push({ y, rot: 0 });
        if (y + 3000 + aisle + 1500 <= bandTop) { rows.push({ y: y + 3000 + aisle, rot: 180 }); aisles.push(y + 1500 + aisle / 2); }
      }
      return { rows, aisles };
    };
    // 부스를 줄에 고르게 나눔 (8칸부터는 마주 보는 두 줄로)
    const share = (rows, xs, count) => {
      const total = Math.min(count, rows.length * xs.length);
      if (!total) return [];
      const used = Math.min(rows.length, Math.max(Math.ceil(total / xs.length), rows.length >= 2 && total >= 8 ? 2 : 1));
      const base = Math.floor(total / used), extra = total % used;
      return rows.slice(0, used).map((r, i) => ({ ...r, count: base + (i < extra ? 1 : 0) }));
    };
    const round = (v) => Math.round(v / 100) * 100;
    const L = { W, D, N, cx, m, eg, band, yb, bandTop, market, ceremony, festival, truckSlots: [] };

    if (market) {
      /* 플리마켓: 마주 보는 부스 줄, 왼쪽 휴게 구역, 오른쪽 푸드트럭 줄. 비상구는 부스 줄 사이 길의 양 끝 */
      const rest = W >= 40000;
      const bx0 = m + (rest ? 9500 : 2500), bx1 = W - m - (o.trucks > 0 ? 6500 : 2500);
      const xs = slots(bx0, bx1);
      const plan = (pairs) => {
        const sg = sgFor(pairs), aisle = Math.max(6000, sg), rp = rowPairs(m + 4000, aisle);
        const rows = share(rp.rows, xs, o.booths);
        return { pairs, sg, aisle, rp, rows, usedAisles: rp.aisles.filter((_, k) => rows.length >= 2 * k + 2) };
      };
      let P = plan(wantPairs);
      if (P.pairs === 2 && P.usedAisles.length < 2) P = plan(1);
      const { sg, aisle, rows, usedAisles } = P;
      const closest = (list, y) => list.reduce((best, a) => (Math.abs(a - y) < Math.abs(best - y) ? a : best), list[0]);
      let eys;
      if (P.pairs === 2) {
        const a = closest(usedAisles, D / 3), b = closest(usedAisles.filter((v) => v !== a), (D * 2) / 3);
        eys = [a, b].sort((p, q) => p - q);
      } else if (usedAisles.length) eys = [closest(usedAisles, D / 2)];
      else if (rows.length) eys = [Math.min(bandTop - sg / 2 - 500, rows[0].y + 1500 + aisle / 2)]; // 한 줄뿐: 그 줄 앞 길
      else eys = [clamp(D / 2, m + 6000, bandTop - sg / 2 - 500)];
      const firstAisle = usedAisles.length ? usedAisles[0] : rows.length ? eys[0] : D * 0.4;
      // 푸드트럭: 오른쪽 가장자리에 세로로 (판매 창이 장터 쪽), 비상구 앞은 비움
      for (let y = m + 5500; y + 3000 <= bandTop;) {
        const e = eys.find((v) => Math.abs(y - v) < sg / 2 + 3600);
        if (e != null) { y = e + sg / 2 + 3600; continue; }
        L.truckSlots.push({ x: W - m - 1600, y, rot: 90 });
        y += 7000;
      }
      // 휴게 구역의 피크닉 테이블 (비상 대피 길은 비움)
      const tables = [];
      if (rest) for (let y = m + 5000; y + 1500 <= bandTop - 1000 && tables.length < 10; y += 3600) if (!eys.some((e) => Math.abs(y - e) < sg / 2 + 2000)) tables.push({ x: m + 4250, y });
      Object.assign(L, {
        sg, pairs: P.pairs, eys: eys.map(round), rest, bx0, bx1, xs, rows, aisle, firstAisle: round(firstAisle), tables,
        boothCap: P.rp.rows.length * xs.length, exitFrom: [cx - eg / 2 - 1000, cx + eg / 2 + 1000],
        genAt: { x: W - m - 1600, y: m + 1300 }, serviceTop: bandTop,
      });
    } else {
      /* 무대 쪽 (콘서트·축제·기념식): 무대가 위, 그 앞에 관람 자리, 축제는 그 아래 부스 거리 */
      const small = D < 35000;
      const sw = clamp(Math.round((W * (ceremony ? 0.24 : 0.3)) / 600) * 600, 5400, ceremony ? 12000 : 18000);
      const sd = clamp(Math.round((D * 0.13) / 600) * 600, 3600, ceremony ? 6000 : 9000);
      const top = m + (small ? 1500 : 3000), front = top + sd; // 무대 뒤는 백스테이지
      const sidePad = Math.max(m + 4000, W * 0.1);              // 관람 자리 양옆은 대피 길
      let ax0 = sidePad, ax1 = W - sidePad;
      const ay0 = front + 1500, ayMax = bandTop - 1500;
      const seated = o.seating === 'seated', booths = festival ? o.booths : 0;
      let ay1 = ayMax, seatCap = 0, seatRows = 0, seatCols = 0, seatBlock = 12;
      const frontPad = small ? 1200 : 2000;
      if (seated) {
        // 좌석 (좌석 채우기와 같은 셈): 한 줄 0.9m, 12줄마다 가로 통로 1.2m, 의자 0.5m, 넓으면 세로 통로
        const rowsIn = (depth) => { let r = 0; while (frontPad + (r + 1) * ROWGAP + Math.floor(r / 12) * AISLE + 300 <= depth) r++; return r; };
        const colsOf = (zw) => { const inner = zw - 2000, a = inner > 28000 ? 2 : inner > 14000 ? 1 : 0; return clamp(Math.floor((inner - a * AISLE) / SEATW), 0, 200); };
        const zwMax = Math.min(ax1 - ax0, 104000), rowsMax = rowsIn(ayMax - ay0);
        seatCap = rowsMax * colsOf(zwMax);
        // 폭: 가로가 조금 긴 모양, 줄 수가 모자라면 더 넓게
        const want = Math.max(Math.ceil(Math.sqrt(N / 0.6)), rowsMax ? Math.ceil(N / rowsMax) : 1);
        let zw = Math.min(8000, zwMax);
        while (zw < zwMax && colsOf(zw) < want) zw += 500;
        zw = Math.min(zw, zwMax);
        seatCols = colsOf(zw);
        seatRows = seatCols ? Math.min(rowsMax, Math.ceil(N / seatCols)) : 0;
        seatBlock = seatRows > 12 ? Math.ceil(seatRows / Math.ceil(seatRows / 12)) : 12; // 가로 통로로 나뉘는 묶음을 고르게 (13줄이면 7+6)
        ax0 = cx - zw / 2; ax1 = cx + zw / 2;
        ay1 = Math.min(ayMax, Math.ceil((ay0 + frontPad + seatRows * ROWGAP + Math.floor(Math.max(0, seatRows - 1) / 12) * AISLE + 300) / 100) * 100);
      } else if (booths) {
        // 축제: 서 있을 넓이(1㎡에 1.8명)만큼, 적어도 6m·쓸 수 있는 깊이의 30%. 그 아래는 부스 거리
        ay1 = Math.min(ayMax, Math.max(ay0 + 6000, ay0 + (ayMax - ay0) * 0.3, ay0 + ((N / 1.8) * 1e6) / (ax1 - ax0)));
      }
      ay1 = Math.min(ayMax, Math.ceil(ay1 / 100) * 100); // 올림: 서 있을 넓이가 모자라지 않게
      const depthA = ay1 - ay0;
      const pairs = wantPairs === 2 && depthA * 0.44 >= sgFor(2) + 2000 ? 2 : 1, sg = sgFor(pairs);
      const eys = (pairs === 2 ? [ay0 + depthA * 0.28, ay0 + depthA * 0.72] : [clamp((ay0 + ay1) / 2, m + 6000, bandTop - 2000)]).map(round);
      // 부스 거리 (축제): 관람 구역 아래, 마주 보는 줄 묶음
      const rp = booths ? rowPairs(ay1 + 4000, 6000) : { rows: [], aisles: [] };
      const xs = booths ? slots(m + 2500, W - m - 2500) : [];
      const rows = share(rp.rows, xs, booths);
      const lowY = rows.length ? rows[rows.length - 1].y + 1500 : ay1; // 여기 아래로 편의 시설
      // 음향 콘솔 (콘서트): 객석 뒤 가운데
      const console_ = o.type === 'concert' && N >= 300 && band >= 9000 ? { x: cx, y: ay1 + 2200 } : null;
      // 입구 쪽 길이 시작하는 곳: 객석·부스 뒤 (콘솔이 있으면 그 뒤로 길 폭의 절반만큼 더)
      let backY = Math.max(lowY, ay1) + 5200;
      if (console_) backY = Math.max(backY, console_.y + 500 + eg / 2 + 300);
      backY = round(Math.min(backY, D - 2500));
      Object.assign(L, {
        sg, pairs, eys, small, sw, sd, top, front, ax0, ax1, ay0, ay1, ayMax, seated, frontPad, seatCap, seatRows, seatCols, seatBlock,
        standArea: seated ? 0 : ((ax1 - ax0) * (ay1 - ay0)) / 1e6, rows, xs, boothCap: rp.rows.length * xs.length, lowY, console: console_, backY,
        // 양옆 대피 길이 시작하는 곳: 객석 옆 (좌석 묶음에서 길 폭의 절반 넘게 떨어져서)
        exitFrom: [ax0 - Math.max(1500, sg / 2 - 500), ax1 + Math.max(1500, sg / 2 - 500)],
        genAt: { x: cx - sw / 2 - 3000, y: m + 1200 }, serviceTop: Math.max(lowY, ay1) + 1500,
      });
    }

    /* 아래 띠: 입구 왼쪽에 안내(접수)·포토월·분리수거함, 오른쪽에 X배너·의무실. 그 바깥으로 화장실(왼쪽)·푸드트럭(오른쪽) */
    const left = cx - eg / 2, right = cx + eg / 2;
    const desk = { x: left - 2500, y: yb - 3200 };
    const photo = ceremony && left - 8500 >= m + 300 ? { x: left - 7000, y: yb - 3200 } : null;
    let bin = { x: left - 5500 - (photo ? 5000 : 0), y: yb - 600 };
    if (bin.x - 900 < m + 300) bin = left - 6400 >= m + 300 ? { x: left - 5500, y: yb - 600 } : null;
    const medical = N >= 300 ? { x: Math.min(right + 4500, W - m - 1800), y: yb - 2100 } : null;
    const banner = ceremony ? { x: right + 1500, y: yb - 800 } : null;
    if (!market) {
      // 푸드트럭: 아래 오른쪽 (판매 창이 위쪽), 남으면 오른쪽 펜스를 따라 위로 (판매 창이 왼쪽) — 비상구 아래까지만
      const rightFrom = right + 2000 + (medical ? 6500 : 0);
      for (let x = W - m - 3500; x - 3000 >= rightFrom; x -= 7000) L.truckSlots.push({ x, y: yb - 1700, rot: 180 });
      const topLimit = Math.max(L.serviceTop, Math.max(...L.eys) + L.sg / 2 + 1500);
      const colY = medical && medical.x + 1500 > W - m - 3000 ? yb - 7000 : yb - 6500; // 좁은 부지: 의무실 텐트 위로 조금 더 띄움
      for (let y = colY; y - 3000 >= topLimit; y -= 6800) L.truckSlots.push({ x: W - m - 1600, y, rot: 90 });
    }
    // 화장실: 아래 왼쪽 구석부터 줄지어 (문이 위쪽, 줄 사이 1.8m는 줄 서는 곳)
    const tx0 = m + 700, tx1 = Math.min(desk.x - 900, bin ? bin.x - 900 : Infinity, photo ? photo.x - 1500 : Infinity) - 1500;
    const toilets = [];
    const perRow = Math.max(0, Math.floor((tx1 - tx0) / 1350)), rowsFit = Math.max(1, Math.floor((yb - Math.max(L.serviceTop, bandTop)) / 3000));
    const toiletNeed = Math.ceil(N / 100);
    for (let r = 0; r < rowsFit && toilets.length < toiletNeed; r++) for (let i = 0; i < perRow && toilets.length < toiletNeed; i++) toilets.push({ x: tx0 + 600 + i * 1350, y: yb - 700 - r * 3000 });
    return Object.assign(L, { desk, photo, bin, medical, banner, toilets, toiletNeed });
  }
  /** 이 크기에 인원·부스·푸드트럭이 다 들어가는지 */
  function fits(o) {
    const L = layout(o);
    if (L.truckSlots.length < o.trucks) return false;
    if (o.type === 'market') return L.boothCap >= o.booths && (o.w / 1000) * (o.d / 1000) >= o.n * 1.5;
    if (o.seating === 'seated') return L.seatCap >= o.n;
    return L.standArea + 0.01 >= o.n / 1.8 && L.boothCap >= (o.type === 'festival' ? o.booths : 0);
  }
  /** 종류·인원(·부스·푸드트럭 수)에 맞는 권장 부지 (m): { w, d } — 4:3, 5m 단위. 좌석·서 있을 넓이·부스·푸드트럭이 다 들어갈 때까지 키움 */
  function suggest(o = {}) {
    const t = typeOf(o.type);
    const num = (v, lim, d) => (v === '' || v == null || !Number.isFinite(Number(v)) ? d : clamp(Math.round(Number(v)), lim[0], lim[1]));
    const q = { type: t.id, n: num(o.n, LIMIT.n, 1000), booths: num(o.booths, LIMIT.booths, t.booths), trucks: num(o.trucks, LIMIT.trucks, t.trucks), seating: seatingOf(t, o.seating) };
    const dOf = (w) => clamp(r5(w * 0.75), LIMIT.d[0], LIMIT.d[1]);
    let w = 30;
    while (w < LIMIT.w[1] && !fits({ ...q, w: w * 1000, d: dOf(w) * 1000 })) w += 5;
    return { w, d: dOf(w) };
  }
  const seatingOf = (t, seating) => (t.id === 'ceremony' ? 'seated' : t.id === 'concert' && seating === 'seated' ? 'seated' : 'standing');

  /** 옵션을 다듬음 (범위·기본값). 길이는 mm */
  function normalize(o = {}) {
    const t = typeOf(o.type);
    const num = (v, [lo, hi], d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? clamp(Math.round(Number(v)), lo, hi) : d);
    const n = num(o.n, LIMIT.n, 1000), booths = num(o.booths, LIMIT.booths, t.booths), trucks = num(o.trucks, LIMIT.trucks, t.trucks);
    const seating = seatingOf(t, o.seating);
    const s = suggest({ type: t.id, n, booths, trucks, seating });
    const mm = (v, lim, d) => (Number(v) > 0 ? clamp(Math.round(Number(v) / 100) * 100, lim[0] * 1000, lim[1] * 1000) : d * 1000);
    return {
      type: t.id, n, booths, seating, trucks,
      w: mm(o.w, LIMIT.w, s.w), d: mm(o.d, LIMIT.d, s.d),
      parking: num(o.parking, LIMIT.parking, 0),
      fence: o.fence !== false, surface: SURFACE[o.surface] ? o.surface : t.id === 'market' ? 'paver' : 'grass',
      name: String(o.name || '').trim().slice(0, 40),
    };
  }

  let last = null; // 마지막으로 만든 것의 요약 (알림에 씀)

  /** 지금 도면(빈 조감도)에 배치를 만듦. 돌려주는 값: 요약 { type, seats, booths, trucks, toilets, … } */
  function build(o0) {
    const o = normalize(o0), L = layout(o);
    const doc = App.doc, T = App.model.TYPES, C = App.catalog, S = App.safety;
    const { W, D, N, cx, m, eg, sg, yb, eys } = L;
    const stats = { type: o.type, n: N, w: W, d: D, seats: 0, standing: 0, booths: 0, trucks: 0, toilets: 0, toiletNeed: L.toiletNeed, extinguishers: 0, generators: [], fences: 0, parking: 0, exits: 1 + 2 * eys.length, notes: [] };
    App.current.expected = N;
    App.current.ground = o.surface === 'grass' ? 'asphalt' : 'grass';

    const put = (kind, x, y, rotation = 0, patch = {}) => {
      const def = C.itemDef(kind);
      const it = T.item.create({ x: Math.round(x), y: Math.round(y) }, def.category, def, rotation, null);
      Object.assign(it, patch);
      if (def.resize) Object.assign(it, def.resize(it));
      doc.add(it);
      return it;
    };
    const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }].map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    const zoneOf = (x0, y0, x1, y1, name, surface, color, patch = {}) => doc.add(Object.assign(T.zone.create(rect(x0, y0, x1, y1), name, color, surface), patch));
    const route = (kind, name, pts, width) => {
      const d = App.routes.def(kind);
      return doc.add(T.route.create(pts.map(([x, y]) => ({ x: Math.round(x), y: Math.round(y) })), name, d.kind, d.color, width || d.width));
    };
    const pickSize = (list, max) => list.filter((s) => s <= max).pop() || list[0];
    const items = () => [...doc.all()].filter((e) => e.type === 'item' && !(C.itemDef(e.kind) || {}).flat);
    /** 물건의 바깥 상자 (90도 단위로 돌린 것) */
    const boxOf = (it) => { const { w, h } = T.item.dims(it), q = Math.round((it.rotation || 0) / 90) % 2 !== 0; return { x0: it.x - (q ? h : w) / 2, x1: it.x + (q ? h : w) / 2, y0: it.y - (q ? w : h) / 2, y1: it.y + (q ? w : h) / 2 }; };
    /** (x, y)에 w × d 자리가 비었는지 (다른 물건과 0.3m 넘게 떨어지고 부지 안) */
    const clearAt = (x, y, w, d) => x - w / 2 >= 400 && x + w / 2 <= W - 400 && y - d / 2 >= 400 && y + d / 2 <= D - 400
      && !items().some((it) => { const b = boxOf(it); return b.x1 > x - w / 2 - 300 && b.x0 < x + w / 2 + 300 && b.y1 > y - d / 2 - 300 && b.y0 < y + d / 2 + 300; });

    let site;
    doc.transact('자동 배치: 부지', () => { site = zoneOf(0, 0, W, D, o.name || '행사장', o.surface, SURFACE[o.surface][1], L.market ? { crowd: true } : {}); });

    /* ── 부스 줄: rows [{ y, rot, count }], xs(가운데부터) → 몽골텐트 (번호도 매김) ── */
    const COLORS = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#2dd4bf', '#fb923c'];
    function boothRows(rows, xs, want) {
      const ids = [];
      if (rows.length) {
        doc.transact('자동 배치: 부스', () => rows.forEach((r, k) => xs.slice(0, r.count).forEach((x, i) => ids.push(put('몽골텐트', x, r.y, r.rot, { size: 3000, depth: 3000, variant: '뒤·양옆', color: COLORS[(i + k * 3) % COLORS.length] }).id))));
        App.booths.number(ids, { prefix: 'A', start: 1, rows: true, perRowLetter: true });
      }
      stats.booths = ids.length;
      if (ids.length < want) stats.notes.push(`부스는 ${ids.length}칸까지 들어갑니다`);
    }
    const TRUCK_COLORS = ['#e03131', '#1971c2', '#f08c00', '#2f9e44', '#7048e8', '#0c8599'];

    if (L.market) {
      /* ── 플리마켓 ── */
      boothRows(L.rows, L.xs, o.booths);
      doc.transact('자동 배치: 장터', () => {
        if (L.rest) {
          zoneOf(m + 1000, m + 2500, m + 7500, L.bandTop - 500, '휴게 구역', 'grass', '#2f9e44');
          L.tables.forEach((p) => put('피크닉 테이블', p.x, p.y, 0));
        }
        const far = Math.min(L.bx1, cx + Math.max(8000, (L.xs.length / 2) * 3200));
        route('관람객', '관람 동선', [[cx, D + 1500], [cx, L.firstAisle], [far, L.firstAisle]]);
        route('비상 대피', '비상 대피 동선 1 (입구)', [[cx, Math.min(L.firstAisle, D * 0.5)], [cx, D + 1500]], eg);
      });
    } else {
      /* ── 무대 쪽 (콘서트·축제·기념식) ── */
      const { sw, sd, top, front, ax0, ax1, ay0 } = L;
      let ay1 = L.ay1, audience = null;
      doc.transact('자동 배치: 무대', () => {
        put('무대', cx, top + sd / 2, 0, { size: sw, depth: sd, ...(L.ceremony ? {} : { variant: '트러스 지붕' }) });
        if (L.ceremony) {
          put('백월', cx, top + 450, 0, { size: pickSize([3000, 4800, 6000, 9000], sw - 600), text: o.name || '기념식' });
          put('연단', cx - sw * 0.28, front - 1100, 0);
        } else {
          put('LED 스크린', cx, top + 450, 0, { size: pickSize([3000, 4000, 6000, 8000], sw - 1800), text: o.name || '' });
        }
        // 음향: 무대 양옆 (3,000명부터는 라인어레이)
        [-1, 1].forEach((s) => (N >= 3000 && !L.ceremony ? put('라인어레이', cx + s * (sw / 2 + 1200), front - 800, 0, { units: 8 }) : put('스피커', cx + s * (sw / 2 + 900), front - 600, 0)));
      });
      if (L.seated) {
        doc.transact('자동 배치: 객석', () => { audience = zoneOf(ax0, ay0, ax1, ay1, '객석', o.surface === 'grass' ? '' : o.surface, '#7048e8'); });
        const opt = { dir: 'up', front: L.frontPad, block: L.seatBlock };
        const fill = () => App.seating.fill(audience.id, opt).reduce((t, id) => t + (doc.get(id).count || 0), 0);
        stats.seats = fill();
        // 셈보다 한 줄 덜 들어갔으면 영역을 한 줄씩 늘려 다시 (자리가 있을 때만)
        for (let i = 0; i < 3 && stats.seats < Math.min(N, L.seatCap) && ay1 + ROWGAP <= L.ayMax; i++) {
          ay1 += ROWGAP;
          doc.transact('자동 배치: 객석 크기', () => doc.update(audience.id, { points: rect(ax0, ay0, ax1, ay1) }));
          stats.seats = fill();
        }
        if (stats.seats < N) stats.notes.push(`좌석은 ${n0(stats.seats)}석까지 들어갑니다 (부지를 넓히면 더 놓을 수 있음)`);
      } else {
        doc.transact('자동 배치: 관람 구역', () => { audience = zoneOf(ax0, ay0, ax1, ay1, '관람 구역', o.surface === 'grass' ? '' : o.surface, '#1c7ed6', { crowd: true }); });
        stats.standing = Math.round(L.standArea);
        if (L.standArea * 2 < N) stats.notes.push(`관람 구역은 ${n0(L.standArea * 2)}명까지가 권장입니다 (부지를 넓히면 더 넓어짐)`);
      }
      if (L.console) doc.transact('자동 배치: 콘솔', () => put('콘솔 데스크', L.console.x, L.console.y, 180));
      if (L.festival) boothRows(L.rows, L.xs, o.booths);
      doc.transact('자동 배치: 동선', () => {
        route('관람객', '입장 동선', [[cx, D + 1500], [cx, L.backY]]);
        route('비상 대피', '비상 대피 동선 1 (입구)', [[cx, L.backY], [cx, D + 1500]], eg);
      });
    }
    // 양옆 비상구로 가는 길 (비상구마다 왼쪽·오른쪽)
    doc.transact('자동 배치: 대피 동선', () => {
      let k = 2;
      eys.forEach((ey, i) => {
        const where = eys.length > 1 ? (i ? ' 뒤' : ' 앞') : '';
        route('비상 대피', `비상 대피 동선 ${k++} (왼쪽${where})`, [[L.exitFrom[0], ey], [-1500, ey]], sg);
        route('비상 대피', `비상 대피 동선 ${k++} (오른쪽${where})`, [[L.exitFrom[1], ey], [W + 1500, ey]], sg);
      });
    });

    /* ── 아래쪽 편의 시설 ── */
    doc.transact('자동 배치: 편의 시설', () => {
      put(L.market || L.ceremony ? '풍선 아치' : '에어아치', cx, D, 0, { size: Math.min(eg, 6000) });
      put('데스크', L.desk.x, L.desk.y, 0, { text: L.ceremony ? '접수' : '안내' });
      if (L.banner) put('X배너', L.banner.x, L.banner.y, 0, { text: o.name || '기념식' });
      if (L.photo) put('포토월', L.photo.x, L.photo.y, 0, { size: 3000, text: 'PHOTO' });
      if (L.medical) put('의무실 텐트', L.medical.x, L.medical.y, 180);
      if (L.bin) put('분리수거함', L.bin.x, L.bin.y, 180);
      L.truckSlots.slice(0, o.trucks).forEach((p, i) => put('푸드트럭', p.x, p.y, p.rot, { color: TRUCK_COLORS[i % TRUCK_COLORS.length] }));
      stats.trucks = Math.min(o.trucks, L.truckSlots.length);
      if (stats.trucks < o.trucks) stats.notes.push(`푸드트럭은 ${stats.trucks}대까지 들어갑니다`);
      L.toilets.forEach((p) => put('이동식 화장실', p.x, p.y, 180));
      stats.toilets = L.toilets.length;
    });

    /* ── 둘레 펜스: 2m 판을 줄마다 양 끝에 맞춰 (아래 입구와 양옆 비상구는 비움) ── */
    if (o.fence) {
      const P = C.itemDef('펜스').size, list = [];
      const run = (a, b) => {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 300) return;
        const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len, rotation = Math.abs(ux) > 0.5 ? 0 : 90;
        if (len < P) { list.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, rotation, size: Math.round(len) }); return; }
        const n = Math.ceil(len / P - 0.001);
        for (let i = 0; i < n; i++) {
          const s = i === n - 1 ? len - P : i * P; // 마지막 판은 끝에 딱 맞춤 (앞 판과 조금 겹침)
          list.push({ x: a.x + ux * (s + P / 2), y: a.y + uy * (s + P / 2), rotation });
        }
      };
      /** 한 변: 빈 곳(gaps: [from, to])을 뺀 토막마다 */
      const side = (at, len, gaps) => {
        let from = 0;
        [...gaps].sort((p, q) => p[0] - q[0]).forEach(([g0, g1]) => { run(at(from), at(g0)); from = g1; });
        run(at(from), at(len));
      };
      const sideGaps = eys.map((ey) => [ey - sg / 2, ey + sg / 2]);
      side((s) => ({ x: s, y: 0 }), W, []);
      side((s) => ({ x: W, y: s }), D, sideGaps);
      side((s) => ({ x: s, y: D }), W, [[cx - eg / 2, cx + eg / 2]]);
      side((s) => ({ x: 0, y: s }), D, sideGaps);
      doc.transact('자동 배치: 펜스', () => list.forEach((f) => put('펜스', f.x, f.y, f.rotation, { ...(f.size ? { size: f.size } : {}), perimeterOf: site.id })));
      stats.fences = list.length;
    }

    /* ── 발전기: 전기 쓰는 것들을 48m 안에서 맡도록 (무대 뒤·구석부터, 먼 곳이 남으면 그 가까운 가장자리에 더) ── */
    (function generators() {
      const def = C.itemDef('발전기'), gw = def.size, gd = def.depth || def.size;
      const kwOf = (list) => list.reduce((t, it) => t + S.powerOf(it), 0);
      let left = items().filter((it) => S.powerOf(it) > 0);
      if (kwOf(left) * S.RULE.powerMargin < 3) return;
      const reach = S.RULE.cableMax - 2000;
      const sizesFor = (kw) => {
        const out = [];
        for (let rest = kw * S.RULE.powerMargin, g = 0; rest > 0 && g < 12; g++) { const k = S.GEN_SIZES.find((x) => x >= rest) || S.GEN_SIZES[S.GEN_SIZES.length - 1]; out.push(k); rest -= k; }
        return out;
      };
      const edge = (x, y) => Math.min(x, W - x, y, D - y);
      const nearSpot = (c, slack) => S.freeSpot(gw, gd, (x, y) => { const d = Math.hypot(c.x - x, c.y - y); return edge(x, y) + (d > slack ? (d - slack) * 10 : 0); });
      doc.transact('자동 배치: 발전기', () => {
        for (let round = 0; left.length && round < 8; round++) {
          let p;
          if (round === 0) p = clearAt(L.genAt.x, L.genAt.y, gw, gd) ? L.genAt : nearSpot(L.genAt, 3000);
          else {
            // 남은 것 가운데 가장 많이(전기 합) 맡을 수 있는 자리 가까이
            const c = left.reduce((best, it) => { const kw = kwOf(left.filter((u) => Math.hypot(u.x - it.x, u.y - it.y) <= reach - 12000)); return !best || kw > best.kw ? { it, kw } : best; }, null).it;
            p = nearSpot(c, 10000);
          }
          if (!p) break;
          const mine = left.filter((it) => Math.hypot(it.x - p.x, it.y - p.y) <= reach);
          if (!mine.length) break;
          sizesFor(kwOf(mine)).forEach((kw, i) => {
            const q = i === 0 ? p : (clearAt(p.x - i * 3000, p.y, gw, gd) ? { x: p.x - i * 3000, y: p.y } : nearSpot(p, 3000));
            if (!q) return;
            put('발전기', q.x, q.y, 0, { kw });
            stats.generators.push(kw);
          });
          left = left.filter((it) => !mine.includes(it));
        }
      });
      // 그래도 모자라면 (자리를 못 찾은 드문 경우) 안전 점검의 ‘발전기 놓기’로
      if (S.genPlan().length) S.placeGenerators({ quiet: true }).forEach((id) => stats.generators.push(doc.get(id).kw));
    })();

    // 화장실: 줄에 다 못 놓은 것은 빈 곳을 찾아 더 놓음
    if (stats.toilets < stats.toiletNeed) stats.toilets += S.fillToilets({ quiet: true }).length;
    if (stats.toilets < stats.toiletNeed) stats.notes.push(`화장실은 ${stats.toilets}칸까지 놓았습니다 (권장 ${stats.toiletNeed}칸)`);

    /* ── 소화기: 불 쓰는 물건이 모두 20m 안에 들게 (부지 안, 물건·동선을 피해서) ── */
    (function extinguishers() {
      const routes = [...doc.all()].filter((e) => e.type === 'route');
      const okAt = (p) => p.x >= 600 && p.x <= W - 600 && p.y >= 600 && p.y <= D - 600
        && !items().some((it) => Math.abs(it.x - p.x) < 40000 && T.item.distance(it, p) < 300)
        && !routes.some((rt) => rt.points.some((q, i) => i && App.geom.closestOnSegment(p, rt.points[i - 1], q).dist < (rt.width || 1200) / 2 + 300));
      const nearby = (p) => {
        for (let r = 500; r <= 5000; r += 500) for (let a = 0; a < 12; a++) { const q = { x: Math.round(p.x + r * Math.cos((a * Math.PI) / 6)), y: Math.round(p.y + r * Math.sin((a * Math.PI) / 6)) }; if (okAt(q)) return q; }
        return null;
      };
      for (let pass = 0; pass < 3; pass++) {
        const pts = S.fillPlan();
        if (!pts.length) break;
        doc.transact('자동 배치: 소화기', () => pts.forEach((p0) => {
          const p = { x: clamp(p0.x, 600, W - 600), y: clamp(p0.y, 600, D - 600) };
          const q = okAt(p) ? p : nearby(p) || p;
          put('소화기', q.x, q.y, 0);
          stats.extinguishers++;
        }));
      }
    })();

    // 대피 길에 걸리는 것이 남았으면 (좁은 부지에 많은 인원 등) 길 폭을 그만큼 줄임 — 막힌 길은 안전 점검이 알려 줌
    doc.transact('자동 배치: 대피 길 다듬기', () => {
      [...doc.all()].filter((e) => e.type === 'route' && e.kind === '비상 대피').forEach((r) => {
        const issues = App.routes.check(r).issues;
        if (!issues.length || issues.some((x) => x.blocked)) return;
        const w = Math.floor((Math.min(...issues.map((x) => x.gap)) * 2) / 100) * 100;
        if (w >= 1200 && w < r.width) doc.update(r.id, { width: w });
      });
    });

    // 주차장: 오른쪽에 따로 (칸 수에 맞는 넓이)
    if (o.parking > 0) {
      let lot = null, lw = 20000;
      const count = () => App.parking.plan(doc.get(lot.id)).reduce((t, p) => t + p.count, 0);
      doc.transact('자동 배치: 주차장', () => {
        lot = zoneOf(W + 8000, 0, W + 8000 + lw, D, '주차장', 'asphalt', '#5b5f66');
        for (let i = 0; i < 80 && count() < o.parking; i++) {
          lw += 2500;
          doc.update(lot.id, { points: rect(W + 8000, 0, W + 8000 + lw, D) });
        }
      });
      stats.parking = App.parking.fill(lot.id).reduce((t, id) => t + (doc.get(id).count || 0), 0);
    }
    last = stats;
    return stats;
  }

  /** 만든 것을 한 줄로 */
  function summary(s = last) {
    if (!s) return '';
    const parts = [];
    if (s.seats) parts.push(`좌석 ${n0(s.seats)}석`);
    if (s.standing) parts.push(`관람 구역 ${n0(s.standing)}㎡`);
    if (s.booths) parts.push(`부스 ${s.booths}칸`);
    if (s.trucks) parts.push(`푸드트럭 ${s.trucks}대`);
    parts.push(`화장실 ${s.toilets}칸`);
    if (s.generators.length) parts.push(`발전기 ${s.generators.map((k) => `${k}kW`).join('+')}`);
    if (s.extinguishers) parts.push(`소화기 ${s.extinguishers}개`);
    if (s.fences) parts.push(`펜스 ${s.fences}개`);
    if (s.parking) parts.push(`주차 ${s.parking}칸`);
    return `${parts.join(' · ')}${s.notes.length ? ` — ${s.notes.join(', ')}` : ''}`;
  }

  /** 입력 창. 돌려주는 값: 옵션(만들기) 또는 null(취소) */
  async function dialog(name) {
    let type = 'concert', sized = false; // sized: 크기를 직접 고쳤는지 (안 고쳤으면 권장 크기를 따라감)
    const numBox = (id, label, value, unit, note = '') => `
      <div class="field"><label class="field-label" for="${id}">${label}${note ? ` <small>${note}</small>` : ''}</label>
        <div class="field-box"><input id="${id}" type="text" inputmode="numeric" autocomplete="off" value="${value}"><span class="field-unit">${unit}</span></div></div>`;
    const r = await App.ui.dialog({
      title: '행사장 자동 배치',
      html: `
        <p class="dialog-note">행사 종류와 부지 크기, 예상 인원을 넣으면 무대·객석·부스·화장실·의무실·소화기·발전기·펜스·동선까지 한 번에 놓습니다. 무대가 위쪽, 입구가 아래쪽입니다. 만든 뒤 자유롭게 고치세요.</p>
        <div class="tpl-list wz-types" role="radiogroup" aria-label="행사 종류">
          ${TYPES.map((t) => `<button type="button" class="tpl" role="radio" data-wz="${t.id}" aria-checked="${t.id === type}"><b>${t.name}</b><small>${t.desc}</small></button>`).join('')}
        </div>
        <div class="field-grid">
          ${numBox('wzN', '예상 인원', 1000, '명')}
          <div class="field wz-seat"><label class="field-label" for="wzSeat">관람</label><div class="field-box"><select id="wzSeat" class="field-select"><option value="standing">스탠딩</option><option value="seated">좌석</option></select></div></div>
        </div>
        <div class="field-grid">${numBox('wzW', '부지 가로', '', 'm')}${numBox('wzD', '부지 세로', '', 'm')}</div>
        <div class="field-grid">${numBox('wzBooths', '부스', 0, '칸')}${numBox('wzTrucks', '푸드트럭', 2, '대')}</div>
        <div class="field-grid">
          ${numBox('wzPark', '주차 칸', 0, '칸', '0이면 안 만듦')}
          <div class="field"><label class="field-label" for="wzSurf">바닥</label><div class="field-box"><select id="wzSurf" class="field-select">${Object.entries(SURFACE).map(([id, s]) => `<option value="${id}">${s[0]}</option>`).join('')}</select></div></div>
        </div>
        <label class="check-row"><input type="checkbox" id="wzFence" checked><span>둘레 펜스<small>입구와 양옆 비상구는 비워 둠</small></span></label>
        <p class="props-meta wz-hint" aria-live="polite"></p>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '만들기', primary: true }],
      onOpen(body) {
        const $ = (id) => body.querySelector(`#${id}`);
        const read = () => ({
          type, n: $('wzN').value.replace(/[^\d]/g, ''), seating: $('wzSeat').value, booths: $('wzBooths').value.replace(/[^\d]/g, ''), trucks: $('wzTrucks').value.replace(/[^\d]/g, ''),
          parking: $('wzPark').value.replace(/[^\d]/g, ''), surface: $('wzSurf').value, fence: $('wzFence').checked, name,
          w: sized ? Number($('wzW').value.replace(',', '.')) * 1000 : null, d: sized ? Number($('wzD').value.replace(',', '.')) * 1000 : null,
        });
        const sync = () => {
          const o = normalize(read());
          const s = suggest(o);
          if (!sized) { $('wzW').value = s.w; $('wzD').value = s.d; }
          body.querySelector('.wz-seat').hidden = type !== 'concert';
          $('wzBooths').closest('.field').hidden = type !== 'market' && type !== 'festival';
          const area = (o.w / 1000) * (o.d / 1000), per = area / o.n;
          const size = !sized ? '부지 크기는 인원·부스·푸드트럭에 맞춘 권장값입니다 (실제 크기로 바꾸세요). '
            : fits(o) ? `권장 부지는 약 ${s.w} × ${s.d} m입니다. ` : `이 크기에는 다 들어가지 않을 수 있습니다 (권장 약 ${s.w} × ${s.d} m 이상). `;
          body.querySelector('.wz-hint').textContent = `${size}부지 ${n0(area)}㎡ · 한 사람에 ${per >= 10 ? n0(per) : (Math.round(per * 10) / 10).toLocaleString('ko-KR')}㎡. 크기는 ${LIMIT.w[0]}~${LIMIT.w[1]} m, 비우면 권장값.`;
        };
        const setType = (id) => {
          type = id;
          body.querySelectorAll('[data-wz]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.wz === id)));
          const t = typeOf(id);
          $('wzBooths').value = t.booths; $('wzTrucks').value = t.trucks;
          $('wzSurf').value = id === 'market' ? 'paver' : 'grass';
          sync();
        };
        body.addEventListener('click', (e) => { const b = e.target.closest('[data-wz]'); if (b) setType(b.dataset.wz); });
        // 크기를 직접 고치면 그 값을 씀 (두 칸을 모두 비우면 다시 권장값)
        body.addEventListener('input', (e) => { if (e.target.id === 'wzW' || e.target.id === 'wzD') sized = !!($('wzW').value.trim() || $('wzD').value.trim()); sync(); });
        body.addEventListener('change', sync);
        body._read = () => normalize(read());
        setType(type);
      },
    });
    if (r.id !== 'ok' || !r.body._read) return null;
    return r.body._read();
  }

  App.wizard = { TYPES, LIMIT, suggest, normalize, layout, fits, build, dialog, summary, get last() { return last; } };
})();
