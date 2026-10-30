/* 3D 보기: 벽(문·창문 자리는 뚫림)·방 바닥·기둥·가구를 WebGL로 그려 손가락으로 돌려 본다.
   외부 라이브러리 없이 (인터넷 없이, 파일로 열어도 동작).
   도면 (x, y)mm → 3D (x, 높이, y). 도면 가운데를 원점으로 옮겨서 그림 (큰 좌표에서도 흔들리지 않게) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const G = App.geom;

  const LOW_WALL = 1200; // '벽 낮추기': 이 높이에서 자른 것처럼 (방 안이 잘 보이게)
  const FOV = (45 * Math.PI) / 180;
  const COLOR = {
    wall: [0.95, 0.95, 0.94, 1],
    wallTop: [0.36, 0.4, 0.45, 1], // 벽 윗면(자른 면)은 진하게: 위에서 볼 때 평면도처럼
    floor: [0.89, 0.83, 0.74, 1],
    ground: [0.92, 0.93, 0.94, 1],
    column: [0.72, 0.74, 0.76, 1],
    door: [0.72, 0.52, 0.34, 1],
    glass: [0.55, 0.78, 0.95, 0.35],
  };
  const WOOD = [0.66, 0.5, 0.36, 1];
  const FURN_COLOR = {
    침대: [0.86, 0.8, 0.72, 1], 소파: [0.52, 0.6, 0.68, 1], 옷장: [0.78, 0.68, 0.55, 1],
    냉장고: [0.86, 0.88, 0.9, 1], 세탁기: [0.86, 0.88, 0.9, 1], 싱크대: [0.8, 0.82, 0.84, 1], 쿡탑: [0.3, 0.32, 0.35, 1],
    변기: [0.97, 0.98, 0.99, 1], 세면대: [0.97, 0.98, 0.99, 1], 욕조: [0.97, 0.98, 0.99, 1], 샤워부스: [0.75, 0.88, 0.97, 0.45],
  };

  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* ── 4×4 행렬 (열 우선, WebGL 형식) ── */
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function lookAt(e, t, u) {
    const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const z = norm([e[0] - t[0], e[1] - t[1], e[2] - t[2]]);
    const x = norm(cross(u, z));
    const y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
  }
  function multiply(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    }
    return o;
  }

  /** 단순 다각형을 삼각형으로 (귀 자르기). 꼭짓점 번호 세 개씩 */
  function triangulate(pts) {
    const n = pts.length;
    if (n < 3) return [];
    const idx = [...Array(n).keys()];
    if (G.signedArea(pts) < 0) idx.reverse();
    const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const inside = (p, a, b, c) => cross(a, b, p) >= -1e-9 && cross(b, c, p) >= -1e-9 && cross(c, a, p) >= -1e-9;
    const tris = [];
    while (idx.length > 3) {
      let cut = false;
      for (let i = 0; i < idx.length; i++) {
        const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
        const a = pts[ia], b = pts[ib], c = pts[ic];
        if (cross(a, b, c) <= 1e-9) continue; // 오목한 꼭짓점
        if (idx.some((j) => j !== ia && j !== ib && j !== ic && inside(pts[j], a, b, c))) continue;
        tris.push([ia, ib, ic]);
        idx.splice(i, 1);
        cut = true;
        break;
      }
      if (!cut) break; // 꼬인 다각형: 남은 것은 버림
    }
    if (idx.length === 3) tris.push(idx.slice());
    return tris;
  }

  /* ── 삼각형 모음 (위치·법선·색) ── */
  class Mesh {
    constructor(origin) {
      this.o = origin;
      this.p = [];
      this.n = [];
      this.c = [];
    }
    /** 도면 점 q, 높이 z → 3D 점 */
    v(q, z) {
      return [q.x - this.o.x, z, q.y - this.o.y];
    }
    tri(a, b, c, nrm, col) {
      for (const v of [a, b, c]) {
        this.p.push(v[0], v[1], v[2]);
        this.n.push(nrm[0], nrm[1], nrm[2]);
        this.c.push(col[0], col[1], col[2], col[3]);
      }
    }
    quad(a, b, c, d, nrm, col) {
      this.tri(a, b, c, nrm, col);
      this.tri(a, c, d, nrm, col);
    }
    /** 바닥 모양 pts를 z0~z1로 세운 기둥꼴. 옆면 법선은 바깥쪽으로 */
    prism(pts, z0, z1, col, topCol = col, bottom = false) {
      if (z1 - z0 < 0.5 || pts.length < 3) return;
      const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length, cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const ex = b.x - a.x, ey = b.y - a.y, len = Math.hypot(ex, ey);
        if (len < 1e-6) continue;
        let nx = ey / len, ny = -ex / len;
        if (nx * ((a.x + b.x) / 2 - cx) + ny * ((a.y + b.y) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
        this.quad(this.v(a, z0), this.v(b, z0), this.v(b, z1), this.v(a, z1), [nx, 0, ny], col);
      }
      this.flat(pts, z1, [0, 1, 0], topCol);
      if (bottom) this.flat(pts, z0, [0, -1, 0], col);
    }
    flat(pts, z, nrm, col) {
      triangulate(pts).forEach(([a, b, c]) => this.tri(this.v(pts[a], z), this.v(pts[b], z), this.v(pts[c], z), nrm, col));
    }
  }

  /** 가운데 (x, y), 폭 w(돌기 전 x 방향) × 깊이 h, 회전(도) 사각형의 네 꼭짓점 */
  function rectPts(x, y, w, h, deg = 0) {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([u, v]) => ({ x: x + u * c - v * s, y: y + u * s + v * c }));
  }
  /** 가구 안의 한 부분: 기호 좌표(가운데 기준, -y가 등)에서 (u0~u1, v0~v1) 칸 */
  function partPts(it, w, h, u0, u1, v0, v1) {
    const a = (it.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => ({ x: it.x + (u * w) * c - (v * h) * s, y: it.y + (u * w) * s + (v * h) * c }));
  }

  /* ── 도면 → 3D 모델 ── */
  function build(low) {
    const all = [...App.doc.all()].filter((e) => App.layers.visible(e));
    const walls = all.filter((e) => e.type === 'wall' && G.dist(e.start, e.end) >= 1);
    const furn = all.filter((e) => e.type === 'item' && e.category === 'furn');
    const columns = all.filter((e) => e.type === 'column');
    const rooms = all.filter((e) => e.type === 'room');
    const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const grow = (q) => { box.minX = Math.min(box.minX, q.x); box.minY = Math.min(box.minY, q.y); box.maxX = Math.max(box.maxX, q.x); box.maxY = Math.max(box.maxY, q.y); };
    walls.forEach((w) => App.joins.outline(w).pts.forEach(grow));
    rooms.forEach((r) => r.points.forEach(grow));
    furn.forEach((it) => grow(it));
    columns.forEach((c) => grow(c));
    if (box.minX === Infinity) return null;
    const origin = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
    const solid = new Mesh(origin), clear = new Mesh(origin);
    const top = low ? LOW_WALL : Infinity;

    // 땅과 방 바닥
    const pad = 2000;
    solid.flat([{ x: box.minX - pad, y: box.minY - pad }, { x: box.maxX + pad, y: box.minY - pad }, { x: box.maxX + pad, y: box.maxY + pad }, { x: box.minX - pad, y: box.maxY + pad }], 0, [0, 1, 0], COLOR.ground);
    rooms.forEach((r) => solid.flat(r.points, 3, [0, 1, 0], COLOR.floor));

    // 벽: 문·창문 자리는 위(인방)·아래(창대)만 남기고 뚫음
    walls.forEach((w) => {
      const L = G.dist(w.start, w.end);
      const d = G.unit(sub(w.end, w.start)), n = G.perp(d), h = w.thickness / 2;
      const H = Math.min(w.height, top);
      const o = App.joins.outline(w).pts;
      const J = App.joins;
      const s0 = Math.max(J.inset(w, 'start', h), J.inset(w, 'start', -h));
      const s1 = L - Math.max(J.inset(w, 'end', h), J.inset(w, 'end', -h));
      const at = (s, off) => ({ x: w.start.x + d.x * s + n.x * off, y: w.start.y + d.y * s + n.y * off });
      // a·b가 끝(±Infinity)이면 이음 모양(비스듬히 자른 끝 등)을 그대로
      const foot = (a, b) => [a === -Infinity ? o[0] : at(a, h), b === Infinity ? o[1] : at(b, h), b === Infinity ? o[2] : at(b, -h), a === -Infinity ? o[3] : at(a, -h)];
      const piece = (a, b, z0, z1, bottom) => {
        const zz = Math.min(z1, H);
        if (zz - z0 >= 1 && (a === -Infinity || b === Infinity || b - a >= 1)) solid.prism(foot(a, b), z0, zz, COLOR.wall, COLOR.wallTop, bottom);
      };
      const ops = App.measure.openingsOf(w.id).map((op) => {
        const g = App.model.openingGeom(op);
        if (!g) return null;
        const bottom = op.type === 'window' ? Math.max(0, op.sill || 0) : 0;
        return { op, g, a: Math.max(s0, g.c - g.half), b: Math.min(s1, g.c + g.half), bottom, top: Math.min(w.height, bottom + op.height) };
      }).filter((x) => x && x.b - x.a > 1).sort((x, y) => x.a - y.a);
      let cur = -Infinity;
      ops.forEach((x) => {
        if (x.a > cur) piece(cur, x.a, 0, w.height, false);
        piece(Math.max(cur, x.a), x.b, x.top, w.height, true); // 인방
        piece(Math.max(cur, x.a), x.b, 0, x.bottom, false);  // 창대 아래
        cur = Math.max(cur, x.b);
        // 문짝·유리
        const W = x.b - x.a, t = 40;
        if (x.op.type === 'window') {
          clear.prism([at(x.a, -6), at(x.b, -6), at(x.b, 6), at(x.a, 6)], x.bottom, Math.min(x.top, top), COLOR.glass);
        } else if (x.op.kind === '여닫이' || x.op.kind === '방화문') {
          const side = x.op.side || 1, k = x.op.hinge === 'end' ? -1 : 1;
          const hs = x.op.hinge === 'end' ? x.b : x.a;
          const h0 = at(hs, side * h), h1 = at(hs + k * t, side * h);
          const out = { x: n.x * side * W, y: n.y * side * W };
          solid.prism([h0, h1, { x: h1.x + out.x, y: h1.y + out.y }, { x: h0.x + out.x, y: h0.y + out.y }], 0, Math.min(x.top, top), COLOR.door);
        } else if (x.op.kind === '미닫이') {
          solid.prism([at(x.a + W * 0.05, -t / 2), at(x.a + W * 0.6, -t / 2), at(x.a + W * 0.6, t / 2), at(x.a + W * 0.05, t / 2)], 0, Math.min(x.top, top), COLOR.door);
        }
      });
      piece(cur, Infinity, 0, w.height, false);
    });

    // 기둥: 그 자리 천장까지
    columns.forEach((c) => {
      const H = Math.min(App.measure.ceilingAt(c), top);
      const pts = c.shape === 'circle'
        ? [...Array(24).keys()].map((i) => ({ x: c.x + Math.cos((i / 24) * Math.PI * 2) * (c.width / 2), y: c.y + Math.sin((i / 24) * Math.PI * 2) * (c.width / 2) }))
        : rectPts(c.x, c.y, c.width, c.depth);
      solid.prism(pts, 0, H, COLOR.column);
    });

    // 가구: 상자. 침대·소파·변기는 모양이 알아보이게 몇 부분으로
    furn.forEach((it) => {
      const def = App.catalog.itemDef(it.kind) || {};
      const w = it.size, d = it.depth != null ? it.depth : it.size * (def.aspect || 1);
      const H = def.h3 || 800;
      const col = FURN_COLOR[it.kind] || WOOD;
      const part = (u0, u1, v0, v1, z0, z1, c = col) => (c[3] < 1 ? clear : solid).prism(partPts(it, w, d, u0, u1, v0, v1), z0, z1, c);
      if (it.kind === '침대') {
        part(-0.5, 0.5, -0.5, 0.5, 0, 250, WOOD);
        part(-0.48, 0.48, -0.44, 0.48, 250, H);
        part(-0.5, 0.5, -0.5, -0.45, 0, 1000, WOOD); // 머리판
      } else if (it.kind === '소파') {
        part(-0.5, 0.5, -0.5, 0.5, 0, 420);
        part(-0.5, 0.5, -0.5, -0.25, 420, H);       // 등받이
        part(-0.5, -0.38, -0.25, 0.5, 420, 620);    // 팔걸이
        part(0.38, 0.5, -0.25, 0.5, 420, 620);
      } else if (it.kind === '변기') {
        part(-0.5, 0.5, -0.5, -0.26, 0, H);         // 물탱크
        part(-0.42, 0.42, -0.26, 0.5, 0, 400);
      } else if (it.kind === '식탁' || it.kind === '책상') {
        part(-0.5, 0.5, -0.5, 0.5, H - 40, H);      // 상판
        [[-0.46, -0.42], [0.42, 0.46]].forEach(([u0, u1]) => [[-0.46, -0.4], [0.4, 0.46]].forEach(([v0, v1]) => part(u0, u1, v0, v1, 0, H - 40)));
      } else {
        part(-0.5, 0.5, -0.5, 0.5, 0, H);
      }
    });

    const extent = Math.max(box.maxX - box.minX, box.maxY - box.minY, 3000);
    return { solid, clear, extent };
  }

  /* ── WebGL ── */
  const VS = `
    attribute vec3 aPos; attribute vec3 aNrm; attribute vec4 aCol;
    uniform mat4 uMVP; varying vec3 vNrm; varying vec4 vCol;
    void main() { gl_Position = uMVP * vec4(aPos, 1.0); vNrm = aNrm; vCol = aCol; }`;
  const FS = `
    precision mediump float;
    varying vec3 vNrm; varying vec4 vCol;
    uniform vec3 uLight; uniform vec3 uFill;
    void main() {
      vec3 n = normalize(vNrm);
      float k = 0.55 + 0.42 * max(dot(n, uLight), 0.0) + 0.15 * max(dot(n, uFill), 0.0);
      gl_FragColor = vec4(vCol.rgb * min(k, 1.04), vCol.a);
    }`;
  const norm3 = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

  let el = null, canvas = null, gl = null, prog = null, loc = null;
  let model = null, bufs = null, low = false, raf = 0;
  const cam = { yaw: -0.55, pitch: 0.8, dist: 10000, target: [0, 0, 0] };

  function compile() {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    loc = {
      pos: gl.getAttribLocation(prog, 'aPos'), nrm: gl.getAttribLocation(prog, 'aNrm'), col: gl.getAttribLocation(prog, 'aCol'),
      mvp: gl.getUniformLocation(prog, 'uMVP'), light: gl.getUniformLocation(prog, 'uLight'), fill: gl.getUniformLocation(prog, 'uFill'),
    };
  }

  function upload(mesh) {
    const mk = (data) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      return b;
    };
    return { pos: mk(mesh.p), nrm: mk(mesh.n), col: mk(mesh.c), count: mesh.p.length / 3 };
  }
  function freeBuffers() {
    if (!bufs || !gl) return;
    [bufs.solid, bufs.clear].forEach((b) => [b.pos, b.nrm, b.col].forEach((x) => gl.deleteBuffer(x)));
    bufs = null;
  }
  function drawMesh(b) {
    if (!b.count) return;
    const attr = (buf, l, size) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0);
    };
    attr(b.pos, loc.pos, 3);
    attr(b.nrm, loc.nrm, 3);
    attr(b.col, loc.col, 4);
    gl.drawArrays(gl.TRIANGLES, 0, b.count);
  }

  function rebuild() {
    model = build(low);
    if (!model || !gl) return;
    freeBuffers();
    bufs = { solid: upload(model.solid), clear: upload(model.clear) };
  }

  function draw() {
    raf = 0;
    if (!gl || !bufs) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    const dark = document.documentElement.dataset.theme === 'dark';
    gl.clearColor(dark ? 0.1 : 0.9, dark ? 0.125 : 0.93, dark ? 0.15 : 0.95, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    const c = Math.cos(cam.pitch);
    const eye = [cam.target[0] + cam.dist * c * Math.sin(cam.yaw), cam.target[1] + cam.dist * Math.sin(cam.pitch), cam.target[2] + cam.dist * c * Math.cos(cam.yaw)];
    const near = Math.max(10, cam.dist * 0.02), far = cam.dist * 20 + model.extent * 4;
    const mvp = multiply(perspective(FOV, w / h, near, far), lookAt(eye, cam.target, [0, 1, 0]));
    gl.useProgram(prog);
    gl.uniformMatrix4fv(loc.mvp, false, mvp);
    gl.uniform3fv(loc.light, norm3([0.45, 0.85, 0.6]));
    gl.uniform3fv(loc.fill, norm3([-0.6, 0.35, -0.5]));
    drawMesh(bufs.solid);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    drawMesh(bufs.clear);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
  const requestDraw = () => { if (!raf) raf = requestAnimationFrame(draw); };

  function resetView(top = false) {
    cam.target = [0, 0, 0];
    // 화면의 좁은 쪽(휴대폰 세로면 가로)에 도면이 다 들어오는 거리
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const half = Math.atan(Math.tan(FOV / 2) * Math.min(1, aspect));
    cam.dist = model ? ((model.extent / 2) / Math.tan(half)) * (top ? 1.15 : 1.3) : 10000;
    cam.yaw = top ? 0 : -0.55;
    cam.pitch = top ? 1.55 : 0.8;
    requestDraw();
  }

  /* ── 손가락·마우스: 한 손가락 돌리기, 두 손가락 확대·이동, 휠 확대, 오른쪽(또는 Shift) 끌기 이동 ── */
  function pan(dx, dy) {
    const k = (2 * cam.dist * Math.tan(FOV / 2)) / Math.max(1, canvas.clientHeight);
    const right = [Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)];
    const fwd = [-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)];
    cam.target[0] += (-right[0] * dx + fwd[0] * dy) * k;
    cam.target[2] += (-right[2] * dx + fwd[2] * dy) * k;
  }
  const zoom = (f) => { cam.dist = clamp(cam.dist * f, 300, 400000); };

  function bindControls() {
    const pts = new Map();
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.button === 1 || e.button === 2 || e.shiftKey });
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 1) {
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        if (p.pan) pan(dx, dy);
        else {
          cam.yaw -= dx * 0.008;
          cam.pitch = clamp(cam.pitch + dy * 0.006, 0.06, 1.55);
        }
      } else {
        const [a, b] = [...pts.values()];
        const d0 = Math.hypot(a.x - b.x, a.y - b.y), m0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        p.x = e.clientX; p.y = e.clientY;
        const d1 = Math.hypot(a.x - b.x, a.y - b.y), m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (d0 > 0 && d1 > 0) zoom(d0 / d1);
        pan(m1.x - m0.x, m1.y - m0.y);
      }
      p.x = e.clientX;
      p.y = e.clientY;
      requestDraw();
    });
    const end = (e) => pts.delete(e.pointerId);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoom(Math.exp(e.deltaY * 0.0012));
      requestDraw();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      App.ui.toast('3D 화면을 그리지 못했습니다. 닫고 다시 열어 보세요.');
    });
  }

  function saveImage() {
    draw(); // 같은 순간에 읽어야 그림이 남아 있음
    const url = canvas.toDataURL('image/png');
    const bin = atob(url.split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const name = ((App.projects && App.projects.current && App.projects.current.name) || '도면').replace(/[\\/:*?"<>|]+/g, '_').trim() || '도면';
    App.exporter.download(`${name}_3D_${App.exporter.stamp()}.png`, new Blob([bytes], { type: 'image/png' }));
  }

  function ensureElement() {
    if (el) return;
    el = document.createElement('div');
    el.className = 'view3d';
    el.id = 'view3d';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '3D 보기');
    el.innerHTML = `
      <canvas class="v3-canvas" aria-label="3D 도면"></canvas>
      <div class="v3-bar">
        <button type="button" class="btn btn-primary" data-v3="close">닫기</button>
        <span class="v3-gap"></span>
        <button type="button" class="btn" data-v3="reset" title="처음 시점으로">처음</button>
        <button type="button" class="btn" data-v3="top" title="위에서 내려다보기">위에서</button>
        <button type="button" class="btn" data-v3="low" aria-pressed="false" title="벽을 낮춰 방 안이 보이게">벽 낮추기</button>
        <button type="button" class="btn" data-v3="shot" title="지금 화면을 그림 파일로">사진 저장</button>
      </div>
      <p class="v3-hint">한 손가락: 돌리기 · 두 손가락: 확대·이동<span class="pc-only"> · 마우스: 끌기 돌리기, 오른쪽 끌기 이동, 휠 확대</span></p>`;
    document.body.appendChild(el);
    canvas = el.querySelector('canvas');
    el.querySelector('.v3-bar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v3]');
      if (!b) return;
      const act = b.dataset.v3;
      if (act === 'close') close();
      else if (act === 'reset') resetView(false);
      else if (act === 'top') resetView(true);
      else if (act === 'shot') saveImage();
      else if (act === 'low') {
        low = !low;
        b.setAttribute('aria-pressed', String(low));
        rebuild();
        requestDraw();
      }
    });
    window.addEventListener('resize', () => { if (isOpen()) requestDraw(); });
  }

  function open() {
    const test = build(low);
    if (!test) {
      App.ui.toast('벽이나 가구를 그리면 3D로 볼 수 있습니다.');
      return false;
    }
    ensureElement();
    if (!gl) {
      gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl');
      if (!gl) {
        App.ui.toast('이 기기에서는 3D 보기를 쓸 수 없습니다 (WebGL 없음).');
        return false;
      }
      try {
        compile();
      } catch (e) {
        gl = null;
        App.ui.toast(`3D 보기를 시작하지 못했습니다. ${e.message || e}`);
        return false;
      }
      bindControls();
    }
    el.hidden = false;
    rebuild();
    resetView(false);
    draw();
    return true;
  }

  function close() {
    if (!el || el.hidden) return false;
    el.hidden = true;
    freeBuffers();
    return true;
  }
  const isOpen = () => !!el && !el.hidden;

  App.view3d = {
    open, close, isOpen, build,
    /** 시험용: 지금 그림의 가운데 픽셀 색 등 */
    get gl() { return gl; },
  };
})();
