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
      const ia = img.naturalWidth / img.naturalHeight;
      if (o.fit === 'stretch') { c.drawImage(img, 0, 0, LW, LH); return cv; }
      if (o.fit === 'tile') {
        // 무늬처럼 반복: 사진 한 장의 높이를 o.tile(면 높이에 대한 비율)로
        const th = LH * Math.max(0.02, Math.min(1, o.tile || 0.34)), tw = th * ia;
        for (let y = LH - th; y > -th; y -= th) for (let x = 0; x < LW; x += tw) c.drawImage(img, x, y, tw + 0.5, th + 0.5);
        return cv;
      }
      // 비율이 비슷하면 꽉 채우고(조금 잘림), 많이 다르면 다 보이게 넣음
      const cover = o.fit === 'cover' || (o.fit !== 'fit' && Math.abs(Math.log(ia / a)) < 0.25);
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
  const CABINET = hex('#ece7dc'), CAB = CABINET, WOOD0 = WOOD, WARM = hex('#fff1cf');

  /** 나무 의자 (식탁·책상용): 앞이 +z */
  function woodChair(S, lod, color = null) {
    const c = color || WOOD_LIGHT;
    S.box(-0.2, 0.42, -0.2, 0.2, 0.46, 0.2, c, MAT.grain);
    S.box(-0.2, 0.46, -0.2, 0.2, 0.86, -0.17, c, MAT.grain);
    if (lod) S.box(-0.17, 0, -0.17, 0.17, 0.42, 0.17, shade(c, 0.75));
    else M.legs(S, 0.4, 0.4, 0.42, 0.035, c, MAT.grain);
  }
  /** 가구 색: 고른 색이 있으면 그것, 없으면 기본 */
  const tint = (it, def) => (it && it.color ? hex(it.color) : def);
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
      S.box(-w / 2 + 0.01, top * 0.6, -d / 2 + d * 0.36, w / 2 - 0.01, top + 0.04, d / 2 - 0.01, tint(it, hex('#8fa3b8')), MAT.fabric);
      S.box(-w / 2 + 0.01, top + 0.04, -d / 2 + d * 0.36, w / 2 - 0.01, top + 0.07, -d / 2 + d * 0.48, hex('#f4f1ea'), MAT.fabric);
      const n = w >= 1.3 ? 2 : 1, pw = (w - 0.16) / n;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + 0.08 + pw * (i + 0.5);
        S.ball(x, top + 0.06, -d / 2 + 0.36, pw * 0.44, 0.085, 0.2, WHITE, MAT.fabric, 10, 5);
      }
    },
    '소파'(C, it, w, d, h) {
      const S = C.S, arm = Math.min(0.18, w * 0.12), back = Math.min(0.24, d * 0.3), seat = Math.min(0.42, h * 0.55);
      const FABRIC = tint(it, hex('#8d929b'));
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
      const S = C.S, c = tint(it, WOOD_LIGHT);
      S.box(-w / 2, h - 0.04, -d / 2, w / 2, h, d / 2, c, MAT.grain, { bottom: true });
      M.legs(S, w, d, h - 0.04, 0.055, c, MAT.grain, 0.05);
      const n = w >= d * 1.7 ? 3 : w >= d * 1.2 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + ((i + 0.5) * w) / n;
        C.at(x, -d / 2 - 0.12, 0); woodChair(C.S, C.lod, c);
        C.at(x, d / 2 + 0.12, 180); woodChair(C.S, C.lod, c);
      }
      C.at(0, 0);
    },
    '식탁 의자'(C, it) { woodChair(C.S, C.lod, it.color ? hex(it.color) : null); },
    '책상'(C, it, w, d, h) {
      const S = C.S;
      S.box(-w / 2, h - 0.03, -d / 2, w / 2, h, d / 2, tint(it, WOOD_LIGHT), MAT.grain, { bottom: true });
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
      const S = C.S, CABINET = tint(it, CAB);
      S.box(-w / 2, 0, -d / 2, w / 2, h, d / 2 - 0.014, CABINET);
      doors(S, w, 0.08, h, d / 2 - 0.014, Math.max(2, Math.round(w / 0.5)), shade(CABINET, 1.03));
    },
    '수납장'(C, it, w, d, h) {
      const S = C.S, CABINET = tint(it, CAB);
      S.box(-w / 2, 0, -d / 2, w / 2, h - 0.03, d / 2 - 0.014, CABINET);
      S.box(-w / 2 - 0.01, h - 0.03, -d / 2, w / 2 + 0.01, h, d / 2 + 0.005, WOOD_LIGHT, MAT.grain);
      doors(S, w, 0.06, h - 0.03, d / 2 - 0.014, Math.max(2, Math.round(w / 0.45)), shade(CABINET, 1.03));
    },
    'TV장'(C, it, w, d, h) {
      const S = C.S, WOOD = tint(it, WOOD0);
      S.box(-w / 2, 0.05, -d / 2, w / 2, h, d / 2 - 0.014, WOOD, MAT.grain, { bottom: true });
      doors(S, w, 0.05, h, d / 2 - 0.014, Math.max(2, Math.round(w / 0.6)), shade(WOOD, 1.08), false);
      const tw = Math.min(w * 0.8, 1.6), th = tw * 0.57;
      S.box(-0.16, h, -0.1, 0.16, h + 0.02, 0.1, DARK);
      S.box(-0.03, h, -0.03, 0.03, h + 0.09, 0.0, DARK);
      S.box(-tw / 2, h + 0.08, -0.04, tw / 2, h + 0.08 + th, 0.0, BLACK);
      S.quad([-tw / 2 + 0.015, h + 0.095, 0.002], [tw / 2 - 0.015, h + 0.095, 0.002], [tw / 2 - 0.015, h + 0.065 + th, 0.002], [-tw / 2 + 0.015, h + 0.065 + th, 0.002], hex('#1b2a3c'), MAT.window);
    },
    '냉장고'(C, it, w, d, h) {
      const S = C.S, c = tint(it, hex('#d9dde3')), z = d / 2 - 0.02;
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
      const S = C.S, z = d / 2 - 0.03, CABINET = tint(it, CAB);
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
      const S = C.S, CABINET = tint(it, CAB);
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
  M.doors = doors;
  M.tint = tint;
})();

