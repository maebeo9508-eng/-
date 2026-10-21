'use strict';
// 탑 안 HUD: 체력, 경험치, 층, 골드, 보스 체력, 스킬·대시·물약 버튼
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

  function skillIcon(key) {
    const def = G.ACTIVE_SKILLS[key];
    const img = G.Assets.icon('icon_skill_' + key);
    return img ? `<img src="${img.src}" alt="">` : def ? def.icon : '';
  }

  function show(st) {
    for (const k in last) delete last[k];
    $('hud').classList.remove('hidden');
    const eq = G.Save.data.skills.eq;
    for (let i = 0; i < 2; i++) {
      const b = $('btnSkill' + i);
      b.querySelector('.ic').innerHTML = skillIcon(eq[i]);
      b.classList.toggle('hidden', !eq[i]);
    }
    $('bossBar').classList.add('hidden');
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

  function update(st) {
    const p = st.player;
    set('hpFill', 'width', `${Math.max(0, (p.hp / p.maxHp) * 100).toFixed(1)}%`);
    set('hpTxt', 'text', `${U.fmt(Math.max(0, Math.ceil(p.hp)))} / ${U.fmt(Math.ceil(p.maxHp))}`);
    set('expFill', 'width', `${Math.min(100, (st.exp / st.expNext) * 100).toFixed(1)}%`);
    set('hudLv', 'text', `Lv ${st.lv}`);
    set('hudGold', 'text', `🪙 ${U.fmt(G.Save.data.gold)}`);
    set('potionCnt', 'text', String(st.potions));
    for (let i = 0; i < 2; i++) {
      const pct = st.skillCd[i] > 0 ? (st.skillCd[i] / st.skillCdMax[i]) * 100 : 0;
      set('btnSkill' + i, '--p', `${pct.toFixed(0)}%`);
    }
    const dp = p.dashCd > 0 ? (p.dashCd / st.dashCdMax) * 100 : 0;
    set('btnDash', '--p', `${dp.toFixed(0)}%`);
    if (st.boss) {
      set('bossFill', 'width', `${Math.max(0, (st.boss.hp / st.boss.maxHp) * 100).toFixed(1)}%`);
      if (st.boss.dead) $('bossBar').classList.add('hidden');
    }
  }

  function init() {
    // pointerdown으로 바로 반응 (조이스틱을 쥔 채로 다른 손가락으로 누르기)
    document.querySelectorAll('[data-hud]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        G.Sfx.init();
        const k = b.dataset.hud;
        if (k === 'dash') G.Player.dash();
        else if (k === 'potion') G.Player.potion();
        else if (k === 'skill0') G.Player.skill(0);
        else if (k === 'skill1') G.Player.skill(1);
        b.classList.add('pressed');
        setTimeout(() => b.classList.remove('pressed'), 90);
      });
    });
  }

  return { init, show, hide, update, floor, boss, abilities };
})();
