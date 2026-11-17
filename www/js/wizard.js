/* 행사장 자동 배치 (조감도 모드): 행사 종류·부지 크기·예상 인원을 넣으면 무대·객석·부스·편의 시설·동선·펜스를 한 번에 놓음.
   새 도면을 만들 때 씀 (파일 → 새 도면 → 자동 배치). ‘야외 콘서트 예시’도 이것으로 만듦.
   좌석 채우기(seating)·부스 번호(booths)·둘레 두르기(fences)·주차 칸(parking)·안전 점검(safety)의 도구를 그대로 씀.
   자리 셈: 무대가 위쪽, 입구가 아래쪽 가운데, 비상구는 양옆 — 입구 쪽을 다르게 고르면 다 만든 뒤 통째로 돌림 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const TYPES = [
    { id: 'concert', name: '콘서트·공연', desc: '무대와 객석 (스탠딩 또는 좌석)', trucks: 2, booths: 0 },
    { id: 'festival', name: '축제', desc: '무대 + 관람 구역 + 부스 거리', trucks: 3, booths: 12 },
    { id: 'market', name: '플리마켓·장터', desc: '마주 보는 부스 줄과 휴게 공간', trucks: 3, booths: 30 },
    { id: 'ceremony', name: '기념식·개막식', desc: '무대와 좌석, 접수대', trucks: 0, booths: 0 },
    { id: 'sports', name: '체육대회·운동회', desc: '운동장과 본부석, 팀 텐트·응원 구역', trucks: 1, booths: 4 }, // booths = 팀 텐트 수
  ];
  /** 부스 칸에 넣는 것: 장터·축제는 부스(칸), 체육대회는 팀 텐트(동) */
  const BOOTH_LABEL = { market: ['부스', '칸'], festival: ['부스', '칸'], sports: ['팀 텐트', '동'] };
  const TEAMS = [['청', '#1971c2'], ['백', '#f1f3f5'], ['홍', '#e03131'], ['황', '#f08c00'], ['녹', '#2f9e44'], ['보라', '#7048e8']];
  // 운동장에 그릴 경기장: 들어가는 가장 큰 것 (가로 × 세로 mm)
  const COURTS = [['육상 트랙', 176000, 92000], ['육상 트랙', 88000, 46000], ['축구장', 68000, 50000], ['축구장', 50000, 30000], ['풋살장', 40000, 20000], ['풋살장', 30000, 15000], ['배구장', 18000, 9000]];
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
    const market = o.type === 'market', ceremony = o.type === 'ceremony', festival = o.type === 'festival', sports = o.type === 'sports';
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
    const L = { W, D, N, cx, m, eg, band, yb, bandTop, market, ceremony, festival, sports, truckSlots: [] };

    if (market) {
      /* 플리마켓: 마주 보는 부스 줄, 왼쪽 휴게 구역, 오른쪽 푸드트럭 줄. 비상구는 부스 줄 사이 길의 양 끝 */
      const rest = W >= 40000;
      const bx0 = m + (rest ? 9500 : 2500), bx1 = W - m - (o.trucks > 0 ? 6500 : 2500);
      const xs = slots(bx0, bx1);
      const plan = (pairs) => {
        const sg = sgFor(pairs), aisle = Math.max(6000, sg), rp = rowPairs(m + 4000, aisle);
        const rows = share(rp.rows, xs, o.booths);
        const usedAisles = rp.aisles.filter((_, k) => rows.length >= 2 * k + 2);
        // 양옆 비상구를 낼 수 있는 높이(가운데 선) 구간: 쓰인 줄 사이 길, 마지막 줄 아래(줄이 없으면 부지 전체)의 빈 곳
        const free = usedAisles.map((a) => [a - (aisle - sg) / 2, a + (aisle - sg) / 2]);
        const lo = (rows.length ? rows[rows.length - 1].y + 1500 + 500 : m + 2000) + sg / 2, hi = bandTop - sg / 2 - 500;
        if (hi >= lo) free.push([lo, hi]);
        /** target에 가장 가까운 가능한 높이 (avoid가 있으면 그 비상구와 폭 + 2m 넘게 떨어져서) */
        const pick = (target, avoid = null) => {
          let best = null;
          free.forEach(([a, b]) => [target, ...(avoid == null ? [] : [avoid - sg - 2000, avoid + sg + 2000])].forEach((t) => {
            const c = clamp(t, a, b);
            if (avoid != null && Math.abs(c - avoid) < sg + 2000 - 1) return;
            if (best == null || Math.abs(c - target) < Math.abs(best - target)) best = c;
          }));
          return best;
        };
        let eys = null;
        if (pairs === 2) { const a = pick(D / 3), b = a == null ? null : pick((D * 2) / 3, a); if (b != null) eys = [a, b].sort((p, q) => p - q); } else {
          const a = pick(D / 2);
          eys = [a != null ? a : clamp(D / 2, m + 6000, Math.max(m + 6000, bandTop - sg / 2 - 500))];
        }
        return { pairs, sg, aisle, rp, rows, usedAisles, eys: eys && eys.map((v) => Math.round(v)) }; // 정수 mm (소수가 남으면 아래 자리 셈이 어긋남)
      };
      let P = plan(wantPairs);
      if (!P.eys) P = plan(1); // 둘씩 낼 자리가 없으면 하나씩
      const { sg, aisle, rows, usedAisles, eys } = P;
      const firstAisle = usedAisles.length ? usedAisles[0] : rows.length ? Math.min(bandTop - 1000, rows[0].y + 1500 + aisle / 2) : D * 0.4;
      // 푸드트럭: 오른쪽 가장자리에 세로로 (판매 창이 장터 쪽), 비상구 앞은 비움
      for (let y = m + 5500; y + 3000 <= bandTop;) {
        const e = eys.find((v) => Math.abs(y - v) < sg / 2 + 3600);
        if (e != null) { y = Math.max(y + 100, e + sg / 2 + 3600); continue; } // 비상구 아래로 건너뜀 (늘 앞으로 가게)
        L.truckSlots.push({ x: W - m - 1600, y, rot: 90 });
        y += 7000;
      }
      // 휴게 구역의 피크닉 테이블 (비상 대피 길은 비움)
      const tables = [];
      if (rest) for (let y = m + 5000; y + 1500 <= bandTop - 1000 && tables.length < 10; y += 3600) if (!eys.some((e) => Math.abs(y - e) < sg / 2 + 2000)) tables.push({ x: m + 4250, y });
      Object.assign(L, {
        sg, pairs: P.pairs, eys: eys.map((v) => Math.round(v)), rest, bx0, bx1, xs, rows, aisle, firstAisle: Math.round(firstAisle), tables, // 줄 사이 길에 꼭 맞는 높이라 100 단위로 다듬지 않음
        boothCap: P.rp.rows.length * xs.length, exitFrom: [cx - eg / 2 - 1000, cx + eg / 2 + 1000],
        genAt: { x: W - m - 1600, y: m + 1300 }, serviceTop: bandTop,
      });
    } else if (sports) {
      /* 체육대회·운동회: 위쪽 가운데 본부석(큰 텐트·시상대·음향·점수판), 가운데 운동장, 양옆에 응원 구역과 팀 텐트 줄 */
      const top = m + 1500, fy0 = top + 10500, fy1 = bandTop - 2000;   // 운동장·응원 구역의 위·아래
      const len = Math.max(0, fy1 - fy0), strip = m + 6500;             // strip: 펜스에서 팀 텐트 줄 안쪽 끝까지
      // 응원 구역 깊이: 서 있을 넓이(1㎡에 1.8명)를 양옆에 나눔 — 운동장 폭은 30m 넘게 남김
      const czMax = Math.max(4000, Math.floor((W - 2 * strip - 3000 - 30000) / 2 / 500) * 500);
      const cz = clamp(len > 0 ? Math.ceil(((N / 1.8) * 1e6) / (2 * len) / 500) * 500 : 4000, 4000, czMax);
      const depthA = len;
      const pairs = wantPairs === 2 && depthA * 0.44 >= sgFor(2) + 2000 ? 2 : 1, sg = sgFor(pairs);
      const eys = (pairs === 2 ? [fy0 + depthA * 0.28, fy0 + depthA * 0.72] : [clamp((fy0 + fy1) / 2, m + 6000, bandTop - 2000)]).map(round);
      // 팀 텐트(5×5): 왼쪽·오른쪽 번갈아 위에서부터, 비상구 앞은 비움
      const tents = [];
      for (let y = fy0 + 2500; y + 2500 <= fy1; y += 5500) {
        if (eys.some((e) => Math.abs(y - e) < sg / 2 + 3100)) continue;
        tents.push({ x: m + 3500, y, rot: 270 }, { x: W - m - 3500, y, rot: 90 });
      }
      // 운동장과 그 안에 그릴 경기장 (들어가는 가장 큰 것, 세로로 길면 돌려서)
      const fx0 = strip + cz + 1500, fx1 = W - fx0, bw = fx1 - fx0, bh = len - 2000;
      const fit = COURTS.map(([kind, w, h]) => (w <= bw && h <= bh ? { kind, w, h, rot: 0 } : h <= bw && w <= bh ? { kind, w, h, rot: 90 } : null)).find(Boolean) || null;
      Object.assign(L, {
        sg, pairs, eys, top, fy0, fy1, cz, tents, field: bw >= 12000 && bh >= 8000 ? { x0: fx0, y0: fy0 + 1000, x1: fx1, y1: fy1 - 1000 } : null, court: fit,
        cheer: [[strip, strip + cz], [W - strip - cz, W - strip]], standArea: (2 * cz * len) / 1e6, rows: [], xs: [], boothCap: tents.length,
        backY: round(Math.min(fy1 + 3000, D - 2500)), exitFrom: [strip, W - strip],
        genAt: { x: cx - 9000, y: top + 1000 }, serviceTop: fy1 + 1500,
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
    // 줄에 다 안 들어가면: 왼쪽 펜스를 따라 위로 (문이 오른쪽), 비상구 앞은 비움. 넓은 무대형 부지(양옆 9m 넘게 빔)는 두 줄까지
    const cols = sports ? 0 : !market && Math.max(m + 4000, W * 0.1) >= 9000 ? 2 : 1; // 체육대회는 왼쪽 펜스를 따라 팀 텐트가 섬
    for (let c = 0; c < cols && toilets.length < toiletNeed; c++) {
      for (let y = bandTop - 1200; y >= m + 3000 && toilets.length < toiletNeed; y -= 1350) {
        if (L.eys.some((e) => Math.abs(y - e) < L.sg / 2 + 1500)) continue;
        toilets.push({ x: m + 700 + c * 3200, y, rot: c ? 90 : 270 }); // 두 줄이면 마주 봄 (사이 2m는 줄 서는 곳)
      }
    }
    return Object.assign(L, { desk, photo, bin, medical, banner, toilets, toiletNeed });
  }
  /** 이 크기에 인원·부스·푸드트럭이 다 들어가는지 */
  function fits(o) {
    const L = layout(o);
    if (L.truckSlots.length < o.trucks) return false;
    if (o.type === 'market') return L.boothCap >= o.booths && (o.w / 1000) * (o.d / 1000) >= o.n * 1.5;
    if (o.type === 'sports') return L.standArea + 0.01 >= o.n / 1.8 && L.tents.length >= o.booths && !!L.court;
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

  const ENTRANCES = [['bottom', '아래'], ['top', '위'], ['left', '왼쪽'], ['right', '오른쪽']];
  /** 입구가 옆(왼쪽·오른쪽)인지: 그러면 완성된 부지의 가로·세로가 자리 셈(무대가 위, 입구가 아래)의 세로·가로 */
  const sideways = (entrance) => entrance === 'left' || entrance === 'right';
  /** 옵션을 다듬음 (범위·기본값). 길이는 mm.
      넣는 w·d는 완성된 부지의 가로·세로, 돌려주는 w·d는 자리 셈의 크기(입구가 옆이면 바뀜) — 한 번 다듬은 것(_n)은 그대로 돌려줌 */
  function normalize(o = {}) {
    if (o && o._n) return o;
    const t = typeOf(o.type);
    const num = (v, [lo, hi], d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? clamp(Math.round(Number(v)), lo, hi) : d);
    const n = num(o.n, LIMIT.n, 1000), booths = num(o.booths, LIMIT.booths, t.booths), trucks = num(o.trucks, LIMIT.trucks, t.trucks);
    const seating = seatingOf(t, o.seating);
    const entrance = ENTRANCES.some(([id]) => id === o.entrance) ? o.entrance : 'bottom';
    const s = suggest({ type: t.id, n, booths, trucks, seating });
    const mm = (v, lim, d) => (Number(v) > 0 ? clamp(Math.round(Number(v) / 100) * 100, lim[0] * 1000, lim[1] * 1000) : d * 1000);
    const [w0, d0] = sideways(entrance) ? [o.d, o.w] : [o.w, o.d];
    return {
      _n: true, type: t.id, n, booths, seating, trucks, entrance,
      w: mm(w0, LIMIT.w, s.w), d: mm(d0, LIMIT.d, s.d),
      parking: num(o.parking, LIMIT.parking, 0),
      fence: o.fence !== false, surface: SURFACE[o.surface] ? o.surface : t.id === 'market' ? 'paver' : 'grass', night: !!o.night,
      name: String(o.name || '').trim().slice(0, 40),
    };
  }
  /** 완성된 부지의 권장 크기 (m): 입구가 옆이면 세로로 긴 모양 */
  function suggestSite(o = {}) {
    const s = suggest(o);
    return sideways(o.entrance) ? { w: s.d, d: s.w } : s;
  }

  let last = null; // 마지막으로 만든 것의 요약 (알림에 씀)

  /** 지금 도면(빈 조감도)에 배치를 만듦. opt.embed: 다른 도면의 영역에 옮겨 붙일 것 (둘레 바닥을 바꾸지 않음).
      돌려주는 값: 요약 { type, seats, booths, trucks, toilets, siteId, … } */
  function build(o0, opt = {}) {
    const o = normalize(o0), L = layout(o);
    const doc = App.doc, T = App.model.TYPES, C = App.catalog, S = App.safety;
    const { W, D, N, cx, m, eg, sg, yb, eys } = L;
    const stats = { type: o.type, n: N, w: W, d: D, staff: 0, tents: 0, lights: 0, seats: 0, standing: 0, booths: 0, trucks: 0, toilets: 0, toiletNeed: L.toiletNeed, extinguishers: 0, generators: [], fences: 0, parking: 0, exits: 1 + 2 * eys.length, notes: [] };
    App.current.expected = N;
    if (!opt.embed || o.night) App.current.night = o.night || null; // 야간 행사 (영역에 넣을 때는 켤 때만 — 도면의 설정을 끄지 않음)
    if (!opt.embed) App.current.ground = o.surface === 'grass' ? 'asphalt' : 'grass'; // 지금 도면의 영역에 넣을 때는 둘레 바닥을 건드리지 않음

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
    stats.siteId = site.id;

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
        route('비상 대피', '비상 대피 동선 1 (입구)', [[cx, Math.max(L.firstAisle, D * 0.5)], [cx, D + 1500]], eg); // 길어도 부지 깊이의 절반
      });
    } else if (L.sports) {
      /* ── 체육대회·운동회 ── */
      const { top, fy0, fy1 } = L;
      doc.transact('자동 배치: 본부석', () => {
        put('현수막', cx, m + 700, 0, { size: pickSize([3000, 5000, 7000, 10000], W - 2 * m - 2000), text: o.name || '체육대회' });
        put('대형 텐트', cx, top + 2500, 0);
        put('시상대', cx, top + 6800, 0);
        [-1, 1].forEach((k) => put('스피커', cx + k * 6200, top + 4600, 0));
        put('점수판', cx + 8500, top + 2500, 0, { text: '청 0 : 0 백' });
      });
      doc.transact('자동 배치: 운동장', () => {
        if (L.field) zoneOf(L.field.x0, L.field.y0, L.field.x1, L.field.y1, '운동장', 'sand', '#e6d3a3');
        if (L.field && L.court) put(L.court.kind, cx, (L.field.y0 + L.field.y1) / 2, L.court.rot, { size: L.court.w, depth: L.court.h });
        L.cheer.forEach(([x0, x1], i) => zoneOf(x0, fy0, x1, fy1, `응원 구역 ${i + 1}`, o.surface === 'grass' ? '' : o.surface, '#1c7ed6', { crowd: true }));
        const used = L.tents.slice(0, o.booths);
        used.forEach((p, i) => put('몽골텐트', p.x, p.y, p.rot, { size: 5000, depth: 5000, variant: '뒤', color: TEAMS[i % TEAMS.length][1], memo: i < TEAMS.length ? `${TEAMS[i][0]}팀` : `${i + 1}팀` }));
        stats.tents = used.length;
        if (used.length < o.booths) stats.notes.push(`팀 텐트는 ${used.length}동까지 들어갑니다`);
        route('관람객', '입장 동선', [[cx, D + 1500], [cx, L.backY]]);
        route('비상 대피', '비상 대피 동선 1 (입구)', [[cx, L.backY], [cx, D + 1500]], eg);
      });
      stats.standing = Math.round(L.standArea);
      if (L.standArea * 2 < N) stats.notes.push(`응원 구역은 ${n0(L.standArea * 2)}명까지가 권장입니다 (부지를 넓히면 더 넓어짐)`);
      if (!L.court) stats.notes.push('운동장이 좁아 경기장 선은 그리지 않았습니다');
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
    // 양옆 비상구로 가는 길 (비상구마다 왼쪽·오른쪽). 이름은 다 만들고 돌린 뒤의 쪽으로 (입구가 왼쪽이면 양옆 비상구는 위쪽·아래쪽)
    const SIDE = { bottom: ['왼쪽', '오른쪽'], left: ['위쪽', '아래쪽'], top: ['오른쪽', '왼쪽'], right: ['아래쪽', '위쪽'] }[opt.side || o.entrance] || ['왼쪽', '오른쪽'];
    doc.transact('자동 배치: 대피 동선', () => {
      let k = 2;
      eys.forEach((ey, i) => {
        const where = eys.length > 1 ? (i ? ' 뒤' : ' 앞') : '';
        route('비상 대피', `비상 대피 동선 ${k++} (${SIDE[0]}${where})`, [[L.exitFrom[0], ey], [-1500, ey]], sg);
        route('비상 대피', `비상 대피 동선 ${k++} (${SIDE[1]}${where})`, [[L.exitFrom[1], ey], [W + 1500, ey]], sg);
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
      L.toilets.forEach((p) => put('이동식 화장실', p.x, p.y, p.rot != null ? p.rot : 180));
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

    // 야간 행사: 어두운 관람 구역·동선에 조명 타워 (발전기·소화기·안전 요원보다 먼저 — 전기를 쓰고 불 쓰는 물건으로 셈)
    if (App.current.night) stats.lights = S.fillLights({ quiet: true }).length;

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
          if (round === 0) {
            p = clearAt(L.genAt.x, L.genAt.y, gw, gd) ? L.genAt : nearSpot(L.genAt, 3000);
            // 정해 둔 자리에서 아무것도 닿지 않으면 (넓은 부지 가운데의 부스들) 그 자리는 건너뛰고 쓰는 곳 가까이에
            if (!p || !left.some((it) => Math.hypot(it.x - p.x, it.y - p.y) <= reach)) continue;
          } else {
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
    if (stats.toilets < stats.toiletNeed) stats.toilets += S.fillToilets({ quiet: true, budgetMs: 1200 }).length; // 좁은 부지에 수백 칸이면 오래 걸려 1.2초까지만
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
      // 불 쓰는 물건이 없어도 사람이 많으면 안내 데스크 옆에 하나
      if (!stats.extinguishers && N >= S.RULE.careAt) {
        const p = { x: L.desk.x - 1400, y: L.desk.y }, q = okAt(p) ? p : nearby(p) || p;
        doc.transact('자동 배치: 소화기', () => put('소화기', q.x, q.y, 0));
        stats.extinguishers = 1;
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

    // 주차장: 오른쪽에 따로 (칸 수에 맞는 넓이 — 칸이 많으면 부지보다 길게, 가로로 늘려 맞춤)
    if (o.parking > 0) {
      let lot = null, lw = 20000;
      const lh = clamp(Math.ceil(Math.sqrt(o.parking * 28e6) / 1000) * 1000, D, 160000); // 한 칸에 통로까지 28㎡쯤
      const count = () => App.parking.plan(doc.get(lot.id)).reduce((t, p) => t + p.count, 0);
      doc.transact('자동 배치: 주차장', () => {
        lot = zoneOf(W + 8000, 0, W + 8000 + lw, lh, '주차장', 'asphalt', '#5b5f66');
        for (let i = 0; i < 100 && count() < o.parking; i++) {
          lw += 2500;
          doc.update(lot.id, { points: rect(W + 8000, 0, W + 8000 + lw, lh) });
        }
      });
      stats.parking = App.parking.fill(lot.id).reduce((t, id) => t + (doc.get(id).count || 0), 0);
      if (stats.parking < o.parking) stats.notes.push(`주차는 ${stats.parking}칸까지 만들었습니다`);
    }
    // 안전 요원: 권장 수만큼 비상구·입구·무대 앞·관람 구역 둘레에
    stats.staff = S.placeStaff({ quiet: true }).length;

    // 입구 쪽: 자리 셈은 늘 무대가 위·입구가 아래 — 다른 쪽이면 만든 것을 통째로 돌림 (시계 방향 90° × k)
    const k = { bottom: 0, left: 1, top: 2, right: 3 }[o.entrance] || 0;
    if (k) {
      const turn = (p) => (k === 1 ? { x: D - p.y, y: p.x } : k === 2 ? { x: W - p.x, y: D - p.y } : { x: p.y, y: W - p.x });
      const pt = (p) => { const q = turn(p); return { x: Math.round(q.x), y: Math.round(q.y) }; };
      doc.transact('자동 배치: 입구 방향', () => [...doc.all()].forEach((e) => {
        if (e.type === 'item' && Number.isFinite(e.x) && Number.isFinite(e.y)) doc.update(e.id, { ...pt(e), rotation: ((e.rotation || 0) + 90 * k) % 360 });
        else if ((e.type === 'zone' || e.type === 'route') && Array.isArray(e.points)) doc.update(e.id, { points: e.points.map(pt) });
      }));
      if (k !== 2) { stats.w = D; stats.d = W; } // 완성된 부지의 가로·세로
    }
    stats.entrance = o.entrance;
    last = stats;
    return stats;
  }

  /** 만든 것을 한 줄로 */
  function summary(s = last) {
    if (!s) return '';
    const parts = [];
    if (s.seats) parts.push(`좌석 ${n0(s.seats)}석`);
    if (s.standing) parts.push(`${s.type === 'sports' ? '응원' : '관람'} 구역 ${n0(s.standing)}㎡`);
    if (s.tents) parts.push(`팀 텐트 ${s.tents}동`);
    if (s.booths) parts.push(`부스 ${s.booths}칸`);
    if (s.trucks) parts.push(`푸드트럭 ${s.trucks}대`);
    parts.push(`화장실 ${s.toilets}칸`);
    if (s.generators.length) parts.push(`발전기 ${s.generators.map((k) => `${k}kW`).join('+')}`);
    if (s.extinguishers) parts.push(`소화기 ${s.extinguishers}개`);
    if (s.staff) parts.push(`안전 요원 ${s.staff}명`);
    if (s.lights) parts.push(`조명 타워 ${s.lights}개`);
    if (s.fences) parts.push(`펜스 ${s.fences}개`);
    if (s.parking) parts.push(`주차 ${s.parking}칸`);
    return `${parts.join(' · ')}${s.notes.length ? ` — ${s.notes.join(', ')}` : ''}`;
  }

  /* ── 지금 도면의 영역에 자동 배치: 네모난 영역(돌아가 있어도 됨)의 크기로 빈 도면에서 만든 뒤 그 영역 자리로 옮겨 붙임 ── */
  /** 영역이 네모면 { pts(네 꼭짓점), a·b(이웃한 두 변 길이), cw } — 아니면 null. 한 줄 위의 점은 빼고 봄 */
  function rectOf(zone) {
    if (!zone || zone.type !== 'zone' || !zone.points || zone.points.length < 4) return null;
    const P = zone.points, n = P.length;
    const unit = (a, b) => { const L = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / L, y: (b.y - a.y) / L }; };
    // 꺾이는 점만 (같은 방향으로 이어지는 점·겹친 점은 뺌)
    const pts = P.filter((p, i) => {
      const a = P[(i + n - 1) % n], b = P[(i + 1) % n];
      if (Math.hypot(p.x - a.x, p.y - a.y) < 1) return false;
      const u = unit(a, p), v = unit(p, b);
      return Math.abs(u.x * v.y - u.y * v.x) > 0.035; // 2°
    });
    if (pts.length !== 4) return null;
    const e = pts.map((p, i) => unit(p, pts[(i + 1) % 4])), len = pts.map((p, i) => Math.hypot(pts[(i + 1) % 4].x - p.x, pts[(i + 1) % 4].y - p.y));
    if (e.some((u, i) => Math.abs(u.x * e[(i + 1) % 4].x + u.y * e[(i + 1) % 4].y) > 0.01)) return null; // 모서리가 직각(±0.6°)이 아님
    if (Math.abs(len[0] - len[2]) > Math.max(100, len[0] * 0.005) || Math.abs(len[1] - len[3]) > Math.max(100, len[1] * 0.005)) return null;
    const area2 = pts.reduce((t, p, i) => t + p.x * pts[(i + 1) % 4].y - pts[(i + 1) % 4].x * p.y, 0);
    return { pts, a: (len[0] + len[2]) / 2, b: (len[1] + len[3]) / 2, cw: area2 > 0 };
  }
  /** 입구 쪽(화면에서 아래·위·왼쪽·오른쪽)에 가장 가까운 변을 입구로 한 자리 틀: 자리 셈의 (x, y) → 도면 자리 */
  function frameOf(R, entrance) {
    const dir = { bottom: { x: 0, y: 1 }, top: { x: 0, y: -1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[entrance] || { x: 0, y: 1 };
    let best = null;
    R.pts.forEach((p, i) => {
      const q = R.pts[(i + 1) % 4], L = Math.hypot(q.x - p.x, q.y - p.y) || 1, d = { x: (q.x - p.x) / L, y: (q.y - p.y) / L };
      const out = R.cw ? { x: d.y, y: -d.x } : { x: -d.y, y: d.x }; // 바깥쪽
      const score = out.x * dir.x + out.y * dir.y;
      if (!best || score > best.score) best = { score, p, q, out, i };
    });
    const nrm = best.out, ex = { x: nrm.y, y: -nrm.x };                // 자리 셈의 +x (입구를 등지고 섰을 때 왼쪽 → 오른쪽), +y는 바깥쪽
    const W = best.i % 2 === 0 ? R.a : R.b, D = best.i % 2 === 0 ? R.b : R.a;
    const E0 = Math.hypot(best.p.x + ex.x * W - best.q.x, best.p.y + ex.y * W - best.q.y) < Math.hypot(best.q.x + ex.x * W - best.p.x, best.q.y + ex.y * W - best.p.y) ? best.p : best.q;
    return {
      W, D, theta: (Math.atan2(ex.y, ex.x) * 180) / Math.PI,
      // 0.01mm까지 (정수 mm로 다듬으면 돌아간 영역에서 펜스 끝이 비상구 폭 안으로 1mm쯤 들어가 ‘걸림’이 됨)
      at: (p) => ({ x: Math.round((E0.x + ex.x * p.x + nrm.x * (p.y - D)) * 100) / 100, y: Math.round((E0.y + ex.y * p.x + nrm.y * (p.y - D)) * 100) / 100 }),
    };
  }
  /** 영역에 배치 (창 없이): raw는 창에서 고른 값 { type, n, seating, booths, trucks, fence, surface, side(입구 쪽) }.
      돌려주는 값: 요약(stats) 또는 null(네모가 아니거나 크기가 범위를 벗어남 — 까닭은 알림으로) */
  function placeInZone(zoneId, raw = {}) {
    const zone = App.doc.get(zoneId), R = rectOf(zone);
    if (!R) { App.ui.toast('자동 배치는 네모난 영역(꼭짓점 네 개, 직각)에만 할 수 있습니다. 영역 도구로 부지를 네모로 그려 주세요.'); return null; }
    const lo = LIMIT.w[0] * 1000, hi = LIMIT.w[1] * 1000;
    if (Math.min(R.a, R.b) < lo - 50 || Math.max(R.a, R.b) > hi + 50) { App.ui.toast(`이 영역은 ${n0(R.a / 1000)} × ${n0(R.b / 1000)} m입니다. 한 변이 ${LIMIT.w[0]}~${LIMIT.w[1]} m인 영역에 배치할 수 있습니다.`); return null; }
    const F = frameOf(R, raw.side || raw.entrance);
    const o = { ...normalize({ ...raw, entrance: 'bottom', parking: 0, name: zone.name || raw.name }), w: clamp(Math.round(F.W), lo, hi), d: clamp(Math.round(F.D), lo, hi) };
    // 빈 도면에서 만든 뒤 (숨긴 레이어가 있어도 다 보이는 것으로) 영역 자리로 옮겨 붙임
    const hidden = App.current.hiddenLayers;
    let stats = null, made = [];
    App.current.hiddenLayers = [];
    try { made = App.doc.sandbox(() => { stats = build(o, { embed: true, side: raw.side || raw.entrance }); }); } finally { App.current.hiddenLayers = hidden; }
    const turn = (deg) => Math.round(((((deg || 0) + F.theta) % 360) + 360) % 360 * 100) / 100;
    const els = made.filter((e) => e.id !== stats.siteId).map((e) => {
      if (e.type === 'item' && Number.isFinite(e.x) && Number.isFinite(e.y)) Object.assign(e, F.at(e), { rotation: turn(e.rotation) });
      else if ((e.type === 'zone' || e.type === 'route') && Array.isArray(e.points)) e.points = e.points.map(F.at);
      if (e.perimeterOf === stats.siteId) e.perimeterOf = zone.id;
      return e;
    });
    App.doc.transact('자동 배치', () => {
      els.forEach((e) => App.doc.add(e));
      if (o.type === 'market' && !zone.crowd) App.doc.update(zone.id, { crowd: true }); // 장터는 부지 전체가 관람·대기 구역
    });
    stats.added = els.length;
    stats.entrance = raw.side || raw.entrance || 'bottom';
    last = stats;
    return stats;
  }
  /** 영역 속성의 ‘이 영역에 자동 배치’: 창을 띄우고 배치 */
  async function intoZone(zoneId) {
    const zone = App.doc.get(zoneId), R = rectOf(zone);
    if (!R) { App.ui.toast('자동 배치는 네모난 영역(꼭짓점 네 개, 직각)에만 할 수 있습니다. 영역 도구로 부지를 네모로 그려 주세요.'); return null; }
    const lo = LIMIT.w[0] * 1000, hi = LIMIT.w[1] * 1000;
    if (Math.min(R.a, R.b) < lo - 50 || Math.max(R.a, R.b) > hi + 50) { App.ui.toast(`이 영역은 ${n0(R.a / 1000)} × ${n0(R.b / 1000)} m입니다. 한 변이 ${LIMIT.w[0]}~${LIMIT.w[1]} m인 영역에 배치할 수 있습니다.`); return null; }
    const inside = [...App.doc.all()].filter((e) => e.type === 'item' && !(App.catalog.itemDef(e.kind) || {}).flat && App.geom.pointInPolygon(e, zone.points)).length;
    const raw = await dialog(zone.name || '행사장', { sizeFor: (side) => { const F = frameOf(R, side); return { w: F.W, d: F.D }; }, inside });
    if (!raw) return null;
    App.ui.busy('행사장을 배치하는 중…');
    await new Promise((res) => setTimeout(res, 30));
    let stats = null;
    try { stats = placeInZone(zoneId, raw); } catch (err) { console.error(err); App.ui.toast('자동 배치를 만들지 못했습니다. 인원이나 종류를 바꿔 다시 해 보세요.'); } finally { App.ui.busy(false); }
    if (stats) {
      App.selection.set([]);
      App.ui.toast(`‘${zone.name || '영역'}’에 배치했습니다: ${summary(stats)}. 한 번에 되돌리려면 Ctrl+Z.`);
    }
    return stats;
  }

  /** 입력 창. 돌려주는 값: 옵션(만들기) 또는 null(취소). 마지막에 만든 값(종류·인원·부스 …, 크기는 빼고)은 이 기기에 기억해 다음에 채움.
      embed: 지금 도면의 영역에 넣을 때 { sizeFor(입구 쪽) → { w, d }(mm, 입구 쪽 변·깊이), inside(영역 안의 물건 수) } — 크기 칸·주차 칸 대신 영역 크기를 보여 줌 */
  const KEY_LAST = 'hjdm.wizard.last';
  async function dialog(name, embed = null) {
    const saved = (App.storage && App.storage.read(KEY_LAST)) || {};
    let type = typeOf(saved.type).id, sized = false; // sized: 크기를 직접 고쳤는지 (안 고쳤으면 권장 크기를 따라감)
    const numBox = (id, label, value, unit, note = '') => `
      <div class="field"><label class="field-label" for="${id}">${label}${note ? ` <small>${note}</small>` : ''}</label>
        <div class="field-box"><input id="${id}" type="text" inputmode="numeric" autocomplete="off" value="${value}"><span class="field-unit">${unit}</span></div></div>`;
    const digits = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? String(Math.round(Number(v))) : String(d));
    const r = await App.ui.dialog({
      title: '행사장 자동 배치',
      html: `
        <p class="dialog-note">${embed
          ? `고른 영역 ‘${esc(name)}’의 크기에 맞춰 무대·객석·부스·화장실·의무실·소화기·발전기·펜스·동선·안전 요원을 한 번에 놓습니다. 무대는 입구 맞은편에 둡니다. 영역 안에 이미 있는 것은 그대로 둡니다${embed.inside ? ` (지금 물건 ${embed.inside}개 — 겹칠 수 있습니다)` : ''}.`
          : '행사 종류와 부지 크기, 예상 인원을 넣으면 무대·객석·부스·화장실·의무실·소화기·발전기·펜스·동선·안전 요원까지 한 번에 놓습니다. 무대(체육대회는 본부석)는 입구 맞은편에 둡니다. 만든 뒤 자유롭게 고치세요.'}</p>
        <div class="tpl-list wz-types" role="radiogroup" aria-label="행사 종류">
          ${TYPES.map((t) => `<button type="button" class="tpl" role="radio" data-wz="${t.id}" aria-checked="${t.id === type}"><b>${t.name}</b><small>${t.desc}</small></button>`).join('')}
        </div>
        <div class="field-grid">
          ${numBox('wzN', '예상 인원', digits(saved.n, 1000), '명')}
          <div class="field wz-seat"><label class="field-label" for="wzSeat">관람</label><div class="field-box"><select id="wzSeat" class="field-select"><option value="standing">스탠딩</option><option value="seated"${saved.seating === 'seated' ? ' selected' : ''}>좌석</option></select></div></div>
        </div>
        ${embed ? '<p class="props-meta wz-size"></p>' : `<div class="field-grid">${numBox('wzW', '부지 가로', '', 'm')}${numBox('wzD', '부지 세로', '', 'm')}</div>`}
        <div class="field-grid">${numBox('wzBooths', '부스', 0, '칸')}${numBox('wzTrucks', '푸드트럭', 2, '대')}</div>
        <div class="field-grid">
          <div class="field"><label class="field-label" for="wzEnt">입구 쪽 <small>무대는 맞은편</small></label><div class="field-box"><select id="wzEnt" class="field-select">${ENTRANCES.map(([id, t]) => `<option value="${id}"${saved.entrance === id ? ' selected' : ''}>${t}</option>`).join('')}</select></div></div>
          <div class="field"><label class="field-label" for="wzSurf">바닥</label><div class="field-box"><select id="wzSurf" class="field-select">${Object.entries(SURFACE).map(([id, s]) => `<option value="${id}">${s[0]}</option>`).join('')}</select></div></div>
        </div>
        ${embed ? '' : `<div class="field-grid">${numBox('wzPark', '주차 칸', digits(saved.parking, 0), '칸', '0이면 안 만듦')}</div>`}
        <label class="check-row"><input type="checkbox" id="wzFence"${saved.fence === false ? '' : ' checked'}><span>둘레 펜스<small>입구와 양옆 비상구는 비워 둠</small></span></label>
        <label class="check-row"><input type="checkbox" id="wzNight"${saved.night ? ' checked' : ''}><span>야간 행사<small>해진 뒤까지 하면 관람 구역·동선을 조명 타워로 밝힘</small></span></label>
        <p class="props-meta wz-hint" aria-live="polite"></p>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '만들기', primary: true }],
      onOpen(body) {
        const $ = (id) => body.querySelector(`#${id}`);
        // 개수: 앞쪽 숫자만 (1,500 → 1500, 2000명 → 2000, 12.5 → 12). 길이(m): 1,000은 천 단위, 40,5는 소수점
        const int = (id) => { const m = $(id).value.replace(/[,\s]/g, '').match(/\d+/); return m ? m[0] : ''; };
        const metres = (id) => { const raw = $(id).value.trim(); return Number(/^\d{1,3}(,\d{3})+$/.test(raw) ? raw.replace(/,/g, '') : raw.replace(',', '.')); };
        const read = () => {
          const side = $('wzEnt').value, size = embed ? embed.sizeFor(side) : null;
          return {
            type, n: int('wzN'), seating: $('wzSeat').value, booths: int('wzBooths'), trucks: int('wzTrucks'),
            parking: embed ? 0 : int('wzPark'), surface: $('wzSurf').value, fence: $('wzFence').checked, night: $('wzNight').checked, name,
            // 영역에 넣을 때: 자리 셈의 크기(입구 쪽 변 × 깊이)를 그대로 — 돌리는 것은 옮겨 붙일 때 함
            entrance: embed ? 'bottom' : side, side,
            w: embed ? size.w : sized ? metres('wzW') * 1000 : null, d: embed ? size.d : sized ? metres('wzD') * 1000 : null,
          };
        };
        const sync = () => {
          const raw = read(), o = normalize(raw);
          const s = suggestSite(o);
          const m1 = (mm) => (Math.round(mm / 100) / 10).toLocaleString('ko-KR');
          if (embed) body.querySelector('.wz-size').textContent = `영역 크기: 입구 쪽 변 ${m1(raw.w)} m × 깊이 ${m1(raw.d)} m`;
          else if (!sized) { $('wzW').value = s.w; $('wzD').value = s.d; }
          body.querySelector('.wz-seat').hidden = type !== 'concert';
          const bl = BOOTH_LABEL[type];
          $('wzBooths').closest('.field').hidden = !bl;
          if (bl) { body.querySelector('label[for="wzBooths"]').textContent = bl[0]; $('wzBooths').parentNode.querySelector('.field-unit').textContent = bl[1]; }
          const area = (o.w / 1000) * (o.d / 1000), per = area / o.n;
          const size = embed ? (fits(o) ? '이 영역 크기에 맞춰 놓습니다. ' : `이 영역에는 다 들어가지 않을 수 있습니다 (권장 약 ${s.w} × ${s.d} m 이상) — 들어가는 만큼만 놓습니다. `)
            : !sized ? '부지 크기는 인원·부스·푸드트럭에 맞춘 권장값입니다 (실제 크기로 바꾸세요). '
              : fits(o) ? `권장 부지는 약 ${s.w} × ${s.d} m입니다. ` : `이 크기에는 다 들어가지 않을 수 있습니다 (권장 약 ${s.w} × ${s.d} m 이상). `;
          body.querySelector('.wz-hint').textContent = `${size}부지 ${n0(area)}㎡ · 한 사람에 ${per >= 10 ? n0(per) : (Math.round(per * 10) / 10).toLocaleString('ko-KR')}㎡.${embed ? '' : ` 크기는 ${LIMIT.w[0]}~${LIMIT.w[1]} m, 비우면 권장값.`}`;
        };
        /** 종류를 고름: 그 종류의 기본값(부스·푸드트럭·바닥)을 채움. keep이 있으면(기억해 둔 같은 종류) 그 값으로 */
        const setType = (id, keep = null) => {
          type = id;
          body.querySelectorAll('[data-wz]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.wz === id)));
          const t = typeOf(id);
          $('wzBooths').value = keep ? digits(keep.booths, t.booths) : t.booths;
          $('wzTrucks').value = keep ? digits(keep.trucks, t.trucks) : t.trucks;
          $('wzSurf').value = keep && SURFACE[keep.surface] ? keep.surface : id === 'market' ? 'paver' : 'grass';
          sync();
        };
        body.addEventListener('click', (e) => { const b = e.target.closest('[data-wz]'); if (b) setType(b.dataset.wz); });
        // 크기를 직접 고치면 그 값을 씀 (두 칸을 모두 비우면 다시 권장값)
        body.addEventListener('input', (e) => { if (!embed && (e.target.id === 'wzW' || e.target.id === 'wzD')) sized = !!($('wzW').value.trim() || $('wzD').value.trim()); sync(); });
        body.addEventListener('change', sync);
        body._read = () => { const raw = read(); return { ...normalize(raw), side: raw.side }; };
        setType(type, saved.type === type ? saved : null);
      },
    });
    if (r.id !== 'ok' || !r.body._read) return null;
    const o = r.body._read();
    if (App.storage) App.storage.write(KEY_LAST, { type: o.type, n: o.n, seating: o.seating, booths: o.booths, trucks: o.trucks, parking: embed ? saved.parking : o.parking, surface: o.surface, fence: o.fence, night: o.night, entrance: o.side });
    return o;
  }

  App.wizard = { TYPES, LIMIT, ENTRANCES, suggest, suggestSite, normalize, layout, fits, build, dialog, summary, rectOf, placeInZone, intoZone, get last() { return last; } };
})();
