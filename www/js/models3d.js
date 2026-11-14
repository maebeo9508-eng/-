/* 3D 모형: 조감도 물건·가구·기호를 기본 모양(상자·기둥·공)으로 조립한다.
   단위 m. 물건 자리는 가운데가 (0, 0), 앞이 +z, 등이 −z, 위가 +y. 차는 +x가 앞.
   C(ctx): { S: 불투명, G: 유리, D: 바닥에 붙는 것, T: 천장에 다는 것, at(lx, lz, deg, ly): 물건 안에서 자리 옮기기,
             face(pts, canvas, layer): 글자·이미지 면, lod: 간단히 그림, rnd(): 물건마다 고정된 난수 } */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const { MAT, hex, shade, mixc } = App.gl3d;

  const WHITE = hex('#f7f7f5'), BLACK = hex('#17181b'), DARK = hex('#2b2e34'), STEEL = hex('#b9bec6'), CHROME = hex('#d5d9df');
  const GOLD = hex('#c9a23f'), WOOD = hex('#a8754a'), WOOD_DARK = hex('#5e3d24'), WOOD_LIGHT = hex('#d9b98c');
  const GLASS = hex('#9fc4dc'), WINDOW = hex('#274a6e'), TIRE = hex('#1c1d20'), CONCRETE = hex('#b9bcc0');
  const LEAF = [hex('#3f8f3c'), hex('#4c9e45'), hex('#357a36'), hex('#5aa84f')];
  const SKIN = [hex('#f1c9a5'), hex('#e8b88f'), hex('#d9a47a'), hex('#f5d3b4')];
  const HAIR = [hex('#1b1512'), hex('#2a1e17'), hex('#3a2a1e'), hex('#111111')];
  const SUIT = [hex('#1f2937'), hex('#111827'), hex('#374151'), hex('#1e3a5f'), hex('#2d2a32')];
  const CASUAL = [hex('#2563eb'), hex('#dc2626'), hex('#16a34a'), hex('#f59e0b'), hex('#7c3aed'), hex('#0891b2'), hex('#e5e7eb'), hex('#db2777'), hex('#475569')];
  const PANTS = [hex('#1f2937'), hex('#334155'), hex('#3b4a6b'), hex('#57534e'), hex('#a8a29e')];
  const col = (it, fallback) => (it && it.color ? hex(it.color) : typeof fallback === 'string' ? hex(fallback) : fallback);

  /* ── 글자·이미지 면 (캔버스) ── */
  const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif';
  const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const css = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

  /** 가로÷세로 비율 aspect인 면에 넣을 그림. o: { bg: 바탕색 [r,g,b], led: 화면처럼, plain: 꾸밈 없이, repeat: 포토월 무늬 }
      이미지를 넣었으면 이미지, 글자만 있으면 현수막 모양으로 꾸밈 */
  function faceCanvas(it, aspect, o = {}) {
    const a = Math.max(0.1, Math.min(12, aspect));
    const LH = a >= 1 ? 512 : 512 / a, LW = a >= 1 ? 512 * a : 512;
    const pot = (v) => Math.min(2048, Math.max(64, 2 ** Math.round(Math.log2(v))));
    const cv = document.createElement('canvas');
    cv.width = pot(LW);
    cv.height = pot(LH);
    const c = cv.getContext('2d');
    c.scale(cv.width / LW, cv.height / LH);
    const bg = o.bg || hex('#1e3a8a');
    const dark = luma(bg) < 0.6;
    c.fillStyle = css(bg);
    c.fillRect(0, 0, LW, LH);
    const img = it && it.imageId ? App.images.get(it.imageId) : null;
    if (img) {
      // 비율이 비슷하면 꽉 채우고(조금 잘림), 많이 다르면 다 보이게 넣음
      const ia = img.naturalWidth / img.naturalHeight;
      const cover = Math.abs(Math.log(ia / a)) < 0.25;
      const k = cover ? Math.max(LW / img.naturalWidth, LH / img.naturalHeight) : Math.min(LW / img.naturalWidth, LH / img.naturalHeight);
      const w = img.naturalWidth * k, h = img.naturalHeight * k;
      c.drawImage(img, (LW - w) / 2, (LH - h) / 2, w, h);
      return cv;
    }
    const m = Math.min(LW, LH);
    if (o.led) {
      // 화면: 어두운 바탕에 번지는 빛
      [['#7c3aed', 0.2, 0.3], ['#2563eb', 0.75, 0.25], ['#db2777', 0.55, 0.85], ['#0891b2', 0.1, 0.9]].forEach(([colr, x, y]) => {
        const g = c.createRadialGradient(LW * x, LH * y, 0, LW * x, LH * y, Math.max(LW, LH) * 0.55);
        g.addColorStop(0, `${colr}cc`);
        g.addColorStop(1, `${colr}00`);
        c.fillStyle = g;
        c.fillRect(0, 0, LW, LH);
      });
    } else if (!o.plain) {
      const g = c.createLinearGradient(0, 0, LW, LH);
      g.addColorStop(0, 'rgba(255,255,255,0.2)');
      g.addColorStop(0.55, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.22)');
      c.fillStyle = g;
      c.fillRect(0, 0, LW, LH);
      if (o.repeat) {
        // 포토월: 작은 무늬가 줄지어
        c.fillStyle = dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.1)';
        const s = m * 0.16;
        for (let y = 0, r = 0; y < LH + s; y += s, r++) {
          for (let x = (r % 2) * s * 0.75; x < LW + s; x += s * 1.5) {
            c.beginPath();
            c.arc(x, y, s * 0.2, 0, Math.PI * 2);
            c.fill();
          }
        }
      } else {
        // 모서리의 비스듬한 띠
        c.fillStyle = dark ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.08)';
        c.beginPath(); c.moveTo(0, LH); c.lineTo(0, LH * 0.45); c.lineTo(m * 0.5, LH); c.fill();
        c.beginPath(); c.moveTo(LW, 0); c.lineTo(LW, LH * 0.55); c.lineTo(LW - m * 0.5, 0); c.fill();
      }
      c.strokeStyle = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.3)';
      c.lineWidth = m * 0.012;
      c.strokeRect(m * 0.045, m * 0.045, LW - m * 0.09, LH - m * 0.09);
    }
    const text = String((it && it.text) || o.text || '').trim();
    if (text) {
      const lines = text.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 6);
      let size = Math.min((LH * 0.62) / (lines.length * 1.22), LW * 0.5);
      c.font = `800 ${size}px ${FONT}`;
      const widest = Math.max(...lines.map((l) => c.measureText(l).width));
      if (widest > LW * 0.84) size *= (LW * 0.84) / widest;
      c.font = `800 ${size}px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const lh = size * 1.22, y0 = LH / 2 - ((lines.length - 1) * lh) / 2;
      lines.forEach((l, i) => {
        // 첫 줄이 아니면 조금 작게 보이도록 살짝 옅게
        c.fillStyle = dark || o.led ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.5)';
        c.fillText(l, LW / 2 + size * 0.03, y0 + i * lh + size * 0.04);
        c.fillStyle = dark || o.led ? '#ffffff' : '#111827';
        c.fillText(l, LW / 2, y0 + i * lh);
      });
    }
    return cv;
  }

  /* ── 공통 부품 ── */
  /** 네 귀퉁이 다리 */
  function legs(S, w, d, h, t, c, mat = 0, inset = 0) {
    const x = w / 2 - t / 2 - inset, z = d / 2 - t / 2 - inset;
    [[-x, -z], [x, -z], [-x, z], [x, z]].forEach(([lx, lz]) => S.box(lx - t / 2, 0, lz - t / 2, lx + t / 2, h, lz + t / 2, c, mat));
  }
  /** 사각 트러스: a→b를 잇는 네 줄 + 지그재그 살 */
  function truss(S, a, b, size, lod, c = STEEL) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (L < 0.01) return;
    const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L];
    const u = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
    const h = size / 2, t = Math.max(0.035, size * 0.13);
    const corner = (p, i, j) => [p[0] + u[0] * h * i + v[0] * h * j, p[1] + u[1] * h * i + v[1] * h * j, p[2] + u[2] * h * i + v[2] * h * j];
    const along = (s) => [a[0] + d[0] * s, a[1] + d[1] * s, a[2] + d[2] * s];
    const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    C.forEach(([i, j]) => S.beam(corner(a, i, j), corner(b, i, j), t, c, MAT.metal));
    if (lod) return;
    const n = Math.max(1, Math.round(L / (size * 1.15)));
    for (let f = 0; f < 4; f++) {
      const [i0, j0] = C[f], [i1, j1] = C[(f + 1) % 4];
      for (let k = 0; k < n; k++) {
        const p = along((L * k) / n), q = along((L * (k + 1)) / n);
        if (k % 2) S.beam(corner(p, i1, j1), corner(q, i0, j0), t * 0.55, c, MAT.metal);
        else S.beam(corner(p, i0, j0), corner(q, i1, j1), t * 0.55, c, MAT.metal);
      }
    }
  }
  /** 뾰족한 천막 지붕: 처마(가로 w × 세로 d, 높이 y)에서 가운데 꼭대기까지 오목하게 */
  function peak(S, cx, cz, w, d, y, rise, c) {
    const lv = [[1, 0], [0.5, 0.42], [0.16, 0.8], [0, 1]]; // [처마에서 줄어든 비율, 높이 비율]
    for (let i = 0; i < lv.length - 1; i++) {
      const [r0, h0] = lv[i], [r1, h1] = lv[i + 1];
      const x0 = (w / 2) * r0, z0 = (d / 2) * r0, x1 = (w / 2) * r1, z1 = (d / 2) * r1, ya = y + rise * h0, yb = y + rise * h1;
      S.quad([cx - x0, ya, cz + z0], [cx + x0, ya, cz + z0], [cx + x1, yb, cz + z1], [cx - x1, yb, cz + z1], c, MAT.canvas);
      S.quad([cx + x0, ya, cz - z0], [cx - x0, ya, cz - z0], [cx - x1, yb, cz - z1], [cx + x1, yb, cz - z1], c, MAT.canvas);
      S.quad([cx + x0, ya, cz + z0], [cx + x0, ya, cz - z0], [cx + x1, yb, cz - z1], [cx + x1, yb, cz + z1], c, MAT.canvas);
      S.quad([cx - x0, ya, cz - z0], [cx - x0, ya, cz + z0], [cx - x1, yb, cz + z1], [cx - x1, yb, cz - z1], c, MAT.canvas);
    }
    S.cyl(cx, y + rise - 0.02, cz, 0.035, y + rise + 0.3, 0.012, c, 0, 6);
  }
  /** 처마 둘레의 늘어진 천 (드림) */
  function valance(S, x0, z0, x1, z1, y, drop, c) {
    S.quad([x0, y - drop, z1], [x1, y - drop, z1], [x1, y, z1], [x0, y, z1], c, MAT.canvas);
    S.quad([x1, y - drop, z0], [x0, y - drop, z0], [x0, y, z0], [x1, y, z0], c, MAT.canvas);
    S.quad([x1, y - drop, z1], [x1, y - drop, z0], [x1, y, z0], [x1, y, z1], c, MAT.canvas);
    S.quad([x0, y - drop, z0], [x0, y - drop, z1], [x0, y, z1], [x0, y, z0], c, MAT.canvas);
  }

  /* ── 의자: 모양마다. (0, 0)이 앉는 자리 가운데, 앞이 +z ── */
  function chair(S, style, c, lod) {
    if (style === '의자 커버') {
      const k = c || WHITE;
      S.box(-0.23, 0, -0.22, 0.23, 0.46, 0.23, k, MAT.fabric);
      S.box(-0.23, 0, -0.27, 0.23, 0.96, -0.2, k, MAT.fabric);
      if (!lod) S.box(-0.236, 0.6, -0.276, 0.236, 0.7, -0.194, GOLD, MAT.fabric);
      return;
    }
    if (style === '스툴') {
      const k = c || hex('#3f3f46');
      S.cyl(0, 0.42, 0, 0.17, 0.47, 0.17, k, MAT.fabric, lod ? 8 : 12);
      if (lod) S.cyl(0, 0, 0, 0.05, 0.42, 0.05, STEEL, MAT.metal, 6);
      else [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([i, j]) => S.beam([i * 0.16, 0, j * 0.16], [i * 0.1, 0.42, j * 0.1], 0.025, STEEL, MAT.metal));
      return;
    }
    if (style === '연회 의자') {
      const k = c || hex('#8c1c2b');
      S.box(-0.22, 0.42, -0.2, 0.22, 0.5, 0.22, k, MAT.fabric);
      S.box(-0.2, 0.52, -0.25, 0.2, 0.94, -0.2, k, MAT.fabric);
      if (lod) { S.box(-0.2, 0, -0.2, 0.2, 0.42, 0.2, shade(GOLD, 0.8)); return; }
      legs(S, 0.44, 0.44, 0.42, 0.028, GOLD, MAT.metal);
      S.box(-0.22, 0.42, -0.25, -0.19, 0.96, -0.22, GOLD, MAT.metal);
      S.box(0.19, 0.42, -0.25, 0.22, 0.96, -0.22, GOLD, MAT.metal);
      S.box(-0.22, 0.94, -0.25, 0.22, 0.97, -0.22, GOLD, MAT.metal);
      return;
    }
    if (style === '플라스틱') {
      const k = c || hex('#2f6fd0');
      S.box(-0.23, 0.4, -0.2, 0.23, 0.44, 0.23, k);
      S.box(-0.23, 0.44, -0.25, 0.23, 0.84, -0.2, k);
      if (lod) { S.box(-0.19, 0, -0.18, 0.19, 0.4, 0.19, shade(k, 0.8)); return; }
      S.box(-0.27, 0.44, -0.22, -0.23, 0.62, 0.2, k);
      S.box(0.23, 0.44, -0.22, 0.27, 0.62, 0.2, k);
      legs(S, 0.46, 0.44, 0.4, 0.04, k);
      return;
    }
    // 접이식
    const k = c || hex('#30343b');
    S.box(-0.2, 0.44, -0.19, 0.2, 0.47, 0.2, k);
    S.box(-0.2, 0.66, -0.215, 0.2, 0.85, -0.195, k);
    if (lod) { S.box(-0.17, 0, -0.17, 0.17, 0.44, 0.17, shade(STEEL, 0.55)); return; }
    [-0.19, 0.19].forEach((x) => {
      S.beam([x, 0, 0.2], [x, 0.85, -0.2], 0.022, STEEL, MAT.metal);
      S.beam([x, 0, -0.2], [x, 0.46, 0.18], 0.022, STEEL, MAT.metal);
    });
  }

  /* ── 사람: 앞이 +z ── */
  function person(S, style, rnd, lod) {
    const k = 0.94 + rnd() * 0.11;
    const skin = SKIN[Math.floor(rnd() * SKIN.length)], hair = HAIR[Math.floor(rnd() * HAIR.length)];
    let top, pants, shirt = null;
    if (style === '스태프') {
      top = rnd() < 0.5 ? hex('#f97316') : hex('#a3e635');
      pants = BLACK;
    } else if (style === '일반') {
      top = CASUAL[Math.floor(rnd() * CASUAL.length)];
      pants = PANTS[Math.floor(rnd() * PANTS.length)];
    } else {
      top = SUIT[Math.floor(rnd() * SUIT.length)];
      pants = shade(top, 0.92);
      shirt = WHITE;
    }
    const y = (v) => v * k;
    if (lod) {
      // 멀리서·많을 때: 상자 몇 개로
      S.box(-0.16, 0, -0.09, 0.16, y(0.86), 0.09, pants);
      S.box(-0.21, y(0.86), -0.11, 0.21, y(1.44), 0.11, top);
      S.box(-0.09, y(1.46), -0.1, 0.09, y(1.69), 0.1, skin, 0, { top: hair });
      return;
    }
    const seg = 8;
    [-0.09, 0.09].forEach((x) => {
      S.box(x - 0.055, 0, -0.1, x + 0.055, 0.07, 0.15, BLACK);                        // 신발
      S.tube([x, 0.06, 0], [x, y(0.9), 0], 0.062, 0.085, pants, 0, seg, false, false); // 다리
    });
    S.ball(0, y(0.93), 0, 0.175, 0.14, 0.125, pants, 0, seg, 5);                       // 골반
    S.ball(0, y(1.17), 0, 0.2, 0.31, 0.13, top, 0, seg, 6);                            // 몸통
    [-1, 1].forEach((s) => {
      S.tube([s * 0.215, y(1.38), 0], [s * 0.245, y(0.9), 0.02], 0.055, 0.045, top, 0, seg, false, false); // 팔
      S.ball(s * 0.248, y(0.855), 0.025, 0.04, 0.055, 0.035, skin, 0, 6, 4);           // 손
    });
    if (shirt) {
      S.quad([-0.05, y(1.22), 0.128], [0.05, y(1.22), 0.128], [0.075, y(1.43), 0.11], [-0.075, y(1.43), 0.11], shirt);
      S.quad([-0.016, y(1.14), 0.133], [0.016, y(1.14), 0.133], [0.02, y(1.41), 0.115], [-0.02, y(1.41), 0.115], rnd() < 0.5 ? hex('#9f1239') : hex('#1d4ed8'));
    } else if (style === '스태프') {
      S.box(-0.2, y(1.02), -0.135, 0.2, y(1.06), 0.135, WHITE); // 조끼의 반사 띠
    }
    S.cyl(0, y(1.42), 0, 0.05, y(1.5), 0.045, skin, 0, 6);
    S.ball(0, y(1.59), 0.005, 0.092, 0.112, 0.102, skin, 0, seg, 6);
    if (style === '스태프') {
      S.ball(0, y(1.655), -0.005, 0.1, 0.06, 0.108, top, 0, seg, 4);                   // 모자
      S.box(-0.07, y(1.63), 0.08, 0.07, y(1.645), 0.17, top);
    } else {
      S.ball(0, y(1.625), -0.022, 0.099, 0.092, 0.103, hair, 0, seg, 5);
    }
  }

  /* ── 나무 ── */
  function tree(S, w, h, style, rnd) {
    const r = w / 2;
    if (style === '침엽수') {
      S.cyl(0, 0, 0, r * 0.1, h * 0.25, r * 0.07, WOOD_DARK, 0, 8);
      const c = hex('#2f6b3a');
      for (let i = 0; i < 4; i++) {
        const y0 = h * (0.16 + i * 0.2), y1 = Math.min(h, y0 + h * 0.36);
        S.tube([0, y0, 0], [0, y1, 0], r * (0.95 - i * 0.2), 0, shade(c, 0.9 + i * 0.07), MAT.foliage, 12, true, false);
      }
      return;
    }
    const pink = style === '벚나무';
    const th = h * 0.42;
    S.cyl(0, 0, 0, r * 0.11, th, r * 0.07, pink ? hex('#4a3328') : WOOD_DARK, 0, 8);
    // 가지 몇 개
    for (let i = 0; i < 3; i++) {
      const a = rnd() * Math.PI * 2;
      S.tube([0, th * 0.8, 0], [Math.cos(a) * r * 0.45, th * 1.25, Math.sin(a) * r * 0.45], r * 0.05, r * 0.03, WOOD_DARK, 0, 6, false, false);
    }
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1)) * Math.PI * 2 + rnd(), top = i === n - 1;
      const rr = top ? 0 : r * (0.36 + rnd() * 0.12);
      const br = r * (top ? 0.62 : 0.5 + rnd() * 0.14);
      const base = pink ? mixc(hex('#f6b8cb'), hex('#fbd5e0'), rnd()) : LEAF[Math.floor(rnd() * LEAF.length)];
      S.ball(Math.cos(a) * rr, h * (top ? 0.78 : 0.56 + rnd() * 0.14), Math.sin(a) * rr, br, br * (top ? 0.75 : 0.82), br, base, MAT.foliage, 10, 6);
    }
  }

  /* ── 조감도 물건 ── w: 폭(x), d: 깊이(z), h: 높이. it: 도면 요소 */
  const EVENT = {
    '몽골텐트'(C, it, w, d, h) {
      const S = C.S, c = col(it, WHITE), p = 0.035;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([i, j]) => S.cyl(i * (w / 2 - p), 0, j * (d / 2 - p), p, h, p, CHROME, MAT.metal, 8));
      valance(S, -w / 2, -d / 2, w / 2, d / 2, h, 0.28, c);
      peak(S, 0, 0, w, d, h, Math.min(w, d) * 0.42, c);
      const side = (x0, z0, x1, z1) => S.quad([x0, 0.04, z0], [x1, 0.04, z1], [x1, h - 0.26, z1], [x0, h - 0.26, z0], c, MAT.canvas);
      if (it.variant === '뒤' || it.variant === '뒤·양옆') side(w / 2, -d / 2, -w / 2, -d / 2);
      if (it.variant === '뒤·양옆') { side(-w / 2, -d / 2, -w / 2, d / 2); side(w / 2, d / 2, w / 2, -d / 2); }
    },
    '대형 텐트'(C, it, w, d, h) {
      const S = C.S, c = col(it, WHITE), p = 0.05;
      const wide = w >= d, long = Math.max(w, d), short = Math.min(w, d);
      const post = (x, z) => S.cyl(x, 0, z, p, h, p, CHROME, MAT.metal, 8);
      if (it.variant === '박공 지붕') {
        // 긴 쪽으로 용마루가 지나는 A자 지붕
        const rise = short * 0.28, n = Math.max(1, Math.round(long / 5));
        for (let i = 0; i <= n; i++) {
          const t = -long / 2 + (long * i) / n;
          if (wide) { post(t, -d / 2 + p); post(t, d / 2 - p); } else { post(-w / 2 + p, t); post(w / 2 - p, t); }
        }
        if (wide) {
          S.quad([-w / 2, h, d / 2], [w / 2, h, d / 2], [w / 2, h + rise, 0], [-w / 2, h + rise, 0], c, MAT.canvas);
          S.quad([w / 2, h, -d / 2], [-w / 2, h, -d / 2], [-w / 2, h + rise, 0], [w / 2, h + rise, 0], c, MAT.canvas);
          [-1, 1].forEach((s) => S.tri([s * w / 2, h, -d / 2], [s * w / 2, h, d / 2], [s * w / 2, h + rise, 0], c, MAT.canvas));
        } else {
          S.quad([w / 2, h, d / 2], [w / 2, h, -d / 2], [0, h + rise, -d / 2], [0, h + rise, d / 2], c, MAT.canvas);
          S.quad([-w / 2, h, -d / 2], [-w / 2, h, d / 2], [0, h + rise, d / 2], [0, h + rise, -d / 2], c, MAT.canvas);
          [-1, 1].forEach((s) => S.tri([-w / 2, h, s * d / 2], [w / 2, h, s * d / 2], [0, h + rise, s * d / 2], c, MAT.canvas));
        }
        valance(S, -w / 2, -d / 2, w / 2, d / 2, h, 0.3, c);
        return;
      }
      // 칸마다 뾰족 지붕
      const n = Math.max(1, Math.round(long / short));
      const bay = long / n;
      for (let i = 0; i <= n; i++) {
        const t = -long / 2 + bay * i;
        if (wide) { post(t, -d / 2 + p); post(t, d / 2 - p); } else { post(-w / 2 + p, t); post(w / 2 - p, t); }
      }
      for (let i = 0; i < n; i++) {
        const t = -long / 2 + bay * (i + 0.5);
        if (wide) peak(S, t, 0, bay, d, h, short * 0.36, c); else peak(S, 0, t, w, bay, h, short * 0.36, c);
      }
      valance(S, -w / 2, -d / 2, w / 2, d / 2, h, 0.3, c);
    },
    '파라솔'(C, it, w, d, h) {
      const S = C.S, c = col(it, '#e9e4d4'), r = Math.min(w, d) / 2;
      S.cyl(0, 0, 0, 0.3, 0.07, 0.28, DARK, 0, 12);
      S.cyl(0, 0, 0, 0.025, h + 0.08, 0.025, CHROME, MAT.metal, 6);
      S.tube([0, h - r * 0.32, 0], [0, h, 0], r, 0.04, c, MAT.canvas, 8, false, false);
    },
    '무대'(C, it, w, d, h) {
      const S = C.S, top = col(it, '#d9742b');
      S.box(-w / 2, 0, -d / 2, w / 2, h, d / 2, BLACK, MAT.fabric, { top, topMat: MAT.fabric });
      S.box(-w / 2 - 0.01, h - 0.05, -d / 2 - 0.01, w / 2 + 0.01, h + 0.005, d / 2 + 0.01, hex('#2a2a2e'), MAT.metal, { top, topMat: MAT.fabric });
      if (it.variant === '트러스 지붕') {
        const q = 0.3, th = h + Math.max(4.2, Math.min(w, d) * 0.7), x = w / 2 - q / 2, z = d / 2 - q / 2;
        [[-x, -z], [x, -z], [x, z], [-x, z]].forEach(([px, pz]) => truss(S, [px, h, pz], [px, th, pz], q, C.lod));
        truss(S, [-x, th, z], [x, th, z], q, C.lod);
        truss(S, [-x, th, -z], [x, th, -z], q, C.lod);
        truss(S, [-x, th, -z], [-x, th, z], q, C.lod);
        truss(S, [x, th, -z], [x, th, z], q, C.lod);
        // 지붕 천 (뒤로 살짝 기울어짐)과 앞 트러스의 조명
        S.quad([-w / 2, th + 0.25, d / 2], [w / 2, th + 0.25, d / 2], [w / 2, th + 0.05, -d / 2], [-w / 2, th + 0.05, -d / 2], hex('#22252b'), MAT.canvas);
        const n = Math.max(2, Math.round(w / 1.5));
        for (let i = 0; i < n; i++) {
          const lx = -x + ((i + 0.5) * 2 * x) / n;
          S.tube([lx, th - 0.2, z], [lx, th - 0.5, z + 0.12], 0.09, 0.11, BLACK, 0, 8);
          S.tube([lx, th - 0.5, z + 0.12], [lx, th - 0.505, z + 0.122], 0.1, 0.1, hex(['#ffe9a8', '#a8d4ff', '#ffb3d1'][i % 3]), MAT.emissive, 8);
        }
      }
    },
    '계단'(C, it, w, d, h) {
      const S = C.S, n = Math.max(2, Math.round(h / 0.18));
      for (let i = 0; i < n; i++) {
        // 앞(+z)에서 등(−z) 쪽으로 올라감
        const z1 = d / 2 - (d * i) / n, y = (h * (i + 1)) / n;
        S.box(-w / 2, 0, -d / 2, w / 2, y, z1, hex('#2b2c30'), MAT.fabric, { top: hex('#3a3c42') });
      }
    },
    '트러스'(C, it, w, d, h) {
      const S = C.S, q = Math.min(0.4, d), x = w / 2 - q / 2;
      truss(S, [-x, 0, 0], [-x, h, 0], q, C.lod);
      truss(S, [x, 0, 0], [x, h, 0], q, C.lod);
      truss(S, [-x, h - q / 2, 0], [x, h - q / 2, 0], q, C.lod);
      [-x, x].forEach((px) => S.box(px - q * 0.8, 0, -q * 0.8, px + q * 0.8, 0.03, q * 0.8, DARK, MAT.metal));
    },
    '부스'(C, it, w, d, h) {
      const S = C.S, t = 0.045, band = col(it, '#2563eb');
      C.D.quad([-w / 2, 0.012, d / 2], [w / 2, 0.012, d / 2], [w / 2, 0.012, -d / 2], [-w / 2, 0.012, -d / 2], hex('#8b8f97'), MAT.fabric);
      S.box(-w / 2, 0, -d / 2, w / 2, h, -d / 2 + t, WHITE);
      S.box(-w / 2, 0, -d / 2, -w / 2 + t, h, d / 2, WHITE);
      S.box(w / 2 - t, 0, -d / 2, w / 2, h, d / 2, WHITE);
      [[-1, 1], [1, 1]].forEach(([i, j]) => S.box(i * (w / 2 - 0.03) - 0.03, 0, j * (d / 2 - 0.03) - 0.03, i * (w / 2 - 0.03) + 0.03, h, j * (d / 2 - 0.03) + 0.03, CHROME, MAT.metal));
      const fh = Math.min(0.5, h * 0.2);
      S.box(-w / 2, h - fh, d / 2 - 0.04, w / 2, h, d / 2, band);
      C.face([[-w / 2 + 0.05, h - fh + 0.03, d / 2 + 0.004], [w / 2 - 0.05, h - fh + 0.03, d / 2 + 0.004], [w / 2 - 0.05, h - 0.03, d / 2 + 0.004], [-w / 2 + 0.05, h - 0.03, d / 2 + 0.004]],
        faceCanvas(it, (w - 0.1) / (fh - 0.06), { bg: band, plain: true, text: it.text || '부스' }));
      // 안내 탁자
      const cw = Math.min(1.2, w * 0.45);
      S.box(-w / 2 + 0.25, 0, d / 2 - 0.75, -w / 2 + 0.25 + cw, 0.95, d / 2 - 0.3, WHITE, 0, { top: band });
    },
    '에어아치'(C, it, w, d, h) {
      const S = C.S, c = col(it, '#2563eb'), r = Math.min(d / 2, w * 0.09, 0.55), x = w / 2 - r, cr = Math.min(1.1, h * 0.3);
      // 기둥 → 둥근 모서리 → 가로대
      const pts = [[-x, 0], [-x, h - r - cr]];
      for (let i = 1; i <= 5; i++) { const a = (i / 5) * Math.PI / 2; pts.push([-x + cr - Math.cos(a) * cr, h - r - cr + Math.sin(a) * cr]); }
      for (let i = 4; i >= 0; i--) { const a = (i / 5) * Math.PI / 2; pts.push([x - cr + Math.cos(a) * cr, h - r - cr + Math.sin(a) * cr]); }
      pts.push([x, 0]);
      for (let i = 0; i < pts.length - 1; i++) S.tube([pts[i][0], pts[i][1], 0], [pts[i + 1][0], pts[i + 1][1], 0], r, r, c, MAT.canvas, 12, i === 0, i === pts.length - 2);
      pts.slice(1, -1).forEach((p) => S.ball(p[0], p[1], 0, r, r, r, c, MAT.canvas, 12, 6));
      // 가로대 아래 현수막
      const bw = w - 2 * (r * 2 + cr * 0.4), bh = Math.min(1.0, h * 0.24), by = h - 2 * r - 0.05;
      if (bw > 0.6) {
        const cv = faceCanvas(it, bw / bh, { bg: WHITE, plain: true, text: it.text || '환영합니다' });
        S.box(-bw / 2, by - bh, -0.012, bw / 2, by, 0.012, WHITE, 0, { bottom: true });
        C.face([[-bw / 2, by - bh, 0.016], [bw / 2, by - bh, 0.016], [bw / 2, by, 0.016], [-bw / 2, by, 0.016]], cv);
        C.face([[bw / 2, by - bh, -0.016], [-bw / 2, by - bh, -0.016], [-bw / 2, by, -0.016], [bw / 2, by, -0.016]], cv);
      }
    },
    '의자 배열'(C, it, w, d) {
      const L = App.catalog.seatLayout(it), c = it.color ? hex(it.color) : null;
      const lod = C.lod || L.count > 500;
      for (let r = 0; r < L.rows; r++) {
        const [c0, c1] = L.rowRange(r);
        for (let i = c0; i < c1; i++) {
          C.at(-w / 2 + L.xs[i] / 1000, -d / 2 + (r * L.ph) / 1000 + 0.3); // 자리 배치는 mm
          chair(C.S, it.style, c, lod);
        }
      }
      C.at(0, 0);
    },
    '의자'(C, it) {
      chair(C.S, it.style, it.color ? hex(it.color) : null, C.lod);
    },
    '원형 테이블'(C, it, w, d, h) {
      const S = C.S, r = Math.min(w, d) / 2, cloth = col(it, WHITE);
      S.cyl(0, 0.12, 0, r * 0.97, h, r, cloth, MAT.fabric, 24);
      S.cyl(0, 0, 0, 0.05, 0.12, 0.05, DARK, MAT.metal, 6);
      const n = (App.catalog.seats(it) || { count: 0 }).count;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        // 등받이가 바깥쪽 (탁자를 보고 앉음)
        C.at(Math.sin(a) * (r + 0.33), -Math.cos(a) * (r + 0.33), (a * 180) / Math.PI);
        chair(C.S, it.style, null, C.lod);
      }
      C.at(0, 0);
      if (!C.lod) { S.cyl(0, h, 0, 0.09, h + 0.02, 0.09, hex('#e5e7eb'), 0, 10); S.cyl(0, h + 0.02, 0, 0.03, h + 0.26, 0.05, hex('#d9485f'), 0, 8); }
    },
    '테이블'(C, it, w, d, h) {
      const S = C.S;
      if (it.color) S.box(-w / 2, 0.08, -d / 2, w / 2, h, d / 2, hex(it.color), MAT.fabric);
      else {
        S.box(-w / 2, h - 0.04, -d / 2, w / 2, h, d / 2, WHITE);
        legs(S, w, d, h - 0.04, 0.04, STEEL, MAT.metal, 0.05);
      }
      const n = (App.catalog.seats(it) || { count: 0 }).count, top = Math.ceil(n / 2), bottom = n - top;
      for (let i = 0; i < top; i++) { C.at(-w / 2 + ((i + 0.5) * w) / top, -d / 2 - 0.3, 0); chair(C.S, it.style, null, C.lod); }
      for (let i = 0; i < bottom; i++) { C.at(-w / 2 + ((i + 0.5) * w) / bottom, d / 2 + 0.3, 180); chair(C.S, it.style, null, C.lod); }
      C.at(0, 0);
    },
    '스탠딩 테이블'(C, it, w, d, h) {
      const S = C.S, r = Math.min(w, d) / 2, c = col(it, WHITE);
      S.tube([0, 0, 0], [0, h * 0.55, 0], r * 0.72, r * 0.3, c, MAT.fabric, 16, false, false);
      S.tube([0, h * 0.55, 0], [0, h - 0.03, 0], r * 0.3, r, c, MAT.fabric, 16, false, false);
      S.cyl(0, h - 0.03, 0, r, h, r, c, MAT.fabric, 16);
    },
    '스피커'(C, it, w, d, h) {
      const S = C.S, bh = Math.min(0.72, h * 0.42), y = h - bh;
      [0, 2.1, 4.2].forEach((a) => S.beam([0, y * 0.55, 0], [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5], 0.03, BLACK, MAT.metal));
      S.cyl(0, 0, 0, 0.02, y, 0.02, BLACK, MAT.metal, 6);
      S.box(-w / 2, y, -d / 2, w / 2, h, d / 2, BLACK);
      S.quad([-w / 2 + 0.03, y + 0.03, d / 2 + 0.003], [w / 2 - 0.03, y + 0.03, d / 2 + 0.003], [w / 2 - 0.03, h - 0.03, d / 2 + 0.003], [-w / 2 + 0.03, h - 0.03, d / 2 + 0.003], hex('#2a2b30'));
      S.tube([0, y + bh * 0.35, d / 2 + 0.004], [0, y + bh * 0.35, d / 2 + 0.012], w * 0.3, w * 0.3, hex('#1f2023'), 0, 14);
      S.tube([0, y + bh * 0.78, d / 2 + 0.004], [0, y + bh * 0.78, d / 2 + 0.012], w * 0.14, w * 0.14, hex('#1f2023'), 0, 10);
    },
    '라인어레이'(C, it, w, d, h) {
      const S = C.S, n = Math.max(2, it.units || 5);
      // 아래에 서브우퍼 두 단, 그 위에 라인어레이 스피커를 쌓음
      const sub = Math.min(0.62, (h * 0.36) / 2), uh = (h - sub * 2) / n;
      const grille = (x0, y0, x1, y1, z) => S.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], hex('#2a2b30'));
      for (let i = 0; i < 2; i++) {
        S.box(-w / 2, i * sub, -d / 2, w / 2, (i + 1) * sub - 0.015, d / 2, BLACK);
        grille(-w / 2 + 0.05, i * sub + 0.05, w / 2 - 0.05, (i + 1) * sub - 0.06, d / 2 + 0.004);
      }
      const uw = w * 0.92, ud = d * 0.72;
      for (let i = 0; i < n; i++) {
        const y0 = sub * 2 + i * uh, lean = (i / n) * 0.1; // 위로 갈수록 살짝 뒤로
        S.box(-uw / 2, y0 + 0.012, -ud / 2 - lean, uw / 2, y0 + uh - 0.012, ud / 2 - lean, BLACK);
        grille(-uw / 2 + 0.04, y0 + 0.035, uw / 2 - 0.04, y0 + uh - 0.035, ud / 2 - lean + 0.004);
        S.box(-uw / 2 - 0.02, y0 + uh * 0.3, -ud / 2 - lean + 0.05, -uw / 2, y0 + uh * 0.7, ud / 2 - lean - 0.05, STEEL, MAT.metal);
        S.box(uw / 2, y0 + uh * 0.3, -ud / 2 - lean + 0.05, uw / 2 + 0.02, y0 + uh * 0.7, ud / 2 - lean - 0.05, STEEL, MAT.metal);
      }
    },
    '모니터 스피커'(C, it, w, d, h) {
      const S = C.S;
      // 옆에서 본 쐐기 모양: 비스듬한 앞면이 위를 봄
      const pr = [[-d / 2, 0], [d / 2, 0], [d / 2, h * 0.3], [-d / 2 + d * 0.18, h], [-d / 2, h * 0.92]];
      S.extrude(pr, -w / 2, w / 2, BLACK, 0, 'x');
      const a = [d / 2 - 0.02, h * 0.33], b = [-d / 2 + d * 0.2, h * 0.97];
      const up = 0.006;
      S.quad([-w / 2 + 0.04, a[1] + up, a[0]], [w / 2 - 0.04, a[1] + up, a[0]], [w / 2 - 0.04, b[1] + up, b[0]], [-w / 2 + 0.04, b[1] + up, b[0]], hex('#2a2b30'));
    },
    '콘솔 데스크'(C, it, w, d, h) {
      const S = C.S, th = Math.min(0.78, h * 0.72);
      S.box(-w / 2, th - 0.04, -d / 2, w / 2, th, d / 2, BLACK, MAT.fabric);
      legs(S, w, d, th - 0.04, 0.05, DARK, MAT.metal, 0.04);
      S.box(-w / 2, 0.1, -d / 2, w / 2, th - 0.04, -d / 2 + 0.02, BLACK, MAT.fabric);
      // 믹서: 비스듬한 판
      const pr = [[-d * 0.3, th], [d * 0.3, th], [d * 0.3, th + 0.06], [-d * 0.3, th + 0.22]];
      S.extrude(pr, -w * 0.3, w * 0.3, hex('#2f3138'), MAT.metal, 'x');
      for (let i = 0; i < 10; i++) {
        const x = -w * 0.27 + (i * w * 0.54) / 9;
        S.quad([x - 0.012, th + 0.075, d * 0.25], [x + 0.012, th + 0.075, d * 0.25], [x + 0.012, th + 0.2, -d * 0.24], [x - 0.012, th + 0.2, -d * 0.24], i % 3 ? hex('#9ca3af') : hex('#f97316'));
      }
      S.box(w * 0.34, th, -d * 0.2, w * 0.47, th + 0.02, d * 0.1, hex('#9ca3af'), MAT.metal);
      S.quad([w * 0.34, th + 0.02, -d * 0.2], [w * 0.47, th + 0.02, -d * 0.2], [w * 0.47, th + 0.24, -d * 0.26], [w * 0.34, th + 0.24, -d * 0.26], hex('#6fa8ff'), MAT.emissive);
    },
    'LED 스크린'(C, it, w, d, h) {
      const S = C.S, y0 = h > 2.2 ? Math.min(0.9, h * 0.22) : 0.05, t = Math.min(0.14, d);
      S.box(-w / 2, y0, -t / 2, w / 2, h, t / 2, BLACK);
      C.face([[-w / 2 + 0.04, y0 + 0.04, t / 2 + 0.004], [w / 2 - 0.04, y0 + 0.04, t / 2 + 0.004], [w / 2 - 0.04, h - 0.04, t / 2 + 0.004], [-w / 2 + 0.04, h - 0.04, t / 2 + 0.004]],
        faceCanvas(it, (w - 0.08) / (h - y0 - 0.08), { bg: hex('#0b1020'), led: true }), 'solid', true);
      // 뒤쪽 받침
      [-w / 2 + 0.3, w / 2 - 0.3].forEach((x) => {
        truss(S, [x, 0, -0.25], [x, h * 0.9, -0.25], 0.26, true);
        S.box(x - 0.4, 0, -0.9, x + 0.4, 0.05, 0.25, DARK, MAT.metal);
      });
    },
    '조명 타워'(C, it, w, d, h) {
      const S = C.S, q = Math.min(0.3, w * 0.5);
      S.box(-w / 2, 0, -d / 2, w / 2, 0.05, d / 2, DARK, MAT.metal);
      truss(S, [0, 0.05, 0], [0, h, 0], q, C.lod);
      S.beam([-0.9, h, 0], [0.9, h, 0], 0.06, BLACK, MAT.metal);
      [-0.75, -0.25, 0.25, 0.75].forEach((x) => {
        S.tube([x, h - 0.1, 0], [x, h - 0.38, 0.2], 0.1, 0.13, BLACK, 0, 8);
        S.tube([x, h - 0.38, 0.2], [x, h - 0.385, 0.203], 0.115, 0.115, hex('#fff3c4'), MAT.emissive, 8);
      });
    },
    '발전기'(C, it, w, d, h) {
      const S = C.S, c = hex('#e9ecef');
      S.box(-w / 2, 0, -d / 2, w / 2, 0.14, d / 2, DARK, MAT.metal);
      S.box(-w / 2 + 0.03, 0.14, -d / 2 + 0.03, w / 2 - 0.03, h, d / 2 - 0.03, c, MAT.gloss);
      for (let i = 0; i < 5; i++) {
        const y = 0.3 + i * 0.1;
        S.quad([-w / 2 + 0.2, y, d / 2 - 0.027], [-w / 2 + 0.2 + w * 0.3, y, d / 2 - 0.027], [-w / 2 + 0.2 + w * 0.3, y + 0.05, d / 2 - 0.027], [-w / 2 + 0.2, y + 0.05, d / 2 - 0.027], DARK);
      }
      S.quad([w * 0.08, h * 0.45, d / 2 - 0.027], [w * 0.38, h * 0.45, d / 2 - 0.027], [w * 0.38, h * 0.85, d / 2 - 0.027], [w * 0.08, h * 0.85, d / 2 - 0.027], hex('#3b4252'), MAT.metal);
      S.box(-w / 2 + 0.03, h * 0.55, -d / 2 + 0.026, w / 2 - 0.03, h * 0.62, d / 2 - 0.026, hex('#2563eb'));
      S.cyl(w / 2 - 0.3, h, 0, 0.05, h + 0.3, 0.05, DARK, MAT.metal, 8);
    },
    '백월'(C, it, w, d, h) { board(C, it, w, d, h, { bg: col(it, '#1e3a8a') }); },
    '포토월'(C, it, w, d, h) { board(C, it, w, d, h, { bg: col(it, '#ec4899'), repeat: true }); },
    '현수막'(C, it, w, d, h) {
      const S = C.S, x = w / 2 - 0.06, bh = Math.min(0.9, h * 0.32), top = h - 0.15;
      [-x, x].forEach((px) => {
        S.cyl(px, 0, 0, 0.035, h, 0.03, CHROME, MAT.metal, 8);
        S.cyl(px, 0, 0, 0.22, 0.06, 0.2, DARK, 0, 10);
      });
      const cv = faceCanvas(it, (2 * x - 0.1) / bh, { bg: col(it, WHITE), plain: !it.text && !it.imageId });
      S.box(-x + 0.05, top - bh, -0.006, x - 0.05, top, 0.006, col(it, WHITE), 0, { bottom: true });
      C.face([[-x + 0.05, top - bh, 0.01], [x - 0.05, top - bh, 0.01], [x - 0.05, top, 0.01], [-x + 0.05, top, 0.01]], cv);
      C.face([[x - 0.05, top - bh, -0.01], [-x + 0.05, top - bh, -0.01], [-x + 0.05, top, -0.01], [x - 0.05, top, -0.01]], cv);
    },
    'X배너'(C, it, w, d, h) {
      const S = C.S, lean = 0.22;
      S.beam([-w / 2, 0, 0.05], [w / 2, h, -lean], 0.02, DARK, MAT.metal);
      S.beam([w / 2, 0, 0.05], [-w / 2, h, -lean], 0.02, DARK, MAT.metal);
      S.beam([0, h * 0.5, -lean / 2], [0, 0, -d / 2 - 0.15], 0.02, DARK, MAT.metal);
      const z0 = 0.075, z1 = -lean + 0.025;
      S.quad([-w / 2, 0.05, z0 - 0.006], [w / 2, 0.05, z0 - 0.006], [w / 2, h, z1 - 0.006], [-w / 2, h, z1 - 0.006], WHITE);
      C.face([[-w / 2, 0.05, z0], [w / 2, 0.05, z0], [w / 2, h, z1], [-w / 2, h, z1]], faceCanvas(it, w / (h - 0.05), { bg: col(it, '#0ea5e9') }));
    },
    '안내판'(C, it, w, d, h) {
      const S = C.S, bh = Math.min(0.5, h * 0.36);
      S.cyl(0, 0, 0, 0.2, 0.03, 0.2, DARK, MAT.metal, 12);
      S.cyl(0, 0, 0, 0.022, h - bh, 0.022, CHROME, MAT.metal, 6);
      S.box(-w / 2, h - bh, -0.015, w / 2, h, 0.015, DARK);
      C.face([[-w / 2 + 0.02, h - bh + 0.02, 0.019], [w / 2 - 0.02, h - bh + 0.02, 0.019], [w / 2 - 0.02, h - 0.02, 0.019], [-w / 2 + 0.02, h - 0.02, 0.019]],
        faceCanvas(it, (w - 0.04) / (bh - 0.04), { bg: col(it, WHITE), plain: true, text: it.text || '안내' }));
    },
    '깃발'(C, it, w, d, h) {
      const S = C.S, c = col(it, '#2563eb'), fw = Math.min(1.5, h * 0.3), fh = fw * 0.66;
      S.cyl(0, 0, 0, 0.14, 0.05, 0.12, DARK, 0, 10);
      S.cyl(0, 0, 0, 0.03, h, 0.02, CHROME, MAT.metal, 8);
      S.ball(0, h + 0.03, 0, 0.045, 0.045, 0.045, GOLD, MAT.metal, 8, 5);
      // 바람에 살짝 물결치는 깃발
      const n = 5;
      for (let i = 0; i < n; i++) {
        const x0 = 0.03 + (fw * i) / n, x1 = 0.03 + (fw * (i + 1)) / n;
        const z0 = Math.sin(i * 1.3) * 0.07 * (i / n), z1 = Math.sin((i + 1) * 1.3) * 0.07 * ((i + 1) / n);
        S.quad([x0, h - 0.1 - fh, z0], [x1, h - 0.1 - fh, z1], [x1, h - 0.1, z1], [x0, h - 0.1, z0], c, MAT.canvas);
      }
    },
    '연단'(C, it, w, d, h) {
      const S = C.S, c = col(it, WOOD_DARK);
      S.box(-w / 2 + 0.04, 0, -d / 2 + 0.06, w / 2 - 0.04, h - 0.1, d / 2 - 0.04, c, MAT.grain);
      S.box(-w / 2, 0, -d / 2 + 0.02, w / 2, 0.06, d / 2, shade(c, 0.8), MAT.grain);
      // 비스듬한 윗판 (말하는 사람 쪽인 등 쪽이 낮음)
      const pr = [[-d / 2, h - 0.12], [d / 2, h - 0.02], [d / 2, h + 0.02], [-d / 2, h - 0.08]];
      S.extrude(pr, -w / 2, w / 2, shade(c, 1.15), MAT.grain, 'x');
      S.quad([-w * 0.3, h * 0.35, d / 2 - 0.036], [w * 0.3, h * 0.35, d / 2 - 0.036], [w * 0.3, h * 0.75, d / 2 - 0.036], [-w * 0.3, h * 0.75, d / 2 - 0.036], GOLD, MAT.metal);
      S.beam([0.12, h - 0.06, -0.05], [0.1, h + 0.22, -0.16], 0.012, BLACK, MAT.metal);
      S.ball(0.1, h + 0.23, -0.17, 0.022, 0.03, 0.022, BLACK, 0, 6, 4);
    },
    '레드카펫'(C, it, w, d) {
      C.D.quad([-w / 2, 0.014, d / 2], [w / 2, 0.014, d / 2], [w / 2, 0.014, -d / 2], [-w / 2, 0.014, -d / 2], col(it, '#c81e2b'), MAT.fabric);
    },
    '바닥 이미지'(C, it, w, d) {
      const pts = [[-w / 2, 0.016, d / 2], [w / 2, 0.016, d / 2], [w / 2, 0.016, -d / 2], [-w / 2, 0.016, -d / 2]];
      if (it.imageId || it.text) C.face(pts, faceCanvas(it, w / d, { bg: WHITE, plain: true }), 'decal');
      else C.D.quad(pts[0], pts[1], pts[2], pts[3], hex('#e5e7eb'));
    },
    '테이프 커팅'(C, it, w, d, h) {
      const S = C.S, c = col(it, '#d92d20'), n = Math.max(1, Math.round(w / 1.5));
      for (let i = 0; i <= n; i++) {
        const x = -w / 2 + 0.06 + ((w - 0.12) * i) / n;
        S.cyl(x, 0, 0, 0.14, 0.03, 0.14, GOLD, MAT.metal, 12);
        S.cyl(x, 0, 0, 0.022, h, 0.022, GOLD, MAT.metal, 8);
        S.ball(x, h + 0.02, 0, 0.04, 0.04, 0.04, GOLD, MAT.metal, 8, 5);
        if (i < n) {
          // 살짝 처진 리본과 가운데 꽃 매듭
          const x1 = -w / 2 + 0.06 + ((w - 0.12) * (i + 1)) / n, mx = (x + x1) / 2, y = h - 0.1;
          S.quad([x, y - 0.05, 0], [mx, y - 0.11, 0], [mx, y - 0.01, 0], [x, y + 0.05, 0], c, MAT.fabric);
          S.quad([mx, y - 0.11, 0], [x1, y - 0.05, 0], [x1, y + 0.05, 0], [mx, y - 0.01, 0], c, MAT.fabric);
          S.ball(mx, y - 0.06, 0.02, 0.1, 0.1, 0.05, c, MAT.fabric, 8, 5);
        }
      }
    },
    '화분'(C, it, w, d, h) {
      const S = C.S, r = Math.min(w, d) / 2, fl = col(it, '#ec4899');
      if (it.style === '꽃 화단') {
        S.box(-w / 2, 0, -d / 2, w / 2, 0.35, d / 2, hex('#8a5a3c'), MAT.wood, { top: hex('#4a3626'), topMat: MAT.soil });
        const n = Math.max(3, Math.round((w * d) / 0.05));
        for (let i = 0; i < n; i++) {
          const x = (C.rnd() - 0.5) * (w - 0.2), z = (C.rnd() - 0.5) * (d - 0.2), s = 0.07 + C.rnd() * 0.05;
          S.ball(x, 0.42 + C.rnd() * 0.08, z, s * 1.5, s, s * 1.5, i % 3 ? fl : LEAF[i % 4], i % 3 ? 0 : MAT.foliage, 6, 4);
        }
        return;
      }
      if (it.style === '축하 화환') {
        // 삼단 화환: 세 다리 받침에 둥근 꽃판 두 개와 리본
        const H = Math.max(h, 1.9);
        [-1, 1].forEach((s) => S.beam([s * r * 0.8, 0, 0.1], [0, H * 0.95, -0.12], 0.025, WHITE));
        S.beam([0, 0, -r * 0.9], [0, H * 0.95, -0.12], 0.025, WHITE);
        [[H * 0.74, r * 1.05], [H * 0.4, r * 0.8]].forEach(([y, rr], k) => {
          S.tube([0, y, -0.02], [0, y, 0.05], rr, rr, LEAF[k], MAT.foliage, 16);
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            S.ball(Math.cos(a) * rr * 0.72, y + Math.sin(a) * rr * 0.72, 0.07, rr * 0.2, rr * 0.2, 0.06, i % 2 ? fl : WHITE, 0, 6, 4);
          }
          S.ball(0, y, 0.08, rr * 0.36, rr * 0.36, 0.07, k ? hex('#fde047') : fl, 0, 8, 4);
        });
        [-1, 1].forEach((s) => S.quad([s * 0.16 - 0.07, 0.25, 0.09], [s * 0.16 + 0.07, 0.25, 0.09], [s * 0.1 + 0.07, H * 0.62, 0.09], [s * 0.1 - 0.07, H * 0.62, 0.09], WHITE, MAT.fabric));
        return;
      }
      S.tube([0, 0, 0], [0, h * 0.36, 0], r * 0.55, r * 0.75, hex('#b4552d'), 0, 12, false, false);
      S.disc(0, h * 0.34, 0, r * 0.72, hex('#4a3626'), MAT.soil, 12);
      S.ball(0, h * 0.68, 0, r * 0.95, h * 0.34, r * 0.95, LEAF[1], MAT.foliage, 10, 6);
      if (it.color) for (let i = 0; i < 7; i++) { const a = i * 0.9; S.ball(Math.cos(a) * r * 0.6, h * (0.72 + 0.1 * Math.sin(i * 2.1)), Math.sin(a) * r * 0.6, 0.07, 0.07, 0.07, fl, 0, 6, 4); }
    },
    '데스크'(C, it, w, d, h) {
      const S = C.S, c = col(it, WHITE);
      S.box(-w / 2, 0, -d / 2 + 0.05, w / 2, h - 0.04, d / 2 - 0.02, c);
      S.box(-w / 2 - 0.02, h - 0.04, -d / 2, w / 2 + 0.02, h, d / 2, hex('#e7e2d6'), MAT.grain);
      const band = it.color ? shade(c, 0.85) : hex('#2563eb');
      C.face([[-w / 2 + 0.04, h * 0.22, d / 2 - 0.016], [w / 2 - 0.04, h * 0.22, d / 2 - 0.016], [w / 2 - 0.04, h * 0.82, d / 2 - 0.016], [-w / 2 + 0.04, h * 0.82, d / 2 - 0.016]],
        faceCanvas(it, (w - 0.08) / (h * 0.6), { bg: band, plain: true, text: it.text || '안내' }));
    },
    '이동식 화장실'(C, it, w, d, h) {
      const S = C.S, c = col(it, '#2b6cb0');
      S.box(-w / 2, 0, -d / 2, w / 2, 0.12, d / 2, DARK);
      S.box(-w / 2 + 0.03, 0.12, -d / 2 + 0.03, w / 2 - 0.03, h - 0.14, d / 2 - 0.03, c);
      S.box(-w / 2, h - 0.14, -d / 2, w / 2, h, d / 2, WHITE);
      S.quad([-w * 0.3, 0.2, d / 2 - 0.026], [w * 0.3, 0.2, d / 2 - 0.026], [w * 0.3, h - 0.3, d / 2 - 0.026], [-w * 0.3, h - 0.3, d / 2 - 0.026], shade(c, 1.2));
      S.box(w * 0.2, h * 0.45, d / 2 - 0.026, w * 0.24, h * 0.52, d / 2 + 0.01, CHROME, MAT.metal);
      [-1, 1].forEach((s) => S.quad([s * w / 2 - s * 0.027, h - 0.5, -d * 0.3], [s * w / 2 - s * 0.027, h - 0.5, d * 0.3], [s * w / 2 - s * 0.027, h - 0.3, d * 0.3], [s * w / 2 - s * 0.027, h - 0.3, -d * 0.3], DARK));
      C.face([[-w * 0.2, h - 0.62, d / 2 - 0.02], [w * 0.2, h - 0.62, d / 2 - 0.02], [w * 0.2, h - 0.36, d / 2 - 0.02], [-w * 0.2, h - 0.36, d / 2 - 0.02]],
        faceCanvas(null, (w * 0.4) / 0.26, { bg: WHITE, plain: true, text: '화장실' }));
    },
    '푸드트럭'(C, it, w, d, h) {
      const S = C.S, c = col(it, '#f59e0b'), cab = Math.min(1.7, w * 0.28), y0 = 0.45;
      const bx = w / 2 - cab; // 짐칸과 운전석 경계
      S.box(-w / 2, y0, -d / 2, bx, h, d / 2, c, MAT.gloss, { bottom: true });
      S.box(bx, y0, -d / 2 + 0.05, w / 2, h * 0.68, d / 2 - 0.05, WHITE, MAT.gloss, { bottom: true });
      S.quad([w / 2 + 0.004, h * 0.4, d / 2 - 0.15], [w / 2 + 0.004, h * 0.4, -d / 2 + 0.15], [w / 2 + 0.004, h * 0.64, -d / 2 + 0.15], [w / 2 + 0.004, h * 0.64, d / 2 - 0.15], WINDOW, MAT.window);
      [-1, 1].forEach((s) => S.quad([bx + 0.15, h * 0.4, s * (d / 2 - 0.046)], [w / 2 - 0.2, h * 0.4, s * (d / 2 - 0.046)], [w / 2 - 0.2, h * 0.64, s * (d / 2 - 0.046)], [bx + 0.15, h * 0.64, s * (d / 2 - 0.046)], WINDOW, MAT.window));
      // 판매 창(앞쪽 +z)과 차양, 선반
      const sx0 = -w / 2 + 0.4, sx1 = bx - 0.4, sy0 = y0 + 0.75, sy1 = h - 0.45;
      S.quad([sx0, sy0, d / 2 + 0.004], [sx1, sy0, d / 2 + 0.004], [sx1, sy1, d / 2 + 0.004], [sx0, sy1, d / 2 + 0.004], hex('#2b2118'));
      S.quad([sx0 - 0.1, sy1 - 0.1, d / 2 + 0.9], [sx1 + 0.1, sy1 - 0.1, d / 2 + 0.9], [sx1 + 0.1, sy1 + 0.2, d / 2], [sx0 - 0.1, sy1 + 0.2, d / 2], WHITE, MAT.canvas);
      S.box(sx0, sy0 - 0.04, d / 2, sx1, sy0, d / 2 + 0.35, STEEL, MAT.metal);
      [[-w / 2 + 0.9, 1], [-w / 2 + 0.9, -1], [w / 2 - 0.85, 1], [w / 2 - 0.85, -1]].forEach(([x, s]) => wheel(S, x, s * (d / 2 - 0.14), 0.4, 0.26));
      S.quad([w / 2 + 0.004, y0 + 0.1, 0.5], [w / 2 + 0.004, y0 + 0.1, 0.8], [w / 2 + 0.004, y0 + 0.25, 0.8], [w / 2 + 0.004, y0 + 0.25, 0.5], hex('#fff7d6'), MAT.emissive);
      S.quad([w / 2 + 0.004, y0 + 0.1, -0.8], [w / 2 + 0.004, y0 + 0.1, -0.5], [w / 2 + 0.004, y0 + 0.25, -0.5], [w / 2 + 0.004, y0 + 0.25, -0.8], hex('#fff7d6'), MAT.emissive);
    },
    '쓰레기통'(C, it, w, d, h) {
      const S = C.S, c = col(it, '#3f7d3a'), r = Math.min(w, d) / 2;
      S.cyl(0, 0, 0, r * 0.82, h * 0.9, r * 0.95, c, 0, 14);
      S.cyl(0, h * 0.9, 0, r, h, r * 0.9, shade(c, 0.75), 0, 14);
      S.disc(0, h + 0.001, 0, r * 0.45, BLACK, 0, 12);
    },
    '펜스'(C, it, w, d, h) {
      const S = C.S, n = Math.max(1, Math.round(w / 2.2));
      for (let k = 0; k < n; k++) {
        const x0 = -w / 2 + (w * k) / n + 0.02, x1 = -w / 2 + (w * (k + 1)) / n - 0.02;
        S.beam([x0, h, 0], [x1, h, 0], 0.035, CHROME, MAT.metal);
        S.beam([x0, 0.18, 0], [x1, 0.18, 0], 0.03, CHROME, MAT.metal);
        S.beam([x0, 0, 0], [x0, h, 0], 0.035, CHROME, MAT.metal);
        S.beam([x1, 0, 0], [x1, h, 0], 0.035, CHROME, MAT.metal);
        const bars = C.lod ? 5 : Math.max(4, Math.round((x1 - x0) / 0.14));
        for (let i = 1; i < bars; i++) { const x = x0 + ((x1 - x0) * i) / bars; S.beam([x, 0.18, 0], [x, h, 0], 0.014, CHROME, MAT.metal); }
        [x0 + 0.1, x1 - 0.1].forEach((x) => S.beam([x, 0.02, -0.28], [x, 0.02, 0.28], 0.04, CHROME, MAT.metal));
      }
    },
    '차단봉'(C, it, w, d, h) {
      const S = C.S, c = col(it, '#b91c1c'), n = Math.max(1, Math.round(w / 2));
      for (let i = 0; i <= n; i++) {
        const x = -w / 2 + 0.17 + ((w - 0.34) * i) / n;
        S.cyl(x, 0, 0, 0.17, 0.03, 0.16, CHROME, MAT.metal, 14);
        S.cyl(x, 0, 0, 0.028, h, 0.028, CHROME, MAT.metal, 8);
        S.ball(x, h, 0, 0.045, 0.03, 0.045, CHROME, MAT.metal, 8, 4);
        if (i < n) {
          const x1 = -w / 2 + 0.17 + ((w - 0.34) * (i + 1)) / n, mx = (x + x1) / 2, y = h - 0.08;
          S.quad([x, y - 0.025, 0], [mx, y - 0.075, 0], [mx, y - 0.025, 0], [x, y + 0.025, 0], c, MAT.fabric);
          S.quad([mx, y - 0.075, 0], [x1, y - 0.025, 0], [x1, y + 0.025, 0], [mx, y - 0.025, 0], c, MAT.fabric);
        }
      }
    },
    '러버콘'(C, it, w, d, h) {
      const S = C.S, r = Math.min(w, d) / 2, o = hex('#f2661b');
      S.box(-r, 0, -r, r, 0.03, r, o);
      const rAt = (t) => r * 0.72 * (1 - t) + 0.03 * t;
      [[0, 0.35, o], [0.35, 0.5, WHITE], [0.5, 0.66, o], [0.66, 0.8, WHITE], [0.8, 1, o]].forEach(([a, b, k]) => S.tube([0, 0.03 + (h - 0.03) * a, 0], [0, 0.03 + (h - 0.03) * b, 0], rAt(a), rAt(b), k, 0, 12, false, b === 1));
    },
    '소화기'(C, it, w, d, h) {
      const S = C.S, r = 0.075;
      S.cyl(0, 0, 0, r, h * 0.78, r, hex('#d11a1a'), MAT.gloss, 12);
      S.ball(0, h * 0.78, 0, r, r * 0.6, r, hex('#d11a1a'), MAT.gloss, 12, 4);
      S.cyl(0, h * 0.82, 0, 0.025, h * 0.93, 0.025, BLACK, MAT.metal, 6);
      S.box(-0.02, h * 0.92, -0.02, 0.1, h, 0.02, BLACK);
      S.tube([0.02, h * 0.86, 0.02], [0.09, h * 0.4, 0.07], 0.012, 0.012, BLACK, 0, 5, false, false);
    },
    '사람'(C, it, w, d) {
      const n = Math.max(1, it.count || 1), per = Math.max(1, Math.min(n, it.perRow || 10)), rows = Math.ceil(n / per), cw = w / per;
      const lod = C.lod || C.crowd > 60;
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / per), c = i % per, inRow = r === rows - 1 ? n - per * (rows - 1) : per;
        C.at(-w / 2 + (w - inRow * cw) / 2 + (c + 0.5) * cw + (C.rnd() - 0.5) * 0.08, -d / 2 + 0.2 + r * 0.6, (C.rnd() - 0.5) * 16);
        person(C.S, it.style, C.rnd, lod);
      }
      C.at(0, 0);
    },
    '승용차'(C, it, w, d, h) {
      const S = C.S, c = col(it, '#d9dbe0'), kx = w / 4.6, ky = h / 1.45, P = (pts) => pts.map(([x, y]) => [x * kx, y * ky]);
      S.extrude(P([[-2.3, 0.3], [2.3, 0.3], [2.3, 0.62], [2.12, 0.76], [1.15, 0.84], [-1.55, 0.86], [-2.26, 0.8], [-2.3, 0.6]]), -d / 2, d / 2, c, MAT.gloss, 'z');
      S.extrude(P([[1.12, 0.84], [0.48, 1.39], [-0.9, 1.43], [-1.52, 0.86]]), -d / 2 + 0.09, d / 2 - 0.09, WINDOW, MAT.window, 'z');
      S.box(-0.86 * kx, 1.41 * ky, -d / 2 + 0.12, 0.44 * kx, 1.45 * ky, d / 2 - 0.12, c, MAT.gloss);
      [[1.42, 1], [1.42, -1], [-1.4, 1], [-1.4, -1]].forEach(([x, s]) => wheel(S, x * kx, s * (d / 2 - 0.11), 0.33 * ky, 0.22));
      [-1, 1].forEach((s) => {
        S.quad([w / 2 + 0.003, 0.56 * ky, s * d * 0.3 - 0.16], [w / 2 + 0.003, 0.56 * ky, s * d * 0.3 + 0.16], [w / 2 + 0.003, 0.68 * ky, s * d * 0.3 + 0.16], [w / 2 + 0.003, 0.68 * ky, s * d * 0.3 - 0.16], hex('#fffbe6'), MAT.emissive);
        S.quad([-w / 2 - 0.003, 0.62 * ky, s * d * 0.3 - 0.18], [-w / 2 - 0.003, 0.62 * ky, s * d * 0.3 + 0.18], [-w / 2 - 0.003, 0.74 * ky, s * d * 0.3 + 0.18], [-w / 2 - 0.003, 0.74 * ky, s * d * 0.3 - 0.18], hex('#d11a1a'), MAT.emissive);
      });
    },
    '버스'(C, it, w, d, h) {
      const S = C.S, c = col(it, '#1d7a46'), y0 = 0.4;
      S.box(-w / 2, y0, -d / 2, w / 2, h * 0.52, d / 2, c, MAT.gloss, { bottom: true });
      S.box(-w / 2 + 0.02, h * 0.52, -d / 2 + 0.02, w / 2 - 0.02, h * 0.86, d / 2 - 0.02, WINDOW, MAT.window);
      S.box(-w / 2, h * 0.86, -d / 2, w / 2, h, d / 2, WHITE, MAT.gloss);
      const n = Math.max(3, Math.round(w / 1.4));
      for (let i = 0; i <= n; i++) { const x = -w / 2 + (w * i) / n; S.box(x - 0.04, h * 0.52, -d / 2, x + 0.04, h * 0.86, d / 2, c, MAT.gloss); }
      S.quad([w / 2 + 0.004, h * 0.4, d / 2 - 0.15], [w / 2 + 0.004, h * 0.4, -d / 2 + 0.15], [w / 2 + 0.004, h * 0.84, -d / 2 + 0.15], [w / 2 + 0.004, h * 0.84, d / 2 - 0.15], WINDOW, MAT.window);
      [[w / 2 - 2.2, 1], [w / 2 - 2.2, -1], [-w / 2 + 2.6, 1], [-w / 2 + 2.6, -1]].forEach(([x, s]) => wheel(S, x, s * (d / 2 - 0.16), 0.5, 0.3));
    },
    '건물'(C, it, w, d, h) { building(C, it, w, d, h); },
    '나무'(C, it, w, d, h) { tree(C.S, Math.min(w, d), h, it.style, C.rnd); },
    '담장'(C, it, w, d, h) {
      const S = C.S;
      if (it.style === '판넬') {
        const n = Math.max(1, Math.round(w / 2));
        S.box(-w / 2, 0.05, -0.02, w / 2, h, 0.02, WHITE, MAT.metal);
        S.box(-w / 2, h * 0.72, -0.024, w / 2, h * 0.86, 0.024, hex('#2563eb'));
        for (let i = 0; i <= n; i++) { const x = -w / 2 + (w * i) / n; S.box(x - 0.03, 0, -0.05, x + 0.03, h + 0.05, 0.05, STEEL, MAT.metal); }
        return;
      }
      const brick = it.style === '벽돌';
      S.box(-w / 2, 0, -d / 2, w / 2, h - 0.08, d / 2, brick ? hex('#a9523c') : hex('#9d9c98'), brick ? MAT.brick : MAT.stone);
      S.box(-w / 2 - 0.03, h - 0.08, -d / 2 - 0.04, w / 2 + 0.03, h, d / 2 + 0.04, brick ? hex('#8b8d90') : hex('#6f6f6c'), MAT.concrete);
    },
    '주차 구획'(C, it, w, d) {
      const D = C.D, n = Math.max(1, it.count || 1), t = 0.12, y = 0.018, c = hex('#f4f4f2');
      const line = (x0, z0, x1, z1) => D.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], c);
      line(-w / 2, -d / 2, w / 2, -d / 2 + t);
      for (let i = 0; i <= n; i++) { const x = -w / 2 + ((w - t) * i) / n; line(x, -d / 2, x + t, d / 2); }
    },
    '가로등'(C, it, w, d, h) {
      const S = C.S;
      S.cyl(0, 0, 0, 0.14, 0.25, 0.1, hex('#4b5058'), MAT.metal, 10);
      S.cyl(0, 0.25, 0, 0.07, h, 0.045, hex('#5b616b'), MAT.metal, 8);
      S.beam([0, h - 0.05, 0], [0, h + 0.1, 1.1], 0.06, hex('#5b616b'), MAT.metal);
      S.box(-0.14, h + 0.02, 0.85, 0.14, h + 0.12, 1.45, hex('#3f444c'), MAT.metal, { bottom: true });
      S.quad([-0.11, h + 0.018, 0.9], [0.11, h + 0.018, 0.9], [0.11, h + 0.018, 1.4], [-0.11, h + 0.018, 1.4], hex('#fff3c4'), MAT.emissive);
    },
  };

  /** 바퀴: 축이 z 방향. (x, z)는 가운데, r 반지름, t 폭 */
  function wheel(S, x, z, r, t) {
    S.tube([x, r, z - t / 2], [x, r, z + t / 2], r, r, TIRE, 0, 14);
    const o = z > 0 ? t / 2 + 0.004 : -t / 2 - 0.004;
    S.tube([x, r, z + o], [x, r, z + o + (z > 0 ? 0.004 : -0.004)], r * 0.58, r * 0.58, CHROME, MAT.metal, 12);
  }

  /** 백월·포토월: 앞면 가득 글자·이미지, 뒤에 버팀대 */
  function board(C, it, w, d, h, o) {
    const S = C.S, t = 0.06;
    S.box(-w / 2, 0, -t / 2, w / 2, h, t / 2, hex('#2b2e34'));
    C.face([[-w / 2, 0, t / 2 + 0.004], [w / 2, 0, t / 2 + 0.004], [w / 2, h, t / 2 + 0.004], [-w / 2, h, t / 2 + 0.004]], faceCanvas(it, w / h, o));
    const n = Math.max(2, Math.round(w / 2.5) + 1);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.15 + ((w - 0.3) * i) / (n - 1), back = Math.min(1.2, Math.max(d, h * 0.3));
      S.beam([x, h * 0.75, -t / 2], [x, 0.03, -back], 0.04, STEEL, MAT.metal);
      S.beam([x, 0.03, -t / 2], [x, 0.03, -back], 0.04, STEEL, MAT.metal);
      S.box(x - 0.18, 0, -back - 0.12, x + 0.18, 0.1, -back + 0.12, DARK);
    }
  }

  /** 건물: 층마다 창, 앞쪽(+z) 가운데에 유리 출입구와 간판 */
  function building(C, it, w, d, h) {
    const S = C.S, wall = col(it, '#efe7d6'), floors = Math.max(1, it.floors || Math.round(h / 3.5)), fh = h / floors;
    S.box(-w / 2, 0, -d / 2, w / 2, h, d / 2, wall, MAT.plain, { top: hex('#8f9296'), topMat: MAT.concrete });
    S.box(-w / 2 - 0.05, 0, -d / 2 - 0.05, w / 2 + 0.05, 0.35, d / 2 + 0.05, hex('#a5a29b'), MAT.concrete);
    // 옥상 난간
    const pt = 0.25, ph = 0.6, pc = shade(wall, 0.93);
    S.box(-w / 2 - 0.08, h, d / 2 - pt, w / 2 + 0.08, h + ph, d / 2 + 0.08, pc);
    S.box(-w / 2 - 0.08, h, -d / 2 - 0.08, w / 2 + 0.08, h + ph, -d / 2 + pt, pc);
    S.box(-w / 2 - 0.08, h, -d / 2 + pt, -w / 2 + pt, h + ph, d / 2 - pt, pc);
    S.box(w / 2 - pt, h, -d / 2 + pt, w / 2 + 0.08, h + ph, d / 2 - pt, pc);
    const frame = hex('#f3f4f6');
    /** 벽 한 면에 창을 늘어놓음. P(u, y): 그 면의 점 (u는 면을 따라, 바깥으로 e만큼) */
    const windows = (len, P, door) => {
      const n = Math.max(1, Math.floor((len - 1.2) / 3.2)), gap = len / n, ww = Math.min(2.0, gap * 0.62);
      for (let f = 0; f < floors; f++) {
        const y0 = f * fh + Math.min(1.0, fh * 0.3), y1 = f * fh + fh - Math.min(0.55, fh * 0.16);
        for (let i = 0; i < n; i++) {
          const u = -len / 2 + gap * (i + 0.5);
          if (door && f === 0 && Math.abs(u) < door + ww / 2) continue;
          S.quad(P(u - ww / 2 - 0.07, y0 - 0.07, 0.02), P(u + ww / 2 + 0.07, y0 - 0.07, 0.02), P(u + ww / 2 + 0.07, y1 + 0.07, 0.02), P(u - ww / 2 - 0.07, y1 + 0.07, 0.02), frame);
          S.quad(P(u - ww / 2, y0, 0.035), P(u + ww / 2, y0, 0.035), P(u + ww / 2, y1, 0.035), P(u - ww / 2, y1, 0.035), WINDOW, MAT.window);
          S.quad(P(u - 0.03, y0, 0.045), P(u + 0.03, y0, 0.045), P(u + 0.03, y1, 0.045), P(u - 0.03, y1, 0.045), frame);
        }
      }
    };
    const ew = Math.min(w * 0.3, 7), eh = Math.min(fh * 0.86, 3.2);
    windows(w, (u, y, e) => [u, y, d / 2 + e], ew / 2 + 0.6);
    windows(w, (u, y, e) => [-u, y, -d / 2 - e], 0);
    windows(d, (u, y, e) => [w / 2 + e, y, -u], 0);
    windows(d, (u, y, e) => [-w / 2 - e, y, u], 0);
    // 출입구: 파란 유리 전면 + 차양 + 간판
    const z = d / 2;
    S.box(-ew / 2 - 0.25, 0, z, ew / 2 + 0.25, eh + 0.25, z + 0.35, hex('#2f6fb7'));
    S.quad([-ew / 2, 0.05, z + 0.36], [ew / 2, 0.05, z + 0.36], [ew / 2, eh, z + 0.36], [-ew / 2, eh, z + 0.36], hex('#3b82c4'), MAT.window);
    const mull = Math.max(2, Math.round(ew / 1.4));
    for (let i = 0; i <= mull; i++) { const x = -ew / 2 + (ew * i) / mull; S.box(x - 0.03, 0, z + 0.35, x + 0.03, eh, z + 0.39, frame, MAT.metal); }
    S.box(-ew / 2, eh * 0.72, z + 0.35, ew / 2, eh * 0.72 + 0.06, z + 0.39, frame, MAT.metal);
    S.box(-ew / 2 - 0.6, eh + 0.25, z, ew / 2 + 0.6, eh + 0.45, z + 1.6, hex('#e5e7eb'), MAT.concrete, { bottom: true });
    if (it.text || it.imageId) {
      const sw = Math.min(w * 0.6, Math.max(ew, 6)), sh = Math.min(1.2, fh * 0.3), sy = Math.min(h - sh - 0.1, eh + 0.6);
      S.box(-sw / 2 - 0.06, sy - 0.06, z, sw / 2 + 0.06, sy + sh + 0.06, z + 0.12, hex('#1f2937'));
      C.face([[-sw / 2, sy, z + 0.125], [sw / 2, sy, z + 0.125], [sw / 2, sy + sh, z + 0.125], [-sw / 2, sy + sh, z + 0.125]], faceCanvas(it, sw / sh, { bg: hex('#1e3a8a'), plain: true }));
    }
  }

  App.models3d = { EVENT, faceCanvas, chair, person, tree, truss, legs, wheel, col, COLORS: { WHITE, BLACK, DARK, STEEL, CHROME, GOLD, WOOD, WOOD_DARK, WOOD_LIGHT, GLASS, WINDOW, CONCRETE } };
})();

/* ── 가구(인테리어)와 전기·설비 기호의 3D 모형 ── */
(function () {
  'use strict';
  const App = window.App;
  const { MAT, hex, shade } = App.gl3d;
  const M = App.models3d;
  const { WHITE, BLACK, DARK, STEEL, CHROME, WOOD, WOOD_DARK, WOOD_LIGHT, WINDOW } = M.COLORS;
  const FABRIC = hex('#8d929b'), CABINET = hex('#ece7dc'), WARM = hex('#fff1cf');

  /** 나무 의자 (식탁·책상용): 앞이 +z */
  function woodChair(S, lod) {
    S.box(-0.2, 0.42, -0.2, 0.2, 0.46, 0.2, WOOD_LIGHT, MAT.grain);
    S.box(-0.2, 0.46, -0.2, 0.2, 0.86, -0.17, WOOD_LIGHT, MAT.grain);
    if (lod) S.box(-0.17, 0, -0.17, 0.17, 0.42, 0.17, shade(WOOD_LIGHT, 0.75));
    else M.legs(S, 0.4, 0.4, 0.42, 0.035, WOOD_LIGHT, MAT.grain);
  }
  /** 앞면(+z)의 문짝 n개: 틈과 손잡이 */
  function doors(S, w, y0, y1, z, n, c, handle = true) {
    const dw = w / n;
    for (let i = 0; i < n; i++) {
      const x0 = -w / 2 + i * dw + 0.006, x1 = -w / 2 + (i + 1) * dw - 0.006;
      S.box(x0, y0 + 0.006, z, x1, y1 - 0.006, z + 0.014, c);
      if (handle) {
        const hx = i % 2 ? x0 + 0.04 : x1 - 0.04, hy = Math.min((y0 + y1) / 2, 1.05);
        S.box(hx - 0.008, hy - 0.07, z + 0.014, hx + 0.008, hy + 0.07, z + 0.03, CHROME, MAT.metal);
      }
    }
  }

  const FURN = {
    '침대'(C, it, w, d, h) {
      const S = C.S, top = Math.max(0.42, h);
      S.box(-w / 2, 0, -d / 2, w / 2, top * 0.56, d / 2, WOOD, MAT.grain);
      S.box(-w / 2, 0, -d / 2, w / 2, top * 2.1, -d / 2 + 0.07, WOOD, MAT.grain);
      S.box(-w / 2 + 0.03, top * 0.56, -d / 2 + 0.08, w / 2 - 0.03, top, d / 2 - 0.03, hex('#f4f1ea'), MAT.fabric);
      S.box(-w / 2 + 0.01, top * 0.6, -d / 2 + d * 0.36, w / 2 - 0.01, top + 0.04, d / 2 - 0.01, hex('#8fa3b8'), MAT.fabric);
      S.box(-w / 2 + 0.01, top + 0.04, -d / 2 + d * 0.36, w / 2 - 0.01, top + 0.07, -d / 2 + d * 0.48, hex('#f4f1ea'), MAT.fabric);
      const n = w >= 1.3 ? 2 : 1, pw = (w - 0.16) / n;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + 0.08 + pw * (i + 0.5);
        S.ball(x, top + 0.06, -d / 2 + 0.36, pw * 0.44, 0.085, 0.2, WHITE, MAT.fabric, 10, 5);
      }
    },
    '소파'(C, it, w, d, h) {
      const S = C.S, arm = Math.min(0.18, w * 0.12), back = Math.min(0.24, d * 0.3), seat = Math.min(0.42, h * 0.55);
      M.legs(S, w, d, 0.08, 0.05, WOOD_DARK, MAT.grain, 0.04);
      S.box(-w / 2, 0.08, -d / 2, w / 2, seat - 0.12, d / 2, FABRIC, MAT.fabric, { bottom: true });
      S.box(-w / 2, seat - 0.12, -d / 2, w / 2, h, -d / 2 + back, FABRIC, MAT.fabric);
      S.box(-w / 2, seat - 0.12, -d / 2 + back, -w / 2 + arm, seat + 0.2, d / 2, FABRIC, MAT.fabric);
      S.box(w / 2 - arm, seat - 0.12, -d / 2 + back, w / 2, seat + 0.2, d / 2, FABRIC, MAT.fabric);
      const n = w >= d * 2 ? 3 : w >= d * 1.4 ? 2 : 1, cw = (w - arm * 2) / n, light = shade(FABRIC, 1.1);
      for (let i = 0; i < n; i++) {
        const x0 = -w / 2 + arm + i * cw + 0.012, x1 = x0 + cw - 0.024;
        S.box(x0, seat - 0.12, -d / 2 + back + 0.01, x1, seat, d / 2 - 0.01, light, MAT.fabric);
        S.box(x0, seat, -d / 2 + back - 0.02, x1, h - 0.03, -d / 2 + back + 0.13, light, MAT.fabric);
      }
    },
    '식탁'(C, it, w, d, h) {
      const S = C.S;
      S.box(-w / 2, h - 0.04, -d / 2, w / 2, h, d / 2, WOOD_LIGHT, MAT.grain, { bottom: true });
      M.legs(S, w, d, h - 0.04, 0.055, WOOD_LIGHT, MAT.grain, 0.05);
      const n = w >= d * 1.7 ? 3 : w >= d * 1.2 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + ((i + 0.5) * w) / n;
        C.at(x, -d / 2 - 0.12, 0); woodChair(C.S, C.lod);
        C.at(x, d / 2 + 0.12, 180); woodChair(C.S, C.lod);
      }
      C.at(0, 0);
    },
    '의자'(C) { woodChair(C.S, C.lod); },
    '책상'(C, it, w, d, h) {
      const S = C.S;
      S.box(-w / 2, h - 0.03, -d / 2, w / 2, h, d / 2, WOOD_LIGHT, MAT.grain, { bottom: true });
      S.box(-w / 2, 0, -d / 2, -w / 2 + 0.03, h - 0.03, d / 2, WHITE);
      S.box(w / 2 - 0.03, 0, -d / 2, w / 2, h - 0.03, d / 2, WHITE);
      S.box(-w / 2 + 0.03, h * 0.45, -d / 2 + 0.02, w / 2 - 0.03, h - 0.03, -d / 2 + 0.04, WHITE);
      // 모니터와 자판
      S.box(-0.1, h, -d / 2 + 0.1, 0.1, h + 0.015, -d / 2 + 0.26, DARK);
      S.box(-0.02, h, -d / 2 + 0.16, 0.02, h + 0.14, -d / 2 + 0.19, DARK);
      S.box(-0.29, h + 0.1, -d / 2 + 0.19, 0.29, h + 0.46, -d / 2 + 0.215, BLACK);
      S.quad([-0.275, h + 0.115, -d / 2 + 0.2165], [0.275, h + 0.115, -d / 2 + 0.2165], [0.275, h + 0.445, -d / 2 + 0.2165], [-0.275, h + 0.445, -d / 2 + 0.2165], hex('#27425f'), MAT.window);
      S.box(-0.2, h, d * 0.02, 0.2, h + 0.018, d * 0.02 + 0.13, hex('#d9dce1'));
    },
    '옷장'(C, it, w, d, h) {
      const S = C.S;
      S.box(-w / 2, 0, -d / 2, w / 2, h, d / 2 - 0.014, CABINET);
      doors(S, w, 0.08, h, d / 2 - 0.014, Math.max(2, Math.round(w / 0.5)), shade(CABINET, 1.03));
    },
    '수납장'(C, it, w, d, h) {
      const S = C.S;
      S.box(-w / 2, 0, -d / 2, w / 2, h - 0.03, d / 2 - 0.014, CABINET);
      S.box(-w / 2 - 0.01, h - 0.03, -d / 2, w / 2 + 0.01, h, d / 2 + 0.005, WOOD_LIGHT, MAT.grain);
      doors(S, w, 0.06, h - 0.03, d / 2 - 0.014, Math.max(2, Math.round(w / 0.45)), shade(CABINET, 1.03));
    },
    'TV장'(C, it, w, d, h) {
      const S = C.S;
      S.box(-w / 2, 0.05, -d / 2, w / 2, h, d / 2 - 0.014, WOOD, MAT.grain, { bottom: true });
      doors(S, w, 0.05, h, d / 2 - 0.014, Math.max(2, Math.round(w / 0.6)), shade(WOOD, 1.08), false);
      const tw = Math.min(w * 0.8, 1.6), th = tw * 0.57;
      S.box(-0.16, h, -0.1, 0.16, h + 0.02, 0.1, DARK);
      S.box(-0.03, h, -0.03, 0.03, h + 0.09, 0.0, DARK);
      S.box(-tw / 2, h + 0.08, -0.04, tw / 2, h + 0.08 + th, 0.0, BLACK);
      S.quad([-tw / 2 + 0.015, h + 0.095, 0.002], [tw / 2 - 0.015, h + 0.095, 0.002], [tw / 2 - 0.015, h + 0.065 + th, 0.002], [-tw / 2 + 0.015, h + 0.065 + th, 0.002], hex('#1b2a3c'), MAT.window);
    },
    '냉장고'(C, it, w, d, h) {
      const S = C.S, c = hex('#d9dde3'), z = d / 2 - 0.02;
      S.box(-w / 2, 0, -d / 2, w / 2, h, z, c, MAT.gloss);
      if (w >= 0.85) {
        [-1, 1].forEach((s) => {
          S.box(s > 0 ? 0.004 : -w / 2 + 0.004, 0.02, z, s > 0 ? w / 2 - 0.004 : -0.004, h - 0.01, z + 0.02, c, MAT.gloss);
          S.box(s * 0.045 - 0.012, h * 0.35, z + 0.02, s * 0.045 + 0.012, h * 0.75, z + 0.045, CHROME, MAT.metal);
        });
      } else {
        const split = h * 0.62;
        S.box(-w / 2 + 0.004, 0.02, z, w / 2 - 0.004, split - 0.004, z + 0.02, c, MAT.gloss);
        S.box(-w / 2 + 0.004, split + 0.004, z, w / 2 - 0.004, h - 0.01, z + 0.02, c, MAT.gloss);
        S.box(w / 2 - 0.06, split - 0.45, z + 0.02, w / 2 - 0.036, split - 0.05, z + 0.045, CHROME, MAT.metal);
        S.box(w / 2 - 0.06, split + 0.05, z + 0.02, w / 2 - 0.036, split + 0.3, z + 0.045, CHROME, MAT.metal);
      }
    },
    '세탁기'(C, it, w, d, h) {
      const S = C.S, z = d / 2;
      S.box(-w / 2, 0, -d / 2, w / 2, h, z, WHITE, MAT.gloss);
      S.box(-w / 2 + 0.02, h - 0.14, z, w / 2 - 0.02, h - 0.02, z + 0.006, hex('#d7dbe0'));
      const r = Math.min(w, h) * 0.3, cy = (h - 0.14) / 2 + 0.03;
      S.tube([0, cy, z], [0, cy, z + 0.03], r, r, CHROME, MAT.metal, 18);
      S.tube([0, cy, z + 0.03], [0, cy, z + 0.035], r * 0.78, r * 0.78, hex('#22303f'), MAT.window, 18);
    },
    '싱크대'(C, it, w, d, h) {
      const S = C.S, z = d / 2 - 0.03;
      S.box(-w / 2, 0, -d / 2, w / 2, 0.1, z - 0.04, DARK);
      S.box(-w / 2, 0.1, -d / 2, w / 2, h - 0.03, z, CABINET, 0, { bottom: true });
      doors(S, w, 0.1, h - 0.03, z, Math.max(2, Math.round(w / 0.6)), shade(CABINET, 1.03));
      S.box(-w / 2, h - 0.03, -d / 2, w / 2, h, d / 2, hex('#3b3e44'), MAT.gloss);
      const bw = Math.min(0.7, w * 0.35), cx = w > d * 2 ? -w * 0.12 : 0;
      S.quad([cx - bw / 2, h + 0.002, d * 0.28], [cx + bw / 2, h + 0.002, d * 0.28], [cx + bw / 2, h + 0.002, -d * 0.22], [cx - bw / 2, h + 0.002, -d * 0.22], hex('#aeb4bc'), MAT.metal);
      S.quad([cx - bw / 2 + 0.04, h + 0.003, d * 0.22], [cx + bw / 2 - 0.04, h + 0.003, d * 0.22], [cx + bw / 2 - 0.04, h + 0.003, -d * 0.16], [cx - bw / 2 + 0.04, h + 0.003, -d * 0.16], hex('#6c737c'), MAT.metal);
      S.tube([cx, h, -d * 0.32], [cx, h + 0.26, -d * 0.32], 0.014, 0.014, CHROME, MAT.metal, 6);
      S.tube([cx, h + 0.26, -d * 0.32], [cx, h + 0.22, -d * 0.1], 0.012, 0.012, CHROME, MAT.metal, 6);
    },
    '쿡탑'(C, it, w, d, h) {
      const S = C.S;
      S.box(-w / 2, 0, -d / 2, w / 2, h - 0.02, d / 2, CABINET);
      S.box(-w / 2, h - 0.02, -d / 2, w / 2, h, d / 2, BLACK, MAT.window);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([i, j]) => S.disc((i * w) / 4, h + 0.002, (j * d) / 4, Math.min(w, d) * 0.17, hex('#3a3d44'), MAT.metal, 16));
    },
    '변기'(C, it, w, d) {
      const S = C.S;
      S.box(-w / 2 + 0.02, 0.36, -d / 2, w / 2 - 0.02, 0.8, -d / 2 + 0.19, WHITE, MAT.gloss, { bottom: true });
      S.tube([0, 0, 0.06], [0, 0.36, 0.08], w * 0.3, w * 0.42, WHITE, MAT.gloss, 14, false, false);
      S.ball(0, 0.38, 0.09, w * 0.46, 0.06, d * 0.35, WHITE, MAT.gloss, 14, 5);
      S.ball(0, 0.415, 0.09, w * 0.4, 0.02, d * 0.3, hex('#eef0f2'), MAT.gloss, 14, 4);
    },
    '세면대'(C, it, w, d, h) {
      const S = C.S;
      S.box(-w / 2 + 0.03, 0, -d / 2, w / 2 - 0.03, h - 0.12, d / 2 - 0.06, CABINET);
      S.box(-w / 2, h - 0.12, -d / 2, w / 2, h, d / 2, WHITE, MAT.gloss, { bottom: true });
      S.ball(0, h + 0.002, 0.03, w * 0.36, 0.012, d * 0.3, hex('#cfd6dd'), MAT.gloss, 14, 4);
      S.tube([0, h, -d * 0.36], [0, h + 0.14, -d * 0.36], 0.013, 0.013, CHROME, MAT.metal, 6);
      S.tube([0, h + 0.14, -d * 0.36], [0, h + 0.11, -d * 0.16], 0.011, 0.011, CHROME, MAT.metal, 6);
    },
    '욕조'(C, it, w, d, h) {
      const S = C.S, t = 0.07;
      S.box(-w / 2, 0, -d / 2, w / 2, 0.12, d / 2, WHITE, MAT.gloss);
      S.box(-w / 2, 0.12, -d / 2, w / 2, h, -d / 2 + t, WHITE, MAT.gloss);
      S.box(-w / 2, 0.12, d / 2 - t, w / 2, h, d / 2, WHITE, MAT.gloss);
      S.box(-w / 2, 0.12, -d / 2 + t, -w / 2 + t, h, d / 2 - t, WHITE, MAT.gloss);
      S.box(w / 2 - t, 0.12, -d / 2 + t, w / 2, h, d / 2 - t, WHITE, MAT.gloss);
      S.tube([w / 2 - t / 2, h, 0], [w / 2 - t / 2, h + 0.12, 0], 0.014, 0.014, CHROME, MAT.metal, 6);
    },
    '샤워부스'(C, it, w, d, h) {
      const S = C.S, G = C.G, g = hex('#b9d6e6');
      S.box(-w / 2, 0, -d / 2, w / 2, 0.06, d / 2, WHITE, MAT.gloss);
      G.quad([-w / 2, 0.06, d / 2], [w / 2, 0.06, d / 2], [w / 2, h, d / 2], [-w / 2, h, d / 2], g, MAT.glass);
      G.quad([w / 2, 0.06, d / 2], [w / 2, 0.06, -d / 2], [w / 2, h, -d / 2], [w / 2, h, d / 2], g, MAT.glass);
      [[-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2]].forEach(([x, z]) => S.box(x - 0.015, 0.06, z - 0.015, x + 0.015, h, z + 0.015, CHROME, MAT.metal));
      S.box(-w / 2, h - 0.03, d / 2 - 0.015, w / 2, h, d / 2 + 0.015, CHROME, MAT.metal);
      S.box(w / 2 - 0.015, h - 0.03, -d / 2, w / 2 + 0.015, h, d / 2, CHROME, MAT.metal);
      S.tube([-w / 2 + 0.12, 0.9, -d / 2 + 0.06], [-w / 2 + 0.12, h - 0.1, -d / 2 + 0.06], 0.012, 0.012, CHROME, MAT.metal, 6);
      S.tube([-w / 2 + 0.12, h - 0.1, -d / 2 + 0.06], [-w / 2 + 0.3, h - 0.14, -d / 2 + 0.22], 0.012, 0.012, CHROME, MAT.metal, 6);
      S.cyl(-w / 2 + 0.3, h - 0.17, -d / 2 + 0.22, 0.09, h - 0.14, 0.09, CHROME, MAT.metal, 10);
    },
    '신발장'(C, it, w, d, h) {
      const S = C.S;
      S.box(-w / 2, 0, -d / 2, w / 2, h, d / 2 - 0.014, CABINET);
      doors(S, w, 0.05, h, d / 2 - 0.014, Math.max(2, Math.round(w / 0.5)), shade(CABINET, 1.03));
    },
    /** 벽에 거는 액자·벽보: 가운데 높이 it.height, 그림 높이 h. 등(−z)이 벽 */
    '액자·벽보'(C, it, w, d, h) {
      const S = C.S, cy = (it.height != null ? it.height : 1500) / 1000, y0 = Math.max(0.02, cy - h / 2), z0 = -d / 2;
      S.box(-w / 2, y0, z0, w / 2, y0 + h, z0 + 0.03, WOOD_DARK, MAT.grain, { bottom: true });
      const m = Math.min(0.035, w * 0.05);
      C.face([[-w / 2 + m, y0 + m, z0 + 0.034], [w / 2 - m, y0 + m, z0 + 0.034], [w / 2 - m, y0 + h - m, z0 + 0.034], [-w / 2 + m, y0 + h - m, z0 + 0.034]],
        M.faceCanvas(it, (w - 2 * m) / (h - 2 * m), { bg: hex('#f6f1e6'), plain: true }));
    },
  };

  /** 전기·설비 기호: H는 설치 높이(m), 천장에 다는 것은 천장 높이. 벽에 붙는 것은 등(−z)이 벽면 */
  function symbol(C, it, def, H) {
    const S = C.S, T = C.T;
    const back = -((it.depth != null ? it.depth : it.size * ((def && def.aspect) || 1)) / 1000) / 2;
    const plate = (pw, ph, pd, c, mat = 0) => S.box(-pw / 2, H - ph / 2, back, pw / 2, H + ph / 2, back + pd, c, mat, { bottom: true });
    const gangs = Math.max(1, parseInt(it.gang, 10) || 1);
    const w = it.size / 1000, d = (it.depth || it.size) / 1000;
    switch (it.kind) {
      case '콘센트':
        if (it.variant === '바닥형') { S.box(-0.06, 0, -0.06, 0.06, 0.012, 0.06, STEEL, MAT.metal); break; }
        plate(0.07 * gangs + 0.03, 0.115, 0.01, WHITE);
        for (let i = 0; i < gangs; i++) S.tube([(i - (gangs - 1) / 2) * 0.07, H, back + 0.01], [(i - (gangs - 1) / 2) * 0.07, H, back + 0.013], 0.022, 0.022, hex('#e3e5e8'), 0, 10);
        break;
      case '스위치':
        plate(0.045 * gangs + 0.04, 0.115, 0.01, WHITE);
        for (let i = 0; i < gangs; i++) { const x = (i - (gangs - 1) / 2) * 0.045; S.box(x - 0.018, H - 0.035, back + 0.01, x + 0.018, H + 0.035, back + 0.016, hex('#eceef0')); }
        break;
      case '통신 단자': plate(0.075, 0.115, 0.01, WHITE); break;
      case '월패드':
        plate(0.24, 0.16, 0.022, DARK);
        S.quad([-0.1, H - 0.06, back + 0.0235], [0.1, H - 0.06, back + 0.0235], [0.1, H + 0.06, back + 0.0235], [-0.1, H + 0.06, back + 0.0235], hex('#5b8fd6'), MAT.emissive);
        break;
      case '분전반': plate(0.45, 0.6, 0.1, hex('#c3c8cf'), MAT.metal); break;
      case '유도등':
        plate(0.36, 0.14, 0.05, WHITE);
        S.quad([-0.17, H - 0.06, back + 0.052], [0.17, H - 0.06, back + 0.052], [0.17, H + 0.06, back + 0.052], [-0.17, H + 0.06, back + 0.052], hex('#22c55e'), MAT.emissive);
        break;
      case '보일러':
        plate(0.44, 0.65, 0.24, WHITE, MAT.gloss);
        [-0.1, 0.1].forEach((x) => S.tube([x, H - 0.33, back + 0.1], [x, H - 0.6, back + 0.1], 0.015, 0.015, STEEL, MAT.metal, 6));
        break;
      case '수전':
        S.tube([0, H, back], [0, H, back + 0.13], 0.013, 0.013, CHROME, MAT.metal, 6);
        S.tube([0, H, back + 0.13], [0, H - 0.05, back + 0.13], 0.012, 0.012, CHROME, MAT.metal, 6);
        break;
      case '조명': {
        const v = it.variant;
        if (v === 'LED 평판등') {
          T.box(-0.3, H - 0.025, -0.3, 0.3, H, 0.3, WHITE, 0, { bottom: true });
          T.quad([-0.28, H - 0.027, 0.28], [0.28, H - 0.027, 0.28], [0.28, H - 0.027, -0.28], [-0.28, H - 0.027, -0.28], WARM, MAT.emissive);
        } else if (v === '라인조명') {
          T.box(-0.6, H - 0.04, -0.03, 0.6, H, 0.03, WARM, MAT.emissive, { bottom: true });
        } else if (v === '펜던트') {
          T.cyl(0, H - 0.75, 0, 0.006, H, 0.006, DARK, 0, 5);
          T.tube([0, H - 1.0, 0], [0, H - 0.75, 0], 0.2, 0.05, hex('#2f3237'), MAT.metal, 14, false, true);
          T.ball(0, H - 0.93, 0, 0.06, 0.07, 0.06, WARM, MAT.emissive, 8, 5);
        } else if (v === '등기구' || v === '간접등') {
          T.cyl(0, H - 0.08, 0, 0.2, H, 0.2, WARM, MAT.emissive, 16);
        } else {
          T.cyl(0, H - 0.012, 0, 0.075, H, 0.075, WHITE, 0, 14);
          T.disc(0, H - 0.014, 0, 0.06, WARM, MAT.emissive, 14);
        }
        break;
      }
      case '비상조명': T.cyl(0, H - 0.03, 0, 0.09, H, 0.09, WHITE, 0, 12); T.disc(0, H - 0.032, 0, 0.05, hex('#d9f99d'), MAT.emissive, 10); break;
      case '감지기': T.cyl(0, H - 0.045, 0, 0.045, H, 0.06, WHITE, 0, 12); break;
      case '스프링클러': T.cyl(0, H - 0.06, 0, 0.012, H, 0.012, CHROME, MAT.metal, 6); T.disc(0, H - 0.06, 0, 0.03, CHROME, MAT.metal, 8); break;
      case '환기구':
        if (it.variant === '벽부형') { plate(0.25, 0.25, 0.02, WHITE); break; }
        T.box(-0.125, H - 0.015, -0.125, 0.125, H, 0.125, WHITE, 0, { bottom: true });
        for (let i = 0; i < 4; i++) T.quad([-0.1, H - 0.017, -0.08 + i * 0.05], [0.1, H - 0.017, -0.08 + i * 0.05], [0.1, H - 0.017, -0.06 + i * 0.05], [-0.1, H - 0.017, -0.06 + i * 0.05], hex('#6b7280'));
        break;
      case '시스템 에어컨':
      case '디퓨저':
      case '점검구': {
        T.box(-w / 2, H - 0.03, -d / 2, w / 2, H, d / 2, WHITE, 0, { bottom: true });
        const k = it.kind === '점검구' ? 0.92 : 0.6;
        const cc = it.kind === '점검구' ? hex('#e7e9ec') : hex('#5f6670');
        T.quad([-w / 2 * k, H - 0.032, d / 2 * k], [w / 2 * k, H - 0.032, d / 2 * k], [w / 2 * k, H - 0.032, -d / 2 * k], [-w / 2 * k, H - 0.032, -d / 2 * k], cc);
        break;
      }
      case '에어컨 실내기':
        if (it.variant === '스탠드') {
          S.box(-0.25, 0, -0.17, 0.25, 1.8, 0.17, WHITE, MAT.gloss);
          S.quad([-0.2, 1.3, 0.172], [0.2, 1.3, 0.172], [0.2, 1.7, 0.172], [-0.2, 1.7, 0.172], hex('#3a3f47'));
        } else if (it.variant === '천장형') {
          T.box(-0.42, H - 0.03, -0.42, 0.42, H, 0.42, WHITE, 0, { bottom: true });
          T.quad([-0.25, H - 0.032, 0.25], [0.25, H - 0.032, 0.25], [0.25, H - 0.032, -0.25], [-0.25, H - 0.032, -0.25], hex('#5f6670'));
        } else {
          plate(w, 0.3, 0.22, WHITE, MAT.gloss);
          S.quad([-w / 2 + 0.04, H - 0.14, back + 0.2], [w / 2 - 0.04, H - 0.14, back + 0.2], [w / 2 - 0.04, H - 0.1, back + 0.222], [-w / 2 + 0.04, H - 0.1, back + 0.222], hex('#4b515a'));
        }
        break;
      case '에어컨 실외기': {
        const y0 = it.variant === '바닥' ? 0.05 : Math.max(0.05, H - 0.3);
        S.box(-0.4, y0, -0.16, 0.4, y0 + 0.6, 0.16, hex('#e5e7ea'), MAT.metal, { bottom: true });
        S.tube([-0.12, y0 + 0.3, 0.16], [-0.12, y0 + 0.3, 0.165], 0.23, 0.23, hex('#3a3f47'), MAT.metal, 16);
        break;
      }
      case '배수구': C.D.disc(0, 0.02, 0, 0.05, hex('#565b63'), MAT.metal, 12); break;
      default:
    }
  }

  M.FURN = FURN;
  M.symbol = symbol;
  M.woodChair = woodChair;
})();
