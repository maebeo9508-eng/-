/* 스냅: 끝점 > 중간점 > 벽면·선 위 > (직교) > 격자 순으로 붙인다.
   끝점·중간점이 가까우면 직교보다 우선 (CAD와 같음).
   끝점에는 벽 모서리(면이 꺾이는 점)도 들어감. 벽을 그릴 때는 이어 붙도록 중심선 끝점만.
   격자 간격은 확대할수록 잘게: 설정 간격(100)이 화면에서 크면 50 → 20 → 10 → 5mm (가장 크게 확대하면 5mm)
   벽면·선 위: 벽을 그릴 때는 벽 중심선(T자로 이어져 방이 닫히게), 다른 도구는 벽의 양쪽 면(안목 치수),
   그리고 배관·전선관 선과 가져온 도면의 선. 직교 중이면 직교 방향 선과 만나는 점 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const RADIUS_PX = { mouse: 12, touch: 24 };
  const STEP_MAX_PX = 30; // 격자 한 칸이 화면에서 이보다 크면 더 잘게 나눔 (손가락으로 집기 좋은 폭)
  const NICE = [5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
  const roundTo = (v, step) => Math.round(v / step) * step;
  const visible = (el) => !App.layers || App.layers.visible(el);

  /** 스냅 대상 선분들: [ax, ay, bx, by] (도면 좌표). p 둘레 r 안에 걸칠 수 있는 것만 */
  function segmentsNear(p, r, opts) {
    const out = [];
    const near = (ax, ay, bx, by) => {
      if (Math.min(ax, bx) - r > p.x || Math.max(ax, bx) + r < p.x || Math.min(ay, by) - r > p.y || Math.max(ay, by) + r < p.y) return;
      out.push([ax, ay, bx, by]);
    };
    for (const el of App.doc.all()) {
      if ((opts.exclude && opts.exclude.has(el.id)) || !visible(el)) continue;
      if (el.type === 'wall') {
        const L = Math.hypot(el.end.x - el.start.x, el.end.y - el.start.y);
        if (L < 1) continue;
        if (opts.center) {
          near(el.start.x, el.start.y, el.end.x, el.end.y);
        } else {
          const nx = -(el.end.y - el.start.y) / L * (el.thickness / 2), ny = (el.end.x - el.start.x) / L * (el.thickness / 2);
          near(el.start.x + nx, el.start.y + ny, el.end.x + nx, el.end.y + ny);
          near(el.start.x - nx, el.start.y - ny, el.end.x - nx, el.end.y - ny);
        }
      } else if (el.type === 'line') {
        near(el.start.x, el.start.y, el.end.x, el.end.y);
      } else {
        const t = App.model.TYPES[el.type];
        if (t && t.segmentsNear) t.segmentsNear(el, p, r).forEach((sg) => near(...sg));
      }
    }
    return out;
  }

  const snap = {
    /** 지금 배율에서 붙는 격자 간격(mm). 설정 간격을 나누어 떨어지는 값으로만 잘게 (격자점이 어긋나지 않게) */
    step(scale = App.plan ? App.plan.view.scale : 0) {
      const g = App.settings.gridSize || 100;
      if (!(g * scale > STEP_MAX_PX)) return g;
      const finer = NICE.filter((v) => v < g && Math.abs(g / v - Math.round(g / v)) < 1e-9);
      let best = g;
      for (const v of finer) {
        best = v;
        if (v * scale <= STEP_MAX_PX) break;
      }
      return best;
    },

    /** 스냅이 잡히는 거리(mm). 화면에서 일정한 픽셀 크기 */
    radius(touch) {
      return (touch ? RADIUS_PX.touch : RADIUS_PX.mouse) / App.plan.view.scale;
    },

    /**
     * raw: 도면 좌표(mm)
     * opts.from: 직교 기준점, opts.ortho: 직교 적용 여부
     * opts.exclude: 스냅 대상에서 뺄 요소 id 집합, opts.extra: 추가 스냅 점
     * 반환 { x, y, kind: 'end' | 'mid' | 'grid' | 'ortho' | null }
     */
    point(raw, opts = {}) {
      const s = App.settings;
      const r = snap.radius(opts.touch);

      if (s.snapEnd || s.snapMid) {
        let best = null, bestD = Infinity;
        const consider = (p) => {
          if (p.kind === 'end' ? !s.snapEnd : !s.snapMid) return;
          const d = Math.hypot(p.x - raw.x, p.y - raw.y) * (p.kind === 'mid' ? 1.25 : 1);
          if (d <= r && d < bestD) {
            best = p;
            bestD = d;
          }
        };
        for (const el of App.doc.all()) {
          if ((opts.exclude && opts.exclude.has(el.id)) || !visible(el)) continue;
          const t = App.model.TYPES[el.type];
          if (t && t.snapPoints) t.snapPoints(el).forEach(consider);
          if (el.type === 'wall' && !opts.center && s.snapEnd) App.joins.corners(el).forEach((p) => consider({ x: p.x, y: p.y, kind: 'end' }));
          if (t && t.snapNear && s.snapEnd) t.snapNear(el, raw, r).forEach(consider); // 가져온 도면: 가까운 꼭짓점만 찾아 봄
        }
        (opts.extra || []).forEach(consider);
        if (best) return { x: best.x, y: best.y, kind: best.kind };
      }

      if (s.snapFace) {
        const n = snap.near(raw, r, opts);
        if (n) return n;
      }

      const g = snap.step();
      if (opts.ortho && opts.from) {
        const f = opts.from;
        const dx = raw.x - f.x, dy = raw.y - f.y;
        // 길이를 격자 간격 단위로 맞춤 (시작점이 격자 밖이어도 길이는 딱 떨어짐)
        if (Math.abs(dx) >= Math.abs(dy)) {
          return { x: f.x + (s.snapGrid ? roundTo(dx, g) : dx), y: f.y, kind: 'ortho' };
        }
        return { x: f.x, y: f.y + (s.snapGrid ? roundTo(dy, g) : dy), kind: 'ortho' };
      }

      if (s.snapGrid) return { x: roundTo(raw.x, g), y: roundTo(raw.y, g), kind: 'grid' };
      return { x: raw.x, y: raw.y, kind: null };
    },

    /** 벽면·선 위의 가장 가까운 점. 직교 중이면(opts.ortho, opts.from) 직교 방향 선과 만나는 점 */
    near(raw, r, opts = {}) {
      const segs = segmentsNear(raw, r, opts);
      if (!segs.length) return null;
      let best = null, bestD = r;
      const f = opts.ortho && opts.from ? opts.from : null;
      const horizontal = f && Math.abs(raw.x - f.x) >= Math.abs(raw.y - f.y);
      for (const [ax, ay, bx, by] of segs) {
        const dx = bx - ax, dy = by - ay;
        let x, y;
        if (f) {
          // 직교선(가로면 y = f.y, 세로면 x = f.x)과 선분이 만나는 점
          const den = horizontal ? dy : dx;
          if (Math.abs(den) < 1e-9) continue;
          const t = horizontal ? (f.y - ay) / dy : (f.x - ax) / dx;
          if (t < 0 || t > 1) continue;
          x = ax + dx * t;
          y = ay + dy * t;
        } else if (Math.abs(dy) < 1e-9 || Math.abs(dx) < 1e-9) {
          // 가로·세로 선: 선의 좌표는 그대로 두고 선을 따라서는 격자에 (T자 이음이 딱 떨어지게)
          const g = App.settings.snapGrid ? snap.step() : 0;
          const along = (v, a, b) => {
            const lo = Math.min(a, b), hi = Math.max(a, b);
            const r2 = g ? Math.round(v / g) * g : v;
            return Math.max(lo, Math.min(hi, r2 >= lo && r2 <= hi ? r2 : v));
          };
          if (Math.abs(dy) < 1e-9) { x = along(raw.x, ax, bx); y = ay; }
          else { x = ax; y = along(raw.y, ay, by); }
        } else {
          const len2 = dx * dx + dy * dy;
          const t = len2 ? Math.max(0, Math.min(1, ((raw.x - ax) * dx + (raw.y - ay) * dy) / len2)) : 0;
          x = ax + dx * t;
          y = ay + dy * t;
        }
        const d = Math.hypot(x - raw.x, y - raw.y);
        if (d <= bestD) {
          bestD = d;
          best = { x, y, kind: 'near' };
        }
      }
      return best;
    },

    /** 기호·기둥을 옮길 때: 가장자리가 벽면 가까이 오면 벽면에 딱 붙임. 두 벽이 만나는 구석이면 양쪽 벽면에.
        dx, dy: 격자 등으로 이미 맞춘 이동량. 붙을 벽면이 없으면 null */
    flush(el, dx, dy, exclude, touch) {
      const T = App.model.TYPES[el.type];
      if (!T || !T.extent || !App.settings.snapFace) return null;
      const r = snap.radius(touch);
      const c = { x: el.x + dx, y: el.y + dy };
      const used = []; // 이미 붙인 벽면 방향 (같은 방향 벽에는 두 번 붙이지 않음)
      for (let pass = 0; pass < 2; pass++) {
        let best = null;
        for (const w of App.doc.all()) {
          if (w.type !== 'wall' || (exclude && exclude.has(w.id)) || !visible(w)) continue;
          const L = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
          if (L < 1) continue;
          const d = { x: (w.end.x - w.start.x) / L, y: (w.end.y - w.start.y) / L };
          const n = { x: -d.y, y: d.x };
          if (used.some((m) => Math.abs(m.x * n.y - m.y * n.x) < 0.5)) continue;
          const rx = c.x - w.start.x, ry = c.y - w.start.y;
          const along = rx * d.x + ry * d.y, off = rx * n.x + ry * n.y;
          const eD = T.extent(el, d);
          if (along + eD < 0 || along - eD > L) continue; // 벽 옆이 아님
          const gap = Math.abs(off) - T.extent(el, n) - w.thickness / 2; // 가장자리와 벽면 사이 (음수면 벽 속)
          if (Math.abs(gap) > r || (best && Math.abs(gap) >= Math.abs(best.gap))) continue;
          const side = off >= 0 ? 1 : -1;
          best = { gap, n: { x: n.x * side, y: n.y * side } };
        }
        if (!best) break;
        c.x -= best.n.x * best.gap;
        c.y -= best.n.y * best.gap;
        used.push(best.n);
      }
      return used.length ? { dx: c.x - el.x, dy: c.y - el.y } : null;
    },

    /** 이동할 때: 움직이는 요소의 끝점이 다른 요소 끝점에 닿으면 맞춰 줌 */
    moveDelta(dx, dy, movingPoints, exclude, touch) {
      const s = App.settings;
      if (s.snapEnd) {
        const r = snap.radius(touch);
        let best = null, bestD = Infinity;
        for (const el of App.doc.all()) {
          if (exclude.has(el.id) || !visible(el)) continue;
          const t = App.model.TYPES[el.type];
          if (t && t.snapNear) {
            movingPoints.slice(0, 200).forEach((p) => {
              t.snapNear(el, { x: p.x + dx, y: p.y + dy }, r).forEach((target) => {
                const d = Math.hypot(target.x - (p.x + dx), target.y - (p.y + dy));
                if (d <= r && d < bestD) {
                  best = { dx: target.x - p.x, dy: target.y - p.y, at: target };
                  bestD = d;
                }
              });
            });
          }
          if (!t || !t.snapPoints) continue;
          for (const target of t.snapPoints(el)) {
            if (target.kind !== 'end') continue;
            for (const p of movingPoints) {
              const d = Math.hypot(target.x - (p.x + dx), target.y - (p.y + dy));
              if (d <= r && d < bestD) {
                best = { dx: target.x - p.x, dy: target.y - p.y, at: target };
                bestD = d;
              }
            }
          }
        }
        if (best) return { dx: best.dx, dy: best.dy, kind: 'end', at: best.at };
      }
      if (s.snapGrid) return { dx: roundTo(dx, snap.step()), dy: roundTo(dy, snap.step()), kind: 'grid' };
      return { dx, dy, kind: null };
    },
  };

  App.snap = snap;
})();
