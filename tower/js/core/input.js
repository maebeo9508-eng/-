'use strict';
// 입력: 터치 가상 조이스틱 · 공격 버튼(누르고 있는 동안) · 키보드 · 마우스 조준
//  - 휴대폰: 화면을 누른 자리에 조이스틱이 생겨요. 공격·대시·스킬 버튼은 DOM 위에 있어 따로 처리
//  - PC: WASD/방향키 이동, 마우스 왼쪽 버튼(또는 J·K) 공격, 마우스 쪽을 조준
G.Input = {
  mx: 0,
  my: 0,
  joy: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 },
  keys: {},
  radius: 52,
  onKey: null,
  attackBtn: false, // HUD 공격 버튼
  mouse: { x: 0, y: 0, down: false, last: -99 },
  mouseAim: false,
  attack: false,

  init(canvas) {
    const j = this.joy, m = this.mouse;
    canvas.addEventListener('pointerdown', (e) => {
      G.Sfx.init();
      if (e.pointerType === 'mouse') {
        if (e.button === 0) m.down = true;
        if (e.button === 2) G.Player.dash();
        m.x = e.clientX; m.y = e.clientY; m.last = performance.now();
        e.preventDefault();
        return;
      }
      if (j.active) return;
      j.active = true;
      j.id = e.pointerId;
      j.ox = j.x = e.clientX;
      j.oy = j.y = e.clientY;
      e.preventDefault();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { m.x = e.clientX; m.y = e.clientY; m.last = performance.now(); }
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
      if (e.pointerType === 'mouse' && e.button === 0) m.down = false;
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
    window.addEventListener('blur', () => { this.keys = {}; j.active = false; m.down = false; this.attackBtn = false; });
  },

  reset() {
    this.joy.active = false;
    this.joy.id = null;
    this.mx = this.my = 0;
    this.attackBtn = false;
    this.mouse.down = false;
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
    // 마우스를 최근 3초 안에 움직였으면 마우스 쪽을 조준
    this.mouseAim = performance.now() - this.mouse.last < 3000;
    this.attack = this.attackBtn || this.mouse.down || !!(k.KeyJ || k.KeyK);
  },
};
