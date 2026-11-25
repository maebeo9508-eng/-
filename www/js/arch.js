/* 아치: 문·창문·개구부의 윗모양. 인테리어(평면 표시·3D·창호 일람표)와 설계 모드(아치 벽·가벽)가 함께 씀.
   좌표(mm): x는 개구부 왼쪽 끝에서 오른쪽으로 0~W, y는 개구부 아래 끝에서 위로 0~H.
   - 스프링 라인: 옆선이 곧게 올라가다 굽기 시작하는 높이 (H − rise)
   - rise: 스프링 라인에서 꼭대기까지의 높이. 모양마다 뜻이 조금 다름 (둥근 모서리는 모서리 반지름) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const r1 = (v) => Math.round(v * 10) / 10;

  /* 윗모양 목록: [값, 이름, 높이(rise)를 고칠 수 있는지, 고치는 칸의 이름] */
  const HEADS = [
    ['flat', '사각 (기본)', false, ''],
    ['round', '반원 아치', false, ''],
    ['segment', '완만한 아치', true, '아치 높이'],
    ['ellipse', '타원 아치', true, '아치 높이'],
    ['pointed', '뾰족 아치', true, '아치 높이'],
    ['corner', '둥근 모서리', true, '모서리 반지름'],
  ];
  const known = (head) => HEADS.some((h) => h[0] === head);
  const isArch = (head) => !!head && head !== 'flat' && known(head);
  const name = (head) => (HEADS.find((h) => h[0] === head) || HEADS[0])[1];
  const adjustable = (head) => !!(HEADS.find((h) => h[0] === head) || [])[2];
  const riseLabel = (head) => (HEADS.find((h) => h[0] === head) || [])[3] || '아치 높이';

  /** 그 모양의 기본 rise */
  function defaultRise(head, W) {
    switch (head) {
      case 'round': return W / 2;
      case 'segment': return Math.round(W * 0.2);
      case 'ellipse': return Math.round(W * 0.3);
      case 'pointed': return Math.round(W * 0.866); // 정삼각형 아치: 두 호의 반지름이 폭과 같음
      case 'corner': return Math.round(Math.min(W / 4, 300));
      default: return 0;
    }
  }
  /** 실제로 쓰는 값. 치수가 맞지 않으면(높이보다 큰 아치 등) 들어가게 줄임.
      돌려주는 값: { head, W, H, rise, spring } — 사각이면 rise 0 */
  function shape(head, W, H, rise) {
    W = Math.max(1, +W || 0); H = Math.max(1, +H || 0);
    if (!isArch(head)) return { head: 'flat', W, H, rise: 0, spring: H };
    let r = Number.isFinite(+rise) && +rise > 0 && adjustable(head) ? +rise : defaultRise(head, W);
    if (head === 'round') r = W / 2;
    if (head === 'segment') r = Math.min(r, W / 2);            // 그보다 높으면 반원을 넘어감
    if (head === 'pointed') r = Math.max(r, W / 2);            // 그보다 낮으면 뾰족해지지 않음
    if (head === 'corner') r = Math.min(r, W / 2);
    r = Math.max(1, Math.min(r, H));
    if (head === 'pointed' && r < W / 2) head = 'ellipse';     // 높이가 모자라면 타원으로
    return { head, W, H, rise: r1(r), spring: r1(H - r) };
  }

  /** 윗선의 점들: 왼쪽 스프링 (0, spring) → 꼭대기 → 오른쪽 스프링 (W, spring). n: 굽은 부분을 나누는 수 */
  function top(head, W, H, rise, n = 24) {
    const s = shape(head, W, H, rise), out = [];
    const push = (x, y) => { const p = [r1(Math.max(0, Math.min(s.W, x))), r1(Math.max(0, Math.min(s.H, y)))]; const q = out[out.length - 1]; if (!q || Math.abs(q[0] - p[0]) > 0.05 || Math.abs(q[1] - p[1]) > 0.05) out.push(p); };
    const m = s.W / 2, r = s.rise, y0 = s.spring;
    n = Math.max(4, Math.round(n));
    if (s.head === 'flat') { push(0, s.H); push(s.W, s.H); return out; }
    if (s.head === 'round' || s.head === 'ellipse') {
      for (let i = 0; i <= n; i++) { const t = Math.PI - (Math.PI * i) / n; push(m + m * Math.cos(t), y0 + r * Math.sin(t)); }
    } else if (s.head === 'segment') {
      const R = (m * m + r * r) / (2 * r), a = Math.asin(Math.min(1, m / R)), cy = y0 + r - R;
      for (let i = 0; i <= n; i++) { const t = Math.PI / 2 + a - (2 * a * i) / n; push(m + R * Math.cos(t), cy + R * Math.sin(t)); }
    } else if (s.head === 'pointed') {
      // 두 호: 가운데가 스프링 라인 위 (c, 0)과 (W − c, 0), 반지름 c — 각각 한쪽 스프링 점과 꼭대기를 지남
      const c = (m * m + r * r) / s.W, ta = Math.atan2(r, m - c), k = Math.max(2, Math.round(n / 2));
      for (let i = 0; i <= k; i++) { const t = Math.PI - ((Math.PI - ta) * i) / k; push(c + c * Math.cos(t), y0 + c * Math.sin(t)); }
      for (let i = 1; i <= k; i++) { const t = Math.PI - ta - ((Math.PI - ta) * i) / k; push(s.W - c + c * Math.cos(t), y0 + c * Math.sin(t)); }
    } else { // corner: 위 두 모서리를 둥글게
      const k = Math.max(2, Math.round(n / 3));
      for (let i = 0; i <= k; i++) { const t = Math.PI - (Math.PI / 2) * (i / k); push(r + r * Math.cos(t), y0 + r * Math.sin(t)); }
      for (let i = 0; i <= k; i++) { const t = Math.PI / 2 - (Math.PI / 2) * (i / k); push(s.W - r + r * Math.cos(t), y0 + r * Math.sin(t)); }
    }
    out[0] = [0, s.spring]; out[out.length - 1] = [s.W, s.spring];
    return out;
  }
  /** 개구부 전체 윤곽 (닫힌 다각형): 아래 왼쪽 → 아래 오른쪽 → 오른쪽 스프링 → 윗선을 거꾸로 → 왼쪽 스프링 */
  function outline(head, W, H, rise, n = 24) {
    const t = top(head, W, H, rise, n);
    return [[0, 0], [t[t.length - 1][0], 0], ...t.slice().reverse()];
  }
  /** 윗선의 길이 (mm): 아치를 따라 — 휨합판·몰딩·문틀 윗부분 길이 */
  function topLength(head, W, H, rise) {
    const t = top(head, W, H, rise, 96);
    let L = 0;
    for (let i = 0; i + 1 < t.length; i++) L += Math.hypot(t[i + 1][0] - t[i][0], t[i + 1][1] - t[i][1]);
    return r1(L);
  }
  /** 개구부 면적 (mm²): 사각보다 모서리만큼 작음 */
  function area(head, W, H, rise) {
    const s = shape(head, W, H, rise);
    if (s.head === 'flat') return s.W * s.H;
    const t = top(head, W, H, rise, 96);
    let a = 0;
    for (let i = 0; i + 1 < t.length; i++) a += ((t[i][1] + t[i + 1][1]) / 2) * (t[i + 1][0] - t[i][0]);
    return Math.round(a);
  }
  /** x에서의 개구부 높이 (윗선을 따라 곧게 이어 어림) */
  function yAt(head, W, H, rise, x) {
    const t = top(head, W, H, rise, 48);
    if (x <= 0) return t[0][1];
    for (let i = 0; i + 1 < t.length; i++) {
      const a = t[i], b = t[i + 1];
      if (x <= b[0] + 1e-6) return b[0] - a[0] < 1e-6 ? Math.max(a[1], b[1]) : a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    }
    return t[t.length - 1][1];
  }
  /** 문·창문 요소의 아치 값 (head·rise가 없으면 사각) */
  const of = (el) => shape(el && el.head, el ? el.width : 0, el ? el.height : 0, el && el.rise);
  /** 규격 글자에 붙는 말: ‘반원 아치’, ‘완만한 아치 180’ (사각이면 빈 글자) */
  function label(el) {
    const s = of(el);
    if (s.head === 'flat') return '';
    return `${name(s.head)}${adjustable(s.head) ? ` ${Math.round(s.rise)}` : ''}`;
  }

  App.arch = { HEADS, isArch, name, adjustable, riseLabel, defaultRise, shape, top, outline, topLength, area, yAt, of, label };
})();