/* ── 2.1: 더 많은 조감도 물건 — 경기장, 관람석, 건물 종류, 장식, 차량 등 ── */
(function () {
  'use strict';
  const App = window.App;
  const { MAT, hex, shade, mixc } = App.gl3d;
  const M = App.models3d, E = M.EVENT, col = M.col, face = M.faceCanvas;
  const { WHITE, BLACK, DARK, STEEL, CHROME, GOLD, WOOD, WOOD_DARK, WOOD_LIGHT, WINDOW, CONCRETE } = M.COLORS;
  const LINE = hex('#f6f6f2'), Y = 0.02;
  const PI = Math.PI;

  /* 바닥에 그리는 선들 (경기장) */
  const rectD = (D, x0, z0, x1, z1, c, mat = 0, y = Y) => D.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], c, mat);
  const hline = (D, x0, x1, z, t = 0.1, c = LINE) => rectD(D, x0, z - t / 2, x1, z + t / 2, c, 0, Y + 0.004);
  const vline = (D, x, z0, z1, t = 0.1, c = LINE) => rectD(D, x - t / 2, z0, x + t / 2, z1, c, 0, Y + 0.004);
  const box2 = (D, x0, z0, x1, z1, t = 0.1, c = LINE) => { hline(D, x0, x1, z0, t, c); hline(D, x0, x1, z1, t, c); vline(D, x0, z0, z1, t, c); vline(D, x1, z0, z1, t, c); };
  function arc(D, cx, cz, r, a0, a1, t = 0.1, c = LINE, n = 28) {
    for (let i = 0; i < n; i++) {
      const p = a0 + ((a1 - a0) * i) / n, q = a0 + ((a1 - a0) * (i + 1)) / n, r0 = r - t / 2, r1 = r + t / 2, y = Y + 0.004;
      D.quad([cx + Math.cos(p) * r0, y, cz + Math.sin(p) * r0], [cx + Math.cos(q) * r0, y, cz + Math.sin(q) * r0], [cx + Math.cos(q) * r1, y, cz + Math.sin(q) * r1], [cx + Math.cos(p) * r1, y, cz + Math.sin(p) * r1], c);
    }
  }
  const spot = (D, x, z, r = 0.15, c = LINE) => D.disc(x, Y + 0.005, z, r, c, 0, 12);
  /** 바닥 판: 선 바깥 여유 m까지. 잔디는 깎은 줄무늬가 보이게 uv를 길이에 맞춤 */
  function surface(D, w, d, m, c, mat) {
    const x = w / 2 + m, z = d / 2 + m;
    D.quadUV([-x, Y, z], [x, Y, z], [x, Y, -z], [-x, Y, -z], [[0, 0], [(2 * x) / 5.5, 0], [(2 * x) / 5.5, 1], [0, 1]], c, mat);
  }
  /** 축구 골대: 골라인 가운데 (x, 0), dir(+1/−1) 쪽이 골문 뒤 */
  function goal(C, x, gw, gh, dir, deep = 1.6) {
    const S = C.S, G = C.G, r = 0.06, b = x + dir * deep;
    [-gw / 2, gw / 2].forEach((z) => {
      S.tube([x, 0, z], [x, gh, z], r, r, WHITE, 0, 8);
      S.tube([x, gh, z], [b, gh * 0.55, z], 0.025, 0.025, WHITE, 0, 5, false, false);
      S.tube([b, gh * 0.55, z], [b, 0, z], 0.025, 0.025, WHITE, 0, 5, false, false);
      G.quad([x, 0, z], [b, 0, z], [b, gh * 0.55, z], [x, gh, z], hex('#eef2f5'), MAT.glass);
    });
    S.tube([x, gh, -gw / 2], [x, gh, gw / 2], r, r, WHITE, 0, 8);
    G.quad([x, gh, -gw / 2], [x, gh, gw / 2], [b, gh * 0.55, gw / 2], [b, gh * 0.55, -gw / 2], hex('#eef2f5'), MAT.glass);
    G.quad([b, 0, -gw / 2], [b, 0, gw / 2], [b, gh * 0.55, gw / 2], [b, gh * 0.55, -gw / 2], hex('#eef2f5'), MAT.glass);
  }
  /** 농구대: 밑동이 (x, 0), dir 쪽으로 림이 나옴 */
  function hoop(C, x, dir) {
    const S = C.S, bx = x + dir * 1.2;
    S.box(x - 0.35, 0, -0.5, x + 0.35, 0.25, 0.5, DARK, MAT.metal);
    S.beam([x, 0.25, 0], [x + dir * 0.5, 3.0, 0], 0.16, hex('#1f4fa3'), MAT.metal);
    S.beam([x + dir * 0.5, 3.0, 0], [bx, 3.3, 0], 0.12, hex('#1f4fa3'), MAT.metal);
    S.box(Math.min(bx, bx + dir * 0.04), 2.9, -0.9, Math.max(bx, bx + dir * 0.04), 3.95, 0.9, WHITE, 0, { bottom: true });
    C.G.quad([bx + dir * 0.045, 2.95, -0.85], [bx + dir * 0.045, 2.95, 0.85], [bx + dir * 0.045, 3.9, 0.85], [bx + dir * 0.045, 3.9, -0.85], hex('#dfe9f2'), MAT.glass);
    const rc = bx + dir * 0.42;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 2 * PI, b = ((i + 1) / 12) * 2 * PI;
      S.tube([rc + Math.cos(a) * 0.23, 3.05, Math.sin(a) * 0.23], [rc + Math.cos(b) * 0.23, 3.05, Math.sin(b) * 0.23], 0.012, 0.012, hex('#e8590c'), 0, 5, false, false);
    }
    S.tube([rc, 2.65, 0], [rc, 3.04, 0], 0.14, 0.22, WHITE, MAT.canvas, 10, false, false);
  }
  /** 가운데를 가로지르는 네트: 높이 h, 기둥은 선 밖 */
  function net(C, d, h, mesh = 0.9) {
    const S = C.S, z = d / 2 + 0.6;
    [-z, z].forEach((p) => S.cyl(0, 0, p, 0.045, h + 0.05, 0.045, hex('#3b4252'), MAT.metal, 8));
    C.G.quad([0, h - mesh, -z], [0, h - mesh, z], [0, h, z], [0, h, -z], hex('#ffffff'), MAT.glass);
    S.box(-0.012, h - 0.05, -z, 0.012, h, z, WHITE);
  }

  /* ── 경기장 ── */
  E['축구장'] = E['풋살장'] = (C, it, w, d) => {
    const D = C.D, futsal = it.kind === '풋살장', k = Math.min(1, d / (futsal ? 20 : 68));
    surface(D, w, d, futsal ? 1.5 : 4, col(it, futsal ? '#2f7f86' : '#3f9447'), futsal && !it.color ? MAT.track : MAT.turf);
    const t = futsal ? 0.08 : 0.12, x = w / 2, z = d / 2;
    box2(D, -x, -z, x, z, t);
    vline(D, 0, -z, z, t);
    arc(D, 0, 0, (futsal ? 3 : 9.15) * k, 0, 2 * PI, t);
    spot(D, 0, 0, 0.18);
    const pw = (futsal ? 6 : 16.5) * k, pd = (futsal ? 15 : 40.32) * k, gw6 = 5.5 * k, gd6 = 18.32 * k;
    [-1, 1].forEach((s) => {
      box2(D, s * x, -pd / 2, s * (x - pw), pd / 2, t);
      if (!futsal) {
        box2(D, s * x, -gd6 / 2, s * (x - gw6), gd6 / 2, t);
        spot(D, s * (x - 11 * k), 0, 0.16);
        const a = Math.acos((pw - 11 * k) / (9.15 * k));
        arc(D, s * (x - 11 * k), 0, 9.15 * k, s > 0 ? PI - a : -a, s > 0 ? PI + a : a, t, LINE, 14);
      } else spot(D, s * (x - 6 * k), 0, 0.12);
      [[-1, s > 0 ? PI / 2 : 0], [1, s > 0 ? PI : -PI / 2]].forEach(([q, a0]) => arc(D, s * x, q * z, 1, a0, a0 + PI / 2, t, LINE, 6));
    });
    if (it.variant !== '없음') {
      const gw = futsal ? 3 : d >= 60 ? 7.32 : d >= 40 ? 5 : 3, gh = futsal || d < 40 ? 2 : 2.44;
      goal(C, -x, gw, gh, -1); goal(C, x, gw, gh, 1);
    }
  };
  E['농구장'] = (C, it, w, d) => {
    const D = C.D, x = w / 2, z = d / 2, t = 0.05, paint = hex('#b5432f');
    surface(D, w, d, 2, col(it, '#d6a565'), MAT.track);
    [-1, 1].forEach((s) => {
      rectD(D, s * x, -2.45, s * (x - 5.8), 2.45, paint, MAT.track, Y + 0.002);
      box2(D, s * x, -2.45, s * (x - 5.8), 2.45, t);
      arc(D, s * (x - 5.8), 0, 1.8, s > 0 ? PI / 2 : -PI / 2, s > 0 ? 1.5 * PI : PI / 2, t, LINE, 14);
      const hx = s * (x - 1.575), a = Math.asin(Math.min(1, (z - 0.9) / 6.75));
      arc(D, hx, 0, 6.75, s > 0 ? PI - a : -a, s > 0 ? PI + a : a, t, LINE, 24);
      [-1, 1].forEach((q) => hline(D, s * x, s * (x - 1.575 - Math.cos(a) * 6.75) , q * (z - 0.9), t));
      if (it.variant !== '없음') hoop(C, s * (x + 0.4), -s);
    });
    box2(D, -x, -z, x, z, t);
    vline(D, 0, -z, z, t);
    arc(D, 0, 0, 1.8, 0, 2 * PI, t);
  };
  E['배구장'] = (C, it, w, d) => {
    const D = C.D, x = w / 2, z = d / 2, t = 0.05;
    surface(D, w, d, 3, hex('#2c6fb0'), MAT.track);
    rectD(D, -x, -z, x, z, col(it, '#e2873b'), MAT.track, Y + 0.002);
    box2(D, -x, -z, x, z, t);
    vline(D, 0, -z, z, t); vline(D, -3, -z, z, t); vline(D, 3, -z, z, t);
    if (it.variant !== '없음') net(C, d, 2.43, 1.0);
  };
  E['테니스장'] = (C, it, w, d) => {
    const D = C.D, x = w / 2, z = d / 2, t = 0.06, sz = z * (8.23 / 10.97), sx = x * (6.4 / 11.885);
    surface(D, w, d, 3.6, hex('#2f7d4a'), MAT.track);
    rectD(D, -x, -z, x, z, col(it, '#2b63a8'), MAT.track, Y + 0.002);
    box2(D, -x, -z, x, z, t);
    hline(D, -x, x, -sz, t); hline(D, -x, x, sz, t);
    vline(D, -sx, -sz, sz, t); vline(D, sx, -sz, sz, t);
    hline(D, -sx, sx, 0, t);
    if (it.variant !== '없음') { net(C, d, 1.0, 1.0); }
  };
  E['배드민턴장'] = (C, it, w, d) => {
    const D = C.D, x = w / 2, z = d / 2, t = 0.04;
    surface(D, w, d, 1.5, col(it, '#2f8f5b'), MAT.track);
    box2(D, -x, -z, x, z, t);
    hline(D, -x, x, -z + 0.46, t); hline(D, -x, x, z - 0.46, t);
    [-1, 1].forEach((s) => { vline(D, s * 1.98, -z, z, t); vline(D, s * (x - 0.76), -z, z, t); hline(D, s * 1.98, s * x, 0, t); });
    if (it.variant !== '없음') net(C, d, 1.55, 0.76);
  };
  E['육상 트랙'] = (C, it, w, d) => {
    const D = C.D, R = d / 2, L = Math.max(0, (w - d) / 2), lanes = Math.max(4, it.lanes || 8), lw = Math.min(1.22 * (d / 92), R / (lanes + 2)), tw = lanes * lw;
    const red = hex('#b4533f'), green = hex('#3f9447'), n = 24, y = Y;
    // 안쪽 잔디
    rectD(D, -L, -(R - tw), L, R - tw, green, MAT.turf, y);
    [-1, 1].forEach((s) => { for (let i = 0; i < n; i++) { const a = -PI / 2 + (PI * i) / n, b = -PI / 2 + (PI * (i + 1)) / n, r = R - tw; D.tri([s * L, y, 0], [s * (L + Math.cos(a) * r), y, Math.sin(a) * r], [s * (L + Math.cos(b) * r), y, Math.sin(b) * r], green, MAT.turf); } });
    // 트랙 띠와 레인 선
    const band = (r0, r1, c, mat, yy) => {
      rectD(D, -L, -r1, L, -r0, c, mat, yy); rectD(D, -L, r0, L, r1, c, mat, yy);
      [-1, 1].forEach((s) => { for (let i = 0; i < n; i++) {
        const a = -PI / 2 + (PI * i) / n, b = -PI / 2 + (PI * (i + 1)) / n;
        D.quad([s * (L + Math.cos(a) * r0), yy, Math.sin(a) * r0], [s * (L + Math.cos(b) * r0), yy, Math.sin(b) * r0], [s * (L + Math.cos(b) * r1), yy, Math.sin(b) * r1], [s * (L + Math.cos(a) * r1), yy, Math.sin(a) * r1], c, mat);
      } });
    };
    band(R - tw, R, red, MAT.track, y);
    for (let i = 0; i <= lanes; i++) band(R - tw + i * lw - 0.03, R - tw + i * lw + 0.03, LINE, 0, y + 0.004);
    vline(D, L * 0.9, R - tw, R, 0.08); // 결승선
  };
  // 낱개 골대·농구대: 앞(+z)이 경기장 쪽. 옆으로 누운 모형을 90도 돌려 씀
  E['골대'] = (C, it, w, d, h) => { C.at(0, 0, -90); goal(C, -(d / 2 - 0.1), w, h, 1, d - 0.2); C.at(0, 0); };
  E['농구대'] = (C) => { C.at(0, 0, -90); hoop(C, 1.0, -1); C.at(0, 0); };
  E['시상대'] = (C, it, w, d, h) => {
    const S = C.S, bw = w / 3, hs = [h * 0.66, h, h * 0.45], c = [hex('#c0c5cc'), hex('#d4a92a'), hex('#b0733a')];
    ['2', '1', '3'].forEach((n, i) => {
      const x0 = -w / 2 + i * bw;
      S.box(x0, 0, -d / 2, x0 + bw - 0.01, hs[i], d / 2, WHITE, 0, { top: c[i] });
      C.face([[x0 + bw * 0.25, hs[i] * 0.12, d / 2 + 0.004], [x0 + bw * 0.75, hs[i] * 0.12, d / 2 + 0.004], [x0 + bw * 0.75, hs[i] * 0.88, d / 2 + 0.004], [x0 + bw * 0.25, hs[i] * 0.88, d / 2 + 0.004]],
        face(null, (bw * 0.5) / (hs[i] * 0.76), { bg: c[i], plain: true, text: n }));
    });
  };
  E['점수판'] = (C, it, w, d, h) => {
    const S = C.S, y0 = h * 0.45;
    [-w / 2 + 0.25, w / 2 - 0.25].forEach((x) => S.box(x - 0.06, 0, -0.06, x + 0.06, y0, 0.06, DARK, MAT.metal));
    S.box(-w / 2, y0, -0.1, w / 2, h, 0.1, BLACK, 0, { bottom: true });
    C.face([[-w / 2 + 0.06, y0 + 0.06, 0.104], [w / 2 - 0.06, y0 + 0.06, 0.104], [w / 2 - 0.06, h - 0.06, 0.104], [-w / 2 + 0.06, h - 0.06, 0.104]],
      face(it, (w - 0.12) / (h - y0 - 0.12), { bg: hex('#10151c'), led: true, text: it.text || 'HOME 0 : 0 AWAY' }), 'solid', true);
  };
  E['선수 벤치'] = (C, it, w, d, h) => {
    const S = C.S, c = col(it, '#2563eb');
    S.box(-w / 2 + 0.1, 0.38, -d / 2 + 0.25, w / 2 - 0.1, 0.44, -d / 2 + 0.7, c, 0, { bottom: true });
    S.box(-w / 2 + 0.1, 0.44, -d / 2 + 0.2, w / 2 - 0.1, 0.85, -d / 2 + 0.26, c);
    const n = Math.max(2, Math.round(w / 1.6));
    for (let i = 0; i <= n; i++) {
      const x = -w / 2 + 0.05 + ((w - 0.1) * i) / n;
      S.beam([x, 0, -d / 2 + 0.08], [x, h * 0.86, -d / 2 + 0.08], 0.05, STEEL, MAT.metal);
      S.beam([x, h * 0.86, -d / 2 + 0.08], [x, h, d / 2 - 0.1], 0.05, STEEL, MAT.metal);
      S.box(x - 0.03, 0, -d / 2 + 0.25, x + 0.03, 0.38, -d / 2 + 0.7, STEEL, MAT.metal);
    }
    C.G.quad([-w / 2, 0.1, -d / 2 + 0.05], [w / 2, 0.1, -d / 2 + 0.05], [w / 2, h * 0.86, -d / 2 + 0.05], [-w / 2, h * 0.86, -d / 2 + 0.05], hex('#cfe3f1'), MAT.glass);
    C.G.quad([-w / 2, h * 0.86, -d / 2 + 0.05], [w / 2, h * 0.86, -d / 2 + 0.05], [w / 2, h, d / 2 - 0.1], [-w / 2, h, d / 2 - 0.1], hex('#cfe3f1'), MAT.glass);
  };
  E['트로피'] = (C, it, w, d, h) => {
    const S = C.S, g = col(it, '#d9a827'), r = Math.min(w, d) / 2;
    S.cube(0, 0, 0, r * 1.5, h * 0.22, r * 1.5, hex('#3a2a20'), MAT.grain);
    S.cube(0, h * 0.22, 0, r * 1.1, h * 0.06, r * 1.1, g, MAT.metal);
    const prof = [[0.28, 0.28], [0.12, 0.36], [0.1, 0.5], [0.3, 0.56], [0.62, 0.74], [0.74, 0.98], [0.7, 1.0]]; // [반지름 비율, 높이 비율]
    for (let i = 0; i < prof.length - 1; i++) S.tube([0, h * prof[i][1], 0], [0, h * prof[i + 1][1], 0], r * prof[i][0], r * prof[i + 1][0], g, MAT.metal, 16, false, false);
    [-1, 1].forEach((s) => { for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI, b = ((i + 1) / 6) * PI, cx = s * r * 0.7, cy = h * 0.8, rr = h * 0.13;
      S.tube([cx + s * Math.sin(a) * rr, cy + Math.cos(a) * rr, 0], [cx + s * Math.sin(b) * rr, cy + Math.cos(b) * rr, 0], 0.03, 0.03, g, MAT.metal, 6, false, false);
    } });
  };

  /* ── 구조물 ── */
  E['돔 텐트'] = (C, it, w, d, h) => {
    const S = C.S, c = col(it, WHITE);
    S.ball(0, 0, 0, w / 2, h, d / 2, c, MAT.canvas, 20, 7, true);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 2 * PI; S.beam([Math.cos(a) * w / 2, 0, Math.sin(a) * d / 2], [Math.cos(a) * w / 2 * 0.72, h * 0.72, Math.sin(a) * d / 2 * 0.72], 0.05, CHROME, MAT.metal); }
    const dw = Math.min(2.2, w * 0.3);
    S.quad([-dw / 2, 0.02, d / 2 * 0.99], [dw / 2, 0.02, d / 2 * 0.99], [dw / 2 * 0.9, Math.min(2.3, h * 0.55), d / 2 * 0.86], [-dw / 2 * 0.9, Math.min(2.3, h * 0.55), d / 2 * 0.86], hex('#2a2d33'));
  };
  E['파고라'] = (C, it, w, d, h) => {
    const S = C.S, c = col(it, WOOD), t = 0.12;
    M.legs(S, w, d, h - 0.15, t, c, MAT.grain, 0.1);
    [-d / 2 + 0.16, d / 2 - 0.16].forEach((z) => S.box(-w / 2 - 0.2, h - 0.15, z - 0.05, w / 2 + 0.2, h, z + 0.05, c, MAT.grain, { bottom: true }));
    const n = Math.max(4, Math.round(w / 0.4));
    for (let i = 0; i <= n; i++) { const x = -w / 2 + (w * i) / n; S.box(x - 0.025, h, -d / 2 - 0.2, x + 0.025, h + 0.1, d / 2 + 0.2, c, MAT.grain, { bottom: true }); }
  };
  E['관람석'] = (C, it, w, d, h) => {
    const S = C.S, n = Math.max(2, it.tiers || 5), td = d / n, th = h / n, c = col(it, '#2563eb');
    for (let i = 0; i < n; i++) {
      const z1 = d / 2 - i * td, z0 = z1 - td, y = (i + 1) * th;
      S.box(-w / 2, 0, z0, w / 2, y - 0.02, z1, hex('#8d939b'), MAT.metal, { top: hex('#a5abb3') });
      S.box(-w / 2 + 0.1, y - 0.02, z0 + 0.05, w / 2 - 0.1, y + 0.05, z0 + td * 0.55, c, 0, { bottom: true });
    }
    [-w / 2, w / 2].forEach((x) => S.beam([x, th + 0.9, d / 2], [x, h + 0.9, -d / 2 + td], 0.04, CHROME, MAT.metal));
    S.beam([-w / 2, h + 1.0, -d / 2], [w / 2, h + 1.0, -d / 2], 0.04, CHROME, MAT.metal);
    for (let i = 0; i <= Math.round(w / 2); i++) { const x = -w / 2 + (w * i) / Math.round(w / 2); S.beam([x, 0, -d / 2], [x, h + 1.0, -d / 2], 0.04, CHROME, MAT.metal); }
  };
  E['컨테이너'] = (C, it, w, d, h) => {
    const S = C.S, c = col(it, '#2f6fb7'), dk = shade(c, 0.78), z = d / 2;
    S.box(-w / 2, 0.12, -z, w / 2, h, z, c, MAT.gloss, { bottom: true });
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([i, j]) => S.box(i * (w / 2) - 0.06, 0, j * z - 0.06, i * (w / 2) + 0.06, h + 0.02, j * z + 0.06, dk, MAT.metal));
    S.box(-w / 2 - 0.02, h - 0.1, -z - 0.02, w / 2 + 0.02, h + 0.02, z + 0.02, dk, MAT.metal, { bottom: true });
    const ribs = Math.round(w / 0.5);
    for (let i = 1; i < ribs; i++) { const x = -w / 2 + (w * i) / ribs; S.box(x - 0.03, 0.2, z, x + 0.03, h - 0.14, z + 0.025, dk); S.box(x - 0.03, 0.2, -z - 0.025, x + 0.03, h - 0.14, -z, dk); }
    if (it.variant === '창고형') {
      S.quad([w / 2 + 0.03, 0.16, -z + 0.1], [w / 2 + 0.03, 0.16, z - 0.1], [w / 2 + 0.03, h - 0.14, z - 0.1], [w / 2 + 0.03, h - 0.14, -z + 0.1], dk);
      [-0.3, 0.3].forEach((p) => S.box(w / 2 + 0.03, 0.5, p - 0.02, w / 2 + 0.07, h - 0.5, p + 0.02, CHROME, MAT.metal));
    } else {
      const wx = it.variant === '매점형' ? w * 0.5 : Math.min(1.6, w * 0.3);
      S.quad([-w / 2 + 0.4, 0.14, z + 0.03], [-w / 2 + 1.3, 0.14, z + 0.03], [-w / 2 + 1.3, 2.15, z + 0.03], [-w / 2 + 0.4, 2.15, z + 0.03], WHITE);
      S.quad([w / 2 - 0.4 - wx, 1.0, z + 0.03], [w / 2 - 0.4, 1.0, z + 0.03], [w / 2 - 0.4, 2.0, z + 0.03], [w / 2 - 0.4 - wx, 2.0, z + 0.03], WINDOW, MAT.window);
      if (it.variant === '매점형') {
        S.quad([w / 2 - 0.5 - wx, 2.0, z + 1.0], [w / 2 - 0.3, 2.0, z + 1.0], [w / 2 - 0.3, 2.3, z + 0.03], [w / 2 - 0.5 - wx, 2.3, z + 0.03], WHITE, MAT.canvas);
        S.box(w / 2 - 0.4 - wx, 0.95, z, w / 2 - 0.4, 1.0, z + 0.35, STEEL, MAT.metal, { bottom: true });
      }
    }
    if (it.text || it.imageId) C.face([[-w * 0.3, h - 0.75, z + 0.032], [w * 0.3, h - 0.75, z + 0.032], [w * 0.3, h - 0.2, z + 0.032], [-w * 0.3, h - 0.2, z + 0.032]], face(it, (w * 0.6) / 0.55, { bg: WHITE, plain: true }));
  };
  E['매표소'] = (C, it, w, d, h) => {
    const S = C.S, c = col(it, '#e11d48'), z = d / 2;
    S.box(-w / 2, 0, -z, w / 2, h - 0.5, z, WHITE);
    S.box(-w / 2, 0, -z - 0.005, w / 2, 0.9, z + 0.005, c);
    S.quad([-w * 0.36, 1.0, z + 0.006], [w * 0.36, 1.0, z + 0.006], [w * 0.36, h - 0.75, z + 0.006], [-w * 0.36, h - 0.75, z + 0.006], WINDOW, MAT.window);
    S.box(-w * 0.4, 0.92, z, w * 0.4, 0.98, z + 0.3, STEEL, MAT.metal, { bottom: true });
    S.box(-w / 2 - 0.25, h - 0.5, -z - 0.1, w / 2 + 0.25, h - 0.38, z + 0.6, c, 0, { bottom: true });
    S.box(-w / 2, h - 0.38, z - 0.1, w / 2, h, z, c);
    C.face([[-w / 2 + 0.05, h - 0.34, z + 0.004], [w / 2 - 0.05, h - 0.34, z + 0.004], [w / 2 - 0.05, h - 0.04, z + 0.004], [-w / 2 + 0.05, h - 0.04, z + 0.004]], face(it, (w - 0.1) / 0.3, { bg: c, plain: true, text: it.text || '매표소' }));
  };

  /* ── 좌석 ── */
  E['벤치'] = (C, it, w, d, h) => {
    const S = C.S, c = col(it, WOOD);
    for (let i = 0; i < 3; i++) S.box(-w / 2, 0.42, -d / 2 + 0.16 + i * 0.14, w / 2, 0.46, -d / 2 + 0.28 + i * 0.14, c, MAT.grain, { bottom: true });
    for (let i = 0; i < 2; i++) S.box(-w / 2, 0.56 + i * 0.14, -d / 2 + 0.04, w / 2, 0.68 + i * 0.14, -d / 2 + 0.08, c, MAT.grain, { bottom: true });
    [-w / 2 + 0.15, w / 2 - 0.15].forEach((x) => { S.box(x - 0.03, 0, -d / 2 + 0.03, x + 0.03, h, -d / 2 + 0.09, DARK, MAT.metal); S.box(x - 0.03, 0, -d / 2 + 0.09, x + 0.03, 0.42, d / 2 - 0.05, DARK, MAT.metal); });
  };
  E['VIP 소파'] = (C, it, w, d, h) => {
    const S = C.S, c = col(it, '#7c1d2e'), arm = Math.min(0.18, w * 0.14), light = shade(c, 1.18);
    S.box(-w / 2, 0.06, -d / 2, w / 2, 0.3, d / 2, c, MAT.fabric, { bottom: true });
    S.box(-w / 2, 0.3, -d / 2, w / 2, h, -d / 2 + 0.24, c, MAT.fabric);
    S.box(-w / 2, 0.3, -d / 2 + 0.24, -w / 2 + arm, 0.62, d / 2, c, MAT.fabric);
    S.box(w / 2 - arm, 0.3, -d / 2 + 0.24, w / 2, 0.62, d / 2, c, MAT.fabric);
    const n = Math.max(1, Math.floor(w / 0.6)), cw = (w - arm * 2) / n;
    for (let i = 0; i < n; i++) S.box(-w / 2 + arm + i * cw + 0.01, 0.3, -d / 2 + 0.25, -w / 2 + arm + (i + 1) * cw - 0.01, 0.44, d / 2 - 0.01, light, MAT.fabric);
    M.legs(S, w, d, 0.06, 0.05, GOLD, MAT.metal, 0.04);
  };
  E['피크닉 테이블'] = (C, it, w, d, h) => {
    const S = C.S, c = col(it, WOOD_LIGHT);
    S.box(-w / 2, h - 0.05, -0.38, w / 2, h, 0.38, c, MAT.grain, { bottom: true });
    [-1, 1].forEach((s) => {
      S.box(-w / 2, 0.42, s * (d / 2 - 0.3), w / 2, 0.47, s * (d / 2 - 0.02), c, MAT.grain, { bottom: true });
      [-w / 2 + 0.25, w / 2 - 0.25].forEach((x) => S.beam([x, h - 0.05, s * 0.2], [x, 0, s * (d / 2 - 0.1)], 0.07, c, MAT.grain));
    });
    [-w / 2 + 0.25, w / 2 - 0.25].forEach((x) => S.box(x - 0.035, 0.36, -d / 2 + 0.05, x + 0.035, 0.42, d / 2 - 0.05, c, MAT.grain, { bottom: true }));
  };

  /* ── 장비 ── */
  E['카메라'] = (C, it, w, d, h) => {
    const S = C.S, y = h - 0.3;
    [0, 2.1, 4.2].forEach((a) => S.beam([0, y - 0.1, 0], [Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42], 0.035, BLACK, MAT.metal));
    S.cyl(0, y - 0.12, 0, 0.05, y, 0.07, DARK, MAT.metal, 8);
    S.box(-0.11, y, -0.3, 0.11, y + 0.24, 0.2, hex('#22252b'));
    S.tube([0, y + 0.12, 0.2], [0, y + 0.12, 0.42], 0.07, 0.085, BLACK, 0, 10);
    S.tube([0, y + 0.12, 0.42], [0, y + 0.12, 0.425], 0.07, 0.07, hex('#3b5b8a'), MAT.window, 10);
    S.box(-0.09, y + 0.24, -0.26, 0.09, y + 0.38, -0.06, hex('#22252b'));
    S.beam([0.12, y + 0.05, -0.2], [0.3, y - 0.25, -0.55], 0.02, BLACK, MAT.metal);
  };
  E['스크린'] = (C, it, w, d, h) => {
    const S = C.S, y0 = Math.min(0.9, h * 0.3);
    [-w / 2 + 0.05, w / 2 - 0.05].forEach((x) => { S.box(x - 0.025, 0, -0.025, x + 0.025, h, 0.025, DARK, MAT.metal); S.beam([x, 0.02, -d / 2], [x, 0.02, d / 2], 0.04, DARK, MAT.metal); });
    S.box(-w / 2, y0, -0.02, w / 2, h, 0.015, BLACK, 0, { bottom: true });
    C.face([[-w / 2 + 0.05, y0 + 0.05, 0.019], [w / 2 - 0.05, y0 + 0.05, 0.019], [w / 2 - 0.05, h - 0.05, 0.019], [-w / 2 + 0.05, h - 0.05, 0.019]], face(it, (w - 0.1) / (h - y0 - 0.1), { bg: hex('#f4f6f8'), plain: true }));
  };
  E['난로'] = (C, it, w, d, h) => {
    const S = C.S, r = Math.min(w, d) / 2;
    S.cyl(0, 0, 0, r * 0.75, 0.75, r * 0.7, hex('#b9bec6'), MAT.metal, 14);
    S.cyl(0, 0.75, 0, 0.04, h - 0.45, 0.04, CHROME, MAT.metal, 8);
    S.cyl(0, h - 0.45, 0, 0.11, h - 0.15, 0.14, hex('#ff8a3d'), MAT.emissive, 12);
    S.tube([0, h - 0.15, 0], [0, h, 0], r * 1.25, 0.05, CHROME, MAT.metal, 16, true, false);
  };

  /* ── 안내·장식 ── */
  E['윙배너'] = (C, it, w, d, h) => {
    const S = C.S, c = col(it, '#e11d48');
    S.cyl(0, 0, 0, 0.2, 0.05, 0.18, DARK, 0, 10);
    S.tube([-w / 2 + 0.03, 0.05, 0], [-w / 2 + 0.03, h * 0.9, 0], 0.018, 0.012, CHROME, MAT.metal, 6);
    S.tube([-w / 2 + 0.03, h * 0.9, 0], [w * 0.2, h, 0], 0.012, 0.008, CHROME, MAT.metal, 6);
    const cv = face(it, (w - 0.1) / (h - 0.6), { bg: c });
    const pts = [[-w / 2 + 0.05, 0.5, 0.004], [w / 2 - 0.08, 0.7, 0.004], [w / 2 - 0.02, h * 0.9, 0.004], [-w / 2 + 0.05, h * 0.96, 0.004]];
    S.quad([pts[0][0], pts[0][1], 0], [pts[1][0], pts[1][1], 0], [pts[2][0], pts[2][1], 0], [pts[3][0], pts[3][1], 0], c);
    C.face(pts, cv);
    C.face([[pts[1][0], pts[1][1], -0.004], [pts[0][0], pts[0][1], -0.004], [pts[3][0], pts[3][1], -0.004], [pts[2][0], pts[2][1], -0.004]], cv);
  };
  E['A형 입간판'] = (C, it, w, d, h) => {
    const S = C.S, c = col(it, '#f59e0b'), cv = face(it, (w - 0.08) / (h - 0.12), { bg: c, text: it.text || '안내' });
    [1, -1].forEach((s) => {
      const z0 = s * d * 0.42, z1 = s * 0.03;
      S.quad([-w / 2, 0, z0 - s * 0.012], [w / 2, 0, z0 - s * 0.012], [w / 2, h, z1 - s * 0.012], [-w / 2, h, z1 - s * 0.012], DARK);
      const pts = [[-w / 2 + 0.04, 0.06, z0], [w / 2 - 0.04, 0.06, z0], [w / 2 - 0.04, h - 0.06, z1 + s * 0.004], [-w / 2 + 0.04, h - 0.06, z1 + s * 0.004]];
      C.face(s > 0 ? pts : [pts[1], pts[0], pts[3], pts[2]], cv);
    });
  };
  E['풍선 아치'] = (C, it, w, d, h) => {
    const S = C.S, c = col(it, '#ec4899'), r = Math.min(0.24, w * 0.06), n = Math.max(14, Math.round((w + 2 * h) / (r * 1.3)));
    for (let i = 0; i <= n; i++) {
      const a = PI - (i / n) * PI, x = Math.cos(a) * (w / 2 - r), y = r + Math.sin(a) * (h - 2 * r);
      for (let k = 0; k < 3; k++) { const b = (k / 3) * 2 * PI + i * 0.9; S.ball(x + Math.cos(b) * r * 0.5, y + Math.sin(b) * r * 0.35, Math.sin(b) * r * 0.6, r, r * 1.1, r, (i + k) % 3 === 0 ? WHITE : (i + k) % 3 === 1 ? c : shade(c, 0.72), MAT.gloss, 8, 5); }
    }
  };
  E['풍선 다발'] = (C, it, w, d, h) => {
    const S = C.S, c = col(it, '#ef4444'), cols = [c, WHITE, shade(c, 0.7), hex('#fde047'), c, hex('#60a5fa'), WHITE];
    S.cyl(0, 0, 0, 0.12, 0.12, 0.1, DARK, 0, 8);
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9, rr = i === 0 ? 0 : 0.28, x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = h - 0.25 - (i % 3) * 0.22;
      S.tube([0, 0.12, 0], [x, y - 0.2, z], 0.004, 0.004, WHITE, 0, 4, false, false);
      S.ball(x, y, z, 0.17, 0.21, 0.17, cols[i], MAT.gloss, 10, 6);
    }
  };
  E['입체 글자'] = (C, it, w, d, h) => {
    const S = C.S, c = col(it, '#e11d48'), chars = [...String(it.text || 'LOVE').replace(/\s+/g, '')].slice(0, 12), n = Math.max(1, chars.length), cw = w / n;
    chars.forEach((ch, i) => {
      const x0 = -w / 2 + i * cw + cw * 0.05, x1 = x0 + cw * 0.9, cv = face(null, (cw * 0.9) / h, { bg: c, plain: true, text: ch });
      S.box(x0, 0, -d / 2, x1, h, d / 2, c);
      C.face([[x0, 0, d / 2 + 0.004], [x1, 0, d / 2 + 0.004], [x1, h, d / 2 + 0.004], [x0, h, d / 2 + 0.004]], cv);
      C.face([[x1, 0, -d / 2 - 0.004], [x0, 0, -d / 2 - 0.004], [x0, h, -d / 2 - 0.004], [x1, h, -d / 2 - 0.004]], cv);
    });
  };
  E['분수'] = (C, it, w, d, h) => {
    const S = C.S, r = Math.min(w, d) / 2, st = hex('#b9b6ae');
    S.tube([0, 0, 0], [0, 0.45, 0], r, r, st, MAT.stone, 28, false, false);
    S.tube([0, 0.45, 0], [0, 0.45, 0], r, r - 0.18, st, MAT.stone, 28, false, false);
    for (let i = 0; i < 28; i++) { const a = (i / 28) * 2 * PI, b = ((i + 1) / 28) * 2 * PI; S.quad([Math.cos(a) * r, 0.45, Math.sin(a) * r], [Math.cos(b) * r, 0.45, Math.sin(b) * r], [Math.cos(b) * (r - 0.18), 0.45, Math.sin(b) * (r - 0.18)], [Math.cos(a) * (r - 0.18), 0.45, Math.sin(a) * (r - 0.18)], st, MAT.stone); }
    S.disc(0, 0.36, 0, r - 0.17, hex('#3b8fd9'), MAT.water, 28);
    S.cyl(0, 0, 0, r * 0.16, h * 0.55, r * 0.1, st, MAT.stone, 12);
    S.tube([0, h * 0.55, 0], [0, h * 0.62, 0], r * 0.1, r * 0.42, st, MAT.stone, 16, false, false);
    S.disc(0, h * 0.615, 0, r * 0.4, hex('#3b8fd9'), MAT.water, 16);
    C.G.tube([0, h * 0.6, 0], [0, h, 0], 0.05, 0.015, hex('#e8f4ff'), MAT.glass, 8, false, false);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 2 * PI; C.G.tube([Math.cos(a) * r * 0.4, h * 0.6, Math.sin(a) * r * 0.4], [Math.cos(a) * r * 0.62, 0.4, Math.sin(a) * r * 0.62], 0.02, 0.035, hex('#e8f4ff'), MAT.glass, 5, false, false); }
  };
  E['조형물'] = (C, it, w, d, h) => {
    const S = C.S, c = col(it, '#c0392b'), r = Math.min(w, d) / 2;
    S.cube(0, 0, 0, r * 1.3, h * 0.2, r * 1.3, hex('#8d8f93'), MAT.concrete);
    if (it.style === '기둥') { for (let i = 0; i < 9; i++) { C.at(0, 0, i * 11); S.cube(0, h * (0.2 + i * 0.088), 0, r * (1.0 - i * 0.06), h * 0.09, r * (1.0 - i * 0.06), i % 2 ? c : shade(c, 1.2), MAT.gloss, { bottom: true }); } C.at(0, 0); }
    else if (it.style === '고리') { const rr = (h * 0.8) / 2 - 0.1; for (let i = 0; i < 20; i++) { const a = (i / 20) * 2 * PI, b = ((i + 1) / 20) * 2 * PI, cy = h * 0.2 + rr + 0.1; S.tube([Math.cos(a) * rr, cy + Math.sin(a) * rr, 0], [Math.cos(b) * rr, cy + Math.sin(b) * rr, 0], 0.12, 0.12, c, MAT.metal, 8, false, false); } }
    else S.ball(0, h * 0.2 + (h * 0.8) / 2, 0, Math.min(r, h * 0.4), (h * 0.8) / 2, Math.min(r, h * 0.4), c, MAT.metal, 18, 10);
  };
  E['바닥 화살표'] = (C, it, w, d) => {
    const c = col(it, '#f8f8f4'), z = d / 2;
    C.D.poly([[-w * 0.18, z], [w * 0.18, z], [w * 0.18, -z + w * 0.7], [w / 2, -z + w * 0.7], [0, -z], [-w / 2, -z + w * 0.7], [-w * 0.18, -z + w * 0.7]], Y, c);
  };
  E['횡단보도'] = (C, it, w, d) => {
    const n = Math.max(3, Math.round(w / 1.0));
    for (let i = 0; i < n; i++) if (i % 2 === 0) rectD(C.D, -w / 2 + (w * i) / n, -d / 2, -w / 2 + (w * (i + 1)) / n, d / 2, LINE);
  };

  /* ── 편의·안전, 차량 ── */
  function van(C, w, d, h, body, o) {
    const S = C.S, cab = Math.min(1.9, w * 0.3), bx = w / 2 - cab, y0 = 0.4;
    S.box(-w / 2, y0, -d / 2, bx, h, d / 2, body, MAT.gloss, { bottom: true });
    S.extrude([[bx, y0], [w / 2, y0], [w / 2, h * 0.5], [w / 2 - cab * 0.45, h * 0.86], [bx, h * 0.86]], -d / 2 + 0.03, d / 2 - 0.03, o.cab || body, MAT.gloss, 'z');
    S.quad([w / 2 - cab * 0.42, h * 0.84, d / 2 - 0.12], [w / 2 - cab * 0.42, h * 0.84, -d / 2 + 0.12], [w / 2 - 0.02, h * 0.52, -d / 2 + 0.12], [w / 2 - 0.02, h * 0.52, d / 2 - 0.12], WINDOW, MAT.window);
    [-1, 1].forEach((s) => S.quad([bx + 0.12, h * 0.5, s * (d / 2 - 0.025)], [w / 2 - cab * 0.5, h * 0.5, s * (d / 2 - 0.025)], [w / 2 - cab * 0.5, h * 0.8, s * (d / 2 - 0.025)], [bx + 0.12, h * 0.8, s * (d / 2 - 0.025)], WINDOW, MAT.window));
    const r = Math.min(0.5, h * 0.16);
    [[-w / 2 + w * 0.2, 1], [-w / 2 + w * 0.2, -1], [w / 2 - cab * 0.55, 1], [w / 2 - cab * 0.55, -1]].forEach(([x, s]) => M.wheel(S, x, s * (d / 2 - 0.15), r, 0.26));
    [-1, 1].forEach((s) => S.quad([w / 2 + 0.004, y0 + 0.12, s * d * 0.3 - 0.14], [w / 2 + 0.004, y0 + 0.12, s * d * 0.3 + 0.14], [w / 2 + 0.004, y0 + 0.27, s * d * 0.3 + 0.14], [w / 2 + 0.004, y0 + 0.27, s * d * 0.3 - 0.14], hex('#fff7d6'), MAT.emissive));
    return bx;
  }
  E['구급차'] = (C, it, w, d, h) => {
    const S = C.S, bx = van(C, w, d, h, WHITE, {});
    [-1, 1].forEach((s) => {
      S.quad([-w / 2 + 0.05, h * 0.42, s * (d / 2 + 0.004)], [bx, h * 0.42, s * (d / 2 + 0.004)], [bx, h * 0.52, s * (d / 2 + 0.004)], [-w / 2 + 0.05, h * 0.52, s * (d / 2 + 0.004)], hex('#dc2626'));
      S.quad([-w * 0.12, h * 0.6, s * (d / 2 + 0.004)], [w * 0.0, h * 0.6, s * (d / 2 + 0.004)], [w * 0.0, h * 0.85, s * (d / 2 + 0.004)], [-w * 0.12, h * 0.85, s * (d / 2 + 0.004)], hex('#16a34a'));
    });
    S.box(bx - 0.3, h, -d * 0.3, bx + 0.1, h + 0.14, d * 0.3, hex('#ef4444'), MAT.emissive, { bottom: true });
  };
  // 의무실 텐트: 흰 몽골텐트 + 둘레 천(밸런스) 네 면과 지붕 꼭대기에 빨간 십자
  E['의무실 텐트'] = (C, it, w, d, h) => {
    const S = C.S, red = hex('#dc2626');
    E['몽골텐트'](C, { ...it, color: null, variant: it.variant || '뒤·양옆' }, w, d, h);
    const y = h - 0.14, a = 0.12, t = 0.04;
    [-1, 1].forEach((s) => {
      const z = s * (d / 2 + 0.006), x = s * (w / 2 + 0.006);
      S.quad([-a, y - t, z], [a, y - t, z], [a, y + t, z], [-a, y + t, z], red);
      S.quad([-t, y - a, z], [t, y - a, z], [t, y + a, z], [-t, y + a, z], red);
      S.quad([x, y - t, -a], [x, y - t, a], [x, y + t, a], [x, y + t, -a], red);
      S.quad([x, y - a, -t], [x, y - a, t], [x, y + a, t], [x, y + a, -t], red);
    });
    // 지붕 위 깃발판 (멀리서도 보이게)
    const top = h + Math.min(w, d) * 0.42 + 0.02, b = Math.min(w, d) * 0.14, bt = b * 0.34;
    S.box(-b, top, -bt, b, top + 0.02, bt, red, 0, { bottom: true });
    S.box(-bt, top, -b, bt, top + 0.02, b, red, 0, { bottom: true });
  };
  E['트럭'] = (C, it, w, d, h) => { van(C, w, d, h, WHITE, { cab: col(it, '#2563eb') }); };
  E['자전거'] = (C, it, w, d, h) => {
    const S = C.S, c = col(it, '#dc2626'), r = Math.min(0.34, h * 0.32), x = w / 2 - r;
    [-x, x].forEach((p) => { S.tube([p, r, -0.02], [p, r, 0.02], r, r, hex('#1c1d20'), 0, 16, false, false); S.tube([p, r, -0.025], [p, r, 0.025], r * 0.86, r * 0.86, hex('#c9ced6'), MAT.metal, 16); });
    const bb = [-0.05, r + 0.02, 0], seat = [-0.25, h * 0.78, 0], head = [x - 0.18, h * 0.82, 0];
    [[[-x, r, 0], bb], [bb, seat], [seat, [-x, r, 0]], [bb, head], [seat, head], [head, [x, r, 0]]].forEach(([a, b]) => S.beam(a, b, 0.035, c, MAT.gloss));
    S.box(seat[0] - 0.12, seat[1], -0.06, seat[0] + 0.1, seat[1] + 0.05, 0.06, BLACK, 0, { bottom: true });
    S.beam([head[0], head[1], 0], [head[0] + 0.03, h, 0], 0.03, CHROME, MAT.metal);
    S.beam([head[0] + 0.03, h, -0.25], [head[0] + 0.03, h, 0.25], 0.03, BLACK, MAT.metal);
  };
  E['안내 키오스크'] = (C, it, w, d, h) => {
    const S = C.S;
    S.box(-w / 2 - 0.05, 0, -d / 2, w / 2 + 0.05, 0.06, d / 2, DARK, MAT.metal);
    S.box(-w / 2, 0.06, -0.06, w / 2, h, 0.06, hex('#22252b'));
    C.face([[-w / 2 + 0.04, h * 0.3, 0.064], [w / 2 - 0.04, h * 0.3, 0.064], [w / 2 - 0.04, h - 0.06, 0.064], [-w / 2 + 0.04, h - 0.06, 0.064]], face(it, (w - 0.08) / (h * 0.7 - 0.06), { bg: hex('#0b1020'), led: true, text: it.text || '안내' }), 'solid', true);
  };
  E['분리수거함'] = (C, it, w, d, h) => {
    const S = C.S, cs = [hex('#2563eb'), hex('#16a34a'), hex('#eab308')], bw = w / 3;
    cs.forEach((c, i) => {
      const x0 = -w / 2 + i * bw + 0.03, x1 = x0 + bw - 0.06;
      S.box(x0, 0, -d / 2, x1, h * 0.86, d / 2, c);
      S.box(x0 - 0.015, h * 0.86, -d / 2 - 0.015, x1 + 0.015, h, d / 2 + 0.015, shade(c, 0.75));
      S.quad([x0 + 0.08, h * 0.62, d / 2 + 0.004], [x1 - 0.08, h * 0.62, d / 2 + 0.004], [x1 - 0.08, h * 0.76, d / 2 + 0.004], [x0 + 0.08, h * 0.76, d / 2 + 0.004], BLACK);
    });
  };
  E['경사로'] = (C, it, w, d, h) => {
    const S = C.S;
    S.extrude([[d / 2, 0], [-d / 2, 0], [-d / 2, h]], -w / 2, w / 2, hex('#8d939b'), MAT.metal, 'x');
    [-w / 2 + 0.03, w / 2 - 0.03].forEach((x) => {
      S.beam([x, 0.9, d / 2], [x, h + 0.9, -d / 2], 0.04, CHROME, MAT.metal);
      [d / 2, 0, -d / 2].forEach((z) => { const y = h * (0.5 - z / d); S.beam([x, y, z], [x, y + 0.9, z], 0.035, CHROME, MAT.metal); });
    });
  };

  /* ── 건물·조경 ── */
  E['바위'] = (C, it, w, d, h) => {
    const S = C.S, g = hex('#8b8a86');
    S.ball(0, 0, 0, w / 2, h, d / 2, g, MAT.stone, 9, 5, true);
    S.ball(w * 0.22, 0, d * 0.12, w * 0.3, h * 0.62, d * 0.34, shade(g, 0.9), MAT.stone, 8, 4, true);
    S.ball(-w * 0.25, 0, -d * 0.15, w * 0.24, h * 0.5, d * 0.28, shade(g, 1.1), MAT.stone, 8, 4, true);
  };
  E['생울타리'] = (C, it, w, d, h) => {
    const S = C.S, g = hex('#3d8b3d');
    S.box(-w / 2, 0, -d / 2, w / 2, h * 0.86, d / 2, g, MAT.foliage);
    const n = Math.max(2, Math.round(w / (d * 1.1)));
    for (let i = 0; i < n; i++) S.ball(-w / 2 + ((i + 0.5) * w) / n, h * 0.8, 0, (w / n) * 0.58, h * 0.24, d * 0.56, i % 2 ? g : shade(g, 1.12), MAT.foliage, 8, 5);
  };
  E['버스 정류장'] = (C, it, w, d, h) => {
    const S = C.S, G = C.G, gl = hex('#cfe3f1');
    [-w / 2 + 0.08, w / 2 - 0.08].forEach((x) => { S.box(x - 0.05, 0, -d / 2 + 0.05, x + 0.05, h - 0.1, -d / 2 + 0.15, DARK, MAT.metal); S.box(x - 0.05, 0, d / 2 - 0.5, x + 0.05, h - 0.1, d / 2 - 0.4, DARK, MAT.metal); });
    S.box(-w / 2 - 0.2, h - 0.1, -d / 2 - 0.1, w / 2 + 0.2, h, d / 2 - 0.1, hex('#3a3f47'), MAT.metal, { bottom: true });
    G.quad([-w / 2 + 0.1, 0.2, -d / 2 + 0.1], [w / 2 - 0.1, 0.2, -d / 2 + 0.1], [w / 2 - 0.1, h - 0.15, -d / 2 + 0.1], [-w / 2 + 0.1, h - 0.15, -d / 2 + 0.1], gl, MAT.glass);
    G.quad([-w / 2 + 0.08, 0.2, -d / 2 + 0.1], [-w / 2 + 0.08, 0.2, d / 2 - 0.45], [-w / 2 + 0.08, h - 0.15, d / 2 - 0.45], [-w / 2 + 0.08, h - 0.15, -d / 2 + 0.1], gl, MAT.glass);
    S.box(-w / 2 + 0.5, 0.42, -d / 2 + 0.25, w * 0.1, 0.47, -d / 2 + 0.65, WOOD, MAT.grain, { bottom: true });
    [-w / 2 + 0.6, w * 0.0].forEach((x) => S.box(x - 0.03, 0, -d / 2 + 0.3, x + 0.03, 0.42, -d / 2 + 0.6, DARK, MAT.metal));
    const ax = w / 2 - 1.3;
    S.box(ax, 0.3, -d / 2 + 0.12, w / 2 - 0.15, h - 0.3, -d / 2 + 0.2, DARK);
    C.face([[ax + 0.04, 0.34, -d / 2 + 0.204], [w / 2 - 0.19, 0.34, -d / 2 + 0.204], [w / 2 - 0.19, h - 0.34, -d / 2 + 0.204], [ax + 0.04, h - 0.34, -d / 2 + 0.204]], face(it, (1.15 - 0.08) / (h - 0.68), { bg: hex('#f4f6f8'), text: it.text || '버스\n정류장' }), 'solid', true);
  };

  /* ── 나무: 은행·단풍·야자수 ── */
  const tree0 = E['나무'];
  E['나무'] = (C, it, w, d, h) => {
    const S = C.S, r = Math.min(w, d) / 2;
    if (it.style === '야자수') {
      const top = [r * 0.25, h * 0.88, 0];
      S.tube([0, 0, 0], [r * 0.12, h * 0.45, 0], r * 0.09, r * 0.07, hex('#8a6a4a'), MAT.grain, 8, false, false);
      S.tube([r * 0.12, h * 0.45, 0], top, r * 0.07, r * 0.055, hex('#8a6a4a'), MAT.grain, 8, false, false);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * 2 * PI + 0.2, dx = Math.cos(a), dz = Math.sin(a), g = i % 2 ? hex('#2f8a3a') : hex('#3fa049');
        const m1 = [top[0] + dx * r * 0.55, top[1] + h * 0.07, dz * r * 0.55], m2 = [top[0] + dx * r * 1.0, top[1] - h * 0.1, dz * r * 1.0], px = -dz * r * 0.13, pz = dx * r * 0.13;
        S.quad([top[0] - px * 0.3, top[1], -pz * 0.3], [top[0] + px * 0.3, top[1], pz * 0.3], [m1[0] + px, m1[1], m1[2] + pz], [m1[0] - px, m1[1], m1[2] - pz], g, MAT.foliage);
        S.quad([m1[0] - px, m1[1], m1[2] - pz], [m1[0] + px, m1[1], m1[2] + pz], [m2[0] + px * 0.2, m2[1], m2[2] + pz * 0.2], [m2[0] - px * 0.2, m2[1], m2[2] - pz * 0.2], g, MAT.foliage);
      }
      S.ball(top[0], top[1] - 0.05, 0, r * 0.1, r * 0.1, r * 0.1, hex('#6b4a2b'), 0, 6, 4);
      return;
    }
    if (it.style === '은행나무' || it.style === '단풍나무') {
      const pal = it.style === '은행나무' ? [hex('#f2c230'), hex('#f5d04a'), hex('#e3ad1c')] : [hex('#d9482b'), hex('#e8702a'), hex('#b8321f')];
      const th = h * 0.42;
      S.cyl(0, 0, 0, r * 0.1, th, r * 0.065, WOOD_DARK, 0, 8);
      for (let i = 0; i < 6; i++) {
        const a = (i / 5) * 2 * PI + C.rnd(), top = i === 5, rr = top ? 0 : r * (0.36 + C.rnd() * 0.12), br = r * (top ? 0.62 : 0.5 + C.rnd() * 0.14);
        S.ball(Math.cos(a) * rr, h * (top ? 0.78 : 0.56 + C.rnd() * 0.14), Math.sin(a) * rr, br, br * 0.82, br, pal[i % 3], MAT.foliage, 10, 6);
      }
      return;
    }
    tree0(C, it, w, d, h);
  };

  /* ── 사람: 어린이·선수, 옷 색 ── */
  const person0 = M.person;
  E['사람'] = (C, it, w, d) => {
    const n = Math.max(1, it.count || 1), per = Math.max(1, Math.min(n, it.perRow || 10)), rows = Math.ceil(n / per), cw = w / per;
    const lod = C.lod || C.crowd > 60, kid = it.style === '어린이', team = it.color ? hex(it.color) : null;
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / per), c = i % per, inRow = r === rows - 1 ? n - per * (rows - 1) : per;
      C.at(-w / 2 + (w - inRow * cw) / 2 + (c + 0.5) * cw + (C.rnd() - 0.5) * 0.08, -d / 2 + 0.2 + r * 0.6, (C.rnd() - 0.5) * 16);
      figure(C.S, it.style, C.rnd, lod, kid ? 0.66 + C.rnd() * 0.1 : 1, team);
    }
    C.at(0, 0);
  };
  /** 사람 한 명. q: 키 비율(어린이 0.7쯤), team: 옷 색 */
  function figure(S, style, rnd, lod, q, team) {
    if (q === 1 && !team && style !== '선수') return person0(S, style, rnd, lod);
    const k = (0.94 + rnd() * 0.11) * q, y = (v) => v * k, x = (v) => v * Math.max(0.78, q);
    const skin = [hex('#f1c9a5'), hex('#e8b88f'), hex('#d9a47a')][Math.floor(rnd() * 3)], hair = [hex('#1b1512'), hex('#2a1e17'), hex('#3a2a1e')][Math.floor(rnd() * 3)];
    const sport = style === '선수';
    const top = team || (sport ? hex('#dc2626') : [hex('#2563eb'), hex('#f59e0b'), hex('#16a34a'), hex('#db2777'), hex('#0891b2')][Math.floor(rnd() * 5)]);
    const pants = sport ? WHITE : style === '정장' ? shade(top, 0.9) : [hex('#1f2937'), hex('#3b4a6b'), hex('#57534e')][Math.floor(rnd() * 3)];
    if (lod) {
      S.box(-x(0.16), 0, -0.09, x(0.16), y(0.86), 0.09, pants);
      S.box(-x(0.21), y(0.86), -0.11, x(0.21), y(1.44), 0.11, top);
      S.box(-x(0.09), y(1.46), -0.1, x(0.09), y(1.69), 0.1, skin, 0, { top: hair });
      return;
    }
    [-0.09, 0.09].forEach((p) => {
      S.box(x(p) - 0.05, 0, -0.09, x(p) + 0.05, 0.06, 0.14, sport ? hex('#f97316') : BLACK);
      S.tube([x(p), 0.06, 0], [x(p), y(0.52), 0], 0.05, 0.06, sport ? skin : pants, 0, 8, false, false);
      S.tube([x(p), y(0.52), 0], [x(p), y(0.9), 0], 0.062, 0.085, pants, 0, 8, false, false);
    });
    S.ball(0, y(0.93), 0, x(0.175), 0.14 * k, 0.125, pants, 0, 8, 5);
    S.ball(0, y(1.17), 0, x(0.2), 0.31 * k, 0.13, top, 0, 8, 6);
    [-1, 1].forEach((s) => {
      S.tube([s * x(0.215), y(1.38), 0], [s * x(0.24), y(1.12), 0.01], 0.055, 0.05, top, 0, 8, false, false);
      S.tube([s * x(0.24), y(1.12), 0.01], [s * x(0.245), y(0.9), 0.02], 0.045, 0.04, sport ? skin : top, 0, 8, false, false);
      S.ball(s * x(0.248), y(0.855), 0.025, 0.04, 0.05, 0.035, skin, 0, 6, 4);
    });
    if (sport) S.quad([-0.05, y(1.1), 0.134], [0.05, y(1.1), 0.134], [0.05, y(1.3), 0.128], [-0.05, y(1.3), 0.128], WHITE);
    S.cyl(0, y(1.42), 0, 0.048, y(1.5), 0.044, skin, 0, 6);
    const hs = q < 1 ? 1.08 : 1;
    S.ball(0, y(1.59), 0.005, 0.092 * hs, 0.112 * hs, 0.102 * hs, skin, 0, 8, 6);
    S.ball(0, y(1.625), -0.022, 0.099 * hs, 0.092 * hs, 0.103 * hs, hair, 0, 8, 5);
  }
  M.figure = figure;
})();

