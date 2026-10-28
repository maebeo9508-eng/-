'use strict';
// 주인공 모찌: 이동, 자동 공격(무기 7종), 대시, 물약, 스킬, 지속 능력
G.Player = (function () {
  const U = G.U, TAU = U.TAU;
  const C = () => G.Combat;
  const R = () => G.Run.st;

  function create(x, y, rs) {
    return {
      x, y, r: 11, face: 1, aim: -Math.PI / 2, moving: false, t: 0,
      hp: rs.maxHp, maxHp: rs.maxHp, invuln: 1, flash: 0,
      atkCd: 0.3, queue: [], dash: null, dashCd: 0, dashHit: null,
      bubble: 0, bubbleT: 3, shieldT: 0, healBuffT: 0, windT: 0, beam: null,
      orbitA: 0, orbitHits: new Map(), meteorT: 3, thunderT: 2, starT: 6, attackAnim: 0, dead: false,
    };
  }

  function nearestTarget(p, range) {
    let best = null, bd = Infinity;
    for (const e of R().enemies) {
      if (e.dead || e.burrowed || e.spawnT > 0 || e.invuln) continue;
      const d = U.dist(p.x, p.y, e.x, e.y) - e.r;
      if (d < range && d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function dmgMul(st) {
    const p = st.player, rs = st.rs;
    let m = 1;
    const lost = 1 - p.hp / p.maxHp;
    if (rs.rage) m *= 1 + rs.rage * 2 * lost;
    if (rs.uniq.berserk && p.hp < p.maxHp * 0.5) m *= 1.4;
    return m;
  }

  // ── 공격 ───────────────────────────────────────────────
  function attackDirs(rs) {
    const dirs = [0];
    if (rs.diag >= 1) dirs.push(0.79, -0.79);
    if (rs.diag >= 2) dirs.push(0.4, -0.4);
    if (rs.rear >= 1) dirs.push(Math.PI);
    if (rs.rear >= 2) dirs.push(Math.PI + 0.45, Math.PI - 0.45);
    return dirs;
  }

  function attack(st, base) {
    const rs = st.rs;
    const dirs = attackDirs(rs);
    const m = Math.pow(0.9, rs.multi) * dmgMul(st);
    for (const d of dirs) fireOne(st, base + d, m * (d === 0 ? 1 : 0.85));
    for (let k = 1; k <= rs.multi; k++) st.player.queue.push({ t: 0.11 * k, base, m });
    st.player.attackAnim = 1;
    G.Assets.trigger(st.player, 'attack');
  }

  function fireOne(st, ang, m) {
    const p = st.player, rs = st.rs, W = rs.weapon, u = rs.uniq;
    const dmg = rs.atk * W.atkMul * m * (rs.noWeapon ? 0.7 : 1);
    const size = rs.size;
    switch (W.kind) {
      case 'melee': {
        const range = W.range * size;
        for (const e of st.enemies) {
          if (e.dead) continue;
          const d = U.dist(p.x, p.y, e.x, e.y);
          if (d > range + e.r) continue;
          if (Math.abs(U.angleDiff(ang, U.angleTo(p.x, p.y, e.x, e.y))) > W.arc / 2 && d > e.r + p.r) continue;
          C().hitEnemy(e, dmg, { proc: true, knock: [Math.cos(ang), Math.sin(ang), 140] });
        }
        // 검은 적의 탄환을 베어냅니다
        for (const b of st.eprojs) {
          if (U.dist(p.x, p.y, b.x, b.y) < range + b.r && Math.abs(U.angleDiff(ang, U.angleTo(p.x, p.y, b.x, b.y))) < W.arc / 2) {
            b.dead = true;
            G.Fx.burst(b.x, b.y, '#ffffff', 3, 60, 2);
          }
        }
        st.swings.push({ x: p.x, y: p.y, ang, arc: W.arc, r: range, t: 0.16, max: 0.16, color: '#ffffff' });
        G.Sfx.play('swing');
        break;
      }
      case 'thrust': {
        const len = W.range * size, w = W.width * size;
        const ex = p.x + Math.cos(ang) * len, ey = p.y + Math.sin(ang) * len;
        for (const e of st.enemies) {
          if (e.dead) continue;
          if (segDist(e.x, e.y, p.x, p.y, ex, ey) < w / 2 + e.r) C().hitEnemy(e, dmg, { proc: true, spear: true, knock: [Math.cos(ang), Math.sin(ang), 110] });
        }
        st.swings.push({ x: p.x, y: p.y, ang, thrust: true, r: len, w, t: 0.14, max: 0.14, color: '#ffffff' });
        G.Sfx.play('swing');
        break;
      }
      case 'slam': {
        const cx = p.x + Math.cos(ang) * W.range * 0.6 * size, cy = p.y + Math.sin(ang) * W.range * 0.6 * size;
        const r = W.aoe * size;
        C().blast(cx, cy, r, dmg, { proc: true });
        G.Fx.ring(cx, cy, 6, r, '#ffffff', 0.25, 4);
        G.Fx.burst(cx, cy, ['#ffffff', '#e8dcc0'], 8, 120, 3.5);
        G.Fx.shake(2.5);
        G.Sfx.play('slam');
        if (u.hammerBolt && Math.random() < 0.3) {
          st.bolts.push({ x1: cx, y1: cy - 200, x2: cx, y2: cy, t: 0.2, sky: true });
          C().blast(cx, cy, r * 0.8, dmg * 1.2, { color: '#c9b8ff' });
          G.Sfx.play('zap');
        }
        break;
      }
      case 'proj': {
        const spread = W.spread || 0;
        const a = ang + (spread ? U.rand(-spread, spread) : 0);
        G.Run.fireProj({ x: p.x, y: p.y, ang: a, type: W.proj, speed: W.speed, dmg, life: (W.range / W.speed) * 1.1, pierce: rs.pierce, bounce: rs.bounce, homing: W.homing || 0, r: W.proj === 'water' ? 4 : 5, rainbow: !!u.rainbow });
        if (u.extraProj) G.Run.fireProj({ x: p.x, y: p.y, ang: a + 0.12, type: W.proj, speed: W.speed, dmg, life: (W.range / W.speed) * 1.1, pierce: rs.pierce, bounce: rs.bounce, homing: W.homing || 0, r: 5 });
        if (W.proj !== 'water' || Math.random() < 0.3) G.Sfx.play('shoot');
        break;
      }
      case 'boomerang': {
        G.Run.fireProj({ x: p.x, y: p.y, ang, type: 'boomerang', speed: W.speed, dmg, life: 4, pierce: 999, r: u.bigBoomerang ? 11 : 7, boomerang: { out: true, range: W.range * size, sx: p.x, sy: p.y } });
        G.Sfx.play('shoot');
        break;
      }
    }
    // 검기
    if ((W.kind === 'melee' || W.kind === 'thrust' || W.kind === 'slam') && rs.wave > 0) {
      const big = u.swordWave && W.kind === 'melee';
      G.Run.fireProj({ x: p.x, y: p.y, ang, type: 'wave', speed: 330, dmg: dmg * (big ? 1.0 : 0.4 + 0.15 * rs.wave), life: 0.75, pierce: 1 + rs.wave + rs.pierce, bounce: rs.bounce, r: big ? 14 : 9 });
    }
  }

  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy || 1;
    const t = U.clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }

  // ── 매 프레임 ──────────────────────────────────────────
  function update(dt) {
    const st = R(), p = st.player, rs = st.rs;
    if (p.dead) { p.t += dt; return; }
    p.t += dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.flash > 0) p.flash -= dt;
    if (p.shieldT > 0) p.shieldT -= dt;
    if (p.healBuffT > 0) p.healBuffT -= dt;
    if (p.windT > 0) p.windT -= dt;
    if (p.dashCd > 0) p.dashCd -= dt;
    if (p.attackAnim > 0) p.attackAnim = Math.max(0, p.attackAnim - dt * 6);
    if (p.cheerT > 0) p.cheerT -= dt;
    p.r = 11 * rs.size;

    // 이동
    const I = G.Input;
    let vx, vy;
    if (p.dash) {
      p.dash.t -= dt;
      vx = p.dash.dx * 520; vy = p.dash.dy * 520;
      if (Math.random() < 0.7) G.Fx.burst(p.x, p.y + 6, '#ffffff', 1, 20, 4, { life: 0.6 });
      if (rs.dashLv) {
        for (const e of st.enemies) {
          if (e.dead || p.dashHit.has(e.id)) continue;
          if (U.dist(p.x, p.y, e.x, e.y) < p.r + e.r + 6) { p.dashHit.add(e.id); C().hitEnemy(e, rs.atk * (0.8 + 0.4 * rs.dashLv), { proc: true }); }
        }
      }
      if (p.dash.t <= 0) p.dash = null;
    } else {
      const slow = st.playerSlow ? 0.6 : 1;
      let mx = I.mx, my = I.my;
      if (st.auto) {
        [mx, my] = G.Team.mochiMove(st);
        if (p.wantDash) { p.wantDash = false; if (p.dashCd <= 0) dash(true); }
      }
      vx = mx * rs.move * slow; vy = my * rs.move * slow;
    }
    p.moving = Math.abs(vx) + Math.abs(vy) > 5;
    p.x += vx * dt; p.y += vy * dt;
    G.World.collide(p, st.arena);
    if (Math.abs(vx) > 5) p.face = vx < 0 ? -1 : 1;

    if (rs.regen > 0) C().heal(p.maxHp * rs.regen * dt, false);

    if (st.phase !== 'fight') { p.aim = p.moving ? Math.atan2(vy, vx) : p.aim; return; }

    // 자동 공격
    const W = rs.weapon;
    const reach = W.kind === 'melee' || W.kind === 'slam' ? W.range * rs.size + 24 : W.kind === 'thrust' ? W.range * rs.size + 6 : W.range;
    const tg = nearestTarget(p, reach);
    if (tg) {
      p.aim = U.angleTo(p.x, p.y, tg.x, tg.y);
      if (Math.abs(Math.cos(p.aim)) > 0.2) p.face = Math.cos(p.aim) < 0 ? -1 : 1;
    } else if (p.moving) p.aim = Math.atan2(vy, vx);
    p.atkCd -= dt * rs.aspd * (p.windT > 0 ? 1.5 : 1);
    if (p.atkCd <= 0) {
      if (tg) { attack(st, p.aim); p.atkCd += 1 / W.rate; }
      else p.atkCd = 0;
    }
    // 스킬: 슬롯 2(보조)는 늘 자동, 슬롯 1(궁극기)은 AUTO일 때 자동
    if (st.skillCd[1] <= 0 && skillWanted(st, G.Save.data.skills.eq[1])) skill(1);
    if (st.auto && st.skillCd[0] <= 0 && G.Team.wantsUlt(p)) G.Team.useUlt(p);
    if (st.auto) G.Team.autoPotion(st);

    for (let i = p.queue.length - 1; i >= 0; i--) {
      const q = p.queue[i];
      q.t -= dt;
      if (q.t <= 0) {
        p.queue.splice(i, 1);
        const t2 = nearestTarget(p, reach + 20);
        const base = t2 ? U.angleTo(p.x, p.y, t2.x, t2.y) : q.base;
        for (const d of attackDirs(rs)) fireOne(st, base + d, q.m * (d === 0 ? 1 : 0.85));
      }
    }

    // 빙글 별사탕
    if (rs.orbit > 0) {
      p.orbitA += dt * 3.3;
      const R0 = 46 * rs.size;
      for (let i = 0; i < rs.orbit; i++) {
        const a = p.orbitA + (i / rs.orbit) * TAU;
        const ox = p.x + Math.cos(a) * R0, oy = p.y + Math.sin(a) * R0;
        for (const e of st.enemies) {
          if (e.dead || U.dist2(ox, oy, e.x, e.y) > (e.r + 8) * (e.r + 8)) continue;
          const last = p.orbitHits.get(e.id) || 0;
          if (p.t - last < 0.45) continue;
          p.orbitHits.set(e.id, p.t);
          C().hitEnemy(e, rs.atk * 0.45 * dmgMul(st), { proc: true, color: '#fff3b0' });
        }
        for (const b of st.eprojs) if (U.dist2(ox, oy, b.x, b.y) < (b.r + 7) * (b.r + 7)) b.dead = true;
      }
    }
    // 보호막 충전
    if (rs.bubbleCd > 0 && p.bubble < 1) {
      p.bubbleT -= dt;
      if (p.bubbleT <= 0) { p.bubble = 1; p.bubbleT = rs.bubbleCd; G.Sfx.play('shield'); }
    }
    // 별똥별 / 번개 구름 / 별빛 망토
    if (rs.meteorLv > 0 && st.enemies.length) {
      p.meteorT -= dt;
      if (p.meteorT <= 0) {
        p.meteorT = 5.2 - 0.9 * rs.meteorLv;
        const e = randomEnemy(st);
        if (e) G.Run.addZone({ kind: 'circle', friendly: true, x: e.x, y: e.y, r: 46, warn: 0.5, dmg: rs.atk * (1.2 + 0.5 * rs.meteorLv), color: '#ffb347', meteor: true });
      }
    }
    if (rs.thunderLv > 0) {
      p.thunderT -= dt;
      if (p.thunderT <= 0) {
        p.thunderT = 3.8 - 0.6 * rs.thunderLv;
        const e = randomEnemy(st);
        if (e) {
          st.bolts.push({ x1: e.x, y1: e.y - 220, x2: e.x, y2: e.y, t: 0.2, sky: true });
          C().hitEnemy(e, rs.atk * 1.1 * (1 + 0.3 * (rs.thunderLv - 1)), { color: '#c9b8ff' });
          if (!e.dead) C().chain(e, rs.atk * 0.5, 2);
        }
      }
    }
    if (rs.uniq.starfall) {
      p.starT -= dt;
      if (p.starT <= 0) {
        p.starT = 6;
        const e = randomEnemy(st);
        if (e) G.Run.addZone({ kind: 'circle', friendly: true, x: e.x, y: e.y, r: 54, warn: 0.5, dmg: rs.atk * 2.5, color: '#ffe66d', meteor: true });
      }
    }
    // 별빛 광선
    if (p.beam) {
      p.beam.t -= dt;
      p.beam.tick -= dt;
      if (p.beam.tick <= 0) {
        p.beam.tick = 0.1;
        const len = 280, ex = p.x + Math.cos(p.aim) * len, ey = p.y + Math.sin(p.aim) * len;
        for (const e of st.enemies) if (!e.dead && segDist(e.x, e.y, p.x, p.y, ex, ey) < 12 + e.r) C().hitEnemy(e, p.beam.dmg, { skill: true, noCrit: false, color: '#fff3b0' });
      }
      if (p.beam.t <= 0) p.beam = null;
    }
    // 솜털 방패: 탄환 튕겨내기
    if (p.shieldT > 0) {
      for (const b of st.eprojs) if (U.dist2(p.x, p.y, b.x, b.y) < (p.r + 22) * (p.r + 22)) { b.dead = true; G.Fx.burst(b.x, b.y, '#9be7ff', 3, 60, 2); }
    }
  }

  // 보조 스킬을 지금 쓸지
  function skillWanted(st, key) {
    if (!key) return false;
    const p = st.player;
    if (!st.enemies.some((e) => !e.dead && e.spawnT <= 0 && !e.burrowed)) return false;
    if (key === 'heal') return G.Team.hpRatio(st) < 0.75;
    if (key === 'shield') return G.Team.hpRatio(st) < 0.8 || st.eprojs.length > 5;
    const near = key === 'spin' || key === 'frost' ? 100 : 260;
    return !!G.Allies.nearestEnemy(p.x, p.y, near);
  }

  function randomEnemy(st) {
    const list = st.enemies.filter((e) => !e.dead && !e.burrowed && e.spawnT <= 0);
    return list.length ? U.pick(list) : null;
  }

  function densest(st) {
    let best = null, bc = -1;
    for (const e of st.enemies) {
      if (e.dead || e.burrowed) continue;
      let c = 0;
      for (const o of st.enemies) if (!o.dead && U.dist2(e.x, e.y, o.x, o.y) < 80 * 80) c++;
      if (c > bc) { bc = c; best = e; }
    }
    return best;
  }

  // ── 버튼 동작 ──────────────────────────────────────────
  function dash(fromAI) {
    const st = R();
    if (!st || st.paused) return;
    if (st.auto && !fromAI) return;
    const p = st.player, rs = st.rs;
    if (p.dead || p.dashCd > 0 || p.dash) return;
    let dx = G.Input.mx, dy = G.Input.my;
    if (Math.abs(dx) + Math.abs(dy) < 0.1) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
    const l = Math.hypot(dx, dy) || 1;
    p.dash = { t: 0.17, dx: dx / l, dy: dy / l };
    p.dashHit = new Set();
    p.invuln = Math.max(p.invuln, 0.28);
    p.dashCd = 2.4 * (1 - 0.3 * rs.dashLv) * (rs.uniq.windDash ? 0.6 : 1);
    st.dashCdMax = p.dashCd;
    if (rs.uniq.windDash) p.windT = 1;
    G.Sfx.play('dash');
  }

  function potion() {
    const st = R();
    if (!st || st.paused) return;
    const p = st.player;
    if (st.potions <= 0 || G.Team.hpRatio(st) >= 0.99) return;
    st.potions--;
    // 물약은 팀 모두를 회복시켜요
    G.Team.healAll(0.3 + 0.04 * G.Save.data.potionLv, true);
    G.Fx.ring(p.x, p.y, 10, 80, '#ff8fab', 0.5, 4);
    G.Sfx.play('heal');
  }

  function skill(idx) {
    const st = R();
    if (!st || st.paused || st.phase !== 'fight') return false;
    const p = st.player, rs = st.rs;
    if (p.dead || st.skillCd[idx] > 0) return false;
    const key = G.Save.data.skills.eq[idx];
    const def = G.ACTIVE_SKILLS[key];
    if (!def) return false;
    if (idx === 0) G.Team.cutin('모찌', def.name, G.HERO_LOOK, 'hero', '#ff8fab');
    G.Assets.trigger(p, idx === 0 ? 'ult' : 'cast', true);
    const lv = G.Save.data.skills.lv[key] || 1;
    const cd = def.cd * (1 - rs.cdr) * (1 - 0.04 * (lv - 1));
    st.skillCd[idx] = cd;
    st.skillCdMax[idx] = cd;
    const mult = (def.dmg || 0) * (1 + 0.2 * (lv - 1)) * dmgMul(st);
    const atk = rs.atk;
    G.Sfx.play('skill');
    switch (key) {
      case 'spin':
        C().blast(p.x, p.y, 92 * rs.size, atk * mult, { skill: true, proc: true });
        for (const b of st.eprojs) if (U.dist2(p.x, p.y, b.x, b.y) < 92 * 92) b.dead = true;
        st.swings.push({ x: p.x, y: p.y, ang: 0, arc: TAU, r: 92 * rs.size, t: 0.3, max: 0.3, color: '#bff4ff', spin: true });
        G.Fx.ring(p.x, p.y, 10, 95, '#ffffff', 0.3, 5);
        G.Fx.shake(3);
        break;
      case 'heal':
        G.Team.healAll(def.heal + 0.05 * (lv - 1), true);
        p.healBuffT = 3;
        G.Fx.ring(p.x, p.y, 8, 50, '#ff8fab', 0.5, 4);
        break;
      case 'meteor': {
        const e = densest(st);
        const x = e ? e.x : p.x + Math.cos(p.aim) * 100, y = e ? e.y : p.y + Math.sin(p.aim) * 100;
        G.Run.addZone({ kind: 'circle', friendly: true, x, y, r: 82, warn: 0.55, dmg: atk * mult, color: '#ff9f1c', meteor: true, big: true, skill: true, burn: true });
        break;
      }
      case 'frost':
        for (const e of st.enemies) {
          if (e.dead || U.dist2(p.x, p.y, e.x, e.y) > 125 * 125) continue;
          C().hitEnemy(e, atk * mult, { skill: true });
          if (e.boss) { e.slowT = 2.5; e.slowAmt = 0.5; } else C().freeze(e, 2 + 0.2 * (lv - 1));
        }
        G.Fx.ring(p.x, p.y, 10, 125, '#9be7ff', 0.45, 6);
        G.Fx.burst(p.x, p.y, ['#ffffff', '#bff4ff'], 24, 220, 3, { shape: 'square' });
        break;
      case 'thunder':
        for (let i = 0; i < 8; i++) {
          st.timers.push({
            t: i * 0.2,
            fn: () => {
              const e = randomEnemy(st);
              if (!e) return;
              st.bolts.push({ x1: e.x, y1: e.y - 240, x2: e.x, y2: e.y, t: 0.22, sky: true });
              C().blast(e.x, e.y, 30, atk * mult, { skill: true, color: '#c9b8ff' });
              G.Sfx.play('zap');
            },
          });
        }
        break;
      case 'shield':
        p.shieldT = def.dur + 0.3 * (lv - 1);
        p.invuln = Math.max(p.invuln, p.shieldT);
        for (const u of G.Team.members(st)) if (u !== p) { u.bubble = Math.max(u.bubble || 0, 1); G.Fx.ring(u.x, u.y, 6, 28, '#9be7ff', 0.35, 3); }
        G.Fx.ring(p.x, p.y, 10, 40, '#9be7ff', 0.4, 5);
        break;
      case 'beam':
        p.beam = { t: 1.6, tick: 0, dmg: atk * mult };
        break;
      case 'clone':
        for (let i = 0; i < 2; i++) st.allies.push({ kind: 'clone', idx: i, x: p.x, y: p.y, r: 10, t: 0, life: 6, cd: 0.2, face: p.face, moving: false, mul: def.dmg * (1 + 0.2 * (lv - 1)) });
        G.Fx.burst(p.x, p.y, '#ffffff', 16, 140, 4, { shape: 'star' });
        break;
    }
    return true;
  }

  // ── 그리기 ─────────────────────────────────────────────
  function draw(ctx, p, st) {
    const rs = st.rs, W = rs.weapon;
    const wItem = rs.weaponItem;
    const wColor = wItem ? G.THEMES[wItem.theme].color : '#a0785a';
    const blink = p.invuln > 0 && !p.dash && Math.floor(p.t * 20) % 2 === 0 && p.invuln < 0.6;
    const alpha = blink ? 0.45 : 1;
    // 무기가 뒤에 있을 때 (위를 볼 때) 먼저 그립니다
    const aimUp = Math.sin(p.aim) < -0.3;
    if (aimUp) drawWeapon(ctx, p, W, wColor, rs);
    const hop = p.cheerT > 0 ? Math.abs(Math.sin(p.cheerT * 9)) * 12 : 0;
    if (st.skillCd[0] <= 0 && st.phase === 'fight') {
      const g = 0.5 + Math.sin(p.t * 8) * 0.5;
      G.Art.ell(ctx, p.x, p.y + p.r * 0.9, p.r * (1.3 + g * 0.2), p.r * 0.45);
      ctx.strokeStyle = `rgba(255,143,171,${0.5 + g * 0.5})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    if (!G.Assets.drawEnt(ctx, 'hero', p, p.moving ? 'walk' : 'idle', p.x, p.y - hop + p.r, p.r * 2.6, p.face < 0, alpha, p.flash)) {
      G.Art.creature(ctx, G.HERO_LOOK, p.x, p.y, p.r, { t: p.t, moving: p.moving, face: p.face, flash: p.flash, alpha, seed: 0, hop });
    }
    G.Allies.unitBar(ctx, p.x, p.y - p.r * 2.1 - hop, p.hp / p.maxHp, false);
    if (!aimUp) drawWeapon(ctx, p, W, wColor, rs);
    if (p.bubble > 0) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 8, 0, TAU);
      ctx.fillStyle = 'rgba(155,231,255,0.18)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(155,231,255,0.8)';
      ctx.stroke();
    }
    if (p.shieldT > 0) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 16 + Math.sin(p.t * 12) * 2, 0, TAU);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(190,240,255,0.25)';
      ctx.fill();
    }
    // 빙글 별사탕
    if (rs.orbit > 0) {
      const R0 = 46 * rs.size;
      for (let i = 0; i < rs.orbit; i++) {
        const a = p.orbitA + (i / rs.orbit) * TAU;
        const x = p.x + Math.cos(a) * R0, y = p.y + Math.sin(a) * R0;
        G.Fx.star(ctx, x, y, 8, p.t * 4 + i);
        ctx.fillStyle = ['#ffe66d', '#ff8fab', '#7ed9c3', '#8ecbff'][i % 4];
        ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = G.Art.OL; ctx.stroke();
      }
    }
    if (p.beam) {
      const len = 280;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.aim);
      const w = 14 + Math.sin(p.t * 40) * 3;
      const g = ctx.createLinearGradient(0, -w, 0, w);
      g.addColorStop(0, 'rgba(255,240,170,0)');
      g.addColorStop(0.5, 'rgba(255,250,220,0.95)');
      g.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = g;
      ctx.fillRect(10, -w, len, w * 2);
      ctx.restore();
    }
  }

  function drawWeapon(ctx, p, W, color, rs) {
    if (rs.noWeapon) return;
    ctx.save();
    const hop = p.moving ? Math.abs(Math.sin(p.t * 11)) * p.r * 0.22 : 0;
    ctx.translate(p.x + Math.cos(p.aim) * p.r * 0.7, p.y - hop + Math.sin(p.aim) * p.r * 0.5 + 2);
    let a = p.aim;
    const k = p.attackAnim;
    if (W.kind === 'melee') a += (k > 0 ? (0.5 - k) * W.arc : -0.6) * (Math.cos(p.aim) < 0 ? -1 : 1);
    else if (W.kind === 'slam') a += k > 0 ? -1.2 * k + 0.4 : -0.5;
    ctx.rotate(a);
    if (W.kind === 'thrust') ctx.translate(k * 14, 0);
    const s = W.kind === 'spear' || W.kind === 'thrust' ? p.r * 2.4 : p.r * 1.7;
    G.Art.weapon(ctx, rs.wtype, color, s);
    ctx.restore();
  }

  return { create, update, draw, dash, potion, skill, segDist };
})();
