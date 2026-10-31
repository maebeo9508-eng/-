'use strict';
// 파티클, 데미지 숫자, 화면 흔들림 같은 "손맛" 효과.
G.Fx = (function () {
  const U = G.U, TAU = U.TAU;
  const parts = [];
  const texts = [];
  const rings = [];
  const MAX_PARTS = 420;
  let shakeAmt = 0;

  function burst(x, y, color, n, speed, size, opts) {
    opts = opts || {};
    for (let i = 0; i < n; i++) {
      if (parts.length >= MAX_PARTS) parts.shift();
      const a = opts.angle != null ? opts.angle + U.rand(-opts.spread || -0.5, opts.spread || 0.5) : Math.random() * TAU;
      const sp = U.rand(0.35, 1) * speed;
      parts.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (opts.up || 0),
        life: U.rand(0.35, 0.7) * (opts.life || 1),
        max: 0,
        size: U.rand(0.6, 1) * size,
        color: Array.isArray(color) ? U.pick(color) : color,
        shape: opts.shape || 'dot',
        grav: opts.grav != null ? opts.grav : 0,
        drag: opts.drag != null ? opts.drag : 3,
        spin: U.rand(-6, 6),
        rot: Math.random() * TAU,
      });
      parts[parts.length - 1].max = parts[parts.length - 1].life;
    }
  }

  function text(x, y, str, color, size, opts) {
    opts = opts || {};
    if (!G.Save.data.settings.dmgText && !opts.force) return;
    if (texts.length > 60) texts.shift();
    texts.push({ x: x + U.rand(-6, 6), y, str, color, size: size || 12, life: opts.life || 0.75, max: opts.life || 0.75, vy: opts.vy || -38, crit: !!opts.crit });
  }

  function ring(x, y, r0, r1, color, life, width) {
    rings.push({ x, y, r0, r1, color, life, max: life, width: width || 3 });
  }

  function shake(a) { shakeAmt = Math.max(shakeAmt, a); }

  function update(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.life -= dt;
      if (t.life <= 0) { texts.splice(i, 1); continue; }
      t.y += t.vy * dt;
      t.vy *= Math.exp(-3 * dt);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].life -= dt;
      if (rings[i].life <= 0) rings.splice(i, 1);
    }
    shakeAmt = Math.max(0, shakeAmt - dt * 30);
  }

  function star(ctx, x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r;
      const a = rot + (i * Math.PI) / 5;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  function draw(ctx) {
    for (const g of rings) {
      const k = 1 - g.life / g.max;
      ctx.beginPath();
      ctx.arc(g.x, g.y, U.lerp(g.r0, g.r1, k), 0, TAU);
      ctx.lineWidth = g.width * (1 - k * 0.7);
      ctx.strokeStyle = g.color;
      ctx.globalAlpha = 1 - k;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const p of parts) {
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.fillStyle = p.color;
      const s = p.size * (0.4 + k * 0.6);
      if (p.shape === 'star') {
        star(ctx, p.x, p.y, s * 1.3, p.rot);
        ctx.fill();
      } else if (p.shape === 'heart') {
        ctx.font = `${s * 2.2}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('♥', p.x, p.y);
      } else if (p.shape === 'square') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-s, -s, s * 2, s * 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawTexts(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of texts) {
      const k = t.life / t.max;
      const pop = k > 0.8 ? 1 + (k - 0.8) * 2.5 : 1;
      const sz = t.size * pop;
      ctx.globalAlpha = Math.min(1, k * 2.5);
      ctx.font = `${sz}px Jua, "Apple SD Gothic Neo", sans-serif`;
      ctx.lineWidth = Math.max(2, sz * 0.22);
      ctx.strokeStyle = '#3b2a4d';
      ctx.lineJoin = 'round';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function clear() { parts.length = 0; texts.length = 0; rings.length = 0; shakeAmt = 0; }

  return {
    burst, text, ring, shake, update, draw, drawTexts, clear, star,
    get shakeAmt() { return shakeAmt; },
  };
})();