/* ── 2.1: 건물 종류, 앞면 사진, 부스 뒷벽 그림, 트러스 현수막, 담장 종류 ── */
(function () {
  'use strict';
  const App = window.App;
  const { MAT, hex, shade } = App.gl3d;
  const M = App.models3d, E = M.EVENT, col = M.col, face = M.faceCanvas;
  const { WHITE, DARK, STEEL, CHROME, WOOD, WOOD_DARK, WINDOW } = M.COLORS;
  const FRAME = hex('#f3f4f6');

  /** 벽 한 면에 층마다 창을 늘어놓음. P(u, y, e): 그 면의 점 (u: 면을 따라, e: 바깥으로) */
  function grid(S, len, floors, fh, P, o = {}) {
    const n = Math.max(1, Math.floor((len - 1) / (o.pitch || 3.2))), gap = len / n, ww = Math.min(o.ww || 2.0, gap * 0.64);
    for (let f = 0; f < floors; f++) {
      const y0 = f * fh + Math.min(o.sill || 1.0, fh * 0.3), y1 = f * fh + fh - Math.min(0.55, fh * 0.16);
      for (let i = 0; i < n; i++) {
        const u = -len / 2 + gap * (i + 0.5);
        if (o.skip && o.skip(u, f)) continue;
        S.quad(P(u - ww / 2 - 0.06, y0 - 0.06, 0.02), P(u + ww / 2 + 0.06, y0 - 0.06, 0.02), P(u + ww / 2 + 0.06, y1 + 0.06, 0.02), P(u - ww / 2 - 0.06, y1 + 0.06, 0.02), FRAME);
        S.quad(P(u - ww / 2, y0, 0.035), P(u + ww / 2, y0, 0.035), P(u + ww / 2, y1, 0.035), P(u - ww / 2, y1, 0.035), WINDOW, MAT.window);
      }
    }
  }
  const sides = (w, d) => ({
    front: (u, y, e) => [u, y, d / 2 + e], back: (u, y, e) => [-u, y, -d / 2 - e],
    right: (u, y, e) => [w / 2 + e, y, -u], left: (u, y, e) => [-w / 2 - e, y, u],
  });
  function parapet(S, w, d, h, c) {
    const t = 0.25, ph = 0.6;
    S.box(-w / 2 - 0.08, h, d / 2 - t, w / 2 + 0.08, h + ph, d / 2 + 0.08, c);
    S.box(-w / 2 - 0.08, h, -d / 2 - 0.08, w / 2 + 0.08, h + ph, -d / 2 + t, c);
    S.box(-w / 2 - 0.08, h, -d / 2 + t, -w / 2 + t, h + ph, d / 2 - t, c);
    S.box(w / 2 - t, h, -d / 2 + t, w / 2 + 0.08, h + ph, d / 2 - t, c);
  }
  /** 옥상의 설비 (실외기·계단실) */
  function rooftop(S, w, d, h) {
    if (w < 8 || d < 6) return;
    S.cube(-w * 0.28, h, -d * 0.12, Math.min(4, w * 0.16), 2.4, Math.min(3.5, d * 0.4), hex('#d8d4ca'), 0, { top: hex('#8f9296') });
    for (let i = 0; i < 3; i++) S.cube(w * 0.18 + i * 1.5, h, d * 0.1, 1.1, 0.9, 0.9, hex('#c9ced6'), MAT.metal);
  }

  const building0 = E['건물'];
  E['건물'] = (C, it, w, d, h) => {
    const S = C.S, P = sides(w, d), floors = Math.max(1, it.floors || Math.round(h / 3.5)), fh = h / floors;
    const full = it.faceOn === '앞면 전체' && (it.text || it.imageId);
    const st = it.style || '일반 건물';
    if (st === '일반 건물' && !full) { building0(C, it, w, d, h); rooftop(S, w, d, h); return; }
    if (full) {
      // 앞면 가득 사진·글자: 나머지 세 면은 창, 앞면은 넣은 그림
      const c = col(it, '#efe7d6');
      S.box(-w / 2, 0, -d / 2, w / 2, h, d / 2, c, 0, { top: hex('#8f9296'), topMat: MAT.concrete });
      parapet(S, w, d, h, shade(c, 0.93));
      grid(S, w, floors, fh, P.back); grid(S, d, floors, fh, P.right); grid(S, d, floors, fh, P.left);
      C.face([[-w / 2, 0, d / 2 + 0.01], [w / 2, 0, d / 2 + 0.01], [w / 2, h, d / 2 + 0.01], [-w / 2, h, d / 2 + 0.01]], face(it, w / h, { bg: c, plain: true }));
      return;
    }
    const sign = () => {
      if (!it.text && !it.imageId) return;
      const sw = Math.min(w * 0.6, Math.max(5, w * 0.4)), sh = Math.min(1.2, fh * 0.3), sy = Math.min(h - sh - 0.1, Math.min(fh * 0.86, 3.2) + 0.5), z = d / 2;
      S.box(-sw / 2 - 0.06, sy - 0.06, z, sw / 2 + 0.06, sy + sh + 0.06, z + 0.14, hex('#1f2937'));
      C.face([[-sw / 2, sy, z + 0.145], [sw / 2, sy, z + 0.145], [sw / 2, sy + sh, z + 0.145], [-sw / 2, sy + sh, z + 0.145]], face(it, sw / sh, { bg: hex('#1e3a8a'), plain: true }));
    };
    if (st === '유리 건물') {
      const g = it.color ? hex(it.color) : hex('#3f76a8');
      S.box(-w / 2, 0, -d / 2, w / 2, h, d / 2, g, MAT.window, { top: hex('#8f9296'), topMat: MAT.concrete });
      for (let f = 0; f <= floors; f++) S.box(-w / 2 - 0.04, Math.max(0, f * fh - 0.14), -d / 2 - 0.04, w / 2 + 0.04, f * fh + 0.14, d / 2 + 0.04, hex('#dfe4ea'), MAT.metal, { bottom: true });
      const fin = (len, Pf) => { const n = Math.max(2, Math.round(len / 1.6)); for (let i = 0; i <= n; i++) { const u = -len / 2 + (len * i) / n; S.quad(Pf(u - 0.04, 0, 0.05), Pf(u + 0.04, 0, 0.05), Pf(u + 0.04, h, 0.05), Pf(u - 0.04, h, 0.05), hex('#e6eaef'), MAT.metal); } };
      fin(w, P.front); fin(w, P.back); fin(d, P.right); fin(d, P.left);
      parapet(S, w, d, h, hex('#dfe4ea'));
      const ew = Math.min(6, w * 0.3);
      S.box(-ew / 2 - 0.4, 3.0, d / 2, ew / 2 + 0.4, 3.2, d / 2 + 2.0, hex('#e5e7eb'), MAT.metal, { bottom: true });
      S.quad([-ew / 2, 0.02, d / 2 + 0.06], [ew / 2, 0.02, d / 2 + 0.06], [ew / 2, 2.9, d / 2 + 0.06], [-ew / 2, 2.9, d / 2 + 0.06], hex('#1f3f5f'), MAT.window);
      rooftop(S, w, d, h);
      sign();
      return;
    }
    if (st === '주택') {
      const c = col(it, '#f2e9d8'), hw = h * 0.68, roof = hex('#8f4a3a');
      S.box(-w / 2, 0, -d / 2, w / 2, hw, d / 2, c);
      S.box(-w / 2 - 0.03, 0, -d / 2 - 0.03, w / 2 + 0.03, 0.4, d / 2 + 0.03, hex('#a5a29b'), MAT.concrete);
      // 박공 지붕 (용마루가 가로로)
      S.extrude([[-d / 2 - 0.5, hw - 0.12], [d / 2 + 0.5, hw - 0.12], [0, h]], -w / 2 - 0.4, w / 2 + 0.4, roof, MAT.brick, 'x');
      S.cube(w * 0.28, hw, -d * 0.15, 0.7, (h - hw) * 0.95, 0.7, hex('#b9aa98'), MAT.brick);
      const hf = Math.max(1, Math.round(hw / 3)), fhh = hw / hf;
      grid(S, w, hf, fhh, P.front, { pitch: 3.6, ww: 1.5, skip: (u, f) => f === 0 && Math.abs(u) < 1.4 });
      grid(S, w, hf, fhh, P.back, { pitch: 3.6, ww: 1.5 }); grid(S, d, hf, fhh, P.right, { pitch: 4, ww: 1.3 }); grid(S, d, hf, fhh, P.left, { pitch: 4, ww: 1.3 });
      S.box(-0.55, 0, d / 2, 0.55, 2.2, d / 2 + 0.06, WOOD_DARK, MAT.grain);
      S.box(-1.1, 0, d / 2, 1.1, 0.18, d / 2 + 1.0, hex('#b8b5ae'), MAT.concrete);
      S.box(-1.2, 2.4, d / 2, 1.2, 2.5, d / 2 + 1.1, roof, 0, { bottom: true });
      sign();
      return;
    }
    if (st === '창고·체육관') {
      const c = col(it, '#d5dbe2'), hw = h * 0.72, roof = hex('#5f84ad'), n = 12, pr = [];
      S.box(-w / 2, 0, -d / 2, w / 2, hw, d / 2, c, MAT.metal);
      for (let i = 0; i <= n; i++) { const a = Math.PI - (i / n) * Math.PI; pr.push([Math.cos(a) * (d / 2 + 0.3), hw + Math.sin(a) * (h - hw)]); }
      S.extrude(pr, -w / 2 - 0.3, w / 2 + 0.3, roof, MAT.metal, 'x');
      const dn = w > 14 ? 2 : 1, dw = Math.min(5, w * 0.24), dh = Math.min(4.2, hw * 0.75);
      for (let i = 0; i < dn; i++) {
        const x = dn === 1 ? 0 : (i ? 1 : -1) * w * 0.22;
        S.quad([x - dw / 2, 0, d / 2 + 0.03], [x + dw / 2, 0, d / 2 + 0.03], [x + dw / 2, dh, d / 2 + 0.03], [x - dw / 2, dh, d / 2 + 0.03], hex('#8c949e'), MAT.metal);
        for (let k = 1; k < 8; k++) S.quad([x - dw / 2, (dh * k) / 8, d / 2 + 0.035], [x + dw / 2, (dh * k) / 8, d / 2 + 0.035], [x + dw / 2, (dh * k) / 8 + 0.03, d / 2 + 0.035], [x - dw / 2, (dh * k) / 8 + 0.03, d / 2 + 0.035], hex('#6f7780'));
      }
      [P.right, P.left, P.back].forEach((Pf, i) => { const len = i < 2 ? d : w; S.quad(Pf(-len / 2 + 1, hw - 1.4, 0.02), Pf(len / 2 - 1, hw - 1.4, 0.02), Pf(len / 2 - 1, hw - 0.5, 0.02), Pf(-len / 2 + 1, hw - 0.5, 0.02), WINDOW, MAT.window); });
      S.box(-w / 2 - 0.03, 0, -d / 2 - 0.03, w / 2 + 0.03, 0.5, d / 2 + 0.03, shade(roof, 0.9), MAT.metal);
      sign();
      return;
    }
    // 아파트
    const c = col(it, '#ebe6dc'), z = d / 2, units = Math.max(1, Math.round(w / 9));
    S.box(-w / 2, 0, -z, w / 2, h, z, c, 0, { top: hex('#8f9296'), topMat: MAT.concrete });
    for (let f = 0; f < floors; f++) {
      const y = f * fh;
      S.quad([-w / 2 + 0.4, y + 0.25, z + 0.02], [w / 2 - 0.4, y + 0.25, z + 0.02], [w / 2 - 0.4, y + fh - 0.35, z + 0.02], [-w / 2 + 0.4, y + fh - 0.35, z + 0.02], WINDOW, MAT.window);
      if (f) {
        S.box(-w / 2 + 0.3, y - 0.06, z, w / 2 - 0.3, y + 0.08, z + 0.9, WHITE, 0, { bottom: true });
        S.box(-w / 2 + 0.3, y + 0.08, z + 0.84, w / 2 - 0.3, y + 1.0, z + 0.9, hex('#dfe6ec'), MAT.window);
      }
    }
    for (let i = 0; i <= units; i++) { const x = -w / 2 + (w * i) / units; S.box(x - 0.18, 0, z, x + 0.18, h, z + 0.95, c); }
    grid(S, w, floors, fh, P.back, { pitch: 4.5, ww: 1.6 }); grid(S, d, floors, fh, P.right, { pitch: 6, ww: 1.2 }); grid(S, d, floors, fh, P.left, { pitch: 6, ww: 1.2 });
    parapet(S, w, d, h, shade(c, 0.9));
    S.cube(0, h, 0, Math.min(6, w * 0.3), 2.6, Math.min(5, d * 0.6), shade(c, 0.95), 0, { top: hex('#8f9296') });
    S.cyl(w * 0.3, h, 0, 1.0, h + 1.6, 1.0, hex('#c9ced6'), MAT.metal, 14);
    S.box(-2.2, 2.8, z + 0.95, 2.2, 3.0, z + 2.6, hex('#e5e7eb'), MAT.concrete, { bottom: true });
    S.quad([-1.6, 0.02, z + 0.97], [1.6, 0.02, z + 0.97], [1.6, 2.7, z + 0.97], [-1.6, 2.7, z + 0.97], hex('#1f3f5f'), MAT.window);
    sign();
  };

  // 부스: 뒷벽 가득 그림
  const booth0 = E['부스'];
  E['부스'] = (C, it, w, d, h) => {
    if (it.faceOn !== '뒷벽' || !(it.text || it.imageId)) return booth0(C, it, w, d, h);
    booth0(C, { ...it, text: ' ', imageId: null }, w, d, h);
    const z = -d / 2 + 0.05;
    C.face([[-w / 2 + 0.06, 0.1, z], [w / 2 - 0.06, 0.1, z], [w / 2 - 0.06, h - 0.1, z], [-w / 2 + 0.06, h - 0.1, z]], face(it, (w - 0.12) / (h - 0.2), { bg: WHITE, plain: true }));
  };

  // 트러스: 가로대 아래 현수막
  const truss0 = E['트러스'];
  E['트러스'] = (C, it, w, d, h) => {
    truss0(C, it, w, d, h);
    if (!it.text && !it.imageId) return;
    const q = Math.min(0.4, d), bw = w - 2 * q - 0.2, bh = Math.min(1.2, h * 0.28), y1 = h - q - 0.05;
    const c = col(it, WHITE), cv = face(it, bw / bh, { bg: c, plain: !it.color });
    C.S.box(-bw / 2, y1 - bh, -0.008, bw / 2, y1, 0.008, c, 0, { bottom: true });
    C.face([[-bw / 2, y1 - bh, 0.012], [bw / 2, y1 - bh, 0.012], [bw / 2, y1, 0.012], [-bw / 2, y1, 0.012]], cv);
    C.face([[bw / 2, y1 - bh, -0.012], [-bw / 2, y1 - bh, -0.012], [-bw / 2, y1, -0.012], [bw / 2, y1, -0.012]], cv);
  };

  // 담장: 나무 울타리·철제 난간, 색, 벽 그림
  const fence0 = E['담장'];
  E['담장'] = (C, it, w, d, h) => {
    const S = C.S;
    if (it.style === '나무 울타리') {
      const c = col(it, WOOD), n = Math.max(2, Math.round(w / 0.16)), pn = Math.max(1, Math.round(w / 2));
      for (let i = 0; i <= pn; i++) { const x = -w / 2 + (w * i) / pn; S.box(x - 0.05, 0, -0.06, x + 0.05, h, 0.04, shade(c, 0.85), MAT.grain); }
      [h * 0.25, h * 0.75].forEach((y) => S.box(-w / 2, y - 0.04, -0.03, w / 2, y + 0.04, 0.0, shade(c, 0.9), MAT.grain, { bottom: true }));
      if (C.lod) S.box(-w / 2, 0.08, 0, w / 2, h, 0.025, c, MAT.grain);
      else for (let i = 0; i < n; i++) { const x = -w / 2 + ((i + 0.5) * w) / n; S.box(x - 0.055, 0.08, 0, x + 0.055, h - (i % 2) * 0.04, 0.025, c, MAT.grain, { bottom: true }); }
    } else if (it.style === '철제 난간') {
      const c = col(it, '#2f343b'), pn = Math.max(1, Math.round(w / 2)), n = Math.max(2, Math.round(w / (C.lod ? 0.4 : 0.13)));
      for (let i = 0; i <= pn; i++) { const x = -w / 2 + (w * i) / pn; S.box(x - 0.03, 0, -0.03, x + 0.03, h + 0.06, 0.03, c, MAT.metal); }
      [0.12, h].forEach((y) => S.box(-w / 2, y - 0.02, -0.02, w / 2, y + 0.02, 0.02, c, MAT.metal, { bottom: true }));
      for (let i = 0; i < n; i++) { const x = -w / 2 + ((i + 0.5) * w) / n; S.box(x - 0.008, 0.12, -0.008, x + 0.008, h, 0.008, c, MAT.metal, { bottom: true }); }
    } else if (it.color && it.style !== '판넬') {
      const c = hex(it.color);
      S.box(-w / 2, 0, -d / 2, w / 2, h - 0.08, d / 2, c, MAT.concrete);
      S.box(-w / 2 - 0.03, h - 0.08, -d / 2 - 0.04, w / 2 + 0.03, h, d / 2 + 0.04, shade(c, 0.75), MAT.concrete);
    } else fence0(C, it, w, d, h);
    if (it.text || it.imageId) {
      const z = (it.style === '판넬' || it.style === '나무 울타리' ? 0.03 : it.style === '철제 난간' ? 0.035 : d / 2) + 0.008;
      if (it.style === '철제 난간') S.box(-w / 2 + 0.1, 0.2, 0.025, w / 2 - 0.1, h - 0.08, 0.035, WHITE, 0, { bottom: true });
      C.face([[-w / 2 + 0.1, 0.2, z], [w / 2 - 0.1, 0.2, z], [w / 2 - 0.1, h - 0.1, z], [-w / 2 + 0.1, h - 0.1, z]], face(it, (w - 0.2) / (h - 0.3), { bg: col(it, '#f4f1ea'), plain: true }));
    }
  };
})();

