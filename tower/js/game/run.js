'use strict';
// 탑 오르기 한 판(런): 층 생성 → 웨이브 → 클리어 → 문 선택 → 다음 층
G.PORTALS = {
  battle: { icon: '⚔️', name: '전투', color: '#ff8fab', desc: '골드' },
  danger: { icon: '💀', name: '위험', color: '#ff4d6d', desc: '엘리트 · 장비 상자' },
  treasure: { icon: '🎁', name: '보물', color: '#ffd166', desc: '보물 상자' },
  rest: { icon: '⛲', name: '샘터', color: '#7ed9c3', desc: '체력 회복' },
  shop: { icon: '🛒', name: '상점', color: '#8ecbff', desc: '너굴 상점' },
  shrine: { icon: '✨', name: '축복', color: '#b9a6ff', desc: '능력 선택' },
  boss: { icon: '👑', name: '보스', color: '#ff9f1c', desc: '스테이지 보스' },
  home: { icon: '🏠', name: '마을로', color: '#ffffff', desc: '전리품 챙겨 귀환' },
};

G.Run = (function () {
  const U = G.U, TAU = U.TAU;
  const C = () => G.Combat;
  let st = null;

  const expNeed = (lv) => Math.floor(4 + lv * 4 + lv * lv * 0.5);

  function start(startFloor) {
    const save = G.Save.data;
    save.stats.runs++;
    const meta = G.Stats.meta(save);
    st = {
      active: true, floor: startFloor, startFloor, meta, abilities: {}, rs: null,
      lv: 1, exp: 0, expNext: expNeed(1), pendingLv: 0,
      potions: meta.potions, revives: meta.revive, rerolls: meta.choices >= 1 ? 1 : 0,
      skillCd: [0, 0], skillCdMax: [1, 1], dashCdMax: 2.4,
      gained: { gold: 0, gems: 0, shards: 0, items: [], runes: [], kills: 0, floors: 0, dmg: 0, bosses: 0 },
      time: 0, phase: 'fight', paused: false, clearT: 0,
      enemies: [], corpses: [], spawns: [], projs: [], eprojs: [], pickups: [], allies: [], zones: [], props: [], portals: [], swings: [], bolts: [], timers: [],
      arena: null, stage: null, room: 'battle', waves: null,
      cam: { x: 0, y: 0 }, hitFlash: 0, banner: null, playerSlow: false, taunters: [], slowAura: null,
      auto: save.settings.auto !== false, speed: save.settings.speed || 1, slowmo: 0, cutin: null, doorAsked: false,
    };
    st.rs = G.Stats.run(meta, st.abilities);
    st.player = G.Player.create(0, 0, st.rs);
    st.allies = G.Allies.create(st);
    // 동료 수만큼 적도 튼튼하고 많아집니다
    const n = st.allies.filter((a) => a.kind === 'comp').length;
    st.teamHp = 1 + 0.5 * n;
    st.teamAtk = 1 + 0.15 * n;
    st.teamCount = 1 + 0.2 * n;
    st.teamBoss = 1 + 0.25 * n;
    G.Fx.clear();
    enterFloor(startFloor, 'battle');
    G.HUD.show(st);
    if (!save.seen.tutorial) {
      save.seen.tutorial = true;
      G.UI.dialogue(G.STORY.tutorial);
    }
    return st;
  }

  function groundRes() { return Math.min(2.5, G.View.scale * G.View.dpr); }

  // ── 층 입장 ─────────────────────────────────────────────
  function enterFloor(n, room) {
    const save = G.Save.data;
    st.floor = n;
    st.room = room;
    const prevStage = st.stage;
    st.stage = G.stageOf(n);
    st.arena = G.World.makeArena(room, n, st.stage);
    G.World.renderGround(st.arena, st.stage, groundRes());
    for (const k of ['enemies', 'corpses', 'spawns', 'projs', 'eprojs', 'pickups', 'zones', 'props', 'portals', 'swings', 'bolts', 'timers']) st[k] = [];
    st.allies = st.allies.filter((a) => a.kind === 'pet' || a.kind === 'comp');
    const p = st.player;
    // 쓰러진 팀원은 다음 층에서 체력 30%로 다시 일어나요
    if (p.dead) G.Team.revive(p, 0.3);
    for (const a of st.allies) if (a.kind === 'comp' && a.down) G.Team.revive(a, 0.3);
    p.x = st.arena.w / 2; p.y = st.arena.h - 80; p.invuln = Math.max(p.invuln, 1); p.dash = null; p.queue = [];
    G.Allies.formation(st);
    st.cam.x = p.x - G.View.vw / 2; st.cam.y = p.y - G.View.vh / 2;
    st.phase = 'fight';
    st.waves = null;
    st.boss = null;
    st.doorAsked = false;
    st.cutin = null;
    // 높은 스테이지일수록 탄환이 빨라집니다
    st.bulletSpeed = 1 + 0.035 * (st.stage.id - 1 + (n > 100 ? 4 : 0));

    const endless = G.isEndless(n) ? ' · 끝없는 탑' : '';
    st.banner = { text: `${n}층`, sub: `${st.stage.name}${endless}`, t: 2.2, max: 2.2 };

    switch (room) {
      case 'battle':
      case 'danger':
        st.waves = makeWaves(n, room);
        break;
      case 'boss': {
        const b = G.BOSSES[st.stage.boss];
        st.banner = { text: b.name, sub: b.title, t: 2.6, max: 2.6, boss: true };
        st.waves = { list: [[{ type: st.stage.boss, boss: true }]], idx: -1, delay: 1.4, lastCount: 1 };
        G.Sfx.play('boss');
        break;
      }
      case 'rest':
        st.props.push({ kind: 'fountain', x: st.arena.w / 2, y: st.arena.h * 0.42, r: 26, used: false, t: 0 });
        roomCleared(false);
        break;
      case 'shop':
        st.props.push({ kind: 'merchant', x: st.arena.w / 2, y: st.arena.h * 0.42, r: 14, armed: true, t: 0, stock: G.UI.makeRunShop(st) });
        roomCleared(false);
        break;
      case 'shrine':
        st.props.push({ kind: 'shrine', x: st.arena.w / 2, y: st.arena.h * 0.42, r: 18, used: false, t: 0 });
        roomCleared(false);
        break;
      case 'treasure':
        st.props.push({ kind: 'chest', x: st.arena.w / 2, y: st.arena.h * 0.42, r: 14, rar: 1, opened: false, t: 0 });
        burstGold(st.arena.w / 2, st.arena.h * 0.42, (6 + n * 2) * (1 + st.rs.goldP), 8);
        roomCleared(false);
        break;
    }

    // 스테이지 첫 층에서 이야기 대사
    const sid = st.stage.id;
    if (prevStage !== st.stage && (n - 1) % 10 === 0) {
      const key = n > 100 ? 'endless' : 'stage' + sid;
      if (!save.seen[key]) {
        save.seen[key] = true;
        G.UI.dialogue(n > 100 ? G.STORY.endless : G.STORY.stages[sid].intro);
      }
    }
    if (room === 'boss') {
      const key = 'boss' + sid + (n > 100 ? 'e' : '');
      if (!save.seen[key]) {
        save.seen[key] = true;
        G.UI.dialogue(G.STORY.stages[sid].boss);
      }
    }
    G.HUD.floor(st);
  }

  function makeWaves(n, room) {
    const stage = G.stageOf(n);
    const idx = (n - 1) % 10;
    const types = stage.monsters.slice(0, idx < 3 ? 2 : idx < 6 ? 3 : 4);
    let waves = n <= 3 ? 2 : 3;
    if (room === 'danger') waves++;
    let count = Math.min(15, 4 + Math.floor(idx * 0.6) + Math.floor(Math.min(n, 100) / 9));
    if (room === 'danger') count = Math.round(count * 1.3);
    if (G.isEndless(n)) count += 2;
    count = Math.round(count * (st.teamCount || 1));
    const list = [];
    for (let w = 0; w < waves; w++) {
      const wave = [];
      const c = count + (w === waves - 1 ? 1 : 0) - (w === 0 && n <= 2 ? 1 : 0);
      for (let i = 0; i < c; i++) wave.push({ type: U.pick(types) });
      list.push(wave);
    }
    const last = list[list.length - 1];
    if (n % 10 === 5 || room === 'danger') last.push({ type: U.pick(types), elite: true });
    if (room === 'danger' && n > 40) last.push({ type: U.pick(types), elite: true });
    return { list, idx: -1, delay: 0.9, lastCount: 0 };
  }

  function spawnWave() {
    const w = st.waves;
    w.idx++;
    const wave = w.list[w.idx];
    w.lastCount = wave.length;
    const c = G.Team.centroid(st);
    wave.forEach((m, i) => {
      if (m.boss) {
        C().queueSpawn(m.type, st.arena.w / 2, st.arena.h * 0.3, { boss: true }, 1.0);
        return;
      }
      // 적은 방 위쪽에서 무리 지어 나타나 팀과 맞붙어요
      const pt = G.World.freePoint(st.arena, c.x, c.y, 150, 28, st.arena.h * 0.6);
      C().queueSpawn(m.type, pt.x, pt.y, { elite: m.elite }, 0.75 + i * 0.04);
    });
  }

  // ── 층 클리어 ───────────────────────────────────────────
  function roomCleared(fight) {
    const save = G.Save.data;
    st.phase = 'clear';
    st.clearT = 0;
    if (fight) {
      st.gained.floors++;
      st.gained.shards++;
      save.shards++;
      save.best = Math.max(save.best, st.floor);
      for (const b of st.eprojs) G.Fx.burst(b.x, b.y, '#ffffff', 2, 40, 2);
      st.eprojs = [];
      st.zones = st.zones.filter((z) => z.friendly);
      G.Sfx.play('clear');
      st.banner = { text: '승리!', sub: '', t: 1.2, max: 1.2, small: true };
      cheer();
      if (st.rs.clearHeal) G.Team.healAll(st.rs.clearHeal, true);
      if (st.room === 'battle') burstGold(st.player.x, st.player.y - 40, (5 + st.floor * 2) * (1 + st.rs.goldP), 6);
      if (st.room === 'danger') st.props.push({ kind: 'chest', x: st.arena.w / 2, y: st.arena.h * 0.45, r: 14, rar: 2, opened: false, t: 0 });
    } else {
      save.best = Math.max(save.best, st.floor);
    }
    for (const pk of st.pickups) pk.magnet = true;
    st.timers.push({ t: fight ? 1.0 : 0.3, fn: spawnPortals });
    G.Save.persist();
  }

  // 아직 열지 않은 상자, 쓰지 않은 샘·축복이 남았는지
  function propsPending() {
    return st.props.some((o) => (o.kind === 'chest' && !o.opened) || ((o.kind === 'fountain' || o.kind === 'shrine') && !o.used) || (o.kind === 'merchant' && o.armed && (st.auto || st.player.dead)));
  }

  function cheer() {
    st.player.cheerT = 1.4;
    for (const a of st.allies) if (a.kind === 'comp' && !a.down) a.cheerT = 1.4;
  }

  function spawnPortals() {
    const n = st.floor;
    let types;
    if (st.room === 'boss') types = ['battle', 'home'];
    else if (n % 10 === 9) types = ['boss'];
    else {
      const p = st.player;
      const lowHp = p.hp < p.maxHp * 0.5;
      const pool = [
        { t: 'battle', w: 10 },
        { t: 'danger', w: n >= 3 ? 5 : 0 },
        { t: 'treasure', w: n >= 2 ? 2 : 0 },
        { t: 'rest', w: n >= 4 ? (lowHp ? 6 : 2.2) : 0 },
        { t: 'shop', w: n >= 3 ? 2.2 : 0 },
        { t: 'shrine', w: n >= 2 ? 2 : 0 },
      ];
      types = U.weightedN(pool, 2, (x) => x.w).map((x) => x.t);
      if (st.room === 'rest') types.push('home');
    }
    const W = st.arena.w;
    st.portals = types.map((t, i) => ({ type: t, x: (W * (i + 1)) / (types.length + 1), y: 64, r: 22, t: Math.random() * 3 }));
    st.phase = 'portal';
  }

  function takePortal(pt) {
    st.phase = 'transition';
    G.Sfx.play('portal');
    if (pt.type === 'home') {
      G.UI.fade(() => end('return'));
      return;
    }
    G.UI.fade(() => enterFloor(st.floor + 1, pt.type));
  }

  // ── 보스 처치 ───────────────────────────────────────────
  function onBossKilled(e) {
    const save = G.Save.data;
    const sid = st.stage.id;
    const first = !save.cleared[sid] && st.floor <= 100;
    st.gained.bosses++;
    save.stats.bosses++;
    for (const o of st.enemies) if (!o.dead && o !== e) C().kill(o, { self: true });
    st.eprojs = [];
    st.zones = [];
    G.Fx.shake(14);
    G.Sfx.vibe(80);
    const gems = 5 + sid * 2 + (first ? 30 : 0);
    const shards = 5 + (first ? 20 : 0);
    save.gems += gems; st.gained.gems += gems;
    save.shards += shards; st.gained.shards += shards;
    save.checkpoint = Math.max(save.checkpoint, st.floor);
    for (let i = 0; i < 6; i++) drop('exp', e.x, e.y, Math.ceil((e.exp * (1 + st.floor * 0.04)) / 6));
    burstGold(e.x, e.y, (40 + st.floor * 6) * (1 + st.rs.goldP), 14);
    st.props.push({ kind: 'chest', x: e.x - 30, y: e.y + 10, r: 14, rar: 3, opened: false, t: 0 });
    st.props.push({ kind: 'chest', x: e.x + 30, y: e.y + 10, r: 14, rar: 2, opened: false, t: 0 });
    drop('rune', e.x, e.y + 30, G.Loot.makeRune(null, G.Loot.runeGradeFor(st.floor + 20)));

    let unlockMsg = null;
    if (first) {
      save.cleared[sid] = true;
      save.chapters = Math.max(save.chapters, sid + 1 + (sid === 10 ? 1 : 0));
      const v = st.stage.villager;
      if (v && G.COMPANIONS[v] && !save.comps.owned[v]) {
        save.comps.owned[v] = 1;
        // 빈자리가 있으면 바로, 없으면 털실 인형과 교대해서 다음 탑부터 팀에 들어와요
        const team = save.comps.team;
        const doll = team.findIndex((k) => G.COMPANIONS[k] && G.COMPANIONS[k].doll);
        let note = '';
        if (team.length < G.TEAM_SLOTS) team.push(v);
        else if (doll >= 0) { note = ` (${G.COMPANIONS[team[doll]].name}와 교대)`; team[doll] = v; }
        unlockMsg = `동료 「${G.COMPANIONS[v].name}」 합류!${note}`;
      } else if (v && G.PETS[v] && !save.pets.owned[v]) {
        save.pets.owned[v] = 1;
        unlockMsg = `펫 「${G.PETS[v].name}」 합류!`;
      }
      if (sid % 2 === 0 && save.runeSlotsOpen < 6 && sid <= 8) {
        save.runeSlotsOpen++;
        unlockMsg = (unlockMsg ? unlockMsg + ' · ' : '') + '룬 슬롯 +1';
      }
    }
    G.Save.persist();
    st.banner = { text: '스테이지 클리어!', sub: st.stage.name, t: 2.4, max: 2.4 };
    G.Sfx.play('legend');
    st.timers.push({
      t: 1.3,
      fn: () => {
        const go = () => {
          if (unlockMsg) G.UI.toast(unlockMsg, 'big');
          if (first) G.UI.toast(`소설 「${G.CHAPTER_TITLES[sid]}」이 열렸어요!`);
          roomCleared(false);
          st.gained.floors++;
          if (sid === 10 && first) G.UI.toast('끝없는 탑이 열렸어요!', 'big');
        };
        if (first) G.UI.dialogue(G.STORY.stages[sid].clear, go);
        else go();
      },
    });
    st.phase = 'bossdead';
  }

  // ── 쓰러짐 / 종료 ───────────────────────────────────────
  // 모찌가 쓰러져도 동료가 남아 있으면 전투는 계속돼요
  function onPlayerDown() {
    const p = st.player;
    if (p.dead) return;
    p.dead = true;
    p.downAt = p.t;
    p.hp = 0;
    p.dash = null;
    G.Fx.burst(p.x, p.y, ['#ffffff', '#ffb3c6'], 24, 160, 4, { shape: 'star' });
    G.Sfx.play('hurt');
    if (G.Team.members(st).length) {
      G.Fx.text(p.x, p.y - 30, '모찌 기절!', '#ffffff', 14, { force: true });
      G.UI.toast('모찌가 쓰러졌어요! 동료들이 버티는 중… 다음 층에서 일어나요');
      return;
    }
    onTeamWipe();
  }

  function onTeamWipe() {
    if (st.phase === 'dead') return;
    const p = st.player;
    if (st.revives > 0) {
      st.revives--;
      G.Team.reviveAll(0.5);
      p.invuln = 2.2;
      G.Fx.ring(p.x, p.y, 10, 160, '#fff3b0', 0.6, 6);
      G.Fx.text(p.x, p.y - 30, '팀 부활!', '#fff3b0', 18, { force: true });
      st.eprojs = [];
      G.Sfx.play('legend');
      return;
    }
    st.phase = 'dead';
    G.Save.data.stats.deaths++;
    G.Sfx.play('die');
    st.banner = { text: '전멸…', sub: '등불이 모두를 데려다줄 거예요', t: 1.6, max: 1.6 };
    st.timers.push({ t: 1.6, fn: () => end('dead') });
  }

  function hurtUnit(u, dmg) {
    if (u === st.player) C().damagePlayer(dmg);
    else G.Allies.hurt(u, dmg);
  }

  function end(reason) {
    if (!st || !st.active) return;
    st.active = false;
    st.paused = true;
    G.Save.persist();
    G.HUD.hide();
    G.UI.result(st, reason);
  }

  // ── 드롭 / 획득 ─────────────────────────────────────────
  function drop(type, x, y, val) {
    const a = Math.random() * TAU, sp = U.rand(40, 120);
    st.pickups.push({ type, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, val, t: 0, magnet: st.phase === 'clear' || st.phase === 'portal' });
  }

  function burstGold(x, y, total, pieces) {
    total = Math.ceil(total);
    const each = Math.max(1, Math.floor(total / pieces));
    let left = total;
    for (let i = 0; i < pieces && left > 0; i++) {
      const v = i === pieces - 1 ? left : Math.min(each, left);
      drop('gold', x, y, v);
      left -= v;
    }
  }

  function collect(pk) {
    const save = G.Save.data;
    switch (pk.type) {
      case 'exp': addExp(pk.val); G.Sfx.play('exp'); break;
      case 'gold':
        save.gold += pk.val; st.gained.gold += pk.val;
        G.Sfx.play('coin');
        break;
      case 'heart': C().heal(st.player.maxHp * pk.val, true); G.Sfx.play('heal'); break;
      case 'gem': save.gems += pk.val; st.gained.gems += pk.val; G.UI.toast(`💎 보석 +${pk.val}`); G.Sfx.play('chest'); break;
      case 'item':
        G.Loot.addItemToSave(pk.val); st.gained.items.push(pk.val);
        G.UI.toast(`<b style="color:${G.RARITIES[pk.val.rar].color}">[${G.RARITIES[pk.val.rar].name}] ${U.esc(pk.val.name)}</b> 획득!`);
        G.Sfx.play(pk.val.rar >= 4 ? 'legend' : 'chest');
        break;
      case 'rune':
        save.runes.push(pk.val); st.gained.runes.push(pk.val);
        G.UI.toast(`${G.RUNE_TYPES[pk.val.type].icon} ${G.RUNE_TYPES[pk.val.type].name} ${G.RUNE_GRADE_NAMES[pk.val.grade - 1]} 획득!`);
        G.Sfx.play('chest');
        break;
    }
  }

  function addExp(v) {
    st.exp += v * (1 + st.rs.expP);
    while (st.exp >= st.expNext) {
      st.exp -= st.expNext;
      st.lv++;
      st.expNext = expNeed(st.lv);
      st.pendingLv++;
      const l = G.Team.leader(st);
      G.Fx.text(l.x, l.y - 34, 'LEVEL UP!', '#fff3b0', 14, { force: true, life: 1.1 });
      G.Fx.ring(l.x, l.y, 10, 60, '#fff3b0', 0.5, 4);
    }
  }

  // ── 레벨업 능력 ─────────────────────────────────────────
  function autoLevel() {
    const n = 3 + (st.meta.choices >= 2 ? 1 : 0);
    const ch = abilityChoices(n);
    if (!ch.length) return;
    const a = G.Team.autoAbility(ch);
    applyAbility(a.id);
    G.UI.toast(`자동 선택: ${a.icon} ${a.name}`);
    G.HUD.abilities(st);
  }

  function abilityChoices(n, boost) {
    const W = st.rs.weapon;
    const proj = W.kind === 'proj';
    const melee = W.kind === 'melee' || W.kind === 'thrust' || W.kind === 'slam';
    const p = st.player;
    const pool = G.ABILITIES.filter((a) => {
      if ((st.abilities[a.id] || 0) >= a.max) return false;
      if (a.req === 'proj' && !(proj || (melee && st.rs.wave > 0))) return false;
      if (a.req === 'melee' && !melee) return false;
      if (a.id === 'heal' && p.hp > p.maxHp * 0.7) return false;
      if (a.id === 'pierce' && W.kind === 'boomerang') return false;
      return true;
    });
    const wt = boost ? [6, 6, 3] : [10, 5, 1.4];
    return U.weightedN(pool, n, (a) => wt[a.rar]);
  }

  function applyAbility(id) {
    const def = G.ABILITIES.find((a) => a.id === id);
    const p = st.player;
    if (def.instant) {
      G.Team.healAll(0.4, true);
      return;
    }
    st.abilities[id] = (st.abilities[id] || 0) + 1;
    if (id === 'revive') st.revives++;
    const oldMax = p.maxHp;
    st.rs = G.Stats.run(st.meta, st.abilities);
    p.maxHp = st.rs.maxHp;
    if (p.maxHp > oldMax) p.hp += p.maxHp - oldMax;
    if (id === 'hp') C().heal(p.maxHp * 0.2, true);
    p.hp = Math.min(p.hp, p.maxHp);
    resizeComps();
  }

  function resizeComps() {
    for (const a of st.allies) if (a.kind === 'comp') {
      const r = a.hp / a.maxHp;
      a.maxHp = G.Allies.compMaxHp(st, a);
      a.hp = a.maxHp * r;
    }
  }

  // 장비를 탑 안에서 바로 바꿔 끼울 때
  function refreshMeta() {
    if (!st) return;
    const p = st.player;
    const ratio = p.hp / p.maxHp;
    st.meta = G.Stats.meta(G.Save.data);
    st.rs = G.Stats.run(st.meta, st.abilities);
    p.maxHp = st.rs.maxHp;
    if (!p.dead) p.hp = Math.max(1, p.maxHp * ratio);
    resizeComps();
  }

  function fireProj(o) {
    st.projs.push({
      x: o.x, y: o.y, vx: Math.cos(o.ang) * o.speed, vy: Math.sin(o.ang) * o.speed, speed: o.speed,
      r: o.r || 5, dmg: o.dmg, type: o.type, life: o.life || 1.5, pierce: o.pierce || 0, bounce: o.bounce || 0,
      homing: o.homing || 0, hit: new Set(), ally: !!o.ally, aoe: o.aoe || 0, slow: o.slow || 0, burn: !!o.burn,
      color: o.color, rainbow: !!o.rainbow, skill: !!o.skill, boomerang: o.boomerang || null, rot: o.ang, t: 0, src: o.src || null,
    });
  }

  function addZone(z) {
    z.t = 0;
    st.zones.push(z);
    return z;
  }

  function addHazard(x, y, r, life, dmg, type) {
    if (st.zones.length > 80) return;
    st.zones.push({ kind: 'hazard', x, y, r, life, max: life, dmg, type, t: 0 });
  }

  // ── 매 프레임 업데이트 ──────────────────────────────────
  function update(realDt) {
    if (!st || !st.active) return;
    if (st.cutin) { st.cutin.t -= realDt; if (st.cutin.t <= 0) st.cutin = null; }
    let dt = realDt;
    // 궁극기 순간에는 잠깐 슬로우 모션
    if (st.slowmo > 0 && !st.paused) { st.slowmo -= realDt; dt = realDt * 0.3; }
    G.Fx.update(dt);
    if (st.banner) { st.banner.t -= realDt; if (st.banner.t <= 0) st.banner = null; }
    if (st.paused) return;
    st.time += dt;
    if (st.hitFlash > 0) st.hitFlash -= dt;
    const p = st.player;

    for (let i = st.timers.length - 1; i >= 0; i--) {
      const t = st.timers[i];
      t.t -= dt;
      if (t.t <= 0) { st.timers.splice(i, 1); t.fn(); if (!st.active) return; }
    }

    G.Player.update(dt);
    for (let i = 0; i < 2; i++) if (st.skillCd[i] > 0) st.skillCd[i] -= dt;
    G.Allies.update(dt);
    updateEnemies(dt);
    updateSpawns(dt);
    updateProjs(dt);
    updateEProjs(dt);
    updateZones(dt);
    updatePickups(dt);
    updateProps(dt);

    for (let i = st.swings.length - 1; i >= 0; i--) { st.swings[i].t -= dt; if (st.swings[i].t <= 0) st.swings.splice(i, 1); }
    for (let i = st.bolts.length - 1; i >= 0; i--) { st.bolts[i].t -= dt; if (st.bolts[i].t <= 0) st.bolts.splice(i, 1); }

    // 웨이브 진행
    if (st.phase === 'fight' && st.waves) {
      const alive = st.enemies.length + st.spawns.length;
      const w = st.waves;
      if (w.idx < w.list.length - 1) {
        if (w.idx < 0 || alive <= Math.max(1, Math.floor(w.lastCount * 0.25))) {
          w.delay -= dt;
          if (w.delay <= 0) { spawnWave(); w.delay = 0.8; }
        }
      } else if (alive === 0) {
        roomCleared(true);
      }
    }
    // 레벨업 선택: AUTO일 때는 전투가 끝난 뒤에 몰아서
    const canChoose = !G.UI.modalOpen() && st.phase !== 'transition' && st.phase !== 'dead' && st.phase !== 'bossdead';
    if (st.pendingLv > 0 && canChoose && !(st.auto && st.phase === 'fight')) {
      st.pendingLv--;
      if (G.Save.data.settings.autoProgress) autoLevel();
      else G.UI.levelUp(st);
    }

    // 문 들어가기
    if (st.phase === 'portal') {
      for (const pt of st.portals) pt.t += dt;
      if (st.auto || p.dead) {
        if (!st.doorAsked && canChoose && st.pendingLv === 0 && !propsPending()) {
          st.doorAsked = true;
          if (st.portals.length === 1) {
            // 갈 길이 하나뿐이면 묻지 않고 바로
            const pt = st.portals[0];
            G.UI.toast(pt.type === 'boss' ? '👑 보스의 문이 열렸어요!' : '다음 층으로!');
            st.timers.push({ t: 0.9, fn: () => takePortal(pt) });
          } else if (G.Save.data.settings.autoProgress) {
            const pt = G.Team.autoDoor(st);
            G.UI.toast(`자동 진행: ${G.PORTALS[pt.type].icon} ${G.PORTALS[pt.type].name}`);
            st.timers.push({ t: 0.8, fn: () => takePortal(pt) });
          } else G.UI.doorChoice(st, (pt) => takePortal(pt));
        }
      } else {
        for (const pt of st.portals) {
          if (U.dist(p.x, p.y, pt.x, pt.y) < pt.r + 4) { takePortal(pt); break; }
        }
      }
    }

    updateCamera(dt);
    G.HUD.update(st);
  }

  function updateEnemies(dt) {
    const p = st.player;
    for (const c of st.corpses) c.t += dt;
    if (st.corpses.length) st.corpses = st.corpses.filter((c) => c.t < c.life);
    for (const e of st.enemies) {
      e.t += dt;
      if (e.spawnT > 0) { e.spawnT -= dt; continue; }
      if (e.squash) e.squash = e.squash > 0 ? Math.max(0, e.squash - dt * 1.4) : Math.min(0, e.squash + dt * 1.4);
      if (e.contactCd > 0) e.contactCd -= dt;
      C().updateEnemyStatus(e, dt);
      if (e.dead) continue;
      if (e.boss) G.Bosses.update(e, dt);
      else G.AI.update(e, dt);
      if (e.dead) continue;
      if (e.kx || e.ky) {
        e.x += e.kx * dt; e.y += e.ky * dt;
        const k = Math.exp(-9 * dt);
        e.kx *= k; e.ky *= k;
        if (Math.abs(e.kx) + Math.abs(e.ky) < 2) e.kx = e.ky = 0;
      }
      G.World.collide(e, st.arena, e.look.float || e.hop > 10 || e.burrowed);
      // 몸통 박치기
      if (!e.burrowed && e.alpha > 0.5 && e.hop < 16 && e.contactCd <= 0) {
        const hitR = e.r + p.r * 0.75;
        if (!p.dead && U.dist2(e.x, e.y, p.x, p.y) < hitR * hitR) {
          if (C().damagePlayer(e.atk * (e.dashing ? 1.3 : 1))) e.contactCd = 0.8;
        } else {
          for (const a of st.allies) {
            if (a.kind !== 'comp' || a.down) continue;
            if (U.dist2(e.x, e.y, a.x, a.y) < (e.r + a.r) * (e.r + a.r)) { G.Allies.hurt(a, e.atk); e.contactCd = 0.8; break; }
          }
        }
      }
    }
    // 서로 밀어내기
    const es = st.enemies;
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      if (a.dead || a.burrowed) continue;
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        if (b.dead || b.burrowed) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = (a.r + b.r) * 0.9;
        const d2 = dx * dx + dy * dy;
        if (d2 < min * min && d2 > 0.01) {
          const d = Math.sqrt(d2), push = (min - d) / 2;
          const nx = dx / d, ny = dy / d;
          const wa = a.boss ? 0 : b.boss ? 2 : 1, wb = b.boss ? 0 : a.boss ? 2 : 1;
          a.x -= nx * push * wa; a.y -= ny * push * wa;
          b.x += nx * push * wb; b.y += ny * push * wb;
        }
      }
    }
    st.enemies = st.enemies.filter((e) => !e.dead);
  }

  function updateSpawns(dt) {
    for (let i = st.spawns.length - 1; i >= 0; i--) {
      const s = st.spawns[i];
      s.t -= dt;
      if (s.t <= 0) {
        st.spawns.splice(i, 1);
        const e = C().makeEnemy(s.type, s.x, s.y, s.opts);
        st.enemies.push(e);
        if (e.boss) { st.boss = e; G.HUD.boss(e); }
        G.Fx.burst(s.x, s.y, '#ffffff', 6, 80, 3, { shape: 'star' });
      }
    }
  }

  function updateProjs(dt) {
    const p = st.player;
    for (const b of st.projs) {
      b.t += dt;
      b.life -= dt;
      if (b.boomerang) {
        const bm = b.boomerang;
        if (bm.out) {
          if (U.dist(b.x, b.y, bm.sx, bm.sy) >= bm.range || b.t > 0.9) { bm.out = false; b.hit.clear(); }
        } else {
          const a = U.angleTo(b.x, b.y, p.x, p.y);
          b.vx = Math.cos(a) * b.speed * 1.1; b.vy = Math.sin(a) * b.speed * 1.1;
          if (U.dist2(b.x, b.y, p.x, p.y) < 18 * 18) b.dead = true;
        }
        b.rot += dt * 18;
      } else if (b.homing) {
        const e = G.Allies.nearestEnemy(b.x, b.y, 220);
        if (e) {
          const cur = Math.atan2(b.vy, b.vx), want = U.angleTo(b.x, b.y, e.x, e.y);
          const na = cur + U.clamp(U.angleDiff(cur, want), -b.homing * dt, b.homing * dt);
          b.vx = Math.cos(na) * b.speed; b.vy = Math.sin(na) * b.speed;
        }
        b.rot = Math.atan2(b.vy, b.vx);
      } else b.rot = Math.atan2(b.vy, b.vx);
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0) { b.dead = true; continue; }
      if (!b.boomerang && b.type !== 'wave') {
        if (b.x < 0 || b.y < 0 || b.x > st.arena.w || b.y > st.arena.h || G.World.inObstacle(b.x, b.y, b.r * 0.5, st.arena)) {
          if (b.aoe) projBlast(b);
          b.dead = true;
          G.Fx.burst(b.x, b.y, b.color || '#ffffff', 3, 50, 2);
          continue;
        }
      }
      for (const e of st.enemies) {
        if (e.dead || e.burrowed || e.spawnT > 0 || b.hit.has(e.id)) continue;
        const rr = e.r + b.r;
        if (U.dist2(b.x, b.y, e.x, e.y) > rr * rr) continue;
        b.hit.add(e.id);
        if (b.aoe) { projBlast(b); b.dead = true; break; }
        const ang = Math.atan2(b.vy, b.vx);
        C().hitEnemy(e, b.dmg, { proc: !b.ally || !!b.src, ally: b.ally, skill: b.skill, rainbow: b.rainbow, unit: b.src, knock: [Math.cos(ang), Math.sin(ang), b.type === 'boomerang' ? 60 : 90], color: b.ally ? '#ffe8a3' : undefined });
        if (b.burn && !e.dead) e.burn = { t: 3, dps: b.dmg * 0.3, tick: 0.5 };
        if (b.pierce > 0) { b.pierce--; continue; }
        if (b.bounce > 0) {
          b.bounce--;
          let best = null, bd = 220 * 220;
          for (const o of st.enemies) {
            if (o.dead || b.hit.has(o.id) || o.burrowed) continue;
            const d2 = U.dist2(b.x, b.y, o.x, o.y);
            if (d2 < bd) { bd = d2; best = o; }
          }
          if (best) {
            const a = U.angleTo(b.x, b.y, best.x, best.y);
            b.vx = Math.cos(a) * b.speed; b.vy = Math.sin(a) * b.speed;
            b.life = Math.max(b.life, 0.8);
            continue;
          }
        }
        b.dead = true;
        break;
      }
    }
    st.projs = st.projs.filter((b) => !b.dead);
  }

  function projBlast(b) {
    G.Fx.ring(b.x, b.y, 4, b.aoe, b.color || '#ffffff', 0.25, 4);
    G.Fx.burst(b.x, b.y, b.color || '#ffffff', 8, 100, 3);
    for (const e of st.enemies) {
      if (e.dead || U.dist2(b.x, b.y, e.x, e.y) > (b.aoe + e.r) * (b.aoe + e.r)) continue;
      C().hitEnemy(e, b.dmg, { ally: b.ally, color: '#ffe8a3', unit: b.src, proc: !!b.src });
      if (b.slow) { e.slowT = 2; e.slowAmt = b.slow; }
    }
  }

  function updateEProjs(dt) {
    const p = st.player;
    for (const b of st.eprojs) {
      if (b.dead) continue;
      b.t += dt;
      b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.rot += dt * 6;
      if (b.life <= 0 || b.x < -10 || b.y < -10 || b.x > st.arena.w + 10 || b.y > st.arena.h + 10) { b.dead = true; continue; }
      if (G.World.inObstacle(b.x, b.y, 0, st.arena)) {
        b.dead = true;
        G.Fx.burst(b.x, b.y, b.color, 3, 40, 2);
        if (b.boom) bulletBoom(b);
        continue;
      }
      const hr = b.r + p.r * 0.7;
      if (!p.dead && U.dist2(b.x, b.y, p.x, p.y) < hr * hr) {
        b.dead = true;
        if (C().damagePlayer(b.dmg) && b.slow) p.slowT = 1.5;
        if (b.boom) bulletBoom(b);
        continue;
      }
      for (const a of st.allies) {
        if (a.kind !== 'comp' || a.down) continue;
        if (U.dist2(b.x, b.y, a.x, a.y) < (b.r + a.r) * (b.r + a.r)) { b.dead = true; G.Allies.hurt(a, b.dmg); break; }
      }
    }
    st.eprojs = st.eprojs.filter((b) => !b.dead);
    if (p.slowT > 0) { p.slowT -= dt; st.playerSlow = true; }
  }

  function bulletBoom(b) {
    G.Fx.ring(b.x, b.y, 4, b.boom, '#ffb347', 0.25, 4);
    G.Fx.burst(b.x, b.y, ['#ffb347', '#ffffff'], 8, 100, 3);
    const p = st.player;
    if (U.dist(b.x, b.y, p.x, p.y) < b.boom + p.r) C().damagePlayer(b.dmg);
  }

  function updateZones(dt) {
    const p = st.player;
    st.playerSlow = false;
    for (const z of st.zones) {
      z.t += dt;
      if (z.follow && !z.follow.dead) {
        if (z.kind === 'circle' && z.t < z.warn) { z.x = z.follow.x; z.y = z.follow.y; }
        if (z.kind === 'line' && (z.ghost || z.t < z.warn)) { z.x = z.follow.x; z.y = z.follow.y; }
      }
      if (z.kind === 'circle') {
        if (z.t >= z.warn && !z.done) {
          z.done = true;
          if (z.friendly) {
            const big = !!z.big;
            G.Fx.burst(z.x, z.y, z.star ? ['#ffe66d', '#ffffff'] : ['#ff9f1c', '#ffd166', '#ffffff'], big ? 26 : 12, big ? 240 : 150, big ? 5 : 3.5, { shape: z.star ? 'star' : 'dot' });
            G.Fx.ring(z.x, z.y, 6, z.r, z.color || '#ffd166', 0.3, 5);
            if (big) G.Fx.shake(7);
            G.Sfx.play(z.star ? 'zap' : 'boom');
            C().blast(z.x, z.y, z.r, z.dmg, { skill: z.skill, ally: z.ally, proc: true });
            if (z.slow) for (const e of st.enemies) if (!e.dead && U.dist2(z.x, z.y, e.x, e.y) < z.r * z.r) { e.slowT = 2.5; e.slowAmt = z.slow; }
            if (z.burn) for (const e of st.enemies) if (!e.dead && U.dist2(z.x, z.y, e.x, e.y) < z.r * z.r) e.burn = { t: 3, dps: z.dmg * 0.15, tick: 0.5 };
          } else if (z.dmg > 0) {
            if (z.meteor) { G.Fx.burst(z.x, z.y, ['#ff9f1c', '#ffd166'], 10, 140, 3.5); G.Sfx.play('boom'); }
            else G.Fx.ring(z.x, z.y, 6, z.r, z.color || '#ff6b6b', 0.25, 4);
            if (U.dist(z.x, z.y, p.x, p.y) < z.r + p.r * 0.6) C().damagePlayer(z.dmg);
            for (const a of st.allies) if (a.kind === 'comp' && !a.down && U.dist(z.x, z.y, a.x, a.y) < z.r) G.Allies.hurt(a, z.dmg);
          }
        }
        if (z.t >= z.warn + 0.2) z.dead = true;
      } else if (z.kind === 'line') {
        if (z.track && z.t < z.warn - (z.lock || 0)) z.ang = U.angleTo(z.x, z.y, z.track.x, z.track.y) + (z.trackOff || 0);
        if (z.ghost && z.follow && z.follow.s && z.follow.s.a != null && z.follow.ai !== 'boss') z.ang = z.follow.s.a;
        const end = z.warn + (z.active || 0);
        if (z.t >= z.warn && z.t < end && z.dmg > 0) {
          if (!z.fired) { z.fired = true; G.Sfx.play('zap'); G.Fx.shake(3); }
          const ex = z.x + Math.cos(z.ang) * z.len, ey = z.y + Math.sin(z.ang) * z.len;
          for (const u of G.Team.members(st)) if (G.Player.segDist(u.x, u.y, z.x, z.y, ex, ey) < z.w / 2 + u.r * 0.6) hurtUnit(u, z.dmg);
        }
        if (z.t >= end + 0.12) z.dead = true;
      } else if (z.kind === 'rotline') {
        if (z.follow) { z.x = z.follow.x; z.y = z.follow.y; }
        z.ang += z.spin * dt * (z.t < z.warn ? 0.3 : 1);
        if (z.t >= z.warn && z.t < z.warn + z.active) {
          const ex = z.x + Math.cos(z.ang) * z.len, ey = z.y + Math.sin(z.ang) * z.len;
          for (const u of G.Team.members(st)) if (G.Player.segDist(u.x, u.y, z.x, z.y, ex, ey) < z.w / 2 + u.r * 0.6) hurtUnit(u, z.dmg);
        }
        if (z.t >= z.warn + z.active || (z.follow && z.follow.dead)) z.dead = true;
      } else if (z.kind === 'hazard') {
        z.life -= dt;
        if (z.life <= 0) z.dead = true;
        else {
          if (!p.dead && U.dist2(z.x, z.y, p.x, p.y) < (z.r + p.r * 0.5) * (z.r + p.r * 0.5)) {
            if (z.type === 'ink') st.playerSlow = true;
            else if (st.phase === 'fight') C().damagePlayer(z.dmg);
          }
          if (z.type !== 'ink' && st.phase === 'fight') {
            z.tick = (z.tick || 0) - dt;
            if (z.tick <= 0) {
              z.tick = 0.5;
              for (const a of st.allies) if (a.kind === 'comp' && !a.down && U.dist(z.x, z.y, a.x, a.y) < z.r + a.r * 0.5) G.Allies.hurt(a, z.dmg * 0.5);
            }
          }
        }
      }
    }
    st.zones = st.zones.filter((z) => !z.dead);
  }

  function updatePickups(dt) {
    const p = G.Team.leader(st), rs = st.rs;
    const range = rs.pickup * (G.Save.data.pets.active === 'hoot' ? 1.4 : 1);
    for (const k of st.pickups) {
      k.t += dt;
      const d = U.dist(k.x, k.y, p.x, p.y);
      if (!k.magnet && (d < range || (k.type === 'exp' && st.phase !== 'fight'))) k.magnet = k.t > 0.25;
      if (k.magnet && !p.dead) {
        const sp = 300 + k.t * 260;
        k.x += ((p.x - k.x) / (d || 1)) * Math.min(d, sp * dt);
        k.y += ((p.y - k.y) / (d || 1)) * Math.min(d, sp * dt);
        if (d < p.r + 8) { k.dead = true; collect(k); }
      } else {
        const dr = Math.exp(-5 * dt);
        k.vx *= dr; k.vy *= dr;
        k.x += k.vx * dt; k.y += k.vy * dt;
        k.x = U.clamp(k.x, 8, st.arena.w - 8); k.y = U.clamp(k.y, 8, st.arena.h - 8);
      }
    }
    st.pickups = st.pickups.filter((k) => !k.dead);
  }

  function updateProps(dt) {
    const p = G.Team.leader(st), save = G.Save.data;
    const auto = st.auto || st.player.dead;
    for (const o of st.props) {
      o.t += dt;
      const d = U.dist(o.x, o.y, p.x, p.y);
      // AUTO면 잠깐 뒤 저절로 열리고 작동해요
      const touch = d < o.r + p.r + 6 || (auto && o.t > 0.8 && !G.UI.modalOpen() && st.phase !== 'bossdead');
      if (o.kind === 'chest' && !o.opened && touch && st.phase !== 'fight') {
        o.opened = true;
        openChest(o);
      } else if (o.kind === 'fountain' && !o.used && touch) {
        o.used = true;
        G.Team.reviveAll(0.3);
        G.Team.healAll(0.4, true);
        st.potions = Math.min(st.meta.potions, st.potions + 1);
        G.UI.toast('샘물을 마셨어요! 팀 체력 회복 · 쓰러진 친구 부활 · 물약 +1');
        G.Sfx.play('heal');
      } else if (o.kind === 'shrine' && !o.used && touch) {
        o.used = true;
        G.Sfx.play('legend');
        if (save.settings.autoProgress) autoLevel();
        else G.UI.levelUp(st, { boost: true, title: '별의 축복', sub: '하나를 골라 받아 가세요' });
      } else if (o.kind === 'merchant') {
        if (auto) {
          if (o.armed && o.t > 0.8 && !G.UI.modalOpen()) {
            o.armed = false;
            if (!save.settings.autoProgress) G.UI.runShop(st, o);
          }
        } else if (touch && o.armed) { o.armed = false; G.UI.runShop(st, o); }
        else if (!touch && d > o.r + p.r + 30) o.armed = true;
      }
    }
    void save;
  }

  function openChest(o) {
    const save = G.Save.data;
    const luck = st.rs.luck;
    const item = G.Loot.randomItem(st.floor, luck + 0.25 * o.rar, Math.min(5, o.rar));
    G.Loot.addItemToSave(item);
    st.gained.items.push(item);
    const g = Math.ceil((10 + st.floor * 3) * (1 + o.rar * 0.5) * (1 + st.rs.goldP));
    burstGold(o.x, o.y, g, 5);
    G.Fx.burst(o.x, o.y, [G.RARITIES[item.rar].color, '#ffffff', '#fff3b0'], 24, 200, 4, { shape: 'star' });
    G.Sfx.play(item.rar >= 4 ? 'legend' : 'chest');
    if (Math.random() < 0.25 + o.rar * 0.1) drop('rune', o.x, o.y, G.Loot.makeRune(null, G.Loot.runeGradeFor(st.floor)));
    G.Save.persist();
    if (save.settings.autoProgress) {
      const cur = G.Stats.findItem(save, save.eq[item.slot]);
      if (!cur || G.Loot.itemPower(item) > G.Loot.itemPower(cur)) {
        G.Camp.equip(item);
        refreshMeta();
        G.UI.toast(`더 좋은 장비 자동 장착! <b style="color:${G.RARITIES[item.rar].color}">${U.esc(item.name)}</b>`);
      } else G.UI.toast(`<b style="color:${G.RARITIES[item.rar].color}">[${G.RARITIES[item.rar].name}] ${U.esc(item.name)}</b> 가방에 쏙!`);
    } else G.UI.lootPopup(item, true);
  }

  function updateCamera(dt) {
    const V = G.View, a = st.arena, W = G.World.WALL;
    const p = st.auto || st.player.dead ? G.Team.centroid(st) : st.player;
    let tx = p.x - V.vw / 2, ty = p.y - V.vh / 2;
    if (V.vw >= a.w + W * 2) tx = (a.w - V.vw) / 2;
    else tx = U.clamp(tx, -W, a.w + W - V.vw);
    // 아래쪽 팀 카드에 가리지 않도록 바닥 여유를 둡니다
    const padB = 110 / V.scale;
    if (V.vh >= a.h + W * 2 + padB + 40) ty = (a.h - V.vh) / 2 + padB / 2;
    else ty = U.clamp(ty, -W - 40, a.h + W + padB - V.vh);
    const k = Math.min(1, dt * 7);
    st.cam.x += (tx - st.cam.x) * k;
    st.cam.y += (ty - st.cam.y) * k;
  }

  return {
    start, update, end, drop, burstGold, addZone, addHazard, fireProj, onBossKilled, onPlayerDown, onTeamWipe, hurtUnit, takePortal,
    abilityChoices, applyAbility, refreshMeta, enterFloor, expNeed,
    get st() { return st; },
    set st(v) { st = v; },
  };
})();
