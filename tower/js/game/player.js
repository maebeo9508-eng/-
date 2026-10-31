'use strict';
// 주인공: 이동, 무기 휘두르기(연속 공격), 활·지팡이, 대시, 물약, 스킬, 필살기, 지속 능력
// 휘두르기는 무기의 combo 를 한 동작씩 재생해요. 칼날이 지나간 자리(쓸고 간 각도)에 있는 적만 맞아요.
G.Player = (function () {
  const U = G.U, TAU = U.TAU;
  const C = () => G.Combat;
  const R = () => G.Run.st;
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);

  function create(x, y, rs) {
    const save = G.Save.data;
    const key = rs.hero;
    return {
      x, y, r: 11, face: 1, aim: -Math.PI / 2, moving: false, t: 0,
      hp: rs.maxHp, maxHp: rs.maxHp, invuln: 1, flash: 0,
      hero: key, look: G.HEROES[key].look, lv: save.comps.owned[key] || 1,
      atkCd: 0, combo: 0, comboT: 0, swing: null, atkCount: 0, phantom: false,
      dash: null, dashCd: 0, dashHit: null, leap: null, ult: 0.3,
      bubble: 0, bubbleT: 3, shieldT: 0, healBuffT: 0, windT: 0, beam: null,
      orbitA: 0, orbitHits: new Map(), meteorT: 3, thunderT: 2, starT: 6, dead: false,
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

  // 근접 무기의 사거리 배율 (거대화·긴 팔·아티팩트)
  function reachMul(rs) { return rs.size * rs.reach; }

  // 자동 조준 거리
  function aimRange(rs) {
    const W = rs.weapon;
    if (W.kind === 'proj') return W.range;
    let r = 0;
    for (const m of W.combo) r = Math.max(r, m.range);
    return r * reachMul(rs) * 1.9 + 30;
  }

  // ── 공격 시작 ──────────────────────────────────────────
  function startAttack(st) {
    const p = st.player, rs = st.rs, W = rs.weapon, u = rs.uniq;
    const speed = W.rate * rs.aspd * (p.windT > 0 ? 1.5 : 1);
    const base = 1 / speed;
    const phantom = p.phantom;
    p.phantom = false;
    p.atkCount++;
    G.Assets.trigger(p, 'attack');
    if (rs.fx.stormjar && p.atkCount % 5 === 0) {
      const e = nearestTarget(p, 260);
      if (e) {
        st.bolts.push({ x1: e.x, y1: e.y - 220, x2: e.x, y2: e.y, t: 0.2, sky: true });
        C().hitEnemy(e, rs.atk * 1.2, { color: '#c9b8ff' });
        G.Sfx.play('zap');
      }
    }
    if (W.kind === 'proj') {
      shoot(st, p.aim, (phantom ? 2 : 1) * dmgMul(st));
      for (let k = 1; k <= rs.multi; k++) st.timers.push({ t: 0.1 * k, fn: () => { if (!p.dead) shoot(st, p.aim, 0.6 * dmgMul(st), true); } });
      p.atkCd = base;
      p.attackAnim = 1;
      return;
    }
    if (p.comboT <= 0) p.combo = 0;
    const idx = p.combo % W.combo.length;
    const mv = W.combo[idx];
    const last = idx === W.combo.length - 1 && W.combo.length > 1;
    const tm = mv.t || 1;
    // 왼쪽을 볼 때는 휘두르는 방향을 뒤집어 늘 위→아래로 베어요
    let dir = (mv.arc || 1) < 0 ? -1 : 1;
    if (Math.cos(p.aim) < 0) dir = -dir;
    p.swing = {
      mv, t: 0, dur: U.clamp(base * 0.8 * tm, 0.1, 0.55), aim: p.aim, dir, last, hit: new Set(),
      mul: (last ? 1 + rs.finisher : 1) * (phantom ? 2 : 1),
      range: mv.range * reachMul(rs), struck: false, idx,
    };
    p.atkCd = base * tm;
    p.combo++;
    p.comboT = base * tm + 0.5;
    p.attackAnim = 1;
    G.Sfx.play(mv.type === 'smash' ? 'swing' : 'swing');
    // 검기·사선 검기·뒤통수 검기
    const dmg = rs.atk * W.atkMul * mv.mul * dmgMul(st);
    if (rs.wave > 0) {
      const big = u.swordWave && rs.wtype === 'sword';
      G.Run.fireProj({ x: p.x, y: p.y, ang: p.aim, type: 'wave', speed: 330, dmg: dmg * (big ? 1.0 : 0.4 + 0.15 * rs.wave), life: 0.75, pierce: 1 + rs.wave + rs.pierce, bounce: rs.bounce, r: big ? 14 : 9 });
    }
    if (rs.diag > 0) for (const s of [-0.6, 0.6]) G.Run.fireProj({ x: p.x, y: p.y, ang: p.aim + s, type: 'wave', speed: 300, dmg: dmg * (0.3 + 0.1 * rs.diag), life: 0.55, pierce: rs.pierce, bounce: rs.bounce, r: 7 });
    if (rs.rear > 0) G.Run.fireProj({ x: p.x, y: p.y, ang: p.aim + Math.PI, type: 'wave', speed: 300, dmg: dmg * (0.35 + 0.1 * rs.rear), life: 0.55, pierce: rs.pierce, r: 8 });
    // 오크 왕의 도끼: 회오리 베기 때 도끼 4개
    if (u.axeThrow && mv.type === 'spin') {
      for (let i = 0; i < 4; i++) G.Run.fireProj({ x: p.x, y: p.y, ang: p.aim + (i / 4) * TAU, type: 'axe', speed: 260, dmg: dmg * 0.6, life: 0.7, pierce: 2, r: 8 });
    }
  }

  function shoot(st, ang, m, echo) {
    const p = st.player, rs = st.rs, W = rs.weapon, u = rs.uniq;
    const dmg = rs.atk * W.atkMul * m;
    const fire = (a, k) => G.Run.fireProj({
      x: p.x, y: p.y, ang: a, type: W.proj, speed: W.speed, dmg: dmg * (k || 1), life: (W.range / W.speed) * 1.1,
      pierce: rs.pierce, bounce: rs.bounce, homing: W.homing || 0, aoe: W.aoe || 0, r: W.proj === 'orb' ? 6 : 5,
      color: W.proj === 'orb' ? (rs.weaponItem ? G.THEMES[rs.weaponItem.theme].color : '#c3a6ff') : undefined,
    });
    fire(ang);
    if (echo) return;
    const extra = (u.extraProj ? 1 : 0) + rs.wave;
    for (let i = 1; i <= extra; i++) fire(ang + (i % 2 ? 1 : -1) * 0.12 * Math.ceil(i / 2), 0.8);
    if (rs.diag > 0) for (const s of [-0.35, 0.35]) fire(ang + s, 0.6 + 0.1 * rs.diag);
    if (rs.rear > 0) fire(ang + Math.PI, 0.6);
    G.Sfx.play('shoot');
  }

  // ── 휘두르기 진행 (매 프레임) ───────────────────────────
  function updateSwing(st, dt) {
    const p = st.player, sw = p.swing, rs = st.rs, W = rs.weapon, u = rs.uniq;
    sw.t += dt;
    const k = U.clamp(sw.t / sw.dur, 0, 1);
    const mv = sw.mv;
    const dmg = rs.atk * W.atkMul * mv.mul * dmgMul(st) * sw.mul;
    const knock = mv.knock || 140;
    const hit = (e, mult, ang) => {
      sw.hit.add(e.id);
      C().hitEnemy(e, dmg * (mult || 1), { proc: true, player: true, melee: true, last: sw.last, knock: [Math.cos(ang), Math.sin(ang), knock] });
    };
    switch (mv.type) {
      case 'arc':
      case 'whip':
      case 'spin': {
        const arc = mv.type === 'spin' ? TAU : Math.abs(mv.arc);
        const a0 = mv.type === 'spin' ? sw.aim : sw.aim - (sw.dir * arc) / 2;
        const swept = arc * easeOut(k);
        sw.a0 = a0; sw.cur = a0 + sw.dir * swept; sw.arcLen = arc;
        for (const e of st.enemies) {
          if (e.dead || e.burrowed || e.spawnT > 0 || sw.hit.has(e.id)) continue;
          const d = U.dist(p.x, p.y, e.x, e.y);
          if (d > sw.range + e.r) continue;
          if (mv.type === 'whip' && d < sw.range * 0.25) continue;
          const tol = d > 1 ? Math.atan(e.r / d) : Math.PI;
          let rel = U.angleDiff(a0, U.angleTo(p.x, p.y, e.x, e.y)) * sw.dir;
          if (mv.type === 'spin' && rel < -tol) rel += TAU;
          if (rel < -tol || rel > swept + tol) continue;
          const tip = mv.type === 'whip' && d > sw.range * 0.7 ? 1.5 : 1;
          hit(e, tip, U.angleTo(p.x, p.y, e.x, e.y));
          if (u.thornWhip && mv.type === 'whip' && !e.dead) { C().addPoison(e, 1); e.slowT = 1.5; e.slowAmt = 0.4; }
        }
        // 검·대검은 날아오는 탄환을 베어내요
        if (W.parry) {
          for (const b of st.eprojs) {
            if (b.dead || U.dist(p.x, p.y, b.x, b.y) > sw.range + b.r) continue;
            const rel = U.angleDiff(a0, U.angleTo(p.x, p.y, b.x, b.y)) * sw.dir;
            if (rel >= -0.2 && rel <= swept + 0.2) { b.dead = true; G.Fx.burst(b.x, b.y, '#ffffff', 3, 60, 2); }
          }
        }
        if (k >= 1 && !sw.struck) {
          sw.struck = true;
          if (mv.type === 'spin' && u.quake) {
            C().blast(p.x, p.y, sw.range * 1.4, dmg * 0.8, { proc: true });
            G.Fx.ring(p.x, p.y, 10, sw.range * 1.4, '#e8dcc0', 0.35, 6);
            G.Fx.shake(5);
          }
        }
        break;
      }
      case 'thrust': {
        const lunge = (mv.lunge || 0) * (u.windLunge && rs.wtype === 'rapier' && sw.last ? 2 : 1);
        if (lunge && k < 0.45) {
          const step = (lunge * dt) / (sw.dur * 0.45);
          p.x += Math.cos(sw.aim) * step;
          p.y += Math.sin(sw.aim) * step;
          G.World.collide(p, st.arena);
        }
        const ext = k < 0.35 ? easeOut(k / 0.35) : 1 - ((k - 0.35) / 0.65) * 0.35;
        sw.ext = ext;
        if (k >= 0.05 && k <= 0.7) {
          const len = sw.range * ext, w = (mv.w || 16) * rs.size;
          const ex = p.x + Math.cos(sw.aim) * len, ey = p.y + Math.sin(sw.aim) * len;
          for (const e of st.enemies) {
            if (e.dead || e.burrowed || e.spawnT > 0 || sw.hit.has(e.id)) continue;
            if (segDist(e.x, e.y, p.x, p.y, ex, ey) < w / 2 + e.r) hit(e, 1, sw.aim);
          }
          if (W.parry) {
            for (const b of st.eprojs) if (!b.dead && segDist(b.x, b.y, p.x, p.y, ex, ey) < w / 2 + b.r) { b.dead = true; G.Fx.burst(b.x, b.y, '#ffffff', 3, 60, 2); }
          }
        }
        break;
      }
      case 'smash': {
        if (k >= 0.45 && !sw.struck) {
          sw.struck = true;
          const cx = p.x + Math.cos(sw.aim) * sw.range * 0.75, cy = p.y + Math.sin(sw.aim) * sw.range * 0.75;
          const r = (mv.aoe || 50) * reachMul(rs);
          for (const e of st.enemies) {
            if (e.dead || e.burrowed || e.spawnT > 0) continue;
            if (U.dist(cx, cy, e.x, e.y) > r + e.r) continue;
            hit(e, 1, U.angleTo(cx, cy, e.x, e.y));
            if (!e.dead && !e.boss && Math.random() < 0.2) C().freeze(e, 0.6);
          }
          G.Fx.ring(cx, cy, 6, r, '#ffffff', 0.28, 5);
          G.Fx.burst(cx, cy, ['#ffffff', '#e8dcc0', '#b8a890'], 12, 140, 3.5);
          G.Fx.shake(rs.wtype === 'hammer' ? 4 : 3);
          G.Sfx.play('slam');
          if (u.hammerBolt && rs.wtype === 'hammer' && Math.random() < 0.3) {
            st.bolts.push({ x1: cx, y1: cy - 200, x2: cx, y2: cy, t: 0.2, sky: true });
            C().blast(cx, cy, r * 0.8, dmg * 1.2, { color: '#c9b8ff' });
            G.Sfx.play('zap');
          }
          if (u.fistBolt && rs.wtype === 'gauntlet' && sw.last) {
            let n = 0;
            for (const e of st.enemies) {
              if (e.dead || n >= 3 || U.dist(cx, cy, e.x, e.y) > 160) continue;
              n++;
              st.bolts.push({ x1: cx, y1: cy, x2: e.x, y2: e.y, t: 0.18 });
              C().hitEnemy(e, dmg * 0.8, { color: '#c9b8ff' });
            }
            if (n) G.Sfx.play('zap');
          }
        }
        break;
      }
    }
    if (k >= 1 && !sw.echoed) {
      sw.echoed = true;
      // 잔상 베기: 같은 자리를 한 번 더 (60% 피해)
      for (let i = 1; i <= rs.multi; i++) st.timers.push({ t: 0.08 * i, fn: () => echo(st, sw, dmg * 0.6) });
    }
    if (sw.t >= sw.dur + 0.1) p.swing = null;
  }

  // 잔상: 휘두른 범위 전체에 한 번에 피해 + 흐릿한 궤적
  function echo(st, sw, dmg) {
    const p = st.player, mv = sw.mv;
    if (p.dead) return;
    const range = sw.range;
    if (mv.type === 'thrust') {
      const ex = p.x + Math.cos(sw.aim) * range, ey = p.y + Math.sin(sw.aim) * range, w = (mv.w || 16) * st.rs.size;
      for (const e of st.enemies) if (!e.dead && segDist(e.x, e.y, p.x, p.y, ex, ey) < w / 2 + e.r) C().hitEnemy(e, dmg, { proc: true, color: '#d8ccff' });
      st.swings.push({ x: p.x, y: p.y, ang: sw.aim, thrust: true, r: range, w, t: 0.16, max: 0.16, color: '#d8ccff' });
    } else if (mv.type === 'smash') {
      const cx = p.x + Math.cos(sw.aim) * range * 0.75, cy = p.y + Math.sin(sw.aim) * range * 0.75;
      C().blast(cx, cy, (mv.aoe || 50) * reachMul(st.rs), dmg, { proc: true, color: '#d8ccff' });
      G.Fx.ring(cx, cy, 6, (mv.aoe || 50) * reachMul(st.rs), '#d8ccff', 0.25, 4);
    } else {
      const arc = mv.type === 'spin' ? TAU : Math.abs(mv.arc);
      for (const e of st.enemies) {
        if (e.dead) continue;
        const d = U.dist(p.x, p.y, e.x, e.y);
        if (d > range + e.r) continue;
        if (arc < TAU && Math.abs(U.angleDiff(sw.aim, U.angleTo(p.x, p.y, e.x, e.y))) > arc / 2 + 0.2) continue;
        C().hitEnemy(e, dmg, { proc: true, color: '#d8ccff' });
      }
      st.swings.push({ x: p.x, y: p.y, ang: sw.aim, arc, r: range, t: 0.18, max: 0.18, color: '#d8ccff', spin: arc >= TAU });
    }
    G.Sfx.play('swing');
  }

  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy || 1;
    const t = U.clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }

  // 조준: 마우스 → 가까운 적 → 움직이는 방향
  function updateAim(st, vx, vy) {
    const p = st.player, I = G.Input;
    if (I.mouseAim) {
      const V = G.View;
      const wx = st.cam.x + I.mouse.x / V.scale, wy = st.cam.y + I.mouse.y / V.scale;
      p.aim = U.angleTo(p.x, p.y, wx, wy);
      return true;
    }
    const tg = nearestTarget(p, aimRange(st.rs));
    if (tg) { p.aim = U.angleTo(p.x, p.y, tg.x, tg.y); return true; }
    if (Math.abs(vx) + Math.abs(vy) > 5) p.aim = Math.atan2(vy, vx);
    return false;
  }

  // ── 매 프레임 ──────────────────────────────────────────
  function update(dt) {
    const st = R(), p = st.player, rs = st.rs;
    p.t += dt;
    if (p.dead) return;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.flash > 0) p.flash -= dt;
    if (p.shieldT > 0) p.shieldT -= dt;
    if (p.healBuffT > 0) p.healBuffT -= dt;
    if (p.windT > 0) p.windT -= dt;
    if (p.dashCd > 0) p.dashCd -= dt;
    if (p.atkCd > 0) p.atkCd -= dt;
    if (p.comboT > 0) p.comboT -= dt;
    if (p.attackAnim > 0) p.attackAnim = Math.max(0, p.attackAnim - dt * 6);
    if (p.cheerT > 0) p.cheerT -= dt;
    p.r = 11 * rs.size;

    // 곰방의 필살기: 적에게 뛰어들기
    if (p.leap) {
      const L = p.leap;
      L.t += dt;
      const k = Math.min(1, L.t / L.dur);
      p.x = U.lerp(L.sx, L.tx, k); p.y = U.lerp(L.sy, L.ty, k);
      p.hop = Math.sin(k * Math.PI) * 60;
      p.invuln = Math.max(p.invuln, 0.2);
      if (k >= 1) { p.leap = null; p.hop = 0; L.fn(); }
      return;
    }

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
      const slow = (st.playerSlow ? 0.6 : 1) * (p.swing && rs.weapon.kind === 'swing' ? 0.55 : 1);
      vx = I.mx * rs.move * slow; vy = I.my * rs.move * slow;
    }
    p.moving = Math.abs(vx) + Math.abs(vy) > 5;
    p.x += vx * dt; p.y += vy * dt;
    G.World.collide(p, st.arena);

    if (rs.regen > 0) C().heal(p.maxHp * rs.regen * dt, false);

    // 조준과 바라보는 방향
    if (!p.swing) {
      const locked = updateAim(st, vx, vy);
      if (locked || I.attack) { if (Math.abs(Math.cos(p.aim)) > 0.15) p.face = Math.cos(p.aim) < 0 ? -1 : 1; }
      else if (Math.abs(vx) > 5) p.face = vx < 0 ? -1 : 1;
    }

    // 공격 (버튼·마우스·키를 누르고 있는 동안 연속 공격)
    if (p.swing) updateSwing(st, dt);
    if (I.attack && p.atkCd <= 0 && !p.swing && !p.dash) startAttack(st);

    // 빙글 수호구
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
          C().hitEnemy(e, rs.atk * 0.45 * dmgMul(st), { proc: true, color: '#d8ccff' });
        }
        for (const b of st.eprojs) if (U.dist2(ox, oy, b.x, b.y) < (b.r + 7) * (b.r + 7)) b.dead = true;
      }
    }
    if (st.phase !== 'fight') return;
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
        for (const e of st.enemies) if (!e.dead && segDist(e.x, e.y, p.x, p.y, ex, ey) < 12 + e.r) C().hitEnemy(e, p.beam.dmg, { skill: true, color: '#fff3b0' });
      }
      if (p.beam.t <= 0) p.beam = null;
    }
    // 방패: 탄환 튕겨내기
    if (p.shieldT > 0) {
      for (const b of st.eprojs) if (U.dist2(p.x, p.y, b.x, b.y) < (p.r + 22) * (p.r + 22)) { b.dead = true; G.Fx.burst(b.x, b.y, '#9be7ff', 3, 60, 2); }
    }
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
  function dash() {
    const st = R();
    if (!st || st.paused || !st.active) return;
    const p = st.player, rs = st.rs;
    if (p.dead || p.dashCd > 0 || p.dash || p.leap) return;
    let dx = G.Input.mx, dy = G.Input.my;
    if (Math.abs(dx) + Math.abs(dy) < 0.1) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
    const l = Math.hypot(dx, dy) || 1;
    p.dash = { t: 0.17, dx: dx / l, dy: dy / l };
    p.dashHit = new Set();
    p.swing = null;
    p.invuln = Math.max(p.invuln, 0.28);
    p.dashCd = 2.2 * (1 - 0.3 * rs.dashLv) * (rs.uniq.windDash ? 0.6 : 1) * rs.dashCdM;
    st.dashCdMax = p.dashCd;
    if (rs.uniq.windDash) p.windT = 1;
    if (rs.fx.phantom) p.phantom = true;
    if (rs.fx.stormeye) {
      C().blast(p.x, p.y, 70, rs.atk * 1.5, { color: '#c9b8ff' });
      G.Fx.ring(p.x, p.y, 10, 70, '#c9b8ff', 0.3, 4);
      G.Sfx.play('zap');
    }
    G.Sfx.play('dash');
  }

  function potion() {
    const st = R();
    if (!st || st.paused || !st.active) return;
    const p = st.player;
    if (p.dead || st.potions <= 0 || p.hp >= p.maxHp * 0.99) return;
    st.potions--;
    C().heal(p.maxHp * (0.3 + 0.04 * G.Save.data.potionLv), true);
    G.Fx.ring(p.x, p.y, 10, 60, '#ff8fab', 0.5, 4);
    G.Sfx.play('heal');
  }

  // 필살기: 게이지가 가득 차면
  function ult() {
    const st = R();
    if (!st || st.paused || !st.active || st.phase !== 'fight') return false;
    const p = st.player;
    if (p.dead || p.ult < 1 || p.leap) return false;
    p.ult = 0;
    const h = G.HEROES[p.hero];
    G.Heroes.cutin(h.name, h.ult.name, p.look, p.hero, '#ffd166');
    G.Heroes.castUlt(p);
    return true;
  }

  function skill() {
    const st = R();
    if (!st || st.paused || !st.active || st.phase !== 'fight') return false;
    const p = st.player, rs = st.rs;
    if (p.dead || st.skillCd > 0) return false;
    const key = G.Save.data.skills.eq[0];
    const def = G.ACTIVE_SKILLS[key];
    if (!def) return false;
    G.Assets.trigger(p, 'cast', true);
    const lv = G.Save.data.skills.lv[key] || 1;
    const cd = def.cd * (1 - rs.cdr) * (1 - 0.04 * (lv - 1));
    st.skillCd = cd;
    st.skillCdMax = cd;
    const mult = (def.dmg || 0) * (1 + 0.2 * (lv - 1)) * dmgMul(st);
    const atk = rs.atk;
    G.Sfx.play('skill');
    G.Fx.text(p.x, p.y - 34, def.name, '#fff3b0', 12, { force: true, life: 0.8 });
    switch (key) {
      case 'spin':
        C().blast(p.x, p.y, 92 * rs.size, atk * mult, { skill: true, proc: true });
        for (const b of st.eprojs) if (U.dist2(p.x, p.y, b.x, b.y) < 92 * 92) b.dead = true;
        st.swings.push({ x: p.x, y: p.y, ang: 0, arc: TAU, r: 92 * rs.size, t: 0.3, max: 0.3, color: '#bff4ff', spin: true });
        G.Fx.ring(p.x, p.y, 10, 95, '#ffffff', 0.3, 5);
        G.Fx.shake(3);
        break;
      case 'heal':
        C().heal(p.maxHp * (def.heal + 0.05 * (lv - 1)), true);
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
  function weaponColor(rs) {
    const it = rs.weaponItem;
    return it ? G.THEMES[it.theme].color : '#c9ced8';
  }

  function draw(ctx, p, st) {
    const rs = st.rs;
    const blink = p.invuln > 0 && !p.dash && Math.floor(p.t * 20) % 2 === 0 && p.invuln < 0.6;
    const alpha = blink ? 0.45 : 1;
    const hop = (p.hop || 0) + (p.cheerT > 0 ? Math.abs(Math.sin(p.cheerT * 9)) * 12 : 0);
    const color = weaponColor(rs);
    if (p.ult >= 1 && st.phase === 'fight') {
      const g = 0.5 + Math.sin(p.t * 8) * 0.5;
      G.Art.ell(ctx, p.x, p.y + p.r * 0.9, p.r * (1.3 + g * 0.2), p.r * 0.45);
      ctx.strokeStyle = `rgba(255,214,102,${0.5 + g * 0.5})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    drawTrail(ctx, p, rs, color);
    // 무기가 몸 뒤쪽(위)에 있을 때는 먼저 그려요
    const wa = weaponAngle(p, rs);
    const behind = Math.sin(wa) < -0.25;
    if (behind) drawWeapon(ctx, p, rs, color, wa, hop);
    if (!G.Assets.drawEnt(ctx, p.hero === 'mochi' ? 'hero' : p.hero, p, p.moving ? 'walk' : 'idle', p.x, p.y - hop + p.r, p.r * 2.6, p.face < 0, alpha, p.flash)) {
      G.Art.creature(ctx, p.look, p.x, p.y, p.r, { t: p.t, moving: p.moving, face: p.face, flash: p.flash, alpha, seed: 0, hop, squash: p.attackAnim > 0.5 ? 0.08 : 0 });
    }
    if (!behind) drawWeapon(ctx, p, rs, color, wa, hop);
    if (p.bubble > 0) {
      ctx.beginPath();
      ctx.arc(p.x, p.y - hop, p.r + 8, 0, TAU);
      ctx.fillStyle = 'rgba(155,231,255,0.18)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(155,231,255,0.8)';
      ctx.stroke();
    }
    if (p.shieldT > 0) {
      ctx.beginPath();
      ctx.arc(p.x, p.y - hop, p.r + 16 + Math.sin(p.t * 12) * 2, 0, TAU);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(190,240,255,0.25)';
      ctx.fill();
    }
    if (rs.orbit > 0) {
      const R0 = 46 * rs.size;
      for (let i = 0; i < rs.orbit; i++) {
        const a = p.orbitA + (i / rs.orbit) * TAU;
        const x = p.x + Math.cos(a) * R0, y = p.y + Math.sin(a) * R0;
        G.Art.circ(ctx, x, y, 6);
        ctx.fillStyle = ['#c3a6ff', '#9be7ff', '#ffd166', '#ff8fab'][i % 4];
        ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = G.Art.OL; ctx.stroke();
        G.Art.circ(ctx, x - 2, y - 2, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
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

  // 지금 무기가 가리키는 각도
  function weaponAngle(p, rs) {
    const sw = p.swing, W = rs.weapon;
    if (sw) {
      const mv = sw.mv, k = U.clamp(sw.t / sw.dur, 0, 1);
      if (sw.cur != null && (mv.type === 'arc' || mv.type === 'spin' || mv.type === 'whip')) return sw.cur;
      if (mv.type === 'smash') return sw.aim - sw.dir * (k < 0.45 ? 1.9 * easeOut(k / 0.45) : 1.9 * (1 - easeOut((k - 0.45) / 0.25)));
      return sw.aim;
    }
    if (W.kind === 'proj') return p.aim;
    // 쉬는 자세: 바라보는 쪽으로 무기를 비스듬히 들고 있어요
    return p.face > 0 ? -0.9 : Math.PI + 0.9;
  }

  function drawWeapon(ctx, p, rs, color, ang, hop) {
    const W = rs.weapon, sw = p.swing;
    // 채찍: 휘두르는 동안 손에서 끝까지 이어진 줄을 그려요
    if (sw && sw.mv.type === 'whip' && sw.cur != null && sw.t < sw.dur) {
      const hx = p.x + Math.cos(ang) * p.r * 0.5, hy = p.y - hop + Math.sin(ang) * p.r * 0.4;
      const tx = p.x + Math.cos(ang) * sw.range, ty = p.y + Math.sin(ang) * sw.range;
      const bend = -sw.dir * sw.range * 0.18;
      const mx = (hx + tx) / 2 + Math.cos(ang + Math.PI / 2) * bend, my = (hy + ty) / 2 + Math.sin(ang + Math.PI / 2) * bend;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(mx, my, tx, ty);
      ctx.lineWidth = 4.5; ctx.strokeStyle = G.Art.OL; ctx.stroke();
      ctx.lineWidth = 2.2; ctx.strokeStyle = color; ctx.stroke();
      G.Art.circ(ctx, tx, ty, 3.5); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
    }
    const bob = p.moving && !sw ? Math.abs(Math.sin(p.t * 11)) * p.r * 0.2 : 0;
    let reach = p.r * 0.55;
    if (sw && sw.mv.type === 'thrust') reach += (sw.ext || 0) * Math.min(18, sw.range * 0.25);
    ctx.save();
    ctx.translate(p.x + Math.cos(ang) * reach, p.y - hop - bob + Math.sin(ang) * reach * 0.8 + 2);
    ctx.rotate(ang);
    const s = p.r * W.len * (sw ? 1.35 : 1.05) * Math.sqrt(rs.size);
    G.Art.weapon(ctx, rs.wtype, color, s);
    ctx.restore();
  }

  // 칼날이 지나간 자리: 하얀 초승달 궤적
  function drawTrail(ctx, p, rs, color) {
    const sw = p.swing;
    if (!sw) return;
    const mv = sw.mv, k = sw.t / sw.dur;
    const fade = k > 1 ? Math.max(0, 1 - (sw.t - sw.dur) / 0.1) : 1;
    const tint = G.U.shade(color, 0.6);
    ctx.save();
    if (mv.type === 'thrust') {
      const len = sw.range * (sw.ext || 0), w = (mv.w || 16) * rs.size;
      ctx.translate(p.x, p.y);
      ctx.rotate(sw.aim);
      ctx.globalAlpha = 0.7 * fade;
      ctx.beginPath();
      ctx.moveTo(p.r * 0.4, -w * 0.45);
      ctx.lineTo(len, 0);
      ctx.lineTo(p.r * 0.4, w * 0.45);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.globalAlpha = 0.45 * fade;
      ctx.fillStyle = tint;
      ctx.fillRect(p.r * 0.4, -w * 0.12, len * 0.92, w * 0.24);
    } else if (mv.type === 'smash') {
      // 내려찍기는 충격파(이펙트)로 보여 줘요
    } else if (sw.cur != null) {
      const outer = sw.range, inner = mv.type === 'whip' ? outer * 0.72 : outer * 0.5;
      const span = Math.min(Math.abs(sw.cur - sw.a0), mv.type === 'spin' ? 2.6 : 1.9);
      const n = 7;
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const aA = sw.cur - sw.dir * span * t0, aB = sw.cur - sw.dir * span * t1;
        ctx.globalAlpha = (1 - t0) * 0.9 * fade;
        ctx.beginPath();
        ctx.arc(p.x, p.y, outer, aA, aB, sw.dir > 0);
        ctx.arc(p.x, p.y, inner + (outer - inner) * t1 * 0.6, aB, aA, sw.dir <= 0);
        ctx.closePath();
        ctx.fillStyle = i < 2 ? '#ffffff' : tint;
        ctx.fill();
      }
      // 칼끝 선: 궤적 바깥쪽을 또렷하게
      ctx.globalAlpha = 0.9 * fade;
      ctx.beginPath();
      ctx.arc(p.x, p.y, outer, sw.cur, sw.cur - sw.dir * span * 0.7, sw.dir > 0);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
    ctx.restore();
  }

  return { create, update, draw, dash, potion, skill, ult, segDist, nearestTarget, aimRange };
})();
