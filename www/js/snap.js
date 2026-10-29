/* 스냅: 끝점 > 중간점 > (직교) > 격자 순으로 붙인다.
   끝점·중간점이 가까우면 직교보다 우선 (CAD와 같음) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const RADIUS_PX = { mouse: 12, touch: 24 };
  const roundTo = (v, step) => Math.round(v / step) * step;

  const snap = {
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
          if (opts.exclude && opts.exclude.has(el.id)) continue;
          const t = App.model.TYPES[el.type];
          if (t && t.snapPoints) t.snapPoints(el).forEach(consider);
          if (t && t.snapNear && s.snapEnd) t.snapNear(el, raw, r).forEach(consider); // 가져온 도면: 가까운 꼭짓점만 찾아 봄
        }
        (opts.extra || []).forEach(consider);
        if (best) return { x: best.x, y: best.y, kind: best.kind };
      }

      const g = s.gridSize;
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

    /** 이동할 때: 움직이는 요소의 끝점이 다른 요소 끝점에 닿으면 맞춰 줌 */
    moveDelta(dx, dy, movingPoints, exclude, touch) {
      const s = App.settings;
      if (s.snapEnd) {
        const r = snap.radius(touch);
        let best = null, bestD = Infinity;
        for (const el of App.doc.all()) {
          if (exclude.has(el.id)) continue;
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
      if (s.snapGrid) return { dx: roundTo(dx, s.gridSize), dy: roundTo(dy, s.gridSize), kind: 'grid' };
      return { dx, dy, kind: null };
    },
  };

  App.snap = snap;
})();
