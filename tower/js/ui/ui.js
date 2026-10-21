'use strict';
// 공용 UI: 모달, 대화, 토스트, 화면 전환, 레벨업/보물/상점/일시정지/결과 창
G.Actions = {};
G.UI = (function () {
  const U = G.U;
  const $ = (id) => document.getElementById(id);
  let blockers = 0;
  let modalActs = null, modalOnClose = null, modalDismiss = false;
  const modalQueue = [];

  function block() {
    blockers++;
    const st = G.Run.st;
    if (st && st.active) st.paused = true;
    G.Input.reset();
  }
  function unblock() {
    blockers = Math.max(0, blockers - 1);
    const st = G.Run.st;
    if (!blockers && st && st.active && !st.userPaused) st.paused = false;
    G.Input.reset();
  }
  function modalOpen() { return blockers > 0; }

  // ── 모달 ───────────────────────────────────────────────
  function openModal(html, acts, opts) {
    opts = opts || {};
    if (!$('modal').classList.contains('hidden')) { modalQueue.push([html, acts, opts]); return; }
    const card = $('modalCard');
    card.className = 'modal-card' + (opts.wide ? ' wide' : '');
    card.innerHTML = typeof html === 'function' ? html() : html;
    modalActs = acts || {};
    modalOnClose = opts.onClose || null;
    modalDismiss = !!opts.dismiss;
    $('modal').classList.remove('hidden');
    card.scrollTop = 0;
    block();
  }
  function updateModal(html) {
    const card = $('modalCard');
    const top = card.scrollTop;
    card.innerHTML = html;
    card.scrollTop = top;
  }
  function closeModal() {
    if ($('modal').classList.contains('hidden')) return;
    $('modal').classList.add('hidden');
    modalActs = null;
    const cb = modalOnClose;
    modalOnClose = null;
    unblock();
    if (cb) cb();
    if (modalQueue.length && $('modal').classList.contains('hidden')) {
      const [h, a, o] = modalQueue.shift();
      openModal(h, a, o);
    }
  }

  // ── 대화 ───────────────────────────────────────────────
  const dlg = { lines: [], i: 0, cbs: [], timer: null, full: '', shown: 0, open: false };

  function speaker(key) {
    if (key === 'narrator') return { name: '', look: null };
    const c = G.CHARACTERS[key] || G.COMPANIONS[key] || G.PETS[key] || G.BOSSES[key];
    if (key === 'chick') return { name: '삐약이', look: G.PETS.chick.look };
    return c ? { name: c.name, look: c.look } : { name: key, look: null };
  }

  function dialogue(lines, cb) {
    if (!lines || !lines.length) { if (cb) cb(); return; }
    if (dlg.open) {
      dlg.lines = dlg.lines.concat(lines);
      if (cb) dlg.cbs.push(cb);
      return;
    }
    dlg.lines = lines.slice();
    dlg.i = 0;
    dlg.cbs = cb ? [cb] : [];
    dlg.open = true;
    $('dialogue').classList.remove('hidden');
    block();
    showLine();
  }

  function showLine() {
    const [who, text] = dlg.lines[dlg.i];
    const sp = speaker(who);
    const face = $('dlgFace');
    if (sp.look) {
      face.src = G.Scene.portrait(sp.look, who, 144);
      face.classList.remove('none');
    } else face.classList.add('none');
    $('dlgName').textContent = sp.name;
    dlg.full = text;
    dlg.shown = 0;
    $('dlgText').textContent = '';
    clearInterval(dlg.timer);
    dlg.timer = setInterval(() => {
      dlg.shown += 2;
      $('dlgText').textContent = dlg.full.slice(0, dlg.shown);
      if (dlg.shown >= dlg.full.length) clearInterval(dlg.timer);
    }, 30);
  }

  function advance() {
    if (!dlg.open) return;
    if (dlg.shown < dlg.full.length) {
      dlg.shown = dlg.full.length;
      $('dlgText').textContent = dlg.full;
      clearInterval(dlg.timer);
      return;
    }
    dlg.i++;
    if (dlg.i < dlg.lines.length) { showLine(); return; }
    dlg.open = false;
    clearInterval(dlg.timer);
    $('dialogue').classList.add('hidden');
    const cbs = dlg.cbs;
    dlg.cbs = [];
    unblock();
    for (const c of cbs) c();
  }

  // ── 토스트 / 페이드 ────────────────────────────────────
  function toast(html, kind) {
    const box = $('toasts');
    while (box.children.length >= 4) box.firstChild.remove();
    const d = document.createElement('div');
    d.className = 'toast' + (kind ? ' ' + kind : '');
    d.innerHTML = html;
    box.appendChild(d);
    setTimeout(() => d.remove(), 2500);
  }

  function fade(mid) {
    const f = $('fade');
    f.classList.add('on');
    setTimeout(() => {
      try { mid(); } finally { setTimeout(() => f.classList.remove('on'), 60); }
    }, 300);
  }

  // ── 아이템 카드 ─────────────────────────────────────────
  function fmtStat(k, v) {
    const info = G.STAT_INFO[k];
    if (!info) return '';
    return info.fmt === 'pct' ? '+' + U.pct(v) : '+' + U.fmt(v);
  }

  function slotHTML(item, opts) {
    opts = opts || {};
    if (!item) return `<div class="islot"><span class="empty">${opts.label || '비어 있음'}</span></div>`;
    const tag = opts.tag || 'div';
    const attrs = opts.attrs || '';
    return `<${tag} class="islot r${item.rar}" ${attrs}>
      <img src="${G.Scene.itemIcon(item, 96)}" alt="">
      ${item.upg ? `<span class="upg">+${item.upg}</span>` : ''}
      <span class="lv">Lv${item.ilvl}</span>
      ${opts.equipped ? '<span class="eq">E</span>' : ''}
      ${item.isNew && !opts.equipped ? '<span class="new"></span>' : ''}
      ${item.locked ? '<span class="lock">🔒</span>' : ''}
    </${tag}>`;
  }

  function itemCardHTML(item, cmp) {
    const R = G.RARITIES[item.rar];
    const st = G.Loot.itemStats(item);
    const cs = cmp && cmp.id !== item.id ? G.Loot.itemStats(cmp) : null;
    const lines = [];
    for (const k in st) {
      let diff = '';
      if (cs) {
        const d = st[k] - (cs[k] || 0);
        if (Math.abs(d) > 0.0001) diff = ` <span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${G.STAT_INFO[k].fmt === 'pct' ? U.pct(Math.abs(d)) : U.fmt(Math.abs(d))}</span>`;
      }
      lines.push(`<li><span>${G.STAT_INFO[k].name}</span><span>${fmtStat(k, st[k])}${diff}</span></li>`);
    }
    for (const a of item.affixes) lines.push(`<li class="affix"><span>✦ ${G.STAT_INFO[a.stat].name}</span><span>${fmtStat(a.stat, a.val)}</span></li>`);
    const u = item.uniq && G.UNIQUES.find((x) => x.id === item.uniq);
    const sub = item.slot === 'weapon' ? `${G.WEAPONS[item.wtype].name} · ${G.WEAPONS[item.wtype].desc}` : G.SLOT_NAMES[item.slot];
    const pw = G.Loot.itemPower(item), cpw = cmp && cmp.id !== item.id ? G.Loot.itemPower(cmp) : null;
    const pdiff = cpw != null ? ` <span class="${pw >= cpw ? 'up' : 'down'}">(${pw >= cpw ? '+' : ''}${U.fmt(pw - cpw)})</span>` : '';
    return `<div class="item-head">
        ${slotHTML(item)}
        <div class="grow">
          <div><span class="rar-tag" style="background:${R.color}">${R.name}</span><span class="muted">Lv ${item.ilvl}${item.upg ? ` · 강화 +${item.upg}` : ''}</span></div>
          <div class="item-name" style="color:${item.rar >= 3 ? R.color : 'var(--ink)'}">${U.esc(item.name)}</div>
          <div class="muted">${sub}</div>
        </div>
      </div>
      <ul class="statlist">
        <li><span>전투력</span><span>${U.fmt(pw)}${pdiff}</span></li>
        ${lines.join('')}
      </ul>
      ${u ? `<div class="uniq">🌟 <b>${U.esc(u.name)}</b> — ${U.esc(u.desc)}</div>` : ''}
      ${cmp && cmp.id !== item.id ? `<div class="muted" style="margin-top:6px">비교: 장착 중인 ${U.esc(cmp.name)}</div>` : ''}`;
  }

  // ── 레벨업 / 축복 ──────────────────────────────────────
  function abilityHTML(st, choices, opts) {
    const pips = (a) => {
      if (a.max > 6) return '';
      const cur = st.abilities[a.id] || 0;
      return '●'.repeat(cur) + '<span style="opacity:.35">●</span>' + '○'.repeat(Math.max(0, a.max - cur - 1));
    };
    const tag = ['', '희귀', '전설'];
    return `<h2>${opts.title || '레벨 업!'}</h2>
      <div class="sub">${opts.sub || `Lv ${st.lv} · 능력을 하나 골라요`}</div>
      <div class="choices">
        ${choices.map((a, i) => `<button class="choice rar${a.rar}" data-act="pick" data-i="${i}">
          <div class="ic">${a.icon}</div>
          <div class="grow"><div class="nm">${a.name} ${a.rar ? `<span class="badge">${tag[a.rar]}</span>` : ''}</div>
          <div class="ds">${a.desc}</div><div class="pips">${pips(a)}</div></div>
        </button>`).join('')}
      </div>
      ${st.rerolls > 0 ? `<div class="btnrow"><button class="btn white small" data-act="reroll">🎲 다시 뽑기 (${st.rerolls})</button></div>` : ''}`;
  }

  function levelUp(st, opts) {
    opts = opts || {};
    const n = 3 + (st.meta.choices >= 2 ? 1 : 0);
    let choices = G.Run.abilityChoices(n, opts.boost);
    if (!choices.length) return;
    G.Sfx.play('lvl');
    if (!opts.title && st.player) G.Fx.ring(st.player.x, st.player.y, 10, 70, '#fff3b0', 0.5, 5);
    openModal(abilityHTML(st, choices, opts), {
      pick(el) {
        const a = choices[+el.dataset.i];
        G.Run.applyAbility(a.id);
        G.Sfx.play('upgrade');
        closeModal();
        G.HUD.abilities(st);
      },
      reroll() {
        if (st.rerolls <= 0) return;
        st.rerolls--;
        choices = G.Run.abilityChoices(n, opts.boost);
        updateModal(abilityHTML(st, choices, opts));
      },
    });
  }

  // ── 보물 상자 ──────────────────────────────────────────
  function lootPopup(item, inRun) {
    const save = G.Save.data;
    const cur = G.Stats.findItem(save, save.eq[item.slot]);
    const title = item.rar >= 4 ? '✨ 전설의 보물! ✨' : '보물 상자!';
    openModal(`<h2>${title}</h2><div class="sub">탑 안에서 바로 바꿔 낄 수 있어요</div>
      <div class="card">${itemCardHTML(item, cur)}</div>
      <div class="btnrow">
        <button class="btn pink" data-act="equip">장착하기</button>
        <button class="btn white" data-act="bag">가방에 넣기</button>
      </div>`, {
      equip() {
        G.Camp.equip(item);
        if (inRun) G.Run.refreshMeta();
        toast(`${U.esc(item.name)} 장착!`);
        closeModal();
      },
      bag() { closeModal(); },
    });
  }

  // ── 탑 속 상점 ─────────────────────────────────────────
  function makeRunShop(st) {
    const base = Math.ceil(20 + st.floor * 6);
    return [
      { id: 'heal', icon: '🍲', name: '따끈한 수프', desc: '체력 50% 회복', cost: base },
      { id: 'potion', icon: '🧪', name: '물약 +1', desc: '물약을 하나 더', cost: Math.ceil(base * 0.8) },
      { id: 'ability', icon: '🎲', name: '능력 뽑기', desc: '능력 하나를 골라요', cost: Math.ceil(base * 2.2) },
      { id: 'item', icon: '🎁', name: '수상한 보따리', desc: '희귀 이상 장비 1개', cost: Math.ceil(base * 3) },
    ];
  }

  function runShop(st, prop) {
    const save = G.Save.data;
    const html = () => `<h2>🦝 너굴 상점</h2><div class="sub">"어서 와, 꼬마 기사! 보유 골드 🪙 ${U.fmt(save.gold)}"</div>
      <div class="shopgrid">${prop.stock.map((s, i) => `<div class="shopitem">
        <div class="ic">${s.icon}</div><div class="nm">${s.name}</div><div class="ds">${s.desc}</div>
        <button class="btn small ${s.sold || save.gold < s.cost ? 'off' : 'mint'}" data-act="buy" data-i="${i}" ${s.sold ? 'disabled' : ''}>${s.sold ? '판매 완료' : `🪙 ${U.fmt(s.cost)}`}</button>
      </div>`).join('')}</div>
      <div class="btnrow"><button class="btn white" data-act="leave">떠나기</button></div>`;
    openModal(html(), {
      buy(el) {
        const s = prop.stock[+el.dataset.i];
        if (s.sold || save.gold < s.cost) { G.Sfx.play('hurt'); return; }
        save.gold -= s.cost;
        st.gained.gold -= s.cost;
        s.sold = true;
        G.Sfx.play('coin');
        if (s.id === 'heal') G.Combat.heal(st.player.maxHp * 0.5, true);
        if (s.id === 'potion') st.potions++;
        if (s.id === 'ability') levelUp(st, { title: '능력 뽑기', sub: '너굴이 몰래 알려준 비법' });
        if (s.id === 'item') {
          const it = G.Loot.randomItem(st.floor, st.rs.luck + 0.4, 2);
          G.Loot.addItemToSave(it);
          st.gained.items.push(it);
          lootPopup(it, true);
        }
        G.Save.persist();
        updateModal(html());
      },
      leave() { closeModal(); },
    }, { dismiss: true });
  }

  // ── 일시정지 ───────────────────────────────────────────
  function pause() {
    const st = G.Run.st;
    if (!st || !st.active || modalOpen()) return;
    const abil = Object.keys(st.abilities).map((id) => {
      const a = G.ABILITIES.find((x) => x.id === id);
      return `<span class="chip" style="font-size:13px">${a.icon} ${a.name} ${st.abilities[id]}</span>`;
    }).join(' ');
    const sound = G.Save.data.settings.sound;
    openModal(`<h2>잠깐 쉬어요</h2><div class="sub">${st.floor}층 · ${U.esc(st.stage.name)} · Lv ${st.lv}</div>
      <div class="card"><div class="muted" style="margin-bottom:6px">이번 탑에서 얻은 능력</div><div class="row wrap">${abil || '<span class="muted">아직 없어요</span>'}</div></div>
      <div class="card" style="margin-top:10px"><div class="stats-line">
        <span>처치 <b>${st.gained.kills}</b></span><span>골드 <b>${st.gained.gold >= 0 ? '+' : ''}${U.fmt(st.gained.gold)}</b></span><span>장비 <b>${st.gained.items.length}</b></span><span>물약 <b>${st.potions}</b></span><span>부활 <b>${st.revives}</b></span>
      </div></div>
      <div class="btnrow">
        <button class="btn mint" data-act="resume">계속하기</button>
        <button class="btn white small" data-act="sound">${sound ? '🔊 소리 켜짐' : '🔇 소리 꺼짐'}</button>
      </div>
      <div class="btnrow"><button class="btn white small" data-act="quit">마을로 돌아가기 (전리품은 그대로!)</button></div>`, {
      resume() { closeModal(); },
      sound(el) {
        G.Save.data.settings.sound = !G.Save.data.settings.sound;
        el.textContent = G.Save.data.settings.sound ? '🔊 소리 켜짐' : '🔇 소리 꺼짐';
        G.Save.persist();
      },
      quit() { closeModal(); G.Run.end('quit'); },
    }, { dismiss: true });
  }

  // ── 결과 ───────────────────────────────────────────────
  function result(st, reason) {
    const save = G.Save.data;
    const g = st.gained;
    const title = reason === 'dead' ? '쓰러졌어요…' : reason === 'return' ? '무사히 귀환!' : '마을로 돌아왔어요';
    const line = reason === 'dead' ? U.pick(G.STORY.death) : '등불이 반짝이며 모찌를 야영지로 데려다주었어요.';
    const items = g.items.slice(0, 30).map((it) => slotHTML(it)).join('');
    const runes = g.runes.length ? `<div class="muted" style="text-align:center;margin-top:6px">룬 ${g.runes.length}개 획득</div>` : '';
    const best = st.floor >= save.best ? '<div class="toast big" style="animation:none;margin:0 auto 8px;display:table">🏆 최고 기록!</div>' : '';
    openModal(`<h2>${title}</h2><div class="sub">${line}</div>${best}
      <div class="result-grid">
        <div>도달한 층<b>${st.floor}층</b></div>
        <div>쓰러뜨린 적<b>${g.kills}</b></div>
        <div>골드<b>🪙 ${g.gold >= 0 ? '+' : ''}${U.fmt(g.gold)}</b></div>
        <div>보석 · 별조각<b>💎${g.gems} ⭐${g.shards}</b></div>
      </div>
      ${items ? `<div class="muted" style="text-align:center;margin-bottom:6px">새 장비 ${g.items.length}개</div><div class="lootrow">${items}</div>` : ''}
      ${runes}
      <div class="btnrow"><button class="btn pink big" data-act="home">마을로</button></div>`, {
      home() { closeModal(); G.Main.toCamp(); },
    });
    G.Sfx.play(reason === 'dead' ? 'die' : 'clear');
  }

  // ── 클릭 위임 ──────────────────────────────────────────
  function init() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) {
        if (e.target.id === 'modal' && modalDismiss) closeModal();
        return;
      }
      G.Sfx.init();
      G.Sfx.play('click');
      const act = el.dataset.act;
      if (modalActs && el.closest('#modal')) {
        if (modalActs[act]) modalActs[act](el);
        return;
      }
      if (G.Actions[act]) G.Actions[act](el);
    });
    $('dialogue').addEventListener('pointerdown', (e) => { e.preventDefault(); G.Sfx.init(); advance(); });
  }

  function onKey(code) {
    if (dlg.open && (code === 'Space' || code === 'Enter')) { advance(); return true; }
    if (code === 'Escape') {
      if (!$('modal').classList.contains('hidden')) { if (modalDismiss) closeModal(); return true; }
      if (G.Run.st && G.Run.st.active) { pause(); return true; }
    }
    return false;
  }

  return {
    init, onKey, openModal, updateModal, closeModal, modalOpen, dialogue, advance, toast, fade,
    slotHTML, itemCardHTML, fmtStat, levelUp, lootPopup, makeRunShop, runShop, pause, result,
    get dialogueOpen() { return dlg.open; },
  };
})();
