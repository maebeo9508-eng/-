'use strict';
// ─────────────────────────────────────────────────────────────
// 몽글 아트 엔진
// 모든 생물은 "몽글몽글" 공통 규칙으로 그려집니다.
//  - 둥근 몸통 + 두꺼운 자두색 외곽선(#3b2a4d)
//  - 파스텔 채색, 왼쪽 위 하이라이트, 아래쪽 은은한 그림자
//  - 큰 눈 + 반짝임, 볼터치, 통통 튀는 이동 애니메이션
// look 객체 하나로 몬스터/펫/동료/보스를 조립합니다.
// ─────────────────────────────────────────────────────────────
G.Art = (function () {
  const U = G.U, TAU = U.TAU;
  const OL = '#3b2a4d';
  let FLASH = false;
  const C = (c) => (FLASH ? '#ffffff' : c);
  const LW = (r) => Math.max(1.5, r * 0.12);

  function strokeOL(ctx, r, mul) {
    ctx.lineWidth = LW(r) * (mul || 1);
    ctx.strokeStyle = OL;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  function fillOL(ctx, fill, r, mul) {
    ctx.fillStyle = C(fill);
    ctx.fill();
    strokeOL(ctx, r, mul);
  }
  function ell(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU);
  }
  function circ(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
  }

  // ── 몸통 모양 ─────────────────────────────────────────────
  const BODY = {
    round(ctx, r) { ell(ctx, 0, 0, r * 1.04, r * 0.96); },
    slime(ctx, r) {
      const w = r * 1.15;
      ctx.beginPath();
      ctx.moveTo(-w, r * 0.5);
      ctx.bezierCurveTo(-w, -r * 0.45, -r * 0.55, -r * 1.05, 0, -r * 1.05);
      ctx.bezierCurveTo(r * 0.55, -r * 1.05, w, -r * 0.45, w, r * 0.5);
      ctx.quadraticCurveTo(w, r * 0.86, w * 0.7, r * 0.86);
      ctx.lineTo(-w * 0.7, r * 0.86);
      ctx.quadraticCurveTo(-w, r * 0.86, -w, r * 0.5);
      ctx.closePath();
    },
    square(ctx, r) { U.roundRect(ctx, -r * 0.98, -r * 0.95, r * 1.96, r * 1.9, r * 0.5); },
    tall(ctx, r) { ell(ctx, 0, -r * 0.05, r * 0.8, r * 1.08); },
    wide(ctx, r) { ell(ctx, 0, r * 0.12, r * 1.25, r * 0.8); },
    egg(ctx, r) {
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.1);
      ctx.bezierCurveTo(r * 0.75, -r * 1.1, r * 0.95, r * 0.1, r * 0.9, r * 0.4);
      ctx.bezierCurveTo(r * 0.85, r * 0.95, -r * 0.85, r * 0.95, -r * 0.9, r * 0.4);
      ctx.bezierCurveTo(-r * 0.95, r * 0.1, -r * 0.75, -r * 1.1, 0, -r * 1.1);
      ctx.closePath();
    },
    ghost(ctx, r, t) {
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r * 0.95, Math.PI, 0);
      ctx.lineTo(r * 0.95, r * 0.7);
      const n = 4, w = (r * 1.9) / n;
      for (let i = 0; i < n; i++) {
        const x0 = r * 0.95 - w * i;
        const wob = Math.sin(t * 6 + i * 1.7) * r * 0.08;
        ctx.quadraticCurveTo(x0 - w * 0.5, r * 1.05 + wob, x0 - w, r * 0.7);
      }
      ctx.closePath();
    },
    star(ctx, r, t) {
      const R = r * 1.18, ri = r * 0.62, rot = -Math.PI / 2 + Math.sin(t * 2) * 0.08;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? ri : R;
        const a = rot + (i * Math.PI) / 5;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr + r * 0.08;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
    },
    book(ctx, r) { U.roundRect(ctx, -r * 0.95, -r * 0.8, r * 1.9, r * 1.55, r * 0.22); },
    box(ctx, r) { U.roundRect(ctx, -r * 0.92, -r * 0.88, r * 1.84, r * 1.76, r * 0.18); },
    fish(ctx, r) { ell(ctx, 0, 0, r * 1.12, r * 0.82); },
  };

  // ── 몸통 뒤쪽 부품 (귀, 날개, 꼬리 ...) ──────────────────
  const BACK = {
    cat(ctx, r, L) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * r * 0.82, -r * 0.35);
        ctx.lineTo(s * r * 0.72, -r * 1.18);
        ctx.lineTo(s * r * 0.15, -r * 0.82);
        ctx.closePath();
        fillOL(ctx, L.earColor || L.color, r);
        ctx.beginPath();
        ctx.moveTo(s * r * 0.68, -r * 0.55);
        ctx.lineTo(s * r * 0.66, -r * 0.98);
        ctx.lineTo(s * r * 0.36, -r * 0.78);
        ctx.closePath();
        ctx.fillStyle = C(L.innerEar || '#ffb3c6');
        ctx.fill();
      }
    },
    fox(ctx, r, L) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * r * 0.9, -r * 0.3);
        ctx.lineTo(s * r * 0.8, -r * 1.35);
        ctx.lineTo(s * r * 0.12, -r * 0.82);
        ctx.closePath();
        fillOL(ctx, L.color, r);
        ctx.beginPath();
        ctx.moveTo(s * r * 0.8, -r * 1.35);
        ctx.lineTo(s * r * 0.84, -r * 1.05);
        ctx.lineTo(s * r * 0.6, -r * 1.12);
        ctx.closePath();
        ctx.fillStyle = C('#4a3a5c');
        ctx.fill();
      }
    },
    bunny(ctx, r, L) {
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(s * r * 0.38, -r * 1.1);
        ctx.rotate(s * 0.18);
        ell(ctx, 0, 0, r * 0.25, r * 0.62);
        fillOL(ctx, L.earColor || L.color, r);
        ell(ctx, 0, r * 0.05, r * 0.12, r * 0.42);
        ctx.fillStyle = C(L.innerEar || '#ffb3c6');
        ctx.fill();
        ctx.restore();
      }
    },
    bear(ctx, r, L) {
      for (const s of [-1, 1]) {
        circ(ctx, s * r * 0.64, -r * 0.7, r * 0.3);
        fillOL(ctx, L.earColor || L.color, r);
        circ(ctx, s * r * 0.64, -r * 0.7, r * 0.15);
        ctx.fillStyle = C(L.innerEar || U.shade(L.color, -0.18));
        ctx.fill();
      }
    },
    mouse(ctx, r, L) {
      for (const s of [-1, 1]) {
        circ(ctx, s * r * 0.78, -r * 0.62, r * 0.42);
        fillOL(ctx, L.color, r);
        circ(ctx, s * r * 0.78, -r * 0.62, r * 0.24);
        ctx.fillStyle = C('#ffb3c6');
        ctx.fill();
      }
    },
    pig(ctx, r, L) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * r * 0.75, -r * 0.45);
        ctx.lineTo(s * r * 0.85, -r * 1.0);
        ctx.lineTo(s * r * 0.3, -r * 0.8);
        ctx.closePath();
        fillOL(ctx, U.shade(L.color, -0.08), r);
      }
    },
    owl(ctx, r, L) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * r * 0.85, -r * 0.4);
        ctx.lineTo(s * r * 1.05, -r * 1.12);
        ctx.lineTo(s * r * 0.35, -r * 0.82);
        ctx.closePath();
        fillOL(ctx, U.shade(L.color, -0.15), r);
      }
    },
    horns(ctx, r, L) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * r * 0.3, -r * 0.78);
        ctx.quadraticCurveTo(s * r * 0.55, -r * 1.45, s * r * 0.95, -r * 1.25);
        ctx.quadraticCurveTo(s * r * 0.7, -r * 1.05, s * r * 0.68, -r * 0.62);
        ctx.closePath();
        fillOL(ctx, L.hornColor || '#fff1d0', r, 0.8);
      }
    },
    antenna(ctx, r, L) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * r * 0.22, -r * 0.85);
        ctx.quadraticCurveTo(s * r * 0.3, -r * 1.35, s * r * 0.55, -r * 1.42);
        strokeOL(ctx, r, 0.8);
        circ(ctx, s * r * 0.55, -r * 1.42, r * 0.14);
        fillOL(ctx, L.tipColor || L.color, r, 0.7);
      }
    },
    wings(ctx, r, L, o) {
      const flap = Math.sin(o.t * 30) * 0.35;
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(s * r * 0.7, -r * 0.45);
        ctx.rotate(s * (-0.5 + flap));
        ell(ctx, s * r * 0.35, 0, r * 0.5, r * 0.3);
        ctx.fillStyle = FLASH ? '#fff' : 'rgba(255,255,255,0.85)';
        ctx.fill();
        strokeOL(ctx, r, 0.7);
        ctx.restore();
      }
    },
    batwings(ctx, r, L, o) {
      const flap = Math.sin(o.t * 16) * 0.4;
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(s * r * 0.75, -r * 0.2);
        ctx.rotate(s * flap);
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.2);
        ctx.quadraticCurveTo(s * r * 0.7, -r * 0.9, s * r * 1.15, -r * 0.35);
        ctx.quadraticCurveTo(s * r * 0.95, -r * 0.05, s * r * 0.85, r * 0.15);
        ctx.quadraticCurveTo(s * r * 0.6, -r * 0.05, s * r * 0.45, r * 0.25);
        ctx.quadraticCurveTo(s * r * 0.25, 0, 0, r * 0.2);
        ctx.closePath();
        fillOL(ctx, L.wingColor || U.shade(L.color, -0.2), r, 0.8);
        ctx.restore();
      }
    },
    dragonwings(ctx, r, L, o) {
      const flap = Math.sin(o.t * 8) * 0.25;
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(s * r * 0.6, -r * 0.4);
        ctx.rotate(s * (flap - 0.2));
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(s * r * 0.9, -r * 0.8);
        ctx.quadraticCurveTo(s * r * 1.0, -r * 0.2, s * r * 1.15, r * 0.1);
        ctx.quadraticCurveTo(s * r * 0.6, 0, s * r * 0.2, r * 0.35);
        ctx.closePath();
        fillOL(ctx, L.wingColor || U.shade(L.color, -0.15), r, 0.8);
        ctx.restore();
      }
    },
    cattail(ctx, r, L, o) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, r * 0.4);
      const w = Math.sin(o.t * 4) * r * 0.2;
      ctx.quadraticCurveTo(-r * 1.4, r * 0.3, -r * 1.25 + w, -r * 0.4);
      ctx.lineWidth = r * 0.36;
      ctx.strokeStyle = OL;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineWidth = r * 0.36 - LW(r) * 1.6;
      ctx.strokeStyle = C(L.tailColor || L.color);
      ctx.stroke();
    },
    foxtail(ctx, r, L, o) {
      const w = Math.sin(o.t * 4) * 0.15;
      ctx.save();
      ctx.translate(-r * 0.7, r * 0.3);
      ctx.rotate(-0.6 + w);
      ell(ctx, -r * 0.55, 0, r * 0.65, r * 0.32);
      fillOL(ctx, L.tailColor || L.color, r);
      ell(ctx, -r * 1.0, 0, r * 0.22, r * 0.2);
      ctx.fillStyle = C('#ffffff');
      ctx.fill();
      ctx.restore();
    },
    bigtail(ctx, r, L, o) {
      const w = Math.sin(o.t * 3) * 0.1;
      ctx.save();
      ctx.translate(-r * 0.6, r * 0.3);
      ctx.rotate(w);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-r * 1.4, r * 0.2, -r * 1.5, -r * 1.4, -r * 0.5, -r * 1.3);
      ctx.bezierCurveTo(-r * 0.2, -r * 1.25, -r * 0.6, -r * 0.6, 0, -r * 0.3);
      ctx.closePath();
      fillOL(ctx, L.tailColor || U.shade(L.color, -0.1), r);
      ctx.restore();
    },
    stinger(ctx, r, L, o) {
      const w = Math.sin(o.t * 5) * r * 0.1;
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, r * 0.2);
      ctx.quadraticCurveTo(-r * 1.6, -r * 0.2, -r * 1.0 + w, -r * 1.1);
      ctx.lineWidth = r * 0.3;
      ctx.strokeStyle = OL;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineWidth = r * 0.3 - LW(r) * 1.5;
      ctx.strokeStyle = C(U.shade(L.color, -0.1));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 1.0 + w, -r * 1.35);
      ctx.lineTo(-r * 0.75 + w, -r * 1.0);
      ctx.lineTo(-r * 1.2 + w, -r * 1.0);
      ctx.closePath();
      fillOL(ctx, '#4a3a5c', r, 0.6);
    },
    dragontail(ctx, r, L, o) {
      const w = Math.sin(o.t * 4) * r * 0.15;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, r * 0.5);
      ctx.quadraticCurveTo(-r * 1.3, r * 0.8, -r * 1.5, r * 0.2 + w);
      ctx.lineTo(-r * 1.25, r * 0.3 + w);
      ctx.quadraticCurveTo(-r * 1.1, r * 0.5, -r * 0.7, r * 0.1);
      ctx.closePath();
      fillOL(ctx, L.color, r, 0.8);
    },
    tentacles(ctx, r, L, o) {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a = Math.PI * 0.15 + (i / (n - 1)) * Math.PI * 0.7;
        const w = Math.sin(o.t * 4 + i) * r * 0.25;
        const x0 = Math.cos(a) * r * 0.7, y0 = Math.sin(a) * r * 0.5;
        const x1 = Math.cos(a) * r * 1.35 + w, y1 = Math.sin(a) * r * 1.1 + r * 0.1;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) / 2 + w, (y0 + y1) / 2 + r * 0.2, x1, y1);
        ctx.lineWidth = r * 0.32;
        ctx.strokeStyle = OL;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineWidth = r * 0.32 - LW(r) * 1.5;
        ctx.strokeStyle = C(U.shade(L.color, -0.05));
        ctx.stroke();
      }
    },
    spikes(ctx, r, L) {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const x = Math.cos(a), y = Math.sin(a);
        ctx.beginPath();
        ctx.moveTo(x * r * 0.85 - y * r * 0.2, y * r * 0.8 + x * r * 0.2);
        ctx.lineTo(x * r * 1.32, y * r * 1.22);
        ctx.lineTo(x * r * 0.85 + y * r * 0.2, y * r * 0.8 - x * r * 0.2);
        ctx.closePath();
        fillOL(ctx, L.spikeColor || U.shade(L.color, -0.25), r, 0.7);
      }
    },
    fins(ctx, r, L, o) {
      const w = Math.sin(o.t * 8) * 0.2;
      ctx.save();
      ctx.translate(-r * 1.0, 0);
      ctx.rotate(w);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-r * 0.6, -r * 0.5);
      ctx.lineTo(-r * 0.6, r * 0.5);
      ctx.closePath();
      fillOL(ctx, L.finColor || U.shade(L.color, -0.15), r, 0.8);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.7);
      ctx.lineTo(r * 0.15, -r * 1.15);
      ctx.lineTo(r * 0.4, -r * 0.7);
      ctx.closePath();
      fillOL(ctx, L.finColor || U.shade(L.color, -0.15), r, 0.8);
    },
    shell(ctx, r, L) {
      circ(ctx, -r * 0.25, -r * 0.35, r * 0.78);
      fillOL(ctx, L.shellColor || '#f2a65a', r);
      ctx.beginPath();
      for (let i = 0; i < 40; i++) {
        const a = i * 0.32, rr = r * 0.62 * (1 - i / 44);
        const x = -r * 0.25 + Math.cos(a) * rr, y = -r * 0.35 + Math.sin(a) * rr;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      strokeOL(ctx, r, 0.6);
    },
    windkey(ctx, r, L, o) {
      ctx.save();
      ctx.translate(-r * 0.95, -r * 0.1);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-r * 0.4, 0);
      strokeOL(ctx, r, 1.1);
      ctx.translate(-r * 0.45, 0);
      ctx.scale(Math.cos(o.t * 5), 1);
      ell(ctx, 0, -r * 0.22, r * 0.14, r * 0.22);
      fillOL(ctx, '#f2c14e', r, 0.7);
      ell(ctx, 0, r * 0.22, r * 0.14, r * 0.22);
      fillOL(ctx, '#f2c14e', r, 0.7);
      ctx.restore();
    },
    claws(ctx, r, L, o) {
      const w = Math.sin(o.t * 6) * 0.2;
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(s * r * 1.05, -r * 0.1);
        ctx.rotate(s * (0.3 + w));
        circ(ctx, 0, -r * 0.2, r * 0.36);
        fillOL(ctx, L.color, r, 0.8);
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.2);
        ctx.lineTo(s * r * 0.1, -r * 0.6);
        strokeOL(ctx, r, 0.7);
        ctx.restore();
      }
    },
  };

  // ── 몸통 위 무늬 (몸통 모양으로 잘림) ─────────────────────
  const PAT = {
    belly(ctx, r, L) {
      ell(ctx, 0, r * 0.45, r * 0.62, r * 0.48);
      ctx.fillStyle = C(L.color2 || '#ffffff');
      ctx.fill();
    },
    spots(ctx, r, L) {
      ctx.fillStyle = C(L.color2 || U.shade(L.color, -0.15));
      for (const [x, y, s] of [[-0.45, -0.45, 0.2], [0.4, -0.2, 0.16], [-0.1, 0.4, 0.14], [0.55, 0.45, 0.1]]) {
        circ(ctx, x * r, y * r, s * r);
        ctx.fill();
      }
    },
    stripes(ctx, r, L) {
      ctx.fillStyle = C(L.color2 || '#4a3a5c');
      for (const y of [-0.15, 0.35]) {
        ctx.fillRect(-r * 1.3, y * r, r * 2.6, r * 0.22);
      }
    },
    icing(ctx, r, L) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.62);
      for (let i = 0; i <= 6; i++) ctx.lineTo(-r * 0.6 + i * r * 0.2, -r * 0.62 + (i % 2 ? r * 0.12 : 0));
      ctx.lineWidth = r * 0.1;
      ctx.strokeStyle = C('#ffffff');
      ctx.stroke();
      ctx.fillStyle = C('#ff6b8b');
      circ(ctx, -r * 0.1, r * 0.5, r * 0.08); ctx.fill();
      circ(ctx, r * 0.15, r * 0.65, r * 0.08); ctx.fill();
    },
    caramel(ctx, r, L) {
      ctx.beginPath();
      ctx.moveTo(-r * 1.3, -r * 0.35);
      for (let i = 0; i <= 8; i++) {
        const x = -r * 1.3 + i * r * 0.325;
        ctx.quadraticCurveTo(x - r * 0.16, -r * 0.35 + (i % 2 ? r * 0.28 : -r * 0.05), x, -r * 0.35);
      }
      ctx.lineTo(r * 1.3, -r * 1.5);
      ctx.lineTo(-r * 1.3, -r * 1.5);
      ctx.closePath();
      ctx.fillStyle = C(L.color2 || '#a0522d');
      ctx.fill();
    },
    frosting(ctx, r, L) {
      ctx.beginPath();
      ctx.moveTo(-r * 1.3, -r * 0.3);
      for (let i = 0; i <= 6; i++) {
        const x = -r * 1.3 + i * r * 0.43;
        ctx.quadraticCurveTo(x - r * 0.2, -r * 0.3 + (i % 2 ? r * 0.35 : 0), x, -r * 0.3);
      }
      ctx.lineTo(r * 1.3, -r * 1.5);
      ctx.lineTo(-r * 1.3, -r * 1.5);
      ctx.closePath();
      ctx.fillStyle = C(L.color2 || '#ffb3c6');
      ctx.fill();
    },
    macaron(ctx, r, L) {
      ctx.fillStyle = C(L.color2 || '#fff3e0');
      ctx.fillRect(-r * 1.3, -r * 0.05, r * 2.6, r * 0.28);
    },
    sprinkles(ctx, r) {
      const cols = ['#ff6b8b', '#7ed9c3', '#ffd166', '#8ecbff', '#b9a6ff'];
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4, rr = r * (0.25 + (i % 3) * 0.22);
        ctx.save();
        ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr * 0.8 - r * 0.2);
        ctx.rotate(a);
        ctx.fillStyle = C(cols[i % cols.length]);
        U.roundRect(ctx, -r * 0.08, -r * 0.03, r * 0.16, r * 0.06, r * 0.03);
        ctx.fill();
        ctx.restore();
      }
    },
    bandage(ctx, r) {
      ctx.strokeStyle = C('#d9cfb5');
      ctx.lineWidth = r * 0.09;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * 1.2, i * r * 0.3 - r * 0.2);
        ctx.lineTo(r * 1.2, i * r * 0.3 + r * 0.1);
        ctx.stroke();
      }
    },
    cracks(ctx, r, L) {
      ctx.strokeStyle = C(L.color2 || U.shade(L.color, -0.3));
      ctx.lineWidth = r * 0.08;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.7); ctx.lineTo(-r * 0.35, -r * 0.4); ctx.lineTo(-r * 0.5, -r * 0.15);
      ctx.moveTo(r * 0.5, r * 0.2); ctx.lineTo(r * 0.7, r * 0.45); ctx.lineTo(r * 0.55, r * 0.7);
      ctx.moveTo(r * 0.3, -r * 0.75); ctx.lineTo(r * 0.45, -r * 0.55);
      ctx.stroke();
    },
    stitches(ctx, r) {
      ctx.fillStyle = C('#e8d5b5');
      U.roundRect(ctx, r * 0.2, r * 0.15, r * 0.55, r * 0.5, r * 0.1);
      ctx.fill();
      ctx.strokeStyle = C('#7a5c45');
      ctx.lineWidth = r * 0.05;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        ctx.moveTo(r * (0.25 + i * 0.14), r * 0.12);
        ctx.lineTo(r * (0.25 + i * 0.14), r * 0.2);
      }
      ctx.moveTo(-r * 0.7, -r * 0.3); ctx.lineTo(-r * 0.4, -r * 0.45);
      ctx.moveTo(-r * 0.65, -r * 0.45); ctx.lineTo(-r * 0.5, -r * 0.25);
      ctx.stroke();
    },
    mask(ctx, r) {
      ell(ctx, 0, -r * 0.06, r * 0.95, r * 0.26);
      ctx.fillStyle = C('#5b5363');
      ctx.fill();
    },
    pages(ctx, r) {
      ctx.fillStyle = C('#fffaf0');
      ctx.fillRect(r * 0.55, -r * 0.65, r * 0.32, r * 1.3);
      ctx.strokeStyle = C('#d6c8b0');
      ctx.lineWidth = r * 0.04;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(r * 0.6, -r * 0.5 + i * r * 0.3);
        ctx.lineTo(r * 0.85, -r * 0.5 + i * r * 0.3);
        ctx.stroke();
      }
      ctx.fillStyle = C('#f2c14e');
      ctx.fillRect(-r * 0.95, -r * 0.1, r * 0.3, r * 0.18);
    },
    clock(ctx, r, L, o) {
      circ(ctx, 0, r * 0.42, r * 0.42);
      ctx.fillStyle = C('#fff8e1');
      ctx.fill();
      ctx.strokeStyle = OL;
      ctx.lineWidth = r * 0.06;
      ctx.stroke();
      const a = o.t * 2;
      ctx.beginPath();
      ctx.moveTo(0, r * 0.42); ctx.lineTo(Math.cos(a) * r * 0.3, r * 0.42 + Math.sin(a) * r * 0.3);
      ctx.moveTo(0, r * 0.42); ctx.lineTo(Math.cos(a / 12) * r * 0.2, r * 0.42 + Math.sin(a / 12) * r * 0.2);
      ctx.stroke();
    },
    stars(ctx, r) {
      ctx.fillStyle = C('#fff6c2');
      for (const [x, y] of [[-0.4, -0.4], [0.35, -0.5], [0.5, 0.3], [-0.3, 0.45], [0, 0]]) {
        circ(ctx, x * r, y * r, r * 0.07);
        ctx.fill();
      }
    },
    glow(ctx, r, L) {
      const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 1.1);
      g.addColorStop(0, FLASH ? '#fff' : 'rgba(255,255,220,0.75)');
      g.addColorStop(1, 'rgba(255,255,220,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
    },
    needles(ctx, r) {
      ctx.strokeStyle = C('#fff7d6');
      ctx.lineWidth = r * 0.06;
      for (const [x, y] of [[-0.4, -0.5], [0.3, -0.6], [-0.5, 0.2], [0.45, 0.1], [0, 0.55], [0, -0.2]]) {
        ctx.beginPath();
        ctx.moveTo(x * r - r * 0.08, y * r);
        ctx.lineTo(x * r + r * 0.08, y * r - r * 0.06);
        ctx.stroke();
      }
    },
    shellback(ctx, r) {
      ctx.strokeStyle = C('#ffffff');
      ctx.lineWidth = r * 0.07;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * r * 0.3, -r * 0.9);
        ctx.lineTo(i * r * 0.15, r * 0.1);
        ctx.stroke();
      }
    },
    lavaglow(ctx, r) {
      ctx.strokeStyle = C('#ffd166');
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, r * 0.2); ctx.lineTo(-r * 0.3, r * 0.4); ctx.lineTo(0, r * 0.15); ctx.lineTo(r * 0.4, r * 0.45);
      ctx.stroke();
    },
  };

  // ── 몸통 앞쪽 부품 (모자, 왕관, 스카프 ...) ───────────────
  const FRONT = {
    cap(ctx, r, L) {
      ctx.beginPath();
      ctx.moveTo(-r * 1.3, -r * 0.18);
      ctx.bezierCurveTo(-r * 1.35, -r * 1.45, r * 1.35, -r * 1.45, r * 1.3, -r * 0.18);
      ctx.quadraticCurveTo(0, -r * 0.4, -r * 1.3, -r * 0.18);
      ctx.closePath();
      fillOL(ctx, L.capColor || '#ff6b6b', r);
      ctx.fillStyle = C('#ffffff');
      for (const [x, y, s] of [[-0.6, -0.65, 0.17], [0.2, -0.95, 0.2], [0.75, -0.55, 0.13]]) {
        circ(ctx, x * r, y * r, s * r);
        ctx.fill();
      }
    },
    crown(ctx, r, L) {
      const y = -r * 0.92, w = r * 0.55;
      ctx.beginPath();
      ctx.moveTo(-w, y);
      ctx.lineTo(-w, y - r * 0.38);
      ctx.lineTo(-w * 0.5, y - r * 0.18);
      ctx.lineTo(0, y - r * 0.5);
      ctx.lineTo(w * 0.5, y - r * 0.18);
      ctx.lineTo(w, y - r * 0.38);
      ctx.lineTo(w, y);
      ctx.closePath();
      fillOL(ctx, '#ffd23f', r, 0.8);
      circ(ctx, 0, y - r * 0.12, r * 0.08);
      ctx.fillStyle = C('#ff4d6d');
      ctx.fill();
    },
    scarf(ctx, r, L, o) {
      const col = L.scarfColor || '#ff6b6b';
      const w = Math.sin(o.t * 8) * r * 0.08;
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, r * 0.3);
      ctx.quadraticCurveTo(-r * 0.75, r * 0.5 + w, -r * 1.05, r * 0.4 + w * 2);
      ctx.lineTo(-r * 0.95, r * 0.7 + w * 2);
      ctx.quadraticCurveTo(-r * 0.6, r * 0.75, -r * 0.3, r * 0.55);
      ctx.closePath();
      fillOL(ctx, U.shade(col, -0.1), r, 0.8);
      ctx.beginPath();
      ctx.moveTo(-r * 0.85, r * 0.25);
      ctx.quadraticCurveTo(0, r * 0.52, r * 0.85, r * 0.25);
      ctx.lineTo(r * 0.8, r * 0.5);
      ctx.quadraticCurveTo(0, r * 0.78, -r * 0.8, r * 0.5);
      ctx.closePath();
      fillOL(ctx, col, r, 0.8);
    },
    helmet(ctx, r, L) {
      ctx.beginPath();
      ctx.moveTo(-r * 1.0, -r * 0.3);
      ctx.bezierCurveTo(-r * 1.05, -r * 1.25, r * 1.05, -r * 1.25, r * 1.0, -r * 0.3);
      ctx.lineTo(r * 0.75, -r * 0.3);
      ctx.quadraticCurveTo(0, -r * 0.48, -r * 0.75, -r * 0.3);
      ctx.closePath();
      fillOL(ctx, L.helmColor || '#c9d3e6', r);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.98);
      ctx.quadraticCurveTo(-r * 0.6, -r * 1.55, -r * 0.9, -r * 1.2);
      ctx.quadraticCurveTo(-r * 0.4, -r * 1.25, 0, -r * 0.98);
      fillOL(ctx, L.plumeColor || '#ff6b6b', r, 0.7);
    },
    bandana(ctx, r, L) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.98, -r * 0.42);
      ctx.quadraticCurveTo(0, -r * 0.8, r * 0.98, -r * 0.42);
      ctx.lineTo(r * 0.92, -r * 0.22);
      ctx.quadraticCurveTo(0, -r * 0.58, -r * 0.92, -r * 0.22);
      ctx.closePath();
      fillOL(ctx, L.bandColor || '#4fa3ff', r, 0.8);
      ell(ctx, -r * 1.05, -r * 0.3, r * 0.15, r * 0.1, 0.4);
      fillOL(ctx, L.bandColor || '#4fa3ff', r, 0.6);
    },
    witchHat(ctx, r, L, o) {
      const col = L.hatColor || '#6a4c93';
      ell(ctx, 0, -r * 0.72, r * 1.1, r * 0.25);
      fillOL(ctx, col, r);
      const sway = Math.sin(o.t * 2) * r * 0.1;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.75);
      ctx.quadraticCurveTo(-r * 0.2, -r * 1.4, r * 0.25 + sway, -r * 1.85);
      ctx.quadraticCurveTo(r * 0.3, -r * 1.3, r * 0.6, -r * 0.75);
      ctx.closePath();
      fillOL(ctx, col, r);
      ctx.fillStyle = C(L.bandColor || '#ffd166');
      ctx.fillRect(-r * 0.55, -r * 0.95, r * 1.1, r * 0.14);
    },
    chefHat(ctx, r) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.55, -r * 0.7);
      ctx.lineTo(-r * 0.55, -r * 1.05);
      ctx.bezierCurveTo(-r * 1.1, -r * 1.2, -r * 0.6, -r * 1.85, 0, -r * 1.5);
      ctx.bezierCurveTo(r * 0.6, -r * 1.85, r * 1.1, -r * 1.2, r * 0.55, -r * 1.05);
      ctx.lineTo(r * 0.55, -r * 0.7);
      ctx.closePath();
      fillOL(ctx, '#ffffff', r);
    },
    halo(ctx, r, L, o) {
      ell(ctx, 0, -r * 1.25 + Math.sin(o.t * 3) * r * 0.05, r * 0.5, r * 0.15);
      ctx.lineWidth = r * 0.12;
      ctx.strokeStyle = C('#ffd23f');
      ctx.stroke();
    },
    goggles(ctx, r) {
      ctx.fillStyle = C('#7a5c45');
      ctx.fillRect(-r * 0.98, -r * 0.62, r * 1.96, r * 0.16);
      for (const s of [-1, 1]) {
        circ(ctx, s * r * 0.3, -r * 0.55, r * 0.2);
        fillOL(ctx, '#9be7ff', r, 0.7);
      }
    },
    glasses(ctx, r, L) {
      ctx.lineWidth = r * 0.07;
      ctx.strokeStyle = C(L.glassColor || '#f2c14e');
      for (const s of [-1, 1]) {
        circ(ctx, s * r * 0.34, -r * 0.02, r * 0.24);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, -r * 0.05); ctx.lineTo(r * 0.1, -r * 0.05);
      ctx.stroke();
    },
    monocle(ctx, r) {
      circ(ctx, r * 0.34, -r * 0.02, r * 0.27);
      ctx.lineWidth = r * 0.08;
      ctx.strokeStyle = C('#ffd23f');
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r * 0.5, r * 0.2);
      ctx.quadraticCurveTo(r * 0.7, r * 0.6, r * 0.45, r * 0.8);
      ctx.lineWidth = r * 0.04;
      ctx.stroke();
    },
    candle(ctx, r, L, o) {
      U.roundRect(ctx, -r * 0.14, -r * 1.5, r * 0.28, r * 0.6, r * 0.06);
      fillOL(ctx, '#fff6e5', r, 0.7);
      flame(ctx, 0, -r * 1.55, r * 0.22, o.t);
    },
    flame(ctx, r, L, o) { flame(ctx, 0, -r * 0.95, r * 0.42, o.t); },
    sprout(ctx, r) {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.92);
      ctx.lineTo(0, -r * 1.25);
      strokeOL(ctx, r, 0.8);
      for (const s of [-1, 1]) {
        ell(ctx, s * r * 0.22, -r * 1.3, r * 0.24, r * 0.12, s * -0.5);
        fillOL(ctx, '#7ed957', r, 0.7);
      }
    },
    leaf(ctx, r) {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.9);
      ctx.quadraticCurveTo(r * 0.7, -r * 1.6, r * 0.2, -r * 1.75);
      ctx.quadraticCurveTo(-r * 0.4, -r * 1.4, 0, -r * 0.9);
      fillOL(ctx, '#6cc56f', r, 0.8);
    },
    eggshell(ctx, r) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, -r * 0.55);
      ctx.bezierCurveTo(-r * 0.75, -r * 1.3, r * 0.75, -r * 1.3, r * 0.75, -r * 0.55);
      for (let i = 0; i < 6; i++) ctx.lineTo(r * 0.75 - (i + 1) * r * 0.25, -r * 0.55 + (i % 2 ? 0 : r * 0.2));
      ctx.closePath();
      fillOL(ctx, '#fffaf0', r, 0.8);
    },
    cherry(ctx, r) {
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.15);
      ctx.quadraticCurveTo(r * 0.1, -r * 1.5, r * 0.3, -r * 1.55);
      strokeOL(ctx, r, 0.7);
      circ(ctx, 0, -r * 1.08, r * 0.2);
      fillOL(ctx, '#ff3b5c', r, 0.7);
    },
    pharaoh(ctx, r) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * r * 0.65, -r * 0.7);
        ctx.lineTo(s * r * 1.15, r * 0.3);
        ctx.lineTo(s * r * 0.8, r * 0.35);
        ctx.lineTo(s * r * 0.6, -r * 0.2);
        ctx.closePath();
        fillOL(ctx, '#4f7cff', r, 0.8);
        ctx.strokeStyle = C('#ffd23f');
        ctx.lineWidth = r * 0.07;
        ctx.beginPath();
        ctx.moveTo(s * r * 0.75, -r * 0.35); ctx.lineTo(s * r * 1.0, -r * 0.3);
        ctx.moveTo(s * r * 0.85, -r * 0.05); ctx.lineTo(s * r * 1.08, 0);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, -r * 0.55);
      ctx.quadraticCurveTo(0, -r * 1.25, r * 0.8, -r * 0.55);
      ctx.lineTo(r * 0.7, -r * 0.4);
      ctx.quadraticCurveTo(0, -r * 0.9, -r * 0.7, -r * 0.4);
      ctx.closePath();
      fillOL(ctx, '#ffd23f', r, 0.8);
      ell(ctx, 0, -r * 0.95, r * 0.12, r * 0.1);
      fillOL(ctx, '#ff4d6d', r, 0.6);
    },
    beanie(ctx, r, L) {
      const col = L.hatColor || '#ff6b8b';
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, -r * 0.4);
      ctx.bezierCurveTo(-r * 1.0, -r * 1.3, r * 1.0, -r * 1.3, r * 0.95, -r * 0.4);
      ctx.closePath();
      fillOL(ctx, col, r);
      U.roundRect(ctx, -r * 1.0, -r * 0.55, r * 2.0, r * 0.25, r * 0.1);
      fillOL(ctx, '#ffffff', r, 0.7);
      circ(ctx, 0, -r * 1.12, r * 0.2);
      fillOL(ctx, '#ffffff', r, 0.7);
    },
    bow(ctx, r, L) {
      const col = L.bowColor || '#ff6b8b';
      ctx.save();
      ctx.translate(r * 0.55, -r * 0.82);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(s * r * 0.35, -r * 0.2);
        ctx.lineTo(s * r * 0.35, r * 0.2);
        ctx.closePath();
        fillOL(ctx, col, r, 0.7);
      }
      circ(ctx, 0, 0, r * 0.1);
      fillOL(ctx, col, r, 0.6);
      ctx.restore();
    },
    soldierHat(ctx, r, L) {
      U.roundRect(ctx, -r * 0.6, -r * 1.75, r * 1.2, r * 1.0, r * 0.35);
      fillOL(ctx, '#3d3a6b', r);
      ctx.fillStyle = C('#ffd23f');
      ctx.fillRect(-r * 0.6, -r * 0.95, r * 1.2, r * 0.12);
    },
    mitre(ctx, r) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.55, -r * 0.75);
      ctx.quadraticCurveTo(-r * 0.6, -r * 1.4, 0, -r * 1.75);
      ctx.quadraticCurveTo(r * 0.6, -r * 1.4, r * 0.55, -r * 0.75);
      ctx.closePath();
      fillOL(ctx, '#ffffff', r);
      ctx.strokeStyle = C('#ffd23f');
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.85); ctx.lineTo(0, -r * 1.45);
      ctx.moveTo(-r * 0.2, -r * 1.2); ctx.lineTo(r * 0.2, -r * 1.2);
      ctx.stroke();
    },
    moonpin(ctx, r) {
      ctx.save();
      ctx.translate(r * 0.6, -r * 0.7);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.28, 0.6, TAU - 0.6);
      ctx.arc(r * 0.12, 0, r * 0.2, TAU - 0.9, 0.9, true);
      ctx.closePath();
      fillOL(ctx, '#ffe66d', r, 0.7);
      ctx.restore();
    },
    feather(ctx, r) {
      ctx.save();
      ctx.translate(r * 0.55, -r * 0.8);
      ctx.rotate(0.5);
      ell(ctx, 0, -r * 0.3, r * 0.12, r * 0.38);
      fillOL(ctx, '#7ed9c3', r, 0.7);
      ctx.restore();
    },
    lure(ctx, r, L, o) {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.9);
      ctx.quadraticCurveTo(r * 0.3, -r * 1.7, r * 0.9, -r * 1.4);
      strokeOL(ctx, r, 0.8);
      const g = 0.6 + Math.sin(o.t * 6) * 0.4;
      circ(ctx, r * 0.9, -r * 1.35, r * 0.28 * (0.8 + g * 0.3));
      ctx.fillStyle = FLASH ? '#fff' : `rgba(255,240,120,${0.25 * g})`;
      ctx.fill();
      circ(ctx, r * 0.9, -r * 1.35, r * 0.15);
      fillOL(ctx, '#fff36b', r, 0.6);
    },
    cannon(ctx, r) {
      U.roundRect(ctx, r * 0.3, -r * 0.65, r * 1.0, r * 0.32, r * 0.12);
      fillOL(ctx, '#5c7a4f', r, 0.8);
      circ(ctx, r * 0.2, -r * 0.5, r * 0.32);
      fillOL(ctx, '#7aa36a', r, 0.8);
    },
    gear(ctx, r, L, o) {
      ctx.save();
      ctx.translate(0, -r * 1.05);
      ctx.rotate(o.t);
      gearPath(ctx, r * 0.35, 8);
      fillOL(ctx, '#f2c14e', r, 0.7);
      circ(ctx, 0, 0, r * 0.1);
      ctx.fillStyle = C(OL);
      ctx.fill();
      ctx.restore();
    },
    captain(ctx, r) {
      ell(ctx, 0, -r * 0.82, r * 0.95, r * 0.22);
      fillOL(ctx, '#3d3a6b', r);
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, -r * 0.85);
      ctx.quadraticCurveTo(0, -r * 1.7, r * 0.7, -r * 0.85);
      ctx.closePath();
      fillOL(ctx, '#3d3a6b', r);
      circ(ctx, 0, -r * 1.05, r * 0.15);
      fillOL(ctx, '#ffd23f', r, 0.6);
    },
    tophat(ctx, r, L) {
      ell(ctx, 0, -r * 0.8, r * 0.8, r * 0.18);
      fillOL(ctx, L.hatColor || '#3d3a6b', r);
      U.roundRect(ctx, -r * 0.5, -r * 1.55, r * 1.0, r * 0.78, r * 0.08);
      fillOL(ctx, L.hatColor || '#3d3a6b', r);
      ctx.fillStyle = C('#ff6b8b');
      ctx.fillRect(-r * 0.5, -r * 1.0, r * 1.0, r * 0.14);
    },
    shawl(ctx, r) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, r * 0.05);
      ctx.quadraticCurveTo(0, r * 0.55, r * 0.95, r * 0.05);
      ctx.lineTo(r * 0.85, r * 0.55);
      ctx.quadraticCurveTo(0, r * 1.0, -r * 0.85, r * 0.55);
      ctx.closePath();
      fillOL(ctx, '#b9a6ff', r, 0.8);
      ctx.fillStyle = C('#ffffff');
      for (let i = -2; i <= 2; i++) {
        circ(ctx, i * r * 0.32, r * 0.48 + Math.abs(i) * -r * 0.08, r * 0.06);
        ctx.fill();
      }
    },
    carrot(ctx, r) {
      ctx.beginPath();
      ctx.moveTo(r * 0.05, r * 0.08);
      ctx.lineTo(r * 0.6, r * 0.18);
      ctx.lineTo(r * 0.05, r * 0.28);
      ctx.closePath();
      fillOL(ctx, '#ff9f1c', r, 0.6);
    },
    snout(ctx, r) {
      ell(ctx, 0, r * 0.22, r * 0.3, r * 0.2);
      fillOL(ctx, '#ff9fb5', r, 0.6);
      ctx.fillStyle = C(OL);
      circ(ctx, -r * 0.1, r * 0.22, r * 0.05); ctx.fill();
      circ(ctx, r * 0.1, r * 0.22, r * 0.05); ctx.fill();
    },
    beak(ctx, r) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.16, r * 0.12);
      ctx.lineTo(r * 0.16, r * 0.12);
      ctx.lineTo(0, r * 0.34);
      ctx.closePath();
      fillOL(ctx, '#ffb347', r, 0.6);
    },
    eyeglow(ctx, r, L) {
      for (const s of [-1, 1]) {
        circ(ctx, s * r * 0.34, 0, r * 0.3);
        ctx.fillStyle = FLASH ? '#fff' : U.rgba(L.eyeColor || '#ff4d6d', 0.25);
        ctx.fill();
      }
    },
  };

  function gearPath(ctx, R, teeth) {
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * TAU;
      const rr = i % 2 ? R * 0.75 : R;
      const a2 = a + TAU / (teeth * 4);
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      ctx.lineTo(Math.cos(a2) * rr, Math.sin(a2) * rr);
    }
    ctx.closePath();
  }

  function flame(ctx, x, y, s, t) {
    const f = 1 + Math.sin(t * 18) * 0.08;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, f);
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.6);
    ctx.bezierCurveTo(s * 0.9, -s * 0.6, s * 1.0, s * 0.5, 0, s * 0.6);
    ctx.bezierCurveTo(-s * 1.0, s * 0.5, -s * 0.9, -s * 0.6, 0, -s * 1.6);
    ctx.closePath();
    ctx.fillStyle = C('#ff9f1c');
    ctx.fill();
    ctx.lineWidth = Math.max(1, s * 0.25);
    ctx.strokeStyle = OL;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.7);
    ctx.bezierCurveTo(s * 0.5, -s * 0.2, s * 0.5, s * 0.4, 0, s * 0.4);
    ctx.bezierCurveTo(-s * 0.5, s * 0.4, -s * 0.5, -s * 0.2, 0, -s * 0.7);
    ctx.fillStyle = C('#ffe66d');
    ctx.fill();
    ctx.restore();
  }

  // ── 얼굴 ───────────────────────────────────────────────────
  function face(ctx, L, r, o) {
    const ex = r * (L.eyeGap || 0.34);
    const ey = r * (L.eyeY != null ? L.eyeY : -0.02);
    const es = r * 0.15 * (L.eyeScale || 1);
    const blink = (o.t + (o.seed || 0)) % 3.7 < 0.12;
    const type = L.eyes || 'cute';
    ctx.lineCap = 'round';
    const drawEye = (x, s) => {
      switch (type) {
        case 'dot':
          circ(ctx, x, ey, r * 0.075);
          ctx.fillStyle = OL; ctx.fill();
          break;
        case 'happy':
          ctx.beginPath();
          ctx.moveTo(x - es, ey + es * 0.3);
          ctx.quadraticCurveTo(x, ey - es * 1.1, x + es, ey + es * 0.3);
          ctx.lineWidth = LW(r) * 0.9; ctx.strokeStyle = OL; ctx.stroke();
          break;
        case 'sleepy':
          ctx.beginPath();
          ctx.moveTo(x - es, ey);
          ctx.quadraticCurveTo(x, ey + es * 0.8, x + es, ey);
          ctx.lineWidth = LW(r) * 0.9; ctx.strokeStyle = OL; ctx.stroke();
          break;
        case 'x':
          ctx.beginPath();
          ctx.moveTo(x - es * 0.8, ey - es * 0.8); ctx.lineTo(x + es * 0.8, ey + es * 0.8);
          ctx.moveTo(x + es * 0.8, ey - es * 0.8); ctx.lineTo(x - es * 0.8, ey + es * 0.8);
          ctx.lineWidth = LW(r) * 0.8; ctx.strokeStyle = OL; ctx.stroke();
          break;
        case 'button':
          circ(ctx, x, ey, es * 1.05);
          ctx.fillStyle = OL; ctx.fill();
          ctx.fillStyle = '#ffffff';
          circ(ctx, x - es * 0.3, ey - es * 0.3, es * 0.2); ctx.fill();
          circ(ctx, x + es * 0.3, ey + es * 0.3, es * 0.2); ctx.fill();
          break;
        case 'glow': {
          if (blink) { lineEye(x); break; }
          ell(ctx, x, ey, es * 1.0, es * 1.2);
          ctx.fillStyle = L.eyeColor || '#fff36b'; ctx.fill();
          ctx.lineWidth = LW(r) * 0.6; ctx.strokeStyle = OL; ctx.stroke();
          ctx.fillStyle = '#ffffff';
          circ(ctx, x - es * 0.3, ey - es * 0.4, es * 0.32); ctx.fill();
          break;
        }
        case 'big': {
          if (blink) { lineEye(x); break; }
          circ(ctx, x, ey, es * 1.7);
          ctx.fillStyle = '#ffffff'; ctx.fill();
          ctx.lineWidth = LW(r) * 0.7; ctx.strokeStyle = OL; ctx.stroke();
          circ(ctx, x + r * 0.04, ey, es * 1.0);
          ctx.fillStyle = OL; ctx.fill();
          ctx.fillStyle = '#ffffff';
          circ(ctx, x - es * 0.2, ey - es * 0.35, es * 0.35); ctx.fill();
          break;
        }
        default: {
          if (blink) { lineEye(x); break; }
          ell(ctx, x, ey, es * 0.9, es * 1.12);
          ctx.fillStyle = OL; ctx.fill();
          ctx.fillStyle = '#ffffff';
          circ(ctx, x - es * 0.3, ey - es * 0.42, es * 0.4); ctx.fill();
          circ(ctx, x + es * 0.32, ey + es * 0.38, es * 0.16); ctx.fill();
        }
      }
      if (type === 'angry' || L.brows) {
        ctx.beginPath();
        ctx.moveTo(x - s * es * 1.2, ey - es * 2.0);
        ctx.lineTo(x + s * es * 0.8, ey - es * 1.25);
        ctx.lineWidth = LW(r) * 0.9; ctx.strokeStyle = OL; ctx.stroke();
      }
    };
    const lineEye = (x) => {
      ctx.beginPath();
      ctx.moveTo(x - es, ey);
      ctx.quadraticCurveTo(x, ey + es * 0.6, x + es, ey);
      ctx.lineWidth = LW(r) * 0.8; ctx.strokeStyle = OL; ctx.stroke();
    };
    if (type === 'one') {
      if (blink) { ctx.beginPath(); ctx.moveTo(-es * 2, ey); ctx.lineTo(es * 2, ey); ctx.lineWidth = LW(r); ctx.strokeStyle = OL; ctx.stroke(); }
      else {
        circ(ctx, 0, ey, es * 2.4);
        ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.lineWidth = LW(r) * 0.8; ctx.strokeStyle = OL; ctx.stroke();
        const lx = (o.lookX || 0) * es * 0.8, ly = (o.lookY || 0) * es * 0.8;
        circ(ctx, lx, ey + ly, es * 1.3);
        ctx.fillStyle = L.eyeColor || '#b06cff'; ctx.fill();
        circ(ctx, lx, ey + ly, es * 0.65);
        ctx.fillStyle = OL; ctx.fill();
        circ(ctx, lx - es * 0.5, ey + ly - es * 0.5, es * 0.35);
        ctx.fillStyle = '#ffffff'; ctx.fill();
      }
    } else {
      drawEye(-ex, -1);
      drawEye(ex, 1);
    }

    if (L.blush !== false) {
      ctx.fillStyle = 'rgba(255,120,150,0.45)';
      for (const s of [-1, 1]) {
        ell(ctx, s * r * 0.6, ey + r * 0.2, r * 0.15, r * 0.09);
        ctx.fill();
      }
    }

    const my = ey + r * (L.mouthY != null ? L.mouthY : 0.28);
    const mw = r * 0.13;
    ctx.lineWidth = LW(r) * 0.75;
    ctx.strokeStyle = OL;
    switch (L.mouth || 'cat') {
      case 'none': break;
      case 'smile':
        ctx.beginPath();
        ctx.arc(0, my - mw * 0.6, mw, 0.2 * Math.PI, 0.8 * Math.PI);
        ctx.stroke();
        break;
      case 'o':
        ell(ctx, 0, my, mw * 0.55, mw * 0.7);
        ctx.fillStyle = '#7a2e4a'; ctx.fill();
        break;
      case 'fang':
        ctx.beginPath();
        ctx.moveTo(-mw * 1.1, my - mw * 0.2);
        ctx.quadraticCurveTo(0, my + mw * 0.6, mw * 1.1, my - mw * 0.2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mw * 0.2, my + mw * 0.15);
        ctx.lineTo(mw * 0.55, my + mw * 0.05);
        ctx.lineTo(mw * 0.4, my + mw * 0.6);
        ctx.closePath();
        ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.lineWidth = LW(r) * 0.4; ctx.stroke();
        break;
      case 'zig':
        ctx.beginPath();
        ctx.moveTo(-mw * 1.2, my);
        ctx.lineTo(-mw * 0.4, my - mw * 0.4);
        ctx.lineTo(mw * 0.4, my);
        ctx.lineTo(mw * 1.2, my - mw * 0.4);
        ctx.stroke();
        break;
      case 'grin':
        ctx.beginPath();
        ctx.moveTo(-mw * 1.3, my - mw * 0.3);
        ctx.quadraticCurveTo(0, my + mw * 1.6, mw * 1.3, my - mw * 0.3);
        ctx.closePath();
        ctx.fillStyle = '#7a2e4a'; ctx.fill();
        ctx.stroke();
        ell(ctx, 0, my + mw * 0.45, mw * 0.5, mw * 0.25);
        ctx.fillStyle = '#ff8fab'; ctx.fill();
        break;
      default: // cat ω
        ctx.beginPath();
        ctx.moveTo(-mw, my);
        ctx.quadraticCurveTo(-mw / 2, my + mw * 0.9, 0, my);
        ctx.quadraticCurveTo(mw / 2, my + mw * 0.9, mw, my);
        ctx.stroke();
    }
  }

  // ── 생물 그리기 ───────────────────────────────────────────
  // o: { t, moving, flash, face(1|-1), seed, alpha, elite, noShadow, hop }
  function creature(ctx, L, x, y, r, o) {
    const t = o.t || 0;
    const moving = !!o.moving;
    const ph = t * (moving ? 11 : 2.6) + (o.seed || 0);
    let hop = 0, sx = 1, sy = 1;
    if (L.float) {
      hop = r * 0.25 + Math.sin(ph * 0.8) * r * 0.12;
    } else if (moving) {
      const s = Math.abs(Math.sin(ph));
      hop = s * r * 0.22;
      sy = 0.94 + s * 0.1;
      sx = 1.06 - s * 0.08;
    } else {
      sy = 1 + Math.sin(ph) * 0.035;
      sx = 1 - Math.sin(ph) * 0.02;
    }
    if (o.squash) { sx *= 1 + o.squash; sy *= 1 - o.squash; }
    if (o.hop) hop += o.hop;

    ctx.save();
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;

    if (!o.noShadow) {
      ell(ctx, x, y + r * 0.92, r * (L.float ? 0.7 : 0.95), r * 0.3);
      ctx.fillStyle = 'rgba(40,20,60,0.2)';
      ctx.fill();
    }
    if (o.elite) {
      const p = 0.5 + Math.sin(t * 6) * 0.5;
      ell(ctx, x, y + r * 0.92, r * (1.2 + p * 0.15), r * (0.42 + p * 0.05));
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = `rgba(255,${120 + p * 80},60,0.85)`;
      ctx.stroke();
    }

    FLASH = (o.flash || 0) > 0;
    ctx.translate(x, y - hop);
    ctx.scale((o.face || 1) * sx, sy);

    for (const b of L.back || []) BACK[b] && BACK[b](ctx, r, L, o);
    if (L.ears && BACK[L.ears]) BACK[L.ears](ctx, r, L, o);

    const body = BODY[L.body] || BODY.round;
    body(ctx, r, t);
    ctx.fillStyle = C(L.color);
    ctx.fill();
    ctx.save();
    body(ctx, r, t);
    ctx.clip();
    for (const p of L.pat || []) PAT[p] && PAT[p](ctx, r, L, o);
    // 아래쪽 그림자, 왼쪽 위 하이라이트
    ell(ctx, r * 0.1, r * 0.95, r * 1.3, r * 0.6);
    ctx.fillStyle = 'rgba(59,42,77,0.13)';
    ctx.fill();
    ell(ctx, -r * 0.42, -r * 0.5, r * 0.3, r * 0.17, -0.5);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
    ctx.restore();
    body(ctx, r, t);
    strokeOL(ctx, r);

    if (L.translucent) {
      ell(ctx, r * 0.3, -r * 0.25, r * 0.18, r * 0.12);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fill();
    }

    ctx.save();
    ctx.translate(r * 0.08, 0);
    face(ctx, L, r, o);
    ctx.restore();
    for (const a of L.acc || []) FRONT[a] && FRONT[a](ctx, r, L, o);
    if (o.elite && !(L.acc || []).includes('crown')) FRONT.crown(ctx, r, L, o);

    FLASH = false;
    ctx.restore();
  }

  // ── 무기 (오른쪽을 향해 그림, 길이 s) ─────────────────────
  function weapon(ctx, type, color, s) {
    const lw = Math.max(1.4, s * 0.08);
    const ol = () => { ctx.lineWidth = lw; ctx.strokeStyle = OL; ctx.lineJoin = 'round'; ctx.stroke(); };
    const light = U.shade(color, 0.55);
    switch (type) {
      case 'sword':
        ctx.beginPath();
        ctx.moveTo(s * 0.18, -s * 0.09);
        ctx.lineTo(s * 0.82, -s * 0.09);
        ctx.lineTo(s * 1.0, 0);
        ctx.lineTo(s * 0.82, s * 0.09);
        ctx.lineTo(s * 0.18, s * 0.09);
        ctx.closePath();
        ctx.fillStyle = light; ctx.fill(); ol();
        U.roundRect(ctx, s * 0.1, -s * 0.22, s * 0.1, s * 0.44, s * 0.04);
        ctx.fillStyle = color; ctx.fill(); ol();
        U.roundRect(ctx, -s * 0.18, -s * 0.06, s * 0.3, s * 0.12, s * 0.05);
        ctx.fillStyle = U.shade(color, -0.3); ctx.fill(); ol();
        break;
      case 'spear':
        U.roundRect(ctx, -s * 0.35, -s * 0.05, s * 1.0, s * 0.1, s * 0.05);
        ctx.fillStyle = U.shade(color, -0.2); ctx.fill(); ol();
        ctx.beginPath();
        ctx.moveTo(s * 0.62, -s * 0.13);
        ctx.lineTo(s * 1.05, 0);
        ctx.lineTo(s * 0.62, s * 0.13);
        ctx.closePath();
        ctx.fillStyle = light; ctx.fill(); ol();
        break;
      case 'hammer':
        U.roundRect(ctx, -s * 0.2, -s * 0.06, s * 0.8, s * 0.12, s * 0.05);
        ctx.fillStyle = '#a0785a'; ctx.fill(); ol();
        U.roundRect(ctx, s * 0.5, -s * 0.3, s * 0.42, s * 0.6, s * 0.14);
        ctx.fillStyle = color; ctx.fill(); ol();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(s * 0.57, -s * 0.22, s * 0.08, s * 0.4);
        break;
      case 'bow':
        ctx.beginPath();
        ctx.arc(-s * 0.1, 0, s * 0.55, -1.15, 1.15);
        ctx.lineWidth = s * 0.16; ctx.strokeStyle = OL; ctx.stroke();
        ctx.lineWidth = s * 0.16 - lw * 1.4; ctx.strokeStyle = color; ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-s * 0.1 + Math.cos(-1.15) * s * 0.55, Math.sin(-1.15) * s * 0.55);
        ctx.lineTo(-s * 0.1 + Math.cos(1.15) * s * 0.55, Math.sin(1.15) * s * 0.55);
        ctx.lineWidth = Math.max(1, lw * 0.5); ctx.strokeStyle = '#fffaf0'; ctx.stroke();
        break;
      case 'wand':
        U.roundRect(ctx, -s * 0.25, -s * 0.05, s * 0.75, s * 0.1, s * 0.05);
        ctx.fillStyle = '#a0785a'; ctx.fill(); ol();
        ctx.save();
        ctx.translate(s * 0.68, 0);
        BODY.star(ctx, s * 0.22, 0);
        ctx.fillStyle = color; ctx.fill(); ol();
        ctx.restore();
        break;
      case 'boomerang':
        ctx.beginPath();
        ctx.moveTo(-s * 0.3, -s * 0.4);
        ctx.quadraticCurveTo(s * 0.1, -s * 0.15, s * 0.35, 0);
        ctx.quadraticCurveTo(s * 0.1, s * 0.15, -s * 0.3, s * 0.4);
        ctx.lineWidth = s * 0.22; ctx.strokeStyle = OL; ctx.lineCap = 'round'; ctx.stroke();
        ctx.lineWidth = s * 0.22 - lw * 1.4; ctx.strokeStyle = color; ctx.stroke();
        break;
      case 'watergun':
        U.roundRect(ctx, -s * 0.2, -s * 0.15, s * 0.8, s * 0.26, s * 0.12);
        ctx.fillStyle = color; ctx.fill(); ol();
        U.roundRect(ctx, s * 0.55, -s * 0.08, s * 0.25, s * 0.12, s * 0.05);
        ctx.fillStyle = U.shade(color, -0.25); ctx.fill(); ol();
        U.roundRect(ctx, -s * 0.12, s * 0.05, s * 0.16, s * 0.32, s * 0.06);
        ctx.fillStyle = U.shade(color, -0.25); ctx.fill(); ol();
        circ(ctx, s * 0.15, -s * 0.28, s * 0.17);
        ctx.fillStyle = '#9be7ff'; ctx.fill(); ol();
        break;
    }
  }

  // 아이템 아이콘(장비 슬롯별 실루엣). 중심 (0,0), 크기 s
  function gear(ctx, slot, variant, color, gem, s) {
    const lw = Math.max(1.4, s * 0.06);
    const ol = () => { ctx.lineWidth = lw; ctx.strokeStyle = OL; ctx.lineJoin = 'round'; ctx.stroke(); };
    const gemDot = (x, y, rr) => { circ(ctx, x, y, rr); ctx.fillStyle = gem; ctx.fill(); ol(); circ(ctx, x - rr * 0.3, y - rr * 0.3, rr * 0.35); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill(); };
    if (slot === 'hat') {
      if (variant === 3) { // 왕관
        ctx.beginPath();
        ctx.moveTo(-s * 0.4, s * 0.2); ctx.lineTo(-s * 0.42, -s * 0.2); ctx.lineTo(-s * 0.2, 0); ctx.lineTo(0, -s * 0.32);
        ctx.lineTo(s * 0.2, 0); ctx.lineTo(s * 0.42, -s * 0.2); ctx.lineTo(s * 0.4, s * 0.2); ctx.closePath();
        ctx.fillStyle = color; ctx.fill(); ol();
        gemDot(0, s * 0.06, s * 0.08);
      } else if (variant === 2) { // 투구
        ctx.beginPath();
        ctx.moveTo(-s * 0.4, s * 0.25);
        ctx.bezierCurveTo(-s * 0.45, -s * 0.4, s * 0.45, -s * 0.4, s * 0.4, s * 0.25);
        ctx.closePath();
        ctx.fillStyle = color; ctx.fill(); ol();
        ctx.fillStyle = OL;
        ctx.fillRect(-s * 0.25, s * 0.02, s * 0.5, s * 0.07);
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.25); ctx.quadraticCurveTo(-s * 0.3, -s * 0.5, -s * 0.4, -s * 0.3);
        ctx.quadraticCurveTo(-s * 0.2, -s * 0.32, 0, -s * 0.25);
        ctx.fillStyle = gem; ctx.fill(); ol();
      } else if (variant === 1) { // 두건
        ctx.beginPath();
        ctx.moveTo(-s * 0.38, s * 0.32);
        ctx.quadraticCurveTo(-s * 0.45, -s * 0.38, 0, -s * 0.4);
        ctx.quadraticCurveTo(s * 0.45, -s * 0.38, s * 0.38, s * 0.32);
        ctx.quadraticCurveTo(0, s * 0.1, -s * 0.38, s * 0.32);
        ctx.fillStyle = color; ctx.fill(); ol();
        gemDot(0, -s * 0.15, s * 0.07);
      } else { // 모자
        ell(ctx, 0, s * 0.15, s * 0.45, s * 0.12);
        ctx.fillStyle = U.shade(color, -0.15); ctx.fill(); ol();
        ctx.beginPath();
        ctx.moveTo(-s * 0.3, s * 0.15);
        ctx.bezierCurveTo(-s * 0.35, -s * 0.4, s * 0.35, -s * 0.4, s * 0.3, s * 0.15);
        ctx.closePath();
        ctx.fillStyle = color; ctx.fill(); ol();
        gemDot(s * 0.15, -s * 0.05, s * 0.07);
      }
    } else if (slot === 'armor') {
      ctx.beginPath();
      if (variant === 1) { // 망토
        ctx.moveTo(-s * 0.15, -s * 0.35); ctx.lineTo(s * 0.15, -s * 0.35);
        ctx.lineTo(s * 0.42, s * 0.38); ctx.quadraticCurveTo(0, s * 0.45, -s * 0.42, s * 0.38);
      } else if (variant === 3) { // 로브
        ctx.moveTo(-s * 0.22, -s * 0.38); ctx.lineTo(s * 0.22, -s * 0.38); ctx.lineTo(s * 0.32, -s * 0.1);
        ctx.lineTo(s * 0.38, s * 0.42); ctx.lineTo(-s * 0.38, s * 0.42); ctx.lineTo(-s * 0.32, -s * 0.1);
      } else { // 조끼/갑옷
        ctx.moveTo(-s * 0.2, -s * 0.38); ctx.lineTo(-s * 0.42, -s * 0.25); ctx.lineTo(-s * 0.35, s * 0.05);
        ctx.lineTo(-s * 0.3, s * 0.38); ctx.lineTo(s * 0.3, s * 0.38); ctx.lineTo(s * 0.35, s * 0.05);
        ctx.lineTo(s * 0.42, -s * 0.25); ctx.lineTo(s * 0.2, -s * 0.38); ctx.quadraticCurveTo(0, -s * 0.2, -s * 0.2, -s * 0.38);
      }
      ctx.closePath();
      ctx.fillStyle = color; ctx.fill(); ol();
      if (variant === 2) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(-s * 0.22, -s * 0.12, s * 0.12, s * 0.35);
      }
      gemDot(0, -s * 0.08, s * 0.08);
    } else if (slot === 'shoes') {
      const h = variant === 0 || variant === 3 ? 0.42 : 0.22;
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, -s * h);
      ctx.lineTo(s * 0.02, -s * h);
      ctx.lineTo(s * 0.05, s * 0.08);
      ctx.quadraticCurveTo(s * 0.42, s * 0.08, s * 0.42, s * 0.3);
      ctx.lineTo(-s * 0.32, s * 0.3);
      ctx.closePath();
      ctx.fillStyle = color; ctx.fill(); ol();
      ctx.fillStyle = U.shade(color, -0.3);
      ctx.fillRect(-s * 0.32, s * 0.22, s * 0.74, s * 0.08);
      if (variant === 2) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw * 0.8;
        ctx.beginPath(); ctx.moveTo(-s * 0.15, -s * 0.1); ctx.lineTo(0, -s * 0.05); ctx.moveTo(-s * 0.15, s * 0.0); ctx.lineTo(0, s * 0.05); ctx.stroke();
      }
      gemDot(-s * 0.12, -s * h + s * 0.12, s * 0.06);
    } else if (slot === 'acc') {
      if (variant === 1) { // 목걸이
        ctx.beginPath();
        ctx.arc(0, -s * 0.15, s * 0.3, 0.2, Math.PI - 0.2);
        ctx.lineWidth = s * 0.06; ctx.strokeStyle = color; ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, s * 0.05); ctx.lineTo(s * 0.14, s * 0.2); ctx.lineTo(0, s * 0.38); ctx.lineTo(-s * 0.14, s * 0.2); ctx.closePath();
        ctx.fillStyle = gem; ctx.fill(); ol();
      } else if (variant === 2) { // 방울
        circ(ctx, 0, s * 0.05, s * 0.28);
        ctx.fillStyle = color; ctx.fill(); ol();
        ctx.fillStyle = OL;
        ctx.fillRect(-s * 0.15, s * 0.12, s * 0.3, s * 0.05);
        circ(ctx, 0, s * 0.22, s * 0.05); ctx.fill();
        gemDot(0, -s * 0.28, s * 0.07);
      } else if (variant === 3) { // 브로치
        gearPath(ctx, s * 0.32, 6);
        ctx.fillStyle = color; ctx.fill(); ol();
        gemDot(0, 0, s * 0.15);
      } else { // 반지
        circ(ctx, 0, s * 0.08, s * 0.26);
        ctx.lineWidth = s * 0.14; ctx.strokeStyle = OL; ctx.stroke();
        ctx.lineWidth = s * 0.14 - lw * 1.4; ctx.strokeStyle = color; ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.38); ctx.lineTo(s * 0.15, -s * 0.22); ctx.lineTo(0, -s * 0.1); ctx.lineTo(-s * 0.15, -s * 0.22); ctx.closePath();
        ctx.fillStyle = gem; ctx.fill(); ol();
      }
    }
  }

  // ── 장애물 (지면 기준점 x, y / 충돌 반지름 r) ─────────────
  function obstacle(ctx, kind, x, y, r, seed, t) {
    ctx.save();
    ctx.translate(x, y);
    ell(ctx, 0, r * 0.35, r * 1.05, r * 0.42);
    ctx.fillStyle = 'rgba(40,20,60,0.18)';
    ctx.fill();
    const lw = Math.max(1.8, r * 0.1);
    const ol = () => { ctx.lineWidth = lw; ctx.strokeStyle = OL; ctx.lineJoin = 'round'; ctx.stroke(); };
    const blob = (bx, by, br, col) => { circ(ctx, bx, by, br); ctx.fillStyle = col; ctx.fill(); ol(); };
    const hl = (hx, hy, hr) => { ell(ctx, hx, hy, hr, hr * 0.6, -0.5); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill(); };
    switch (kind) {
      case 'bush':
        blob(-r * 0.5, -r * 0.1, r * 0.6, '#5fbf6a');
        blob(r * 0.5, -r * 0.1, r * 0.6, '#5fbf6a');
        blob(0, -r * 0.5, r * 0.72, '#6fd07a');
        hl(-r * 0.2, -r * 0.8, r * 0.25);
        ctx.fillStyle = '#ff6b8b';
        circ(ctx, r * 0.35, -r * 0.35, r * 0.1); ctx.fill();
        circ(ctx, -r * 0.4, -r * 0.05, r * 0.1); ctx.fill();
        break;
      case 'rock':
      case 'sandrock':
      case 'snowrock':
      case 'lavarock': {
        const col = { rock: '#b7b0c4', sandrock: '#d9b77a', snowrock: '#a9b8cc', lavarock: '#6b4a5a' }[kind];
        ctx.beginPath();
        ctx.moveTo(-r * 0.95, r * 0.3);
        ctx.quadraticCurveTo(-r * 1.0, -r * 0.6, -r * 0.3, -r * 0.85);
        ctx.quadraticCurveTo(r * 0.4, -r * 1.1, r * 0.9, -r * 0.4);
        ctx.quadraticCurveTo(r * 1.1, r * 0.2, r * 0.8, r * 0.35);
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill(); ol();
        if (kind === 'snowrock') {
          ctx.beginPath();
          ctx.moveTo(-r * 0.75, -r * 0.45);
          ctx.quadraticCurveTo(-r * 0.4, -r * 1.0, r * 0.3, -r * 0.95);
          ctx.quadraticCurveTo(r * 0.8, -r * 0.7, r * 0.85, -r * 0.35);
          ctx.quadraticCurveTo(r * 0.3, -r * 0.5, 0, -r * 0.4);
          ctx.quadraticCurveTo(-r * 0.4, -r * 0.3, -r * 0.75, -r * 0.45);
          ctx.fillStyle = '#ffffff'; ctx.fill(); ol();
        } else if (kind === 'lavarock') {
          ctx.strokeStyle = '#ffb347'; ctx.lineWidth = lw * 1.1;
          ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.5); ctx.lineTo(-r * 0.1, -r * 0.2); ctx.lineTo(r * 0.3, -r * 0.4); ctx.stroke();
        }
        hl(-r * 0.35, -r * 0.55, r * 0.22);
        break;
      }
      case 'flower':
        ctx.beginPath(); ctx.moveTo(0, r * 0.3); ctx.lineTo(0, -r * 0.6); ctx.lineWidth = lw * 1.5; ctx.strokeStyle = OL; ctx.stroke();
        ctx.lineWidth = lw * 0.7; ctx.strokeStyle = '#6cc56f'; ctx.stroke();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU + t * 0.5;
          blob(Math.cos(a) * r * 0.4, -r * 0.8 + Math.sin(a) * r * 0.4, r * 0.3, '#ff9fc4');
        }
        blob(0, -r * 0.8, r * 0.25, '#ffd166');
        break;
      case 'lollipop':
        U.roundRect(ctx, -r * 0.08, -r * 0.7, r * 0.16, r * 1.0, r * 0.06);
        ctx.fillStyle = '#fffaf0'; ctx.fill(); ol();
        blob(0, -r * 1.0, r * 0.7, '#ff8fab');
        ctx.beginPath();
        for (let i = 0; i < 30; i++) {
          const a = i * 0.45, rr = r * 0.6 * (i / 30);
          ctx.lineTo(Math.cos(a) * rr, -r * 1.0 + Math.sin(a) * rr);
        }
        ctx.lineWidth = lw; ctx.strokeStyle = '#fff'; ctx.stroke();
        break;
      case 'candycane':
        ctx.beginPath();
        ctx.moveTo(0, r * 0.3); ctx.lineTo(0, -r * 0.9); ctx.arc(r * 0.35, -r * 0.9, r * 0.35, Math.PI, 0);
        ctx.lineWidth = r * 0.35; ctx.strokeStyle = OL; ctx.lineCap = 'round'; ctx.stroke();
        ctx.lineWidth = r * 0.35 - lw * 1.4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        ctx.setLineDash([r * 0.18, r * 0.18]); ctx.strokeStyle = '#ff4d6d'; ctx.stroke(); ctx.setLineDash([]);
        break;
      case 'cupcake':
        ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.2); ctx.lineTo(r * 0.6, -r * 0.2); ctx.lineTo(r * 0.45, r * 0.35); ctx.lineTo(-r * 0.45, r * 0.35); ctx.closePath();
        ctx.fillStyle = '#ffb3c6'; ctx.fill(); ol();
        blob(0, -r * 0.45, r * 0.65, '#fff3e0');
        blob(0, -r * 1.05, r * 0.18, '#ff3b5c');
        break;
      case 'cactus':
        U.roundRect(ctx, -r * 0.3, -r * 1.3, r * 0.6, r * 1.6, r * 0.3);
        ctx.fillStyle = '#6cc56f'; ctx.fill(); ol();
        U.roundRect(ctx, -r * 0.8, -r * 0.9, r * 0.3, r * 0.6, r * 0.15);
        ctx.fill(); ol();
        U.roundRect(ctx, r * 0.5, -r * 1.05, r * 0.3, r * 0.55, r * 0.15);
        ctx.fill(); ol();
        blob(0, -r * 1.35, r * 0.15, '#ff8fab');
        break;
      case 'pillar':
      case 'darkpillar': {
        const col = kind === 'pillar' ? '#f1e3c4' : '#5a4a7a';
        U.roundRect(ctx, -r * 0.55, -r * 1.5, r * 1.1, r * 1.8, r * 0.15);
        ctx.fillStyle = col; ctx.fill(); ol();
        U.roundRect(ctx, -r * 0.75, -r * 1.65, r * 1.5, r * 0.3, r * 0.1);
        ctx.fill(); ol();
        ctx.strokeStyle = U.shade(col, -0.2); ctx.lineWidth = lw * 0.8;
        ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 1.3); ctx.lineTo(-r * 0.2, r * 0.1); ctx.moveTo(r * 0.2, -r * 1.3); ctx.lineTo(r * 0.2, r * 0.1); ctx.stroke();
        break;
      }
      case 'pine':
        U.roundRect(ctx, -r * 0.15, -r * 0.2, r * 0.3, r * 0.5, r * 0.05);
        ctx.fillStyle = '#8a5a44'; ctx.fill(); ol();
        for (let i = 0; i < 3; i++) {
          const yy = -r * 0.3 - i * r * 0.55, w = r * (1.0 - i * 0.25);
          ctx.beginPath(); ctx.moveTo(-w, yy); ctx.lineTo(0, yy - r * 0.8); ctx.lineTo(w, yy); ctx.closePath();
          ctx.fillStyle = '#4fae8a'; ctx.fill(); ol();
          ctx.beginPath(); ctx.moveTo(-w * 0.5, yy - r * 0.4); ctx.lineTo(0, yy - r * 0.8); ctx.lineTo(w * 0.5, yy - r * 0.4); ctx.closePath();
          ctx.fillStyle = '#ffffff'; ctx.fill();
        }
        break;
      case 'icecrystal':
      case 'crystal':
      case 'shadowcrystal': {
        const col = { icecrystal: '#9be7ff', crystal: '#c3a6ff', shadowcrystal: '#7b5ea7' }[kind];
        for (const [cx, h, w] of [[-r * 0.45, 1.0, 0.32], [r * 0.45, 0.85, 0.3], [0, 1.5, 0.42]]) {
          ctx.beginPath();
          ctx.moveTo(cx - r * w, r * 0.2); ctx.lineTo(cx - r * w, -r * h * 0.7); ctx.lineTo(cx, -r * h * 1.1);
          ctx.lineTo(cx + r * w, -r * h * 0.7); ctx.lineTo(cx + r * w, r * 0.2); ctx.closePath();
          ctx.fillStyle = col; ctx.fill(); ol();
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fillRect(cx - r * w * 0.6, -r * h * 0.6, r * w * 0.35, r * h * 0.6);
        }
        if (kind === 'shadowcrystal') {
          const g = 0.4 + Math.sin(t * 3 + seed) * 0.3;
          circ(ctx, 0, -r * 0.8, r * 0.9);
          ctx.fillStyle = `rgba(190,140,255,${g * 0.25})`; ctx.fill();
        }
        break;
      }
      case 'vent':
        ctx.beginPath(); ctx.moveTo(-r * 0.95, r * 0.3); ctx.lineTo(-r * 0.35, -r * 0.7); ctx.lineTo(r * 0.35, -r * 0.7); ctx.lineTo(r * 0.95, r * 0.3); ctx.closePath();
        ctx.fillStyle = '#8a5a5a'; ctx.fill(); ol();
        ell(ctx, 0, -r * 0.7, r * 0.35, r * 0.12);
        ctx.fillStyle = '#ff9f1c'; ctx.fill(); ol();
        flame(ctx, 0, -r * 0.95, r * 0.22, t + seed);
        break;
      case 'bookshelf':
        U.roundRect(ctx, -r * 0.9, -r * 1.6, r * 1.8, r * 1.9, r * 0.12);
        ctx.fillStyle = '#8a5a44'; ctx.fill(); ol();
        for (let row = 0; row < 3; row++) {
          for (let i = 0; i < 5; i++) {
            const cols = ['#ff8fab', '#7ed9c3', '#ffd166', '#8ecbff', '#b9a6ff'];
            ctx.fillStyle = cols[(i + row + seed) % 5];
            ctx.fillRect(-r * 0.75 + i * r * 0.3, -r * 1.45 + row * r * 0.58, r * 0.24, r * 0.45);
          }
        }
        break;
      case 'candelabra':
        U.roundRect(ctx, -r * 0.08, -r * 1.0, r * 0.16, r * 1.3, r * 0.05);
        ctx.fillStyle = '#f2c14e'; ctx.fill(); ol();
        ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 1.0); ctx.quadraticCurveTo(0, -r * 0.6, r * 0.6, -r * 1.0);
        ctx.lineWidth = lw * 1.5; ctx.strokeStyle = OL; ctx.stroke(); ctx.lineWidth = lw * 0.6; ctx.strokeStyle = '#f2c14e'; ctx.stroke();
        for (const cx of [-r * 0.6, 0, r * 0.6]) {
          U.roundRect(ctx, cx - r * 0.1, -r * 1.35, r * 0.2, r * 0.35, r * 0.04);
          ctx.fillStyle = '#fff6e5'; ctx.fill(); ol();
          flame(ctx, cx, -r * 1.42, r * 0.13, t + cx);
        }
        break;
      case 'gear':
        ctx.save();
        ctx.translate(0, -r * 0.5);
        ctx.rotate(t * 0.5 + seed);
        gearPath(ctx, r * 0.95, 9);
        ctx.fillStyle = '#c9a227'; ctx.fill(); ol();
        circ(ctx, 0, 0, r * 0.3); ctx.fillStyle = '#7a6a4f'; ctx.fill(); ol();
        ctx.restore();
        break;
      case 'crate':
        U.roundRect(ctx, -r * 0.85, -r * 1.2, r * 1.7, r * 1.5, r * 0.12);
        ctx.fillStyle = '#d9a066'; ctx.fill(); ol();
        ctx.beginPath(); ctx.moveTo(-r * 0.85, -r * 1.2); ctx.lineTo(r * 0.85, r * 0.3); ctx.moveTo(r * 0.85, -r * 1.2); ctx.lineTo(-r * 0.85, r * 0.3);
        ctx.lineWidth = lw; ctx.strokeStyle = '#a0704a'; ctx.stroke();
        break;
      case 'blocks': {
        const cols = ['#ff6b8b', '#4fa3ff', '#ffd166'];
        const pos = [[-r * 0.5, -r * 0.2], [r * 0.45, -r * 0.2], [0, -r * 1.0]];
        pos.forEach(([bx, by], i) => {
          U.roundRect(ctx, bx - r * 0.42, by - r * 0.42, r * 0.84, r * 0.84, r * 0.12);
          ctx.fillStyle = cols[(i + seed) % 3]; ctx.fill(); ol();
          ctx.fillStyle = '#fff'; ctx.font = `bold ${r * 0.55}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('ABC'[i], bx, by + r * 0.03);
        });
        break;
      }
      case 'coral':
        for (const [cx, a] of [[-r * 0.4, -0.4], [r * 0.4, 0.4], [0, 0]]) {
          ctx.save(); ctx.translate(cx, r * 0.2); ctx.rotate(a);
          U.roundRect(ctx, -r * 0.18, -r * 1.3, r * 0.36, r * 1.4, r * 0.18);
          ctx.fillStyle = '#ff8fa3'; ctx.fill(); ol();
          ctx.restore();
        }
        blob(-r * 0.6, -r * 0.9, r * 0.18, '#ffb3c6');
        blob(r * 0.65, -r * 1.0, r * 0.18, '#ffb3c6');
        break;
      case 'shell':
        ctx.beginPath(); ctx.moveTo(-r * 0.9, r * 0.2); ctx.quadraticCurveTo(0, -r * 1.6, r * 0.9, r * 0.2); ctx.closePath();
        ctx.fillStyle = '#ffd6e0'; ctx.fill(); ol();
        ctx.strokeStyle = '#ff9fb5'; ctx.lineWidth = lw * 0.8;
        ctx.beginPath();
        for (let i = -2; i <= 2; i++) { ctx.moveTo(0, r * 0.15); ctx.lineTo(i * r * 0.35, -r * 0.6 + Math.abs(i) * r * 0.2); }
        ctx.stroke();
        break;
      case 'telescope':
        ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.3); ctx.lineTo(0, -r * 0.6); ctx.lineTo(r * 0.5, r * 0.3);
        ctx.lineWidth = lw * 1.4; ctx.strokeStyle = OL; ctx.stroke(); ctx.lineWidth = lw * 0.6; ctx.strokeStyle = '#a0785a'; ctx.stroke();
        ctx.save(); ctx.translate(0, -r * 0.7); ctx.rotate(-0.6);
        U.roundRect(ctx, -r * 0.8, -r * 0.22, r * 1.6, r * 0.44, r * 0.15);
        ctx.fillStyle = '#4f7cff'; ctx.fill(); ol();
        ctx.fillStyle = '#ffd23f'; ctx.fillRect(-r * 0.2, -r * 0.22, r * 0.12, r * 0.44);
        ctx.restore();
        break;
      default:
        blob(0, -r * 0.3, r, '#b7b0c4');
    }
    ctx.restore();
  }

  return { OL, creature, weapon, gear, obstacle, flame, gearPath, ell, circ, BODY };
})();
