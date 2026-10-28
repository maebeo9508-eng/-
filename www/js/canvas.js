/* 도면 캔버스: 보기 변환(mm ↔ 화면 px), 화면 맞춤, 격자 그리기.
   내부 좌표는 항상 mm. 화면 px = mm × scale + (ox, oy) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const MIN_SCALE = 0.002; // px/mm. 화면 1000px에 500m
  const MAX_SCALE = 4;     // px/mm. 1mm가 4px
  const GRID_MIN_PX = 6;   // 격자선 간격이 이보다 좁으면 10배 넓혀서 그림
  const GRID_FADE_PX = 14; // 가는 격자선이 완전히 진해지기까지의 간격 폭

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  // 선 두께가 홀수 픽셀이면 0.5px 어긋나게 해야 흐려지지 않음
  const crisp = (v, lw) => (lw % 2 ? Math.floor(v) + 0.5 : Math.round(v));

  class View {
    constructor() {
      this.scale = 0.1;
      this.ox = 0;
      this.oy = 0;
    }
    toScreen(x, y) {
      return { x: x * this.scale + this.ox, y: y * this.scale + this.oy };
    }
    toWorld(sx, sy) {
      return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale };
    }
    /** 도면 점 world가 화면 점 screen에 오도록 배율과 위치를 정함 */
    place(world, screen, scale) {
      this.scale = clamp(scale, MIN_SCALE, MAX_SCALE);
      this.ox = screen.x - world.x * this.scale;
      this.oy = screen.y - world.y * this.scale;
    }
    /** 화면 점 (sx, sy)를 고정한 채 확대·축소 */
    zoomAt(sx, sy, factor) {
      this.place(this.toWorld(sx, sy), { x: sx, y: sy }, this.scale * factor);
    }
    panBy(dx, dy) {
      this.ox += dx;
      this.oy += dy;
    }
    /** 도면 범위 rect(mm)가 화면 영역 box(px) 안에 들어오게 맞춤 */
    fitRect(rect, box) {
      const rw = Math.max(rect.maxX - rect.minX, 1);
      const rh = Math.max(rect.maxY - rect.minY, 1);
      const scale = Math.min(box.width / rw, box.height / rh);
      this.place(
        { x: rect.minX + rw / 2, y: rect.minY + rh / 2 },
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        scale
      );
    }
    /** 화면에 보이는 도면 범위(mm). 보이는 요소만 그릴 때 사용 */
    worldRect(width, height) {
      const a = this.toWorld(0, 0);
      const b = this.toWorld(width, height);
      return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
    }
  }

  class PlanCanvas {
    constructor(canvas, host) {
      this.canvas = canvas;
      this.host = host;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.view = new View();
      this.width = 0;  // CSS px
      this.height = 0;
      this.dpr = 1;
      this.colors = {};
      // 캔버스 위를 덮는 UI(모바일 서랍 등). 화면 맞춤 때 이 부분을 피함
      this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
      this._raf = 0;
      this._renderHooks = [];

      this.readTheme();
      this.resize();
      if ('ResizeObserver' in window) new ResizeObserver(() => this.resize()).observe(host);
      window.addEventListener('resize', () => this.resize()); // 기기 배율(dpr) 변화 포함
    }

    /** 다시 그릴 때마다 호출 (축척 막대 등 화면 표시 갱신용) */
    onRender(fn) {
      this._renderHooks.push(fn);
    }

    /** CSS 테마 색을 읽어 옴. 테마를 바꾼 뒤 다시 호출 */
    readTheme() {
      const cs = getComputedStyle(document.documentElement);
      const v = (name) => cs.getPropertyValue(name).trim();
      this.colors = {
        bg: v('--canvas-bg'),
        gridMinor: v('--grid-minor'),
        gridMajor: v('--grid-major'),
        axis: v('--axis'),
      };
      this.requestRender();
    }

    resize() {
      const w = Math.max(1, Math.round(this.host.clientWidth));
      const h = Math.max(1, Math.round(this.host.clientHeight));
      const dpr = window.devicePixelRatio || 1;
      if (w === this.width && h === this.height && dpr === this.dpr) return;
      // 화면 크기가 바뀌어도 가운데 보이던 곳은 그대로 가운데에
      if (this.width) this.view.panBy((w - this.width) / 2, (h - this.height) / 2);
      this.width = w;
      this.height = h;
      this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.render(); // 크기를 바꾸면 캔버스가 지워지므로 바로 다시 그림
    }

    requestRender() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this.render();
      });
    }

    /** 그린 요소 전체 범위(mm). 요소는 2단계부터 생김 */
    contentBounds() {
      return null;
    }

    /** 도면 전체가 한 화면에 들어오게. 그린 것이 없으면 기본 범위 */
    fitToContent() {
      const rect = this.contentBounds() || App.DEFAULT_VIEW_RECT;
      const i = this.insets;
      const pad = Math.min(48, Math.min(this.width, this.height) * 0.08);
      this.view.fitRect(rect, {
        x: i.left + pad,
        y: i.top + pad,
        width: Math.max(1, this.width - i.left - i.right - pad * 2),
        height: Math.max(1, this.height - i.top - i.bottom - pad * 2),
      });
      this.requestRender();
    }

    render() {
      if (this._raf) {
        cancelAnimationFrame(this._raf);
        this._raf = 0;
      }
      const { ctx, canvas } = this;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = this.colors.bg || '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (App.settings.showGrid) this.drawGrid();
      this.drawAxes();
      for (const fn of this._renderHooks) fn(this);
    }

    /** 지금 배율에서 그릴 격자 간격(mm). 너무 촘촘하면 10배씩 넓힌다. 스냅 간격은 설정값 그대로 */
    gridStep() {
      let step = App.settings.gridSize;
      while (step * this.view.scale < GRID_MIN_PX) step *= 10;
      return step;
    }

    drawGrid() {
      const step = this.gridStep();
      const fade = clamp((step * this.view.scale - GRID_MIN_PX) / GRID_FADE_PX, 0, 1);
      const thin = 1;
      const thick = Math.max(1, Math.round(this.dpr * 0.75));
      if (fade > 0) this.strokeGridLines(step, 10, thin, this.colors.gridMinor, fade);
      this.strokeGridLines(step * 10, 0, thick, this.colors.gridMajor, 1);
    }

    /** step 간격의 가로·세로 선. skipEvery번째 선은 굵은 선과 겹치므로 건너뜀 */
    strokeGridLines(step, skipEvery, lw, color, alpha) {
      const { ctx, view, dpr } = this;
      const r = view.worldRect(this.width, this.height);
      const W = this.canvas.width, H = this.canvas.height;
      ctx.beginPath();
      for (let i = Math.ceil(r.minX / step), end = Math.floor(r.maxX / step); i <= end; i++) {
        if (skipEvery && i % skipEvery === 0) continue;
        const x = crisp((i * step * view.scale + view.ox) * dpr, lw);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
      }
      for (let i = Math.ceil(r.minY / step), end = Math.floor(r.maxY / step); i <= end; i++) {
        if (skipEvery && i % skipEvery === 0) continue;
        const y = crisp((i * step * view.scale + view.oy) * dpr, lw);
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.globalAlpha = alpha;
      ctx.lineWidth = lw;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    /** 원점(0, 0)을 지나는 기준선 */
    drawAxes() {
      const { ctx, view, dpr } = this;
      const lw = Math.max(1, Math.round(dpr));
      const x = crisp(view.ox * dpr, lw);
      const y = crisp(view.oy * dpr, lw);
      ctx.beginPath();
      if (x >= 0 && x <= this.canvas.width) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.canvas.height);
      }
      if (y >= 0 && y <= this.canvas.height) {
        ctx.moveTo(0, y);
        ctx.lineTo(this.canvas.width, y);
      }
      ctx.lineWidth = lw;
      ctx.strokeStyle = this.colors.axis;
      ctx.stroke();
    }
  }

  App.View = View;
  App.PlanCanvas = PlanCanvas;
})();
