/* 집계표: 방별(조감도 모드는 구역별) / 전체 / 종류별 보기, 소계·총계, CSV 내보내기.
   소계: 한 무리(예: 콘센트 여러 형식, 같은 종류의 문 여러 크기)의 합. 두 줄 이상일 때만 보임
   총계: 한 항목 묶음(문, 전기, 전선관 …) 전체의 합 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v) => String(Number(v));

  /** 보기 탭. 첫 탭은 인테리어 모드에서 ‘방별’, 조감도 모드에서 ‘구역별’(영역마다 그 안에 있는 것) */
  const views = () => [['room', App.modes.is('event') ? '구역별' : '방별'], ['all', '전체'], ['kind', '종류별'], ['cost', '견적']];
  const OUTSIDE = '방 밖', NO_ZONE = '구역 밖';

  /** 개수·길이로 세는 항목 묶음. 선은 분류(전선관·배관·덕트·기타)마다 따로 */
  function sections() {
    const event = [
      { id: 'event', title: '행사 물건', unit: '개' },
      { id: 'seat', title: '좌석', unit: '석' },
      { id: 'people', title: '사람', unit: '명' },
      { id: 'parking', title: '주차', unit: '칸' },
    ];
    const interior = [
      { id: 'door', title: '문', unit: '개' },
      { id: 'window', title: '창문', unit: '개' },
      { id: 'column', title: '기둥', unit: '개' },
      { id: 'elec', title: '전기', unit: '개' },
      { id: 'mech', title: '설비', unit: '개' },
      { id: 'furn', title: '가구', unit: '개' },
    ];
    const lines = App.catalog.LINE_CATEGORIES.map((c) => ({ id: `line:${c}`, title: c, unit: 'm' }));
    // 조감도 모드에서는 행사 쪽 묶음을 먼저
    return App.modes.is('event') ? [...event, ...interior, ...lines] : [...interior, ...event, ...lines];
  }

  const bbox = (pts) => ({
    minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)),
  });

  /** 마감재 합계: 같은 마감재끼리 면적을 더한 뒤 장 수 (로스 반영, 올림) */
  function finishTotals(rooms) {
    const map = new Map();
    rooms.forEach((r) => r.q.finishes.forEach((f) => {
      const cur = map.get(f.id) || { ...f, area: 0, rooms: 0 };
      cur.area += f.area;
      cur.rooms++;
      map.set(f.id, cur);
    }));
    return [...map.values()].map((f) => ({ ...f, sheets: App.measure.finishSheets(f.preset, f.area) }));
  }
  /** 마감재 한 줄: 장 수가 있으면 장 수, 없으면 면적 */
  function finishRow(f, cat, extraNote = '') {
    const basis = f.target === 'wall' ? `바닥에서 ${num(f.from)} 위 · 문·창문 뺌` : '안목 바닥';
    const unit = f.preset.unitW > 0 && f.preset.unitL > 0 ? ` · ${num(f.preset.unitW)}×${num(f.preset.unitL)} 기준${f.preset.loss ? `, 로스 ${num(f.preset.loss)}%` : ''}` : '';
    return f.sheets != null
      ? row(f.name, V.count(f.sheets, '장'), `${App.units.formatArea(f.area)} · ${basis}${unit}${extraNote}`, '', cat)
      : row(f.name, V.area(f.area), `${basis}${extraNote}`, '', cat);
  }

  /** 마감 자재 한 줄: '실크 벽지 (벽)' 12롤 */
  function matRow(l) {
    const value = { text: `${l.qty.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}${l.unit}`, num: l.qty, unit: l.unit };
    return row(`${l.name}${l.spec ? ` (${l.spec})` : ''}`, value, `${l.note}${l.rooms > 1 ? ` · 방 ${l.rooms}곳` : ''}`, '', l.part);
  }

  /** 도면 전체를 세어 기록 목록으로: { sec, group, key, room(id 또는 null), qty } */
  function compute() {
    // 설정에 따라 숨긴 레이어의 것은 집계에서 뺌
    const exclude = App.layers.excludeHidden();
    const all = [...App.doc.all()].filter((e) => !exclude || App.layers.visible(e));
    const of = (t) => all.filter((e) => e.type === t);
    const M = App.measure;
    const rooms = of('room').map((r) => ({ id: r.id, name: r.name || '이름 없음', issue: r.issue, points: r.points, box: bbox(r.points), q: M.room(r), el: r }));
    const records = [];
    const add = (sec, group, key, room, qty, zone = null) => { if (qty > 0) records.push({ sec, group, key, room: room || null, zone, qty }); };
    // 구역 (조감도 모드): 물건이 놓인 가장 작은 영역 — ‘구역별’ 보기와 설치 체크리스트에 씀
    const event = App.modes.is('event');
    const zones = of('zone').filter((z) => z.points && z.points.length >= 3).map((z) => ({ id: z.id, name: z.name || '이름 없는 영역', area: App.model.TYPES.zone.area(z), surface: App.catalog.surfaceName(z), crowd: !!z.crowd, points: z.points, box: bbox(z.points), mid: App.geom.interiorPoint(z.points) }));
    const bySize = zones.slice().sort((a, b) => a.area - b.area);
    // 안에 있거나 경계선에서 0.3m 안 (둘레에 세운 펜스·입구 아치처럼 선 위에 놓인 것도 그 영역의 것)
    const EDGE = 300;
    const onEdge = (p, pts) => pts.some((q, i) => App.geom.closestOnSegment(p, q, pts[(i + 1) % pts.length]).dist <= EDGE);
    const inZone = (p, z) => p.x >= z.box.minX - EDGE && p.x <= z.box.maxX + EDGE && p.y >= z.box.minY - EDGE && p.y <= z.box.maxY + EDGE && (App.geom.pointInPolygon(p, z.points) || onEdge(p, z.points));
    const zoneIds = new Set(zones.map((z) => z.id));
    const zoneAt = (p) => {
      if (!event) return null;
      const own = p.perimeterOf || p.seatsOf || p.parkingOf; // 그 영역에 두르거나 채운 것은 그 영역의 것
      if (own && zoneIds.has(own)) return own;
      const z = bySize.find((x) => inZone(p, x));
      return z ? z.id : null;
    };
    zones.forEach((z) => { z.holds = zones.some((o) => o !== z && o.area < z.area && inZone(o.mid, z)); }); // 다른 영역을 품은 영역

    of('door').forEach((d) => add('door', d.kind, `${d.kind} ${num(d.width)}×${num(d.height)}`, (M.openingRoom(d) || {}).id, 1));
    of('window').forEach((w) => add('window', w.kind, `${w.kind} ${num(w.width)}×${num(w.height)}`, (M.openingRoom(w) || {}).id, 1));
    of('column').forEach((c) => {
      const shape = App.catalog.SHAPE_NAMES[c.shape];
      add('column', shape, c.shape === 'circle' ? `원형 Ø${num(c.width)}` : `사각 ${num(c.width)}×${num(c.depth)}`, c.room, 1, zoneAt(c));
    });
    of('item').forEach((it) => {
      const zone = zoneAt(it);
      add(it.category, it.kind, App.catalog.itemLabel(it), it.room, 1, zone);
      if (it.category !== 'event') return;
      // 좌석: 의자 배열, 낱개 의자, 테이블 둘레 의자
      const seats = App.catalog.seats(it);
      if (seats) add('seat', '좌석', it.kind === '의자 배열' ? '의자 배열' : it.kind === '의자' ? '낱개 의자' : `${it.kind} 의자`, it.room, seats.count, zone);
      if (it.kind === '사람') add('people', '사람', `사람 · ${it.style || '정장'}`, it.room, it.count || 1, zone);
      if (it.kind === '주차 구획') add('parking', '주차', '주차 구획', it.room, it.count || 1, zone);
    });
    of('line').forEach((l) => {
      const p = App.doc.get(l.presetId);
      const name = p ? p.name : l.category;
      const sec = `line:${App.catalog.LINE_CATEGORIES.includes(l.category) ? l.category : '기타'}`;
      // 평면 길이는 방 경계에서 잘라 방마다, 기구까지 오르내리는 길이는 그 기구가 있는 방, 추가 수직은 선 가운데가 있는 방
      const half = { x: (l.start.x + l.end.x) / 2, y: (l.start.y + l.end.y) / 2 }, lz = zoneAt(half); // 구역은 선 가운데가 있는 곳
      M.lineRooms(l, rooms).forEach((len, room) => add(sec, name, name, room, len, lz));
      const q = M.line(l);
      q.ends.forEach((e) => add(sec, name, name, e.item.room, e.drop, lz));
      const mid = M.roomAt(half);
      add(sec, name, name, mid && mid.id, q.extra, lz);
    });

    const walls = of('wall');
    const wallQ = walls.map((w) => M.wall(w));
    // 다른 방과 같은 면을 차지한 방(겹침)은 같은 바닥을 두 번 세므로 합계·견적에서 뺌
    const counted = rooms.filter((r) => r.issue !== 'overlap');
    return {
      excluded: exclude ? App.layers.hidden().map((id) => (App.layers.list().find((l) => l.id === id) || {}).label).filter(Boolean) : [],
      rooms,
      records,
      arch: {
        walls: walls.length,
        wallLength: wallQ.reduce((s, q) => s + q.length, 0),
        wallOverlap: wallQ.reduce((s, q) => s + q.overlap, 0),
        wallArea: wallQ.reduce((s, q) => s + q.area, 0),
        floor: counted.reduce((s, r) => s + r.q.floor, 0),
        clearFloor: counted.reduce((s, r) => s + r.q.clearArea, 0),
        baseboard: counted.reduce((s, r) => s + r.q.baseboard, 0),
        molding: counted.reduce((s, r) => s + r.q.clearPerimeter, 0),
        ceiling: counted.reduce((s, r) => s + r.q.ceiling, 0),
        roomWall: counted.reduce((s, r) => s + r.q.wallArea, 0),
        paintWall: counted.reduce((s, r) => s + r.q.paintArea, 0),
        issues: rooms.filter((r) => r.issue).length,
        overlaps: rooms.length - counted.length,
      },
      materials: M.materials(walls),
      finishes: finishTotals(counted),
      // 마감 자재: 바닥 모양·벽 마감·천장 마감으로 센 벽지 롤·페인트·마루·타일 (면적을 더한 뒤 올림)
      matLines: App.materials.lines(counted.map((r) => ({ ...r.el, q: r.q }))),
      zones: zones.map((z) => ({ id: z.id, name: z.name, area: z.area, surface: z.surface, crowd: z.crowd, holds: z.holds })),
      routes: of('route').map((r) => ({ route: r, ...App.routes.check(r) })),
      items: of('item'),
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
  const secValue = (sec, qty) => (sec.unit === 'm' ? V.run(qty) : V.count(qty, sec.unit));

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

  /** 동선 묶음: 동선마다 길이·걸리는 시간·걸리는 곳 */
  function routeBlock(s) {
    if (!s.routes.length) return null;
    const R = App.routes;
    const rows = s.routes.map((r) => row(r.route.name, V.run(r.length),
      `${r.route.kind} · ${R.timeText(r.time)} · 통로 폭 ${App.units.formatLength(r.route.width)}${r.issues.length ? ` · 걸리는 곳 ${r.issues.length}곳` : ''}`, '', r.route.kind));
    if (rows.length > 1) rows.push(row('동선 총계', V.run(s.routes.reduce((t, r) => t + r.length, 0)), '', 'total'));
    const bad = s.routes.reduce((n, r) => n + r.issues.length, 0);
    return { title: '동선', sub: bad ? `걸리는 곳 ${bad}곳 · 도면에 빨갛게 표시` : '걸리는 곳 없음', warn: !!bad, rows };
  }
  function zoneBlock(s) {
    if (!s.zones.length) return null;
    const zr = s.zones.map((z) => row(z.name, V.area(z.area), z.surface || ''));
    if (zr.length > 1) zr.push(row('영역 총계', V.area(s.zones.reduce((t, z) => t + z.area, 0)), '겹친 곳은 두 번 셈', 'total'));
    return { title: '영역', rows: zr };
  }
  /** 행사 요약 (조감도 모드): 좌석·사람·주차·화장실·동선을 한눈에 */
  function eventBlock(s) {
    const sum = (sec) => total(s.records.filter((r) => r.sec === sec));
    const count = (kind) => s.items.filter((it) => it.kind === kind).length;
    const seats = sum('seat'), people = sum('people'), parking = sum('parking'), things = sum('event');
    const toilets = count('이동식 화장실');
    const bad = s.routes.reduce((n, r) => n + r.issues.length, 0);
    const rows = [];
    if (seats) rows.push(row('좌석', V.count(seats, '석'), '의자 배열·낱개 의자·테이블 의자'));
    // 수용 인원: 좌석 + 관람·대기 구역에 서는 인원 (1㎡에 1명 여유, 2명 최대)
    const crowd = s.zones.filter((z) => z.crowd).reduce((t, z) => t + z.area, 0);
    if (crowd > 0 || seats) {
      const easy = Math.floor(crowd / 1e6), full = Math.floor(crowd / 5e5);
      rows.push(row('수용 인원 (어림)', V.count(seats + easy, '명'), crowd > 0 ? `좌석 ${seats.toLocaleString('ko-KR')} + 서서 ${easy.toLocaleString('ko-KR')}명 · 권장 상한 ${(seats + full).toLocaleString('ko-KR')}명 (1㎡에 2명)` : '좌석만 · 영역을 ‘관람·대기 구역’으로 표시하면 서서 볼 인원도 더함'));
    }
    if (people) rows.push(row('배치한 사람', V.count(people, '명')));
    if (parking) rows.push(row('주차', V.count(parking, '칸')));
    if (toilets) rows.push(row('이동식 화장실', V.count(toilets, '칸'), seats ? `좌석 ${Math.round(seats / toilets).toLocaleString('ko-KR')}석에 1칸꼴` : ''));
    if (count('소화기')) rows.push(row('소화기', V.count(count('소화기'), '개')));
    if (s.routes.length) rows.push(row('동선', V.count(s.routes.length, '개'), bad ? `걸리는 곳 ${bad}곳 — 확인하세요` : '걸리는 곳 없음'));
    if (things) rows.push(row('놓은 물건', V.count(things, '개')));
    return rows.length ? { title: '행사 요약', rows } : null;
  }

  /** 전체: 도면 전체 합계 */
  function viewAll(s) {
    const blocks = [];
    const event = App.modes.is('event');
    if (event) {
      const eb = eventBlock(s);
      if (eb) blocks.push(eb);
      const sb = App.safety && App.safety.block(); // 안전 점검 (화장실·소화기·의료·밀집·대피)
      if (sb) blocks.push(sb);
      const bb = App.booths && App.booths.block(); // 부스 배정 (번호·업체)
      if (bb) blocks.push(bb);
      const rb = routeBlock(s);
      if (rb) blocks.push(rb);
    }
    const a = s.arch;
    const arch = [];
    if (a.walls) {
      arch.push(row('벽 길이 합계', V.length(a.wallLength), `벽 ${a.walls}개${a.wallOverlap > 0.5 ? ` · 맞닿은 부분 ${App.units.formatLength(a.wallOverlap)} 뺌` : ''}`));
      arch.push(row('벽 면적 합계 (한 면)', V.area(a.wallArea), '문·창문 뺌'));
    }
    if (s.rooms.length) {
      arch.push(row('바닥 면적 합계', V.area(a.floor), `방 ${s.rooms.length}개 · 벽 중심 기준${a.issues ? ` · 경계 확인 필요 ${a.issues}개` : ''}${a.overlaps ? ` (겹친 방 ${a.overlaps}개는 합계에서 뺌)` : ''}`));
      arch.push(row('바닥 면적 합계 (안목)', V.area(a.clearFloor), '벽 면 안쪽 · 바닥재 기준'));
      arch.push(row('천장 면적 합계', V.area(a.ceiling)));
      arch.push(row('걸레받이 합계', V.length(a.baseboard), '안목 둘레 − 문 폭'));
      arch.push(row('천장 몰딩 합계', V.length(a.molding), '안목 둘레'));
    }
    if (arch.length) blocks.push({ title: '건축', rows: arch });
    const mat = event ? [] : materialRows(s.materials); // 조감도 모드에서는 벽 자재·마감재를 빼고 봄
    if (mat.length) blocks.push({ title: '벽 자재', sub: '본·장 수는 전체 길이·면적을 더한 뒤 올림', rows: mat });
    if (s.finishes.length && !event) blocks.push({ title: '마감재', sub: '방 속성에서 고른 벽·바닥 마감. 장 수는 면적을 더한 뒤 올림', rows: s.finishes.map((f) => finishRow(f, '', ` · 방 ${f.rooms}곳`)) });
    if (s.matLines.length) blocks.push({ title: '마감 자재', sub: '방마다 고른 바닥 모양·벽 마감·천장 마감 기준. 면적을 더하고 로스를 붙여 올림', rows: s.matLines.map(matRow) });
    sections().forEach((sec) => {
      const recs = s.records.filter((r) => r.sec === sec.id);
      if (!recs.length) return;
      blocks.push({ title: sec.title, rows: [...sectionRows(sec, recs), row(`${sec.title} 총계`, secValue(sec, total(recs)), '', 'total')] });
    });
    const zb = zoneBlock(s);
    if (zb) blocks.push(zb);
    if (!event) {
      const rb = routeBlock(s);
      if (rb) blocks.push(rb);
    }
    // 현장 사진 핀: 번호·제목·사진 수
    const pins = App.photos ? App.photos.all().filter((p) => !s.excluded.length || App.layers.visible(p)) : [];
    if (pins.length) {
      const n = pins.reduce((t, p) => t + (p.photos || []).length, 0);
      blocks.push({
        title: '현장 사진', sub: '사진 도구로 꽂은 핀. 고른 핀을 한 번 더 누르면 사진을 크게 봅니다',
        rows: [...pins.map((p) => row(`${App.photos.numberOf(p.id)}. ${App.photos.title(p)}`, V.count((p.photos || []).length, '장'), p.memo ? String(p.memo).slice(0, 40) : '', 'item', '사진')),
          row('현장 사진 총계', V.count(n, '장'), `핀 ${pins.length}곳`, 'total')],
      });
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
        row('바닥 면적', V.area(q.floor), '벽 중심 기준', '', '면적'),
        row('바닥 면적 (안목)', V.area(q.clearArea), '벽 면 안쪽', '', '면적'),
        row('천장 면적', V.area(q.ceiling), q.ceiling !== q.floor ? '직접 입력' : '', '', '면적'),
        row('벽 면적 (방 쪽)', V.area(q.wallArea), `벽 중심 × 벽 높이${q.openingArea ? ` · 문·창문 ${App.units.formatArea(q.openingArea)} 뺌` : ''}`, '', '면적'),
        row('도배·도장 면적 (안목)', V.area(q.paintArea), '안목 둘레 × 천장 높이 · 문·창문 뺌', '', '면적'),
        ...q.boards.map((b) => row(`${b.spec} (방 쪽)`, V.area(b.area), '겹 수 반영', '', '면적')),
        row('둘레', V.length(q.perimeter), '벽 중심 기준', '', '면적'),
        row('걸레받이', V.length(q.baseboard), q.doorWidth ? `안목 둘레 ${App.units.formatLength(q.clearPerimeter)} − 문 ${App.units.formatLength(q.doorWidth)}` : '안목 둘레', '', '면적'),
        row('천장 몰딩', V.length(q.clearPerimeter), '안목 둘레', '', '면적'),
        ...q.finishes.map((f) => finishRow(f, '마감재')),
        ...App.materials.lines([{ ...r.el, q }]).map((l) => ({ ...matRow(l), cat: '마감 자재' })),
        ...roomItems(r.id),
      ];
      blocks.push({ title: r.name, sub: r.issue ? '경계 확인 필요' : '', warn: !!r.issue, rows });
    });
    const outside = roomItems(null);
    if (outside.length) blocks.push({ title: OUTSIDE, sub: '방으로 등록되지 않은 곳', rows: outside });
    // 총계: 모든 방의 면적 합과 항목 묶음별 합
    const tot = [];
    if (s.rooms.length) {
      tot.push(row('바닥 면적', V.area(s.arch.floor), `방 ${s.rooms.length}개 · 벽 중심 기준`, '', '면적'));
      tot.push(row('바닥 면적 (안목)', V.area(s.arch.clearFloor), '벽 면 안쪽', '', '면적'));
      tot.push(row('천장 면적', V.area(s.arch.ceiling), '', '', '면적'));
      tot.push(row('걸레받이', V.length(s.arch.baseboard), '안목 둘레 − 문 폭', '', '면적'));
      tot.push(row('천장 몰딩', V.length(s.arch.molding), '안목 둘레', '', '면적'));
      s.finishes.forEach((f) => tot.push(finishRow(f, '마감재', ` · 방 ${f.rooms}곳`)));
      s.matLines.forEach((l) => tot.push({ ...matRow(l), cat: '마감 자재' }));
      tot.push(row('벽 면적 (방 쪽)', V.area(s.arch.roomWall), '벽 중심 × 벽 높이 · 칸막이 벽은 양쪽 방에 한 면씩', '', '면적'));
      tot.push(row('도배·도장 면적 (안목)', V.area(s.arch.paintWall), '안목 둘레 × 천장 높이 · 문·창문 뺌', '', '면적'));
    }
    secs.forEach((sec) => {
      const recs = s.records.filter((r) => r.sec === sec.id);
      if (recs.length) tot.push(row(sec.title, secValue(sec, total(recs)), '', '', sec.title));
    });
    if (tot.length) blocks.push({ title: '총계', rows: tot, total: true });
    const rb = routeBlock(s);
    if (rb) blocks.push(rb);
    return blocks;
  }

  /** 구역별 (조감도 모드): 영역마다 넓이와 그 안에 있는 것 (겹친 영역은 가장 작은 영역에), 방(실내 행사장), 구역 밖, 총계 */
  function viewZone(s) {
    const blocks = [];
    const secs = sections();
    const itemsOf = (pick) => {
      const rows = [];
      secs.forEach((sec) => {
        const recs = s.records.filter((r) => r.sec === sec.id && pick(r));
        if (!recs.length) return;
        rows.push(row(sec.title, null, '', 'head', sec.title));
        const byKey = sumBy(recs, (r) => r.key);
        byKey.forEach((qty, key) => rows.push(row(key, secValue(sec, qty), '', '', sec.title)));
        if (byKey.size > 1) rows.push(row(`${sec.title} 소계`, secValue(sec, total(recs)), '', 'subtotal', sec.title));
      });
      return rows;
    };
    s.zones.forEach((z) => {
      const note = [z.surface, z.crowd ? `관람·대기 구역 · 권장 상한 ${Math.floor(z.area / 5e5).toLocaleString('ko-KR')}명` : ''].filter(Boolean).join(' · ');
      blocks.push({ title: z.name, sub: z.holds ? '안쪽 영역에 든 것은 그 영역에서 셈' : '', rows: [row('넓이', V.area(z.area), note, '', '면적'), ...itemsOf((r) => r.zone === z.id)] });
    });
    // 방 (실내 행사장): 영역에 들지 않은 것
    s.rooms.forEach((r) => {
      blocks.push({ title: r.name, sub: r.issue ? '방 · 경계 확인 필요' : '방', warn: !!r.issue, rows: [row('바닥 면적', V.area(r.q.floor), '벽 중심 기준', '', '면적'), ...itemsOf((x) => x.zone == null && x.room === r.id)] });
    });
    const outside = itemsOf((x) => x.zone == null && x.room == null);
    if (outside.length) blocks.push({ title: NO_ZONE, sub: s.zones.length || s.rooms.length ? '영역·방 밖에 있는 것' : '‘영역’ 도구로 구역을 그리면 구역마다 나눠 셉니다', rows: outside });
    const tot = [];
    if (s.zones.length > 1) tot.push(row('영역', V.count(s.zones.length, '곳'), '', '', '면적'));
    secs.forEach((sec) => {
      const recs = s.records.filter((r) => r.sec === sec.id);
      if (recs.length) tot.push(row(sec.title, secValue(sec, total(recs)), '', '', sec.title));
    });
    if (tot.length) blocks.push({ title: '총계', rows: tot, total: true });
    const rb = routeBlock(s);
    if (rb) blocks.push(rb);
    return blocks;
  }

  /** 설치 체크리스트의 묶음: ‘구역별’(인테리어는 ‘방별’)과 같은 나눔으로, 놓거나 다는 것만 (좌석·사람·주차 칸 수 같은 딸린 수는 뺌).
      묶음 안에서는 분류(구조물·장비·편의·안전 …, 문·전기·설비 …) 순서로.
      돌려주는 값: [{ title, sub, rows: [{ label, text, cat }] }] */
  function checklist() {
    const s = compute();
    const event = App.modes.is('event');
    const secs = sections().filter((x) => !['seat', 'people', 'parking'].includes(x.id));
    const CATS = App.catalog.EVENT_CATS;
    // 행사 물건은 팔레트의 분류로 (종류 → 분류)
    const catOf = (sec, r) => (sec.id === 'event' ? (App.catalog.itemDef(r.group) || {}).cat || '기타' : sec.title);
    const rowsOf = (pick) => secs.flatMap((sec) => {
      const recs = s.records.filter((r) => r.sec === sec.id && r.group !== '사람' && pick(r));
      const cats = new Map(recs.map((r) => [r.key, catOf(sec, r)]));
      const rows = [...sumBy(recs, (r) => r.key)].map(([key, qty]) => ({ label: key, text: secValue(sec, qty).text, cat: cats.get(key) }));
      const order = (c) => (CATS.indexOf(c) < 0 ? CATS.length : CATS.indexOf(c));
      return sec.id === 'event' ? rows.map((r, i) => ({ r, i })).sort((a, b) => order(a.r.cat) - order(b.r.cat) || a.i - b.i).map((x) => x.r) : rows;
    });
    const groups = [];
    if (event) s.zones.forEach((z) => groups.push({ title: z.name, sub: [App.units.formatArea(z.area), z.surface].filter(Boolean).join(' · '), rows: rowsOf((r) => r.zone === z.id) }));
    s.rooms.forEach((r) => groups.push({ title: r.name, sub: `방 · ${App.units.formatArea(r.q.floor)}`, rows: rowsOf((x) => x.zone == null && x.room === r.id) }));
    groups.push({ title: event ? NO_ZONE : OUTSIDE, sub: '', rows: rowsOf((x) => x.zone == null && x.room == null) });
    return groups.filter((g) => g.rows.length);
  }

  /** 종류별: 항목마다 합계와 어느 방에 얼마나 있는지 */
  function viewKind(s) {
    const blocks = [];
    const roomName = new Map(s.rooms.map((r) => [r.id, r.name]));
    const nameOf = (id) => (id ? roomName.get(id) || '이름 없음' : OUTSIDE);
    if (s.rooms.length) {
      const areaRows = [];
      // 합계는 전체·방별과 같게 겹친 방을 뺌 (겹친 방 줄에는 표시)
      const counted = s.rooms.filter((r) => r.issue !== 'overlap');
      [['바닥 면적', (q) => q.floor], ['천장 면적', (q) => q.ceiling], ['벽 면적 (방 쪽)', (q) => q.wallArea], ['도배·도장 면적 (안목)', (q) => q.paintArea]].forEach(([label, get]) => {
        areaRows.push(row(label, V.area(counted.reduce((t, r) => t + get(r.q), 0)), '', 'item', label));
        s.rooms.forEach((r) => areaRows.push(row(r.name, V.area(get(r.q)), r.issue === 'overlap' ? '겹침 · 합계에서 뺌' : '', 'sub', label)));
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
    const rb = routeBlock(s);
    if (rb) blocks.push(rb);
    return blocks;
  }

  const BUILD = { all: viewAll, room: (s) => (App.modes.is('event') ? viewZone(s) : viewRoom(s)), kind: viewKind };
  let view = 'room';

  function blockHtml(b) {
    return `
      <section class="sum-sec${b.total ? ' is-grand' : ''}">
        <h3 class="sum-title">${esc(b.title)}${b.sub ? ` <small class="${b.warn ? 'is-warn' : ''}">${esc(b.sub)}</small>` : ''}${[b.action, b.action2].filter(Boolean).map((x) => ` <button type="button" class="btn btn-mini" data-act="${esc(x.act)}">${esc(x.label)}</button>`).join('')}</h3>
        <table class="sum-table"><tbody>
          ${b.rows.map((r) => (r.cls === 'head'
            ? `<tr class="is-head"><th colspan="2" scope="rowgroup">${esc(r.label)}</th></tr>`
            : `<tr${r.cls ? ` class="is-${r.cls}"` : ''}><th scope="row">${esc(r.label)}</th><td>${esc(r.value.text)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</td></tr>`)).join('')}
        </tbody></table>
      </section>`;
  }

  /** PC에서 견적을 볼 때는 오른쪽 칸을 넓게 (단가 칸이 들어가게) */
  function widen(on) {
    if (document.body.classList.contains('est-wide') === on) return;
    document.body.classList.toggle('est-wide', on);
    if (App.plan) App.plan.resize();
  }

  function render() {
    const pane = document.getElementById('pane-summary');
    const s = compute();
    const cost = view === 'cost';
    const blocks = cost ? [] : BUILD[view](s);
    const scroll = pane.scrollTop;
    const bar = `
      <div class="sum-bar${cost || view === 'room' ? ' is-two' : ''}">
        <div class="sum-views" role="tablist" aria-label="집계 보기">
          ${views().map(([id, label]) => `<button type="button" class="seg-btn" role="tab" data-view="${id}" aria-selected="${id === view}">${label}</button>`).join('')}
        </div>
        ${cost ? '<button type="button" class="btn btn-primary" data-act="est-pdf" title="견적서를 PDF로 (A4)">견적서</button>' : ''}
        ${view === 'room' ? `<button type="button" class="btn" data-act="checklist" ${blocks.length ? '' : 'disabled'} title="${App.modes.is('event') ? '구역' : '방'}마다 품목·수량과 반입·설치·점검·철거 확인 칸을 PDF로 (A4)">체크리스트</button>` : ''}
        <button type="button" class="btn" data-act="csv" ${blocks.length || cost ? '' : 'disabled'} title="엑셀에서 열 수 있는 CSV 파일로 저장">CSV</button>
      </div>`;
    widen(cost && !pane.hidden);
    if (cost) {
      pane.innerHTML = bar + App.estimate.html(s);
      pane.scrollTop = scroll;
      return;
    }
    pane.innerHTML = `${bar}
      ${s.excluded.length ? `<p class="dialog-note is-warn">숨긴 레이어(${esc(s.excluded.join(', '))})는 집계에서 뺐습니다. 위쪽 ‘레이어’에서 바꿀 수 있습니다.</p>` : ''}
      ${blocks.map(blockHtml).join('') || `
        <div class="empty">
          <div class="empty-title">집계할 항목 없음</div>
          <p>${view === 'room' && !s.rooms.length && s.records.length && !App.modes.is('event')
            ? '방이 아직 없습니다. ‘방’ 도구로 벽에 둘러싸인 곳을 누르면 방별로 나눠 집계합니다.'
            : App.modes.is('event')
              ? '물건·영역·동선을 놓으면 좌석 수, 물건 수량, 동선 길이와 걸리는 곳이 여기에 자동으로 정리됩니다.'
              : '벽과 방, 문·창문, 전기·설비 기호를 그리면 면적·수량·길이·자재가 여기에 자동으로 정리됩니다.'}</p>
        </div>`}`;
    pane.scrollTop = scroll;
  }

  /** 지금 보기를 CSV 줄로: 구분(블록) · 분류 · 항목 · 수량 · 단위 · 비고 */
  function csvRows() {
    const label = views().find(([id]) => id === view)[1];
    const rows = [['구분', '분류', '항목', '수량', '단위', '비고']];
    BUILD[view](compute()).filter((b) => !b.screenOnly).forEach((b) => {
      b.rows.forEach((r) => {
        if (r.cls === 'head') return;
        const item = view === 'kind' && r.cls === 'item' ? '합계' : r.label;
        // 숫자가 아닌 값(부스 업체 이름 등)은 비고에 글로
        const num = r.value.num != null ? r.value.num : '';
        const note = r.value.num == null && r.value.text ? [r.value.text, r.note].filter(Boolean).join(' · ') : r.note || '';
        rows.push([b.title, r.cat || '', item, num, r.value.num != null ? r.value.unit : '', note]);
      });
    });
    return { rows, label };
  }

  function exportCsv() {
    if (view === 'cost') return App.estimate.exportCsv();
    const { rows, label } = csvRows();
    if (rows.length <= 1) {
      App.ui.toast('내보낼 집계가 없습니다. 먼저 도면을 그리세요.');
      return false;
    }
    const name = `집계표_${label}_${App.exporter.stamp()}.csv`;
    App.exporter.saved(App.exporter.download(name, App.exporter.csvText(rows), 'text/csv;charset=utf-8'), `‘${name}’을 저장했습니다. 엑셀에서 바로 열 수 있습니다.`);
    return true;
  }

  let dirty = true;
  function init() {
    const pane = document.getElementById('pane-summary');
    App.doc.onChange(() => {
      // 안 보일 때는 탭을 열 때, 끄는 중(기록 전)에는 손을 뗀 뒤에 한 번 계산 — 매 장면마다 집계표 전체를 다시 그리면 끌기가 끊김
      if (pane.hidden || App.doc.tx) dirty = true;
      else render();
    });
    const again = () => {
      if (pane.hidden) dirty = true;
      else render();
    };
    App.ui.on('settings', again);
    App.ui.on('layers', again);
    // 모드가 바뀌면 그 모드에서 주로 보는 보기로: 조감도는 전체, 인테리어는 방별
    App.ui.on('mode', (id) => {
      view = id === 'event' ? 'all' : 'room';
      again();
    });
    App.ui.on('tab', (id) => {
      widen(id === 'tab-summary' && view === 'cost');
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
      if (e.target.closest('[data-act="checklist"]')) App.exporter.checklistPdf();
      if (e.target.closest('[data-act="est-pdf"]')) App.estimate.exportPdf();
      if (e.target.closest('[data-act="proposal"]')) App.proposal.open();
      if (e.target.closest('[data-act="safety-open"]')) App.safety.open();
      if (e.target.closest('[data-act="booth-csv"]')) App.booths.exportCsv();
      if (e.target.closest('#pane-summary [data-act="booth-number"]')) App.booths.numberDialog();
    });
    App.estimate.bind(pane);
    render();
  }

  App.summary = {
    init, compute, render, exportCsv, csvRows, sections, checklist,
    /** 보기(room·all·kind)의 표 블록 (PDF에 그릴 때) */
    blocks: (v) => BUILD[v](compute()).filter((b) => !b.screenOnly), // 내보내기용 (화면에서만 보이는 묶음은 뺌)
    get view() { return view; },
    setView(v) { view = v; render(); },
  };
})();
