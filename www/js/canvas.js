/* 도면 캔버스: 보기 변환(mm ↔ 화면 px), 화면 맞춤, 격자 그리기.
   내부 좌표는 항상 mm. 화면 px = mm × scale + (ox, oy) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const MIN_SCALE = 0.002; // px/mm. 화면 1000px에 500m
  const MAX_SCALE = 4;     // px/mm. 1mm가 4px
  const GRID_MIN_PX = 6;   // 격자선 간격이 이보다 좁으면 10배 넓혀서 그림
  const GRID_FADE_PX = 14; // 가는 격자선이 완전히 진해지기까지의 간격 폭
  const RULER_PX = 20;     // 눈금자 두께
  const RULER_MAJOR_PX = 64; // 숫자를 적는 큰 눈금 사이가 이보다 넓게

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
      this._layers = [];      // 격자 위에 그릴 것들 (도면 요소, 도구 미리보기)
      this._renderHooks = [];

      this.readTheme();
      this.resize();
      if ('ResizeObserver' in window) new ResizeObserver(() => this.resize()).observe(host);
      window.addEventListener('resize', () => this.resize()); // 기기 배율(dpr) 변화 포함
    }

    /** 격자 위에 차례로 그릴 함수 추가 */
    addLayer(fn) {
      this._layers.push(fn);
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
        canvasBg: v('--canvas-bg'),
        gridMinor: v('--grid-minor'),
        gridMajor: v('--grid-major'),
        axis: v('--axis'),
        wall: v('--wall'),
        label: v('--label'),
        accent: v('--accent'),
        accentFg: v('--accent-fg'),
        snap: v('--snap'),
        selWindow: v('--sel-window'),
        selCross: v('--sel-cross'),
        danger: v('--danger'),
        roomFill: v('--room-fill'),
        layerBoard: v('--layer-board'),
        layerWood: v('--layer-wood'),
        layerWoodStud: v('--layer-wood-stud'),
        layerMetal: v('--layer-metal'),
        layerMetalStud: v('--layer-metal-stud'),
        layerConcrete: v('--layer-concrete'),
        layerHatch: v('--layer-hatch'),
        layerLine: v('--layer-line'),
        glass: v('--glass'),
        elec: v('--elec'),
        mech: v('--mech'),
        furn: v('--furn'),
        dim: v('--dim'),
        note: v('--note'),
        underlay: v('--underlay'),
        fg: v('--fg'),
        surface: v('--surface'),
        line: v('--line'),
        muted: v('--fg-muted'),
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

    /** 그린 요소 전체 범위(mm). 비어 있으면 null */
    contentBounds() {
      return App.doc ? App.doc.bounds() : null;
    }

    /** 도면 전체(또는 준 범위)가 한 화면에 들어오게. 그린 것이 없으면 기본 범위 */
    fitToContent(rect = this.contentBounds() || App.DEFAULT_VIEW_RECT) {
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
      ctx.fillStyle = this.colors.canvasBg || '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (App.settings.showGrid) this.drawGrid();
      this.drawAxes();
      for (const fn of this._layers) {
        ctx.save();
        fn(this);
        ctx.restore();
      }
      if (this.rulerSize) this.drawRulers();
      for (const fn of this._renderHooks) fn(this);
    }

    /** 눈금자 두께(px). 설정에서 끄면 0 */
    get rulerSize() {
      return App.settings.showRulers ? RULER_PX : 0;
    }

    /** 위·왼쪽 눈금자: 설정 길이 단위로 큰 눈금마다 숫자. 확대·축소에 따라 1·2·5 간격으로 바뀜.
        rulerHover(도면 좌표)가 있으면 그 자리를 표시 (PC 마우스 위치) */
    drawRulers() {
      const { ctx, view, dpr, colors } = this;
      const W = this.width, H = this.height, R = RULER_PX;
      const f = App.units.lengthFactor(); // 단위 하나가 몇 mm
      const ppu = view.scale * f; // 단위 하나가 몇 px
      const raw = RULER_MAJOR_PX / ppu;
      const pow = 10 ** Math.floor(Math.log10(raw));
      const n = raw / pow;
      const major = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
      const minor = [10, 5, 2].map((d) => major / d).find((m) => m * ppu >= 6) || major;
      const digits = Math.max(0, Math.ceil(-Math.log10(major) - 1e-9));
      const label = (v) => (Math.abs(v) < major / 1e6 ? 0 : v).toLocaleString('ko-KR', { maximumFractionDigits: digits });
      const isMul = (v, m) => Math.abs(v / m - Math.round(v / m)) < 1e-6;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = colors.surface;
      ctx.fillRect(0, 0, W, R);
      ctx.fillRect(0, 0, R, H);
      ctx.fillStyle = colors.muted;
      ctx.strokeStyle = colors.muted;
      ctx.font = '10px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 1;
      // 한 축의 눈금: from~to px 구간, toPx(값) → px, tick(px, 길이), text(px, 글자)
      const axis = (fromPx, toPx, world0, world1, toScreen, tick, text) => {
        const a = Math.min(world0, world1) / f, b = Math.max(world0, world1) / f;
        ctx.beginPath();
        for (let i = Math.ceil(a / minor); i * minor <= b; i++) {
          const v = i * minor;
          const p = Math.round(toScreen(v * f)) + 0.5;
          if (p < fromPx || p > toPx) continue;
          const big = isMul(v, major);
          tick(p, big ? R : isMul(v, major / 2) ? R * 0.45 : R * 0.25);
          if (big) text(p, label(v));
        }
        ctx.stroke();
      };
      axis(R, W, view.toWorld(R, 0).x, view.toWorld(W, 0).x, (x) => x * view.scale + view.ox,
        (p, len) => { ctx.moveTo(p, R); ctx.lineTo(p, R - len); },
        (p, t) => { if (p + 3 + ctx.measureText(t).width < W) ctx.fillText(t, p + 3, 2); });
      axis(R, H, view.toWorld(0, R).y, view.toWorld(0, H).y, (y) => y * view.scale + view.oy,
        (p, len) => { ctx.moveTo(R, p); ctx.lineTo(R - len, p); },
        (p, t) => {
          if (p - 3 - ctx.measureText(t).width < R) return; // 모서리 칸에 가리면 생략
          ctx.save(); ctx.translate(2, p - 3); ctx.rotate(-Math.PI / 2); ctx.fillText(t, 0, 0); ctx.restore();
        });
      // 테두리와 모서리 칸(단위)
      ctx.beginPath();
      ctx.moveTo(R, R - 0.5); ctx.lineTo(W, R - 0.5);
      ctx.moveTo(R - 0.5, R); ctx.lineTo(R - 0.5, H);
      ctx.strokeStyle = colors.line;
      ctx.stroke();
      ctx.fillStyle = colors.surface;
      ctx.fillRect(0, 0, R, R);
      ctx.fillStyle = colors.muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillText(App.units.lengthLabel(), R / 2, R / 2);
      // 마우스 위치
      const h = this.rulerHover;
      if (h) {
        const s = view.toScreen(h.x, h.y);
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (s.x > R) { ctx.moveTo(s.x, 0); ctx.lineTo(s.x, R); }
        if (s.y > R) { ctx.moveTo(0, s.y); ctx.lineTo(R, s.y); }
        ctx.stroke();
      }
      ctx.restore();
    }

    /** 지금 배율에서 그릴 격자 간격(mm). 확대하면 붙는 간격과 같이 잘게, 너무 촘촘하면 10배씩 넓힌다 */
    gridStep() {
      let step = App.snap ? App.snap.step(this.view.scale) : App.settings.gridSize;
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
