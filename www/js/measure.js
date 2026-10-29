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

  const units = {
    lengthLabel() {
      return unit().label;
    },

    /** 화면 표시용: 천 단위 쉼표, 설정한 소수점 자리 */
    formatLength(mm, withUnit = true) {
      const s = fixed(mm / unit().factor);
      return withUnit ? `${s} ${unit().label}` : s;
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
     틀(벽 종류에 틀이 있을 때): 세로재 = (L ÷ 세로 간격 올림 + 1)개 × H
                                 가로재 = (위·아래 2줄 + 중간 줄) × L, 중간 줄 = H ÷ 가로 간격 올림 − 1
       다루끼는 세로·가로 모두 '다루끼', 경량은 세로 '스터드', 가로 '런너'
       문·창문 자리의 틀은 빼지 않음 (그 자리에 보강재가 들어가는 것으로 봄)
     석고보드: 한 면 면적 × 겹 수
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

  const measure = {
    openingsOf,

    /** 벽 하나의 기본 수치와 자재 (길이 mm, 면적 mm²) */
    wall(w) {
      const L = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
      const H = w.height;
      const openings = openingsOf(w.id);
      const openingArea = Math.min(L * H, openings.reduce((sum, o) => sum + App.model.TYPES[o.type].area(o), 0));
      const area = L * H - openingArea;
      const q = { length: L, height: H, grossArea: L * H, openingArea, openings: openings.length, area, frames: [], boards: [] };
      const t = App.catalog.typeOf(w);
      if (!t || L <= 0 || H <= 0) return q;
      if (t.frameKind !== 'none') {
        const verticalCount = Math.ceil(L / t.frameSpacing - EPS) + 1;
        const rows = 2 + (t.frameRowSpacing > 0 ? Math.max(0, Math.ceil(H / t.frameRowSpacing - EPS) - 1) : 0);
        q.frameDetail = { verticalCount, rows };
        const item = (name, length) => ({ name, length, piece: t.framePiece, loss: t.frameLoss });
        if (t.frameKind === 'wood') q.frames.push(item('다루끼', verticalCount * H + rows * L));
        else q.frames.push(item('스터드', verticalCount * H), item('런너', rows * L));
      }
      const layers = t.boardFace + t.boardBack;
      if (layers > 0) {
        q.boards.push({
          spec: `석고보드 ${Number(t.boardT)}T ${Number(t.boardW)}×${Number(t.boardL)}`,
          area: area * layers, sheetArea: t.boardW * t.boardL, loss: t.boardLoss, layers,
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
