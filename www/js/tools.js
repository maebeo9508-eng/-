/* 그리기 도구와 선택.
   도구는 ViewNavigator(input.js)에서 한 손가락·왼쪽 버튼 동작만 넘겨받는다.
   ev = { x, y (화면 px), world (mm), shift, alt, ctrl, touch } */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const G = App.geom;

  const DRAG_PX = { mouse: 4, touch: 8 };     // 이만큼 움직여야 끌기로 봄
  const HIT_PX = { mouse: 6, touch: 14 };     // 요소를 누른 것으로 보는 여유
  const DOUBLE_CLICK_MS = 350;
  const HANDLE_PX = { mouse: 10, touch: 22 }; // 벽 끝 손잡이를 잡는 범위
  const HANDLED = new Set(['wall', 'line', 'dim']); // 양 끝 손잡이로 늘이는 요소
  const STRETCHY = new Set(['wall', 'line']);      // '늘리기'로 이어진 끝이 따라오는 요소
  const LIVE_ROOM_SYNC_MAX_WALLS = 400;       // 이보다 벽이 많으면 끄는 동안 방 경계를 다시 계산하지 않음

  const render = () => App.plan.requestRender();
  const screenDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const dragged = (ev, from) => screenDist(ev, from) >= (ev.touch ? DRAG_PX.touch : DRAG_PX.mouse);
  // 숨긴 레이어의 것은 누를 수 없음
  const hitAt = (ev) => App.doc.hitTest(ev.world, (ev.touch ? HIT_PX.touch : HIT_PX.mouse) / App.plan.view.scale, (el) => App.layers.visible(el));
  // 잠금: 움직이거나 지우지 못함 (가져온 도면의 '잠금'은 고르지 못하게 하는 것이라 따로)
  const isLocked = (id) => { const el = App.doc.get(id); return !!(el && el.locked && el.type !== 'underlay'); };
  const lockedHint = () => App.ui.hint('잠긴 항목입니다. 속성에서 ‘잠금’을 풀면 움직일 수 있습니다.', 3000);

  /* ── 선택 ── */
  class Selection {
    constructor() {
      this.ids = new Set();
      this.listeners = [];
    }
    has(id) { return this.ids.has(id); }
    get size() { return this.ids.size; }
    list() { return [...this.ids]; }
    onChange(fn) { this.listeners.push(fn); }
    _emit() {
      this.listeners.forEach((fn) => fn());
      render();
    }
    set(ids) {
      this.ids = new Set(ids);
      this._emit();
    }
    add(ids) {
      ids.forEach((id) => this.ids.add(id));
      this._emit();
    }
    toggle(id) {
      this.toggleAll([id]);
    }
    /** 모두 골라져 있으면 모두 빼고, 아니면 모두 더함 (묶음을 Shift로 누를 때) */
    toggleAll(ids) {
      if (ids.every((id) => this.ids.has(id))) ids.forEach((id) => this.ids.delete(id));
      else ids.forEach((id) => this.ids.add(id));
      this._emit();
    }
    clear() {
      if (!this.ids.size) return;
      this.ids.clear();
      this._emit();
    }
    /** 실행 취소 등으로 없어진 요소는 선택에서 뺌 */
    prune() {
      let changed = false;
      this.ids.forEach((id) => {
        if (!App.doc.has(id)) {
          this.ids.delete(id);
          changed = true;
        }
      });
      if (changed) this._emit();
    }
  }

  /** 묶음: 하나를 고르면 같은 묶음 전체가 함께 골라짐 */
  function withGroups(ids) {
    const groups = new Set();
    ids.forEach((id) => {
      const el = App.doc.get(id);
      if (el && el.group) groups.add(el.group);
    });
    if (!groups.size) return ids;
    const out = new Set(ids);
    for (const el of App.doc.all()) if (el.group && groups.has(el.group)) out.add(el.id);
    return [...out];
  }

  /* ── 선택 도구: 누르기 선택, Shift 추가, 범위 선택, 끌어서 이동 ── */
  class SelectTool {
    activate() {
      this.press = null;
      this.hoverId = null;
    }
    hover(ev) {
      const id = ev ? hitAt(ev) : null;
      if (id !== this.hoverId) {
        this.hoverId = id;
        render();
      }
    }
    /** 벽·선·치수 하나만 골랐을 때 그 양 끝 손잡이 */
    handleAt(ev) {
      if (App.selection.size !== 1) return null;
      const w = App.doc.get(App.selection.list()[0]);
      if (!w || !HANDLED.has(w.type) || w.locked) return null;
      const r = (ev.touch ? HANDLE_PX.touch : HANDLE_PX.mouse) / App.plan.view.scale;
      for (const end of ['start', 'end']) if (G.dist(ev.world, w[end]) <= r) return { id: w.id, end };
      return null;
    }
    down(ev) {
      const handle = this.handleAt(ev);
      this.press = { ev, handle, hit: handle ? null : hitAt(ev), mode: null };
      this.hoverId = null;
    }
    move(ev) {
      const p = this.press;
      if (!p) return this.hover(ev);
      if (!p.mode) {
        if (!dragged(ev, p.ev)) return;
        const hitEl = p.hit && App.doc.get(p.hit);
        const wallItem = hitEl && hitEl.type === 'item' && (App.catalog.itemDef(hitEl.kind) || {}).wall && !hitEl.group;
        if (p.handle) this.startStretch(p);
        else if (hitEl && isLocked(hitEl.id) && !ev.alt && (!App.selection.has(hitEl.id) || App.selection.size === 1)) {
          p.mode = 'locked'; // 잠긴 것을 끌면 움직이지 않고 알려 줌
          App.selection.set(withGroups([hitEl.id]));
          lockedHint();
        }
        else if (hitEl && (hitEl.type === 'door' || hitEl.type === 'window') && !hitEl.group && !ev.alt) this.startSlide(p, hitEl);
        else if (wallItem && !ev.alt && (!App.selection.has(hitEl.id) || App.selection.size === 1)) this.startRemount(p, hitEl);
        else if (p.hit) this.startMove(p, ev);
        else p.mode = 'box';
      }
      if (p.mode === 'move') this.updateMove(p, ev);
      else if (p.mode === 'stretch') this.updateStretch(p, ev);
      else if (p.mode === 'slide') this.updateSlide(p, ev);
      else if (p.mode === 'remount') this.updateRemount(p, ev);
      else p.cur = ev;
      render();
    }
    up(ev) {
      const p = this.press;
      this.press = null;
      if (!p) return;
      const sel = App.selection;
      if (!p.mode) {
        const hitEl = p.hit && App.doc.get(p.hit);
        if (p.handle) { /* 손잡이를 누르기만 함: 선택 그대로 */ }
        else if (hitEl && hitEl.type === 'text' && !ev.shift && sel.size === 1 && sel.has(p.hit)) {
          App.textEditor.open({ x: hitEl.x, y: hitEl.y }, hitEl); // 고른 메모를 한 번 더 누르면 고치기
        }
        else if (p.hit) ev.shift ? sel.toggleAll(withGroups([p.hit])) : sel.set(withGroups([p.hit]));
        else if (!ev.shift) sel.clear();
        if (ev.touch) App.ui.emit('picked', !!p.hit); // 휴대폰: 누른 것의 속성이 보이게 서랍을 올림
      } else if (['move', 'stretch', 'slide', 'remount'].includes(p.mode)) {
        App.doc.commit();
      } else if (p.mode === 'box') {
        const crossing = ev.x < p.ev.x; // 오른쪽에서 왼쪽으로 끌면 걸친 것도 선택
        const ids = withGroups(App.doc.inRect(G.rectFromPoints(p.ev.world, ev.world), crossing).filter((id) => App.layers.visible(App.doc.get(id))));
        p.ev.shift || ev.shift ? sel.add(ids) : sel.set(ids);
      }
      if (!ev.touch) this.hover(ev);
      render();
    }

    startMove(p, ev) {
      const sel = App.selection;
      if (!sel.has(p.hit)) sel.set(withGroups([p.hit]));
      p.mode = 'move';
      let label = '이동';
      // Alt를 누르고 끌면 복제해서 옮김 (원본은 제자리)
      if (ev && ev.alt) {
        const copies = App.edit.clones(App.edit.expand(sel.list()), 0, 0);
        if (copies.length) {
          App.doc.begin('복제');
          copies.forEach((c) => App.doc.add(c));
          sel.set(copies.map((c) => c.id).filter((id) => App.doc.has(id)));
          label = null;
        }
      }
      // 방을 옮기면 그 방을 둘러싼 벽도 함께. 잠긴 것은 빼고
      const ids = new Set(sel.list());
      sel.list().forEach((id) => {
        const el = App.doc.get(id);
        if (el && el.type === 'room') el.wallIds.forEach((w) => App.doc.has(w) && ids.add(w));
      });
      p.ids = [...ids].filter((id) => !isLocked(id));
      if (p.ids.length < ids.size) lockedHint();
      p.orig = new Map(p.ids.map((id) => [id, App.model.clone(App.doc.get(id))]));
      // '늘리기': 옮기는 벽에 붙은 다른 벽의 끝도 같이 움직여 모서리가 떨어지지 않게
      p.attached = App.settings.stretchWalls ? attachedEnds([...p.orig.values()].filter((e) => STRETCHY.has(e.type)), new Set(p.ids)) : [];
      p.exclude = new Set([...p.ids, ...p.attached.map((a) => a.id)]);
      p.points = [];
      p.orig.forEach((el) => {
        const t = App.model.TYPES[el.type];
        if (t && t.snapPoints) t.snapPoints(el).forEach((q) => q.kind === 'end' && p.points.push(q));
      });
      if (label) App.doc.begin(label);
      // 벽에 붙은 기호를 그 벽 없이 옮기면 벽에서 뗌 (벽도 함께 옮기면 붙은 채로 따라감)
      p.orig.forEach((el, id) => {
        if (el.type === 'item' && el.wallId && !p.orig.has(el.wallId)) {
          App.doc.update(id, { wallId: null, t: null, side: null });
          el.wallId = null;
        }
      });
    }
    updateMove(p, ev) {
      let dx = ev.world.x - p.ev.world.x;
      let dy = ev.world.y - p.ev.world.y;
      const lockX = ev.shift && Math.abs(dx) < Math.abs(dy); // Shift: 가로·세로로만
      const lockY = ev.shift && !lockX;
      if (lockX) dx = 0;
      if (lockY) dy = 0;
      const s = App.snap.moveDelta(dx, dy, p.points, p.exclude, ev.touch);
      p.snap = s;
      let mx = lockX ? 0 : s.dx, my = lockY ? 0 : s.dy;
      // 기호·기둥 하나를 옮길 때는 가장자리를 벽면에 딱 붙임
      if (p.orig.size === 1 && s.kind !== 'end' && !ev.shift) {
        const f = App.snap.flush([...p.orig.values()][0], mx, my, p.exclude, ev.touch);
        if (f) { mx = f.dx; my = f.dy; }
      }
      p.orig.forEach((el, id) => App.doc.update(id, App.model.TYPES[el.type].movedBy(el, mx, my)));
      p.attached.forEach((a) => App.doc.update(a.id, { [a.end]: { x: a.x + mx, y: a.y + my } }));
      syncRoomsLive();
    }

    /** 벽 끝 손잡이 끌기: 벽 길이·방향 바꾸기. '늘리기'면 같은 점에 붙은 벽 끝도 따라옴 */
    startStretch(p) {
      p.mode = 'stretch';
      const w = App.doc.get(p.handle.id);
      p.fixed = { ...w[p.handle.end === 'start' ? 'end' : 'start'] };
      const from = w[p.handle.end];
      p.followers = [];
      if (App.settings.stretchWalls) {
        for (const el of App.doc.all()) {
          if (el.type !== w.type || !STRETCHY.has(el.type) || el.id === w.id || el.locked) continue;
          ['start', 'end'].forEach((end) => G.samePoint(el[end], from, 1) && p.followers.push({ id: el.id, end }));
        }
      }
      p.exclude = new Set([w.id, ...p.followers.map((f) => f.id)]);
      App.doc.begin(`${App.model.TYPES[w.type].label} 늘이기`);
    }
    updateStretch(p, ev) {
      const target = App.snap.point(ev.world, {
        from: p.fixed,
        ortho: App.settings.ortho !== !!ev.shift,
        touch: ev.touch,
        exclude: p.exclude,
        center: App.doc.get(p.handle.id).type === 'wall',
      });
      if (G.samePoint(target, p.fixed, 1)) return; // 길이 0은 막음
      p.target = target;
      p.lastEv = ev;
      const pt = { x: target.x, y: target.y };
      App.doc.update(p.handle.id, { [p.handle.end]: pt });
      p.followers.forEach((f) => App.doc.update(f.id, { [f.end]: pt }));
      syncRoomsLive();
    }

    /** 벽에 붙는 기호 끌기: 벽 가까이면 벽면에 붙어 벽을 따라 미끄러지고, 벽에서 멀어지면 떨어져 자유롭게 */
    startRemount(p, el) {
      App.selection.set([el.id]);
      p.mode = 'remount';
      p.el = App.model.clone(el);
      p.def = App.catalog.itemDef(el.kind);
      App.doc.begin(`${el.kind} 이동`);
    }
    updateRemount(p, ev) {
      const depth = p.el.size * p.def.aspect;
      const m = wallMount(ev, depth);
      if (m) {
        App.doc.update(p.el.id, { x: m.x, y: m.y, rotation: m.rotation, ...m.mount });
      } else {
        const q = App.snap.point(ev.world, { touch: ev.touch, exclude: new Set([p.el.id]) });
        App.doc.update(p.el.id, { x: q.x, y: q.y, wallId: null, t: null, side: null });
      }
    }

    /** 문·창문 끌기: 벽을 따라 미끄러지고, 다른 벽 가까이 가면 그 벽으로 옮겨 붙음 */
    startSlide(p, el) {
      App.selection.set([el.id]);
      p.mode = 'slide';
      p.el = App.model.clone(el);
      App.doc.begin(`${App.model.TYPES[el.type].label} 이동`);
    }
    updateSlide(p, ev) {
      const loc = locateOnWall(ev, p.el.width, p.el.id);
      p.loc = loc;
      if (loc && !loc.error) App.doc.update(p.el.id, { wallId: loc.wall.id, t: loc.t });
    }

    cancel() {
      if (this.press && ['move', 'stretch', 'slide', 'remount'].includes(this.press.mode)) App.doc.rollback();
      this.press = null;
      render();
    }
    escape() {
      if (this.press) {
        this.cancel();
        return true;
      }
      if (App.selection.size) {
        App.selection.clear();
        return true;
      }
      return false;
    }
    highlight() {
      return this.hoverId && !this.press ? { ids: new Set(withGroups([this.hoverId])), color: 'accent' } : null;
    }
    overlay(plan) {
      const p = this.press;
      if (!p) return;
      if (p.mode === 'box' && p.cur) App.draw.selectionBox(plan, p.ev, p.cur, p.cur.x < p.ev.x);
      if (p.mode === 'move' && p.snap && p.snap.kind === 'end') App.draw.snapMarker(plan, { ...p.snap.at, kind: 'end' });
      if (p.mode === 'slide' && p.loc) {
        const el = App.doc.get(p.el.id);
        const g = el && App.model.openingGeom(el);
        if (g && !p.loc.error) {
          App.draw.screenTransform(plan);
          App.draw.distanceTag(plan, g.wall.start, g.a, g.n, g.th);
          App.draw.distanceTag(plan, g.b, g.wall.end, g.n, g.th);
        }
      }
      if (p.mode === 'stretch' && p.target) {
        App.draw.snapMarker(plan, p.target);
        App.draw.lengthTag(plan, p.fixed, p.target, p.lastEv && p.lastEv.touch);
      }
    }
  }

  /** 옮기는 벽(선) 위(끝이나 중간)에 닿아 있는, 옮기지 않는 같은 종류의 끝 */
  function attachedEnds(moving, movingIds) {
    const found = [];
    for (const el of App.doc.all()) {
      if (!STRETCHY.has(el.type) || movingIds.has(el.id) || el.locked) continue;
      const same = moving.filter((m) => m.type === el.type);
      ['start', 'end'].forEach((end) => {
        const pt = el[end];
        if (same.some((m) => G.closestOnSegment(pt, m.start, m.end).dist < 1)) found.push({ id: el.id, end, x: pt.x, y: pt.y });
      });
    }
    return found;
  }

  /** 끄는 동안에도 벽에 붙은 기호와 방 경계를 따라 맞춤 (도면이 크면 손을 뗄 때만) */
  function syncRoomsLive() {
    let walls = 0;
    for (const el of App.doc.all()) if (el.type === 'wall' && ++walls > LIVE_ROOM_SYNC_MAX_WALLS) return;
    if (!App.doc.tx) return;
    App.catalog.syncHook(App.doc.tx);
    App.rooms.syncRooms(App.doc.tx);
  }

  /* ── 이어 그리기 도구 (벽·선·치수) ──
     끌기: 누른 곳에서 뗀 곳까지 하나. 누르기(클릭·탭): 점을 차례로 찍어 이어 그리기.
     끝내기: 같은 점을 다시 누르기, 더블클릭, 시작점에 닫기, Esc·Enter·오른쪽 클릭, '그리기 끝내기' 버튼
     cfg: { label, create(a, b) → 요소, preview(plan, a, b), single: 하나 그리면 끝 } */
  class ChainTool {
    constructor(cfg) {
      this.cfg = cfg;
    }
    activate() {
      this.chain = null; // { points: [시작점, ...], ids: [만든 요소 id, ...] }
      this.press = null;
      this.cursor = null;
      this.lastClick = null;
    }
    deactivate() {
      this.finish();
    }
    isChaining() {
      return !!this.chain;
    }
    last() {
      return this.chain.points[this.chain.points.length - 1];
    }
    snapAt(ev, from) {
      return App.snap.point(ev.world, {
        from,
        ortho: !!from && App.settings.ortho !== !!ev.shift, // Shift는 직교를 잠깐 반대로
        touch: ev.touch,
        center: !!this.cfg.snapCenter,
        extra: this.chain ? [{ ...this.chain.points[0], kind: 'end' }] : [],
      });
    }
    hover(ev) {
      this.lastHover = ev;
      this.cursor = ev ? this.snapAt(ev, this.chain ? this.last() : null) : null;
      render();
    }
    down(ev) {
      this.press = { ev, start: this.snapAt(ev, null), dragging: false };
      this.cursor = null;
    }
    move(ev) {
      const p = this.press;
      if (!p) return this.hover(ev);
      if (!p.dragging && dragged(ev, p.ev)) p.dragging = true;
      if (p.dragging) {
        p.end = this.snapAt(ev, p.start);
        p.lastEv = ev;
        render();
      }
    }
    up(ev) {
      const p = this.press;
      this.press = null;
      if (!p) return;
      if (p.dragging) {
        const end = this.snapAt(ev, p.start);
        if (!this.chain || !G.samePoint(p.start, this.last())) this.startChain(p.start);
        this.addSegment(end);
        this.lastClick = null;
      } else {
        const now = performance.now();
        const isDouble = this.lastClick && now - this.lastClick.t < DOUBLE_CLICK_MS && screenDist(ev, this.lastClick) < 8;
        this.lastClick = { t: now, x: ev.x, y: ev.y };
        if (!this.chain) {
          this.startChain(p.start);
        } else {
          const pt = this.snapAt(ev, this.last());
          if (isDouble || G.samePoint(pt, this.last())) this.finish(); // 같은 점을 한 번 더: 끝내기
          else this.addSegment(pt);
        }
      }
      if (!ev.touch) this.hover(ev);
      render();
    }
    startChain(point) {
      this.chain = { points: [{ x: point.x, y: point.y }], ids: [] };
      App.tools.changed();
    }
    addSegment(end) {
      const ch = this.chain;
      const a = this.last();
      if (G.samePoint(a, end)) return;
      const el = this.cfg.create(a, end);
      if (!el) return;
      App.doc.transact(`${this.cfg.label} 그리기`, () => App.doc.add(el));
      ch.points.push({ x: end.x, y: end.y });
      ch.ids.push(el.id);
      if (this.cfg.single) this.finish();
      else if (ch.ids.length >= 2 && G.samePoint(end, ch.points[0])) this.finish(); // 닫히면 끝
    }
    /** 길이를 숫자로: 마지막 점에서 dir(단위 벡터) 방향으로 len(mm)만큼 */
    addLength(len, dir) {
      if (!this.chain || !(len > 0)) return false;
      const a = this.last();
      this.addSegment({ x: a.x + dir.x * len, y: a.y + dir.y * len });
      render();
      return true;
    }
    /** 숫자로 넣을 때 쓸 방향: 커서 쪽, 없으면 바로 앞 선분 방향 */
    currentDir() {
      if (!this.chain) return null;
      const a = this.last();
      if (this.cursor && !G.samePoint(this.cursor, a)) return G.unit({ x: this.cursor.x - a.x, y: this.cursor.y - a.y });
      const pts = this.chain.points;
      if (pts.length >= 2) {
        const b = pts[pts.length - 2];
        return G.unit({ x: a.x - b.x, y: a.y - b.y });
      }
      return null;
    }
    finish() {
      if (!this.chain) return;
      this.chain = null;
      this.cursor = this.lastHover ? this.snapAt(this.lastHover, null) : null;
      App.tools.changed();
      render();
    }
    context() {
      this.finish();
    }
    cancel() {
      this.press = null;
      render();
    }
    escape() {
      if (this.press) {
        this.cancel();
        return true;
      }
      if (this.chain) {
        this.finish();
        return true;
      }
      return false;
    }
    /** 실행 취소로 마지막 것이 없어지면 그 앞 점부터 이어 그림 */
    onDocChange() {
      const ch = this.chain;
      if (!ch || !ch.ids.length) return;
      let popped = false;
      while (ch.ids.length && !App.doc.has(ch.ids[ch.ids.length - 1])) {
        ch.ids.pop();
        ch.points.pop();
        popped = true;
      }
      if (popped && !ch.ids.length) this.finish();
    }
    overlay(plan) {
      const D = App.draw;
      const p = this.press;
      if (p && p.dragging && p.end) {
        this.cfg.preview(plan, p.start, p.end);
        D.snapMarker(plan, p.end);
        D.lengthTag(plan, p.start, p.end, p.lastEv && p.lastEv.touch);
        return;
      }
      if (this.chain) {
        const last = this.last();
        if (this.cursor && !p) {
          this.cfg.preview(plan, last, this.cursor);
          D.lengthTag(plan, last, this.cursor, false);
        }
        D.pointMarker(plan, last);
      }
      if (this.cursor && !p) D.snapMarker(plan, this.cursor);
    }
  }

  const currentWallThickness = () => {
    const type = App.current.wallTypeId && App.doc.get(App.current.wallTypeId);
    return type ? App.catalog.thickness(type) : 100;
  };
  const wallChain = () => new ChainTool({
    label: '벽',
    snapCenter: true, // 다른 벽에 붙일 때는 중심선에 (T자로 이어져 방이 닫히게)
    create: (a, b) => App.model.TYPES.wall.create(a, b),
    preview: (plan, a, b) => App.draw.previewWall(plan, a, b, currentWallThickness()),
  });
  /** 선 그리기. presetId()가 돌려주는 선 종류로 */
  const lineChain = (presetId) => new ChainTool({
    label: '선',
    create: (a, b) => {
      const preset = App.doc.get(presetId());
      if (!preset) {
        App.ui.hint('선 종류가 없습니다. 위쪽 목록에서 ‘목록 편집’으로 추가하세요.', 4000);
        return null;
      }
      return App.model.TYPES.line.create(a, b, preset);
    },
    preview: (plan, a, b) => App.draw.previewLine(plan, a, b, App.doc.get(presetId())),
  });
  const dimChain = () => new ChainTool({
    label: '치수',
    single: true,
    create: (a, b) => App.model.TYPES.dim.create(a, b),
    preview: (plan, a, b) => App.draw.previewDim(plan, a, b),
  });

  /* ── 지우개: 누르거나 문지른 요소를 지움 (한 번에 실행 취소 한 단계) ── */
  class EraseTool {
    activate() {
      this.press = null;
      this.hoverId = null;
    }
    hover(ev) {
      const id = ev ? hitAt(ev) : null;
      if (id !== this.hoverId) {
        this.hoverId = id;
        render();
      }
    }
    down(ev) {
      this.press = { ids: new Set() };
      this.hoverId = null;
      this.collect(ev);
    }
    move(ev) {
      if (!this.press) return this.hover(ev);
      this.collect(ev);
    }
    collect(ev) {
      const id = hitAt(ev);
      if (id && isLocked(id)) {
        if (!this.press.warned) lockedHint();
        this.press.warned = true;
        return;
      }
      if (id && !this.press.ids.has(id)) {
        this.press.ids.add(id);
        render();
      }
    }
    up() {
      const p = this.press;
      this.press = null;
      if (p && p.ids.size) removeElements([...p.ids], '지우기');
      render();
    }
    cancel() {
      this.press = null;
      render();
    }
    highlight() {
      if (this.press) return { ids: this.press.ids, color: 'danger' };
      return this.hoverId ? { ids: new Set([this.hoverId]), color: 'danger' } : null;
    }
  }

  /* ── 방 도구: 벽으로 닫힌 곳을 누르면 방으로 등록 ── */
  class RoomTool {
    activate() {
      this.press = null;
      this.preview = null; // { face, existing }
    }
    lookup(p) {
      const existing = App.doc.hitTest(p, 1, (el) => el.type === 'room');
      return { face: App.rooms.faceAt(p), existing };
    }
    hover(ev) {
      this.preview = ev ? this.lookup(ev.world) : null;
      render();
    }
    down(ev) {
      this.press = ev;
      this.preview = null;
    }
    move(ev) {
      if (!this.press) this.hover(ev);
    }
    up(ev) {
      const pr = this.press;
      this.press = null;
      if (!pr || dragged(ev, pr)) return;
      const p = ev.world;
      const tol = (ev.touch ? HIT_PX.touch : HIT_PX.mouse) / App.plan.view.scale;
      if (App.doc.hitTest(p, tol, (el) => el.type === 'wall')) {
        App.ui.hint('벽이 아니라 방 안쪽 빈 곳을 누르세요.');
        return;
      }
      const { face, existing } = this.lookup(p);
      const room = existing && App.doc.get(existing);
      if (room && face && !room.issue && Math.abs(App.model.TYPES.room.floorArea(room) - face.area) < 1) {
        App.selection.set([existing]);
        App.ui.hint(`이미 ‘${room.name}’(으)로 등록된 곳입니다.`);
        return;
      }
      if (!face) {
        App.ui.hint('벽으로 닫힌 곳이 아닙니다. 벽 끝이 서로 붙어 있는지 확인하세요.', 4000);
        return;
      }
      const created = App.model.TYPES.room.create(face.points, face.wallIds, App.rooms.nextName());
      // 둘러싼 벽 높이가 모두 같으면 그 값을 방의 벽 높이로
      const heights = new Set(face.wallIds.map((id) => App.doc.get(id).height));
      if (heights.size === 1) {
        created.wallHeight = [...heights][0];
        created.ceilingHeight = Math.min(App.settings.ceilingHeight, created.wallHeight); // 천장은 벽보다 높을 수 없음
      }
      App.doc.transact('방 만들기', () => App.doc.add(created));
      App.selection.set([created.id]);
      App.ui.toast(`${created.name}: 바닥 ${App.units.formatArea(face.area)}`);
      if (!ev.touch) this.hover(ev);
    }
    cancel() {
      this.press = null;
    }
    highlight() {
      const pv = this.preview;
      return pv && pv.existing ? { ids: new Set([pv.existing]), color: 'accent' } : null;
    }
    overlay(plan) {
      const pv = this.preview;
      if (pv && pv.face && !pv.existing) App.draw.facePreview(plan, pv.face);
    }
  }

  /** 가리킨 곳에서 가장 가까운 벽 위에 폭 width인 개구부를 놓을 자리.
      가까운 끝을 격자에 맞추고, 벽 끝을 넘지 않게. 다른 문·창문과 겹치면 error */
  function locateOnWall(ev, width, excludeId) {
    const tol = (ev.touch ? 28 : 16) / App.plan.view.scale;
    let best = null, bestD = Infinity;
    for (const w of App.doc.all()) {
      if (w.type !== 'wall') continue;
      const r = G.closestOnSegment(ev.world, w.start, w.end);
      const d = r.dist - w.thickness / 2;
      if (d <= tol && d < bestD) {
        best = { w, r };
        bestD = d;
      }
    }
    if (!best) return null;
    const w = best.w;
    const L = G.dist(w.start, w.end);
    if (L < width) return { wall: w, L, t: 0.5, side: 1, hinge: 'start', error: `벽(${App.units.formatLength(L)})이 폭보다 짧습니다.` };
    const cursorAt = best.r.t * L;
    let c = cursorAt;
    if (App.settings.snapGrid) {
      const g = App.snap.step();
      c = Math.round((c - width / 2) / g) * g + width / 2;
    }
    c = G.clamp(c, width / 2, L - width / 2);
    const d = G.unit({ x: w.end.x - w.start.x, y: w.end.y - w.start.y });
    const n = G.perp(d);
    const side = (ev.world.x - best.r.point.x) * n.x + (ev.world.y - best.r.point.y) * n.y >= 0 ? 1 : -1;
    const loc = { wall: w, L, t: c / L, c, side, hinge: cursorAt < c ? 'start' : 'end', error: null };
    for (const o of App.measure.openingsOf(w.id)) {
      if (o.id === excludeId) continue;
      const g = App.model.openingGeom(o);
      if (g && Math.abs(g.c - c) < g.half + width / 2 - 0.5) {
        loc.error = '다른 문·창문과 겹칩니다.';
        break;
      }
    }
    return loc;
  }

  /* ── 문·창문 도구: 벽 가까이를 누르면 고른 프리셋으로 붙임 ── */
  class OpeningTool {
    constructor(kind) {
      this.kind = kind;
    }
    activate() {
      this.press = null;
      this.preview = null;
    }
    preset() {
      return App.doc.get(App.current[`${this.kind}PresetId`]);
    }
    hover(ev) {
      const preset = this.preset();
      this.preview = ev && preset ? locateOnWall(ev, preset.width) : null;
      render();
    }
    down(ev) {
      this.press = ev;
      this.preview = null;
    }
    move(ev) {
      if (!this.press) this.hover(ev);
    }
    up(ev) {
      const pr = this.press;
      this.press = null;
      if (!pr || dragged(ev, pr)) return;
      const T = App.model.TYPES[this.kind];
      const preset = this.preset();
      if (!preset) {
        App.ui.hint('프리셋이 없습니다. 위쪽 목록에서 ‘목록 편집’으로 추가하세요.', 4000);
        return;
      }
      const loc = locateOnWall(ev, preset.width);
      if (!loc) {
        App.ui.hint(`${T.label}을 붙일 벽 위를 누르세요.`);
        return;
      }
      if (loc.error) {
        App.ui.hint(loc.error);
        return;
      }
      const el = this.kind === 'door'
        ? T.create(loc.wall.id, loc.t, preset, loc.side, loc.hinge)
        : T.create(loc.wall.id, loc.t, preset);
      App.doc.transact(`${T.label} 놓기`, () => App.doc.add(el));
      App.selection.set([el.id]);
      App.ui.toast(`${preset.name} ${App.catalog.describePreset(preset)}`);
      if (!ev.touch) this.hover(ev);
    }
    cancel() {
      this.press = null;
    }
    overlay(plan) {
      if (this.preview && !this.press) App.draw.openingPreview(plan, this.kind, this.preview, this.preset());
    }
  }

  /* ── 기둥 도구: 누른 곳(격자·끝점 스냅)에 고른 프리셋으로 놓음 ── */
  class ColumnTool {
    activate() {
      this.press = null;
      this.cursor = null;
    }
    preset() {
      return App.doc.get(App.current.columnPresetId);
    }
    /** 놓일 가운데: 격자·끝점 스냅 뒤, 가장자리가 벽면 가까이면 벽면에 딱 붙임 */
    pointAt(ev) {
      const p = App.snap.point(ev.world, { touch: ev.touch });
      const preset = this.preset();
      if (!preset || p.kind === 'end') return p;
      const f = App.snap.flush(App.model.TYPES.column.create({ x: 0, y: 0 }, preset), p.x, p.y, null, ev.touch);
      return f ? { x: f.dx, y: f.dy, kind: 'near' } : p;
    }
    hover(ev) {
      this.cursor = ev ? this.pointAt(ev) : null;
      render();
    }
    down(ev) {
      this.press = ev;
      this.cursor = null;
    }
    move(ev) {
      if (!this.press) this.hover(ev);
    }
    up(ev) {
      const pr = this.press;
      this.press = null;
      if (!pr || dragged(ev, pr)) return;
      const preset = this.preset();
      if (!preset) {
        App.ui.hint('기둥 프리셋이 없습니다. 위쪽 목록에서 ‘목록 편집’으로 추가하세요.', 4000);
        return;
      }
      const col = App.model.TYPES.column.create(this.pointAt(ev), preset);
      App.doc.transact('기둥 놓기', () => App.doc.add(col));
      App.selection.set([col.id]);
      App.ui.toast(`${preset.name} ${App.catalog.describePreset(preset)}`);
      if (!ev.touch) this.hover(ev);
    }
    cancel() {
      this.press = null;
    }
    overlay(plan) {
      if (!this.cursor || this.press) return;
      App.draw.columnPreview(plan, this.cursor, this.preset());
      App.draw.snapMarker(plan, this.cursor);
    }
  }

  /** 벽 가까이(화면 20px 안)면 벽면에 붙일 자리와 방향. 아니면 null */
  function wallMount(ev, depth) {
    const tol = (ev.touch ? 28 : 20) / App.plan.view.scale;
    let best = null, bestD = Infinity;
    for (const w of App.doc.all()) {
      if (w.type !== 'wall') continue;
      const r = G.closestOnSegment(ev.world, w.start, w.end);
      const d = r.dist - w.thickness / 2;
      if (d <= tol && d < bestD && r.t > 0 && r.t < 1) {
        best = { w, r };
        bestD = d;
      }
    }
    if (!best) return null;
    const { w, r } = best;
    const n = G.perp(G.unit({ x: w.end.x - w.start.x, y: w.end.y - w.start.y }));
    const side = (ev.world.x - r.point.x) * n.x + (ev.world.y - r.point.y) * n.y >= 0 ? 1 : -1;
    const L = G.dist(w.start, w.end);
    let along = r.t * L;
    if (App.settings.snapGrid) along = G.clamp(Math.round(along / App.snap.step()) * App.snap.step(), 0, L);
    const t = along / L;
    return { ...App.model.mountPoint(w, t, side, depth), mount: { wallId: w.id, t, side } };
  }

  /* ── 전기·설비 도구: 팔레트에서 고른 기호를 놓음. 전선관·배관·덕트를 고르면 선 그리기 ── */
  class ItemTool {
    constructor(category) {
      this.category = category;
      const def = this.def();
      this.lineTool = def && def.line ? lineChain(() => App.current.linePresetId) : null;
    }
    def() {
      const kind = App.current[`${this.category}Kind`];
      return App.catalog.ITEM_KINDS[this.category].find((d) => (d.kind || d.line) === kind) || null;
    }
    activate() {
      this.press = null;
      this.ghost = null;
      if (this.lineTool) this.lineTool.activate();
    }
    deactivate() {
      if (this.lineTool) this.lineTool.deactivate();
    }
    /** 놓일 자리: 벽에 붙는 종류는 벽 가까이면 벽면에, 아니면 격자·끝점 스냅 */
    placeAt(ev) {
      const def = this.def();
      if (!def || def.line) return null;
      const mount = def.wall ? wallMount(ev, def.size * def.aspect) : null;
      if (mount) return { ...mount, def };
      const p = App.snap.point(ev.world, { touch: ev.touch });
      // 벽에 붙지 않는 기호(실외기 등)도 가장자리가 벽면 가까이면 벽면에 딱 붙임
      const f = p.kind !== 'end' && App.snap.flush({ kind: def.kind, size: def.size, rotation: 0, x: 0, y: 0, type: 'item' }, p.x, p.y, null, ev.touch);
      if (f) return { x: f.dx, y: f.dy, rotation: 0, def, snap: { x: f.dx, y: f.dy, kind: 'near' } };
      return { x: p.x, y: p.y, rotation: 0, def, snap: p };
    }
    hover(ev) {
      if (this.lineTool) return this.lineTool.hover(ev);
      this.ghost = ev ? this.placeAt(ev) : null;
      render();
    }
    down(ev) {
      if (this.lineTool) return this.lineTool.down(ev);
      this.press = ev;
      this.ghost = null;
    }
    move(ev) {
      if (this.lineTool) return this.lineTool.move(ev);
      if (!this.press) this.hover(ev);
    }
    up(ev) {
      if (this.lineTool) return this.lineTool.up(ev);
      const pr = this.press;
      this.press = null;
      if (!pr || dragged(ev, pr)) return;
      const at = this.placeAt(ev);
      if (!at) return;
      const it = App.model.TYPES.item.create(at, this.category, at.def, at.rotation, at.mount || null);
      App.doc.transact(`${at.def.kind} 놓기`, () => App.doc.add(it));
      App.ui.toast(`${at.def.kind} 놓음`);
      if (!ev.touch) this.hover(ev);
    }
    cancel() {
      if (this.lineTool) return this.lineTool.cancel();
      this.press = null;
    }
    isChaining() { return !!this.lineTool && this.lineTool.isChaining(); }
    finish() { if (this.lineTool) this.lineTool.finish(); }
    context(ev) { if (this.lineTool) this.lineTool.context(ev); }
    escape() { return this.lineTool ? this.lineTool.escape() : false; }
    onDocChange() { if (this.lineTool) this.lineTool.onDocChange(); }
    overlay(plan) {
      if (this.lineTool) return this.lineTool.overlay(plan);
      const g = this.ghost;
      if (!g || this.press) return;
      App.draw.previewItem(plan, { kind: g.def.kind, category: this.category, x: g.x, y: g.y, rotation: g.rotation, size: g.def.size });
      if (g.snap) App.draw.snapMarker(plan, g.snap);
    }
  }

  /* ── 영역 도구: 끌면 사각형, 점을 차례로 누르면 다각형 (처음 점을 다시 누르거나 '끝내기') ── */
  class ZoneTool {
    activate() {
      this.points = null;
      this.press = null;
      this.cursor = null;
      this.lastClick = null;
    }
    deactivate() {
      this.finish();
    }
    isChaining() {
      return !!this.points;
    }
    color() {
      return App.current.zoneColor;
    }
    snapAt(ev, from) {
      return App.snap.point(ev.world, {
        from,
        ortho: !!from && App.settings.ortho !== !!ev.shift,
        touch: ev.touch,
        extra: this.points ? [{ ...this.points[0], kind: 'end' }] : [],
      });
    }
    hover(ev) {
      this.lastHover = ev;
      this.cursor = ev ? this.snapAt(ev, this.points ? this.points[this.points.length - 1] : null) : null;
      render();
    }
    down(ev) {
      this.press = { ev, start: this.snapAt(ev, null), dragging: false };
    }
    move(ev) {
      const p = this.press;
      if (!p) return this.hover(ev);
      if (!p.dragging && !this.points && dragged(ev, p.ev)) p.dragging = true;
      if (p.dragging) {
        p.end = this.snapAt(ev, null);
        render();
      }
    }
    up(ev) {
      const p = this.press;
      this.press = null;
      if (!p) return;
      if (p.dragging) {
        const a = p.start, b = this.snapAt(ev, null);
        if (Math.abs(b.x - a.x) > 1 && Math.abs(b.y - a.y) > 1) {
          this.create([a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]);
        }
        return;
      }
      const now = performance.now();
      const isDouble = this.lastClick && now - this.lastClick.t < DOUBLE_CLICK_MS && screenDist(ev, this.lastClick) < 8;
      this.lastClick = { t: now, x: ev.x, y: ev.y };
      if (!this.points) {
        this.points = [p.start];
        App.tools.changed();
      } else {
        const pt = this.snapAt(ev, this.points[this.points.length - 1]);
        const last = this.points[this.points.length - 1];
        if (isDouble || G.samePoint(pt, last) || (this.points.length >= 3 && G.samePoint(pt, this.points[0]))) this.finish();
        else this.points.push(pt);
      }
      if (!ev.touch) this.hover(ev);
      render();
    }
    create(points) {
      let n = 0;
      for (const el of App.doc.all()) {
        const m = el.type === 'zone' && /^구역 (\d+)$/.exec(el.name);
        if (m) n = Math.max(n, Number(m[1]));
      }
      const z = App.model.TYPES.zone.create(points, `구역 ${n + 1}`, this.color());
      App.doc.transact('영역 만들기', () => App.doc.add(z));
      App.selection.set([z.id]);
      App.ui.toast(`${z.name}: ${App.units.formatArea(App.model.TYPES.zone.area(z))}`);
    }
    /** 점이 3개 이상이면 영역을 만들고 끝냄 */
    finish() {
      const pts = this.points;
      if (!pts) return;
      this.points = null;
      if (pts.length >= 3) this.create(pts);
      else App.ui.hint('영역은 점이 3개 이상이어야 합니다.');
      App.tools.changed();
      render();
    }
    context() {
      this.finish();
    }
    cancel() {
      this.press = null;
      render();
    }
    escape() {
      if (this.press) {
        this.cancel();
        return true;
      }
      if (this.points) {
        this.points = null; // Esc는 만들지 않고 취소
        App.tools.changed();
        render();
        return true;
      }
      return false;
    }
    overlay(plan) {
      const D = App.draw;
      const p = this.press;
      if (p && p.dragging && p.end) {
        const a = p.start, b = p.end;
        D.previewZone(plan, [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], this.color());
        D.snapMarker(plan, b);
        return;
      }
      if (this.points) {
        const pts = this.cursor && !p ? [...this.points, this.cursor] : this.points;
        D.previewZone(plan, pts, this.color());
        if (pts.length === 2) D.previewLine(plan, pts[0], pts[1], null);
        this.points.forEach((q) => D.pointMarker(plan, q));
      }
      if (this.cursor && !p) D.snapMarker(plan, this.cursor);
    }
  }

  /* ── 글자 입력 칸: 도면 위 누른 자리에 바로 띄움. Enter로 확정(Shift+Enter 줄바꿈), Esc 취소 ── */
  const textEditor = {
    el: null,
    open(world, existing) {
      const el = (this.el = this.el || document.getElementById('textEditor'));
      this.world = world;
      this.existing = existing || null;
      const size = existing ? existing.size : Number(App.current.textSize);
      const s = App.plan.view.toScreen(world.x, world.y);
      el.style.left = `${s.x}px`;
      el.style.top = `${s.y}px`;
      el.style.fontSize = `${Math.max(size * App.plan.view.scale, 14)}px`;
      el.value = existing ? existing.content : '';
      el.hidden = false;
      el.rows = Math.max(1, el.value.split('\n').length);
      el.focus();
      el.select();
    },
    close(commit) {
      const el = this.el;
      if (!el || el.hidden) return;
      el.hidden = true;
      const content = el.value.replace(/\s+$/, '');
      const ex = this.existing;
      if (!commit) return;
      if (ex) {
        if (!App.doc.has(ex.id)) return;
        if (!content) App.doc.transact('메모 지우기', () => App.doc.remove(ex.id));
        else if (content !== ex.content) App.doc.transact('메모 고치기', () => App.doc.update(ex.id, { content }));
      } else if (content) {
        const t = App.model.TYPES.text.create(this.world, content, Number(App.current.textSize));
        App.doc.transact('메모 쓰기', () => App.doc.add(t));
      }
    },
    init() {
      const el = (this.el = document.getElementById('textEditor'));
      el.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          this.close(true);
        } else if (e.key === 'Escape') {
          this.close(false);
        }
      });
      el.addEventListener('input', () => { el.rows = Math.max(1, el.value.split('\n').length); });
      el.addEventListener('blur', () => this.close(true));
    },
  };

  /* ── 텍스트 도구: 누른 자리에 글자 입력 ── */
  class TextTool {
    activate() {
      this.press = null;
    }
    deactivate() {
      textEditor.close(true);
    }
    down(ev) {
      this.press = ev;
    }
    up(ev) {
      const pr = this.press;
      this.press = null;
      if (!pr || dragged(ev, pr)) return;
      const hit = App.doc.hitTest(ev.world, (ev.touch ? HIT_PX.touch : HIT_PX.mouse) / App.plan.view.scale, (el) => el.type === 'text');
      if (hit) textEditor.open({ x: App.doc.get(hit).x, y: App.doc.get(hit).y }, App.doc.get(hit));
      else textEditor.open(ev.world);
    }
    cancel() {
      this.press = null;
    }
  }

  /** 아직 만들지 않은 도구: 캔버스를 눌러도 아무 일도 하지 않음 */
  class IdleTool {}

  const REGISTRY = {
    select: () => new SelectTool(),
    wall: wallChain,
    line: () => lineChain(() => App.current.linePresetId),
    dim: dimChain,
    elec: () => new ItemTool('elec'),
    mech: () => new ItemTool('mech'),
    zone: () => new ZoneTool(),
    text: () => new TextTool(),
    room: () => new RoomTool(),
    door: () => new OpeningTool('door'),
    window: () => new OpeningTool('window'),
    column: () => new ColumnTool(),
    erase: () => new EraseTool(),
  };

  function removeElements(ids, label) {
    App.doc.transact(label, () => ids.forEach((id) => App.doc.remove(id)));
    App.selection.prune();
  }

  const tools = {
    id: null,
    current: null,
    set(id) {
      if (this.current && this.current.deactivate) this.current.deactivate();
      this.id = id;
      this.current = REGISTRY[id] ? REGISTRY[id]() : new IdleTool();
      if (this.current.activate) this.current.activate();
      this.changed();
      render();
    },
    implemented(id) {
      return id in REGISTRY;
    },
    /** 다른 파일에서 도구 추가 (가져온 도면의 축척 맞추기 등) */
    register(id, factory) {
      REGISTRY[id] = factory;
    },
    /** 도구 상태가 바뀜 (이어 그리기 시작·끝 등) */
    changed() {
      App.ui.emit('toolstate', this.current);
    },
    escape() {
      return !!(this.current && this.current.escape && this.current.escape());
    },
    finish() {
      if (this.current && this.current.finish) this.current.finish();
    },
    highlight() {
      return this.current && this.current.highlight ? this.current.highlight() : null;
    },
    overlay(plan) {
      if (this.current && this.current.overlay) this.current.overlay(plan);
    },
    onDocChange() {
      if (this.current && this.current.onDocChange) this.current.onDocChange();
    },
  };

  /* ── 버튼·단축키에서 쓰는 동작 ── */
  const actions = {
    undo() {
      if (tools.current && tools.current.cancel) tools.current.cancel();
      const entry = App.doc.undo();
      App.selection.prune();
      if (entry) App.ui.toast(`실행 취소: ${entry.label}`);
    },
    redo() {
      if (tools.current && tools.current.cancel) tools.current.cancel();
      const entry = App.doc.redo();
      App.selection.prune();
      if (entry) App.ui.toast(`다시 실행: ${entry.label}`);
    },
    /** 고른 것을 90도씩 돌림 (Q) */
    rotateSelection() {
      return App.edit.rotate();
    },
    /** 고른 것들을 한 묶음으로: 하나를 누르면 다 같이 골라지고 함께 움직임 (Ctrl+G) */
    groupSelection() {
      const ids = App.selection.list().filter((id) => App.doc.has(id));
      if (ids.length < 2) {
        App.ui.toast('묶으려면 두 개 이상 고르세요.');
        return false;
      }
      const group = `grp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      App.doc.transact('묶기', () => ids.forEach((id) => App.doc.update(id, { group })));
      App.ui.toast(`${ids.length}개를 묶었습니다. 하나만 눌러도 함께 골라지고 함께 움직입니다.`);
      return true;
    },
    /** 고른 것의 묶음을 풂 (Ctrl+Shift+G) */
    ungroupSelection() {
      const els = App.selection.list().map((id) => App.doc.get(id)).filter((e) => e && e.group);
      if (!els.length) {
        App.ui.toast('고른 것 중에 묶음이 없습니다.');
        return false;
      }
      App.doc.transact('묶음 풀기', () => els.forEach((e) => App.doc.update(e.id, { group: null })));
      App.ui.toast('묶음을 풀었습니다. 이제 하나씩 고를 수 있습니다.');
      return true;
    },
    /** 선택한 항목 삭제. 지운 개수를 돌려줌 */
    deleteSelection() {
      const all = App.selection.list().filter((id) => App.doc.has(id));
      const ids = all.filter((id) => !isLocked(id));
      if (!ids.length) {
        if (all.length) App.ui.toast('잠긴 항목은 지우지 않습니다. 속성에서 잠금을 풀고 지우세요.');
        return 0;
      }
      removeElements(ids, '삭제');
      App.selection.clear();
      App.ui.toast(`${ids.length}개 항목을 지웠습니다.${all.length > ids.length ? ` 잠긴 ${all.length - ids.length}개는 남겼습니다.` : ''}`);
      return ids.length;
    },
  };

  App.Selection = Selection;
  App.tools = tools;
  App.actions = actions;
  App.withGroups = withGroups;
  App.locateOnWall = locateOnWall;
  App.textEditor = textEditor;
})();
