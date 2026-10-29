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
    const width = Math.max(1, maxX - minX), height = Math.max(1, maxY - minY);

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

    return {
      id: `uld-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name, width, height, polys, texts, chunks: [...cells.values()], grid, cell,
      lines: parsed.stats.lines, textCount: parsed.stats.texts,
    };
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
        const lines = t.text.split('\n');
        const lh = t.h * 1.4;
        const y0 = t.va === 'bottom' ? -(lines.length - 1) * lh : t.va === 'middle' ? (-(lines.length - 1) * lh) / 2 : 0;
        ctx.save();
        ctx.translate(t.x, t.y);
        if (t.rot) ctx.rotate(t.rot);
        ctx.font = `${t.h}px ${family}`;
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

  async function dwgHelp(name) {
    const r = await App.ui.dialog({
      title: 'DWG는 DXF로 바꿔서 불러오세요',
      html: `
        <p><b>${esc(name)}</b>은 DWG 파일입니다. DWG는 오토캐드 전용 형식이라 앱 안에서 바로 읽지 못합니다.
        같은 도면을 <b>DXF</b>로 저장하면 그대로 불러올 수 있습니다.</p>
        <ol>
          <li>캐드가 있으면: <b>다른 이름으로 저장</b> → 파일 형식에서 <b>DXF</b> 고르기</li>
          <li>캐드가 없으면: 무료 프로그램 <b>ODA File Converter</b>(PC)로 DWG를 DXF로 변환</li>
          <li>도면을 보낸 사람에게 DXF로 달라고 하기</li>
        </ol>
        <p class="dialog-note">DXF로 불러오면 선과 글자가 회색 밑그림으로 깔리고, 그 위에서 벽을 따라 그릴 수 있습니다.</p>`,
      actions: [{ id: 'cancel', label: '닫기' }, { id: 'pick', label: 'DXF 파일 고르기', primary: true }],
    });
    if (r.id === 'pick') pickFile();
  }

  async function importFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'dwg') return dwgHelp(file.name);
    if (ext !== 'dxf') {
      App.ui.toast('DXF 파일만 불러올 수 있습니다. (DWG는 DXF로 바꿔서)');
      return false;
    }
    App.ui.toast('도면을 읽는 중…');
    await new Promise((r) => setTimeout(r, 30)); // 알림이 먼저 보이게
    let parsed, text;
    try {
      text = App.dxf.decode(await file.arrayBuffer());
      parsed = App.dxf.parse(text);
    } catch (e) {
      await App.ui.dialog({ title: '도면을 읽지 못했습니다', html: `<p>${esc(e.message || e)}</p>` });
      return false;
    }
    if (!parsed.polylines.length && !parsed.texts.length) {
      await App.ui.dialog({ title: '그릴 내용이 없습니다', html: '<p>이 DXF에는 선이나 글자가 없습니다. 도면이 배치(종이) 공간에만 있거나 3D 개체만 있을 수 있습니다.</p>' });
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
        ${parsed.stats.truncated ? '<p class="dialog-note is-warn">도면이 너무 커서 일부만 불러왔습니다.</p>' : ''}`,
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
    if (withHidden && withHidden.checked) parsed = App.dxf.parse(text, { includeHidden: true });
    const d = build(parsed, unitMM, file.name);
    store.set(d.id, d);
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
    init, draw, importFile, pickFile, calibrate, build, store,
    data: (u) => store.get(u.dataId) || null,
    list: () => [...App.doc.all()].filter((e) => e.type === 'underlay'),
  };
})();
