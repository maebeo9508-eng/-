/* 집계표: 방별 / 전체 / 종류별 보기, 소계·총계, CSV 내보내기.
   소계: 한 무리(예: 콘센트 여러 형식, 같은 종류의 문 여러 크기)의 합. 두 줄 이상일 때만 보임
   총계: 한 항목 묶음(문, 전기, 전선관 …) 전체의 합 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v) => String(Number(v));

  const VIEWS = [['room', '방별'], ['all', '전체'], ['kind', '종류별']];
  const OUTSIDE = '방 밖';

  /** 개수·길이로 세는 항목 묶음. 선은 분류(전선관·배관·덕트·기타)마다 따로 */
  function sections() {
    return [
      { id: 'door', title: '문', unit: '개' },
      { id: 'window', title: '창문', unit: '개' },
      { id: 'column', title: '기둥', unit: '개' },
      { id: 'elec', title: '전기', unit: '개' },
      { id: 'mech', title: '설비', unit: '개' },
      ...App.catalog.LINE_CATEGORIES.map((c) => ({ id: `line:${c}`, title: c, unit: 'm' })),
    ];
  }

  const bbox = (pts) => ({
    minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)),
  });

  /** 도면 전체를 세어 기록 목록으로: { sec, group, key, room(id 또는 null), qty } */
  function compute() {
    // 설정에 따라 숨긴 레이어의 것은 집계에서 뺌
    const exclude = App.layers.excludeHidden();
    const all = [...App.doc.all()].filter((e) => !exclude || App.layers.visible(e));
    const of = (t) => all.filter((e) => e.type === t);
    const M = App.measure;
    const rooms = of('room').map((r) => ({ id: r.id, name: r.name || '이름 없음', issue: r.issue, points: r.points, box: bbox(r.points), q: M.room(r) }));
    const records = [];
    const add = (sec, group, key, room, qty) => { if (qty > 0) records.push({ sec, group, key, room: room || null, qty }); };

    of('door').forEach((d) => add('door', d.kind, `${d.kind} ${num(d.width)}×${num(d.height)}`, (M.openingRoom(d) || {}).id, 1));
    of('window').forEach((w) => add('window', w.kind, `${w.kind} ${num(w.width)}×${num(w.height)}`, (M.openingRoom(w) || {}).id, 1));
    of('column').forEach((c) => {
      const shape = App.catalog.SHAPE_NAMES[c.shape];
      add('column', shape, c.shape === 'circle' ? `원형 Ø${num(c.width)}` : `사각 ${num(c.width)}×${num(c.depth)}`, c.room, 1);
    });
    of('item').forEach((it) => add(it.category, it.kind, App.catalog.itemLabel(it), it.room, 1));
    of('line').forEach((l) => {
      const p = App.doc.get(l.presetId);
      const name = p ? p.name : l.category;
      const sec = `line:${App.catalog.LINE_CATEGORIES.includes(l.category) ? l.category : '기타'}`;
      // 평면 길이는 방 경계에서 잘라 방마다, 기구까지 오르내리는 길이는 그 기구가 있는 방, 추가 수직은 선 가운데가 있는 방
      M.lineRooms(l, rooms).forEach((len, room) => add(sec, name, name, room, len));
      const q = M.line(l);
      q.ends.forEach((e) => add(sec, name, name, e.item.room, e.drop));
      const mid = M.roomAt({ x: (l.start.x + l.end.x) / 2, y: (l.start.y + l.end.y) / 2 });
      add(sec, name, name, mid && mid.id, q.extra);
    });

    const walls = of('wall');
    const wallQ = walls.map((w) => M.wall(w));
    return {
      excluded: exclude ? App.layers.hidden().map((id) => (App.layers.list().find((l) => l.id === id) || {}).label).filter(Boolean) : [],
      rooms,
      records,
      arch: {
        walls: walls.length,
        wallLength: wallQ.reduce((s, q) => s + q.length, 0),
        wallArea: wallQ.reduce((s, q) => s + q.area, 0),
        floor: rooms.reduce((s, r) => s + r.q.floor, 0),
        ceiling: rooms.reduce((s, r) => s + r.q.ceiling, 0),
        roomWall: rooms.reduce((s, r) => s + r.q.wallArea, 0),
        issues: rooms.filter((r) => r.issue).length,
      },
      materials: M.materials(walls),
      zones: of('zone').map((z) => ({ name: z.name, area: App.model.TYPES.zone.area(z) })),
    };
  }

  /* ── 값: 화면 글자와 CSV 숫자·단위 ── */
  const V = {
    count: (n, unit = '개') => ({ text: `${n.toLocaleString('ko-KR')}${unit}`, num: n, unit }),
    run: (mm) => {
      const [n, unit] = App.units.runValue(mm);
      return { text: App.units.formatRun(mm), num: n, unit };
    },
    area: (mm2) => ({ text: App.units.formatArea(mm2), num: App.units.areaValue(mm2), unit: App.units.areaLabel() }),
    length: (mm) => ({ text: App.units.formatLength(mm), num: App.units.lengthValue(mm), unit: App.units.lengthLabel() }),
  };
  const secValue = (sec, qty) => (sec.unit === 'm' ? V.run(qty) : V.count(qty));

  /** 같은 열쇠끼리 수량을 더함 (처음 나온 순서 유지) */
  function sumBy(list, keyOf) {
    const m = new Map();
    list.forEach((r) => {
      const k = keyOf(r);
      m.set(k, (m.get(k) || 0) + r.qty);
    });
    return m;
  }
  const total = (list) => list.reduce((s, r) => s + r.qty, 0);

  /* 표 모델: 블록 { title, sub, rows: [{ cls, label, value, note, cat }] }
     cls: '' 보통 줄, head 소제목, sub 들여 쓴 줄, subtotal 소계, total 총계. cat은 CSV의 '분류' 칸 */
  const row = (label, value, note = '', cls = '', cat = '') => ({ label, value, note, cls, cat });

  /** 한 항목 묶음의 줄들: 무리(group)마다 줄을 모으고 두 줄 이상이면 소계 */
  function sectionRows(sec, recs) {
    const rows = [];
    const groups = new Map();
    recs.forEach((r) => {
      if (!groups.has(r.group)) groups.set(r.group, []);
      groups.get(r.group).push(r);
    });
    groups.forEach((list, group) => {
      const byKey = sumBy(list, (r) => r.key);
      byKey.forEach((qty, key) => rows.push(row(key, secValue(sec, qty), '', '', group)));
      if (byKey.size > 1) rows.push(row(`${group} 소계`, secValue(sec, total(list)), '', 'subtotal', group));
    });
    return rows;
  }

  function materialRows(m) {
    const loss = (v) => (v ? `, 로스 ${v}%` : '');
    return [
      ...m.frames.map((f) => row(f.name, V.count(f.pieces, '본'), `${App.measure.meters(f.length)} (${num(f.piece / 1000)}m 기준${loss(f.loss)})`)),
      ...m.boards.map((b) => row(b.spec, V.count(b.sheets, '장'), `${App.units.formatArea(b.area)}${loss(b.loss)}`)),
    ];
  }

  /** 전체: 도면 전체 합계 */
  function viewAll(s) {
    const blocks = [];
    const a = s.arch;
    const arch = [];
    if (a.walls) {
      arch.push(row('벽 길이 합계', V.length(a.wallLength), `벽 ${a.walls}개`));
      arch.push(row('벽 면적 합계 (한 면)', V.area(a.wallArea), '문·창문 뺌'));
    }
    if (s.rooms.length) {
      arch.push(row('바닥 면적 합계', V.area(a.floor), `방 ${s.rooms.length}개${a.issues ? ` · 경계 확인 필요 ${a.issues}개` : ''}`));
      arch.push(row('천장 면적 합계', V.area(a.ceiling)));
    }
    if (arch.length) blocks.push({ title: '건축', rows: arch });
    const mat = materialRows(s.materials);
    if (mat.length) blocks.push({ title: '벽 자재', sub: '본·장 수는 전체 길이·면적을 더한 뒤 올림', rows: mat });
    sections().forEach((sec) => {
      const recs = s.records.filter((r) => r.sec === sec.id);
      if (!recs.length) return;
      blocks.push({ title: sec.title, rows: [...sectionRows(sec, recs), row(`${sec.title} 총계`, secValue(sec, total(recs)), '', 'total')] });
    });
    if (s.zones.length) {
      const zr = s.zones.map((z) => row(z.name, V.area(z.area)));
      if (zr.length > 1) zr.push(row('영역 총계', V.area(s.zones.reduce((t, z) => t + z.area, 0)), '겹친 곳은 두 번 셈', 'total'));
      blocks.push({ title: '영역', rows: zr });
    }
    return blocks;
  }

  /** 방별: 방마다 면적과 그 방에 있는 것, 끝에 방 밖과 총계 */
  function viewRoom(s) {
    const blocks = [];
    const secs = sections();
    const roomItems = (roomId) => {
      const rows = [];
      secs.forEach((sec) => {
        const recs = s.records.filter((r) => r.sec === sec.id && r.room === roomId);
        if (!recs.length) return;
        rows.push(row(sec.title, null, '', 'head', sec.title));
        const byKey = sumBy(recs, (r) => r.key);
        byKey.forEach((qty, key) => rows.push(row(key, secValue(sec, qty), '', '', sec.title)));
        if (byKey.size > 1) rows.push(row(`${sec.title} 소계`, secValue(sec, total(recs)), '', 'subtotal', sec.title));
      });
      return rows;
    };
    s.rooms.forEach((r) => {
      const q = r.q;
      const rows = [
        row('바닥 면적', V.area(q.floor), '', '', '면적'),
        row('천장 면적', V.area(q.ceiling), q.ceiling !== q.floor ? '직접 입력' : '', '', '면적'),
        row('벽 면적 (방 쪽)', V.area(q.wallArea), q.openingArea ? `문·창문 ${App.units.formatArea(q.openingArea)} 뺌` : '', '', '면적'),
        ...q.boards.map((b) => row(`${b.spec} (방 쪽)`, V.area(b.area), '겹 수 반영', '', '면적')),
        row('둘레', V.length(q.perimeter), '', '', '면적'),
        ...roomItems(r.id),
      ];
      blocks.push({ title: r.name, sub: r.issue ? '경계 확인 필요' : '', warn: !!r.issue, rows });
    });
    const outside = roomItems(null);
    if (outside.length) blocks.push({ title: OUTSIDE, sub: '방으로 등록되지 않은 곳', rows: outside });
    // 총계: 모든 방의 면적 합과 항목 묶음별 합
    const tot = [];
    if (s.rooms.length) {
      tot.push(row('바닥 면적', V.area(s.arch.floor), `방 ${s.rooms.length}개`, '', '면적'));
      tot.push(row('천장 면적', V.area(s.arch.ceiling), '', '', '면적'));
      tot.push(row('벽 면적 (방 쪽)', V.area(s.arch.roomWall), '칸막이 벽은 양쪽 방에 한 면씩', '', '면적'));
    }
    secs.forEach((sec) => {
      const recs = s.records.filter((r) => r.sec === sec.id);
      if (recs.length) tot.push(row(sec.title, secValue(sec, total(recs)), '', '', sec.title));
    });
    if (tot.length) blocks.push({ title: '총계', rows: tot, total: true });
    return blocks;
  }

  /** 종류별: 항목마다 합계와 어느 방에 얼마나 있는지 */
  function viewKind(s) {
    const blocks = [];
    const roomName = new Map(s.rooms.map((r) => [r.id, r.name]));
    const nameOf = (id) => (id ? roomName.get(id) || '이름 없음' : OUTSIDE);
    if (s.rooms.length) {
      const areaRows = [];
      [['바닥 면적', (q) => q.floor], ['천장 면적', (q) => q.ceiling], ['벽 면적 (방 쪽)', (q) => q.wallArea]].forEach(([label, get]) => {
        areaRows.push(row(label, V.area(s.rooms.reduce((t, r) => t + get(r.q), 0)), '', 'item', label));
        s.rooms.forEach((r) => areaRows.push(row(r.name, V.area(get(r.q)), '', 'sub', label)));
      });
      blocks.push({ title: '면적', rows: areaRows });
    }
    sections().forEach((sec) => {
      const recs = s.records.filter((r) => r.sec === sec.id);
      if (!recs.length) return;
      const rows = [];
      const byKey = new Map();
      recs.forEach((r) => {
        if (!byKey.has(r.key)) byKey.set(r.key, []);
        byKey.get(r.key).push(r);
      });
      byKey.forEach((list, key) => {
        rows.push(row(key, secValue(sec, total(list)), '', 'item', key));
        sumBy(list, (r) => r.room).forEach((qty, room) => rows.push(row(nameOf(room), secValue(sec, qty), '', 'sub', key)));
      });
      rows.push(row(`${sec.title} 총계`, secValue(sec, total(recs)), '', 'total'));
      blocks.push({ title: sec.title, rows });
    });
    return blocks;
  }

  const BUILD = { all: viewAll, room: viewRoom, kind: viewKind };
  let view = 'room';

  function blockHtml(b) {
    return `
      <section class="sum-sec${b.total ? ' is-grand' : ''}">
        <h3 class="sum-title">${esc(b.title)}${b.sub ? ` <small class="${b.warn ? 'is-warn' : ''}">${esc(b.sub)}</small>` : ''}</h3>
        <table class="sum-table"><tbody>
          ${b.rows.map((r) => (r.cls === 'head'
            ? `<tr class="is-head"><th colspan="2" scope="rowgroup">${esc(r.label)}</th></tr>`
            : `<tr${r.cls ? ` class="is-${r.cls}"` : ''}><th scope="row">${esc(r.label)}</th><td>${esc(r.value.text)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</td></tr>`)).join('')}
        </tbody></table>
      </section>`;
  }

  function render() {
    const pane = document.getElementById('pane-summary');
    const s = compute();
    const blocks = BUILD[view](s);
    const scroll = pane.scrollTop;
    pane.innerHTML = `
      <div class="sum-bar">
        <div class="sum-views" role="tablist" aria-label="집계 보기">
          ${VIEWS.map(([id, label]) => `<button type="button" class="seg-btn" role="tab" data-view="${id}" aria-selected="${id === view}">${label}</button>`).join('')}
        </div>
        <button type="button" class="btn" data-act="csv" ${blocks.length ? '' : 'disabled'} title="엑셀에서 열 수 있는 CSV 파일로 저장">CSV</button>
      </div>
      ${s.excluded.length ? `<p class="dialog-note is-warn">숨긴 레이어(${esc(s.excluded.join(', '))})는 집계에서 뺐습니다. 위쪽 ‘레이어’에서 바꿀 수 있습니다.</p>` : ''}
      ${blocks.map(blockHtml).join('') || `
        <div class="empty">
          <div class="empty-title">집계할 항목 없음</div>
          <p>${view === 'room' && !s.rooms.length && s.records.length
            ? '방이 아직 없습니다. ‘방’ 도구로 벽에 둘러싸인 곳을 누르면 방별로 나눠 집계합니다.'
            : '벽과 방, 문·창문, 전기·설비 기호를 그리면 면적·수량·길이·자재가 여기에 자동으로 정리됩니다.'}</p>
        </div>`}`;
    pane.scrollTop = scroll;
  }

  /** 지금 보기를 CSV 줄로: 구분(블록) · 분류 · 항목 · 수량 · 단위 · 비고 */
  function csvRows() {
    const label = VIEWS.find(([id]) => id === view)[1];
    const rows = [['구분', '분류', '항목', '수량', '단위', '비고']];
    BUILD[view](compute()).forEach((b) => {
      b.rows.forEach((r) => {
        if (r.cls === 'head') return;
        const item = view === 'kind' && r.cls === 'item' ? '합계' : r.label;
        rows.push([b.title, r.cat || '', item, r.value.num, r.value.unit, r.note || '']);
      });
    });
    return { rows, label };
  }

  function exportCsv() {
    const { rows, label } = csvRows();
    if (rows.length <= 1) {
      App.ui.toast('내보낼 집계가 없습니다. 먼저 도면을 그리세요.');
      return false;
    }
    const name = `집계표_${label}_${App.exporter.stamp()}.csv`;
    App.exporter.download(name, App.exporter.csvText(rows), 'text/csv;charset=utf-8');
    App.ui.toast(`‘${name}’을 저장했습니다. 엑셀에서 바로 열 수 있습니다.`);
    return true;
  }

  let dirty = true;
  function init() {
    const pane = document.getElementById('pane-summary');
    App.doc.onChange(() => {
      if (pane.hidden) dirty = true; // 안 보일 때는 탭을 열 때 계산
      else render();
    });
    const again = () => {
      if (pane.hidden) dirty = true;
      else render();
    };
    App.ui.on('settings', again);
    App.ui.on('layers', again);
    App.ui.on('tab', (id) => {
      if (id === 'tab-summary' && dirty) {
        render();
        dirty = false;
      }
    });
    pane.addEventListener('click', (e) => {
      const v = e.target.closest('[data-view]');
      if (v) {
        view = v.dataset.view;
        render();
        pane.querySelector(`[data-view="${view}"]`).focus();
        return;
      }
      if (e.target.closest('[data-act="csv"]')) exportCsv();
    });
    render();
  }

  App.summary = {
    init, compute, render, exportCsv, csvRows,
    /** 보기(room·all·kind)의 표 블록 (PDF에 그릴 때) */
    blocks: (v) => BUILD[v](compute()),
    get view() { return view; },
    setView(v) { view = v; render(); },
  };
})();