/* ── 2.2: 더 많은 가구 — 거실·침실·주방·사무·상가·장식 (등 −z가 벽 쪽, 앞 +z) ── */
(function () {
  'use strict';
  const App = window.App;
  const { MAT, hex, shade } = App.gl3d;
  const M = App.models3d, F = M.FURN, tint = M.tint;
  const { WHITE, BLACK, DARK, STEEL, CHROME, WOOD, WOOD_DARK, WOOD_LIGHT } = M.COLORS;
  const WARM = hex('#fff1cf'), STONE = hex('#f1efea'), GREEN = hex('#3f7f45');

  /** 바 의자(스툴): 가운데 (0, 0) 바닥, 앉는 높이 sh */
  function barStool(S, sh, c = DARK) {
    S.disc(0, 0.005, 0, 0.19, STEEL, MAT.metal, 14);
    S.cyl(0, 0, 0, 0.17, 0.02, 0.17, STEEL, MAT.metal, 14);
    S.cyl(0, 0.02, 0, 0.022, sh - 0.04, 0.022, CHROME, MAT.metal, 8);
    S.tube([0, sh * 0.35, 0], [0, sh * 0.35 + 0.012, 0], 0.15, 0.15, CHROME, MAT.metal, 14);
    S.cyl(0, sh - 0.05, 0, 0.18, sh, 0.17, c, MAT.fabric, 16);
  }
  /** 사무용 의자: 앞이 +z */
  function officeChair(C, c = hex('#2f3540')) {
    const S = C.S;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3, x = Math.cos(a) * 0.28, z = Math.sin(a) * 0.28;
      S.beam([0, 0.07, 0], [x, 0.05, z], 0.035, DARK);
      if (!C.lod) S.ball(x, 0.03, z, 0.028, 0.028, 0.028, BLACK, 0, 6, 4);
    }
    S.cyl(0, 0.07, 0, 0.03, 0.42, 0.025, CHROME, MAT.metal, 8);
    S.box(-0.25, 0.42, -0.22, 0.25, 0.5, 0.26, c, MAT.fabric, { bottom: true });
    S.box(-0.23, 0.55, -0.29, 0.23, 1.02, -0.23, c, MAT.fabric, { bottom: true });
    S.box(-0.05, 0.46, -0.27, 0.05, 0.56, -0.2, DARK);
    if (!C.lod) [-1, 1].forEach((s) => {
      S.box(s * 0.25 - 0.02, 0.5, -0.05, s * 0.25 + 0.02, 0.64, 0.0, DARK);
      S.box(s * 0.25 - 0.035, 0.64, -0.14, s * 0.25 + 0.035, 0.67, 0.12, DARK);
    });
  }

  F['L자 소파'] = (C, it, w, d, h) => {
    const S = C.S, c = tint(it, hex('#8d929b')), light = shade(c, 1.1);
    const sd = Math.min(0.95, d * 0.62), back = 0.22, arm = 0.18, seat = 0.42, cw = Math.min(0.95, w * 0.38);
    [[-w / 2 + 0.05, -d / 2 + 0.05], [w / 2 - 0.05, -d / 2 + 0.05], [-w / 2 + 0.05, -d / 2 + sd - 0.05], [w / 2 - 0.05, d / 2 - 0.05], [w / 2 - cw + 0.05, d / 2 - 0.05]]
      .forEach(([x, z]) => S.box(x - 0.025, 0, z - 0.025, x + 0.025, 0.07, z + 0.025, WOOD_DARK, MAT.grain));
    S.box(-w / 2, 0.07, -d / 2, w / 2, seat - 0.12, -d / 2 + sd, c, MAT.fabric, { bottom: true });
    S.box(w / 2 - cw, 0.07, -d / 2 + sd, w / 2, seat - 0.12, d / 2, c, MAT.fabric, { bottom: true });
    S.box(-w / 2, seat - 0.12, -d / 2, w / 2, h, -d / 2 + back, c, MAT.fabric);
    S.box(-w / 2, seat - 0.12, -d / 2 + back, -w / 2 + arm, seat + 0.2, -d / 2 + sd, c, MAT.fabric);
    const span = w - arm - cw, n = Math.max(1, Math.round(span / 0.7)), sw = span / n;
    for (let i = 0; i < n; i++) {
      const x0 = -w / 2 + arm + i * sw + 0.012, x1 = x0 + sw - 0.024;
      S.box(x0, seat - 0.12, -d / 2 + back + 0.01, x1, seat, -d / 2 + sd - 0.01, light, MAT.fabric);
      S.box(x0, seat, -d / 2 + back - 0.02, x1, h - 0.03, -d / 2 + back + 0.13, light, MAT.fabric);
    }
    S.box(w / 2 - cw + 0.012, seat - 0.12, -d / 2 + back + 0.01, w / 2 - 0.012, seat, d / 2 - 0.012, light, MAT.fabric);
    S.box(w / 2 - cw + 0.012, seat, -d / 2 + back - 0.02, w / 2 - 0.012, h - 0.03, -d / 2 + back + 0.13, light, MAT.fabric);
    S.ball(-w / 2 + arm + 0.25, seat + 0.16, -d / 2 + back + 0.14, 0.2, 0.17, 0.07, shade(c, 0.8), MAT.fabric, 8, 5);
  };
  F['안락의자'] = (C, it, w, d, h) => F['소파'](C, it, w, d, h);
  F['거실 테이블'] = (C, it, w, d, h) => {
    const S = C.S, c = tint(it, WOOD_LIGHT);
    S.box(-w / 2, h - 0.035, -d / 2, w / 2, h, d / 2, c, MAT.grain, { bottom: true });
    S.box(-w / 2 + 0.05, 0.1, -d / 2 + 0.05, w / 2 - 0.05, 0.125, d / 2 - 0.05, shade(c, 0.9), MAT.grain);
    M.legs(S, w, d, h - 0.035, 0.04, shade(c, 0.85), MAT.grain, 0.03);
    S.box(-w * 0.3, h, -d * 0.2, -w * 0.3 + 0.24, h + 0.05, -d * 0.2 + 0.17, hex('#3b5b7a'));
    S.box(-w * 0.3 + 0.01, h + 0.05, -d * 0.2 + 0.01, -w * 0.3 + 0.22, h + 0.08, -d * 0.2 + 0.16, hex('#c0563a'));
    S.cyl(w * 0.25, h, d * 0.05, 0.05, h + 0.16, 0.035, WHITE, MAT.gloss, 10);
  };
  F['책장'] = (C, it, w, d, h) => {
    const S = C.S, c = tint(it, WOOD_LIGHT), t = 0.022;
    S.box(-w / 2, 0, -d / 2, -w / 2 + t, h, d / 2, c, MAT.grain);
    S.box(w / 2 - t, 0, -d / 2, w / 2, h, d / 2, c, MAT.grain);
    S.box(-w / 2 + t, 0, -d / 2, w / 2 - t, h, -d / 2 + 0.012, shade(c, 0.92), MAT.grain);
    S.box(-w / 2 + t, h - t, -d / 2, w / 2 - t, h, d / 2, c, MAT.grain);
    S.box(-w / 2 + t, 0, -d / 2, w / 2 - t, 0.07, d / 2, c, MAT.grain);
    const n = Math.max(2, Math.round((h - 0.07) / 0.36)), gap = (h - 0.07 - t) / n;
    const BOOKS = ['#7c2d12', '#1e3a8a', '#166534', '#a16207', '#6b21a8', '#9f1239', '#334155', '#e5e7eb', '#0f766e'];
    for (let i = 0; i < n; i++) {
      const y = 0.07 + i * gap;
      if (i) S.box(-w / 2 + t, y - t / 2, -d / 2 + 0.012, w / 2 - t, y + t / 2, d / 2, c, MAT.grain);
      const room = gap - t - 0.03;
      if (C.lod) { S.box(-w / 2 + t + 0.02, y + t / 2, -d / 2 + 0.03, w / 2 - t - 0.1, y + t / 2 + room * 0.75, d / 2 - 0.04, hex('#6b5a4a')); continue; }
      let x = -w / 2 + t + 0.01;
      while (x < w / 2 - t - 0.05) {
        if (C.rnd() < 0.12) { x += 0.06 + C.rnd() * 0.08; continue; }
        const bw = 0.022 + C.rnd() * 0.03, bh = room * (0.62 + C.rnd() * 0.36);
        S.box(x, y + t / 2, -d / 2 + 0.03, Math.min(x + bw, w / 2 - t - 0.005), y + t / 2 + bh, d / 2 - 0.035 - C.rnd() * 0.03, hex(BOOKS[Math.floor(C.rnd() * BOOKS.length)]));
        x += bw + 0.002;
      }
    }
  };
  F['피아노'] = (C, it, w, d, h) => {
    const S = C.S, body = Math.min(0.62, d * 0.62), z0 = -d / 2;
    S.box(-w / 2, 0.06, z0, w / 2, 0.66, z0 + 0.34, BLACK, MAT.gloss, { bottom: true });
    S.box(-w / 2, 0.66, z0, w / 2, h, z0 + 0.3, BLACK, MAT.gloss);
    [-1, 1].forEach((s) => S.box(s > 0 ? w / 2 - 0.06 : -w / 2, 0, z0, s > 0 ? w / 2 : -w / 2 + 0.06, 0.82, z0 + body, BLACK, MAT.gloss));
    S.box(-w / 2 + 0.06, 0.66, z0 + 0.3, w / 2 - 0.06, 0.72, z0 + body, BLACK, MAT.gloss);
    S.quad([-w / 2 + 0.07, 0.722, z0 + body - 0.005], [w / 2 - 0.07, 0.722, z0 + body - 0.005], [w / 2 - 0.07, 0.722, z0 + 0.36], [-w / 2 + 0.07, 0.722, z0 + 0.36], WHITE, MAT.gloss);
    if (!C.lod) {
      const kw = (w - 0.14) / 52;
      for (let i = 0; i < 52; i++) if ([1, 2, 4, 5, 6].includes(i % 7)) S.box(-w / 2 + 0.07 + i * kw - kw * 0.3, 0.722, z0 + 0.36, -w / 2 + 0.07 + i * kw + kw * 0.3, 0.74, z0 + 0.46, BLACK, MAT.gloss);
    }
    S.box(-w / 2 + 0.06, 0.95, z0 + 0.3, w / 2 - 0.06, 1.0, z0 + 0.34, BLACK, MAT.gloss);
    const bz = z0 + body + (d - body) * 0.5;
    S.box(-0.36, 0.44, bz - 0.17, 0.36, 0.5, bz + 0.17, BLACK, MAT.gloss, { bottom: true });
    M.legs(S, 0.7, 0.32, 0.44, 0.04, BLACK, MAT.gloss);
  };
  F['협탁'] = (C, it, w, d, h) => {
    const S = C.S, c = tint(it, WOOD_LIGHT);
    S.box(-w / 2, 0.06, -d / 2, w / 2, h, d / 2 - 0.012, c, MAT.grain, { bottom: true });
    M.legs(S, w, d - 0.012, 0.06, 0.03, shade(c, 0.8), MAT.grain, 0.02);
    S.box(-w / 2 + 0.02, h * 0.55, d / 2 - 0.012, w / 2 - 0.02, h - 0.03, d / 2 + 0.002, shade(c, 1.05), MAT.grain);
    S.box(-0.03, h * 0.75 - 0.008, d / 2, 0.03, h * 0.75 + 0.008, d / 2 + 0.018, CHROME, MAT.metal);
    S.cyl(0, h, -0.04, 0.06, h + 0.03, 0.06, DARK, MAT.metal, 12);
    S.cyl(0, h + 0.03, -0.04, 0.01, h + 0.22, 0.01, DARK, MAT.metal, 6);
    S.tube([0, h + 0.2, -0.04], [0, h + 0.36, -0.04], 0.11, 0.08, WARM, MAT.emissive, 14, false, false);
  };
  F['화장대'] = (C, it, w, d, h) => {
    const S = C.S, c = tint(it, WHITE), td = Math.min(0.45, d * 0.56), z0 = -d / 2, top = 0.75;
    S.box(-w / 2, top - 0.03, z0, w / 2, top, z0 + td, c, MAT.gloss, { bottom: true });
    S.box(-w / 2, 0, z0, -w / 2 + 0.35, top - 0.03, z0 + td, c);
    C.at(-w / 2 + 0.175, 0); M.doors(C.S, 0.35, 0.02, top - 0.03, z0 + td, 1, shade(c, 1.03)); C.at(0, 0);
    S.box(w / 2 - 0.04, 0, z0, w / 2, top - 0.03, z0 + td, c);
    S.box(-0.32, top, z0, 0.32, h, z0 + 0.03, c, MAT.gloss);
    S.quad([-0.29, top + 0.06, z0 + 0.032], [0.29, top + 0.06, z0 + 0.032], [0.29, h - 0.04, z0 + 0.032], [-0.29, h - 0.04, z0 + 0.032], hex('#c8d4de'), MAT.window);
    S.cyl(w * 0.3, top, z0 + 0.15, 0.03, top + 0.12, 0.022, hex('#e9a8b8'), MAT.gloss, 8);
    S.box(w * 0.18, top, z0 + 0.1, w * 0.18 + 0.12, top + 0.05, z0 + 0.2, hex('#d9c7a7'));
    const sz = z0 + td + (d - td) * 0.5;
    S.cyl(0, 0, sz, 0.15, 0.4, 0.15, shade(c, 0.9), 0, 14);
    S.cyl(0, 0.4, sz, 0.17, 0.46, 0.17, hex('#d8b4c0'), MAT.fabric, 16);
  };
  F['아일랜드 식탁'] = (C, it, w, d, h) => {
    const S = C.S, c = tint(it, hex('#dfe3e8')), z0 = -d / 2, top = Math.min(0.9, d * 0.7);
    S.box(-w / 2 + 0.02, 0, z0 + 0.02, w / 2 - 0.02, 0.1, z0 + top - 0.3, DARK);
    S.box(-w / 2 + 0.02, 0.1, z0, w / 2 - 0.02, h - 0.04, z0 + top - 0.28, c, 0, { bottom: true });
    const n = Math.max(2, Math.round(w / 0.6));
    for (let i = 1; i < n; i++) { const x = -w / 2 + (w * i) / n; S.box(x - 0.003, 0.12, z0 - 0.003, x + 0.003, h - 0.06, z0 + 0.002, shade(c, 0.7)); }
    S.box(-w / 2, h - 0.04, z0, w / 2, h, z0 + top, STONE, MAT.gloss, { bottom: true });
    const k = Math.max(2, Math.round(w / 0.55)), sz = z0 + top + Math.min(0.2, (d - top) * 0.5);
    for (let i = 0; i < k; i++) { C.at(-w / 2 + ((i + 0.5) * w) / k, sz, 0); barStool(C.S, 0.66); }
    C.at(0, 0);
  };
  F['바 테이블'] = (C, it, w, d, h) => {
    const S = C.S, c = tint(it, WOOD_DARK), r = Math.min(0.32, d / 2);
    S.disc(0, 0.005, 0, 0.24, DARK, MAT.metal, 16);
    S.cyl(0, 0, 0, 0.22, 0.03, 0.22, DARK, MAT.metal, 16);
    S.cyl(0, 0.03, 0, 0.035, h - 0.04, 0.035, DARK, MAT.metal, 10);
    S.cyl(0, h - 0.04, 0, r, h, r, c, MAT.grain, 22);
    [-1, 1].forEach((s) => { C.at(s * (w / 2 - 0.2), 0, 0); barStool(C.S, 0.76); });
    C.at(0, 0);
  };
  F['사무용 의자'] = (C, it) => officeChair(C, tint(it, hex('#2f3540')));
  F['회의 테이블'] = (C, it, w, d, h) => {
    const S = C.S, c = tint(it, WOOD_LIGHT);
    S.box(-w / 2, h - 0.03, -d / 2, w / 2, h, d / 2, c, MAT.grain, { bottom: true });
    [-1, 1].forEach((s) => {
      const x = s * (w / 2 - Math.min(0.4, w * 0.15));
      S.box(x - 0.03, 0.02, -d / 2 + 0.22, x + 0.03, h - 0.03, d / 2 - 0.22, STEEL, MAT.metal);
      S.box(x - 0.05, 0, -d / 2 + 0.15, x + 0.05, 0.03, d / 2 - 0.15, STEEL, MAT.metal);
    });
    S.box(-w * 0.12, h, -0.06, w * 0.12, h + 0.008, 0.06, DARK);
    const n = Math.max(2, Math.round(w / 0.75));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / n;
      C.at(x, -d / 2 - 0.22, 0); officeChair(C);
      C.at(x, d / 2 + 0.22, 180); officeChair(C);
    }
    if (w >= 2.3) [-1, 1].forEach((s) => { C.at(s * (w / 2 + 0.24), 0, s > 0 ? -90 : 90); officeChair(C); });
    C.at(0, 0);
  };
  F['파티션'] = (C, it, w, d, h) => {
    const S = C.S, c = tint(it, hex('#7d8b99'));
    S.box(-w / 2 + 0.02, 0.04, -0.022, w / 2 - 0.02, h - 0.02, 0.022, c, MAT.fabric, { bottom: true });
    S.box(-w / 2, h - 0.03, -0.028, w / 2, h, 0.028, STEEL, MAT.metal);
    [-1, 1].forEach((s) => {
      S.box(s * w / 2 - (s > 0 ? 0.025 : 0), 0, -0.028, s * w / 2 + (s > 0 ? 0 : 0.025), h, 0.028, STEEL, MAT.metal);
      S.box(s * (w / 2 - 0.0125) - 0.02, 0, -0.18, s * (w / 2 - 0.0125) + 0.02, 0.03, 0.18, STEEL, MAT.metal);
    });
  };
  F['서류 캐비닛'] = (C, it, w, d, h) => {
    const S = C.S, c = hex('#d5d9de'), n = Math.max(2, Math.round(h / 0.33));
    S.box(-w / 2, 0, -d / 2, w / 2, h, d / 2 - 0.01, c, MAT.metal);
    for (let i = 0; i < n; i++) {
      const y0 = 0.04 + (i * (h - 0.06)) / n, y1 = 0.04 + ((i + 1) * (h - 0.06)) / n - 0.012;
      S.box(-w / 2 + 0.015, y0, d / 2 - 0.01, w / 2 - 0.015, y1, d / 2 + 0.004, shade(c, 1.04), MAT.metal);
      S.box(-0.12, y1 - 0.07, d / 2 + 0.004, 0.12, y1 - 0.05, d / 2 + 0.024, CHROME, MAT.metal);
      S.box(-0.05, y1 - 0.13, d / 2 + 0.004, 0.05, y1 - 0.095, d / 2 + 0.008, WHITE);
    }
  };
  F['카운터'] = (C, it, w, d, h) => {
    const S = C.S, c = tint(it, WOOD), z1 = d / 2;
    S.box(-w / 2, 0, z1 - 0.05, w / 2, h - 0.04, z1, c, MAT.grain, { bottom: true });
    S.box(-w / 2, 0, -d / 2 + 0.02, -w / 2 + 0.04, h - 0.04, z1 - 0.05, c, MAT.grain);
    S.box(w / 2 - 0.04, 0, -d / 2 + 0.02, w / 2, h - 0.04, z1 - 0.05, c, MAT.grain);
    S.box(-w / 2 - 0.02, h - 0.04, -0.05, w / 2 + 0.02, h, z1 + 0.04, STONE, MAT.gloss, { bottom: true });
    S.box(-w / 2 + 0.04, 0.76, -d / 2, w / 2 - 0.04, 0.8, z1 - 0.05, WHITE);
    S.box(-w / 2 + 0.04, 0, -d / 2, w / 2 - 0.04, 0.05, z1 - 0.05, DARK);
    const px = -w / 2 + 0.35;
    S.box(px - 0.04, 0.8, -0.1, px + 0.04, 0.95, -0.06, DARK);
    S.box(px - 0.2, 0.92, -0.08, px + 0.2, 1.2, -0.05, BLACK);
    S.quad([px - 0.185, 0.935, -0.0495], [px + 0.185, 0.935, -0.0495], [px + 0.185, 1.185, -0.0495], [px - 0.185, 1.185, -0.0495], hex('#3b6fb6'), MAT.emissive);
    S.box(px + 0.3, h, 0.05, px + 0.38, h + 0.04, 0.17, DARK);
  };
  F['진열장'] = (C, it, w, d, h) => {
    const S = C.S, G = C.G, frame = hex('#2b2f36'), t = 0.03;
    S.box(-w / 2, 0, -d / 2, w / 2, 0.1, d / 2, frame);
    S.box(-w / 2, h - 0.05, -d / 2, w / 2, h, d / 2, frame);
    S.box(-w / 2, 0, -d / 2, w / 2, h, -d / 2 + 0.012, hex('#f3f1ec'));
    [-1, 1].forEach((s) => S.box(s > 0 ? w / 2 - t : -w / 2, 0, -d / 2, s > 0 ? w / 2 : -w / 2 + t, h, d / 2, frame));
    S.box(-w / 2 + t, h - 0.07, -d / 2 + 0.03, w / 2 - t, h - 0.05, d / 2 - 0.03, WARM, MAT.emissive);
    const n = 4, gap = (h - 0.15) / n, ITEMS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#f9fafb', '#111827'];
    for (let i = 1; i <= n; i++) {
      const y = 0.1 + i * gap - (i === n ? 0.07 : 0);
      if (i < n) G.quad([-w / 2 + t, y, d / 2 - 0.02], [w / 2 - t, y, d / 2 - 0.02], [w / 2 - t, y, -d / 2 + 0.012], [-w / 2 + t, y, -d / 2 + 0.012], hex('#dbe7ee'), MAT.glass);
      if (C.lod) continue;
      const base = 0.1 + (i - 1) * gap;
      for (let x = -w / 2 + 0.12; x < w / 2 - 0.1; x += 0.16 + C.rnd() * 0.1) {
        const col = hex(ITEMS[Math.floor(C.rnd() * ITEMS.length)]), ih = Math.min(gap * 0.6, 0.12 + C.rnd() * 0.16);
        if (C.rnd() < 0.5) S.box(x - 0.04, base + 0.005, -0.07, x + 0.04, base + ih, 0.03, col, MAT.gloss);
        else S.cyl(x, base + 0.005, -0.02, 0.04, base + ih, 0.035, col, MAT.gloss, 10);
      }
    }
    G.quad([-w / 2 + t, 0.1, d / 2 - 0.005], [w / 2 - t, 0.1, d / 2 - 0.005], [w / 2 - t, h - 0.05, d / 2 - 0.005], [-w / 2 + t, h - 0.05, d / 2 - 0.005], hex('#cfe3ec'), MAT.glass);
    S.box(-0.004, 0.1, d / 2 - 0.01, 0.004, h - 0.05, d / 2, frame);
  };
  F['러그'] = (C, it, w, d) => {
    const S = C.S, c = tint(it, hex('#b9a58a')), e = Math.min(0.14, Math.min(w, d) * 0.08);
    S.box(-w / 2, 0, -d / 2, w / 2, 0.012, d / 2, c, MAT.fabric, { bottom: true });
    // 윗면은 바닥 무늬 위에 그리는 층(레드카펫과 같은 층)에: 방 바닥이 덮지 않게
    const ring = (k, y, col) => C.D.quad([-w / 2 + k, y, d / 2 - k], [w / 2 - k, y, d / 2 - k], [w / 2 - k, y, -d / 2 + k], [-w / 2 + k, y, -d / 2 + k], col, MAT.fabric);
    ring(0, 0.014, c);
    ring(e, 0.0145, shade(c, 0.78));
    ring(e * 1.6, 0.015, c);
    if (!C.lod) for (let x = -w / 2; x <= w / 2 + 1e-6; x += 0.04) { S.box(x - 0.004, 0, d / 2, x + 0.004, 0.006, d / 2 + 0.05, shade(c, 1.1)); S.box(x - 0.004, 0, -d / 2 - 0.05, x + 0.004, 0.006, -d / 2, shade(c, 1.1)); }
  };
  F['실내 화분'] = (C, it, w, d, h) => {
    const S = C.S, r = Math.min(w, d) * 0.36;
    S.cyl(0, 0, 0, r * 0.82, h * 0.3, r, hex('#efece6'), MAT.gloss, 16);
    S.disc(0, h * 0.295, 0, r * 0.95, hex('#4a3a2c'), MAT.soil, 14);
    S.cyl(0, h * 0.3, 0, 0.018, h * 0.62, 0.014, WOOD_DARK, 0, 6);
    const leaves = C.lod ? 3 : 8;
    for (let i = 0; i < leaves; i++) {
      const a = i * 2.4 + C.rnd(), rr = (0.1 + C.rnd() * 0.16) * (w / 0.5), y = h * (0.5 + C.rnd() * 0.42);
      S.ball(Math.cos(a) * rr, y, Math.sin(a) * rr, 0.13 + C.rnd() * 0.06, 0.07, 0.11, shade(GREEN, 0.8 + C.rnd() * 0.4), MAT.foliage, 8, 5);
    }
  };
  F['스탠드 조명'] = (C, it, w, d, h) => {
    const S = C.S;
    S.cyl(0, 0, 0, 0.16, 0.03, 0.15, DARK, MAT.metal, 16);
    S.cyl(0, 0.03, 0, 0.012, h - 0.28, 0.012, STEEL, MAT.metal, 6);
    S.tube([0, h - 0.32, 0], [0, h, 0], 0.2, 0.14, hex('#f3ead8'), MAT.fabric, 18, false, false);
    S.ball(0, h - 0.2, 0, 0.06, 0.07, 0.06, WARM, MAT.emissive, 8, 5);
  };
})();
