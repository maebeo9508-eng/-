'use strict';
// 탑 안 HUD: 주인공 체력·경험치, 층·골드, 보스 체력, 능력·아티팩트, 오른쪽 아래 행동 버튼
G.HUD = (function () {
  const U = G.U;
  const $ = (id) => document.getElementById(id);
  const last = {};

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

  function show(st) {
    for (const k in last) delete last[k];
    $('hud').classList.remove('hidden');
    $('bossBar').classList.add('hidden');
    const p = st.player, key = p.hero === 'mochi' ? 'hero' : p.hero;
    $('heroFace').src = G.Scene.portrait(p.look, key, 96);
    $('ultFace').src = G.Scene.portrait(p.look, key, 96);
    const sk = G.ACTIVE_SKILLS[G.Save.data.skills.eq[0]];
    $('skillIc').textContent = sk ? sk.icon : '·';
    $('atkIc').textContent = st.rs.weapon.icon;
    abilities(st);
    update(st);
  }

  function hide() {
    $('hud').classList.add('hidden');
    G.Input.attackBtn = false;
    $('btnAttack').classList.remove('held');
  }

  function floor(st) {
    set('hudFloor', 'text', `${st.floor}층`);
    $('bossBar').classList.add('hidden');
  }

  function boss(e) {
    $('bossBar').classList.remove('hidden');
    $('bossName').textContent = `${e.def.name} · ${e.def.title}`;
  }

  // 왼쪽 위: 아티팩트(노란 칸) + 레벨업 능력
  function abilities(st) {
    const arts = st.arts.map((id) => { const d = G.artifactDef(id); return `<span class="art" title="${U.esc(d.name)}">${d.icon}</span>`; }).join('');
    const abil = Object.keys(st.abilities).map((id) => {
      const a = G.ABILITIES.find((x) => x.id === id);
      return `<span>${a.icon}<b>${st.abilities[id] > 1 ? st.abilities[id] : ''}</b></span>`;
    }).join('');
    set('hudAbilities', 'html', arts + abil);
  }

  function update(st) {
    const p = st.player;
    const hp = p.dead ? 0 : Math.max(0, p.hp / p.maxHp);
    set('hpFill', 'width', `${(hp * 100).toFixed(1)}%`);
    if (last.low !== hp < 0.3) { last.low = hp < 0.3; $('hpFill').classList.toggle('low', hp < 0.3); }
    set('hpText', 'text', `${U.fmt(Math.max(0, p.hp))} / ${U.fmt(p.maxHp)}`);
    set('expFill', 'width', `${Math.min(100, (st.exp / st.expNext) * 100).toFixed(1)}%`);
    set('hudLv', 'text', `Lv ${st.lv}`);
    set('hudGold', 'text', `🪙 ${U.fmt(G.Save.data.gold)}`);
    set('potionCnt', 'text', String(st.potions));
    const dp = p.dashCd > 0 ? (p.dashCd / st.dashCdMax) * 100 : 0;
    set('btnDash', '--p', `${dp.toFixed(0)}%`);
    const sp = st.skillCd > 0 ? (st.skillCd / st.skillCdMax) * 100 : 0;
    set('btnSkill', '--p', `${sp.toFixed(0)}%`);
    set('btnUlt', '--u', `${Math.round(p.ult * 100)}%`);
    const ready = p.ult >= 1 && st.phase === 'fight' && !p.dead;
    if (last.ready !== ready) { last.ready = ready; $('btnUlt').classList.toggle('ready', ready); }
    if (st.boss) {
      set('bossFill', 'width', `${Math.max(0, (st.boss.hp / st.boss.maxHp) * 100).toFixed(1)}%`);
      if (st.boss.dead) $('bossBar').classList.add('hidden');
    }
  }

  function nope(el) {
    el.classList.remove('nope');
    void el.offsetWidth;
    el.classList.add('nope');
  }

  function init() {
    // 조이스틱을 쥔 채 다른 손가락으로 누를 수 있게 pointerdown 사용
    document.querySelectorAll('[data-hud]').forEach((b) => {
      const k = b.dataset.hud;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        G.Sfx.init();
        if (k === 'attack') {
          G.Input.attackBtn = true;
          b.classList.add('held');
          try { b.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
          return;
        }
        let ok = true;
        if (k === 'dash') G.Player.dash();
        else if (k === 'potion') G.Player.potion();
        else if (k === 'skill') ok = G.Player.skill();
        else if (k === 'ult') ok = G.Player.ult();
        if (ok === false) nope(b);
        b.classList.add('pressed');
        setTimeout(() => b.classList.remove('pressed'), 90);
      });
      if (k === 'attack') {
        const up = () => { G.Input.attackBtn = false; b.classList.remove('held'); };
        b.addEventListener('pointerup', up);
        b.addEventListener('pointercancel', up);
        b.addEventListener('lostpointercapture', up);
      }
    });
  }

  return { init, show, hide, update, floor, boss, abilities };
})();
