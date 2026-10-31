/* 가져온 도면(밑그림): DXF를 회색 선으로 깔고 그 위에 벽을 따라 그린다.
   선·글자 데이터는 크기가 커서 도면 요소(실행 취소 기록)에 넣지 않고 따로 보관하고,
   요소에는 위치·배율·회전·투명도·보이기·잠금만 둔다 (8단계 저장 때 데이터도 함께 저장).
   잠겨 있으면 도면에서 눌러도 골라지지 않아 그 위에서 마음 놓고 그릴 수 있음. 꼭짓점에는 스냅이 붙음 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const G = App.geom;

  const store = new Map(); // 데이터 id → { polys, texts, chunks, grid, width, height, ... }
  const CHUNKS = 16;       // 그릴 때 화면 밖 선을 건너뛰도록 16×16 칸으로 나눔
  const MIN_TEXT_PX = 4;   // 이보다 작게 보이는 글자는 그리지 않음
  const MAX_TEXTS = 4000;  // 한 번에 그리는 글자 수 (아주 큰 도면에서 버벅임 방지)
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** DXF 읽은 결과 → 보관용 데이터. mm로 바꾸고 y를 뒤집고(DXF는 위쪽이 +), 왼쪽 위를 원점으로 */
  function build(parsed, unitMM, name) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const polys = parsed.polylines.map((src) => {
      const p = new Float32Array(src.length);
      for (let k = 0; k < src.length; k += 2) {
        const x = src[k] * unitMM, y = -src[k + 1] * unitMM;
        p[k] = x;
        p[k + 1] = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return p;
    });
    const texts = parsed.texts.map((t) => {
      const x = t.x * unitMM, y = -t.y * unitMM;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      return { x, y, h: t.h * unitMM, rot: -t.rot, text: t.text, ha: t.ha, va: t.va };
    });
    if (!Number.isFinite(minX)) { minX = minY = 0; maxX = maxY = 1; }
    // 원점 옮기기
    polys.forEach((p) => {
      for (let k = 0; k < p.length; k += 2) {
        p[k] -= minX;
        p[k + 1] -= minY;
      }
    });
    texts.forEach((t) => { t.x -= minX; t.y -= minY; });
    return index({
      id: `uld-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      polys,
      texts,
      lines: parsed.stats.lines,
      textCount: parsed.stats.texts,
    });
  }

  /** 저장된 기본 데이터 { id, name, width, height, polys, texts, lines, textCount }에
      그리기 칸(chunks)과 스냅 꼭짓점 칸(grid)을 붙임 (저장하지 않고 열 때마다 만듦) */
  function index(base) {
    const { width, height, polys } = base;

    // 그리기 칸: 꺾은선마다 가운데가 든 칸에 넣고 칸 범위는 넣은 선을 모두 감싸게
    const cw = width / CHUNKS, ch = height / CHUNKS;
    const cells = new Map();
    polys.forEach((p, idx) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = 0; k < p.length; k += 2) {
        if (p[k] < x0) x0 = p[k];
        if (p[k] > x1) x1 = p[k];
        if (p[k + 1] < y0) y0 = p[k + 1];
        if (p[k + 1] > y1) y1 = p[k + 1];
      }
      const key = Math.min(CHUNKS - 1, Math.floor((x0 + x1) / 2 / cw)) * CHUNKS + Math.min(CHUNKS - 1, Math.floor((y0 + y1) / 2 / ch));
      let c = cells.get(key);
      if (!c) cells.set(key, (c = { box: { minX: x0, minY: y0, maxX: x1, maxY: y1 }, ids: [], path: null }));
      c.ids.push(idx);
      c.box.minX = Math.min(c.box.minX, x0); c.box.minY = Math.min(c.box.minY, y0);
      c.box.maxX = Math.max(c.box.maxX, x1); c.box.maxY = Math.max(c.box.maxY, y1);
    });

    // 스냅용 꼭짓점 칸: 숫자 열쇠(칸 x × 65536 + 칸 y) → 꼭짓점 [x, y, ...]
    const cell = Math.max(20, Math.max(width, height) / 1024);
    const grid = new Map();
    const put = (x, y) => {
      const key = Math.floor(x / cell) * 65536 + Math.floor(y / cell);
      let list = grid.get(key);
      if (!list) grid.set(key, (list = []));
      // 같은 점은 한 번만 (선끼리 만나는 꼭짓점)
      for (let k = 0; k < list.length; k += 2) if (Math.abs(list[k] - x) < 0.5 && Math.abs(list[k + 1] - y) < 0.5) return;
      list.push(x, y);
    };
    polys.forEach((p) => { for (let k = 0; k < p.length; k += 2) put(p[k], p[k + 1]); });

    return { ...base, chunks: [...cells.values()], grid, cell };
  }

  /* ── 저장: 기본 데이터만 IndexedDB에 (8단계 자동 저장·백업) ── */
  const baseOf = (d) => ({ id: d.id, name: d.name, width: d.width, height: d.height, polys: d.polys, texts: d.texts, lines: d.lines, textCount: d.textCount });

  /** 이 기기에 저장. 실패하면 false (다음에 열 때 밑그림이 빠짐) */
  async function persist(d) {
    try {
      await App.storage.blobs.put(`underlay:${d.id}`, baseOf(d));
      return true;
    } catch (_) {
      return false;
    }
  }

  /** 도면에 있는 밑그림 데이터 중 아직 안 읽은 것을 기기에서 읽음. 못 찾은 개수를 돌려줌 */
  async function loadAll() {
    const need = [...new Set(App.underlay.list().map((u) => u.dataId))].filter((id) => !store.has(id));
    let missing = 0;
    for (const id of need) {
      let base = null;
      try {
        base = await App.storage.blobs.get(`underlay:${id}`);
      } catch (_) { /* 저장소를 못 씀 */ }
      if (base && base.polys) store.set(id, index(base));
      else missing++;
    }
    if (need.length) {
      App.plan.requestRender();
      App.props.refresh();
    }
    return missing;
  }

  /** 백업 파일용: 숫자 배열(0.1mm까지)로 */
  function exportData(id) {
    const d = store.get(id);
    if (!d) return null;
    const r = (v) => Math.round(v * 10) / 10;
    return { ...baseOf(d), polys: d.polys.map((p) => Array.from(p, r)) };
  }
  /** 백업 파일에서 읽은 데이터를 보관하고 기기에 저장 */
  async function importData(obj) {
    if (!obj || !obj.id || !Array.isArray(obj.polys)) return false;
    const d = index({ ...obj, polys: obj.polys.map((p) => Float32Array.from(p)), texts: obj.texts || [] });
    store.set(d.id, d);
    return persist(d);
  }
  /** 어느 도면에서도 쓰지 않는 밑그림 데이터를 기기에서 지움 (앱을 열 때) */
  async function cleanup(usedIds) {
    try {
      const keys = await App.storage.blobs.keys();
      await Promise.all(keys.filter((k) => String(k).startsWith('underlay:') && !usedIds.has(String(k).slice(9)))
        .map((k) => App.storage.blobs.remove(k)));
    } catch (_) { /* 저장소를 못 씀 */ }
  }

  /* ── 놓인 위치: 도면 좌표 = (x, y) + 회전(배율 × 밑그림 좌표) ── */
  function frame(u) {
    const a = ((u.rotation || 0) * Math.PI) / 180;
    return { c: Math.cos(a), s: Math.sin(a), k: u.scale };
  }
  function toWorld(u, lx, ly, f = frame(u)) {
    return { x: u.x + f.k * (lx * f.c - ly * f.s), y: u.y + f.k * (lx * f.s + ly * f.c) };
  }
  function toLocal(u, X, Y, f = frame(u)) {
    const dx = (X - u.x) / f.k, dy = (Y - u.y) / f.k;
    return { x: dx * f.c + dy * f.s, y: -dx * f.s + dy * f.c };
  }
  function worldBox(u, d) {
    const f = frame(u);
    const pts = [[0, 0], [d.width, 0], [d.width, d.height], [0, d.height]].map(([x, y]) => toWorld(u, x, y, f));
    return {
      minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)),
      maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)),
    };
  }

  /* ── 도면 요소 종류 ── */
  App.model.TYPES.underlay = {
    label: '가져온 도면',
    pick: 3,
    create(d) {
      return {
        id: `underlay-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        type: 'underlay', layer: 'ref', room: null, memo: '', createdAt: new Date().toISOString(),
        name: d.name, dataId: d.id, x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.6, visible: true, locked: true,
      };
    },
    bounds(u) {
      const d = store.get(u.dataId);
      return d && u.visible ? worldBox(u, d) : null;
    },
    /** 잠금을 풀었을 때만 도면에서 누르면 골라짐 (다른 것이 없을 때) */
    distance(u, p) {
      if (u.locked || !u.visible) return Infinity;
      const b = App.model.TYPES.underlay.bounds(u);
      return b && G.pointInRect(p, b) ? 0 : Infinity;
    },
    inRect() {
      return false; // 범위 선택에는 넣지 않음 (밑그림 위에서 끌어 고를 때 같이 잡히지 않게)
    },
    snapPoints() {
      return [];
    },
    /** p에서 r(mm) 안의 꼭짓점 (도면 좌표) */
    /** p에서 r(mm) 안에 걸칠 수 있는 선분들 [ax, ay, bx, by] (도면 좌표). 선 위 스냅용 */
    segmentsNear(u, p, r) {
      const d = store.get(u.dataId);
      if (!d || !u.visible) return [];
      const f = frame(u);
      const l = toLocal(u, p.x, p.y, f);
      const rl = r / f.k;
      const box = { minX: l.x - rl, minY: l.y - rl, maxX: l.x + rl, maxY: l.y + rl };
      const out = [];
      for (const c of d.chunks) {
        if (!G.rectsOverlap(c.box, box)) continue;
        for (const i of c.ids) {
          const pl = d.polys[i];
          for (let k = 0; k + 3 < pl.length; k += 2) {
            const ax = pl[k], ay = pl[k + 1], bx = pl[k + 2], by = pl[k + 3];
            if (Math.min(ax, bx) > box.maxX || Math.max(ax, bx) < box.minX || Math.min(ay, by) > box.maxY || Math.max(ay, by) < box.minY) continue;
            const a = toWorld(u, ax, ay, f), b = toWorld(u, bx, by, f);
            out.push([a.x, a.y, b.x, b.y]);
            if (out.length > 400) return out; // 너무 많으면 이만큼만
          }
        }
      }
      return out;
    },
    snapNear(u, p, r) {
      const d = store.get(u.dataId);
      if (!d || !u.visible) return [];
      const f = frame(u);
      const l = toLocal(u, p.x, p.y, f);
      const rl = r / f.k;
      const out = [];
      const gx0 = Math.floor((l.x - rl) / d.cell), gx1 = Math.floor((l.x + rl) / d.cell);
      const gy0 = Math.floor((l.y - rl) / d.cell), gy1 = Math.floor((l.y + rl) / d.cell);
      if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > 400) return out; // 너무 멀리서 볼 때는 찾지 않음
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gy = gy0; gy <= gy1; gy++) {
          const list = d.grid.get(gx * 65536 + gy);
          if (!list) continue;
          for (let k = 0; k < list.length; k += 2) {
            if (Math.abs(list[k] - l.x) <= rl && Math.abs(list[k + 1] - l.y) <= rl) {
              const w = toWorld(u, list[k], list[k + 1], f);
              out.push({ x: w.x, y: w.y, kind: 'end' });
            }
          }
        }
      }
      return out;
    },
    movedBy(u, dx, dy) {
      return { x: u.x + dx, y: u.y + dy };
    },
  };

  /* ── 그리기 (scene에서 방보다 먼저, 도면 좌표로 변환된 상태에서) ── */
  function chunkPath(d, c) {
    const path = new Path2D();
    c.ids.forEach((i) => {
      const p = d.polys[i];
      path.moveTo(p[0], p[1]);
      for (let k = 2; k < p.length; k += 2) path.lineTo(p[k], p[k + 1]);
    });
    return path;
  }

  function draw(plan, list, vis) {
    const ctx = plan.ctx;
    const vs = plan.view.scale;
    list.forEach((u) => {
      const d = store.get(u.dataId);
      if (!d) return;
      const f = frame(u);
      // 화면에 보이는 범위를 밑그림 좌표로
      const corners = [[vis.minX, vis.minY], [vis.maxX, vis.minY], [vis.maxX, vis.maxY], [vis.minX, vis.maxY]].map(([x, y]) => toLocal(u, x, y, f));
      const lv = {
        minX: Math.min(...corners.map((p) => p.x)), minY: Math.min(...corners.map((p) => p.y)),
        maxX: Math.max(...corners.map((p) => p.x)), maxY: Math.max(...corners.map((p) => p.y)),
      };
      const px = vs * f.k; // 밑그림 1mm가 화면에서 몇 px인지
      ctx.save();
      ctx.translate(u.x, u.y);
      ctx.rotate(((u.rotation || 0) * Math.PI) / 180);
      ctx.scale(f.k, f.k);
      ctx.globalAlpha = u.opacity;
      ctx.strokeStyle = plan.colors.underlay;
      ctx.lineWidth = 1 / px;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      d.chunks.forEach((c) => {
        if (!G.rectsOverlap(c.box, lv)) return;
        if (!c.path) c.path = chunkPath(d, c);
        ctx.stroke(c.path);
      });
      // 글자: 너무 작으면 건너뜀
      ctx.fillStyle = plan.colors.underlay;
      const family = getComputedStyle(document.documentElement).getPropertyValue('--font-ui') || 'sans-serif';
      let drawn = 0;
      for (const t of d.texts) {
        if (t.h * px < MIN_TEXT_PX || !G.pointInRect(t, { minX: lv.minX - t.h * 20, minY: lv.minY - t.h * 5, maxX: lv.maxX + t.h * 5, maxY: lv.maxY + t.h * 5 })) continue;
        if (++drawn > MAX_TEXTS) break;
        // 글꼴 크기는 화면 크기(px)로 정하고 좌표계를 그만큼 줄여 그림 (아주 큰 글꼴 값을 피함)
        const size = t.h * px;
        if (size > 600) continue;
        const lines = t.text.split('\n');
        const lh = size * 1.4;
        const y0 = t.va === 'bottom' ? -(lines.length - 1) * lh : t.va === 'middle' ? (-(lines.length - 1) * lh) / 2 : 0;
        ctx.save();
        ctx.translate(t.x, t.y);
        if (t.rot) ctx.rotate(t.rot);
        ctx.scale(1 / px, 1 / px);
        ctx.font = `${size}px ${family}`;
        ctx.textAlign = t.ha;
        ctx.textBaseline = t.va;
        lines.forEach((line, i) => ctx.fillText(line, 0, y0 + i * lh));
        ctx.restore();
      }
      ctx.restore();
      if (App.selection.has(u.id)) {
        const b = worldBox(u, d);
        ctx.save();
        ctx.setLineDash([8 / vs, 5 / vs]);
        ctx.lineWidth = 1.5 / vs;
        ctx.strokeStyle = plan.colors.accent;
        ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
        ctx.restore();
      }
    });
  }

  /* ── 불러오기 ── */

  /** 멀리 떨어진 엉뚱한 개체(캐드 파일에 흔한 떠돌이 선·글자)를 뺌. 도면 대부분이 모인 범위의 4배 밖이거나
      그 범위보다 몇 배나 큰 개체. 뺀 개수는 stats.outliers */
  function trimOutliers(parsed) {
    const xs = [], ys = [];
    const every = Math.max(1, Math.floor(parsed.polylines.reduce((n, p) => n + p.length / 2, 0) / 200000)); // 너무 많으면 골라서
    let c = 0;
    parsed.polylines.forEach((p) => {
      for (let k = 0; k < p.length; k += 2) if (c++ % every === 0) { xs.push(p[k]); ys.push(p[k + 1]); }
    });
    parsed.texts.forEach((t) => { xs.push(t.x); ys.push(t.y); });
    if (xs.length < 20) return parsed;
    const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))];
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);
    const core = { minX: q(xs, 0.02), maxX: q(xs, 0.98), minY: q(ys, 0.02), maxY: q(ys, 0.98) };
    const size = Math.max(core.maxX - core.minX, core.maxY - core.minY, 1);
    const keep = { minX: core.minX - size * 4, maxX: core.maxX + size * 4, minY: core.minY - size * 4, maxY: core.maxY + size * 4 };
    let outliers = 0;
    const polylines = parsed.polylines.filter((p) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = 0; k < p.length; k += 2) {
        x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]);
        y0 = Math.min(y0, p[k + 1]); y1 = Math.max(y1, p[k + 1]);
      }
      const ok = x0 >= keep.minX && x1 <= keep.maxX && y0 >= keep.minY && y1 <= keep.maxY;
      if (!ok) outliers++;
      return ok;
    });
    const texts = parsed.texts.filter((t) => {
      const ok = G.pointInRect(t, keep) && t.h < size;
      if (!ok) outliers++;
      return ok;
    });
    return { ...parsed, polylines, texts, stats: { ...parsed.stats, outliers, lines: polylines.length, texts: texts.length } };
  }
  const UNIT_CHOICES = [[1, 'mm'], [10, 'cm'], [1000, 'm'], [25.4, 'inch'], [304.8, 'ft']];

  function measureSize(parsed, unitMM) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    parsed.polylines.forEach((p) => {
      for (let k = 0; k < p.length; k += 2) {
        if (p[k] < minX) minX = p[k];
        if (p[k] > maxX) maxX = p[k];
        if (p[k + 1] < minY) minY = p[k + 1];
        if (p[k + 1] > maxY) maxY = p[k + 1];
      }
    });
    if (!Number.isFinite(minX)) return { w: 0, h: 0 };
    return { w: (maxX - minX) * unitMM, h: (maxY - minY) * unitMM };
  }

  /** DWG 모듈을 못 불러온 경우(파일을 바로 연 브라우저 등): DXF로 바꾸는 방법 안내 */
  async function dwgHelp(name) {
    const r = await App.ui.dialog({
      title: 'DWG를 여는 모듈을 불러오지 못했습니다',
      html: `
        <p><b>${esc(name)}</b>을 열려면 앱 안의 DWG 모듈이 필요한데, 지금 연 방식(파일을 브라우저로 직접 열기 등)에서는 불러올 수 없습니다.
        설치한 앱이나 웹 주소로 열면 DWG가 바로 열립니다.</p>
        <p>지금 바로 열어야 하면 DXF로 바꿔서 불러오세요.</p>
        <ol>
          <li>캐드에서: <b>다른 이름으로 저장</b> → 파일 형식 <b>DXF</b></li>
          <li>캐드가 없으면: 무료 <b>ODA File Converter</b>(PC)로 DWG → DXF</li>
        </ol>`,
      actions: [{ id: 'cancel', label: '닫기' }, { id: 'pick', label: 'DXF 파일 고르기', primary: true }],
    });
    if (r.id === 'pick') pickFile();
  }

  async function importFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext !== 'dxf' && ext !== 'dwg') {
      App.ui.toast('DWG·DXF 도면 파일만 불러올 수 있습니다.');
      return false;
    }
    App.ui.busy(ext === 'dwg' ? 'DWG 도면을 읽는 중… 처음 한 번은 몇 초 걸릴 수 있습니다.' : '도면을 읽는 중…');
    await new Promise((r) => setTimeout(r, 30)); // 안내가 먼저 보이게
    // reparse(옵션): 꺼진 레이어 포함 여부를 바꿔 다시 만들 때 파일을 다시 읽지 않음
    let parsed, reparse, fallback = '';
    try {
      let buffer = await file.arrayBuffer();
      if (ext === 'dwg') {
        const problem = App.dwg.check(buffer);
        if (problem) throw new Error(problem);
        buffer = await App.dwg.toDxf(buffer); // DWG → DXF (작업자에서)
      }
      const text = App.dxf.decode(buffer);
      // DWG에서 바꾼 DXF는 켜진 레이어도 '꺼짐'으로 적혀 나오는 경우가 있어 얼린 레이어만 숨김
      const extra = {};
      reparse = (opts) => trimOutliers(App.dxf.parse(text, { ...extra, ...opts, ignoreOff: ext === 'dwg' }));
      parsed = reparse();
      // 아무것도 없으면: 얼린 레이어 → 배치(종이) 공간 순서로 더 찾아봄
      const has = (p) => p.polylines.length || p.texts.length;
      if (!has(parsed) && parsed.stats.hiddenSkipped) {
        const p2 = reparse({ includeHidden: true });
        if (has(p2)) { extra.includeHidden = true; parsed = p2; fallback = 'hidden'; }
      }
      for (const opts of [{ includePaper: true }, { includePaper: true, includeHidden: true }]) {
        if (has(parsed)) break;
        const p3 = reparse(opts);
        if (has(p3)) { Object.assign(extra, opts); parsed = p3; fallback = 'paper'; }
      }
    } catch (e) {
      App.ui.busy(false);
      if (e.message === 'NO_WORKER') return dwgHelp(file.name);
      await App.ui.dialog({
        title: '도면을 읽지 못했습니다',
        html: /^CODE_/.test(e.message)
          ? '<p>DWG를 바꾸는 중에 문제가 생겼습니다. 파일이 손상되었거나 암호가 걸려 있을 수 있습니다.</p><p class="dialog-note">캐드에서 다른 버전 DWG나 DXF로 저장해 다시 열어 보세요.</p>'
          : `<p>${esc(e.message || e)}</p>`,
      });
      return false;
    }
    App.ui.busy(false);
    if (!parsed.polylines.length && !parsed.texts.length) {
      // 왜 비었는지 알려 주고 캐드에서 할 일을 안내
      const s = parsed.stats;
      const reasons = [];
      if (s.xrefs.length) {
        reasons.push(`<p>이 도면은 다른 도면 파일을 <b>외부 참조(XREF)</b>로 불러와 보여 주는 파일입니다: <b>${esc(s.xrefs.slice(0, 3).join(', '))}${s.xrefs.length > 3 ? ' …' : ''}</b>. 그 내용은 이 파일 안에 들어 있지 않습니다.</p>
          <p class="dialog-note">캐드에서 외부 참조를 <b>결합(BIND)</b>한 뒤 저장해서 다시 열어 주세요. (명령: XREF → 결합)</p>`);
      }
      const unread = Object.entries(s.skipped).filter(([t]) => t !== '없는 블록').map(([t, n]) => `${t} ${n.toLocaleString('ko-KR')}개`).join(', ');
      if (unread) {
        reasons.push(`<p>밑그림으로 읽을 수 없는 개체만 있습니다: ${esc(unread)}. 3D 객체나 건축 전용(AEC) 객체일 수 있습니다.</p>
          <p class="dialog-note">캐드에서 전체를 <b>분해(EXPLODE)</b>한 뒤 저장하거나, ‘다른 이름으로 저장’에서 DXF로 저장해 다시 열어 보세요.</p>`);
      }
      if (!reasons.length) reasons.push('<p>모형 공간과 배치(종이) 공간 모두에서 선이나 글자를 찾지 못했습니다.</p><p class="dialog-note">캐드에서 ‘다른 이름으로 저장’ → DXF(또는 2013 형식 DWG)로 저장해 다시 열어 보세요.</p>');
      await App.ui.dialog({ title: '그릴 내용을 찾지 못했습니다', html: reasons.join('') });
      return false;
    }
    const known = parsed.insunits !== 0 && UNIT_CHOICES.some(([f]) => f === parsed.units.mm);
    let unitMM = known ? parsed.units.mm : 1;
    const skipped = Object.entries(parsed.stats.skipped).map(([t, n]) => `${t} ${n}개`).join(', ');
    const sizeText = () => {
      const s = measureSize(parsed, unitMM);
      return `가로 ${App.units.formatLength(s.w)} × 세로 ${App.units.formatLength(s.h)}`;
    };
    const r = await App.ui.dialog({
      title: '도면 불러오기',
      html: `
        <p><b>${esc(file.name)}</b><br>선 ${parsed.stats.lines.toLocaleString('ko-KR')}개 · 글자 ${parsed.stats.texts.toLocaleString('ko-KR')}개</p>
        <div class="field">
          <label class="field-label" for="d-unit">도면 단위</label>
          <select id="d-unit" class="field-select">
            ${UNIT_CHOICES.map(([f, l]) => `<option value="${f}" ${f === unitMM ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <p class="dialog-note${known ? '' : ' is-warn'}">${known
          ? `파일에 적힌 단위(${esc(parsed.units.label)})로 읽었습니다.`
          : '파일에 단위가 없어 mm로 봅니다. 아래 크기가 실제 건물과 다르면 단위를 바꾸세요. 나중에 ‘두 점으로 길이 맞추기’로도 고칠 수 있습니다.'}</p>
        <p>크기: <b id="d-size">${sizeText()}</b></p>
        ${parsed.stats.hiddenSkipped ? `
          <label class="check-row" for="d-hidden">
            <input type="checkbox" id="d-hidden">
            <span><b>꺼진 레이어도 불러오기</b><small>캐드에서 꺼 둔 레이어 ${parsed.stats.hiddenLayers.length}개(${esc(parsed.stats.hiddenLayers.slice(0, 4).join(', '))}${parsed.stats.hiddenLayers.length > 4 ? ' …' : ''})는 캐드처럼 숨깁니다.</small></span>
          </label>` : ''}
        ${skipped ? `<p class="props-meta">건너뛴 것: ${esc(skipped)} (빗금·3D 등은 밑그림에 넣지 않음)</p>` : ''}
        ${parsed.stats.outliers ? `<p class="props-meta">도면에서 멀리 떨어진 엉뚱한 선·글자 ${parsed.stats.outliers}개는 뺐습니다. (화면 맞춤이 너무 작아지는 것을 막음)</p>` : ''}
        ${parsed.stats.truncated ? '<p class="dialog-note is-warn">도면이 너무 커서 일부만 불러왔습니다.</p>' : ''}
        ${fallback === 'hidden' ? '<p class="dialog-note is-warn">선이 모두 캐드에서 얼린(숨긴) 레이어에 있어서 함께 불러왔습니다.</p>' : ''}
        ${fallback === 'paper' ? '<p class="dialog-note is-warn">모형 공간이 비어 있어 <b>배치(종이) 공간</b>의 선을 불러왔습니다. 종이 축척이라 실제 크기와 다를 수 있으니, 불러온 뒤 ‘두 점으로 길이 맞추기’로 맞추세요.</p>' : ''}`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '불러오기', primary: true }],
      onOpen(body) {
        body.querySelector('#d-unit').addEventListener('change', (e) => {
          unitMM = Number(e.target.value);
          body.querySelector('#d-size').textContent = sizeText();
        });
      },
    });
    if (r.id !== 'ok') return false;
    const withHidden = r.body.querySelector('#d-hidden');
    if (withHidden && withHidden.checked) parsed = reparse({ includeHidden: true });
    const d = build(parsed, unitMM, file.name);
    store.set(d.id, d);
    persist(d).then((ok) => {
      if (!ok) App.ui.toast('밑그림을 이 기기에 저장하지 못했습니다. 앱을 다시 열면 도면 파일을 다시 불러와야 합니다.');
    });
    const el = App.model.TYPES.underlay.create(d);
    App.doc.transact('도면 불러오기', () => App.doc.add(el));
    App.selection.set([el.id]);
    App.plan.fitToContent(App.doc.bounds([el.id])); // 방금 불러온 도면이 화면에 꽉 차게
    App.ui.toast('밑그림으로 불러왔습니다. 잠겨 있어서 그 위에 바로 벽을 따라 그릴 수 있고, 선 끝점에 붙습니다.');
    return el.id;
  }

  function pickFile() {
    document.getElementById('importFile').click();
  }

  /* ── 두 점으로 길이 맞추기: 밑그림에서 길이를 아는 두 점을 누르고 실제 길이를 넣으면 배율을 맞춤 ── */
  class CalibrateTool {
    activate() {
      this.a = null;
      this.cur = null;
      App.ui.hint('밑그림에서 길이를 아는 두 점(예: 벽 끝과 끝)을 차례로 누르세요 · Esc: 취소', 6000);
    }
    at(ev) {
      const s = App.snap.point(ev.world, { touch: ev.touch });
      return s.kind === 'end' || s.kind === 'mid' ? { x: s.x, y: s.y, snapped: true } : { x: ev.world.x, y: ev.world.y };
    }
    hover(ev) {
      this.cur = ev ? this.at(ev) : null;
      App.plan.requestRender();
    }
    move(ev) {
      this.hover(ev);
    }
    down() {}
    up(ev) {
      const p = this.at(ev);
      if (!this.a) {
        this.a = p;
        App.plan.requestRender();
        return;
      }
      this.finishWith(this.a, p);
    }
    async finishWith(a, b) {
      const id = calibrating;
      const u = App.doc.get(id);
      const measured = G.dist(a, b);
      this.a = null;
      if (!u || measured < 1) {
        App.ui.toast('두 점이 너무 가깝습니다. 다시 누르세요.');
        return;
      }
      const r = await App.ui.dialog({
        title: '실제 길이 입력',
        html: `
          <p>누른 두 점 사이가 지금 <b>${App.units.formatLength(measured)}</b>입니다. 실제 길이를 넣으면 밑그림 크기를 맞춥니다.</p>
          <div class="field">
            <label class="field-label" for="d-len">실제 길이</label>
            <div class="field-box"><input id="d-len" type="text" inputmode="decimal" autocomplete="off" value="${App.units.inputLength(measured)}">
              <span class="field-unit">${App.units.lengthLabel()}</span></div>
            <div class="field-error" role="alert" hidden></div>
          </div>`,
        actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '맞추기', primary: true }],
        onOpen(body) {
          const input = body.querySelector('#d-len');
          input.select();
        },
      });
      const done = () => {
        App.ui.setTool('select');
        if (App.doc.has(id)) App.selection.set([id]);
      };
      if (r.id !== 'ok') return done();
      const real = App.units.parseLength(r.body.querySelector('#d-len').value);
      if (!(real > 0)) {
        App.ui.toast('길이를 숫자로 넣으세요. 배율은 바뀌지 않았습니다.');
        return done();
      }
      // a점은 그 자리에 두고 배율만 바꿈
      const f = frame(u);
      const la = toLocal(u, a.x, a.y, f);
      const scale = u.scale * (real / measured);
      const nu = { ...u, scale };
      const wa = toWorld(nu, la.x, la.y);
      App.doc.transact('밑그림 길이 맞추기', () => App.doc.update(id, { scale, x: u.x + (a.x - wa.x), y: u.y + (a.y - wa.y) }));
      App.ui.toast(`배율을 ${Number(scale.toFixed(4))}로 맞췄습니다.`);
      done();
    }
    escape() {
      if (this.a) {
        this.a = null;
        App.plan.requestRender();
        return true;
      }
      return false;
    }
    cancel() {
      this.a = null;
    }
    overlay(plan) {
      const ctx = plan.ctx;
      if (this.a && this.cur) {
        App.draw.screenTransform(plan);
        const sa = plan.view.toScreen(this.a.x, this.a.y), sb = plan.view.toScreen(this.cur.x, this.cur.y);
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = plan.colors.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.stroke();
        ctx.restore();
        App.draw.lengthTag(plan, this.a, this.cur, false);
      }
      if (this.a) App.draw.pointMarker(plan, this.a);
      if (this.cur && this.cur.snapped) App.draw.snapMarker(plan, { ...this.cur, kind: 'end' });
    }
  }
  let calibrating = null;

  function calibrate(id) {
    calibrating = id;
    App.selection.clear();
    App.ui.setTool('calibrate');
  }

  function init() {
    App.tools.register('calibrate', () => new CalibrateTool());
    const input = document.getElementById('importFile');
    // 안드로이드 파일 고르기 창은 .dwg·.dxf 형식을 몰라 파일을 흐리게 막는 경우가 있어 거르지 않고 연 뒤 확장자로 확인
    if (/Android/i.test(navigator.userAgent)) input.removeAttribute('accept');
    input.addEventListener('change', () => {
      const f = input.files[0];
      input.value = '';
      if (f) importFile(f);
    });
    document.getElementById('menuImport').addEventListener('click', () => {
      document.getElementById('fileMenu').hidden = true;
      document.getElementById('btnFile').setAttribute('aria-expanded', 'false');
      pickFile();
    });
  }

  App.underlay = {
    init, draw, importFile, pickFile, calibrate, build, store, loadAll, exportData, importData, cleanup,
    data: (u) => store.get(u.dataId) || null,
    list: () => [...App.doc.all()].filter((e) => e.type === 'underlay'),
  };
})();
