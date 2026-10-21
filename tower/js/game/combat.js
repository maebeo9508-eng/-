'use strict';
// 전투 규칙: 피해, 상태이상(화상·중독·둔화·빙결·번개), 처치 보상, 플레이어 피격
G.Combat = (function () {
  const U = G.U, TAU = U.TAU;
  const R = () => G.Run.st;

  // ── 적 생성 ─────────────────────────────────────────────
  function makeEnemy(type, x, y, opts) {
    opts = opts || {};
    const st = R();
    const isBoss = !!opts.boss;
    const def = isBoss ? G.BOSSES[type] : G.MONSTERS[type];
    const S = G.S(st.floor);
    const elite = !!opts.elite;
    const hpMul = (elite ? 5 : 1) * (opts.hpMul || 1) * (G.isEndless(st.floor) ? 1.25 : 1);
    const e = {
      id: U.uid(), type, def, name: def.name, boss: isBoss, elite,
      x, y, r: def.r * (elite ? 1.45 : 1) * (opts.small ? 0.75 : 1),
      maxHp: def.hp * S * hpMul * (opts.small ? 0.5 : 1),
      atk: def.atk * S * 1.35 * (elite ? 1.35 : 1),
      spd: def.spd * (elite ? 1.05 : 1) * (1 + 0.025 * (G.stageOf(st.floor).id - 1)),
      ai: isBoss ? 'boss' : def.ai,
      look: def.look,
      t: Math.random() * 10, seed: Math.random() * 5,
      vx: 0, vy: 0, kx: 0, ky: 0, face: 1, moving: false,
      s: {}, cd: U.rand(0.6, def.cd || 2),
      contactCd: 0.6, flash: 0, spawnT: 0.35,
      burn: null, poison: null, slowT: 0, slowAmt: 0, frozenT: 0, freezeCd: 0,
      dead: false, burrowed: false, alpha: 1, hop: 0,
      exp: (def.exp || 1) * (elite ? 6 : 1) * (isBoss ? 40 : 1),
    };
    e.hp = e.maxHp;
    if (isBoss) G.Bosses.init(e);
    G.Save.data.dex[type] = 1;
    return e;
  }

  // 등장 예고(반짝이는 표시 후 등장)
  function queueSpawn(type, x, y, opts, delay) {
    R().spawns.push({ type, x, y, opts: opts || {}, t: delay != null ? delay : 0.75, max: delay != null ? delay : 0.75 });
  }

  // ── 플레이어 → 적 ──────────────────────────────────────
  // o: { proc: 원소 효과 적용, skill: 스킬 피해, ally: 동료/펫 피해, color, noCrit, knock: [x,y,세기] }
  function hitEnemy(e, dmg, o) {
    o = o || {};
    if (e.dead || e.burrowed || e.spawnT > 0 || e.invuln) return 0;
    const st = R(), rs = st.rs;
    let d = dmg;
    if (e.boss || e.elite) d *= 1 + rs.bossDmg;
    if (o.skill) d *= 1 + rs.skillDmg;
    if (o.ally) d *= 1 + rs.allyDmg;
    if (e.frozenT > 0) d *= 1.2;
    let crit = false;
    if (!o.noCrit && Math.random() < rs.crit) { crit = true; d *= rs.critDmg; }
    e.hp -= d;
    e.flash = 0.09;
    if (o.knock && !e.boss) {
      const k = o.knock[2] * (e.elite ? 0.4 : 1);
      e.kx += o.knock[0] * k;
      e.ky += o.knock[1] * k;
    }
    if (crit) {
      G.Fx.text(e.x, e.y - e.r, U.fmt(d) + '!', '#ffd23f', 15, { crit: true });
      G.Sfx.play('crit');
    } else {
      G.Fx.text(e.x, e.y - e.r, U.fmt(d), o.color || '#ffffff', 11);
      G.Sfx.play('hit');
    }
    st.gained.dmg += d;
    // 흡혈 (한 번에 최대 체력 3%까지)
    if (!o.ally && rs.vamp > 0) heal(Math.min(st.player.maxHp * 0.03, d * rs.vamp), false);
    if (o.proc) procs(e, d, o);
    if (e.hp <= 0) kill(e, o);
    return d;
  }

  function procs(e, d, o) {
    const st = R(), rs = st.rs;
    const u = rs.uniq;
    let burn = rs.burn, frost = rs.frost, poison = rs.poison, shock = rs.shock;
    if (o.rainbow) { const k = U.randi(0, 3); if (k === 0) burn += 0.5; else if (k === 1) frost += 0.5; else if (k === 2) poison += 0.5; else shock += 0.3; }
    if (burn > 0 && Math.random() < burn) {
      const dps = d * 0.35;
      if (!e.burn || e.burn.dps < dps) e.burn = { t: 3, dps, tick: 0.5 };
      else e.burn.t = 3;
    }
    if (poison > 0 && Math.random() < poison) {
      addPoison(e, u.doublePoison && o.spear ? 2 : 1);
    }
    if ((frost > 0 && Math.random() < frost) || (u.freezeHit && Math.random() < 0.15)) {
      e.slowT = 2;
      e.slowAmt = 0.4;
      const fr = (st.abilities.frost || 0) * 0.07 + (u.freezeHit ? 0.15 : 0);
      if (!e.boss && e.freezeCd <= 0 && Math.random() < fr) freeze(e, 1.2);
    }
    if (shock > 0 && !o.chain && Math.random() < shock) chain(e, d * 0.6, 3);
  }

  function addPoison(e, n) {
    const st = R();
    if (!e.poison) e.poison = { stacks: 0, t: 0, tick: 0.5 };
    e.poison.stacks = Math.min(5, e.poison.stacks + n);
    e.poison.t = 4;
    e.poison.dps = st.rs.atk * 0.14;
  }

  function freeze(e, t) {
    e.frozenT = t;
    e.freezeCd = 3;
    G.Sfx.play('freeze');
    G.Fx.burst(e.x, e.y, ['#bff4ff', '#ffffff'], 6, 80, 3, { shape: 'square' });
  }

  function chain(from, dmg, n) {
    const st = R();
    let cur = from;
    const hit = new Set([from.id]);
    for (let i = 0; i < n; i++) {
      let best = null, bd = 110 * 110;
      for (const e of st.enemies) {
        if (e.dead || hit.has(e.id) || e.burrowed) continue;
        const d2 = U.dist2(cur.x, cur.y, e.x, e.y);
        if (d2 < bd) { bd = d2; best = e; }
      }
      if (!best) break;
      st.bolts.push({ x1: cur.x, y1: cur.y, x2: best.x, y2: best.y, t: 0.18 });
      hit.add(best.id);
      hitEnemy(best, dmg, { chain: true, color: '#c9b8ff', noCrit: true });
      cur = best;
    }
    G.Sfx.play('zap');
  }

  // 아군 폭발/광역 피해
  function blast(x, y, r, dmg, o) {
    const st = R();
    for (const e of st.enemies) {
      if (e.dead) continue;
      if (U.dist2(x, y, e.x, e.y) < (r + e.r) * (r + e.r)) {
        const a = U.angleTo(x, y, e.x, e.y);
        hitEnemy(e, dmg, Object.assign({ knock: [Math.cos(a), Math.sin(a), 160] }, o || {}));
      }
    }
  }

  function updateEnemyStatus(e, dt) {
    if (e.flash > 0) e.flash -= dt;
    if (e.freezeCd > 0) e.freezeCd -= dt;
    if (e.frozenT > 0) e.frozenT -= dt;
    if (e.slowT > 0) e.slowT -= dt;
    if (e.burn) {
      e.burn.t -= dt;
      e.burn.tick -= dt;
      if (e.burn.tick <= 0) {
        e.burn.tick = 0.5;
        dot(e, e.burn.dps * 0.5, '#ff9f1c');
        if (Math.random() < 0.6) G.Fx.burst(e.x, e.y - e.r * 0.5, ['#ff9f1c', '#ffd166'], 2, 30, 2.5, { up: 30 });
      }
      if (e.burn && e.burn.t <= 0) e.burn = null;
    }
    if (e.poison) {
      e.poison.t -= dt;
      e.poison.tick -= dt;
      if (e.poison.tick <= 0) {
        e.poison.tick = 0.5;
        dot(e, e.poison.dps * e.poison.stacks * 0.5, '#8be36b');
      }
      if (e.poison && e.poison.t <= 0) e.poison = null;
    }
  }

  function dot(e, d, color) {
    if (e.dead) return;
    if (e.boss || e.elite) d *= 1 + R().rs.bossDmg;
    e.hp -= d;
    G.Fx.text(e.x + U.rand(-8, 8), e.y - e.r * 0.4, U.fmt(d), color, 10);
    if (e.hp <= 0) kill(e, {});
  }

  function speedMul(e) {
    if (e.frozenT > 0) return 0;
    let m = 1;
    if (e.slowT > 0) m *= 1 - e.slowAmt * (e.boss ? 0.5 : 1);
    const st = R();
    if (st.slowAura && U.dist2(e.x, e.y, st.slowAura.x, st.slowAura.y) < st.slowAura.r * st.slowAura.r) m *= 1 - st.slowAura.amt;
    return m;
  }

  // ── 처치 ─────────────────────────────────────────────────
  function kill(e, o) {
    if (e.dead) return;
    e.dead = true;
    const st = R(), rs = st.rs;
    st.gained.kills++;
    G.Save.data.stats.kills++;
    const col = e.look.color;
    G.Fx.burst(e.x, e.y, [col, '#ffffff', '#fff3b0'], e.boss ? 40 : e.elite ? 20 : 9, e.boss ? 260 : 150, e.boss ? 6 : 3.5, { shape: 'star' });
    G.Fx.ring(e.x, e.y, e.r * 0.5, e.r * 1.6, '#ffffff', 0.3, 3);
    G.Sfx.play(e.boss ? 'boom' : 'pop');
    if (e.boss) { G.Run.onBossKilled(e); return; }

    // 경험치 구슬
    const expVal = Math.max(1, Math.round(e.exp * 1.5 * (1 + st.floor * 0.05)));
    const pieces = e.elite ? 5 : 1;
    for (let i = 0; i < pieces; i++) G.Run.drop('exp', e.x, e.y, Math.ceil(expVal / pieces));
    // 골드
    if (Math.random() < (e.elite ? 1 : 0.42)) {
      const g = Math.ceil((1 + st.floor * 0.25) * (e.elite ? 8 : 1) * (1 + rs.goldP));
      G.Run.drop('gold', e.x, e.y, g);
    }
    if (Math.random() < 0.025) G.Run.drop('heart', e.x, e.y, 0.12);
    // 장비/룬
    const luck = rs.luck;
    if (Math.random() < (e.elite ? 0.45 : 0.006) * (1 + luck)) {
      G.Run.drop('item', e.x, e.y, G.Loot.randomItem(st.floor, luck + (e.elite ? 0.3 : 0)));
    }
    if (Math.random() < (e.elite ? 0.3 : 0.004) * (1 + luck * 0.5)) {
      G.Run.drop('rune', e.x, e.y, G.Loot.makeRune(null, G.Loot.runeGradeFor(st.floor)));
    }
    if (e.elite && Math.random() < 0.15) G.Run.drop('gem', e.x, e.y, U.randi(1, 2));

    if (rs.killheal > 0) heal(st.player.maxHp * rs.killheal, false);
    if (rs.explode > 0) {
      G.Fx.ring(e.x, e.y, 5, 42 + rs.explode * 8, '#ffb347', 0.25, 4);
      blast(e.x, e.y, 40 + rs.explode * 8, rs.atk * (0.5 + 0.3 * rs.explode), { color: '#ffb347', noCrit: true });
    }
    if (e.def.deathZone) G.Run.addHazard(e.x, e.y, 30, 3, e.atk * 0.6, 'fire');
    if (e.def.split && !e.small) {
      for (let i = 0; i < 2; i++) {
        const ne = makeEnemy(e.def.split, e.x + U.rand(-10, 10), e.y + U.rand(-10, 10), { small: true });
        ne.small = true;
        ne.spawnT = 0.1;
        st.enemies.push(ne);
      }
    }
    if (e.elite) {
      // 엘리트는 쓰러지며 별 탄환을 뿌립니다
      ring(e.x, e.y, 10, { type: 'star', color: '#ffd166', speed: 110, r: 5 }, e.atk * 0.6);
    }
    if (e.ai === 'bomber' && !e.s.exploded && !o.self) { /* 터지기 전에 잡으면 폭발 없음 */ }
  }

  // ── 적 탄환 ───────────────────────────────────────────────
  function bullet(x, y, ang, proj, dmg) {
    const st = R();
    const spd = (proj.speed || 130) * (st.bulletSpeed || 1);
    st.eprojs.push({
      x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r: proj.r || 5, dmg,
      type: proj.type || 'ball', color: proj.color || '#ff8fab', life: 6, slow: proj.slow || 0, boom: proj.boom || 0, rot: ang, t: 0,
    });
  }
  function fan(x, y, ang, n, spread, proj, dmg) {
    if (n <= 1) { bullet(x, y, ang, proj, dmg); return; }
    for (let i = 0; i < n; i++) bullet(x, y, ang - spread / 2 + (spread * i) / (n - 1), proj, dmg);
  }
  function ring(x, y, n, proj, dmg, off) {
    for (let i = 0; i < n; i++) bullet(x, y, (off || 0) + (i / n) * TAU, proj, dmg);
  }

  // ── 플레이어 피격 / 회복 ──────────────────────────────────
  function damagePlayer(raw, src) {
    const st = R();
    const p = st.player, rs = st.rs;
    if (p.dead || p.invuln > 0 || st.phase === 'clear' || st.phase === 'portal') return false;
    if (p.shieldT > 0) return false;
    if (Math.random() < rs.dodge) {
      G.Fx.text(p.x, p.y - 20, '회피!', '#7ed9c3', 12, { force: true });
      p.invuln = 0.25;
      return false;
    }
    if (p.bubble > 0) {
      p.bubble--;
      p.invuln = 0.35;
      G.Fx.ring(p.x, p.y, 10, 34, '#9be7ff', 0.35, 4);
      G.Sfx.play('shield');
      return false;
    }
    const S = G.S(st.floor);
    const red = Math.min(0.7, rs.def / (rs.def + 30 * S));
    const d = raw * (1 - red) * (1 - rs.dmgRed) * (p.healBuffT > 0 ? 0.7 : 1);
    p.hp -= d;
    p.flash = 0.15;
    p.invuln = 0.5;
    st.hitFlash = 0.25;
    G.Fx.text(p.x, p.y - 22, '-' + U.fmt(d), '#ff6b6b', 13, { force: true });
    G.Fx.shake(5);
    G.Sfx.play('hurt');
    G.Sfx.vibe(25);
    if (rs.uniq.jellyShield && Math.random() < 0.15) p.bubble = Math.max(p.bubble, 1);
    if (p.hp <= 0) G.Run.onPlayerDown();
    return true;
  }

  function heal(amt, show) {
    const p = R().player;
    if (p.dead || amt <= 0) return;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amt);
    if (show && p.hp - before >= 1) {
      G.Fx.text(p.x, p.y - 24, '+' + U.fmt(p.hp - before), '#7ee081', 13, { force: true });
      G.Fx.burst(p.x, p.y, '#ff8fab', 5, 60, 4, { shape: 'heart', up: 40 });
    }
  }

  return {
    makeEnemy, queueSpawn, hitEnemy, blast, chain, freeze, addPoison, updateEnemyStatus, speedMul, kill,
    bullet, fan, ring, damagePlayer, heal,
  };
})();
