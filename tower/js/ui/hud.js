'use strict';
// 탑 안 HUD: 층·골드, AUTO·배속, 경험치, 보스 체력, 아래쪽 팀 카드(체력·궁극기), 물약·대시
G.HUD = (function () {
  const U = G.U;
  const $ = (id) => document.getElementById(id);
  const last = {};
  let cards = [];

  function set(id, prop, val) {
    const k = id + prop;
    if (last[k] === val) return;
    last[k] = val;
    const el = $(id);
    if (prop === 'text') el.textContent = val;
    else if (prop === 'html') el.innerHTML = val;
    else if (prop === 'width') el.style.width = val;
    else el.style.setProperty(prop, val);
  }

  // 카드 순서: 모찌 → 편성한 동료들
  function units(st) {
    if (!st) return [];
    return [st.player].concat(st.allies.filter((a) => a.kind === 'comp'));
  }

  function buildCards(st) {
    const bar = $('teamBar');
    bar.innerHTML = '';
    cards = units(st).map((u, i) => {
      const isP = u === st.player;
      const el = document.createElement('button');
      el.className = 'tcard';
      el.dataset.i = i;
      el.setAttribute('aria-label', `${isP ? '모찌' : u.def.name} 궁극기`);
      el.innerHTML = `<span class="ring"></span>
        <img src="${G.Scene.portrait(isP ? G.HERO_LOOK : u.look, isP ? 'hero' : u.key, 112)}" alt="">
        <span class="uic"></span>
        <span class="nm">${isP ? '모찌' : U.esc(u.def.name)}</span>
        <span class="hpb"><span class="f"></span></span>`;
      bar.appendChild(el);
      return { u, el, ring: el.querySelector('.ring'), f: el.querySelector('.f'), uic: el.querySelector('.uic'), last: {} };
    });
  }

  function show(st) {
    for (const k in last) delete last[k];
    $('hud').classList.remove('hidden');
    $('bossBar').classList.add('hidden');
    buildCards(st);
    abilities(st);
    update(st);
  }

  function hide() { $('hud').classList.add('hidden'); }

  function floor(st) {
    set('hudFloor', 'text', `${st.floor}층`);
    $('bossBar').classList.add('hidden');
  }

  function boss(e) {
    $('bossBar').classList.remove('hidden');
    $('bossName').textContent = `${e.def.name} · ${e.def.title}`;
  }

  function abilities(st) {
    const html = Object.keys(st.abilities).map((id) => {
      const a = G.ABILITIES.find((x) => x.id === id);
      return `<span>${a.icon}<b>${st.abilities[id] > 1 ? st.abilities[id] : ''}</b></span>`;
    }).join('');
    set('hudAbilities', 'html', html);
  }

  function updateCard(c, st) {
    const u = c.u, L = c.last;
    const down = u === st.player ? u.dead : u.down;
    const hp = down ? 0 : Math.max(0, u.hp / u.maxHp);
    const info = G.Team.ultInfo(u);
    const hpS = (hp * 100).toFixed(0) + '%';
    if (L.hp !== hpS) { L.hp = hpS; c.f.style.width = hpS; c.f.classList.toggle('low', hp < 0.3); }
    const pct = Math.round(Math.min(1, info.pct) * 100);
    if (L.u !== pct) { L.u = pct; c.ring.style.setProperty('--u', pct + '%'); }
    const ready = info.ready && st.phase === 'fight';
    if (L.ready !== ready) { L.ready = ready; c.el.classList.toggle('ready', ready); }
    if (L.down !== down) { L.down = down; c.el.classList.toggle('down', down); }
    if (L.icon !== info.icon) { L.icon = info.icon; c.uic.textContent = info.icon; }
  }

  function update(st) {
    set('expFill', 'width', `${Math.min(100, (st.exp / st.expNext) * 100).toFixed(1)}%`);
    set('hudLv', 'text', `Lv ${st.lv}`);
    set('hudGold', 'text', `🪙 ${U.fmt(G.Save.data.gold)}`);
    set('potionCnt', 'text', String(st.potions));
    set('btnSpeed', 'text', `▶ ×${st.speed}`);
    const auto = st.auto ? 'on' : 'off';
    if (last.auto !== auto) {
      last.auto = auto;
      $('btnAuto').classList.toggle('on', st.auto);
      $('btnAuto').textContent = st.auto ? 'AUTO' : '수동';
    }
    const showDash = !st.auto && !st.player.dead;
    if (last.dash !== showDash) { last.dash = showDash; $('btnDash').classList.toggle('hidden', !showDash); }
    const p = st.player;
    const dp = p.dashCd > 0 ? (p.dashCd / st.dashCdMax) * 100 : 0;
    set('btnDash', '--p', `${dp.toFixed(0)}%`);
    for (const c of cards) updateCard(c, st);
    if (st.boss) {
      set('bossFill', 'width', `${Math.max(0, (st.boss.hp / st.boss.maxHp) * 100).toFixed(1)}%`);
      if (st.boss.dead) $('bossBar').classList.add('hidden');
    }
  }

  function init() {
    // 조이스틱을 쥔 채 다른 손가락으로 누를 수 있게 pointerdown 사용
    document.querySelectorAll('[data-hud]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        G.Sfx.init();
        const k = b.dataset.hud;
        if (k === 'dash') G.Player.dash();
        else if (k === 'potion') G.Player.potion();
        b.classList.add('pressed');
        setTimeout(() => b.classList.remove('pressed'), 90);
      });
    });
    $('teamBar').addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.tcard');
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      G.Sfx.init();
      const c = cards[+el.dataset.i];
      if (!c) return;
      if (!G.Team.useUlt(c.u)) {
        el.classList.remove('nope');
        void el.offsetWidth;
        el.classList.add('nope');
      }
    });
  }

  Object.assign(G.Actions, {
    toggleAuto() {
      const st = G.Run.st;
      if (!st) return;
      st.auto = !st.auto;
      G.Save.data.settings.auto = st.auto;
      G.Save.persist();
      G.Input.reset();
      G.UI.toast(st.auto ? '🤖 AUTO: 팀이 알아서 싸워요' : '🕹️ 수동: 화면을 끌어 모찌를 직접 움직여요');
    },
    toggleSpeed() {
      const st = G.Run.st;
      if (!st) return;
      st.speed = (st.speed % 3) + 1;
      G.Save.data.settings.speed = st.speed;
      G.Save.persist();
    },
  });

  return { init, show, hide, update, floor, boss, abilities, units };
})();
