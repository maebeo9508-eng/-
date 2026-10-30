/* 벽 이음: 벽 끝이 다른 벽과 어떻게 만나는지 정한다. 외곽선 그림, 스터드 위치, 물량이 모두 이 결과를 쓴다.
   - T자: 벽 끝이 다른 벽 중간(중심선 위)에 닿거나, 일직선으로 이어진 두 벽 사이에 닿으면 그 벽 면에서 끊음.
     겹치는 만큼(상대 벽 두께의 반)은 길이·면적·틀 물량에서 빠짐
   - ㄱ자: 두 벽 끝만 만나면 비스듬히 맞춤. 중심선 길이는 그대로 두고, 스터드는 상대 벽 안으로 들어가지 않게
   - 일직선: 같은 종류 벽이 이어지면 이음 자리 스터드는 한 개만 (먼저 그린 벽이 셈)
   벽 방향 d = 시작→끝, 옆 방향 n = d를 왼쪽으로 90도. 옆으로 off만큼 떨어진 줄에서 잰 값을 돌려줌 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const G = App.geom;

  const TOL = 1;         // 벽 끝이 다른 벽 중심선 위에 있다고 볼 거리(mm)
  const MITER_LIMIT = 5; // ㄱ자 모서리가 두께의 5배보다 길게 뾰족해지면 맞춤 생략
  const MIN_SIN = 0.2;   // 이보다 비스듬히(약 12도 미만) 붙으면 T자로 끊지 않음
  const FREE = { cut: null, joined: false, shareStud: false };
  const PLAIN = { cut: null, joined: true, shareStud: false };

  const key = (p) => `${Math.round(p.x)},${Math.round(p.y)}`;
  const dirOf = (w) => G.unit({ x: w.end.x - w.start.x, y: w.end.y - w.start.y });
  /** 벽 끝에서 벽 안쪽으로 향하는 방향 */
  const away = (w, at) => {
    const d = dirOf(w);
    return at === 'start' ? d : { x: -d.x, y: -d.y };
  };
  const dot = (a, b) => a.x * b.x + a.y * b.y;

  let cache = { version: -1, map: new Map() };

  /** 점 P가 벽 o의 중간(끝이 아닌 곳) 중심선 위에 있는지 */
  function passesThrough(o, P) {
    const h = TOL;
    if (P.x < Math.min(o.start.x, o.end.x) - h || P.x > Math.max(o.start.x, o.end.x) + h ||
        P.y < Math.min(o.start.y, o.end.y) - h || P.y > Math.max(o.start.y, o.end.y) + h) return false;
    const c = G.closestOnSegment(P, o.start, o.end);
    const L = G.dist(o.start, o.end);
    return c.dist <= TOL && c.t * L > TOL && (1 - c.t) * L > TOL;
  }

  /** 방향 e, 두께 th인 벽(중심선이 P를 지남)에서 방향 a 쪽 면: 자르는 선 */
  function faceCut(P, e, th, a) {
    const m = G.perp(e);
    const side = dot(a, m) >= 0 ? 1 : -1;
    return { p: { x: P.x + m.x * side * th / 2, y: P.y + m.y * side * th / 2 }, e };
  }

  /** 벽 끝 하나가 만나는 모양 */
  function endJoin(g, group, passing) {
    const w = g.wall, P = w[g.at], a = away(w, g.at);
    // 다른 벽 중간에 닿음: 그 벽 면에서 끊음
    for (const o of passing) {
      const e = dirOf(o);
      if (Math.abs(G.cross(a, e)) < MIN_SIN) continue;
      return { cut: faceCut(P, e, o.thickness, a), joined: true, shareStud: false };
    }
    const others = group.filter((o) => o !== g);
    if (!others.length) return FREE;
    const dirs = others.map((o) => away(o.wall, o.at));
    // 일직선으로 이어지는 벽이 있으면 이 벽은 지나가는 쪽
    const si = dirs.findIndex((e) => dot(a, e) < -0.999);
    if (si >= 0) {
      const o = others[si].wall;
      return { cut: null, joined: true, shareStud: o.typeId === w.typeId && o.id < w.id };
    }
    // 일직선으로 이어진 두 벽 사이에 붙음 (T자를 벽 셋으로 그린 경우)
    for (let i = 0; i < others.length; i++) {
      for (let j = i + 1; j < others.length; j++) {
        if (dot(dirs[i], dirs[j]) > -0.999 || Math.abs(G.cross(a, dirs[i])) < MIN_SIN) continue;
        const th = Math.max(others[i].wall.thickness, others[j].wall.thickness);
        return { cut: faceCut(P, dirs[i], th, a), joined: true, shareStud: false };
      }
    }
    if (others.length !== 1) return PLAIN;
    // ㄱ자: 비스듬히 맞춤. 이 벽의 +na 면은 상대 벽의 -m 면과, -na 면은 +m 면과 만난다
    const o = others[0].wall, e = dirs[0];
    if (Math.abs(G.cross(a, e)) < 0.02) return PLAIN; // 같은 방향으로 겹침
    const na = G.perp(a), m = G.perp(e);
    const h = w.thickness / 2, k = o.thickness / 2;
    const p2 = G.lineIntersect({ x: P.x + na.x * h, y: P.y + na.y * h }, a, { x: P.x - m.x * k, y: P.y - m.y * k }, e);
    const m2 = G.lineIntersect({ x: P.x - na.x * h, y: P.y - na.y * h }, a, { x: P.x + m.x * k, y: P.y + m.y * k }, e);
    const limit = MITER_LIMIT * Math.max(h, k);
    if (!p2 || !m2 || G.dist(p2, P) > limit || G.dist(m2, P) > limit || G.dist(p2, m2) < 1e-6) return PLAIN;
    return { cut: { p: p2, e: G.unit({ x: m2.x - p2.x, y: m2.y - p2.y }) }, joined: true, shareStud: false };
  }

  function build() {
    const walls = [];
    const ends = new Map(); // 끝점 위치 → 그 점에 닿는 벽 끝들
    for (const el of App.doc.all()) {
      if (el.type !== 'wall' || G.dist(el.start, el.end) < 1) continue;
      walls.push(el);
      ['start', 'end'].forEach((at) => {
        const k = key(el[at]);
        if (!ends.has(k)) ends.set(k, []);
        ends.get(k).push({ wall: el, at });
      });
    }
    const map = new Map();
    ends.forEach((group) => {
      const P = group[0].wall[group[0].at];
      const passing = walls.filter((o) => !group.some((g) => g.wall === o) && passesThrough(o, P));
      group.forEach((g) => {
        if (!map.has(g.wall.id)) map.set(g.wall.id, { start: FREE, end: FREE });
        map.get(g.wall.id)[g.at] = endJoin(g, group, passing);
      });
    });
    cache = { version: App.doc.version, map };
    // 너무 짧아 양쪽을 자르면 뒤집히는 벽은 자르지 않음
    walls.forEach((w) => {
      const j = map.get(w.id);
      if (!j.start.cut && !j.end.cut) return;
      const L = G.dist(w.start, w.end), h = w.thickness / 2;
      if ([h, -h].some((off) => L - inset(w, 'start', off) - inset(w, 'end', off) < 1)) {
        map.set(w.id, { start: { ...j.start, cut: null }, end: { ...j.end, cut: null } });
      }
    });
    return map;
  }

  /** 벽 양 끝의 이음 { start, end }. 각 끝: { cut: {p, e} | null, joined, shareStud } */
  function of(w) {
    const map = cache.version === App.doc.version ? cache.map : build();
    return (App.doc.get(w.id) === w && map.get(w.id)) || { start: FREE, end: FREE };
  }

  /** at 끝에서 벽 안쪽으로 잰, 옆으로 off 떨어진 줄 위의 자른 자리까지 거리 (mm). 밖으로 나가면 음수 */
  function inset(w, at, off) {
    const j = of(w)[at];
    if (!j.cut) return 0;
    const n = G.perp(dirOf(w));
    const a = away(w, at);
    const q = { x: w[at].x + n.x * off, y: w[at].y + n.y * off };
    const X = G.lineIntersect(q, a, j.cut.p, j.cut.e);
    return X ? dot({ x: X.x - q.x, y: X.y - q.y }, a) : 0;
  }

  /** 옆으로 off 떨어진 줄에서 잰 벽 길이 */
  function lengthAt(w, off) {
    return Math.max(0, G.dist(w.start, w.end) - inset(w, 'start', off) - inset(w, 'end', off));
  }

  /** 틀(스터드·다루끼)이 들어가는 층의 옆 위치 범위 { lo, hi }. 층 순서는 마감 쪽 석고 → 틀 */
  function frameBand(w, t) {
    const T = w.thickness;
    const pos = t.boardFace * t.boardT;
    const sgn = w.flip ? -1 : 1;
    const o1 = (T / 2 - pos) * sgn, o2 = (T / 2 - pos - t.frameDepth) * sgn;
    return { lo: Math.min(o1, o2), hi: Math.max(o1, o2) };
  }

  const joins = {
    of,
    inset,
    lengthAt,
    frameBand,

    /** 실제 벽 길이: T자로 붙은 쪽은 상대 벽 면까지 */
    length(w) {
      return lengthAt(w, 0);
    },

    /** 외곽선 네 점 [시작+n, 끝+n, 끝-n, 시작-n]과 끝마다 다른 벽이 붙었는지 */
    outline(w) {
      const L = G.dist(w.start, w.end);
      const d = dirOf(w), n = G.perp(d), h = w.thickness / 2;
      const at = (s, off) => ({ x: w.start.x + d.x * s + n.x * off, y: w.start.y + d.y * s + n.y * off });
      const j = of(w);
      return {
        pts: [at(inset(w, 'start', h), h), at(L - inset(w, 'end', h), h), at(L - inset(w, 'end', -h), -h), at(inset(w, 'start', -h), -h)],
        joined: [j.start.joined, j.end.joined],
      };
    },

    /** 틀 배치: 세로재 가운데 위치들(시작점에서 잰 mm)과 가로재 한 줄 길이.
        세로재 수 = 틀 길이 ÷ 간격 올림 + 1. 일직선 이음에서 붙은 벽이 세는 자리는 뺌. sw는 그림용 세로재 폭 */
    frame(w, t, sw = 0) {
      const L = G.dist(w.start, w.end);
      const b = frameBand(w, t);
      const s0 = Math.max(inset(w, 'start', b.lo), inset(w, 'start', b.hi));
      const s1 = L - Math.max(inset(w, 'end', b.lo), inset(w, 'end', b.hi));
      const run = lengthAt(w, (b.lo + b.hi) / 2);
      const F = s1 - s0;
      const studs = [];
      if (F > 0 && t.frameSpacing > 0) {
        const count = Math.ceil(F / t.frameSpacing - 1e-9) + 1;
        const j = of(w);
        const lo = s0 + sw / 2, hi = Math.max(lo, s1 - sw / 2);
        for (let i = 0; i < count; i++) {
          if ((i === 0 && j.start.shareStud) || (i === count - 1 && j.end.shareStud)) continue;
          studs.push(G.clamp(s0 + i * t.frameSpacing, lo, hi));
        }
      }
      return { studs, run };
    },

    /** 벽 끝 모서리 점들 (치수·선을 벽 모서리에 붙일 때). 일직선으로 이어진 끝은 모서리가 아니라 뺌 */
    corners(w) {
      const o = joins.outline(w);
      const j = of(w);
      const pts = [];
      const keep = (e) => !e.joined || e.cut;
      if (keep(j.start)) pts.push(o.pts[0], o.pts[3]);
      if (keep(j.end)) pts.push(o.pts[1], o.pts[2]);
      return pts;
    },
  };

  App.joins = joins;
})();
