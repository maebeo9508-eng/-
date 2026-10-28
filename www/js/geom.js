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

    /** 다각형 넓이(부호 있음, mm²). 점 순서에 따라 + 또는 - */
    signedArea(pts) {
      let s = 0;
      for (let i = 0, n = pts.length; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        s += a.x * b.y - b.x * a.y;
      }
      return s / 2;
    },

    perimeter(pts) {
      let s = 0;
      for (let i = 0, n = pts.length; i < n; i++) s += geom.dist(pts[i], pts[(i + 1) % n]);
      return s;
    },

    pointInPolygon(p, pts) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside;
    },

    /** 다각형 안쪽의 한 점 (이름표 자리). 무게중심이 안에 있으면 그것, 아니면 가장 넓은 가로 구간의 가운데 */
    interiorPoint(pts) {
      const a = geom.signedArea(pts);
      let cx = 0, cy = 0;
      for (let i = 0, n = pts.length; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n];
        const f = p.x * q.y - q.x * p.y;
        cx += (p.x + q.x) * f;
        cy += (p.y + q.y) * f;
      }
      if (Math.abs(a) > EPS) {
        const c = { x: cx / (6 * a), y: cy / (6 * a) };
        if (geom.pointInPolygon(c, pts)) return c;
      }
      let minY = Infinity, maxY = -Infinity;
      pts.forEach((p) => { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
      let best = null, bestW = -1;
      for (let k = 1; k < 8; k++) {
        const y = minY + ((maxY - minY) * k) / 8;
        const xs = [];
        for (let i = 0, n = pts.length; i < n; i++) {
          const p = pts[i], q = pts[(i + 1) % n];
          if ((p.y > y) !== (q.y > y)) xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
        }
        xs.sort((u, v) => u - v);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          if (xs[i + 1] - xs[i] > bestW) {
            bestW = xs[i + 1] - xs[i];
            best = { x: (xs[i] + xs[i + 1]) / 2, y };
          }
        }
      }
      return best || pts[0];
    },

    /** 일직선 위의 가운데 점을 뺌 (넓이는 그대로) */
    simplify(pts, tol = 0.5) {
      const out = pts.slice();
      let changed = true;
      while (changed && out.length > 3) {
        changed = false;
        for (let i = 0; i < out.length; i++) {
          const a = out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length];
          const ab = geom.dist(a, b), bc = geom.dist(b, c), ac = geom.dist(a, c);
          if (Math.abs(ab + bc - ac) < tol) {
            out.splice(i, 1);
            changed = true;
            break;
          }
        }
      }
      return out;
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
