'use strict';
// 몽글타워 공용 유틸리티. 모든 스크립트는 전역 네임스페이스 G 아래에 모입니다.
window.G = window.G || {};

(function () {
  const U = {};
  const TAU = Math.PI * 2;
  U.TAU = TAU;

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.chance = (p) => Math.random() < p;
  U.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  U.dist2 = (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
  U.angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  U.angleDiff = (a, b) => {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };

  U.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // 가중치 랜덤 선택. weightFn이 0 이하인 항목은 제외됩니다.
  U.weighted = (items, weightFn) => {
    let total = 0;
    for (const it of items) total += Math.max(0, weightFn(it));
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const it of items) {
      r -= Math.max(0, weightFn(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  };

  // 서로 다른 n개를 가중치로 뽑기
  U.weightedN = (items, n, weightFn) => {
    const pool = items.slice();
    const out = [];
    while (out.length < n && pool.length) {
      const it = U.weighted(pool, weightFn);
      if (!it) break;
      out.push(it);
      pool.splice(pool.indexOf(it), 1);
    }
    return out;
  };

  U.fmt = (n) => {
    n = Math.floor(n);
    const a = Math.abs(n);
    if (a < 10000) return String(n);
    const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    for (const [v, s] of units) {
      if (a >= v) {
        const x = n / v;
        return (x >= 100 ? x.toFixed(0) : x.toFixed(1)).replace(/\.0$/, '') + s;
      }
    }
    return String(n);
  };

  U.pct = (v) => (Math.round(v * 1000) / 10).toString().replace(/\.0$/, '') + '%';

  U.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  U.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 시드 고정 난수 (층 장식 배치 등에 사용)
  U.rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // 색상 밝게/어둡게 (amt: -1 ~ 1)
  const shadeCache = new Map();
  U.shade = (hex, amt) => {
    const key = hex + amt;
    let v = shadeCache.get(key);
    if (v) return v;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    let r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    v = `rgb(${r | 0},${g | 0},${b | 0})`;
    shadeCache.set(key, v);
    return v;
  };

  U.rgba = (hex, a) => {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`;
  };

  U.roundRect = (ctx, x, y, w, h, r) => {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  G.U = U;

  // 성장 곡선: 몬스터 능력치와 장비 능력치가 같은 곡선을 따릅니다.
  G.S = (lv) => Math.pow(1.06, lv - 1) * (1 + 0.02 * (lv - 1));

  G.dev = /[?&]dev\b/.test(location.search);
})();
