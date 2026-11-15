/* 구역 둘레 두르기 (조감도 모드): 영역 둘레를 따라 펜스·차단봉·생울타리·담장(이어 붙임) 또는 러버콘(띄엄띄엄)을 놓음.
   한 변에 입구(빈 곳)를 남길 수 있음. 놓은 개수는 물건이라 집계·견적(렌탈 수량)에 그대로 들어감 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const KINDS = [
    { kind: '펜스', label: '펜스 (2m 판)', panel: 2000 },
    { kind: '차단봉', label: '차단봉 (줄 2m)', panel: 2000 },
    { kind: '러버콘', label: '러버콘 (2m 간격)', spacing: 2000 },
    { kind: '생울타리', label: '생울타리', panel: 3000 },
    { kind: '담장', label: '담장', panel: 5000 },
  ];
  const SIDES = [['bottom', '아래'], ['top', '위'], ['left', '왼쪽'], ['right', '오른쪽'], ['none', '없음']];

  /** 영역 둘레에 놓을 물건 목록 (아직 도면에 넣지 않음). o: { kind, gap(mm), side } */
  function plan(zone, o = {}) {
    const k = KINDS.find((x) => x.kind === o.kind) || KINDS[0];
    const def = App.catalog.itemDef(k.kind);
    const pts = zone.points;
    const n = pts.length;
    if (!def || n < 3) return [];
    const edges = pts.map((p, i) => ({ a: p, b: pts[(i + 1) % n] })).filter((e) => Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) > 10);
    // 입구가 들어갈 변: 그 방향으로 가장 바깥에 있는 변 (변 가운데로)
    const gap = Math.max(0, Number(o.gap) || 0);
    let door = -1;
    if (gap > 0 && o.side && o.side !== 'none') {
      const score = (e) => { const mx = (e.a.x + e.b.x) / 2, my = (e.a.y + e.b.y) / 2; return { bottom: my, top: -my, left: -mx, right: mx }[o.side]; };
      door = edges.reduce((best, e, i) => (best < 0 || score(e) > score(edges[best]) ? i : best), -1);
    }
    // 변을 조각으로: 입구 변은 가운데를 비움
    const runs = [];
    edges.forEach((e, i) => {
      const L = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
      if (i === door && gap < L - 200) {
        const s0 = (L - gap) / 2, s1 = (L + gap) / 2;
        const at = (s) => ({ x: e.a.x + ((e.b.x - e.a.x) * s) / L, y: e.a.y + ((e.b.y - e.a.y) * s) / L });
        runs.push({ a: e.a, b: at(s0) }, { a: at(s1), b: e.b });
      } else if (i !== door) runs.push(e);
    });
    const out = [];
    runs.forEach((r) => {
      const L = Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y);
      if (L < 100) return;
      const ux = (r.b.x - r.a.x) / L, uy = (r.b.y - r.a.y) / L;
      const rot = ((Math.atan2(uy, ux) * 180) / Math.PI + 360) % 360;
      if (k.spacing) {
        // 띄엄띄엄 (러버콘): 시작점부터 간격마다, 끝점은 다음 변의 시작점과 겹치므로 뺌
        const m = Math.max(1, Math.round(L / k.spacing));
        for (let i = 0; i < m; i++) out.push({ x: r.a.x + ux * (L * i) / m, y: r.a.y + uy * (L * i) / m, rotation: 0, size: def.size });
      } else {
        // 이어 붙임: 판은 늘 같은 규격(예: 펜스 2m)으로, 변 끝까지 모자라지 않게 개수를 올리고 고르게 (조금씩 겹침)
        // → 집계·견적에 ‘펜스 2m × N개’ 한 줄로 (렌탈 수량)
        const m = Math.max(1, Math.ceil(L / k.panel - 0.05));
        const len = L / m;
        const size = m === 1 && L < k.panel * 0.6 ? Math.round(L) : k.panel; // 아주 짧은 변만 짧은 판
        for (let i = 0; i < m; i++) out.push({ x: r.a.x + ux * len * (i + 0.5), y: r.a.y + uy * len * (i + 0.5), rotation: Math.round(rot * 10) / 10, size });
      }
    });
    return out.map((p) => ({ ...p, kind: k.kind }));
  }

  /** 도면에 넣음. 돌려주는 값: 넣은 물건 id들 */
  function around(zoneId, o = {}) {
    const z = App.doc.get(zoneId);
    if (!z || z.type !== 'zone') return [];
    const list = plan(z, o);
    if (!list.length) return [];
    const T = App.model.TYPES;
    const ids = [];
    App.doc.transact('둘레 두르기', () => {
      list.forEach((p) => {
        const def = App.catalog.itemDef(p.kind);
        const it = T.item.create({ x: p.x, y: p.y }, def.category, def, p.rotation, null);
        if (p.size !== def.size) {
          it.size = p.size;
          if (def.resize) Object.assign(it, def.resize(it));
        }
        App.doc.add(it);
        ids.push(it.id);
      });
    });
    return ids;
  }

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
        const show = () => {
          const o = { kind: body.querySelector('#fcKind').value, gap: App.units.parseLength(body.querySelector('#fcGap').value), side: body.querySelector('#fcSide').value };
          const n = plan(z, o).length;
          body.querySelector('.fc-count').textContent = `${o.kind} ${n}개를 놓습니다 (집계·견적에 그대로 들어감).`;
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

  App.fences = { KINDS, plan, around, dialog };
})();
