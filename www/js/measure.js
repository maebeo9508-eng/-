/* 단위 변환과 숫자 표시. 내부 값은 항상 mm, 화면 표시만 설정 단위로 바꾼다.
   단위 설정 화면은 7단계. 지금은 기본값(mm, 소수점 0자리)으로 동작 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const LENGTH = {
    mm: { factor: 1, label: 'mm', inputDigits: 1 },
    cm: { factor: 10, label: 'cm', inputDigits: 2 },
    m: { factor: 1000, label: 'm', inputDigits: 4 },
    ft: { factor: 304.8, label: 'ft', inputDigits: 4 },
  };

  // 면적은 항상 mm² 값에서 바로 바꾼다 (반올림 오차 방지). 1평 = 3.305785㎡
  const AREA = {
    '㎡': { factor: 1e6, label: '㎡' },
    '평': { factor: 3.305785e6, label: '평' },
    'ft²': { factor: 304.8 * 304.8, label: 'ft²' },
  };

  const unit = () => LENGTH[App.settings.lengthUnit] || LENGTH.mm;
  const areaUnit = () => AREA[App.settings.areaUnit] || AREA['㎡'];
  const fixed = (v) => {
    const d = App.settings.decimals;
    return (v || 0).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const round = (v) => Number((v || 0).toFixed(App.settings.decimals));

  const units = {
    lengthLabel() {
      return unit().label;
    },
    /** 길이 단위 하나가 몇 mm인지 (눈금자 등) */
    lengthFactor() {
      return unit().factor;
    },
    areaLabel() {
      return areaUnit().label;
    },
    /** 표 내보내기용 숫자: 설정 단위, 설정 소수점 자리 (쉼표 없음) */
    lengthValue(mm) {
      return round(mm / unit().factor);
    },
    areaValue(mm2) {
      return round(mm2 / areaUnit().factor);
    },
    /** 면적 입력 칸용 글자와 입력 → mm² */
    inputArea(mm2) {
      return String(Number((mm2 / areaUnit().factor).toFixed(4)));
    },
    parseArea(text) {
      const s = String(text).replace(/[,\s]/g, '');
      if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
      return Number(s) * areaUnit().factor;
    },

    /** 화면 표시용: 천 단위 쉼표, 설정한 소수점 자리 */
    formatLength(mm, withUnit = true) {
      const s = fixed(mm / unit().factor);
      return withUnit ? `${s} ${unit().label}` : s;
    },

    /** 배관·전선관 길이 표시: 설정에 따라 m(소수 1자리) 또는 길이 단위 */
    formatRun(mm) {
      if (App.settings.runUnit !== 'unit') {
        return `${(mm / 1000).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}m`;
      }
      return units.formatLength(mm);
    },
    /** 표 내보내기용 배관 길이: [숫자, 단위] */
    runValue(mm) {
      return App.settings.runUnit !== 'unit' ? [Number((mm / 1000).toFixed(1)), 'm'] : [units.lengthValue(mm), unit().label];
    },

    /** 면적(mm²) 표시 */
    formatArea(mm2, withUnit = true) {
      const s = fixed(mm2 / areaUnit().factor);
      return withUnit ? `${s} ${areaUnit().label}` : s;
    },

    /** 입력 칸용: 쉼표 없이, 편집해도 값이 뭉개지지 않을 만큼의 자리수 */
    inputLength(mm) {
      const v = mm / unit().factor;
      return String(Number(v.toFixed(unit().inputDigits)));
    },

    /** 입력 칸 글자 → mm. 숫자가 아니면 NaN */
    parseLength(text) {
      const s = String(text).replace(/[,\s]/g, '');
      if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
      return Number(s) * unit().factor;
    },
  };

  App.units = units;

  /* ── 물량 계산 ──
     벽 하나: 길이 L, 높이 H, 한 면 면적 = L × H − 문·창문 면적
       L은 실제 길이: T자로 다른 벽에 붙은 끝은 그 벽 면까지 (겹치는 두께의 반을 뺌, joins.js).
       ㄱ자 모서리는 중심선 길이 그대로 (바깥 면은 길고 안쪽 면은 짧아 합이 같음)
     틀(벽 종류에 틀이 있을 때): 세로재 = (틀 길이 ÷ 세로 간격 올림 + 1)개 × H
                                 가로재 = (위·아래 2줄 + 중간 줄) × 틀 길이, 중간 줄 = H ÷ 가로 간격 올림 − 1
       틀 길이는 틀 층에서 잰 길이 (다른 벽 안으로 들어가는 부분은 뺌), 그림의 세로재 자리와 같음.
       같은 종류 벽이 일직선으로 이어지면 이음 자리 세로재는 한 개만 셈
       다루끼는 세로·가로 모두 '다루끼', 경량은 세로 '스터드', 가로 '런너'
     문·창문 보강(frameLayout): 양옆에 통 세로재 하나씩 (옆에 있던 세로재는 이것으로 대신),
       개구부에 걸리던 세로재는 위(천장까지)·아래(창대까지) 토막으로, 위에는 인방, 창문 아래에는 창대 가로재.
       개구부를 지나던 가로재는 빼고, 문 자리는 바닥 줄(런너)도 뺌
     석고보드: 면마다 (그 면의 길이 × H − 문·창문 면적) × 그 면의 겹 수
     본 수·장 수는 여러 벽의 길이·면적을 다 더한 뒤 (1 + 로스%)를 곱해 마지막에 올림 */
  const EPS = 1e-9;
  let openingIndex = { version: -1, map: new Map() };

  /** 벽 id → 그 벽의 문·창문 목록 (도면이 바뀔 때만 다시 만듦) */
  function openingsOf(wallId) {
    if (openingIndex.version !== App.doc.version) {
      const map = new Map();
      for (const el of App.doc.all()) {
        if (el.type !== 'door' && el.type !== 'window') continue;
        if (!map.has(el.wallId)) map.set(el.wallId, []);
        map.get(el.wallId).push(el);
      }
      openingIndex = { version: App.doc.version, map };
    }
    return openingIndex.map.get(wallId) || [];
  }

  let itemIndex = { version: -1, map: new Map() };
  const pointKey = (p) => `${Math.round(p.x)},${Math.round(p.y)}`;

  /** 그 점에 가운데가 있는 기구 (선 끝이 기구에 붙었는지 볼 때) */
  function itemAt(p) {
    if (itemIndex.version !== App.doc.version) {
      const map = new Map();
      for (const el of App.doc.all()) if (el.type === 'item') map.set(pointKey(el), el);
      itemIndex = { version: App.doc.version, map };
    }
    return itemIndex.map.get(pointKey(p)) || null;
  }

  /** 그 점이 들어 있는 방 (방 안에 방이 있으면 작은 쪽). 방 밖이면 null */
  function roomAt(p) {
    let best = null, bestArea = Infinity;
    for (const r of App.doc.all()) {
      if (r.type !== 'room' || !App.geom.pointInPolygon(p, r.points)) continue;
      const a = Math.abs(App.geom.signedArea(r.points));
      if (a < bestArea) { best = r; bestArea = a; }
    }
    return best;
  }

  /** 그 점이 들어 있는 방의 천장 높이. 방 밖이면 기본 벽 높이 */
  function ceilingAt(p) {
    const r = roomAt(p);
    return r ? r.ceilingHeight : App.settings.wallHeight;
  }

  /* ── 방별 집계 ──
     방 경계는 벽 중심선이라 바닥 면적과 같은 기준으로 벽 면적도 중심선 길이 × 벽 높이로 셈.
     방 경계의 변마다 그 변이 놓인 벽을 찾아, 그 벽의 문·창문 중 이 변 위에 있는 것을 빼고,
     석고는 그 벽에서 방 쪽 면의 겹 수만 셈 (칸막이 벽은 양쪽 방에 한 면씩) */
  const G = () => App.geom;
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const dot = (a, b) => a.x * b.x + a.y * b.y;

  /** 방 경계를 벽별 조각으로 나눈 목록 { a, b, len, wall }.
      경계의 한 변이 여러 벽에 걸칠 수 있어(일직선으로 이어진 벽) 변마다 그 위에 놓인 벽 구간을 찾음.
      벽이 없는 구간은 wall이 null */
  function roomEdges(r) {
    const walls = r.wallIds.map((id) => App.doc.get(id)).filter((w) => w && w.type === 'wall');
    const pts = r.points;
    const pieces = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const len = G().dist(a, b);
      if (len < 0.5) continue;
      const dir = G().unit(sub(b, a));
      const n = G().perp(dir);
      const at = (s) => ({ x: a.x + dir.x * s, y: a.y + dir.y * s });
      let covered = 0;
      walls.forEach((w) => {
        // 이 변과 같은 직선 위의 벽만
        if (Math.abs(dot(sub(w.start, a), n)) > 1 || Math.abs(dot(sub(w.end, a), n)) > 1) return;
        const s0 = Math.max(0, Math.min(dot(sub(w.start, a), dir), dot(sub(w.end, a), dir)));
        const s1 = Math.min(len, Math.max(dot(sub(w.start, a), dir), dot(sub(w.end, a), dir)));
        if (s1 - s0 < 0.5) return;
        pieces.push({ a: at(s0), b: at(s1), len: s1 - s0, wall: w });
        covered += s1 - s0;
      });
      if (len - covered > 0.5) pieces.push({ a, b, len: len - covered, wall: null });
    }
    return pieces;
  }

  /** 방이 벽의 어느 쪽에 있는지: 벽 방향의 왼쪽(+1) / 오른쪽(-1) */
  function roomSide(r, wall, a, b) {
    const d = G().unit(sub(wall.end, wall.start));
    const n = G().perp(d);
    const mid = { x: (a.x + b.x) / 2 + n.x * 2, y: (a.y + b.y) / 2 + n.y * 2 };
    return G().pointInPolygon(mid, r.points) ? 1 : -1;
  }

  /** 문·창문이 속한 방: 문은 열리는 쪽 방, 창문은 방이 있는 쪽 (양쪽 다 방이면 벽 왼쪽) */
  function openingRoom(o) {
    const g = App.model.openingGeom(o);
    if (!g) return null;
    const probe = (side) => roomAt({ x: g.center.x + g.n.x * side * (g.th / 2 + 50), y: g.center.y + g.n.y * side * (g.th / 2 + 50) });
    const first = o.type === 'door' ? (o.side || 1) : 1;
    return probe(first) || probe(-first);
  }

  /** 선의 평면 길이를 방별로 나눔: 방 경계에서 잘라 조각마다 가운데가 든 방으로. Map(방 id 또는 null → mm) */
  function lineRooms(l, rooms) {
    const a = l.start, b = l.end;
    const d = sub(b, a);
    const L = Math.hypot(d.x, d.y);
    const out = new Map();
    if (L < 0.001) return out;
    const ts = [0, 1];
    const box = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
    rooms.forEach((r) => {
      if (!G().rectsOverlap(box, r.box)) return;
      const pts = r.points;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        const e = sub(q, p);
        const den = d.x * e.y - d.y * e.x;
        if (Math.abs(den) < 1e-9) continue; // 평행: 겹쳐 지나가는 경우는 조각 가운데로 판단
        const w = sub(p, a);
        const t = (w.x * e.y - w.y * e.x) / den;
        const u = (w.x * d.y - w.y * d.x) / den;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
      }
    });
    ts.sort((x, y) => x - y);
    for (let i = 0; i + 1 < ts.length; i++) {
      const t0 = ts[i], t1 = ts[i + 1];
      if (t1 - t0 < 1e-9) continue;
      const tm = (t0 + t1) / 2;
      const r = roomAt({ x: a.x + d.x * tm, y: a.y + d.y * tm });
      const key = r ? r.id : null;
      out.set(key, (out.get(key) || 0) + L * (t1 - t0));
    }
    return out;
  }

  const measure = {
    openingsOf,
    itemAt,
    roomAt,
    ceilingAt,
    roomEdges,
    openingRoom,
    lineRooms,

    /** 방 하나의 면적들 (mm²): 바닥, 천장(따로 정하지 않으면 바닥과 같음), 방 쪽 벽 면적, 방 쪽 석고 */
    room(r) {
      const floor = Math.abs(App.geom.signedArea(r.points));
      let wallGross = 0, openingArea = 0;
      const boards = new Map();
      roomEdges(r).forEach((e) => {
        const H = e.wall ? e.wall.height : r.wallHeight;
        const gross = e.len * H;
        let cut = 0;
        if (e.wall) {
          const dir = App.geom.unit(sub(e.b, e.a));
          openingsOf(e.wall.id).forEach((o) => {
            const g = App.model.openingGeom(o);
            if (!g) return;
            const s = dot(sub(g.center, e.a), dir);
            if (s >= -0.5 && s <= e.len + 0.5) cut += App.model.TYPES[o.type].area(o);
          });
        }
        cut = Math.min(cut, gross);
        wallGross += gross;
        openingArea += cut;
        const t = e.wall && App.catalog.typeOf(e.wall);
        if (!t) return;
        const face = e.wall.flip ? -1 : 1; // 마감 쪽: 벽 방향의 왼쪽, 뒤집으면 오른쪽
        const layers = roomSide(r, e.wall, e.a, e.b) === face ? t.boardFace : t.boardBack;
        if (!layers) return;
        const spec = `석고보드 ${Number(t.boardT)}T`;
        boards.set(spec, (boards.get(spec) || 0) + (gross - cut) * layers);
      });
      return {
        floor,
        ceiling: r.ceilingArea != null ? r.ceilingArea : floor,
        perimeter: App.geom.perimeter(r.points),
        wallGross,
        openingArea,
        wallArea: wallGross - openingArea,
        boards: [...boards.entries()].map(([spec, area]) => ({ spec, area })),
      };
    },

    /** 기구 설치 높이(mm). null(천장)이면 그 자리 방의 천장 높이 */
    itemHeight(it) {
      return it.height == null ? ceilingAt({ x: it.x, y: it.y }) : it.height;
    },

    /** 선 하나의 길이: 평면 + 자동 수직(선 끝이 붙은 기구까지 오르내림) + 추가 수직
        자동 수직 = |배관 높이 − 기구 설치 높이|, 배관 높이가 비었으면 그 자리 천장 */
    line(l) {
      const plan = Math.hypot(l.end.x - l.start.x, l.end.y - l.start.y);
      const ends = [];
      let auto = 0;
      [l.start, l.end].forEach((p) => {
        const it = itemAt(p);
        if (!it) return;
        const run = l.runHeight == null ? ceilingAt(p) : l.runHeight;
        const h = measure.itemHeight(it);
        const drop = Math.abs(run - h);
        auto += drop;
        ends.push({ item: it, run, height: h, drop });
      });
      const extra = l.rise || 0;
      return { plan, auto, extra, rise: auto + extra, total: plan + auto + extra, ends };
    },

    /** 틀 배치 (그림의 세로재 자리와 물량이 같은 계산을 씀)
        studs: 통 세로재 가운데 위치들(시작점에서 잰 mm), jambs: 그중 문·창문 옆,
        studLength: 세로재 길이 합(토막 포함), rowLength: 가로재 길이 합(인방·창대 포함), sw: 세로재 폭 */
    frameLayout(w, t) {
      const H = w.height;
      const sw = t.frameKind === 'wood' ? Math.min(t.frameDepth, 45) : 50;
      const base = App.joins.frame(w, t, sw);
      const lo = base.from + sw / 2, hi = Math.max(lo, base.to - sw / 2);
      const rows = 2 + (t.frameRowSpacing > 0 ? Math.max(0, Math.ceil(H / t.frameRowSpacing - EPS) - 1) : 0);
      const rowHeights = [0, H];
      for (let k = 1; k <= rows - 2; k++) rowHeights.push(k * t.frameRowSpacing);
      const ops = openingsOf(w.id).map((o) => {
        const g = App.model.openingGeom(o);
        if (!g) return null;
        const bottom = o.type === 'window' ? Math.max(0, o.sill || 0) : 0;
        return { s0: Math.max(base.from, g.c - g.half), s1: Math.min(base.to, g.c + g.half), bottom, top: Math.min(H, bottom + o.height) };
      }).filter((o) => o && o.s1 - o.s0 > 1 && o.top > o.bottom);
      // 문·창문 양옆 통 세로재 (붙어 있는 개구부 사이는 하나로)
      const jambs = [];
      ops.forEach((o) => [o.s0 - sw / 2, o.s1 + sw / 2].forEach((p) => {
        const c = G().clamp(p, lo, hi);
        if (ops.some((q) => c > q.s0 + 0.5 && c < q.s1 - 0.5)) return; // 다른 개구부 안
        if (!jambs.some((j) => Math.abs(j - c) < sw)) jambs.push(c);
      }));
      let studs = [...jambs], crippleLength = 0, cripples = 0;
      base.studs.forEach((p) => {
        if (jambs.some((j) => Math.abs(j - p) < sw)) return; // 옆 세로재가 대신함
        const o = ops.find((q) => p + sw / 2 > q.s0 && p - sw / 2 < q.s1);
        if (!o) { studs.push(p); return; }
        // 개구부에 걸린 세로재: 위·아래 토막
        [H - o.top, o.bottom].forEach((len) => { if (len > 1) { crippleLength += len; cripples++; } });
      });
      studs.sort((a, b) => a - b);
      let rowLength = rows * base.run;
      ops.forEach((o) => {
        const width = o.s1 - o.s0;
        const cut = rowHeights.filter((h) => (h > o.bottom && h < o.top) || (h === 0 && o.bottom <= 0)).length;
        rowLength += width * ((o.top < H - 1 ? 1 : 0) + (o.bottom > 1 ? 1 : 0) - cut);
      });
      return {
        studs, jambs, sw, rows, run: base.run, openings: ops.length, cripples,
        studLength: studs.length * H + crippleLength, rowLength: Math.max(0, rowLength),
      };
    },

    /** 벽 하나의 기본 수치와 자재 (길이 mm, 면적 mm²) */
    wall(w) {
      const center = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
      const L = App.joins.length(w);
      const H = w.height;
      const openings = openingsOf(w.id);
      const openingSum = openings.reduce((sum, o) => sum + App.model.TYPES[o.type].area(o), 0);
      const openingArea = Math.min(L * H, openingSum);
      const area = L * H - openingArea;
      const q = {
        length: L, centerLength: center, overlap: Math.max(0, center - L),
        height: H, grossArea: L * H, openingArea, openings: openings.length, area, frames: [], boards: [],
      };
      const t = App.catalog.typeOf(w);
      if (!t || L <= 0 || H <= 0) return q;
      if (t.frameKind !== 'none') {
        const f = measure.frameLayout(w, t);
        q.frameDetail = { verticalCount: f.studs.length, jambs: f.jambs.length, cripples: f.cripples, rows: f.rows, run: f.run };
        const item = (name, length) => ({ name, length, piece: t.framePiece, loss: t.frameLoss });
        if (t.frameKind === 'wood') q.frames.push(item('다루끼', f.studLength + f.rowLength));
        else q.frames.push(item('스터드', f.studLength), item('런너', f.rowLength));
      }
      const layers = t.boardFace + t.boardBack;
      if (layers > 0) {
        // 마감 쪽 면은 벽 방향 왼쪽(뒤집으면 오른쪽). 면마다 길이가 다를 수 있음 (ㄱ자 바깥·안쪽)
        const sgn = w.flip ? -1 : 1;
        const faceArea = (off) => {
          const gross = App.joins.lengthAt(w, off) * H;
          return gross - Math.min(gross, openingSum);
        };
        const boardArea = t.boardFace * faceArea((sgn * w.thickness) / 2) + t.boardBack * faceArea((-sgn * w.thickness) / 2);
        q.boards.push({
          spec: `석고보드 ${Number(t.boardT)}T ${Number(t.boardW)}×${Number(t.boardL)}`,
          area: boardArea, sheetArea: t.boardW * t.boardL, loss: t.boardLoss, layers,
        });
      }
      return q;
    },

    /** 여러 벽의 자재를 같은 규격끼리 더하고 본·장 수를 계산 */
    materials(walls) {
      const frames = new Map(), boards = new Map();
      walls.forEach((w) => {
        const q = measure.wall(w);
        q.frames.forEach((f) => {
          const key = `${f.name}|${f.piece}|${f.loss}`;
          const cur = frames.get(key) || { name: f.name, piece: f.piece, loss: f.loss, length: 0 };
          cur.length += f.length;
          frames.set(key, cur);
        });
        q.boards.forEach((b) => {
          const key = `${b.spec}|${b.loss}`;
          const cur = boards.get(key) || { spec: b.spec, sheetArea: b.sheetArea, loss: b.loss, area: 0 };
          cur.area += b.area;
          boards.set(key, cur);
        });
      });
      const out = { frames: [...frames.values()], boards: [...boards.values()] };
      out.frames.forEach((f) => { f.pieces = f.length > 0 ? Math.ceil((f.length * (1 + f.loss / 100)) / f.piece - EPS) : 0; });
      out.boards.forEach((b) => { b.sheets = b.area > 0 ? Math.ceil((b.area * (1 + b.loss / 100)) / b.sheetArea - EPS) : 0; });
      return out;
    },

    /** 자재 길이 표시: 미터, 소수 1자리 */
    meters(mm) {
      return `${(mm / 1000).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}m`;
    },
  };

  App.measure = measure;
})();
