/* 평면 기하 계산 (단위 mm) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const EPS = 1e-9;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const geom = {
    clamp,
    dist(a, b) {
      return Math.hypot(b.x - a.x, b.y - a.y);
    },
    unit(v) {
      const l = Math.hypot(v.x, v.y);
      return l < EPS ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
    },
    /** 왼쪽으로 90도 돌린 벡터 */
    perp(v) {
      return { x: -v.y, y: v.x };
    },
    cross(a, b) {
      return a.x * b.y - a.y * b.x;
    },
    samePoint(a, b, tol = 0.5) {
      return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
    },

    /** 점 p에서 선분 ab 위의 가장 가까운 점 */
    closestOnSegment(p, a, b) {
      const abx = b.x - a.x, aby = b.y - a.y;
      const l2 = abx * abx + aby * aby;
      const t = l2 < EPS ? 0 : clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / l2, 0, 1);
      const q = { x: a.x + abx * t, y: a.y + aby * t };
      return { point: q, t, dist: Math.hypot(p.x - q.x, p.y - q.y) };
    },

    /** 두 직선 p + t·a 와 q + u·b 의 교점. 평행이면 null */
    lineIntersect(p, a, q, b) {
      const den = a.x * b.y - a.y * b.x;
      if (Math.abs(den) < EPS) return null;
      const t = ((q.x - p.x) * b.y - (q.y - p.y) * b.x) / den;
      return { x: p.x + a.x * t, y: p.y + a.y * t };
    },

    segmentsIntersect(a, b, c, d) {
      const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
      const on = (p, q, r) =>
        Math.min(p.x, r.x) - EPS <= q.x && q.x <= Math.max(p.x, r.x) + EPS &&
        Math.min(p.y, r.y) - EPS <= q.y && q.y <= Math.max(p.y, r.y) + EPS;
      const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
      if (o1 !== o2 && o3 !== o4) return true;
      return (o1 === 0 && on(a, c, b)) || (o2 === 0 && on(a, d, b)) ||
        (o3 === 0 && on(c, a, d)) || (o4 === 0 && on(c, b, d));
    },

    pointInRect(p, r) {
      return p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;
    },

    segmentIntersectsRect(a, b, r) {
      if (geom.pointInRect(a, r) || geom.pointInRect(b, r)) return true;
      const c = [
        { x: r.minX, y: r.minY }, { x: r.maxX, y: r.minY },
        { x: r.maxX, y: r.maxY }, { x: r.minX, y: r.maxY },
      ];
      for (let i = 0; i < 4; i++) if (geom.segmentsIntersect(a, b, c[i], c[(i + 1) % 4])) return true;
      return false;
    },

    rectsOverlap(a, b) {
      return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
    },

    rectFromPoints(a, b) {
      return {
        minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y),
        maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y),
      };
    },
  };

  App.geom = geom;
})();
