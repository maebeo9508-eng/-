/* 도면 데이터와 실행 취소 기록.
   모든 변경은 transact()(또는 begin~commit) 안에서 하고, 바뀐 요소의 이전·이후 상태만 기록한다. */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const G = App.geom;

  const DATA_VERSION = 1;   // 저장 데이터 구조 버전 (8단계 저장 기능에서 사용)
  const HISTORY_LIMIT = 100; // 실행 취소 단계 수 (요구: 50 이상)

  const LAYERS = [
    { id: 'arch', label: '건축' },
    { id: 'elec', label: '전기' },
    { id: 'mech', label: '설비' },
    { id: 'zone', label: '영역' },
    { id: 'memo', label: '메모' },
    { id: 'dim', label: '치수' },
  ];

  const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
  let seq = 0;
  const newId = (type) =>
    `${type}-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  /** 모든 요소가 가지는 공통 속성 */
  function base(type, layer) {
    return { id: newId(type), type, layer, room: null, memo: '', createdAt: new Date().toISOString() };
  }

  /* 요소 종류별 기하 처리. 종류가 늘면 여기에 추가 */
  const TYPES = {
    wall: {
      label: '벽',
      create(start, end, opts = {}) {
        return {
          ...base('wall', 'arch'),
          start: { x: start.x, y: start.y },
          end: { x: end.x, y: end.y },
          thickness: opts.thickness ?? App.settings.wallThickness,
          height: opts.height ?? App.settings.wallHeight,
        };
      },
      length(w) {
        return G.dist(w.start, w.end);
      },
      bounds(w) {
        const h = w.thickness / 2;
        return {
          minX: Math.min(w.start.x, w.end.x) - h, minY: Math.min(w.start.y, w.end.y) - h,
          maxX: Math.max(w.start.x, w.end.x) + h, maxY: Math.max(w.start.y, w.end.y) + h,
        };
      },
      /** 벽 면까지의 거리. 벽 안쪽이면 0 이하 */
      distance(w, p) {
        return G.closestOnSegment(p, w.start, w.end).dist - w.thickness / 2;
      },
      /** crossing: 걸치기만 해도 선택, 아니면 완전히 들어와야 선택 */
      inRect(w, r, crossing) {
        return crossing
          ? G.segmentIntersectsRect(w.start, w.end, r)
          : G.pointInRect(w.start, r) && G.pointInRect(w.end, r);
      },
      snapPoints(w) {
        return [
          { x: w.start.x, y: w.start.y, kind: 'end' },
          { x: w.end.x, y: w.end.y, kind: 'end' },
          { x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2, kind: 'mid' },
        ];
      },
      movedBy(w, dx, dy) {
        return {
          start: { x: w.start.x + dx, y: w.start.y + dy },
          end: { x: w.end.x + dx, y: w.end.y + dy },
        };
      },
    },
  };

  class Doc {
    constructor() {
      this.elements = new Map(); // 삽입 순서 = 그리는 순서
      this.version = 0;          // 바뀔 때마다 증가 (그리기 캐시용)
      this.undoStack = [];
      this.redoStack = [];
      this.tx = null;
      this.listeners = [];
      this._queued = false;
    }

    get(id) { return this.elements.get(id); }
    has(id) { return this.elements.has(id); }
    all() { return this.elements.values(); }
    get size() { return this.elements.size; }

    /** 변경 알림. 한 동작 안의 여러 변경은 한 번으로 묶어서 알림 */
    onChange(fn) { this.listeners.push(fn); }
    _changed() {
      this.version++;
      if (this._queued) return;
      this._queued = true;
      queueMicrotask(() => {
        this._queued = false;
        this.listeners.forEach((fn) => fn());
      });
    }

    _touch(id) {
      if (!this.tx) throw new Error('도면 변경은 transact() 안에서 해야 합니다');
      if (!this.tx.before.has(id)) this.tx.before.set(id, clone(this.elements.get(id)));
    }
    add(el) {
      this._touch(el.id);
      this.elements.set(el.id, el);
      this._changed();
      return el;
    }
    update(id, patch) {
      const el = this.elements.get(id);
      if (!el) return;
      this._touch(id);
      Object.assign(el, clone(patch));
      this._changed();
    }
    remove(id) {
      if (!this.elements.has(id)) return;
      this._touch(id);
      this.elements.delete(id);
      this._changed();
    }

    begin(label) {
      if (this.tx) this.commit();
      this.tx = { label, before: new Map() };
    }
    /** 실제로 바뀐 것이 있으면 실행 취소 기록에 한 단계로 남김 */
    commit() {
      const tx = this.tx;
      if (!tx) return false;
      this.tx = null;
      const changes = [];
      tx.before.forEach((before, id) => {
        const after = clone(this.elements.get(id));
        if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ id, before, after });
      });
      if (!changes.length) return false;
      this.undoStack.push({ label: tx.label, changes });
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack.length = 0;
      this._changed();
      return true;
    }
    rollback() {
      const tx = this.tx;
      if (!tx) return;
      this.tx = null;
      tx.before.forEach((before, id) => this._put(id, before));
      this._changed();
    }
    transact(label, fn) {
      this.begin(label);
      try {
        const result = fn();
        this.commit();
        return result;
      } catch (err) {
        this.rollback();
        throw err;
      }
    }
    _put(id, value) {
      if (value) this.elements.set(id, clone(value));
      else this.elements.delete(id);
    }

    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }
    undo() {
      if (this.tx) this.rollback();
      const entry = this.undoStack.pop();
      if (!entry) return null;
      entry.changes.forEach((c) => this._put(c.id, c.before));
      this.redoStack.push(entry);
      this._changed();
      return entry;
    }
    redo() {
      if (this.tx) this.rollback();
      const entry = this.redoStack.pop();
      if (!entry) return null;
      entry.changes.forEach((c) => this._put(c.id, c.after));
      this.undoStack.push(entry);
      this._changed();
      return entry;
    }

    /* ── 조회 ── */

    /** 도면 점 p 가까이(tol mm 안)에 있는 요소 id. 여러 개면 가장 가까운 것 */
    hitTest(p, tol, filter) {
      let best = null, bestD = Infinity;
      for (const el of this.elements.values()) {
        const t = TYPES[el.type];
        if (!t || (filter && !filter(el))) continue;
        const d = t.distance(el, p);
        if (d <= tol && d < bestD) {
          best = el.id;
          bestD = d;
        }
      }
      return best;
    }

    inRect(rect, crossing) {
      const ids = [];
      for (const el of this.elements.values()) {
        const t = TYPES[el.type];
        if (t && t.inRect(el, rect, crossing)) ids.push(el.id);
      }
      return ids;
    }

    /** 전체 요소 범위. 비어 있으면 null */
    bounds(ids) {
      let r = null;
      const list = ids ? ids.map((id) => this.elements.get(id)).filter(Boolean) : this.elements.values();
      for (const el of list) {
        const t = TYPES[el.type];
        if (!t) continue;
        const b = t.bounds(el);
        r = r
          ? { minX: Math.min(r.minX, b.minX), minY: Math.min(r.minY, b.minY), maxX: Math.max(r.maxX, b.maxX), maxY: Math.max(r.maxY, b.maxY) }
          : b;
      }
      return r;
    }
  }

  App.model = { DATA_VERSION, LAYERS, TYPES, Doc, clone };
})();
