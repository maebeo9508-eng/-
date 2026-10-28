/* 화면 이동·확대.
   PC: 마우스 휠 확대·축소, 스페이스+드래그 또는 가운데 버튼 드래그로 이동
   모바일: 두 손가락 핀치 확대·축소와 이동을 동시에. 한 손가락은 그리기 도구용으로 남겨 둠 */
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
      this.spaceDown = false;
      this.touchLocked = false;  // 핀치 뒤 남은 손가락이 그리기로 이어지지 않게
      this.hoverListeners = [];

      const el = this.el;
      el.addEventListener('pointerdown', (e) => this.down(e));
      el.addEventListener('pointermove', (e) => this.move(e));
      el.addEventListener('pointerup', (e) => this.up(e));
      el.addEventListener('pointercancel', (e) => this.up(e));
      el.addEventListener('pointerleave', (e) => {
        if (e.pointerType !== 'touch' && !this.pointers.size) this.emitHover(null);
      });
      el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('keydown', (e) => this.key(e, true));
      window.addEventListener('keyup', (e) => this.key(e, false));
      window.addEventListener('blur', () => this.reset());
    }

    local(e) {
      const r = this.el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    down(e) {
      const p = this.local(e);
      this.pointers.set(e.pointerId, p);
      try { this.el.setPointerCapture(e.pointerId); } catch (_) { /* 이미 끝난 포인터 */ }

      if (e.pointerType === 'touch') {
        if (this.pointers.size === 2) this.startPinch();
        return;
      }
      if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
        e.preventDefault();
        this.gesture = { type: 'pan', x: p.x, y: p.y };
        this.updateCursor();
      }
    }

    move(e) {
      const p = this.local(e);
      if (e.pointerType !== 'touch') this.emitHover(p);
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, p);

      const g = this.gesture;
      if (g && g.type === 'pan') {
        this.plan.view.panBy(p.x - g.x, p.y - g.y);
        g.x = p.x;
        g.y = p.y;
        this.plan.requestRender();
      } else if (g && g.type === 'pinch') {
        this.updatePinch();
      }
    }

    up(e) {
      if (!this.pointers.delete(e.pointerId)) return;
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
    }

    key(e, isDown) {
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
