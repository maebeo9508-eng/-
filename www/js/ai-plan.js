/* AI가 읽은 평면도 → 도면.
   AI(Claude)는 평면도 그림에서 벽·문·창문·방 이름·치수를 ‘그림의 픽셀 좌표’로 돌려준다 (SCHEMA).
   좌표는 몇 픽셀씩 어긋나므로 여기서 다듬는다: 직각 맞춤 → 같은 줄 맞춤 → 끝점을 만나는 벽에 붙임 → 끊어 적은 벽 합치기
   → 축척(치수 글자 ÷ 픽셀 길이) → mm. 그다음 build()가 벽·문·창문·방 요소를 만든다.
   normalize()는 화면과 상관없는 계산이라 따로 시험할 수 있다 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const median = (list) => { const s = list.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
  const round10 = (v) => Math.round(v / 10) * 10;

  /* ── AI에게 돌려받을 모양 (구조화 출력) ── */
  const P4 = { x1: { type: 'number' }, y1: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' } };
  const SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['is_floor_plan', 'note', 'dimensions', 'walls', 'doors', 'windows', 'rooms'],
    properties: {
      is_floor_plan: { type: 'boolean', description: 'true if the image shows an architectural floor plan (top view with walls)' },
      note: { type: 'string', description: 'One short Korean sentence about anything that was unclear or left out; empty string if nothing' },
      dimensions: {
        type: 'array',
        description: 'Dimension annotations that are clearly readable: the two points the dimension measures between, and the written length in millimetres',
        items: { type: 'object', additionalProperties: false, required: ['x1', 'y1', 'x2', 'y2', 'mm'], properties: { ...P4, mm: { type: 'number', description: 'written length converted to mm' } } },
      },
      walls: {
        type: 'array',
        description: 'Each straight wall as one centerline segment in image pixels',
        items: {
          type: 'object', additionalProperties: false, required: ['x1', 'y1', 'x2', 'y2', 'thick', 'outer'],
          properties: { ...P4, thick: { type: 'number', description: 'drawn wall thickness in pixels' }, outer: { type: 'boolean', description: 'true for exterior / perimeter walls' } },
        },
      },
      doors: {
        type: 'array',
        description: 'Each door: the two jamb points of its opening on the wall centerline, hinge side first',
        items: {
          type: 'object', additionalProperties: false, required: ['x1', 'y1', 'x2', 'y2', 'ax', 'ay', 'kind'],
          properties: { ...P4, ax: { type: 'number', description: 'x of a point inside the area the door leaf sweeps' }, ay: { type: 'number', description: 'y of that point' }, kind: { type: 'string', enum: ['swing', 'sliding', 'opening'] } },
        },
      },
      windows: {
        type: 'array',
        description: 'Each window: its two end points on the wall centerline',
        items: { type: 'object', additionalProperties: false, required: ['x1', 'y1', 'x2', 'y2'], properties: { ...P4 } },
      },
      rooms: {
        type: 'array',
        description: 'Each room: its name and a point well inside it',
        items: { type: 'object', additionalProperties: false, required: ['name', 'x', 'y'], properties: { name: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } } },
      },
    },
  };

  /** AI에게 보낼 글. img: prepareImage()의 결과 (크기와 눈금자), hintMm: 사용자가 넣은 ‘전체 가로 길이’(없으면 null) */
  function prompt(img, hintMm) {
    return `You are transcribing an architectural floor plan image into geometry for a CAD app. Accuracy of positions matters more than anything else: a person will build on these numbers.

The image is ${img.width} x ${img.height} pixels. All coordinates you give are pixels in this image: origin at the top-left corner, x to the right, y downward.${img.ruler ? ` A ruler strip along the top and the left edge has a tick every 50 px and a number every 100 px; use it to read coordinates. The ruler is not part of the plan.` : ''}

Give:
1. walls: every wall as a straight segment along its CENTERLINE, end to end. A wall continues straight through its door and window openings, so give one segment for the whole straight run, not separate pieces between openings. Where walls meet (corners, T-junctions), end the segment exactly on the centerline of the wall it meets, so connected walls share the same coordinate. "thick" is the drawn thickness in pixels. "outer" is true for exterior/perimeter walls.
2. doors: the two jamb points (the ends of the opening) on the wall centerline, with the hinge side first (x1, y1). (ax, ay) is a point inside the area the door leaf sweeps, on the side it opens to; for a sliding door or an open passage without a leaf, use the midpoint of the opening. kind: "swing", "sliding", or "opening" (a passage with no door leaf).
3. windows: the two end points of each window on the wall centerline.
4. rooms: each room's label as written (keep Korean as Korean) and a point well inside the room, away from walls. If a room has no label, give a short sensible Korean name (거실, 방, 주방, 욕실, 현관, 발코니, 창고 ...).
5. dimensions: every dimension annotation you can read with confidence: the two points it measures between (pixels) and the written length converted to millimetres ("3,600" -> 3600, "3.6m" -> 3600, "360cm" -> 3600). They are used to work out the scale, so include one only when both end points and the number are clear.

Rules:
- A horizontal wall has y1 = y2 and a vertical wall has x1 = x2; give other values only when a wall is really diagonal.
- Walls on the same line share exactly the same coordinate.
- Leave out furniture, fixtures, stairs, hatching, text, dimension lines, title blocks, logos, north arrows and the ruler. Do not add walls that are not drawn.
- If the image is not a floor plan, set is_floor_plan to false and return empty lists.
- "note": one short Korean sentence if something was unclear or left out, otherwise an empty string.${hintMm ? `\n\nFor reference, the user says the plan's overall width (left outer face to right outer face) is ${Math.round(hintMm)} mm.` : ''}`;
  }

  /** 보낼 그림 준비: 긴 쪽을 maxSide 이하로 줄이고, 위·왼쪽에 픽셀 눈금자를 붙임 (AI가 좌표를 읽기 쉽게).
      돌려주는 것: { dataUrl, base64, width, height, ruler, band, k } — 보낸 그림의 픽셀 (px, py)는 원본의 ((px - band) / k, (py - band) / k) */
  function prepareImage(source, maxSide = 1568, ruler = true) {
    const sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height;
    const band = ruler ? 30 : 0;
    const k = Math.min(1, (maxSide - band) / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
    const cv = document.createElement('canvas');
    cv.width = w + band; cv.height = h + band;
    const c = cv.getContext('2d');
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, cv.width, cv.height);
    c.imageSmoothingQuality = 'high';
    c.drawImage(source, band, band, w, h);
    if (ruler) {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, cv.width, band); c.fillRect(0, 0, band, cv.height);
      c.strokeStyle = '#d00000'; c.fillStyle = '#d00000'; c.lineWidth = 1; c.font = '11px sans-serif';
      c.beginPath();
      for (let x = 50; x < cv.width; x += 50) { const big = x % 100 === 0; c.moveTo(x + 0.5, band); c.lineTo(x + 0.5, band - (big ? 12 : 6)); }
      for (let y = 50; y < cv.height; y += 50) { const big = y % 100 === 0; c.moveTo(band, y + 0.5); c.lineTo(band - (big ? 12 : 6), y + 0.5); }
      c.moveTo(band + 0.5, band); c.lineTo(band + 0.5, cv.height); c.moveTo(band, band + 0.5); c.lineTo(cv.width, band + 0.5);
      c.stroke();
      c.textBaseline = 'top'; c.textAlign = 'center';
      for (let x = 100; x < cv.width - 12; x += 100) c.fillText(String(x), x, 2);
      c.textAlign = 'left'; c.textBaseline = 'middle';
      for (let y = 100; y < cv.height - 6; y += 100) { c.save(); c.translate(9, y); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.fillText(String(y), 0, 0); c.restore(); }
    }
    const dataUrl = cv.toDataURL('image/jpeg', 0.9);
    return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), width: cv.width, height: cv.height, ruler, band, k };
  }

  /* ── 다듬기 ── */
  /** raw: AI가 준 것(SCHEMA). opt: { width, height (보낸 그림 크기), knownWidthMm (사용자가 넣은 전체 가로) }.
      돌려주는 것: { ok, walls:[{a,b,thick,outer}] (mm), doors, windows, rooms, scale:{mmPerPx, source, n}, origin:{x,y}(px), note, counts } */
  function normalize(raw, opt = {}) {
    raw = raw || {};
    const W = opt.width || 1000, H = opt.height || 1000;
    const seg = (o) => { const x1 = num(o && o.x1), y1 = num(o && o.y1), x2 = num(o && o.x2), y2 = num(o && o.y2); return x1 == null || y1 == null || x2 == null || y2 == null ? null : { a: { x: x1, y: y1 }, b: { x: x2, y: y2 } }; };
    const out = { ok: false, walls: [], doors: [], windows: [], rooms: [], scale: null, origin: { x: 0, y: 0 }, note: String(raw.note || '').slice(0, 200), isPlan: raw.is_floor_plan !== false };
    let walls = (Array.isArray(raw.walls) ? raw.walls : []).map((o) => { const s = seg(o); return s && dist(s.a, s.b) >= 4 ? { ...s, thick: Math.max(0, num(o.thick) || 0), outer: !!o.outer } : null; }).filter(Boolean);
    if (!walls.length) return out;
    const thickMed = median(walls.map((w) => w.thick).filter((t) => t > 0)) || Math.max(W, H) * 0.012;
    const tol = Math.max(6, Math.min(26, Math.max(Math.max(W, H) * 0.011, thickMed * 0.8)));
    const reach = tol + thickMed / 2;

    // 1) 직각 맞춤: 거의 가로·세로인 벽은 반듯하게 (a가 왼쪽·위쪽)
    walls.forEach((w) => {
      const dx = Math.abs(w.b.x - w.a.x), dy = Math.abs(w.b.y - w.a.y), ang = (Math.atan2(Math.min(dx, dy), Math.max(dx, dy)) * 180) / Math.PI;
      if (ang > 7) { w.dir = 'd'; return; }
      if (dx >= dy) { const y = (w.a.y + w.b.y) / 2; w.a.y = w.b.y = y; w.dir = 'h'; if (w.a.x > w.b.x) [w.a, w.b] = [w.b, w.a]; }
      else { const x = (w.a.x + w.b.x) / 2; w.a.x = w.b.x = x; w.dir = 'v'; if (w.a.y > w.b.y) [w.a, w.b] = [w.b, w.a]; }
    });
    // 2) 같은 줄 맞춤: 거의 같은 높이의 가로벽(같은 자리의 세로벽)은 한 줄로 — 긴 벽일수록 그 자리를 따름
    const cluster = (list, key) => {
      const items = list.map((w) => ({ w, v: w.a[key], len: dist(w.a, w.b) })).sort((p, q) => p.v - q.v);
      let group = [];
      const flush = () => { if (!group.length) return; const L = group.reduce((s, g) => s + g.len, 0), v = group.reduce((s, g) => s + g.v * g.len, 0) / L; group.forEach((g) => { g.w.a[key] = g.w.b[key] = v; }); group = []; };
      items.forEach((it) => { if (group.length && it.v - group[0].v > tol * 0.75) flush(); group.push(it); });
      flush();
    };
    const dirOf = (d) => walls.filter((w) => w.dir === d);
    cluster(dirOf('h'), 'y'); cluster(dirOf('v'), 'x');
    // 3) 끝점 붙이기: 벽 끝이 가로지르는 벽 가까이에서 끝나면 그 벽의 중심선까지 (모자라면 늘이고 넘치면 줄임). 만나는 벽이 짧게 끝났으면 그 벽도 늘임
    const snapEnds = (A, B, ka, kb) => A.forEach((w) => ['a', 'b'].forEach((end) => {
      const p = w[end];
      let best = null;
      B.forEach((v) => {
        const d = Math.abs(v.a[ka] - p[ka]), lo = Math.min(v.a[kb], v.b[kb]) - reach, hi = Math.max(v.a[kb], v.b[kb]) + reach;
        if (d <= reach && p[kb] >= lo && p[kb] <= hi && (!best || d < best.d)) best = { d, v };
      });
      if (!best) return;
      p[ka] = best.v.a[ka];
      const v = best.v;
      if (p[kb] < v.a[kb]) v.a[kb] = p[kb]; else if (p[kb] > v.b[kb]) v.b[kb] = p[kb];
    }));
    for (let i = 0; i < 2; i++) { snapEnds(dirOf('h'), dirOf('v'), 'x', 'y'); snapEnds(dirOf('v'), dirOf('h'), 'y', 'x'); }
    // 비스듬한 벽: 끝점을 가까운 다른 벽 끝점에
    const ends = () => walls.flatMap((w) => [w.a, w.b]);
    dirOf('d').forEach((w) => ['a', 'b'].forEach((end) => { const p = w[end]; let best = null; ends().forEach((q) => { if (q === w.a || q === w.b) return; const d = dist(p, q); if (d <= tol && (!best || d < best.d)) best = { d, q }; }); if (best) { p.x = best.q.x; p.y = best.q.y; } }));

    // 문·창문 (픽셀): 끊어 적은 벽을 잇는 데도 씀
    const openings = (list, type) => (Array.isArray(list) ? list : []).map((o) => { const s = seg(o); if (!s || dist(s.a, s.b) < 3) return null; return { type, ...s, mid: { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }, len: dist(s.a, s.b), arc: num(o.ax) != null && num(o.ay) != null ? { x: o.ax, y: o.ay } : null, kind: o.kind }; }).filter(Boolean);
    const ops = [...openings(raw.doors, 'door'), ...openings(raw.windows, 'window')];
    // 4) 같은 줄에서 이어지는 벽 합치기 (맞닿거나 겹침, 또는 사이에 문·창문이 있는 틈)
    const merge = (list, k, f) => {
      const lines = new Map();
      list.forEach((w) => { const key = Math.round(w.a[f] * 100); if (!lines.has(key)) lines.set(key, []); lines.get(key).push(w); });
      const res = [];
      lines.forEach((ws) => {
        ws.sort((p, q) => p.a[k] - q.a[k]);
        let cur = null;
        ws.forEach((w) => {
          const bridged = cur && ops.some((o) => Math.abs(o.mid[f] - cur.a[f]) <= reach && o.mid[k] > cur.b[k] - tol && o.mid[k] < w.a[k] + tol && w.a[k] - cur.b[k] <= o.len + tol * 3);
          if (cur && (w.a[k] - cur.b[k] <= tol || bridged)) { cur.b[k] = Math.max(cur.b[k], w.b[k]); cur.thick = Math.max(cur.thick, w.thick); cur.outer = cur.outer || w.outer; } else { if (cur) res.push(cur); cur = w; }
        });
        if (cur) res.push(cur);
      });
      return res;
    };
    walls = [...merge(dirOf('h'), 'x', 'y'), ...merge(dirOf('v'), 'y', 'x'), ...dirOf('d')].filter((w) => dist(w.a, w.b) >= tol * 0.6);
    if (!walls.length) return out;

    // 5) 축척 (mm ÷ 픽셀): 치수 글자 → 사용자가 넣은 전체 가로 → 문 폭(900) 어림
    const box = walls.reduce((b, w) => ({ minX: Math.min(b.minX, w.a.x, w.b.x), minY: Math.min(b.minY, w.a.y, w.b.y), maxX: Math.max(b.maxX, w.a.x, w.b.x), maxY: Math.max(b.maxY, w.a.y, w.b.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const ratios = (Array.isArray(raw.dimensions) ? raw.dimensions : []).map((d) => { const s = seg(d), mm = num(d && d.mm); const px = s ? dist(s.a, s.b) : 0; return px >= 20 && mm >= 100 ? mm / px : null; }).filter(Boolean);
    let scale = null;
    if (opt.knownWidthMm > 0) scale = { mmPerPx: opt.knownWidthMm / Math.max(1, box.maxX - box.minX + thickMed), source: 'user', n: 1 };
    else if (ratios.length) {
      const m = median(ratios), inl = ratios.filter((r) => Math.abs(r - m) <= m * 0.1);
      scale = { mmPerPx: inl.reduce((s, r) => s + r, 0) / inl.length, source: 'dimension', n: inl.length, of: ratios.length };
    } else {
      const dw = median(ops.filter((o) => o.type === 'door' && o.kind !== 'opening').map((o) => o.len));
      if (dw) scale = { mmPerPx: 900 / dw, source: 'door', n: 1 };
    }
    out.box = box; out.thickPx = thickMed;
    out.pxWalls = walls; out.pxOps = ops;
    out.pxRooms = (Array.isArray(raw.rooms) ? raw.rooms : []).map((r) => (num(r && r.x) != null && num(r.y) != null ? { name: String(r.name || '').trim().slice(0, 30), x: r.x, y: r.y } : null)).filter(Boolean);
    out.scale = scale;
    out.ok = true;
    return scale ? toMm(out, scale.mmPerPx) : out;
  }

  /** 픽셀로 다듬은 결과를 mm로 (왼쪽 위 벽 모서리가 0,0). 축척을 나중에 정할 때(사용자가 길이를 넣음)도 부름 */
  function toMm(n, mmPerPx) {
    const s = mmPerPx, ox = n.box.minX, oy = n.box.minY;
    const P = (p) => ({ x: round10((p.x - ox) * s), y: round10((p.y - oy) * s) });
    n.origin = { x: ox, y: oy };
    n.scale = { ...(n.scale || { source: 'user', n: 1 }), mmPerPx: s };
    n.walls = n.pxWalls.map((w) => ({ a: P(w.a), b: P(w.b), thick: Math.round(w.thick * s), outer: w.outer })).filter((w) => dist(w.a, w.b) >= 100);
    // 문·창문: 가장 가까운 벽에 붙임 (가운데가 벽 위에 오게). t: 벽 시작에서의 비율, width: mm
    const reachMm = (Math.max(6, n.thickPx) * 2.2) * s;
    const place = (o) => {
      const m = P(o.mid);
      let best = null;
      n.walls.forEach((w, i) => {
        const L = dist(w.a, w.b), dx = (w.b.x - w.a.x) / L, dy = (w.b.y - w.a.y) / L, t = Math.max(0, Math.min(L, (m.x - w.a.x) * dx + (m.y - w.a.y) * dy));
        const d = Math.hypot(m.x - (w.a.x + dx * t), m.y - (w.a.y + dy * t));
        if (d <= reachMm && (!best || d < best.d)) best = { d, i, t: t / L, L, dx, dy };
      });
      return best;
    };
    n.doors = []; n.windows = [];
    n.pxOps.forEach((o) => {
      const at = place(o);
      if (!at) return;
      const w = n.walls[at.i];
      if (o.type === 'window') { const width = Math.max(300, Math.min(at.L - 100, Math.round((o.len * s) / 50) * 50)); if (width >= 300) n.windows.push({ wall: at.i, t: at.t, width }); return; }
      const width = Math.max(500, Math.min(at.L - 60, Math.round((o.len * s) / 50) * 50));
      if (!(width >= 500)) return;
      // 경첩: 먼저 적은 문틀 점(x1,y1)이 벽의 어느 끝 쪽인지. 열리는 쪽: 문짝이 쓸고 가는 점이 벽의 어느 편인지 (벽 방향의 수직 (-dy, dx) 쪽이 +1)
      const h1 = P(o.a), h2 = P(o.b), s1 = (h1.x - w.a.x) * at.dx + (h1.y - w.a.y) * at.dy, s2 = (h2.x - w.a.x) * at.dx + (h2.y - w.a.y) * at.dy;
      const arc = o.arc ? P(o.arc) : null, m = P(o.mid), side = arc ? ((arc.x - m.x) * -at.dy + (arc.y - m.y) * at.dx >= 0 ? 1 : -1) : 1;
      n.doors.push({ wall: at.i, t: at.t, width, hinge: s1 <= s2 ? 'start' : 'end', side, kind: o.kind === 'sliding' ? 'sliding' : o.kind === 'opening' ? 'opening' : 'swing' });
    });
    n.rooms = n.pxRooms.map((r) => ({ name: r.name, ...P(r) }));
    n.counts = { walls: n.walls.length, doors: n.doors.length, windows: n.windows.length, rooms: n.rooms.length };
    return n;
  }

  /** 다듬은 결과를 지금 도면에 넣음 (되돌리기 한 번). opt: { phase: 'keep'|'new', at: {x,y} (왼쪽 위 벽 모서리를 놓을 자리, mm) }.
      돌려주는 것: { walls, doors, windows, rooms (만든 개수), ids } */
  function build(n, opt = {}) {
    const T = App.model.TYPES, C = App.catalog, at = opt.at || { x: 0, y: 0 };
    const types = C.wallTypes();
    // 벽 종류: 기존 건물을 읽은 것이므로 ‘기존 벽’(틀 없이 몸체만 있는 종류)이 있으면 그것으로, 없으면 지금 고른 종류
    const solid = types.find((t) => t.frameKind === 'none' && t.base >= 100) || null;
    const typeId = (opt.phase !== 'new' && solid ? solid.id : App.current.wallTypeId) || (types[0] && types[0].id) || null;
    const doorPre = (kind) => { const list = C.presets('door'); const want = kind === 'sliding' ? '미닫이' : kind === 'opening' ? '개구부' : '여닫이'; return list.find((p) => p.style === want && !p.head) || list.find((p) => p.style === want) || list[0]; };
    const winPre = C.presets('window')[0];
    const made = { walls: 0, doors: 0, windows: 0, rooms: 0, ids: [] };
    const wallIds = [];
    App.doc.transact('AI로 읽은 평면도', () => {
      n.walls.forEach((w) => {
        const el = T.wall.create({ x: at.x + w.a.x, y: at.y + w.a.y }, { x: at.x + w.b.x, y: at.y + w.b.y }, { typeId });
        if (opt.phase !== 'new') el.phase = 'keep';
        App.doc.add(el); wallIds.push(el.id); made.ids.push(el.id); made.walls++;
      });
      n.doors.forEach((d) => {
        const pre = doorPre(d.kind);
        if (!pre || !wallIds[d.wall]) return;
        const el = T.door.create(wallIds[d.wall], d.t, { ...pre, width: d.width }, d.side, d.hinge);
        App.doc.add(el); made.ids.push(el.id); made.doors++;
      });
      n.windows.forEach((d) => {
        if (!winPre || !wallIds[d.wall]) return;
        const el = T.window.create(wallIds[d.wall], d.t, { ...winPre, width: d.width });
        App.doc.add(el); made.ids.push(el.id); made.windows++;
      });
    });
    // 방: 벽이 놓인 뒤에 이름표 자리에서 닫힌 곳을 찾음 (벽이 끊겨 닫히지 않은 곳은 건너뜀)
    const rooms = [];
    n.rooms.forEach((r) => {
      const p = { x: at.x + r.x, y: at.y + r.y }, face = App.rooms.faceAt(p);
      if (!face || rooms.some((q) => Math.abs(q.area - face.area) < 1 && q.key === face.wallIds.slice().sort().join())) return;
      rooms.push({ face, name: r.name || App.rooms.nextName(), area: face.area, key: face.wallIds.slice().sort().join() });
    });
    if (rooms.length) App.doc.transact('AI로 읽은 방', () => rooms.forEach((r) => {
      const el = T.room.create(r.face.points, r.face.wallIds, r.name);
      App.doc.add(el); made.ids.push(el.id); made.rooms++;
    }));
    return made;
  }

  App.aiPlan = { SCHEMA, prompt, prepareImage, normalize, toMm, build };
})();
