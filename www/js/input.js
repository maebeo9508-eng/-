/* 화면 이동·확대와 도구 입력 나누기.
   PC: 마우스 휠 확대·축소, 스페이스+드래그 또는 가운데 버튼 드래그로 이동, 왼쪽 버튼은 도구
   모바일: 두 손가락 핀치 확대·축소와 이동을 동시에, 한 손가락은 도구 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const isTyping = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  class ViewNavigator {
    constructor(plan) {
      this.plan = plan;
      this.el = plan.canvas;
      this.pointers = new Map(); // pointerId → 캔버스 기준 위치
      this.gesture = null;       // { type: 'pan' | 'pinch', ... }
      this.toolPointer = null;   // 도구가 쓰고 있는 포인터
      this.spaceDown = false;
      this.touchLocked = false;  // 핀치 뒤 남은 손가락이 도구로 이어지지 않게
      this.lastMouse = null;     // Shift 누름·휠 확대 뒤 도구 미리보기 갱신용 { e, p }
      this.hoverListeners = [];

      const el = this.el;
      el.addEventListener('pointerdown', (e) => this.down(e));
      el.addEventListener('pointermove', (e) => this.move(e));
      el.addEventListener('pointerup', (e) => this.up(e));
      el.addEventListener('pointercancel', (e) => this.up(e));
      el.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'touch' || this.pointers.size) return;
        this.lastMouse = null;
        this.emitHover(null);
        this.tool('hover', null);
      });
      el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
      // 빠르게 그은 뒤 바로 누른 도구 버튼이 무시되지 않게 브라우저 자체 제스처(관성 스크롤)를 막음
      el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('keydown', (e) => this.key(e, true));
      window.addEventListener('keyup', (e) => this.key(e, false));
      window.addEventListener('blur', () => this.reset());
    }

    local(e) {
      const r = this.el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    /** 도구에 넘길 이벤트 */
    toolEvent(e, p, shift = e.shiftKey) {
      return {
        x: p.x,
        y: p.y,
        world: this.plan.view.toWorld(p.x, p.y),
        shift,
        alt: e.altKey,
        ctrl: e.ctrlKey || e.metaKey,
        touch: e.pointerType === 'touch',
      };
    }

    tool(method, e, p, shift) {
      const t = App.tools && App.tools.current;
      if (!t || !t[method]) return;
      t[method](e ? this.toolEvent(e, p, shift) : null);
    }

    down(e) {
      const p = this.local(e);
      this.pointers.set(e.pointerId, p);
      try { this.el.setPointerCapture(e.pointerId); } catch (_) { /* 이미 끝난 포인터 */ }

      if (e.pointerType === 'touch') {
        if (this.pointers.size === 1 && !this.touchLocked) {
          this.toolPointer = e.pointerId;
          this.tool('down', e, p);
        } else if (this.pointers.size === 2) {
          if (this.toolPointer !== null) {
            this.toolPointer = null;
            this.tool('cancel'); // 두 번째 손가락: 그리던 것은 취소하고 핀치로
          }
          this.startPinch();
        }
        return;
      }
      if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
        e.preventDefault();
        this.gesture = { type: 'pan', x: p.x, y: p.y };
        this.updateCursor();
      } else if (e.button === 0) {
        this.toolPointer = e.pointerId;
        this.tool('down', e, p);
      } else if (e.button === 2) {
        this.tool('context', e, p);
      }
    }

    move(e) {
      const p = this.local(e);
      if (e.pointerType !== 'touch') {
        this.lastMouse = { e, p };
        this.emitHover(p);
      }
      if (!this.pointers.has(e.pointerId)) {
        if (e.pointerType !== 'touch' && !this.gesture) this.tool('hover', e, p);
        return;
      }
      this.pointers.set(e.pointerId, p);

      const g = this.gesture;
      if (g && g.type === 'pan') {
        this.plan.view.panBy(p.x - g.x, p.y - g.y);
        g.x = p.x;
        g.y = p.y;
        this.plan.requestRender();
      } else if (g && g.type === 'pinch') {
        this.updatePinch();
      } else if (e.pointerId === this.toolPointer) {
        this.tool('move', e, p);
      }
    }

    up(e) {
      if (!this.pointers.has(e.pointerId)) return;
      const p = this.local(e);
      this.pointers.delete(e.pointerId);
      if (e.pointerId === this.toolPointer) {
        this.toolPointer = null;
        if (e.type === 'pointercancel') this.tool('cancel');
        else this.tool('up', e, p);
      }
      const g = this.gesture;
      if (g && g.type === 'pinch') {
        if (this.pointers.size >= 2) {
          this.startPinch(); // 세 손가락 중 하나를 뗀 경우: 남은 두 손가락으로 이어서
        } else {
          this.gesture = null;
          this.touchLocked = this.pointers.size > 0;
        }
      } else if (g && g.type === 'pan') {
        this.gesture = null;
      }
      if (!this.pointers.size) this.touchLocked = false;
      this.updateCursor();
    }

    pair() {
      const it = this.pointers.values();
      const a = it.next().value, b = it.next().value;
      return {
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      };
    }

    startPinch() {
      const { mid, dist } = this.pair();
      const view = this.plan.view;
      this.gesture = { type: 'pinch', dist, scale: view.scale, anchor: view.toWorld(mid.x, mid.y) };
    }

    /** 처음 두 손가락 가운데 있던 도면 점이 지금 두 손가락 가운데로 오게: 확대와 이동이 함께 됨 */
    updatePinch() {
      const g = this.gesture;
      const { mid, dist } = this.pair();
      this.plan.view.place(g.anchor, mid, (g.scale * dist) / g.dist);
      this.plan.requestRender();
    }

    wheel(e) {
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;                     // 줄 단위
      else if (e.deltaMode === 2) dy *= this.plan.height;  // 페이지 단위
      dy = Math.max(-300, Math.min(300, dy));
      const p = this.local(e);
      // 노트북 터치패드 핀치는 ctrlKey가 붙은 작은 값으로 들어옴
      this.plan.view.zoomAt(p.x, p.y, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)));
      this.plan.requestRender();
      this.emitHover(p);
      this.refreshTool(e.shiftKey);
    }

    /** 마우스가 가만히 있어도 Shift나 배율이 바뀌면 도구 미리보기를 다시 계산 */
    refreshTool(shift) {
      const m = this.lastMouse;
      if (!m || this.gesture) return;
      if (this.toolPointer !== null) this.tool('move', m.e, m.p, shift);
      else this.tool('hover', m.e, m.p, shift);
    }

    key(e, isDown) {
      if (e.key === 'Shift') {
        this.refreshTool(isDown);
        return;
      }
      if (e.code !== 'Space' || isTyping(e.target)) return;
      e.preventDefault(); // 페이지 스크롤, 버튼 눌림 방지
      if (this.spaceDown === isDown) return;
      this.spaceDown = isDown;
      this.updateCursor();
    }

    updateCursor() {
      this.el.classList.toggle('is-grab', this.spaceDown);
      this.el.classList.toggle('is-panning', !!this.gesture && this.gesture.type === 'pan');
    }

    reset() {
      if (this.toolPointer !== null) this.tool('cancel');
      this.toolPointer = null;
      this.spaceDown = false;
      this.gesture = null;
      this.pointers.clear();
      this.touchLocked = false;
      this.updateCursor();
    }

    /** 마우스가 가리키는 도면 좌표(mm). 캔버스를 벗어나면 null */
    onHover(fn) {
      this.hoverListeners.push(fn);
    }

    emitHover(p) {
      const w = p ? this.plan.view.toWorld(p.x, p.y) : null;
      for (const fn of this.hoverListeners) fn(w);
    }
  }

  App.ViewNavigator = ViewNavigator;
})();
