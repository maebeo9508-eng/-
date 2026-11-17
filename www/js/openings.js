/* 창호 일람표: 같은 종류·규격(폭·높이, 창문은 창대 높이까지)의 새로 다는 문·창문을 한 기호로 묶음 — 문 D1·D2…, 창문 W1·W2…
   - 순서: 문 먼저, 종류(목록 순) → 넓은 것 → 높은 것 → 창대 낮은 것. 도면이 바뀌면 다시 매김
   - 리모델링에서 기존(그대로 둠)·철거로 정한 것은 주문·설치할 것이 아니라 기호를 붙이지 않음
   - 레이어 메뉴의 ‘창호 기호’를 켜면 도면(PNG·PDF 포함)에 기호 꼬리표를 띄움 (App.current.openingMarks, 도면마다) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  let cache = { version: -1, data: null };
  const mm = (v) => Math.round(Number(v) || 0);

  /** { list: [{ mark, type, kind, width, height, sill, ids }], byId: Map(id → 기호) } */
  function marks() {
    if (cache.version === App.doc.version && cache.data) return cache.data;
    const groups = new Map();
    for (const el of App.doc.all()) {
      if ((el.type !== 'door' && el.type !== 'window') || App.model.phaseOf(el) !== 'new') continue;
      const sill = el.type === 'window' ? mm(el.sill) : null;
      const key = `${el.type}|${el.kind}|${mm(el.width)}|${mm(el.height)}|${sill == null ? '' : sill}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { key, type: el.type, kind: el.kind || '', width: mm(el.width), height: mm(el.height), sill, ids: [] }));
      g.ids.push(el.id);
    }
    const kindOrder = (g) => {
      const i = App.model.TYPES[g.type].KINDS.indexOf(g.kind);
      return i < 0 ? 99 : i;
    };
    const list = [...groups.values()].sort((a, b) => (a.type === b.type ? 0 : a.type === 'door' ? -1 : 1)
      || kindOrder(a) - kindOrder(b) || b.width - a.width || b.height - a.height || (a.sill || 0) - (b.sill || 0));
    const byId = new Map();
    let nd = 0, nw = 0;
    list.forEach((g) => {
      g.mark = g.type === 'door' ? `D${++nd}` : `W${++nw}`;
      g.ids.forEach((id) => byId.set(id, g.mark));
    });
    cache = { version: App.doc.version, data: { list, byId } };
    return cache.data;
  }
  const markOf = (el) => marks().byId.get(el.id) || null;
  /** 이 문·창문과 같은 기호의 묶음 (없으면 null) */
  const groupOf = (el) => { const m = markOf(el); return m ? marks().list.find((g) => g.mark === m) : null; };
  /** 규격 글자: ‘여닫이 900×2100’, 창문은 ‘미서기 1500×1200 · 창대 900’ */
  const specOf = (g) => `${g.kind ? `${g.kind} ` : ''}${g.width}×${g.height}${g.type === 'window' && g.sill ? ` · 창대 ${g.sill}` : ''}`;
  /** 도면에 기호를 띄우는지 (문·창문이 있을 때 레이어 메뉴에서 켬) */
  const showing = () => !!App.current.openingMarks;

  /** 기호 꼬리표 (화면 좌표에서, 확대해도 같은 크기). 여닫이문은 열리는 반대쪽, 나머지는 속한 방의 반대쪽에 */
  function draw(plan, list) {
    if (!showing() || !list.length) return;
    const ctx = plan.ctx, c = plan.colors, M = marks();
    const scale = plan.view.scale;
    ctx.save();
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    list.forEach((el) => {
      const mark = M.byId.get(el.id);
      if (!mark) return;
      const g = App.model.openingGeom(el);
      if (!g || g.half * 2 * scale < 12) return; // 너무 작게 보이면 생략
      let side;
      if (el.type === 'door' && (el.kind === '여닫이' || el.kind === '방화문')) side = -(el.side || 1);
      else {
        const r = App.measure.openingRoom(el);
        const probe = r ? { x: g.center.x + g.n.x * (g.th / 2 + 50), y: g.center.y + g.n.y * (g.th / 2 + 50) } : null;
        side = probe && App.geom.pointInPolygon(probe, r.points) ? -1 : 1;
      }
      const s0 = plan.view.toScreen(g.center.x, g.center.y);
      const s1 = plan.view.toScreen(g.center.x + g.n.x * side * 1000, g.center.y + g.n.y * side * 1000);
      const len = Math.hypot(s1.x - s0.x, s1.y - s0.y) || 1;
      const off = (g.th / 2) * scale + 13;
      const x = s0.x + ((s1.x - s0.x) / len) * off, y = s0.y + ((s1.y - s0.y) / len) * off;
      const w = ctx.measureText(mark).width + 10, h = 17;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, 8.5);
      else ctx.rect(x - w / 2, y - h / 2, w, h);
      ctx.fillStyle = c.canvasBg;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = App.selection.has(el.id) ? c.accent : el.type === 'door' ? '#a0522d' : '#1c7ed6';
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText(mark, x, y + 0.5);
    });
    ctx.restore();
  }

  App.openings = { marks, markOf, groupOf, specOf, showing, draw };
})();
