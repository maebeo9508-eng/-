/* 3D 그리기 엔진 (WebGL1, 라이브러리 없음).
   - Mesh: 상자·기둥·공·돌출 같은 기본 모양을 삼각형으로 쌓는 그릇. 단위는 m, 위쪽이 +y, 도면의 아래쪽(y)이 +z
   - Renderer: 하늘(구름·해), 바닥 재질(잔디·아스팔트·보도블록 등은 셰이더에서 만듦), 햇빛 그림자(그림자 지도),
     글자·이미지가 들어간 면(텍스처), 유리, 안개 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  /* ── 4×4 행렬 (열 우선) ── */
  const M4 = {
    perspective(fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
    },
    ortho(l, r, b, t, n, f) {
      return [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1];
    },
    lookAt(eye, target, up) {
      let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
      let l = Math.hypot(zx, zy, zz) || 1;
      zx /= l; zy /= l; zz /= l;
      let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
      l = Math.hypot(xx, xy, xz) || 1;
      xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1];
    },
    mul(a, b) {
      const o = new Array(16);
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
          o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        }
      }
      return o;
    },
    invert(m) {
      const inv = new Array(16);
      inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
      inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
      inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
      inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
      inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
      inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
      inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
      inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
      inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
      inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
      inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
      inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
      inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
      inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
      inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
      inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
      let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
      if (!det) return null;
      det = 1 / det;
      return inv.map((v) => v * det);
    },
    /** 점을 변환 (w로 나눔) */
    point(m, p) {
      const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15] || 1;
      return [(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w, (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w, (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w];
    },
  };

  /* ── 재질 번호 (셰이더와 같아야 함) ── */
  const MAT = {
    plain: 0, grass: 1, asphalt: 2, paver: 3, wood: 4, fabric: 5, tile: 6, concrete: 7, water: 8, emissive: 9,
    soil: 10, stone: 11, brick: 12, foliage: 13, metal: 14, window: 15, gloss: 16, canvas: 17, glass: 18, grain: 19, blob: 20, pool: 21, turf: 22, track: 23, sand: 24, marble: 25, chevron: 26,
    // 같은 재질의 다른 크기: 나무 널 wood+0.25 데코타일, wood+0.4 넓은 널 / 타일 tile+0.25 300각, tile+0.4 800각
    deco: 4.25, wideWood: 4.4, tileSmall: 6.25, tileLarge: 6.4,
  };

  const hexCache = new Map();
  /** '#rrggbb' → [r, g, b] (0~1) */
  function hex(s) {
    let c = hexCache.get(s);
    if (!c) {
      const v = parseInt(String(s).replace('#', ''), 16) || 0;
      c = [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
      hexCache.set(s, c);
    }
    return c;
  }
  const shade = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  /** 다각형([[x, z], ...])을 삼각형으로 (귀 자르기). 꼭짓점 번호 세 개씩 */
  function triangulate(pts) {
    const n = pts.length;
    if (n < 3) return [];
    let area = 0;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(area > 0 ? i : n - 1 - i); // 반시계로 맞춤
    const out = [];
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
    let guard = n * n + 10;
    while (idx.length > 3 && guard-- > 0) {
      let cut = false;
      for (let i = 0; i < idx.length; i++) {
        const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
        const a = pts[ia], b = pts[ib], c = pts[ic];
        if (cross(a, b, c) <= 1e-12) continue; // 오목한 꼭짓점
        let ear = true;
        for (let k = 0; k < idx.length && ear; k++) {
          const q = idx[k];
          if (q !== ia && q !== ib && q !== ic && inside(pts[q], a, b, c)) ear = false;
        }
        if (!ear) continue;
        out.push(ia, ib, ic);
        idx.splice(i, 1);
        cut = true;
        break;
      }
      if (!cut) idx.splice(0, 1); // 겹친 점 등: 하나 버리고 계속
    }
    if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
    return out;
  }

  /* ── 삼각형 그릇: 꼭짓점마다 위치(3)·법선(3)·색(3)·재질(1)·uv(2) ── */
  const STRIDE = 12;
  class Mesh {
    constructor(cap = 2048) {
      this.a = new Float32Array(cap * STRIDE);
      this.n = 0;
      this.tx = 0; this.ty = 0; this.tz = 0; this.c = 1; this.s = 0;
      this.min = [Infinity, Infinity, Infinity];
      this.max = [-Infinity, -Infinity, -Infinity];
    }
    /** 지금부터 넣는 모양의 자리: (x, z)로 옮기고 위에서 봐서 시계 방향으로 deg만큼 돌리고 y만큼 올림 */
    at(x, z, deg = 0, y = 0) {
      this.tx = x; this.ty = y; this.tz = z;
      const r = (deg * Math.PI) / 180;
      this.c = Math.cos(r); this.s = Math.sin(r);
      return this;
    }
    _v(x, y, z, nx, ny, nz, col, mat, u, v) {
      if ((this.n + 1) * STRIDE > this.a.length) {
        const b = new Float32Array(this.a.length * 2);
        b.set(this.a);
        this.a = b;
      }
      const c = this.c, s = this.s, a = this.a, o = this.n * STRIDE;
      const wx = this.tx + x * c - z * s, wy = this.ty + y, wz = this.tz + x * s + z * c;
      a[o] = wx; a[o + 1] = wy; a[o + 2] = wz;
      a[o + 3] = nx * c - nz * s; a[o + 4] = ny; a[o + 5] = nx * s + nz * c;
      a[o + 6] = col[0]; a[o + 7] = col[1]; a[o + 8] = col[2];
      a[o + 9] = mat; a[o + 10] = u; a[o + 11] = v;
      this.n++;
      const mn = this.min, mx = this.max;
      if (wx < mn[0]) mn[0] = wx; if (wy < mn[1]) mn[1] = wy; if (wz < mn[2]) mn[2] = wz;
      if (wx > mx[0]) mx[0] = wx; if (wy > mx[1]) mx[1] = wy; if (wz > mx[2]) mx[2] = wz;
    }
    /** 삼각형 (법선은 면에서 계산) */
    tri(p0, p1, p2, col, mat = 0) {
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
      const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      this._v(p0[0], p0[1], p0[2], nx, ny, nz, col, mat, 0, 0);
      this._v(p1[0], p1[1], p1[2], nx, ny, nz, col, mat, 1, 0);
      this._v(p2[0], p2[1], p2[2], nx, ny, nz, col, mat, 0, 1);
    }
    /** 사각형 p0→p1→p2→p3 (한 바퀴). uv는 p0 왼쪽 아래, p1 오른쪽 아래, p2 오른쪽 위, p3 왼쪽 위 */
    quad(p0, p1, p2, p3, col, mat = 0) {
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
      const vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      this._v(p0[0], p0[1], p0[2], nx, ny, nz, col, mat, 0, 1);
      this._v(p1[0], p1[1], p1[2], nx, ny, nz, col, mat, 1, 1);
      this._v(p2[0], p2[1], p2[2], nx, ny, nz, col, mat, 1, 0);
      this._v(p0[0], p0[1], p0[2], nx, ny, nz, col, mat, 0, 1);
      this._v(p2[0], p2[1], p2[2], nx, ny, nz, col, mat, 1, 0);
      this._v(p3[0], p3[1], p3[2], nx, ny, nz, col, mat, 0, 0);
    }
    /** uv를 직접 주는 사각형 (벽에 붙이는 사진처럼 한 장을 여러 조각에 나눠 붙일 때). uv: [[u, v] × 4] */
    quadUV(p0, p1, p2, p3, uv, col, mat = 0) {
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
      const vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      [[p0, uv[0]], [p1, uv[1]], [p2, uv[2]], [p0, uv[0]], [p2, uv[2]], [p3, uv[3]]].forEach(([p, t]) => this._v(p[0], p[1], p[2], nx, ny, nz, col, mat, t[0], t[1]));
    }
    /** 상자: 두 구석 (x0, y0, z0)~(x1, y1, z1). o: { top: 윗면 색, topMat, bottom: 바닥면도 그림 } */
    box(x0, y0, z0, x1, y1, z1, col, mat = 0, o = null) {
      const tc = (o && o.top) || col, tm = o && o.topMat != null ? o.topMat : mat;
      this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], tc, tm);       // 위
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col, mat);     // 앞 (+z)
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col, mat);     // 뒤 (−z)
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col, mat);     // 오른쪽 (+x)
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col, mat);     // 왼쪽 (−x)
      if ((o && o.bottom) || y0 > 0.02) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col, mat); // 아래
    }
    /** 가운데 (cx, cz), 바닥 y0에서 폭 w × 높이 h × 깊이 d인 상자 */
    cube(cx, y0, cz, w, h, d, col, mat = 0, o = null) {
      this.box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, col, mat, o);
    }
    /** 두 점 a→b를 잇는 각재 (단면 t × t2) */
    beam(a, b, t, col, mat = 0, t2 = t) {
      let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const L = Math.hypot(dx, dy, dz);
      if (L < 1e-6) return;
      dx /= L; dy /= L; dz /= L;
      // 축에 수직인 두 방향
      let ux, uy, uz;
      if (Math.abs(dy) > 0.99) { ux = 1; uy = 0; uz = 0; } else { ux = -dz; uy = 0; uz = dx; const l = Math.hypot(ux, uz); ux /= l; uz /= l; }
      const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
      const h = t / 2, h2 = t2 / 2;
      const P = (p, i, j) => [p[0] + ux * h * i + vx * h2 * j, p[1] + uy * h * i + vy * h2 * j, p[2] + uz * h * i + vz * h2 * j];
      const A = [P(a, -1, -1), P(a, 1, -1), P(a, 1, 1), P(a, -1, 1)], B = [P(b, -1, -1), P(b, 1, -1), P(b, 1, 1), P(b, -1, 1)];
      for (let i = 0; i < 4; i++) { const k = (i + 1) % 4; this.quad(A[i], A[k], B[k], B[i], col, mat); }
      this.quad(A[3], A[2], A[1], A[0], col, mat);
      this.quad(B[0], B[1], B[2], B[3], col, mat);
    }
    /** 두 점 a→b를 잇는 둥근 기둥 (끝 반지름 ra, rb). 옆면은 매끈하게 */
    tube(a, b, ra, rb, col, mat = 0, seg = 10, capA = true, capB = true) {
      let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const L = Math.hypot(dx, dy, dz);
      if (L < 1e-6) return;
      dx /= L; dy /= L; dz /= L;
      let ux, uy, uz;
      if (Math.abs(dy) > 0.99) { ux = 1; uy = 0; uz = 0; } else { ux = -dz; uy = 0; uz = dx; const l = Math.hypot(ux, uz); ux /= l; uz /= l; }
      const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
      const slope = (ra - rb) / L; // 옆면 법선이 축 쪽으로 기우는 정도
      const ring = [];
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
        const rx = ux * c + vx * s, ry = uy * c + vy * s, rz = uz * c + vz * s;
        let nx = rx + dx * slope, ny = ry + dy * slope, nz = rz + dz * slope;
        const l = Math.hypot(nx, ny, nz) || 1;
        ring.push([rx, ry, rz, nx / l, ny / l, nz / l]);
      }
      for (let i = 0; i < seg; i++) {
        const p = ring[i], q = ring[i + 1];
        const a0 = [a[0] + p[0] * ra, a[1] + p[1] * ra, a[2] + p[2] * ra], a1 = [a[0] + q[0] * ra, a[1] + q[1] * ra, a[2] + q[2] * ra];
        const b0 = [b[0] + p[0] * rb, b[1] + p[1] * rb, b[2] + p[2] * rb], b1 = [b[0] + q[0] * rb, b[1] + q[1] * rb, b[2] + q[2] * rb];
        const u0 = i / seg, u1 = (i + 1) / seg;
        this._v(a0[0], a0[1], a0[2], p[3], p[4], p[5], col, mat, u0, 1);
        this._v(a1[0], a1[1], a1[2], q[3], q[4], q[5], col, mat, u1, 1);
        this._v(b1[0], b1[1], b1[2], q[3], q[4], q[5], col, mat, u1, 0);
        this._v(a0[0], a0[1], a0[2], p[3], p[4], p[5], col, mat, u0, 1);
        this._v(b1[0], b1[1], b1[2], q[3], q[4], q[5], col, mat, u1, 0);
        this._v(b0[0], b0[1], b0[2], p[3], p[4], p[5], col, mat, u0, 0);
        if (capA && ra > 0) {
          this._v(a[0], a[1], a[2], -dx, -dy, -dz, col, mat, 0.5, 0.5);
          this._v(a1[0], a1[1], a1[2], -dx, -dy, -dz, col, mat, 1, 0);
          this._v(a0[0], a0[1], a0[2], -dx, -dy, -dz, col, mat, 0, 0);
        }
        if (capB && rb > 0) {
          this._v(b[0], b[1], b[2], dx, dy, dz, col, mat, 0.5, 0.5);
          this._v(b0[0], b0[1], b0[2], dx, dy, dz, col, mat, 0, 0);
          this._v(b1[0], b1[1], b1[2], dx, dy, dz, col, mat, 1, 0);
        }
      }
    }
    /** 세로 기둥: 가운데 (cx, cz), y0~y1, 아래 반지름 r0, 위 반지름 r1 */
    cyl(cx, y0, cz, r0, y1, r1, col, mat = 0, seg = 10) {
      this.tube([cx, y0, cz], [cx, y1, cz], r0, r1, col, mat, seg, y0 > 0.02, true);
    }
    /** 납작한 원판 (위를 봄) */
    disc(cx, y, cz, r, col, mat = 0, seg = 16) {
      for (let i = 0; i < seg; i++) {
        const t0 = (i / seg) * Math.PI * 2, t1 = ((i + 1) / seg) * Math.PI * 2;
        this._v(cx, y, cz, 0, 1, 0, col, mat, 0.5, 0.5);
        this._v(cx + Math.cos(t1) * r, y, cz + Math.sin(t1) * r, 0, 1, 0, col, mat, 1, 0);
        this._v(cx + Math.cos(t0) * r, y, cz + Math.sin(t0) * r, 0, 1, 0, col, mat, 0, 0);
      }
    }
    /** 공·타원체: 가운데와 세 반지름 */
    ball(cx, cy, cz, rx, ry, rz, col, mat = 0, seg = 10, rings = 6, half = false) {
      const P = (i, j) => {
        const th = (j / rings) * (half ? Math.PI / 2 : Math.PI), ph = (i / seg) * Math.PI * 2; // half: 위쪽 반만 (돔)
        const sx = Math.sin(th) * Math.cos(ph), sy = Math.cos(th), sz = Math.sin(th) * Math.sin(ph);
        let nx = sx / rx, ny = sy / ry, nz = sz / rz;
        const l = Math.hypot(nx, ny, nz) || 1;
        return [cx + sx * rx, cy + sy * ry, cz + sz * rz, nx / l, ny / l, nz / l];
      };
      for (let j = 0; j < rings; j++) {
        for (let i = 0; i < seg; i++) {
          const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
          if (j > 0) {
            this._v(a[0], a[1], a[2], a[3], a[4], a[5], col, mat, 0, 0);
            this._v(b[0], b[1], b[2], b[3], b[4], b[5], col, mat, 1, 0);
            this._v(c[0], c[1], c[2], c[3], c[4], c[5], col, mat, 1, 1);
          }
          if (j < rings - 1 || half) {
            this._v(a[0], a[1], a[2], a[3], a[4], a[5], col, mat, 0, 0);
            this._v(c[0], c[1], c[2], c[3], c[4], c[5], col, mat, 1, 1);
            this._v(d[0], d[1], d[2], d[3], d[4], d[5], col, mat, 0, 1);
          }
        }
      }
    }
    /** 바닥에 평평하게 놓인 다각형 [[x, z], ...] (오목해도 됨) */
    poly(pts, y, col, mat = 0) {
      const t = triangulate(pts);
      for (let i = 0; i < t.length; i++) {
        const p = pts[t[i]];
        this._v(p[0], y, p[1], 0, 1, 0, col, mat, p[0], p[1]);
      }
    }
    /** 다각형 [[x, z], ...]을 y0~y1로 세운 기둥 (벽 등). top: 윗면 색 */
    prism(pts, y0, y1, col, mat = 0, top = col, topMat = mat) {
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        this.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], col, mat);
      }
      this.poly(pts, y1, top, topMat);
    }
    /** 옆모습 [[u, v], ...](u: 앞뒤 z 또는 좌우 x, v: 높이)을 한 방향으로 민 모양. axis 'x': u=z, x0~x1로 밂 / 'z': u=x, z0~z1로 밂 */
    extrude(profile, a0, a1, col, mat = 0, axis = 'x') {
      const P = axis === 'x' ? (u, v, a) => [a, v, u] : (u, v, a) => [u, v, a];
      const n = profile.length;
      for (let i = 0; i < n; i++) {
        const p = profile[i], q = profile[(i + 1) % n];
        this.quad(P(p[0], p[1], a0), P(q[0], q[1], a0), P(q[0], q[1], a1), P(p[0], p[1], a1), col, mat);
      }
      const t = triangulate(profile);
      for (const a of [a0, a1]) {
        for (let i = 0; i < t.length; i += 3) {
          const p = profile[t[i]], q = profile[t[i + 1]], r = profile[t[i + 2]];
          this.tri(P(p[0], p[1], a), P(q[0], q[1], a), P(r[0], r[1], a), col, mat);
        }
      }
    }
  }

  /* ── 셰이더 ── */
  const PREC = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
  const NOISE = `
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }`;

  const VS = `
    attribute vec3 aPos; attribute vec3 aNormal; attribute vec3 aColor; attribute float aMat; attribute vec2 aUv;
    uniform mat4 uVP;
    varying vec3 vPos; varying vec3 vNormal; varying vec3 vColor; varying float vMat; varying vec2 vUv;
    void main() {
      vPos = aPos; vNormal = aNormal; vColor = aColor; vMat = aMat; vUv = aUv;
      gl_Position = uVP * vec4(aPos, 1.0);
    }`;

  const FS = `${PREC}
    varying vec3 vPos; varying vec3 vNormal; varying vec3 vColor; varying float vMat; varying vec2 vUv;
    uniform vec3 uCam, uSunDir, uSunCol, uSkyAmb, uGroundAmb, uFogCol, uZenith, uViewDir;
    uniform float uFogDensity, uPixel, uShadowOn, uShadowTexel, uShadowBias, uShadowOffset, uUseTex, uTime, uAlpha, uOrtho, uNight;
    uniform mat4 uShadowMat;
    uniform sampler2D uShadowMap, uTex;
    ${NOISE}
    float unpack(vec4 c) { return dot(c, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0)); }
    float lit(vec2 uv, float z) { return step(z, unpack(texture2D(uShadowMap, uv))); }
    float shadow(vec3 pos) {
      vec4 sp = uShadowMat * vec4(pos, 1.0);
      vec3 p = sp.xyz / sp.w;
      if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
      float z = p.z - uShadowBias;
      // 픽셀마다 돌린 여덟 점(고르게 퍼진 원판)으로 가장자리를 부드럽게. 점 자리는 미리 계산해 둠 (휴대폰에서 가볍게)
      float a = hash(gl_FragCoord.xy) * 6.2832;
      float ca = cos(a), sa = sin(a);
      mat2 rot = mat2(ca, sa, -sa, ca);
      float r = uShadowTexel * 2.2;
      float s = 0.0;
      s += lit(p.xy + rot * vec2(0.2500, 0.0000) * r, z);
      s += lit(p.xy + rot * vec2(-0.3193, 0.2925) * r, z);
      s += lit(p.xy + rot * vec2(0.0489, -0.5569) * r, z);
      s += lit(p.xy + rot * vec2(0.4024, 0.5249) * r, z);
      s += lit(p.xy + rot * vec2(-0.7385, -0.1306) * r, z);
      s += lit(p.xy + rot * vec2(0.6996, -0.4450) * r, z);
      s += lit(p.xy + rot * vec2(-0.2340, 0.8705) * r, z);
      s += lit(p.xy + rot * vec2(-0.4463, -0.8593) * r, z);
      return s * 0.125;
    }
    /* 밝은 곳이 하얗게 날아가지 않게 누르는 곡선 */
    vec3 tone(vec3 x) {
      x *= 0.92;
      return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    }
    /* 크기 s(m)인 무늬가 화면에서 얼마나 또렷이 보이는지 (1: 다 보임, 0: 한 픽셀보다 작아 평균색으로) */
    float det(float s, float foot) { return clamp((s / foot - 1.0) * 0.5, 0.0, 1.0); }
    /* 줄눈: 칸 안 위치 f(0~1), 칸 크기 size(m), 줄눈 폭 w(m) */
    float joint(vec2 f, vec2 size, float w, float foot) {
      vec2 d = min(f, 1.0 - f) * size;
      return 1.0 - smoothstep(w * 0.5, w * 0.5 + foot + 0.0005, min(d.x, d.y));
    }
    void main() {
      vec3 n = normalize(vNormal);
      vec3 toCam = uCam - vPos;
      float dist = length(toCam);
      vec3 v = uOrtho > 0.0 ? uViewDir : toCam / dist;
      if (dot(n, v) < 0.0) n = -n;
      float foot = (uOrtho > 0.0 ? uOrtho : dist * uPixel) / max(dot(n, v), 0.25);
      float m = vMat;
      if (m > 19.5 && m < 21.5) {
        // 바닥 그늘(물건 아래의 옅은 그림자)과 밤의 불빛 웅덩이: 가운데가 진하고 가장자리로 사라짐
        vec2 q = max(abs(vUv - 0.5) * 2.0 - 0.45, 0.0) / 0.55;
        float f = 1.0 - smoothstep(0.0, 1.0, length(q));
        if (m < 20.5) gl_FragColor = vec4(0.0, 0.0, 0.0, f * 0.34 * vColor.r * (1.0 - 0.6 * uNight));
        else { float g = 1.0 - smoothstep(0.0, 1.0, length(vUv - 0.5) * 2.0); gl_FragColor = vec4(vColor, g * g * 0.6 * uNight); } // 둥근 불빛
        return;
      }
      vec3 an = abs(n);
      vec2 p = an.y > 0.6 ? vPos.xz : (an.x > an.z ? vPos.zy : vPos.xy);
      vec3 base = vColor;
      float alpha = uAlpha;
      if (uUseTex > 0.5) {
        vec4 t = texture2D(uTex, vUv);
        if (t.a < 0.08) discard;
        base = t.rgb * vColor;
      }
      base = pow(base, vec3(2.2));
      float spec = 0.0, shin = 16.0, refl = 0.0, glow = 0.0, through = 0.0;
      if (m < 0.5) {
        // 민무늬
      } else if (m < 1.5) { // 잔디
        float a = noise(p * 0.16), b = noise(p * 7.0), c = noise(p * 55.0);
        base *= 0.9 + 0.16 * a + 0.26 * (b - 0.5) * det(0.14, foot) + 0.42 * (c - 0.5) * det(0.018, foot);
        base = mix(base, base * vec3(1.28, 1.12, 0.62), 0.2 * noise(p * 0.09 + 9.0));
      } else if (m < 2.5) { // 아스팔트
        float b = noise(p * 0.13), c = noise(p * 190.0), d2 = noise(p * 28.0);
        base *= 0.95 + 0.1 * (b - 0.5) + 0.5 * (c - 0.5) * det(0.005, foot) + 0.14 * (d2 - 0.5) * det(0.035, foot);
      } else if (m < 3.5) { // 보도블록 (200×100, 엇갈려 깔기)
        vec2 size = vec2(0.2, 0.1);
        vec2 q = p / size;
        q.x += 0.5 * mod(floor(q.y), 2.0);
        float d = det(0.1, foot);
        base *= mix(1.0, 0.8 + 0.36 * hash(floor(q)), d);
        base *= 1.0 - 0.42 * joint(fract(q), size, 0.006, foot) * d;
        base *= 0.96 + 0.1 * (noise(p * 120.0) - 0.5) * det(0.008, foot);
      } else if (m < 4.5) { // 나무 널 (폭 120, 길이 1200) · 데코타일 (150×900) · 넓은 널 (200×1800)
        vec2 size = m > 4.3 ? vec2(1.8, 0.2) : m > 4.15 ? vec2(0.9, 0.15) : vec2(1.2, 0.12);
        vec2 q = p / size;
        q.x += hash(vec2(floor(q.y), 3.0));
        float d = det(0.12, foot);
        base *= mix(1.0, 0.91 + 0.17 * hash(floor(q)), d);
        base *= 1.0 + 0.1 * (noise(vec2(p.x * 2.5, p.y * 85.0) + 40.0 * hash(floor(q))) - 0.5) * det(0.012, foot);
        base *= 1.0 - 0.26 * joint(fract(q), size, 0.003, foot) * d;
        spec = 0.1; shin = 30.0;
      } else if (m < 5.5) { // 천·카펫
        base *= 0.93 + 0.14 * (noise(p * 380.0) - 0.5) * det(0.0026, foot) + 0.08 * (noise(p * 2.2) - 0.5);
      } else if (m < 6.5) { // 타일 (600 각 · 300 각 · 800 각)
        float ts = m > 6.3 ? 0.8 : m > 6.15 ? 0.3 : 0.6;
        vec2 size = vec2(ts, ts);
        vec2 q = p / size;
        float d = det(0.3, foot);
        base *= mix(1.0, 0.95 + 0.1 * hash(floor(q)), d);
        base = mix(base, base * 0.62, joint(fract(q), size, 0.004, foot) * d);
        spec = 0.16; shin = 50.0;
      } else if (m < 7.5) { // 콘크리트
        base *= 0.95 + 0.08 * (noise(p * 0.2) - 0.5) + 0.1 * (noise(p * 45.0) - 0.5) * det(0.022, foot);
      } else if (m < 8.5) { // 물
        float w1 = noise(p * 1.6 + vec2(uTime * 0.25, uTime * 0.11)), w2 = noise(p * 4.3 - vec2(uTime * 0.2, uTime * 0.3));
        n = normalize(n + vec3(w1 - 0.5, 0.0, w2 - 0.5) * 0.22);
        base *= 0.8 + 0.3 * w1;
        spec = 0.7; shin = 90.0; refl = 0.45;
      } else if (m < 9.5) { // 스스로 빛남 (LED 화면·조명)
        glow = 1.0;
      } else if (m < 10.5) { // 흙·모래
        base *= 0.93 + 0.12 * (noise(p * 0.2) - 0.5) + 0.22 * (noise(p * 60.0) - 0.5) * det(0.017, foot) + 0.1 * (noise(p * 9.0) - 0.5) * det(0.11, foot);
      } else if (m < 11.5) { // 돌담
        vec2 size = vec2(0.44, 0.27);
        vec2 q = p / size;
        float row = floor(q.y);
        q.x += 0.5 * mod(row, 2.0) + 0.35 * hash(vec2(row, 1.0));
        float d = det(0.27, foot);
        base *= mix(1.0, 0.7 + 0.55 * hash(floor(q) + 3.0), d);
        base = mix(base, base * 0.42, joint(fract(q), size, 0.022, foot) * d);
        base *= 0.92 + 0.2 * (noise(p * 22.0) - 0.5) * det(0.045, foot);
      } else if (m < 12.5) { // 벽돌 (210×70)
        vec2 size = vec2(0.22, 0.08);
        vec2 q = p / size;
        q.x += 0.5 * mod(floor(q.y), 2.0);
        float d = det(0.08, foot);
        base *= mix(1.0, 0.82 + 0.34 * hash(floor(q)), d);
        base = mix(base, vec3(0.62, 0.6, 0.56), joint(fract(q), size, 0.011, foot) * d * 0.85);
      } else if (m < 13.5) { // 나뭇잎
        vec2 q = vec2(vPos.x + vPos.y * 0.7, vPos.z - vPos.y * 0.6);
        base *= 0.74 + 0.42 * noise(q * 1.8) + 0.5 * (noise(q * 13.0) - 0.5) * det(0.075, foot) + 0.3 * (noise(q * 55.0) - 0.5) * det(0.018, foot);
      } else if (m < 14.5) { // 금속
        spec = 0.55; shin = 42.0; refl = 0.12;
      } else if (m < 15.5) { // 건물 창 (비치는 유리). 밤에는 군데군데 불이 켜짐
        spec = 0.9; shin = 110.0; refl = 0.55;
        if (uNight > 0.5 && hash(floor(vec2(vPos.x * 0.37 + vPos.z * 0.61, vPos.y * 0.31) * 1.7)) > 0.42) { base = vec3(1.0, 0.86, 0.55); glow = 1.0; }
      } else if (m < 16.5) { // 광택 칠 (자동차)
        spec = 0.45; shin = 60.0; refl = 0.14;
      } else if (m < 17.5) { // 천막 천: 빛이 조금 비침
        through = 0.16;
        base *= 0.97 + 0.05 * (noise(p * 3.0) - 0.5);
      } else if (m < 18.5) { // 투명 유리
        spec = 0.8; shin = 100.0; refl = 0.3;
      } else if (m < 19.5) { // 나뭇결 (가구)
        vec2 g = an.y > 0.6 ? vPos.xz : vec2(vPos.x + vPos.z, vPos.y);
        base *= 0.95 + 0.14 * (noise(vec2(g.x * 3.0, g.y * 70.0)) - 0.5) * det(0.014, foot) + 0.08 * (noise(g * 1.3) - 0.5);
        spec = 0.08; shin = 24.0;
      } else if (m < 22.5) { // 인조 잔디·경기장 잔디: 깎은 줄무늬
        float stripe = step(0.5, fract(vUv.x * 0.5));
        base *= (0.93 + 0.12 * stripe) * (0.95 + 0.1 * (noise(p * 30.0) - 0.5) * det(0.03, foot) + 0.25 * (noise(p * 160.0) - 0.5) * det(0.006, foot));
      } else if (m < 23.5) { // 우레탄 트랙·코트 바닥
        base *= 0.94 + 0.14 * (noise(p * 220.0) - 0.5) * det(0.0045, foot) + 0.06 * (noise(p * 1.1) - 0.5);
      } else if (m < 24.5) { // 모래
        base *= 0.94 + 0.1 * (noise(p * 0.5) - 0.5) + 0.2 * (noise(p * 90.0) - 0.5) * det(0.011, foot) + 0.12 * (noise(vec2(p.x * 3.0 + noise(p * 0.8) * 2.0, p.y * 0.6)) - 0.5) * det(0.3, foot);
      } else if (m < 25.5) { // 대리석: 흐르는 무늬결 + 600각 줄눈, 광택
        vec2 q = p / 0.6;
        float d = det(0.25, foot);
        float vein = abs(sin((p.x * 0.8 + p.y * 0.5) * 3.2 + noise(p * 1.3 + floor(q) * 7.0) * 5.0));
        base *= 0.97 + 0.06 * (noise(p * 0.9 + floor(q) * 3.0) - 0.5);
        base *= 1.0 - 0.28 * pow(1.0 - vein, 14.0) * det(0.015, foot);
        base = mix(base, base * 0.8, joint(fract(q), vec2(0.6), 0.002, foot) * d);
        spec = 0.42; shin = 90.0;
      } else { // 쉐브론(V자) 마루: 기둥마다 비스듬히 엇갈린 널
        float cw = 0.34, col = floor(p.x / cw), fx = fract(p.x / cw);
        float dir = mod(col, 2.0) * 2.0 - 1.0;
        float t = (p.y + dir * fx * cw) / 0.095;
        float d = det(0.1, foot);
        base *= mix(1.0, 0.9 + 0.18 * hash(vec2(col, floor(t))), d);
        base *= 1.0 + 0.08 * (noise(vec2(fx * 6.0, t * 40.0) + col * 13.0) - 0.5) * det(0.012, foot);
        float jt = min(fract(t), 1.0 - fract(t)) * 0.095, jc = min(fx, 1.0 - fx) * cw;
        base *= 1.0 - 0.28 * (1.0 - smoothstep(0.0012, 0.0012 + foot + 0.0004, min(jt, jc))) * d;
        spec = 0.12; shin = 32.0;
      }
      vec3 col;
      if (glow > 0.5) {
        col = base * 1.08;
      } else {
        float ndl = max(dot(n, uSunDir), 0.0);
        float sh = 1.0;
        if (uShadowOn > 0.5) sh = shadow(vPos + n * uShadowOffset * (1.0 + 2.5 * (1.0 - ndl))); // 빛이 스치는 면일수록 더 띄워서 얼룩을 막음
        vec3 amb = mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5);
        col = base * (amb + uSunCol * (ndl * sh + through * (0.4 + 0.6 * sh)));
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        if (refl > 0.0) {
          vec3 r = reflect(-v, n);
          vec3 sky = mix(uFogCol, uZenith, clamp(r.y * 1.4, 0.0, 1.0));
          col = mix(col, sky, clamp(refl * (0.55 + 1.6 * fres), 0.0, 0.92));
        }
        if (spec > 0.0) {
          vec3 h = normalize(uSunDir + v);
          col += uSunCol * spec * pow(max(dot(n, h), 0.0), shin) * sh;
        }
        if (m > 17.5 && m < 18.5) alpha = clamp(0.16 + 0.6 * fres, 0.0, 1.0);
      }
      if (uOrtho <= 0.0) {
        float fog = 1.0 - exp(-dist * dist * uFogDensity * uFogDensity);
        col = mix(col, uFogCol, fog);
      }
      gl_FragColor = vec4(pow(tone(col), vec3(1.0 / 2.2)), alpha);
    }`;

  const DEPTH_VS = `
    attribute vec3 aPos;
    uniform mat4 uVP;
    void main() { gl_Position = uVP * vec4(aPos, 1.0); }`;
  const DEPTH_FS = `${PREC}
    void main() {
      float d = gl_FragCoord.z;
      vec4 e = fract(vec4(1.0, 255.0, 65025.0, 16581375.0) * d);
      e -= e.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
      gl_FragColor = e;
    }`;

  const SKY_VS = `
    attribute vec2 aPos;
    varying vec2 vNdc;
    void main() { vNdc = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }`;
  const SKY_FS = `${PREC}
    varying vec2 vNdc;
    uniform mat4 uInvVP;
    uniform vec3 uCam, uSunDir, uSunCol, uZenith, uHorizon;
    uniform float uClouds, uTime, uNight;
    ${NOISE}
    float fbm(vec2 p) {
      float s = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
      return s;
    }
    void main() {
      vec4 far = uInvVP * vec4(vNdc, 1.0, 1.0);
      vec3 dir = normalize(far.xyz / far.w - uCam);
      float e = dir.y;
      vec3 col = mix(uHorizon, uZenith, pow(clamp(e, 0.0, 1.0), 0.5));
      float s = max(dot(dir, uSunDir), 0.0);
      col += uSunCol * (pow(s, 900.0) * 3.0 + pow(s, 40.0) * 0.22 + pow(s, 5.0) * 0.07);
      if (uClouds > 0.5 && e > 0.0) {
        vec2 uv = dir.xz / (e + 0.18) * 0.7 + vec2(uTime * 0.004, 0.0);
        float c = smoothstep(0.5, 0.82, fbm(uv));
        float shadeC = 0.82 + 0.18 * smoothstep(0.5, 0.9, fbm(uv + 0.07));
        col = mix(col, (uHorizon * 0.35 + vec3(0.72)) * shadeC + uSunCol * 0.12, c * 0.9 * smoothstep(0.02, 0.22, e));
      }
      if (uNight > 0.5 && e > 0.0) {
        vec2 sp = dir.xz / (e + 0.35) * 190.0;
        float st = hash(floor(sp));
        col += vec3(0.9, 0.95, 1.0) * step(0.9965, st) * smoothstep(0.02, 0.2, e) * (0.4 + 0.6 * fract(st * 91.0));
      }
      if (e < 0.0) col = uHorizon;
      col *= 0.92;
      col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);
      gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
    }`;

  /* ── 햇빛: 낮 / 늦은 오후 / 노을. 색은 선형 값 ── */
  const SUNS = [
    {
      id: 'day', name: '낮', dir: [0.42, 0.82, 0.38], sun: [1.02, 0.97, 0.9], skyAmb: [0.46, 0.5, 0.58], groundAmb: [0.3, 0.29, 0.27],
      zenith: [0.13, 0.33, 0.78], horizon: [0.62, 0.76, 0.93],
    },
    {
      id: 'afternoon', name: '오후', dir: [0.7, 0.5, 0.3], sun: [1.08, 0.9, 0.72], skyAmb: [0.42, 0.45, 0.54], groundAmb: [0.3, 0.27, 0.24],
      zenith: [0.14, 0.31, 0.7], horizon: [0.72, 0.76, 0.84],
    },
    {
      id: 'sunset', name: '노을', dir: [0.86, 0.2, 0.2], sun: [1.15, 0.62, 0.34], skyAmb: [0.36, 0.34, 0.46], groundAmb: [0.27, 0.22, 0.2],
      zenith: [0.12, 0.2, 0.5], horizon: [0.95, 0.6, 0.4],
    },
    {
      id: 'night', name: '밤', dir: [0.3, 0.75, 0.5], sun: [0.2, 0.24, 0.38], skyAmb: [0.1, 0.12, 0.2], groundAmb: [0.07, 0.07, 0.1],
      zenith: [0.006, 0.01, 0.035], horizon: [0.035, 0.05, 0.11], night: true,
    },
  ];

  const ATTRS = ['aPos', 'aNormal', 'aColor', 'aMat', 'aUv'];

  /* 이름표: 늘 카메라를 보는 판 (화면에서 같은 크기). 자리의 아래 가운데에 붙음. 깊이는 보지 않음 (늘 보이게) */
  const LABEL_VS = `
    attribute vec3 aCenter;
    attribute vec2 aCorner;
    attribute vec2 aUv;
    attribute vec2 aSize;
    uniform mat4 uVP;
    uniform vec2 uPx;
    varying vec2 vUv;
    void main() {
      vec4 c = uVP * vec4(aCenter, 1.0);
      c.xy += vec2(aCorner.x * aSize.x * 0.5, (aCorner.y + 1.0) * 0.5 * aSize.y) * uPx * c.w;
      gl_Position = c;
      vUv = aUv;
    }`;
  const LABEL_FS = `
    precision mediump float;
    uniform sampler2D uTex;
    varying vec2 vUv;
    void main() {
      vec4 t = texture2D(uTex, vUv);
      if (t.a < 0.03) discard;
      gl_FragColor = t;
    }`;
  const LABEL_FLOATS = 9; // 자리 3 + 모서리 2 + 무늬 자리 2 + 크기 2

  class Renderer {
    /** opt.alpha: 바탕을 투명하게 (물건 그림을 따로 뽑을 때) */
    constructor(canvas, opt = {}) {
      this.canvas = canvas;
      const attrs = { antialias: true, alpha: !!opt.alpha, depth: true, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
      const gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
      if (!gl) throw new Error('WebGL을 쓸 수 없습니다');
      this.gl = gl;
      const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      this.highp = !!(hp && hp.precision > 0);
      this.depthBits = gl.getParameter(gl.DEPTH_BITS) || 16;
      this.main = this._program(VS, FS, ATTRS);
      this.depth = this._program(DEPTH_VS, DEPTH_FS, ['aPos']);
      this.sky = this._program(SKY_VS, SKY_FS, ['aPos']);
      this.skyBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      this.batches = {};    // 이름 → { buf, count }
      this.textured = [];   // [{ buf, count, tex, layer, emissive }]
      this.shadowSize = 0;
      this.white = this._texture(null);
      this.groundBuf = gl.createBuffer();
      this.groundCount = 0;
      this.bounds = { min: [-5, 0, -5], max: [5, 3, 5] };
      this.start = performance.now();
    }

    _program(vs, fs, attrs) {
      const gl = this.gl;
      const make = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`셰이더 오류: ${gl.getShaderInfoLog(s)}`);
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
      attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`셰이더 연결 오류: ${gl.getProgramInfoLog(p)}`);
      const u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i);
        u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
      }
      return { p, u };
    }

    /** 캔버스·이미지를 텍스처로 (2의 거듭제곱 크기로 맞춰 밉맵을 만듦). source가 없으면 흰 점. repeat: 무늬를 되풀이 (가져온 3D 모형) */
    _texture(source, repeat = false) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (!source) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        return tex;
      }
      const max = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048);
      const pot = (v) => Math.min(max, Math.max(2, 2 ** Math.round(Math.log2(Math.max(1, v)))));
      const sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height;
      const w = pot(sw), h = pot(sh);
      let src = source;
      if (w !== sw || h !== sh || !(source instanceof HTMLCanvasElement)) {
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        cv.getContext('2d').drawImage(source, 0, 0, w, h);
        src = cv;
      }
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      return tex;
    }

    _upload(mesh) {
      const gl = this.gl;
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.a.subarray(0, mesh.n * STRIDE), gl.STATIC_DRAW);
      return { buf, count: mesh.n };
    }

    /** 장면을 올림. scene: { layers: { solid, ceil, glass, decals: [Mesh, ...] }, textured: [{ mesh, source, layer: 'solid'|'decal', emissive, repeat, share }], bounds }
        share: 같은 값끼리는 그림 한 장과 버퍼 하나로 합침 (같은 3D 모형을 여러 개 놓았을 때) — 이런 것은 그림자도 드리움 */
    setScene(scene) {
      const gl = this.gl;
      this.clearScene();
      const L = scene.layers;
      this.batches = {
        solid: this._upload(L.solid), ceil: this._upload(L.ceil), glass: this._upload(L.glass),
        decals: L.decals.map((m) => this._upload(m)), blobs: L.blobs && L.blobs.n ? this._upload(L.blobs) : null,
      };
      const shared = new Map(), list = [];
      scene.textured.forEach((t) => {
        if (!t.mesh.n) return;
        const k = t.share ? `${t.layer}|${t.share}` : null, s = k ? shared.get(k) : null;
        if (s) { s.parts.push(t.mesh); return; }
        const e = { parts: [t.mesh], source: t.source, layer: t.layer, repeat: !!t.repeat, shadow: !!t.share };
        if (k) shared.set(k, e);
        list.push(e);
      });
      this.textured = list.map((e) => {
        let mesh = e.parts[0];
        if (e.parts.length > 1) {
          const n = e.parts.reduce((t, m) => t + m.n, 0), a = new Float32Array(n * STRIDE);
          let o = 0;
          e.parts.forEach((m) => { a.set(m.a.subarray(0, m.n * STRIDE), o); o += m.n * STRIDE; });
          mesh = { a, n };
        }
        return { ...this._upload(mesh), tex: this._texture(e.source, e.repeat), layer: e.layer, shadow: e.shadow };
      });
      this.bounds = scene.bounds;
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
    /** 매 장면 바뀌는 것(걷는 사람들): mesh를 그대로 올림 (빈 것이나 null이면 그리지 않음) */
    setDynamic(mesh) {
      const gl = this.gl;
      if (!mesh || !mesh.n) { if (this.dyn) this.dyn.count = 0; return; }
      if (!this.dyn) this.dyn = { buf: gl.createBuffer(), count: 0 };
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn.buf);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.a.subarray(0, mesh.n * STRIDE), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      this.dyn.count = mesh.n;
    }
    clearScene() {
      const gl = this.gl;
      const b = this.batches;
      [b.solid, b.ceil, b.glass, b.blobs, ...(b.decals || [])].forEach((x) => x && gl.deleteBuffer(x.buf));
      this.textured.forEach((t) => { gl.deleteBuffer(t.buf); gl.deleteTexture(t.tex); });
      this.batches = {};
      this.textured = [];
      if (this.dyn) this.dyn.count = 0; // 걷는 사람들도 (다른 장면·제안서 그림에 남지 않게)
    }

    /** 이름표를 올림. labels: [{ p: [x, y, z](m), text, bg, fg }] — 글자는 한 장의 그림에 모아 그림 */
    setLabels(labels = []) {
      const gl = this.gl;
      if (this.labelBuf) { gl.deleteBuffer(this.labelBuf); this.labelBuf = null; }
      if (this.labelTex) { gl.deleteTexture(this.labelTex); this.labelTex = null; }
      this.labelCount = 0;
      const list = labels.filter((l) => l && l.text);
      if (!list.length) return;
      if (!this.label) {
        try { this.label = this._program(LABEL_VS, LABEL_FS, ['aCenter', 'aCorner', 'aUv', 'aSize']); } catch (e) { console.warn('이름표를 그릴 수 없음', e); this.label = null; return; }
      }
      // 글자 그림: 가로 1024, 한 줄 높이 52px (알약 모양 바탕 + 글자)
      const W = 1024, LH = 52, PAD = 16, font = '700 30px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
      const meas = document.createElement('canvas').getContext('2d');
      meas.font = font;
      const boxes = [];
      let x = 0, y = 0;
      list.slice(0, 400).forEach((l) => {
        const text = String(l.text).slice(0, 24);
        const w = Math.min(W - 4, Math.ceil(meas.measureText(text).width) + PAD * 2);
        if (x + w > W) { x = 0; y += LH + 4; }
        boxes.push({ l, text, x, y, w });
        x += w + 4;
      });
      const H = 2 ** Math.ceil(Math.log2(Math.max(64, y + LH)));
      if (H > 4096) return;
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const g = cv.getContext('2d');
      g.font = font;
      g.textBaseline = 'middle';
      g.textAlign = 'center';
      boxes.forEach((b) => {
        g.fillStyle = b.l.bg || 'rgba(17,24,39,0.86)';
        g.beginPath();
        if (g.roundRect) g.roundRect(b.x + 1, b.y + 3, b.w - 2, LH - 6, (LH - 6) / 2); else g.rect(b.x + 1, b.y + 3, b.w - 2, LH - 6);
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.stroke();
        g.fillStyle = b.l.fg || '#ffffff';
        g.fillText(b.text, b.x + b.w / 2, b.y + LH / 2 + 1);
      });
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const a = new Float32Array(boxes.length * 6 * LABEL_FLOATS);
      let i = 0;
      boxes.forEach((b) => {
        const u0 = b.x / W, u1 = (b.x + b.w) / W, v0 = b.y / H, v1 = (b.y + LH) / H;
        const [px, py, pz] = b.l.p;
        // 두 삼각형: (-1,-1) (1,-1) (1,1) / (-1,-1) (1,1) (-1,1). 무늬는 위쪽이 v0
        [[-1, -1, u0, v1], [1, -1, u1, v1], [1, 1, u1, v0], [-1, -1, u0, v1], [1, 1, u1, v0], [-1, 1, u0, v0]].forEach(([cx, cy, u, v]) => {
          a[i++] = px; a[i++] = py; a[i++] = pz; a[i++] = cx; a[i++] = cy; a[i++] = u; a[i++] = v; a[i++] = b.w; a[i++] = LH;
        });
      });
      this.labelBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.labelBuf);
      gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      this.labelTex = tex;
      this.labelCount = boxes.length * 6;
    }
    _drawLabels(vp, W, H) {
      const gl = this.gl;
      if (!this.labelCount || !this.label) return;
      gl.useProgram(this.label.p);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix4fv(this.label.u.uVP, false, vp);
      const k = (H / 900) * 0.62; // 900px 높이 화면에서 글자 줄 높이 약 32px (큰 그림·영상에서도 같은 비율)
      gl.uniform2f(this.label.u.uPx, (2 / W) * k, (2 / H) * k);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.labelTex);
      gl.uniform1i(this.label.u.uTex, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.labelBuf);
      const B = LABEL_FLOATS * 4;
      for (let j = 0; j < 4; j++) gl.enableVertexAttribArray(j);
      gl.disableVertexAttribArray(4);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, B, 0);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, B, 12);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, B, 20);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, B, 28);
      gl.drawArrays(gl.TRIANGLES, 0, this.labelCount);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    /** 끝없이 보이는 바닥: 재질과 색. 가운데(반지름 inner m)는 잘게 나눔 — 아주 큰 삼각형은 가까이에서 무늬가 흔들림 */
    setGround(mat, color, center, inner = 80) {
      const gl = this.gl;
      const m = new Mesh(1024);
      const R = 3500, cx = center[0], cz = center[1], n = 12, r = Math.max(40, inner), cell = (2 * r) / n;
      const q = (x0, z0, x1, z1) => m.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], color, mat);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) q(cx - r + i * cell, cz - r + j * cell, cx - r + (i + 1) * cell, cz - r + (j + 1) * cell);
      // 바깥 띠 (멀리까지)
      // 바깥 띠 (멀리까지). 안쪽 판과 조금 겹쳐 틈이 보이지 않게
      const e = 0.6;
      q(cx - R, cz - R, cx + R, cz - r + e);
      q(cx - R, cz + r - e, cx + R, cz + R);
      q(cx - R, cz - r, cx - r + e, cz + r);
      q(cx + r - e, cz - r, cx + R, cz + r);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.groundBuf);
      gl.bufferData(gl.ARRAY_BUFFER, m.a.subarray(0, m.n * STRIDE), gl.STATIC_DRAW);
      this.groundCount = m.n;
    }

    _shadowTarget(size) {
      const gl = this.gl;
      if (this.shadowSize === size) return;
      if (this.shadowFbo) {
        gl.deleteFramebuffer(this.shadowFbo);
        gl.deleteTexture(this.shadowTex);
        gl.deleteRenderbuffer(this.shadowDepth);
      }
      this.shadowTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.shadowDepth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.shadowDepth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size, size);
      this.shadowFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shadowTex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.shadowDepth);
      this.shadowOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.shadowSize = size;
    }

    _bind(buf, full) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const B = STRIDE * 4;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, B, 0);
      for (let i = 1; i < 5; i++) (full ? gl.enableVertexAttribArray(i) : gl.disableVertexAttribArray(i));
      if (full) {
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, B, 12);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, B, 24);
        gl.vertexAttribPointer(3, 1, gl.FLOAT, false, B, 36);
        gl.vertexAttribPointer(4, 2, gl.FLOAT, false, B, 40);
      }
    }

    /** 햇빛 쪽에서 본 깊이를 그림자 지도에 그림. focus: { center: [x, y, z], radius } 이 둘레만 자세히 */
    _shadowPass(sun, focus, size) {
      const gl = this.gl;
      this._shadowTarget(size);
      if (!this.shadowOk) return null;
      const d = sun.dir, len = Math.hypot(d[0], d[1], d[2]);
      const dir = [d[0] / len, d[1] / len, d[2] / len];
      const c = focus.center, r = focus.radius;
      const eye = [c[0] + dir[0] * 10, c[1] + dir[1] * 10, c[2] + dir[2] * 10];
      const view = M4.lookAt(eye, c, Math.abs(dir[1]) > 0.98 ? [0, 0, -1] : [0, 1, 0]);
      // 장면 전체가 깊이 범위에 들어가게
      const b = this.bounds;
      let zn = Infinity, zf = -Infinity;
      for (let i = 0; i < 8; i++) {
        const p = M4.point(view, [i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]]);
        zn = Math.min(zn, -p[2]);
        zf = Math.max(zf, -p[2]);
      }
      zn -= 2; zf += 2;
      // 그림자 지도 한 칸 단위로 맞춰 움직일 때 가장자리가 떨리지 않게
      const texel = (2 * r) / size;
      const cc = M4.point(view, c);
      const ox = Math.round(cc[0] / texel) * texel, oy = Math.round(cc[1] / texel) * texel;
      const proj = M4.ortho(ox - r, ox + r, oy - r, oy + r, zn, zf);
      const vp = M4.mul(proj, view);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
      gl.viewport(0, 0, size, size);
      gl.clearColor(1, 1, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.useProgram(this.depth.p);
      gl.uniformMatrix4fv(this.depth.u.uVP, false, vp);
      const draw = (x) => {
        if (!x || !x.count) return;
        this._bind(x.buf, false);
        gl.drawArrays(gl.TRIANGLES, 0, x.count);
      };
      draw(this.batches.solid);
      this.textured.forEach((t) => { if (t.shadow) draw(t); }); // 그림이 입혀진 3D 모형
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const bias = [0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 0.5, 0.5, 0.5, 1];
      return { mat: M4.mul(bias, vp), texel: 1 / size, bias: 0.03 / (zf - zn), offset: texel * 1.6 };
    }

    /** 한 장면 그리기.
        cam: { eye, target, fov(라디안), near, far }, o: { sun: SUNS 번호, ceil: 천장도 그림, shadows, clouds, shadowSize, focus } */
    render(cam, o = {}) {
      const gl = this.gl;
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      const sun = SUNS[o.sun || 0] || SUNS[0];
      const sl = Math.hypot(sun.dir[0], sun.dir[1], sun.dir[2]);
      const sunDir = [sun.dir[0] / sl, sun.dir[1] / sl, sun.dir[2] / sl];
      const time = (performance.now() - this.start) / 1000;
      const shadowsOn = o.shadows !== false && this.highp;
      const sh = shadowsOn ? this._shadowPass(sun, o.focus || this._sceneFocus(), o.shadowSize || 2048) : null;

      const view = M4.lookAt(cam.eye, cam.target, cam.up || [0, 1, 0]);
      // cam.ortho: { hw, hh } 원근 없이 (위에서 본 그림)
      const proj = cam.ortho ? M4.ortho(-cam.ortho.hw, cam.ortho.hw, -cam.ortho.hh, cam.ortho.hh, cam.near, cam.far) : M4.perspective(cam.fov, W / H, cam.near, cam.far);
      const vp = M4.mul(proj, view);
      const vl = Math.hypot(cam.eye[0] - cam.target[0], cam.eye[1] - cam.target[1], cam.eye[2] - cam.target[2]) || 1;
      gl.viewport(0, 0, W, H);
      if (o.transparent) gl.clearColor(0, 0, 0, 0);
      else gl.clearColor(sun.horizon[0], sun.horizon[1], sun.horizon[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // 하늘
      if (o.sky !== false) {
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.BLEND);
      gl.useProgram(this.sky.p);
      const su = this.sky.u;
      gl.uniformMatrix4fv(su.uInvVP, false, M4.invert(vp) || vp);
      gl.uniform3fv(su.uCam, cam.eye);
      gl.uniform3fv(su.uSunDir, sunDir);
      gl.uniform3fv(su.uSunCol, sun.sun);
      gl.uniform3fv(su.uZenith, sun.zenith);
      gl.uniform3fv(su.uHorizon, sun.horizon);
      gl.uniform1f(su.uClouds, o.clouds === false || sun.night ? 0 : 1);
      gl.uniform1f(su.uTime, time);
      gl.uniform1f(su.uNight, sun.night ? 1 : 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      for (let i = 1; i < 5; i++) gl.disableVertexAttribArray(i);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      // 장면
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.useProgram(this.main.p);
      const u = this.main.u;
      gl.uniformMatrix4fv(u.uVP, false, vp);
      gl.uniform3fv(u.uCam, cam.eye);
      gl.uniform3fv(u.uSunDir, sunDir);
      gl.uniform3fv(u.uSunCol, sun.sun);
      gl.uniform3fv(u.uSkyAmb, sun.skyAmb);
      gl.uniform3fv(u.uGroundAmb, sun.groundAmb);
      gl.uniform3fv(u.uFogCol, sun.horizon);
      gl.uniform3fv(u.uZenith, sun.zenith);
      gl.uniform1f(u.uFogDensity, o.fog || 1 / 1300);
      gl.uniform1f(u.uPixel, (cam.fov || 1) / H);
      gl.uniform1f(u.uOrtho, cam.ortho ? (2 * cam.ortho.hh) / H : 0);
      gl.uniform3fv(u.uViewDir, [(cam.eye[0] - cam.target[0]) / vl, (cam.eye[1] - cam.target[1]) / vl, (cam.eye[2] - cam.target[2]) / vl]);
      gl.uniform1f(u.uNight, sun.night ? 1 : 0);
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uAlpha, 1);
      gl.uniform1f(u.uShadowOn, sh ? 1 : 0);
      if (sh) {
        gl.uniformMatrix4fv(u.uShadowMat, false, sh.mat);
        gl.uniform1f(u.uShadowTexel, sh.texel);
        gl.uniform1f(u.uShadowBias, sh.bias);
        gl.uniform1f(u.uShadowOffset, sh.offset);
      }
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, sh ? this.shadowTex : this.white);
      gl.uniform1i(u.uShadowMap, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.white);
      gl.uniform1i(u.uTex, 0);
      gl.uniform1f(u.uUseTex, 0);

      const draw = (x) => {
        if (!x || !x.count) return;
        this._bind(x.buf, true);
        gl.drawArrays(gl.TRIANGLES, 0, x.count);
      };
      const drawTex = (layer) => {
        this.textured.forEach((t) => {
          if (t.layer !== layer) return;
          gl.bindTexture(gl.TEXTURE_2D, t.tex);
          gl.uniform1f(u.uUseTex, 1);
          draw(t);
        });
        gl.uniform1f(u.uUseTex, 0);
        gl.bindTexture(gl.TEXTURE_2D, this.white);
      };
      const B = this.batches;
      // 바닥은 깊이를 쓰지 않음: 그 위의 영역·카펫 같은 것이 바닥과 깊이를 다투지 않게 (바닥 아래에는 아무것도 없음)
      gl.depthMask(false);
      if (o.ground !== false) draw({ buf: this.groundBuf, count: this.groundCount });
      gl.depthMask(true);
      draw(B.solid);
      if (this.dyn && this.dyn.count) draw(this.dyn); // 걷는 사람들
      if (o.ceil) draw(B.ceil);
      drawTex('solid');
      // 바닥에 붙는 것: 깊이는 쓰지 않고 차례대로 덧그림 (서로 겹쳐도 떨리지 않게)
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-2, -6);
      gl.depthMask(false);
      (B.decals || []).forEach(draw);
      drawTex('decal');
      // 물건 아래의 옅은 그늘, 밤의 불빛 (섞어 그림)
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      if (o.blobs !== false) draw(B.blobs);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      // 유리
      draw(B.glass);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      if (o.labels) this._drawLabels(vp, W, H); // 이름표 (맨 위에)
    }

    /** 장면 전체를 덮는 그림자 범위 */
    _sceneFocus() {
      const b = this.bounds;
      const c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
      const r = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2 + 1;
      return { center: c, radius: r };
    }

    dispose() {
      const gl = this.gl;
      this.clearScene();
      if (this.dyn) { gl.deleteBuffer(this.dyn.buf); this.dyn = null; }
      gl.deleteBuffer(this.groundBuf);
      gl.deleteBuffer(this.skyBuf);
      if (this.shadowFbo) {
        gl.deleteFramebuffer(this.shadowFbo);
        gl.deleteTexture(this.shadowTex);
        gl.deleteRenderbuffer(this.shadowDepth);
      }
      gl.deleteTexture(this.white);
      if (this.labelBuf) gl.deleteBuffer(this.labelBuf);
      if (this.labelTex) gl.deleteTexture(this.labelTex);
      [this.main, this.depth, this.sky, this.label].forEach((p) => p && gl.deleteProgram(p.p));
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
  }

  App.gl3d = { M4, MAT, Mesh, Renderer, SUNS, hex, shade, mixc, triangulate, STRIDE };
})();
