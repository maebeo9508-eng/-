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
  const LIVE_ROOM_SYNC_MAX_WALLS = 400;       // 이보다 벽이 많으면 끄는 동안 방 경계를 다시 계산하지 않음

  const render = () => App.plan.requestRender();
  const screenDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const dragged = (ev, from) => screenDist(ev, from) >= (ev.touch ? DRAG_PX.touch : DRAG_PX.mouse);
  const hitAt = (ev) => App.doc.hitTest(ev.world, (ev.touch ? HIT_PX.touch : HIT_PX.mouse) / App.plan.view.scale);

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
      if (this.ids.has(id)) this.ids.delete(id);
      else this.ids.add(id);
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
    /** 벽 하나만 골랐을 때 그 벽의 양 끝 손잡이 */
    handleAt(ev) {
      if (App.selection.size !== 1) return null;
      const w = App.doc.get(App.selection.list()[0]);
      if (!w || w.type !== 'wall') return null;
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
        if (p.handle) this.startStretch(p);
        else if (p.hit) this.startMove(p);
        else p.mode = 'box';
      }
      if (p.mode === 'move') this.updateMove(p, ev);
      else if (p.mode === 'stretch') this.updateStretch(p, ev);
      else p.cur = ev;
      render();
    }
    up(ev) {
      const p = this.press;
      this.press = null;
      if (!p) return;
      const sel = App.selection;
      if (!p.mode) {
        if (p.handle) { /* 손잡이를 누르기만 함: 선택 그대로 */ }
        else if (p.hit) ev.shift ? sel.toggle(p.hit) : sel.set([p.hit]);
        else if (!ev.shift) sel.clear();
      } else if (p.mode === 'move' || p.mode === 'stretch') {
        App.doc.commit();
      } else if (p.mode === 'box') {
        const crossing = ev.x < p.ev.x; // 오른쪽에서 왼쪽으로 끌면 걸친 것도 선택
        const ids = App.doc.inRect(G.rectFromPoints(p.ev.world, ev.world), crossing);
        p.ev.shift || ev.shift ? sel.add(ids) : sel.set(ids);
      }
      if (!ev.touch) this.hover(ev);
      render();
    }

    startMove(p) {
      const sel = App.selection;
      if (!sel.has(p.hit)) sel.set([p.hit]);
      p.mode = 'move';
      // 방을 옮기면 그 방을 둘러싼 벽도 함께
      const ids = new Set(sel.list());
      sel.list().forEach((id) => {
        const el = App.doc.get(id);
        if (el && el.type === 'room') el.wallIds.forEach((w) => App.doc.has(w) && ids.add(w));
      });
      p.ids = [...ids];
      p.orig = new Map(p.ids.map((id) => [id, App.model.clone(App.doc.get(id))]));
      // '늘리기': 옮기는 벽에 붙은 다른 벽의 끝도 같이 움직여 모서리가 떨어지지 않게
      p.attached = App.settings.stretchWalls ? attachedEnds([...p.orig.values()].filter((e) => e.type === 'wall'), new Set(p.ids)) : [];
      p.exclude = new Set([...p.ids, ...p.attached.map((a) => a.id)]);
      p.points = [];
      p.orig.forEach((el) => {
        const t = App.model.TYPES[el.type];
        if (t && t.snapPoints) t.snapPoints(el).forEach((q) => q.kind === 'end' && p.points.push(q));
      });
      App.doc.begin('이동');
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
      const mx = lockX ? 0 : s.dx, my = lockY ? 0 : s.dy;
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
          if (el.type !== 'wall' || el.id === w.id) continue;
          ['start', 'end'].forEach((end) => G.samePoint(el[end], from, 1) && p.followers.push({ id: el.id, end }));
        }
      }
      p.exclude = new Set([w.id, ...p.followers.map((f) => f.id)]);
      App.doc.begin('벽 늘이기');
    }
    updateStretch(p, ev) {
      const target = App.snap.point(ev.world, {
        from: p.fixed,
        ortho: App.settings.ortho !== !!ev.shift,
        touch: ev.touch,
        exclude: p.exclude,
      });
      if (G.samePoint(target, p.fixed, 1)) return; // 길이 0은 막음
      p.target = target;
      p.lastEv = ev;
      const pt = { x: target.x, y: target.y };
      App.doc.update(p.handle.id, { [p.handle.end]: pt });
      p.followers.forEach((f) => App.doc.update(f.id, { [f.end]: pt }));
      syncRoomsLive();
    }

    cancel() {
      if (this.press && (this.press.mode === 'move' || this.press.mode === 'stretch')) App.doc.rollback();
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
      return this.hoverId && !this.press ? { ids: new Set([this.hoverId]), color: 'accent' } : null;
    }
    overlay(plan) {
      const p = this.press;
      if (!p) return;
      if (p.mode === 'box' && p.cur) App.draw.selectionBox(plan, p.ev, p.cur, p.cur.x < p.ev.x);
      if (p.mode === 'move' && p.snap && p.snap.kind === 'end') App.draw.snapMarker(plan, { ...p.snap.at, kind: 'end' });
      if (p.mode === 'stretch' && p.target) {
        App.draw.snapMarker(plan, p.target);
        App.draw.lengthTag(plan, p.fixed, p.target, p.lastEv && p.lastEv.touch);
      }
    }
  }

  /** 옮기는 벽 위(끝이나 중간)에 닿아 있는, 옮기지 않는 벽의 끝 */
  function attachedEnds(movingWalls, movingIds) {
    const found = [];
    for (const el of App.doc.all()) {
      if (el.type !== 'wall' || movingIds.has(el.id)) continue;
      ['start', 'end'].forEach((end) => {
        const pt = el[end];
        if (movingWalls.some((m) => G.closestOnSegment(pt, m.start, m.end).dist < 1)) found.push({ id: el.id, end, x: pt.x, y: pt.y });
      });
    }
    return found;
  }

  /** 끄는 동안에도 방 경계를 따라 맞춤 (도면이 크면 손을 뗄 때만) */
  function syncRoomsLive() {
    let walls = 0;
    for (const el of App.doc.all()) if (el.type === 'wall' && ++walls > LIVE_ROOM_SYNC_MAX_WALLS) return;
    if (App.doc.tx) App.rooms.syncRooms(App.doc.tx);
  }

  /* ── 벽 도구 ──
     끌기: 누른 곳에서 뗀 곳까지 벽 하나. 누르기(클릭·탭): 점을 차례로 찍어 이어 그리기.
     끝내기: 같은 점을 다시 누르기, 더블클릭, 시작점에 닫기, Esc·Enter·오른쪽 클릭, '그리기 끝내기' 버튼 */
  class WallTool {
    activate() {
      this.chain = null; // { points: [시작점, ...], walls: [벽 id, ...] }
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
      this.chain = { points: [{ x: point.x, y: point.y }], walls: [] };
      App.tools.changed();
    }
    addSegment(end) {
      const ch = this.chain;
      const a = this.last();
      if (G.samePoint(a, end)) return;
      const wall = App.model.TYPES.wall.create(a, end);
      App.doc.transact('벽 그리기', () => App.doc.add(wall));
      ch.points.push({ x: end.x, y: end.y });
      ch.walls.push(wall.id);
      if (ch.walls.length >= 2 && G.samePoint(end, ch.points[0])) this.finish(); // 닫히면 끝
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
    /** 실행 취소로 마지막 벽이 없어지면 그 앞 점부터 이어 그림 */
    onDocChange() {
      const ch = this.chain;
      if (!ch || !ch.walls.length) return;
      let popped = false;
      while (ch.walls.length && !App.doc.has(ch.walls[ch.walls.length - 1])) {
        ch.walls.pop();
        ch.points.pop();
        popped = true;
      }
      if (popped && !ch.walls.length) this.finish();
    }
    overlay(plan) {
      const D = App.draw;
      const thickness = App.settings.wallThickness;
      const p = this.press;
      if (p && p.dragging && p.end) {
        D.previewWall(plan, p.start, p.end, thickness);
        D.snapMarker(plan, p.end);
        D.lengthTag(plan, p.start, p.end, p.lastEv && p.lastEv.touch);
        return;
      }
      if (this.chain) {
        const last = this.last();
        if (this.cursor && !p) {
          D.previewWall(plan, last, this.cursor, thickness);
          D.lengthTag(plan, last, this.cursor, false);
        }
        D.pointMarker(plan, last);
      }
      if (this.cursor && !p) D.snapMarker(plan, this.cursor);
    }
  }

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
      if (heights.size === 1) created.wallHeight = created.ceilingHeight = [...heights][0];
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

  /** 아직 만들지 않은 도구: 캔버스를 눌러도 아무 일도 하지 않음 */
  class IdleTool {}

  const REGISTRY = { select: SelectTool, wall: WallTool, room: RoomTool, erase: EraseTool };

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
      this.current = new (REGISTRY[id] || IdleTool)();
      if (this.current.activate) this.current.activate();
      this.changed();
      render();
    },
    implemented(id) {
      return id in REGISTRY;
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
    /** 선택한 항목 삭제. 지운 개수를 돌려줌 */
    deleteSelection() {
      const ids = App.selection.list().filter((id) => App.doc.has(id));
      if (!ids.length) return 0;
      removeElements(ids, '삭제');
      App.selection.clear();
      App.ui.toast(`${ids.length}개 항목을 지웠습니다.`);
      return ids.length;
    },
  };

  App.Selection = Selection;
  App.tools = tools;
  App.actions = actions;
})();
