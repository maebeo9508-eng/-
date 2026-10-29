/* 방 인식.
   벽 중심선을 교차점·T자 이음·겹침에서 나눠 평면 그래프를 만들고, 그 그래프의 닫힌 면(face)을 찾는다.
   한쪽 끝이 열린 벽(칸막이 일부 등)은 경계가 될 수 없으므로 미리 걷어 낸다. */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const G = App.geom;

  const TOL = 1; // mm. 이만큼 가까우면 같은 점, 벽 위의 점으로 봄

  let cache = { version: -1, faces: [] };

  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const at = (w, t) => ({ x: w.start.x + (w.end.x - w.start.x) * t, y: w.start.y + (w.end.y - w.start.y) * t });

  /** 닫힌 면 목록 { points, area(mm²), wallIds }. 도면이 바뀔 때만 다시 계산 */
  function faces() {
    if (cache.version === App.doc.version) return cache.faces;
    const walls = [...App.doc.all()].filter((e) => e.type === 'wall' && G.dist(e.start, e.end) > TOL);

    // 1) 벽마다 나눌 위치(0~1)
    const cuts = walls.map(() => [0, 1]);
    const boxes = walls.map((w) => App.model.TYPES.wall.bounds(w));
    for (let i = 0; i < walls.length; i++) {
      const a = walls[i], d1 = sub(a.end, a.start), l1 = Math.hypot(d1.x, d1.y);
      for (let j = i + 1; j < walls.length; j++) {
        if (!G.rectsOverlap(boxes[i], boxes[j])) continue;
        const b = walls[j], d2 = sub(b.end, b.start), l2 = Math.hypot(d2.x, d2.y);
        const rs = sub(b.start, a.start);
        const den = G.cross(d1, d2);
        if (Math.abs(den) > 1e-9 * l1 * l2) {
          const t = G.cross(rs, d2) / den;
          const u = G.cross(rs, d1) / den;
          const e1 = TOL / l1, e2 = TOL / l2;
          if (t >= -e1 && t <= 1 + e1 && u >= -e2 && u <= 1 + e2) {
            cuts[i].push(G.clamp(t, 0, 1));
            cuts[j].push(G.clamp(u, 0, 1));
          }
        } else if (Math.abs(G.cross(d1, rs)) / l1 < TOL) {
          // 같은 선 위에서 겹치는 벽: 서로의 끝점에서 나눔
          [b.start, b.end].forEach((q) => {
            const t = dot(sub(q, a.start), d1) / (l1 * l1);
            if (t > 0 && t < 1) cuts[i].push(t);
          });
          [a.start, a.end].forEach((q) => {
            const u = dot(sub(q, b.start), d2) / (l2 * l2);
            if (u > 0 && u < 1) cuts[j].push(u);
          });
        }
      }
    }

    // 2) 점과 변 (가까운 점은 하나로)
    const verts = [];
    const vIndex = new Map();
    const vid = (p) => {
      const k = `${Math.round(p.x / TOL)},${Math.round(p.y / TOL)}`;
      let id = vIndex.get(k);
      if (id === undefined) {
        id = verts.length;
        verts.push({ x: p.x, y: p.y });
        vIndex.set(k, id);
      }
      return id;
    };
    const edges = new Map(); // "작은id|큰id" → 그 변을 이루는 벽 id들
    const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    walls.forEach((w, i) => {
      const ts = cuts[i].sort((x, y) => x - y);
      let prev = vid(at(w, ts[0]));
      for (let k = 1; k < ts.length; k++) {
        const cur = vid(at(w, ts[k]));
        if (cur === prev) continue;
        const key = edgeKey(prev, cur);
        if (!edges.has(key)) edges.set(key, new Set());
        edges.get(key).add(w.id);
        prev = cur;
      }
    });

    // 3) 이웃 목록. 한쪽만 이어진 점은 경계가 될 수 없으니 차례로 걷어 냄
    const adj = verts.map(() => new Set());
    edges.forEach((_, key) => {
      const [a, b] = key.split('|').map(Number);
      adj[a].add(b);
      adj[b].add(a);
    });
    const queue = [];
    adj.forEach((s, v) => s.size === 1 && queue.push(v));
    while (queue.length) {
      const v = queue.pop();
      if (adj[v].size !== 1) continue;
      const [u] = adj[v];
      adj[v].delete(u);
      adj[u].delete(v);
      if (adj[u].size === 1) queue.push(u);
    }

    // 4) 각 점에서 이웃을 각도순으로 정렬한 뒤, 매번 바로 다음(시계 방향) 변으로 돌며 면을 따라감
    const angle = (v, w) => Math.atan2(verts[w].y - verts[v].y, verts[w].x - verts[v].x);
    const order = adj.map((s, v) => [...s].sort((a, b) => angle(v, a) - angle(v, b)));
    const visited = new Set();
    const found = [];
    order.forEach((nbs, v0) => {
      nbs.forEach((w0) => {
        if (visited.has(`${v0}>${w0}`)) return;
        const cycle = [];
        const wallIds = new Set();
        let a = v0, b = w0;
        for (let guard = 0; guard < 100000; guard++) {
          visited.add(`${a}>${b}`);
          cycle.push(a);
          edges.get(edgeKey(a, b)).forEach((id) => wallIds.add(id));
          const nb = order[b];
          const c = nb[(nb.indexOf(a) - 1 + nb.length) % nb.length];
          a = b;
          b = c;
          if (a === v0 && b === w0) break;
        }
        const pts = cycle.map((i) => verts[i]);
        const area = G.signedArea(pts);
        // 넓이가 +인 면이 닫힌 안쪽 면 (바깥 둘레는 -로 나옴)
        if (area > TOL) found.push({ points: G.simplify(pts), area, wallIds: [...wallIds] });
      });
    });

    cache = { version: App.doc.version, faces: found };
    return found;
  }

  /** 점 p를 둘러싼 가장 작은 닫힌 면. 없으면 null */
  function faceAt(p) {
    let best = null;
    for (const f of faces()) {
      if (G.pointInPolygon(p, f.points) && (!best || f.area < best.area)) best = f;
    }
    return best;
  }

  /** 다음 방 이름: '방 N' 중 가장 큰 번호 + 1 */
  function nextName() {
    let n = 0;
    for (const el of App.doc.all()) {
      const m = el.type === 'room' && /^방 (\d+)$/.exec(el.name);
      if (m) n = Math.max(n, Number(m[1]));
    }
    return `방 ${n + 1}`;
  }

  /** 방 안쪽 기준점(seed)을 둘러싼 가장 작은 면. 원래 벽과 하나도 안 겹치면 다른 곳이므로 null */
  function seedFace(room, all, old) {
    let face = null;
    all.forEach((f) => {
      if (G.pointInPolygon(room.seed, f.points) && (!face || f.area < face.area)) face = f;
    });
    if (!face || (old.size && !face.wallIds.some((id) => old.has(id)))) return null;
    return face;
  }

  /** 기록 직전 훅: 벽이 바뀐 변경이면 모든 방의 경계를 다시 맞춤 (같은 실행 취소 단계에 들어감)
      1차: 기준점이 들어 있는 면. 2차: 방이 줄어 기준점이 밖으로 나간 경우, 아무 방도 차지하지 않았고
      예전 모양 안에 있으면서 원래 벽을 공유하는 면 */
  function syncRooms(tx) {
    let wallsChanged = false;
    for (const [id, before] of tx.before) {
      const now = App.doc.get(id);
      if ((before && before.type === 'wall') || (now && now.type === 'wall')) {
        wallsChanged = true;
        break;
      }
    }
    if (!wallsChanged) return;
    const rooms = [...App.doc.all()].filter((e) => e.type === 'room');
    if (!rooms.length) return;
    const all = faces();
    const claimed = new Set();
    const result = new Map(); // 방 id → 면 | 'overlap'
    const olds = new Map(rooms.map((r) => [r.id, new Set(r.wallIds)]));

    rooms.forEach((r) => {
      const f = seedFace(r, all, olds.get(r.id));
      if (!f) return;
      if (claimed.has(f)) result.set(r.id, 'overlap');
      else {
        claimed.add(f);
        result.set(r.id, f);
      }
    });
    rooms.forEach((r) => {
      if (result.has(r.id)) return;
      const old = olds.get(r.id);
      let best = null, bestN = 0;
      all.forEach((f) => {
        if (claimed.has(f) || !G.pointInPolygon(G.interiorPoint(f.points), r.points)) return;
        const n = f.wallIds.reduce((k, id) => k + (old.has(id) ? 1 : 0), 0);
        if (n > bestN) {
          best = f;
          bestN = n;
        }
      });
      if (best) {
        claimed.add(best);
        result.set(r.id, best);
      }
    });

    rooms.forEach((r) => {
      const f = result.get(r.id);
      let patch;
      if (!f) patch = { issue: 'open' };
      else if (f === 'overlap') patch = { issue: 'overlap' };
      else {
        patch = {
          points: f.points,
          wallIds: f.wallIds,
          seed: G.pointInPolygon(r.seed, f.points) ? r.seed : G.interiorPoint(f.points),
          issue: null,
        };
      }
      const changed = Object.keys(patch).some((k) => JSON.stringify(r[k]) !== JSON.stringify(patch[k]));
      if (changed) App.doc.update(r.id, patch);
    });
  }

  App.rooms = { faces, faceAt, nextName, syncRooms };
})();
