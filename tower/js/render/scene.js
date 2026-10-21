'use strict';
// 화면 그리기: 탑 안(런) 장면과 마을(야영지) 장면
G.Scene = (function () {
  const U = G.U, TAU = U.TAU;
  const A = () => G.Art;
  const OL = '#3b2a4d';

  // ── 탑 안 ──────────────────────────────────────────────
  function drawRun(ctx, st, t) {
    const V = G.View;
    const dpr = V.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = U.shade(st.stage.wall, -0.45);
    ctx.fillRect(0, 0, V.w, V.h);

    const sh = G.Fx.shakeAmt;
    const sx = (Math.random() - 0.5) * sh, sy = (Math.random() - 0.5) * sh;
    const s = V.scale * dpr;
    ctx.setTransform(s, 0, 0, s, (-st.cam.x * V.scale + sx) * dpr, (-st.cam.y * V.scale + sy) * dpr);

    const a = st.arena;
    if (a.ground) ctx.drawImage(a.ground, 0, 0, a.w, a.h);
    G.World.drawWalls(ctx, a, st.stage);

    for (const pt of st.portals) drawPortal(ctx, pt, t);
    for (const z of st.zones) drawZone(ctx, z, t);
    for (const sp of st.spawns) drawSpawn(ctx, sp, t);
    for (const k of st.pickups) drawPickup(ctx, k, t);

    // y 정렬해서 그리기
    const list = [];
    for (const o of a.obstacles) {
      const img = G.Assets.icon('obs_' + o.kind);
      list.push({ y: o.y, f: img ? () => drawObstacleImg(ctx, img, o) : () => A().obstacle(ctx, o.kind, o.x, o.y, o.r, o.seed, t) });
    }
    for (const o of st.props) list.push({ y: o.y, f: () => drawProp(ctx, o, t) });
    for (const e of st.enemies) list.push({ y: e.y, f: () => drawEnemy(ctx, e) });
    for (const al of st.allies) list.push({ y: al.y, f: () => G.Allies.draw(ctx, al) });
    if (!st.player.dead) list.push({ y: st.player.y, f: () => G.Player.draw(ctx, st.player, st) });
    else list.push({ y: st.player.y, f: () => A().creature(ctx, Object.assign({}, G.HERO_LOOK, { eyes: 'x', mouth: 'o' }), st.player.x, st.player.y, st.player.r, { t, alpha: 0.5, face: st.player.face }) });
    list.sort((p, q) => p.y - q.y);
    for (const it of list) it.f();

    for (const w of st.swings) drawSwing(ctx, w);
    for (const b of st.projs) drawProj(ctx, b, t);
    for (const b of st.eprojs) drawEProj(ctx, b, t);
    for (const b of st.bolts) drawBolt(ctx, b);
    G.Fx.draw(ctx);
    for (const e of st.enemies) if ((e.elite || e.hp < e.maxHp) && !e.boss && !e.burrowed && e.spawnT <= 0) drawHpBar(ctx, e);
    G.Fx.drawTexts(ctx);

    // 화면 고정 요소
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const p = st.player;
    const low = p.hp / p.maxHp;
    if (st.hitFlash > 0 || low < 0.3) {
      const k = Math.max(st.hitFlash * 2, low < 0.3 ? (0.3 - low) * 1.5 * (0.6 + Math.sin(t * 6) * 0.4) : 0);
      const g = ctx.createRadialGradient(V.w / 2, V.h / 2, Math.min(V.w, V.h) * 0.35, V.w / 2, V.h / 2, Math.max(V.w, V.h) * 0.7);
      g.addColorStop(0, 'rgba(255,60,90,0)');
      g.addColorStop(1, `rgba(255,60,90,${Math.min(0.5, k)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, V.w, V.h);
    }
    if (!st.auto) drawJoystick(ctx);
    if (st.banner) drawBanner(ctx, st.banner);
    if (st.cutin) drawCutin(ctx, st.cutin);
  }

  // 궁극기 컷인: 화면을 가로지르는 띠 + 초상화 + 기술 이름
  function drawCutin(ctx, c) {
    const V = G.View;
    const k = c.t / c.max;
    const inK = Math.min(1, (1 - k) * 6);
    const outK = Math.min(1, k * 4);
    const a = Math.min(inK, outK);
    const y = V.h * 0.42, h = Math.min(120, V.h * 0.15);
    ctx.save();
    ctx.globalAlpha = a * 0.35;
    ctx.fillStyle = '#2b2350';
    ctx.fillRect(0, 0, V.w, V.h);
    ctx.globalAlpha = a;
    const slide = (1 - inK) * V.w * 0.6 - (1 - outK) * V.w * 0.6;
    ctx.translate(slide, 0);
    ctx.beginPath();
    ctx.moveTo(-20, y - h / 2 + 14);
    ctx.lineTo(V.w + 20, y - h / 2 - 14);
    ctx.lineTo(V.w + 20, y + h / 2 - 14);
    ctx.lineTo(-20, y + h / 2 + 14);
    ctx.closePath();
    ctx.fillStyle = c.color;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = OL;
    ctx.stroke();
    // 속도선
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const ly = y - h / 2 + 12 + i * (h - 24) / 6;
      const lx = ((c.t * 900 + i * 137) % (V.w + 200)) - 100;
      ctx.beginPath(); ctx.moveTo(V.w - lx, ly); ctx.lineTo(V.w - lx - 60, ly); ctx.stroke();
    }
    const ps = h * 1.25;
    if (c.img && c.img.complete) ctx.drawImage(c.img, V.w * 0.06, y - ps * 0.58, ps, ps);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const tx = V.w * 0.06 + ps + 6;
    ctx.font = `${Math.round(h * 0.2)}px Jua, sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = OL;
    ctx.strokeText(c.name, tx, y - h * 0.18);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(c.name, tx, y - h * 0.18);
    ctx.font = `${Math.round(h * 0.32)}px Jua, sans-serif`;
    ctx.lineWidth = 6;
    ctx.strokeText(c.skill, tx, y + h * 0.16);
    ctx.fillStyle = '#fff3b0';
    ctx.fillText(c.skill, tx, y + h * 0.16);
    ctx.restore();
  }

  // PNG 장애물: 충돌 원(지름)의 약 2.4배 높이로, 바닥 기준점에 맞춰 그림
  function drawObstacleImg(ctx, img, o) {
    const h = o.r * 3.2, w = h * (img.width / img.height);
    A().ell(ctx, o.x, o.y + o.r * 0.35, o.r * 1.05, o.r * 0.42);
    ctx.fillStyle = 'rgba(40,20,60,0.18)';
    ctx.fill();
    ctx.drawImage(img, o.x - w / 2, o.y + o.r * 0.5 - h, w, h);
  }

  function drawEnemy(ctx, e) {
    if (e.burrowed) {
      ctx.save();
      ctx.translate(e.x, e.y + e.r * 0.5);
      A().ell(ctx, 0, 0, e.r * 0.9, e.r * 0.4);
      ctx.fillStyle = 'rgba(160,120,70,0.45)';
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        A().circ(ctx, Math.sin(e.t * 9 + i * 2) * e.r * 0.6, -Math.abs(Math.cos(e.t * 7 + i)) * 4, 2.5);
        ctx.fillStyle = '#c9a26b'; ctx.fill();
      }
      ctx.restore();
      return;
    }
    let scale = 1;
    if (e.spawnT > 0) scale = 1 - e.spawnT / 0.35;
    const r = e.r * Math.max(0.05, scale);
    const state = e.flash > 0 ? 'hurt' : e.moving ? 'walk' : 'idle';
    const drawn = G.Assets.draw(ctx, e.type, state, e.t, e.x, e.y - (e.hop || 0) + r, r * 2.6, e.face < 0, e.alpha);
    if (!drawn) {
      A().creature(ctx, e.look, e.x, e.y, r, { t: e.t, moving: e.moving, face: e.face, flash: e.flash, seed: e.seed, alpha: e.alpha, elite: e.elite, hop: e.hop, squash: e.squash, lookX: 0, lookY: 0 });
    }
    if (e.frozenT > 0) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      U.roundRect(ctx, e.x - r * 1.15, e.y - r * 1.15, r * 2.3, r * 2.3, r * 0.3);
      ctx.fillStyle = '#bff4ff'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.restore();
    } else if (e.slowT > 0) {
      A().ell(ctx, e.x, e.y + r * 0.9, r, r * 0.3);
      ctx.strokeStyle = 'rgba(150,220,255,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (e.poison) {
      ctx.fillStyle = '#8be36b';
      for (let i = 0; i < e.poison.stacks; i++) { A().circ(ctx, e.x - 8 + i * 4, e.y - r - 8, 1.6); ctx.fill(); }
    }
    if (e.ai === 'charger' && e.s.state === 'stun') {
      for (let i = 0; i < 3; i++) {
        const a = e.t * 6 + (i * TAU) / 3;
        G.Fx.star(ctx, e.x + Math.cos(a) * r * 0.8, e.y - r * 1.1 + Math.sin(a) * 3, 3, a);
        ctx.fillStyle = '#ffe66d'; ctx.fill();
      }
    }
  }

  function drawHpBar(ctx, e) {
    const w = Math.max(20, e.r * 2), y = e.y - e.r * 1.6 - (e.hop || 0);
    ctx.fillStyle = 'rgba(59,42,77,0.75)';
    U.roundRect(ctx, e.x - w / 2 - 1, y - 1, w + 2, 5, 2.5); ctx.fill();
    ctx.fillStyle = e.elite ? '#ff9f1c' : '#ff6b8b';
    U.roundRect(ctx, e.x - w / 2, y, Math.max(0.1, w * (e.hp / e.maxHp)), 3, 1.5); ctx.fill();
  }

  function drawSpawn(ctx, s, t) {
    const k = 1 - s.t / s.max;
    const big = s.opts.boss ? 3 : s.opts.elite ? 1.6 : 1;
    ctx.save();
    ctx.translate(s.x, s.y + 8);
    ctx.globalAlpha = 0.4 + k * 0.6;
    A().ell(ctx, 0, 0, 14 * big * (0.5 + k * 0.5), 5 * big * (0.5 + k * 0.5));
    ctx.fillStyle = s.opts.elite || s.opts.boss ? 'rgba(255,120,60,0.45)' : 'rgba(255,255,255,0.5)';
    ctx.fill();
    G.Fx.star(ctx, 0, -10 * big - k * 8, 6 * big * (0.6 + k * 0.4), t * 4);
    ctx.fillStyle = s.opts.elite || s.opts.boss ? '#ffb347' : '#fff3b0';
    ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = OL; ctx.stroke();
    ctx.restore();
  }

  function drawZone(ctx, z, t) {
    if (z.kind === 'circle') {
      const k = Math.min(1, z.t / z.warn);
      if (z.t < z.warn) {
        const col = z.friendly ? '#ffd166' : z.color || '#ff4d6d';
        ctx.save();
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU);
        ctx.fillStyle = U.rgba(col.startsWith('#') ? col : '#ff4d6d', z.ghost ? 0.08 : 0.16);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.lineDashOffset = -t * 20;
        ctx.strokeStyle = U.rgba(col, 0.75);
        ctx.stroke();
        ctx.setLineDash([]);
        if (!z.ghost) {
          ctx.beginPath(); ctx.arc(z.x, z.y, z.r * k, 0, TAU);
          ctx.fillStyle = U.rgba(col, 0.25);
          ctx.fill();
        }
        if (z.meteor || z.star) {
          const h = (1 - k) * 220;
          if (z.star) { G.Fx.star(ctx, z.x, z.y - h, 10, t * 6); ctx.fillStyle = '#ffe66d'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OL; ctx.stroke(); }
          else {
            ctx.beginPath(); ctx.arc(z.x + h * 0.3, z.y - h, z.big ? 18 : 10, 0, TAU);
            ctx.fillStyle = '#ff9f1c'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OL; ctx.stroke();
            ctx.beginPath(); ctx.arc(z.x + h * 0.3 - 3, z.y - h - 3, z.big ? 7 : 4, 0, TAU);
            ctx.fillStyle = '#ffe66d'; ctx.fill();
          }
        }
        ctx.restore();
      } else {
        const f = 1 - (z.t - z.warn) / 0.2;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU);
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, f) * 0.5})`;
        ctx.fill();
      }
    } else if (z.kind === 'line' || z.kind === 'rotline') {
      ctx.save();
      ctx.translate(z.x, z.y);
      ctx.rotate(z.ang);
      const col = z.color || '#ff4d6d';
      if (z.t < z.warn) {
        ctx.fillStyle = z.ghost ? 'rgba(255,255,255,0.18)' : U.rgba(col, 0.18 + 0.12 * Math.sin(t * 20));
        ctx.fillRect(0, -z.w / 2, z.len, z.w);
        if (!z.ghost) {
          ctx.fillStyle = U.rgba(col, 0.6);
          ctx.fillRect(0, -1, z.len, 2);
        }
      } else if (z.dmg > 0) {
        const w = z.w * (0.9 + Math.sin(t * 50) * 0.1);
        ctx.fillStyle = U.rgba(col, 0.55);
        ctx.fillRect(0, -w / 2 - 3, z.len, w + 6);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fillRect(0, -w / 4, z.len, w / 2);
      }
      ctx.restore();
    } else if (z.kind === 'hazard') {
      const k = Math.min(1, z.life / z.max * 2);
      ctx.save();
      ctx.globalAlpha = 0.75 * k;
      A().ell(ctx, z.x, z.y, z.r, z.r * 0.6);
      if (z.type === 'ink') { ctx.fillStyle = '#4b4482'; ctx.fill(); }
      else {
        ctx.fillStyle = '#ff7b54'; ctx.fill();
        A().ell(ctx, z.x, z.y, z.r * 0.55, z.r * 0.3);
        ctx.fillStyle = '#ffd166'; ctx.fill();
        if (Math.random() < 0.05) G.Fx.burst(z.x + U.rand(-z.r, z.r) * 0.6, z.y, ['#ff9f1c', '#ffd166'], 1, 20, 2, { up: 40 });
      }
      ctx.restore();
    }
  }

  function drawSwing(ctx, w) {
    const k = w.t / w.max;
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 1.8);
    if (w.thrust) {
      ctx.translate(w.x, w.y);
      ctx.rotate(w.ang);
      ctx.beginPath();
      ctx.moveTo(10, -w.w / 2);
      ctx.lineTo(w.r, 0);
      ctx.lineTo(10, w.w / 2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fill();
    } else {
      const a0 = w.ang - w.arc / 2, a1 = w.ang + w.arc / 2;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, a0, a1);
      ctx.arc(w.x, w.y, w.r * 0.55, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = w.spin ? 'rgba(190,244,255,0.5)' : 'rgba(255,255,255,0.6)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, a0, a1);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawProj(ctx, b, t) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    switch (b.type) {
      case 'arrow':
        ctx.lineWidth = 3.5; ctx.strokeStyle = OL;
        ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(6, 0); ctx.stroke();
        ctx.lineWidth = 1.8; ctx.strokeStyle = '#fffaf0'; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(3, -4); ctx.lineTo(3, 4); ctx.closePath();
        ctx.fillStyle = '#e9edf5'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = OL; ctx.stroke();
        ctx.fillStyle = '#ff8fab'; ctx.fillRect(-11, -3, 4, 6);
        break;
      case 'orb':
        ctx.beginPath(); ctx.arc(0, 0, b.r + 4, 0, TAU); ctx.fillStyle = U.rgba(b.color || '#b48cff', 0.3); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fillStyle = b.color || '#d4b8ff'; ctx.fill();
        ctx.lineWidth = 1.8; ctx.strokeStyle = OL; ctx.stroke();
        ctx.beginPath(); ctx.arc(-1.5, -1.5, b.r * 0.4, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
        break;
      case 'boomerang': {
        const st = G.Run.st;
        const it = st.rs.weaponItem;
        A().weapon(ctx, 'boomerang', it ? G.THEMES[it.theme].color : '#a0785a', b.r * 2.4);
        break;
      }
      case 'lightarrow': {
        const g = ctx.createLinearGradient(-40, 0, 10, 0);
        g.addColorStop(0, 'rgba(255,240,170,0)');
        g.addColorStop(1, 'rgba(255,250,220,0.95)');
        ctx.fillStyle = g;
        ctx.fillRect(-40, -4, 50, 8);
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(4, -6); ctx.lineTo(4, 6); ctx.closePath();
        ctx.fillStyle = '#fff3b0'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = OL; ctx.stroke();
        break;
      }
      case 'water':
        ctx.beginPath(); ctx.ellipse(0, 0, 6, 3.5, 0, 0, TAU);
        ctx.fillStyle = 'rgba(150,220,255,0.9)'; ctx.fill();
        ctx.lineWidth = 1.2; ctx.strokeStyle = '#4fa3ff'; ctx.stroke();
        break;
      case 'wave':
        ctx.beginPath();
        ctx.arc(-b.r, 0, b.r * 1.4, -1.1, 1.1);
        ctx.arc(-b.r * 1.6, 0, b.r * 1.5, 0.9, -0.9, true);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(190,244,255,0.9)'; ctx.stroke();
        break;
      case 'fire':
        ctx.rotate(-b.rot);
        A().flame(ctx, 0, 0, b.r * 0.9, t + b.t);
        break;
      case 'feather':
        ctx.beginPath(); ctx.ellipse(0, 0, 8, 3, 0, 0, TAU);
        ctx.fillStyle = b.color || '#f2dcc2'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = OL; ctx.stroke();
        break;
      case 'cream':
        ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fillStyle = '#fff6ee'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = OL; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -b.r * 0.6, b.r * 0.35, 0, TAU); ctx.fillStyle = '#ff3b5c'; ctx.fill();
        break;
      default:
        ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fillStyle = b.color || '#ffffff'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = OL; ctx.stroke();
    }
    ctx.restore();
  }

  function drawEProj(ctx, b, t) {
    ctx.save();
    ctx.translate(b.x, b.y);
    const r = b.r;
    // 적 탄환은 붉은 테두리로 눈에 잘 띄게
    ctx.beginPath(); ctx.arc(0, 0, r + 2.5, 0, TAU);
    ctx.fillStyle = 'rgba(255,77,109,0.35)'; ctx.fill();
    switch (b.type) {
      case 'spike':
        ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.beginPath(); ctx.moveTo(r * 1.5, 0); ctx.lineTo(-r, -r * 0.8); ctx.lineTo(-r * 0.4, 0); ctx.lineTo(-r, r * 0.8); ctx.closePath();
        ctx.fillStyle = b.color; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = OL; ctx.stroke();
        break;
      case 'fire':
        A().flame(ctx, 0, 0, r * 0.9, t + b.t);
        break;
      case 'page':
        ctx.rotate(b.rot);
        ctx.fillStyle = b.color; ctx.fillRect(-r, -r * 0.75, r * 2, r * 1.5);
        ctx.lineWidth = 1.5; ctx.strokeStyle = OL; ctx.strokeRect(-r, -r * 0.75, r * 2, r * 1.5);
        ctx.fillStyle = '#b9a6ff'; ctx.fillRect(-r * 0.6, -r * 0.3, r * 1.2, 1.2); ctx.fillRect(-r * 0.6, r * 0.15, r * 1.2, 1.2);
        break;
      case 'bubble':
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = 'rgba(200,240,255,0.55)'; ctx.fill();
        ctx.lineWidth = 1.8; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.35, r * 0.25, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
        break;
      case 'star':
        G.Fx.star(ctx, 0, 0, r * 1.3, b.rot);
        ctx.fillStyle = b.color; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = OL; ctx.stroke();
        break;
      case 'feather':
        ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.beginPath(); ctx.ellipse(0, 0, r * 1.7, r * 0.7, 0, 0, TAU);
        ctx.fillStyle = b.color; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = OL; ctx.stroke();
        break;
      default:
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
        ctx.fillStyle = b.color; ctx.fill();
        ctx.lineWidth = 1.8; ctx.strokeStyle = OL; ctx.stroke();
        ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.35, r * 0.35, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    }
    ctx.restore();
  }

  function drawBolt(ctx, b) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, b.t * 6);
    ctx.beginPath();
    ctx.moveTo(b.x1, b.y1);
    const n = 6;
    for (let i = 1; i < n; i++) {
      const k = i / n;
      ctx.lineTo(U.lerp(b.x1, b.x2, k) + U.rand(-8, 8), U.lerp(b.y1, b.y2, k) + U.rand(-8, 8));
    }
    ctx.lineTo(b.x2, b.y2);
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(185,166,255,0.7)'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.restore();
  }

  function drawPickup(ctx, k, t) {
    const bob = Math.sin(t * 5 + k.x) * 2;
    ctx.save();
    ctx.translate(k.x, k.y + bob);
    switch (k.type) {
      case 'exp': {
        const s = k.val >= 10 ? 6 : k.val >= 4 ? 5 : 4;
        ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.lineTo(s, 0); ctx.lineTo(0, s * 1.3); ctx.lineTo(-s, 0); ctx.closePath();
        ctx.fillStyle = k.val >= 10 ? '#c3a6ff' : '#7ee0ff'; ctx.fill();
        ctx.lineWidth = 1.6; ctx.strokeStyle = OL; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(-s * 0.35, -s * 0.6, s * 0.3, s * 0.6);
        break;
      }
      case 'gold':
        ctx.scale(Math.abs(Math.cos(t * 4 + k.y)) * 0.6 + 0.4, 1);
        ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, TAU); ctx.fillStyle = '#ffd23f'; ctx.fill();
        ctx.lineWidth = 1.6; ctx.strokeStyle = OL; ctx.stroke();
        ctx.fillStyle = '#fff3b0'; ctx.fillRect(-1, -3, 2, 6);
        break;
      case 'heart':
        ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff6b8b'; ctx.fillText('♥', 0, 0);
        break;
      case 'gem':
        ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(6, -2); ctx.lineTo(0, 7); ctx.lineTo(-6, -2); ctx.closePath();
        ctx.fillStyle = '#ff8fd0'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = OL; ctx.stroke();
        break;
      case 'item': {
        const col = G.RARITIES[k.val.rar].color;
        ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fillStyle = U.rgba(col, 0.3); ctx.fill();
        if (k.val.rar >= 3) { ctx.fillStyle = U.rgba(col, 0.25); ctx.fillRect(-5, -60, 10, 60); }
        ctx.save(); ctx.scale(0.9, 0.9);
        if (k.val.slot === 'weapon') { ctx.rotate(-0.8); A().weapon(ctx, k.val.wtype, G.THEMES[k.val.theme].color, 18); }
        else A().gear(ctx, k.val.slot, k.val.variant, G.THEMES[k.val.theme].color, col, 22);
        ctx.restore();
        break;
      }
      case 'rune': {
        const def = G.RUNE_TYPES[k.val.type];
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8); }
        ctx.closePath();
        ctx.fillStyle = '#5a4a7a'; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = OL; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, TAU); ctx.fillStyle = def.color; ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  function drawProp(ctx, o, t) {
    if (o.kind === 'chest') {
      const col = G.RARITIES[Math.min(5, o.rar)].color;
      ctx.save();
      ctx.translate(o.x, o.y);
      A().ell(ctx, 0, 10, 18, 6); ctx.fillStyle = 'rgba(40,20,60,0.2)'; ctx.fill();
      if (!o.opened) {
        const g = 0.5 + Math.sin(t * 4) * 0.5;
        ctx.fillStyle = U.rgba(col, 0.15 + g * 0.15);
        ctx.fillRect(-10, -70, 20, 70);
      }
      U.roundRect(ctx, -15, -6, 30, 18, 4);
      ctx.fillStyle = '#d9a066'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OL; ctx.stroke();
      ctx.save();
      if (o.opened) { ctx.translate(0, -6); ctx.rotate(-0.6); ctx.translate(0, 6); }
      ctx.beginPath(); ctx.moveTo(-15, -6); ctx.quadraticCurveTo(0, -22, 15, -6); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.stroke();
      ctx.restore();
      U.roundRect(ctx, -4, -9, 8, 9, 2); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = 1.8; ctx.stroke();
      ctx.restore();
    } else if (o.kind === 'fountain') {
      ctx.save();
      ctx.translate(o.x, o.y);
      A().ell(ctx, 0, 6, 34, 14); ctx.fillStyle = '#c9d3e6'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OL; ctx.stroke();
      A().ell(ctx, 0, 4, 26, 9); ctx.fillStyle = o.used ? '#a9c9e6' : '#8fd3ff'; ctx.fill();
      U.roundRect(ctx, -6, -26, 12, 30, 4); ctx.fillStyle = '#c9d3e6'; ctx.fill(); ctx.stroke();
      if (!o.used) {
        for (let i = 0; i < 2; i++) if (Math.random() < 0.5) G.Fx.burst(o.x, o.y - 28, ['#bff4ff', '#ffffff'], 1, 60, 2.5, { grav: 200, up: 90 });
        G.Fx.star(ctx, 0, -40 + Math.sin(t * 3) * 3, 6, t);
        ctx.fillStyle = '#fff3b0'; ctx.fill();
      }
      ctx.restore();
    } else if (o.kind === 'merchant') {
      A().creature(ctx, G.COMPANIONS.neogul.look, o.x, o.y, 14, { t, moving: false, face: 1, seed: 1 });
      ctx.save();
      ctx.translate(o.x, o.y - 38);
      U.roundRect(ctx, -22, -10, 44, 18, 6);
      ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OL; ctx.stroke();
      ctx.font = '11px Jua, sans-serif'; ctx.fillStyle = OL; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('상점', 0, 0);
      ctx.restore();
    } else if (o.kind === 'shrine') {
      ctx.save();
      ctx.translate(o.x, o.y);
      A().ell(ctx, 0, 10, 26, 9); ctx.fillStyle = 'rgba(40,20,60,0.2)'; ctx.fill();
      U.roundRect(ctx, -16, -12, 32, 22, 5); ctx.fillStyle = '#d8ccff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OL; ctx.stroke();
      const y = -34 + Math.sin(t * 2.5) * 4;
      if (!o.used) { ctx.beginPath(); ctx.arc(0, y, 22, 0, TAU); ctx.fillStyle = 'rgba(255,243,176,0.3)'; ctx.fill(); }
      G.Fx.star(ctx, 0, y, 13, t * 0.8);
      ctx.fillStyle = o.used ? '#c9c2d9' : '#ffe66d'; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();
    }
  }

  function drawPortal(ctx, pt, t) {
    const def = G.PORTALS[pt.type];
    ctx.save();
    ctx.translate(pt.x, pt.y);
    const pulse = 1 + Math.sin(t * 3 + pt.t) * 0.05;
    ctx.scale(pulse, pulse);
    A().ell(ctx, 0, 6, 28, 11);
    ctx.fillStyle = U.rgba(def.color, 0.35); ctx.fill();
    ctx.save();
    ctx.scale(1, 0.42);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 14, 26 - i * 7, t * (2 + i) , t * (2 + i) + Math.PI * 1.4);
      ctx.lineWidth = 5; ctx.strokeStyle = i % 2 ? '#ffffff' : def.color; ctx.stroke();
    }
    ctx.restore();
    // 빛기둥
    const g = ctx.createLinearGradient(0, 0, 0, -56);
    g.addColorStop(0, U.rgba(def.color, 0.55));
    g.addColorStop(1, U.rgba(def.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-20, -56, 40, 62);
    U.roundRect(ctx, -17, -44 + Math.sin(t * 3 + pt.t) * 3, 34, 30, 10);
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OL; ctx.stroke();
    ctx.font = '18px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.icon, 0, -28 + Math.sin(t * 3 + pt.t) * 3);
    ctx.font = '12px Jua, sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = OL;
    ctx.strokeText(def.name, 0, 26);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(def.name, 0, 26);
    ctx.restore();
  }

  function drawJoystick(ctx) {
    const j = G.Input.joy;
    if (!j.active) return;
    const R = G.Input.radius;
    ctx.beginPath(); ctx.arc(j.ox, j.oy, R, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke();
    let dx = j.x - j.ox, dy = j.y - j.oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    ctx.beginPath(); ctx.arc(j.ox + dx, j.oy + dy, R * 0.45, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(59,42,77,0.5)'; ctx.stroke();
  }

  function drawBanner(ctx, b) {
    const V = G.View;
    const k = b.t / b.max;
    const a = Math.min(1, k * 4, (1 - k) * 6);
    ctx.save();
    ctx.globalAlpha = a;
    const y = V.h * (b.small ? 0.42 : 0.4) - (1 - a) * 12;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const big = b.small ? 30 : b.boss ? 30 : 40;
    ctx.font = `${big}px Jua, "Apple SD Gothic Neo", sans-serif`;
    ctx.lineWidth = 8; ctx.strokeStyle = OL;
    ctx.strokeText(b.text, V.w / 2, y);
    ctx.fillStyle = b.boss ? '#ffb347' : '#ffffff';
    ctx.fillText(b.text, V.w / 2, y);
    if (b.sub) {
      ctx.font = '17px Jua, "Apple SD Gothic Neo", sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeText(b.sub, V.w / 2, y + big * 0.85);
      ctx.fillStyle = '#fff3b0';
      ctx.fillText(b.sub, V.w / 2, y + big * 0.85);
    }
    ctx.restore();
  }

  // ── 마을(야영지) ────────────────────────────────────────
  // 탑 아래 야영지: 모닥불, 모찌, 펫, 동료, 구해낸 주민들
  const campStars = [];
  for (let i = 0; i < 70; i++) campStars.push({ x: Math.random(), y: Math.random() * 0.55, r: Math.random() * 1.4 + 0.4, p: Math.random() * 6 });

  function drawCamp(ctx, t, areaH) {
    const V = G.View, dpr = V.dpr;
    const W = V.w, H = areaH || V.h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2b2350');
    sky.addColorStop(0.55, '#5b4a8a');
    sky.addColorStop(1, '#f2a7c3');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, V.h);
    for (const s of campStars) {
      ctx.globalAlpha = 0.5 + Math.sin(t * 2 + s.p) * 0.4;
      ctx.fillStyle = '#fff6d6';
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 루미(꿈별) — 탑 꼭대기
    const save = G.Save.data;
    const lumiOk = save.cleared[10];
    const tx = W / 2;
    const towerTop = H * 0.06;
    const glow = ctx.createRadialGradient(tx, towerTop, 2, tx, towerTop, 60);
    glow.addColorStop(0, lumiOk ? 'rgba(255,243,176,0.9)' : 'rgba(255,107,214,0.7)');
    glow.addColorStop(1, 'rgba(255,107,214,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(tx - 60, towerTop - 60, 120, 120);
    G.Fx.star(ctx, tx, towerTop, 9 + Math.sin(t * 2) * 1.5, t * 0.3);
    ctx.fillStyle = lumiOk ? '#fff3b0' : '#c9a6ff';
    ctx.fill();
    // 탑
    const base = H * 0.78;
    const tw = Math.min(W * 0.32, 150);
    ctx.save();
    ctx.translate(tx, 0);
    ctx.beginPath();
    ctx.moveTo(-tw / 2, base);
    ctx.lineTo(-tw * 0.18, towerTop + 14);
    ctx.lineTo(tw * 0.18, towerTop + 14);
    ctx.lineTo(tw / 2, base);
    ctx.closePath();
    ctx.fillStyle = '#3d3358';
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#2a2240'; ctx.stroke();
    // 층마다 창문 (깬 층은 노란 불빛)
    const floors = 10;
    for (let i = 0; i < floors; i++) {
      const k = i / floors;
      const y = U.lerp(base - 18, towerTop + 30, k);
      const half = U.lerp(tw / 2, tw * 0.18, k) * 0.5;
      const lit = save.cleared[i + 1];
      for (const sx of [-half * 0.5, half * 0.5]) {
        U.roundRect(ctx, sx - 4, y - 6, 8, 11, 4);
        ctx.fillStyle = lit ? '#ffd166' : '#5b4a8a';
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(-half * 2, y + 8, half * 4, 2);
    }
    ctx.restore();
    // 구름
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 4; i++) {
      const cx = ((t * 6 + i * 140) % (W + 200)) - 100, cy = H * (0.18 + i * 0.09);
      for (const [dx, dy, r] of [[0, 0, 16], [16, -6, 20], [34, 0, 15]]) { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, r, 0, TAU); ctx.fill(); }
    }
    // 언덕
    ctx.fillStyle = '#7fb069';
    ctx.beginPath();
    ctx.moveTo(0, base - 10);
    ctx.quadraticCurveTo(W * 0.25, base - 34, W * 0.5, base - 8);
    ctx.quadraticCurveTo(W * 0.75, base + 12, W, base - 22);
    ctx.lineTo(W, V.h); ctx.lineTo(0, V.h); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9ccc7a';
    ctx.fillRect(0, base + 8, W, V.h);

    // 캐릭터들 (화면 단위 크기)
    const u = Math.min(W / 360, H / 330, 1.6);
    const gy = base + 30 * u;
    // 모닥불
    const fx = W / 2;
    ctx.save();
    ctx.translate(fx, gy);
    const fireGlow = ctx.createRadialGradient(0, 0, 4, 0, 0, 90 * u);
    fireGlow.addColorStop(0, 'rgba(255,200,120,0.5)');
    fireGlow.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = fireGlow;
    ctx.fillRect(-90 * u, -90 * u, 180 * u, 180 * u);
    ctx.lineWidth = 4 * u; ctx.strokeStyle = '#8a5a44'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14 * u, 6 * u); ctx.lineTo(14 * u, -2 * u); ctx.moveTo(14 * u, 6 * u); ctx.lineTo(-14 * u, -2 * u); ctx.stroke();
    A().flame(ctx, 0, -8 * u, 9 * u, t);
    ctx.restore();
    if (Math.random() < 0.15) campEmbers.push({ x: fx + U.rand(-6, 6) * u, y: gy - 14 * u, vy: -U.rand(20, 40) * u, life: 1.2 });
    for (let i = campEmbers.length - 1; i >= 0; i--) {
      const e = campEmbers[i];
      e.life -= 1 / 60; e.y += e.vy / 60; e.x += Math.sin(t * 3 + i) * 0.3;
      if (e.life <= 0) { campEmbers.splice(i, 1); continue; }
      ctx.globalAlpha = e.life;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(e.x, e.y, 1.6 * u, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    const r = 14 * u;
    // 모찌
    const mx = fx - 46 * u;
    if (!G.Assets.draw(ctx, 'hero', 'idle', t, mx, gy + r, r * 2.6, false)) A().creature(ctx, G.HERO_LOOK, mx, gy, r, { t, face: 1, seed: 0 });
    // 펫
    const pk = save.pets.active;
    if (pk && G.PETS[pk]) {
      const px = mx - 26 * u, py = gy + 8 * u;
      const hop = Math.abs(Math.sin(t * 3)) * 5 * u;
      if (!G.Assets.draw(ctx, pk, 'idle', t, px, py - hop + r * 0.6, r * 1.6, false)) A().creature(ctx, G.PETS[pk].look, px, py - hop, r * 0.6, { t, face: 1, seed: 1 });
    }
    // 팀 동료: 모닥불 오른쪽과 앞쪽
    const team = (save.comps.team || []).filter((k) => G.COMPANIONS[k]);
    const spots = [[46, 0], [24, 26], [-14, 30]];
    team.forEach((k, i) => {
      const [dx, dy] = spots[i] || [60, 0];
      const cx = fx + dx * u, cy = gy + dy * u;
      if (!G.Assets.draw(ctx, k, 'idle', t + i, cx, cy + r * 0.9, r * 2.3, true)) A().creature(ctx, G.COMPANIONS[k].look, cx, cy, r * 0.9, { t: t + i, face: -1, seed: 2 + i });
    });
    // 팀에 없는 친구들은 뒤쪽에서 쉬고 있어요
    const rescued = Object.keys(save.comps.owned).filter((k) => !team.includes(k) && G.COMPANIONS[k]);
    rescued.forEach((k, i) => {
      const side = i % 2 ? 1 : -1;
      const x = fx + side * (90 + Math.floor(i / 2) * 34) * u;
      const y = gy - 22 * u;
      if (x < 10 || x > W - 10) return;
      A().creature(ctx, G.COMPANIONS[k].look, x, y, r * 0.8, { t: t + i, face: -side, seed: i });
    });
    // 아직 잠든 마을 사람 Zzz
    if (!save.cleared[10]) {
      ctx.font = `${12 * u}px Jua, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.4 + i / 3) % 1;
        ctx.globalAlpha = 1 - k;
        ctx.fillText('Z', W * 0.12 + k * 14 * u, base - 30 * u - k * 26 * u + i);
        ctx.fillText('z', W * 0.88 - k * 10 * u, base - 40 * u - k * 22 * u);
      }
      ctx.globalAlpha = 1;
    }
  }
  const campEmbers = [];

  // 초상화(DOM용) 캐시
  const portraitCache = new Map();
  function portrait(look, key, size, opts) {
    const ck = (key || JSON.stringify(look)) + size + (opts && opts.dim ? 'd' : '');
    if (portraitCache.has(ck)) return portraitCache.get(ck);
    const icon = key && G.Assets.icon('icon_' + key);
    if (icon) { portraitCache.set(ck, icon.src); return icon.src; }
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const r = size * 0.27;
    if (key && G.Assets.has(key)) {
      G.Assets.draw(ctx, key, 'idle', 0, size / 2, size * 0.9, size * 0.8, false);
    } else {
      A().creature(ctx, look, size / 2, size * 0.56, r, { t: 0.5, face: 1, seed: 3, noShadow: false });
    }
    if (opts && opts.dim) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(59,42,77,0.85)';
      ctx.fillRect(0, 0, size, size);
    }
    const url = cv.toDataURL();
    portraitCache.set(ck, url);
    return url;
  }

  const imgCache = new Map();
  function portraitImg(look, key) {
    const ck = key || JSON.stringify(look);
    if (imgCache.has(ck)) return imgCache.get(ck);
    const img = new Image();
    img.src = portrait(look, key, 160);
    imgCache.set(ck, img);
    return img;
  }

  const iconCache = new Map();
  function itemIcon(item, size) {
    size = size || 96;
    const ck = `${item.slot}_${item.wtype || item.variant}_${item.theme}_${item.rar}_${size}`;
    if (iconCache.has(ck)) return iconCache.get(ck);
    const aKey = 'icon_' + (item.slot === 'weapon' ? 'weapon_' + item.wtype : item.slot + '_' + item.variant);
    const img = G.Assets.icon(aKey);
    if (img) { iconCache.set(ck, img.src); return img.src; }
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.translate(size / 2, size / 2);
    const color = G.THEMES[item.theme].color, gem = G.RARITIES[item.rar].color;
    if (item.slot === 'weapon') {
      ctx.rotate(-Math.PI / 4);
      ctx.translate(-size * 0.28, 0);
      A().weapon(ctx, item.wtype, color, size * 0.62);
    } else {
      A().gear(ctx, item.slot, item.variant, color, gem, size * 0.78);
    }
    const url = cv.toDataURL();
    iconCache.set(ck, url);
    return url;
  }

  return { drawRun, drawCamp, portrait, portraitImg, itemIcon };
})();
