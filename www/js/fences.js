/* 영역 도구 (조감도 모드) — 둘레 두르기: 영역 둘레를 따라 펜스·차단봉·생울타리·담장(이어 붙임) 또는 러버콘(띄엄띄엄)을 놓음.
   한 변에 입구(빈 곳)를 남길 수 있음. 놓은 개수는 물건이라 집계·견적(렌탈 수량)에 그대로 들어감 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const KINDS = [
    { kind: '펜스', label: '펜스 (2m 판)', panel: 2000 },
    { kind: '차단봉', label: '차단봉 (곧은 줄마다)', perRun: true },
    { kind: '러버콘', label: '러버콘 (2m 간격)', spacing: 2000 },
    { kind: '생울타리', label: '생울타리', panel: 3000, fit: true },
    { kind: '담장', label: '담장', panel: 5000, fit: true },
  ];
  const SIDES = [['bottom', '아래'], ['top', '위'], ['left', '왼쪽'], ['right', '오른쪽'], ['none', '없음']];

  const SHARP = 30; // 이보다 크게 꺾이는 꼭짓점에서 줄을 끊음 (작게 꺾이는 곡선은 이어서 현으로 덮음)

  /** 영역 둘레에서 덮을 줄들: 입구(둘레를 따라 잰 폭, 고른 변의 가운데)를 뺀 나머지를 크게 꺾이는 곳에서 나눔.
      돌려주는 값: { runs: [[점…]…], closed(입구 없이 한 바퀴 이어진 곡선), opening(실제 입구 폭 mm 또는 0) } */
  function runsOf(zone, o = {}) {
    const raw = zone.points;
    const pts = raw.filter((p, i) => Math.hypot(p.x - raw[(i + 1) % raw.length].x, p.y - raw[(i + 1) % raw.length].y) > 10);
    const n = pts.length;
    if (n < 3) return { runs: [], closed: false, opening: 0 };
    const segs = pts.map((p, i) => { const q = pts[(i + 1) % n]; return { a: p, b: q, len: Math.hypot(q.x - p.x, q.y - p.y) }; });
    let acc = 0;
    segs.forEach((g) => { g.s0 = acc; acc += g.len; });
    const P = acc;
    const at = (s) => {
      s = ((s % P) + P) % P;
      const g = segs.find((x) => s <= x.s0 + x.len + 1e-6) || segs[segs.length - 1];
      const t = g.len ? (s - g.s0) / g.len : 0;
      return { x: g.a.x + (g.b.x - g.a.x) * t, y: g.a.y + (g.b.y - g.a.y) * t };
    };
    // 꼭짓점이 꺾이는 각도 (도)
    const turn = (i) => {
      const a = segs[(i - 1 + n) % n], b = segs[i];
      const d = Math.atan2(b.b.y - b.a.y, b.b.x - b.a.x) - Math.atan2(a.b.y - a.a.y, a.b.x - a.a.x);
      return Math.abs((((d * 180) / Math.PI + 540) % 360) - 180);
    };
    const gap = Math.max(0, Number(o.gap) || 0);
    let from = 0, to = P, opening = 0;
    if (gap > 0 && o.side && o.side !== 'none' && gap < P - 1000) {
      const score = (g) => { const mx = (g.a.x + g.b.x) / 2, my = (g.a.y + g.b.y) / 2; return { bottom: my, top: -my, left: -mx, right: mx }[o.side]; };
      const door = segs.reduce((best, g) => (!best || score(g) > score(best) + 1e-6 ? g : best), null);
      const c = door.s0 + door.len / 2; // 고른 변의 가운데: 변이 입구보다 짧으면 옆 변까지 이어서 비움
      from = c + gap / 2;
      to = c - gap / 2 + P;
      opening = gap;
    }
    // 덮을 길: from → to (둘레를 따라), 그 사이 꼭짓점을 차례로
    const path = [{ ...at(from), s: from, corner: true }];
    for (let k = 0; k < 2 * n; k++) {
      const i = k % n, s = segs[i].s0 + (k >= n ? P : 0);
      if (s > from + 1 && s < to - 1) path.push({ ...pts[i], s, corner: turn(i) > SHARP });
    }
    path.push({ ...at(to), s: to, corner: true });
    const closed = !opening && !path.slice(1, -1).some((p) => p.corner);
    const runs = [];
    let cur = [path[0]];
    for (let i = 1; i < path.length; i++) {
      cur.push(path[i]);
      if (path[i].corner && i < path.length - 1) { runs.push(cur); cur = [path[i]]; }
    }
    runs.push(cur);
    return { runs: runs.filter((r) => r.length >= 2), closed, opening };
  }

  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const lenOf = (run) => run.reduce((t, p, i) => (i ? t + dist(run[i - 1], p) : 0), 0);
  /** 줄 위에서 p(구간 i)부터 앞으로 가며 p와 직선거리가 d인 첫 점. 없으면 null */
  function chordFrom(run, i, p, d) {
    for (let j = i; j < run.length - 1; j++) {
      const a = run[j], b = run[j + 1];
      if (dist(p, b) < d) continue;
      // a(또는 p)에서 b 사이에서 |x - p| = d 인 점 (이차식)
      const s0 = j === i ? p : a, dx = b.x - s0.x, dy = b.y - s0.y, fx = s0.x - p.x, fy = s0.y - p.y;
      const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - d * d;
      const t = A ? (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A) : 0;
      return { x: s0.x + dx * t, y: s0.y + dy * t, i: j };
    }
    return null;
  }
  const piece = (a, b, size) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, rotation: Math.round((((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 360) % 360) * 10) / 10, size });
  /** 판(같은 규격)을 줄의 양 끝에 맞춰 늘어놓음: 처음 판은 시작에, 마지막 판은 끝에 딱 맞추고 사이는 겹쳐도 됨 (규격이 그대로라 렌탈 수량) */
  function panelsOn(run, panel, closed, fitShort) {
    const L = lenOf(run), a = run[0], z = run[run.length - 1];
    if (L < 100) return [];
    if (dist(a, z) <= panel + 1 && run.length === 2) {
      // 판 하나보다 짧은 줄: 끝(입구 쪽이면 입구)에 맞춰 판 하나 (담장·생울타리는 그 길이로 맞춤)
      if (L >= panel - 1) return [piece(a, z, panel)];
      if (fitShort) return [piece(a, z, Math.round(L))];
      const u = { x: (z.x - a.x) / L, y: (z.y - a.y) / L };
      return [a.gapEnd ? piece(a, { x: a.x + u.x * panel, y: a.y + u.y * panel }, panel) : piece({ x: z.x - u.x * panel, y: z.y - u.y * panel }, z, panel)];
    }
    const out = [];
    let p = a, i = 0;
    for (let guard = 0; guard < 2000; guard++) {
      // 끝내기: 열린 줄은 끝이 판 하나 안에 들어오면, 한 바퀴 곡선은 거의 다 돌아 시작점이 판 하나 안에 들어오면
      if (closed ? out.length > 1 && i >= run.length - 3 && dist(p, z) <= panel + 1 : dist(p, z) <= panel + 1) {
        // 마지막 판: 끝에 딱 맞춤 (앞 판과 겹침)
        const q = closed ? a : z;
        const d = dist(p, q);
        if (d > 50) {
          const u = { x: (q.x - p.x) / d, y: (q.y - p.y) / d };
          out.push(piece({ x: q.x - u.x * panel, y: q.y - u.y * panel }, q, panel));
        }
        break;
      }
      const nx = chordFrom(run, i, p, panel);
      if (!nx) { const u = { x: (z.x - p.x) / dist(p, z), y: (z.y - p.y) / dist(p, z) }; out.push(piece({ x: z.x - u.x * panel, y: z.y - u.y * panel }, z, panel)); break; }
      out.push(piece(p, nx, panel));
      p = nx; i = nx.i;
    }
    return out;
  }

  /** 영역 둘레에 놓을 물건 목록 (아직 도면에 넣지 않음). o: { kind, gap(mm), side } */
  function plan(zone, o = {}) {
    const k = KINDS.find((x) => x.kind === o.kind) || KINDS[0];
    const def = App.catalog.itemDef(k.kind);
    if (!def || !zone || zone.points.length < 3) return [];
    const { runs, closed, opening } = runsOf(zone, o);
    if (opening && runs.length) { runs[0][0].gapEnd = true; runs[runs.length - 1][runs[runs.length - 1].length - 1].gapEnd = true; }
    const out = [];
    runs.forEach((run) => {
      const L = lenOf(run);
      if (L < 100) return;
      if (k.spacing) {
        // 띄엄띄엄 (러버콘): 줄의 양 끝(입구 양옆 포함)과 그 사이를 간격 이하로 고르게
        const m = Math.max(1, Math.ceil(L / k.spacing - 0.05));
        let walked = 0, j = 0;
        for (let c = 0; c <= m; c++) {
          const want = (L * c) / m;
          while (j < run.length - 2 && walked + dist(run[j], run[j + 1]) < want) { walked += dist(run[j], run[j + 1]); j++; }
          const seg = dist(run[j], run[j + 1]) || 1, t = Math.min(1, Math.max(0, (want - walked) / seg));
          out.push({ x: run[j].x + (run[j + 1].x - run[j].x) * t, y: run[j].y + (run[j + 1].y - run[j].y) * t, rotation: 0, size: def.size });
        }
      } else if (k.perRun) {
        // 차단봉: 곧은 줄마다 한 줄 (기둥을 이웃 줄과 나눠 씀), 곡선은 마디마다
        for (let i = 1; i < run.length; i++) if (dist(run[i - 1], run[i]) >= 300) out.push(piece(run[i - 1], run[i], Math.round(dist(run[i - 1], run[i]))));
      } else {
        out.push(...panelsOn(run, k.panel, closed, k.fit));
      }
    });
    // 꼭짓점에서 겹친 콘은 하나로
    const list = k.spacing ? out.filter((p, i) => !out.slice(0, i).some((q) => dist(p, q) < 300)) : out;
    return list.map((p) => ({ ...p, kind: k.kind }));
  }
  /** 실제로 비는 입구 폭 (판 끝끼리, mm): 미리 보기용 */
  function openingOf(zone, o = {}) { return runsOf(zone, o).opening; }

  /** 도면에 넣음 (이 영역에 전에 두른 것은 바꿈). 돌려주는 값: 넣은 물건 id들 */
  function around(zoneId, o = {}) {
    const z = App.doc.get(zoneId);
    if (!z || z.type !== 'zone') return [];
    const list = plan(z, o);
    if (!list.length) return [];
    const T = App.model.TYPES;
    const ids = [];
    App.doc.transact('둘레 두르기', () => {
      existing(zoneId).forEach((e) => App.doc.remove(e.id));
      list.forEach((p) => {
        const def = App.catalog.itemDef(p.kind);
        const it = T.item.create({ x: p.x, y: p.y }, def.category, def, p.rotation, null);
        if (p.size !== def.size) {
          it.size = p.size;
          if (def.resize) Object.assign(it, def.resize(it));
        }
        it.perimeterOf = zoneId; // 다시 두르면 이것들을 바꿈
        App.doc.add(it);
        ids.push(it.id);
      });
    });
    return ids;
  }
  /** 이 영역에 전에 두른 물건들 */
  const existing = (zoneId) => [...App.doc.all()].filter((e) => e.type === 'item' && e.perimeterOf === zoneId);

  async function dialog(zoneId) {
    const z = App.doc.get(zoneId);
    if (!z || z.type !== 'zone') return [];
    const perim = z.points.reduce((t, p, i) => { const q = z.points[(i + 1) % z.points.length]; return t + Math.hypot(q.x - p.x, q.y - p.y); }, 0);
    const r = await App.ui.dialog({
      title: '둘레 두르기',
      html: `
        <p class="dialog-note">‘${(z.name || '영역').replace(/[<>&"]/g, '')}’ 둘레 ${App.units.formatLength(perim)}를 따라 놓습니다. 입구 자리는 비워 둡니다.</p>
        <div class="field"><label class="field-label" for="fcKind">무엇으로</label><div class="field-box"><select id="fcKind" class="field-select">${KINDS.map((k) => `<option value="${k.kind}">${k.label}</option>`).join('')}</select></div></div>
        <div class="field-grid">
          <div class="field"><label class="field-label" for="fcGap">입구 폭</label><div class="field-box"><input id="fcGap" type="text" inputmode="decimal" autocomplete="off" value="${App.units.inputLength(4000)}"><span class="field-unit">${App.units.lengthLabel()}</span></div></div>
          <div class="field"><label class="field-label" for="fcSide">입구 자리</label><div class="field-box"><select id="fcSide" class="field-select">${SIDES.map(([id, t]) => `<option value="${id}">${t}</option>`).join('')}</select></div></div>
        </div>
        <p class="props-meta fc-count" aria-live="polite"></p>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '두르기', primary: true }],
      onOpen(body) {
        const old = existing(zoneId).length;
        const show = () => {
          const o = { kind: body.querySelector('#fcKind').value, gap: App.units.parseLength(body.querySelector('#fcGap').value), side: body.querySelector('#fcSide').value };
          const list = plan(z, o), open = openingOf(z, o);
          const where = o.kind === '생울타리' ? '집계에 들어감 (조경이라 견적에는 빠지니 필요하면 견적의 기타 항목으로)' : '집계·견적에 그대로 들어감';
          body.querySelector('.fc-count').textContent = `${o.kind} ${list.length}개를 놓습니다 (${where})${open ? ` · 입구 ${App.units.formatLength(open)}` : ''}${old ? ` · 전에 두른 ${old}개는 바꿈` : ''}.`;
        };
        body.addEventListener('input', show);
        body.addEventListener('change', show);
        show();
      },
    });
    if (r.id !== 'ok') return [];
    const o = { kind: r.body.querySelector('#fcKind').value, gap: App.units.parseLength(r.body.querySelector('#fcGap').value), side: r.body.querySelector('#fcSide').value };
    const ids = around(zoneId, o);
    if (ids.length) {
      App.selection.set(ids);
      App.ui.toast(`${o.kind} ${ids.length}개를 둘렀습니다. 한 번에 되돌리려면 Ctrl+Z.`);
    }
    return ids;
  }

  App.fences = { KINDS, plan, around, dialog, existing, openingOf };
  /* ── 주차 칸 채우기: 영역을 표준 주차 칸 줄로 채움 (줄 — 통로 — 줄, 칸 앞이 통로 쪽). 줄은 영역의 가장 긴 변 방향 ── */
  const PARK = { w: 2500, d: 5000, aisle: 6000 };
  function parkingPlan(zone, o = {}) {
    const W = Math.max(2000, Number(o.w) || PARK.w), D = Math.max(4000, Number(o.d) || PARK.d), A = Math.max(3000, Number(o.aisle) || PARK.aisle);
    const pts = zone.points;
    if (!pts || pts.length < 3) return [];
    // 가장 긴 변의 방향을 줄 방향(u)으로
    let best = null;
    pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length], L = Math.hypot(q.x - p.x, q.y - p.y); if (!best || L > best.L) best = { L, a: Math.atan2(q.y - p.y, q.x - p.x) }; });
    // 점 순서와 상관없이 가장 긴 변이 아래(v 최소)에 오게: 영역 안쪽이 그 변의 +v 쪽이 되도록 방향을 정함
    if (App.geom.signedArea(pts) < 0) best.a += Math.PI;
    const c = Math.cos(best.a), sn = Math.sin(best.a);
    const toL = (p) => ({ u: p.x * c + p.y * sn, v: -p.x * sn + p.y * c });
    const toW = (u, v) => ({ x: u * c - v * sn, y: u * sn + v * c });
    const L = pts.map(toL);
    const v0 = Math.min(...L.map((p) => p.v)), v1 = Math.max(...L.map((p) => p.v));
    // v = 일정한 선이 영역 안에 있는 u 구간들
    const spans = (v) => {
      const xs = [];
      L.forEach((p, i) => { const q = L[(i + 1) % L.length]; if ((p.v <= v) !== (q.v <= v)) xs.push(p.u + ((v - p.v) / (q.v - p.v)) * (q.u - p.u)); });
      xs.sort((a, b) => a - b);
      const out = [];
      for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
      return out;
    };
    // 띠 [va, vb]가 통째로 들어가는 u 구간들 (ㄷ자처럼 떨어진 곳은 따로), 띠 안의 꼭짓점 높이에서도 확인 (뾰족한 홈)
    const usable = (va, vb) => {
      const vs = [va + 60, (va + vb) / 2, vb - 60, ...L.filter((p) => p.v > va && p.v < vb).flatMap((p) => [p.v - 1, p.v + 1])];
      let cur = spans(vs[0]);
      for (const v of vs.slice(1)) {
        const ls = spans(v), next = [];
        cur.forEach(([a, b]) => ls.forEach(([x, y]) => { const lo = Math.max(a, x), hi = Math.min(b, y); if (hi > lo) next.push([lo, hi]); }));
        cur = next;
        if (!cur.length) break;
      }
      return cur;
    };
    // 줄 놓기: 아래에서부터 [줄(앞이 위) · 통로 · 줄(앞이 아래)] 묶음을 맞붙여 반복, 남으면 한쪽만 있는 줄 + 통로
    const rows = [];
    let v = v0 + 300;
    while (v + D + A <= v1 - 300 + 1) {
      rows.push({ va: v, vb: v + D, face: 1 });
      if (v + D + A + D <= v1 - 300 + 1) { rows.push({ va: v + D + A, vb: v + D + A + D, face: -1 }); v += D + A + D; } else { v += D + A; break; }
    }
    const out = [];
    rows.forEach((r, ri) => {
      usable(r.va, r.vb).forEach((I) => {
        let n = Math.floor((I[1] - I[0] - 200) / W);
        let u = I[0] + (I[1] - I[0] - n * W) / 2;
        while (n > 0) {
          const k = Math.min(n, 100); // 한 물건은 100칸까지
          const m = toW(u + (k * W) / 2, (r.va + r.vb) / 2);
          out.push({ x: Math.round(m.x), y: Math.round(m.y), rotation: Math.round(((((best.a * 180) / Math.PI) + (r.face > 0 ? 0 : 180)) % 360 + 360) % 360 * 10) / 10, count: k, w: W, d: D, row: ri });
          u += k * W; n -= k;
        }
      });
    });
    return out;
  }
  const parkingOf = (zoneId) => [...App.doc.all()].filter((e) => e.type === 'item' && e.parkingOf === zoneId);
  function parkingFill(zoneId, o = {}) {
    const z = App.doc.get(zoneId);
    if (!z || z.type !== 'zone') return [];
    const list = parkingPlan(z, o);
    if (!list.length) return [];
    const def = App.catalog.itemDef('주차 구획');
    const T = App.model.TYPES;
    const ids = [];
    App.doc.transact('주차 칸 채우기', () => {
      parkingOf(zoneId).forEach((e) => App.doc.remove(e.id));
      list.forEach((p) => {
        const it = T.item.create({ x: p.x, y: p.y }, def.category, def, p.rotation, null);
        it.count = p.count; it.size = p.count * p.w; it.depth = p.d; it.stallW = p.w; // 칸 폭을 기억 (칸 수·폭을 고쳐도 그대로)
        it.parkingOf = zoneId;
        App.doc.add(it);
        ids.push(it.id);
      });
    });
    return ids;
  }
  async function parkingDialog(zoneId) {
    const z = App.doc.get(zoneId);
    if (!z || z.type !== 'zone') return [];
    const U = App.units;
    const old = parkingOf(zoneId).reduce((t, e) => t + (e.count || 1), 0);
    const r = await App.ui.dialog({
      title: '주차 칸 채우기',
      html: `
        <p class="dialog-note">‘${(z.name || '영역').replace(/[<>&"]/g, '')}’을 주차 칸 줄로 채웁니다. 줄은 영역의 가장 긴 변 방향, 두 줄이 통로 하나를 같이 씁니다.</p>
        <div class="field-grid">
          <div class="field"><label class="field-label" for="pkW">칸 폭</label><div class="field-box"><input id="pkW" type="text" inputmode="decimal" autocomplete="off" value="${U.inputLength(PARK.w)}"><span class="field-unit">${U.lengthLabel()}</span></div></div>
          <div class="field"><label class="field-label" for="pkD">칸 길이</label><div class="field-box"><input id="pkD" type="text" inputmode="decimal" autocomplete="off" value="${U.inputLength(PARK.d)}"><span class="field-unit">${U.lengthLabel()}</span></div></div>
        </div>
        <div class="field"><label class="field-label" for="pkA">통로 폭 <small>차가 다니는 길</small></label><div class="field-box"><input id="pkA" type="text" inputmode="decimal" autocomplete="off" value="${U.inputLength(PARK.aisle)}"><span class="field-unit">${U.lengthLabel()}</span></div></div>
        <p class="props-meta pk-count" aria-live="polite"></p>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '채우기', primary: true }],
      onOpen(body) {
        const show = () => {
          const o = { w: U.parseLength(body.querySelector('#pkW').value), d: U.parseLength(body.querySelector('#pkD').value), aisle: U.parseLength(body.querySelector('#pkA').value) };
          const list = parkingPlan(z, o), n = list.reduce((t, p) => t + p.count, 0), rowsN = new Set(list.map((p) => p.row)).size;
          body.querySelector('.pk-count').textContent = n ? `주차 ${n}칸 (${rowsN}줄)을 놓습니다${old ? ` · 전에 채운 ${old}칸은 바꿈` : ''}. 집계의 ‘주차’에 칸 수가 나옵니다.` : '영역이 좁아 칸이 들어가지 않습니다 (폭이 칸 길이 + 통로 폭 + 0.6m보다 넓어야 함).';
        };
        body.addEventListener('input', show);
        show();
      },
    });
    if (r.id !== 'ok') return [];
    const o = { w: U.parseLength(r.body.querySelector('#pkW').value), d: U.parseLength(r.body.querySelector('#pkD').value), aisle: U.parseLength(r.body.querySelector('#pkA').value) };
    const ids = parkingFill(zoneId, o);
    if (ids.length) {
      App.selection.set(ids);
      const n = ids.reduce((t, id) => t + (App.doc.get(id).count || 1), 0);
      App.ui.toast(`주차 ${n}칸을 놓았습니다. 한 번에 되돌리려면 Ctrl+Z.`);
    } else App.ui.toast('영역이 좁아 칸이 들어가지 않습니다.');
    return ids;
  }
  App.parking = { PARK, plan: parkingPlan, fill: parkingFill, dialog: parkingDialog, existing: parkingOf };

})();
