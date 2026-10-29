/* 집계 탭: 도면 전체의 면적·수량·길이·자재를 한눈에.
   (6단계에서 방별·종류별 보기, 합계 행, CSV 내보내기를 더함) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const G = App.geom;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v) => String(Number(v));

  /** 같은 열쇠끼리 개수 세기 (넣은 순서 유지) */
  function countBy(list, keyOf) {
    const m = new Map();
    list.forEach((e) => m.set(keyOf(e), (m.get(keyOf(e)) || 0) + 1));
    return [...m.entries()];
  }

  function compute() {
    const all = [...App.doc.all()];
    const of = (t) => all.filter((e) => e.type === t);
    const walls = of('wall'), rooms = of('room'), doors = of('door'), windows = of('window');
    const columns = of('column'), items = of('item'), lines = of('line'), zones = of('zone');
    const M = App.measure;
    const R = App.model.TYPES.room;

    const wallQ = walls.map((w) => M.wall(w));
    const floor = rooms.reduce((s, r) => s + R.floorArea(r), 0);
    const lineGroups = new Map();
    lines.forEach((l) => {
      const p = App.doc.get(l.presetId);
      const key = p ? p.name : l.category;
      const g = lineGroups.get(key) || { name: key, plan: 0, rise: 0 };
      g.plan += G.dist(l.start, l.end);
      g.rise += l.rise || 0;
      lineGroups.set(key, g);
    });
    return {
      walls: walls.length,
      wallLength: wallQ.reduce((s, q) => s + q.length, 0),
      wallArea: wallQ.reduce((s, q) => s + q.area, 0),
      rooms: rooms.length,
      roomIssues: rooms.filter((r) => r.issue).length,
      floor,
      ceiling: floor, // 천장 면적: 방마다 바닥 면적과 같게 (6단계에서 방별로 고칠 수 있게)
      doors: countBy(doors, (d) => `${d.kind} ${num(d.width)}×${num(d.height)}`),
      windows: countBy(windows, (w) => `${w.kind} ${num(w.width)}×${num(w.height)}`),
      columns: countBy(columns, (c) => (c.shape === 'circle' ? `원형 Ø${num(c.width)}` : `사각 ${num(c.width)}×${num(c.depth)}`)),
      elec: countBy(items.filter((i) => i.category === 'elec'), (i) => i.kind),
      mech: countBy(items.filter((i) => i.category === 'mech'), (i) => i.kind),
      lines: [...lineGroups.values()],
      materials: M.materials(walls),
      zones: zones.map((z) => [z.name, App.model.TYPES.zone.area(z)]),
    };
  }

  function section(title, rows) {
    if (!rows.length) return '';
    return `
      <section class="sum-sec">
        <h3 class="sum-title">${esc(title)}</h3>
        <table class="sum-table"><tbody>
          ${rows.map(([k, v, note]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}${note ? `<small>${esc(note)}</small>` : ''}</td></tr>`).join('')}
        </tbody></table>
      </section>`;
  }

  function render() {
    const pane = document.getElementById('pane-summary');
    const s = compute();
    const U = App.units, M = App.measure;
    const count = (list) => list.map(([k, n]) => [k, `${n}개`]);
    const sum = (list) => list.reduce((t, [, n]) => t + n, 0);
    const html = [
      section('건축', [
        ...(s.walls ? [['벽 길이 합계', U.formatLength(s.wallLength), `벽 ${s.walls}개`], ['벽 면적 합계 (한 면)', U.formatArea(s.wallArea), '문·창문 뺌']] : []),
        ...(s.rooms ? [['바닥 면적 합계', U.formatArea(s.floor), `방 ${s.rooms}개${s.roomIssues ? ` · 경계 확인 필요 ${s.roomIssues}개` : ''}`], ['천장 면적 합계', U.formatArea(s.ceiling), '바닥 면적과 같게 계산']] : []),
      ]),
      section(`문 ${sum(s.doors)}개`, count(s.doors)),
      section(`창문 ${sum(s.windows)}개`, count(s.windows)),
      section(`기둥 ${sum(s.columns)}개`, count(s.columns)),
      section('벽 자재', [
        ...s.materials.frames.map((f) => [f.name, `${M.meters(f.length)} · ${f.pieces}본`, `${Number(f.piece / 1000)}m 기준${f.loss ? `, 로스 ${f.loss}%` : ''}`]),
        ...s.materials.boards.map((b) => [b.spec, `${U.formatArea(b.area)} · ${b.sheets}장`, b.loss ? `로스 ${b.loss}%` : '']),
      ]),
      section(`전기 ${sum(s.elec)}개`, count(s.elec)),
      section(`설비 ${sum(s.mech)}개`, count(s.mech)),
      section('선 길이', s.lines.map((g) => [g.name, M.meters(g.plan + g.rise), `평면 ${M.meters(g.plan)} + 수직 ${M.meters(g.rise)}`])),
      section('영역', s.zones.map(([name, area]) => [name, U.formatArea(area)])),
    ].join('');
    pane.innerHTML = html || `
      <div class="empty">
        <div class="empty-title">집계할 항목 없음</div>
        <p>벽과 방, 문·창문, 전기·설비 기호를 그리면 면적·수량·길이·자재가 여기에 자동으로 정리됩니다.</p>
      </div>`;
  }

  let dirty = true;
  function init() {
    const pane = document.getElementById('pane-summary');
    App.doc.onChange(() => {
      if (pane.hidden) dirty = true; // 안 보일 때는 탭을 열 때 계산
      else render();
    });
    App.ui.on('tab', (id) => {
      if (id === 'tab-summary' && dirty) {
        render();
        dirty = false;
      }
    });
    render();
  }

  App.summary = { init, compute, render };
})();
