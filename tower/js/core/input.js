'use strict';
// 터치 가상 조이스틱 + 키보드 입력.
// 화면 아무 곳이나 누르면 그 자리에 조이스틱이 생깁니다 (버튼은 DOM 위에 있어 따로 처리).
G.Input = {
  mx: 0,
  my: 0,
  joy: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 },
  keys: {},
  radius: 52,
  onKey: null,

  init(canvas) {
    const j = this.joy;
    canvas.addEventListener('pointerdown', (e) => {
      G.Sfx.init();
      if (j.active) return;
      j.active = true;
      j.id = e.pointerId;
      j.ox = j.x = e.clientX;
      j.oy = j.y = e.clientY;
      e.preventDefault();
    });
    window.addEventListener('pointermove', (e) => {
      if (!j.active || e.pointerId !== j.id) return;
      j.x = e.clientX;
      j.y = e.clientY;
      // 손가락이 멀리 가면 조이스틱 중심이 따라옵니다
      const dx = j.x - j.ox, dy = j.y - j.oy;
      const d = Math.hypot(dx, dy);
      const max = this.radius * 1.6;
      if (d > max) {
        j.ox = j.x - (dx / d) * max;
        j.oy = j.y - (dy / d) * max;
      }
    });
    const end = (e) => {
      if (e.pointerId !== j.id) return;
      j.active = false;
      j.id = null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    window.addEventListener('keydown', (e) => {
      G.Sfx.init();
      this.keys[e.code] = true;
      if (this.onKey && !e.repeat) this.onKey(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; j.active = false; });
  },

  reset() {
    this.joy.active = false;
    this.joy.id = null;
    this.mx = this.my = 0;
  },

  update() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.KeyA || k.ArrowLeft) x -= 1;
    if (k.KeyD || k.ArrowRight) x += 1;
    if (k.KeyW || k.ArrowUp) y -= 1;
    if (k.KeyS || k.ArrowDown) y += 1;
    const j = this.joy;
    if (j.active) {
      const dx = j.x - j.ox, dy = j.y - j.oy;
      const d = Math.hypot(dx, dy);
      if (d > 6) {
        const m = Math.min(1, d / this.radius);
        x = (dx / d) * m;
        y = (dy / d) * m;
      }
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.mx = x;
    this.my = y;
  },
};
