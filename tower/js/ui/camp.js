'use strict';
// 마을(탑 아래 야영지) 정비 화면: 출발 / 장비 / 성장(룬·특성·스킬) / 친구(펫·동료) / 상점
G.Camp = (function () {
  const U = G.U;
  const $ = (id) => document.getElementById(id);
  const S = () => G.Save.data;
  const ui = { tab: 'climb', grow: 'rune', friends: 'pet', filter: 'all', start: 1 };
  const GIFT_MS = 4 * 60 * 60 * 1000;

  function persist() { G.Save.persist(); refreshRes(); }
  function refreshRes() {
    const s = S();
    $('resGold').textContent = U.fmt(s.gold);
    $('resGems').textContent = U.fmt(s.gems);
    $('resShards').textContent = U.fmt(s.shards);
  }
  function deny(msg) { G.Sfx.play('hurt'); G.UI.toast(msg); }

  function render() {
    refreshRes();
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
    const body = $('panelBody');
    const top = body.scrollTop;
    body.innerHTML = ({ climb: renderClimb, gear: renderGear, grow: renderGrow, friends: renderFriends, shop: renderShop })[ui.tab]();
    body.scrollTop = top;
  }

  // ── 출발 ───────────────────────────────────────────────
  function startFloors() {
    const s = S();
    const list = [1];
    for (let f = 10; f <= s.checkpoint; f += 10) list.push(f + 1);
    return list;
  }

  function renderClimb() {
    const s = S();
    const m = G.Stats.meta(s);
    const floors = startFloors();
    if (!floors.includes(ui.start)) ui.start = floors[floors.length - 1];
    const stage = G.stageOf(ui.start);
    const w = m.weaponItem;
    const sk = s.skills.eq.map((k) => (k ? G.ACTIVE_SKILLS[k].icon : '·'));
    const pet = s.pets.active && G.PETS[s.pets.active];
    const comp = s.comps.active && G.COMPANIONS[s.comps.active];
    const giftReady = Date.now() >= s.freeBoxAt;
    return `<div class="stack">
      <div class="card">
        <div class="power"><div class="lbl">전투력</div><div class="num">${U.fmt(m.power)}</div></div>
        <div class="statgrid">
          <div>공격력<b>${U.fmt(m.atk)}</b></div>
          <div>체력<b>${U.fmt(m.maxHp)}</b></div>
          <div>방어력<b>${U.fmt(m.def)}</b></div>
          <div>공격 속도<b>×${m.aspd.toFixed(2)}</b></div>
          <div>치명타<b>${U.pct(m.crit)}</b></div>
          <div>무기<b>${G.WEAPONS[m.wtype].name}</b></div>
        </div>
      </div>
      <div class="card">
        <div class="sec-title">출발할 층 <small>최고 기록 ${s.best}층</small></div>
        <div class="floors">${floors.map((f) => `<button class="${f === ui.start ? 'on' : ''}" data-act="startFloor" data-f="${f}">${f}층</button>`).join('')}</div>
        <div class="muted" style="margin-top:8px">${stage.name} · ${stage.sub}${s.checkpoint < 10 ? ' — 10층 보스를 물리치면 다음 스테이지부터 출발할 수 있어요' : ''}</div>
      </div>
      <button class="btn climb-btn" data-act="climb">🏰 ${ui.start}층부터 오르기!</button>
      <div class="card">
        <div class="loadout">
          <div class="slotmini">${w ? `<img src="${G.Scene.itemIcon(w, 96)}" alt="">` : '🐾'}</div>
          <div class="slotmini">${sk[0]}</div>
          <div class="slotmini">${sk[1]}</div>
          <div class="slotmini">${pet ? `<img src="${G.Scene.portrait(pet.look, s.pets.active, 96)}" alt="">` : '·'}</div>
          <div class="slotmini">${comp ? `<img src="${G.Scene.portrait(comp.look, s.comps.active, 96)}" alt="">` : '·'}</div>
        </div>
        <div class="muted" style="text-align:center;margin-top:6px">무기 · 스킬 1 · 스킬 2 · 펫 · 동료</div>
      </div>
      ${giftReady ? `<button class="card gift row" data-act="gift" style="text-align:left"><span style="font-size:30px;font-family:var(--emoji)">🎁</span><span class="grow">무료 선물이 도착했어요! <span class="muted">눌러서 받기</span></span></button>` : ''}
    </div>`;
  }

  // ── 장비 ───────────────────────────────────────────────
  function equippedIds() { return new Set(Object.values(S().eq).filter(Boolean)); }

  function renderGear() {
    const s = S();
    const eqIds = equippedIds();
    const m = G.Stats.meta(s);
    const slots = G.SLOTS.map((sl) => {
      const it = G.Stats.findItem(s, s.eq[sl]);
      return it ? G.UI.slotHTML(it, { tag: 'button', equipped: true, attrs: `data-act="itemView" data-id="${it.id}"` }) : `<div class="islot"><span class="empty">${G.SLOT_NAMES[sl]}</span></div>`;
    }).join('');
    let items = s.inv.filter((it) => ui.filter === 'all' || it.slot === ui.filter);
    items.sort((a, b) => (eqIds.has(b.id) - eqIds.has(a.id)) || b.rar - a.rar || G.Loot.itemPower(b) - G.Loot.itemPower(a));
    const filters = [['all', '전체']].concat(G.SLOTS.map((x) => [x, G.SLOT_NAMES[x]]));
    return `<div class="sec-title">장착 장비 <small>전투력 ${U.fmt(m.power)}</small></div>
      <div class="eqslots">${slots}</div>
      <div class="stats-line" style="margin:8px 2px 14px">
        <span>공격력 <b>${U.fmt(m.atk)}</b></span><span>체력 <b>${U.fmt(m.maxHp)}</b></span><span>방어력 <b>${U.fmt(m.def)}</b></span>
        <span>치명 <b>${U.pct(m.crit)}</b></span><span>치명 피해 <b>${U.pct(m.critDmg)}</b></span><span>공속 <b>×${m.aspd.toFixed(2)}</b></span>
      </div>
      <div class="sec-title">가방 <small>${s.inv.length}개</small></div>
      <div class="filters">${filters.map(([k, n]) => `<button class="${ui.filter === k ? 'on' : ''}" data-act="filter" data-f="${k}">${n}</button>`).join('')}</div>
      <div class="invgrid">${items.map((it) => G.UI.slotHTML(it, { tag: 'button', equipped: eqIds.has(it.id), attrs: `data-act="itemView" data-id="${it.id}"` })).join('') || '<div class="muted">아직 장비가 없어요. 탑에서 찾아보세요!</div>'}</div>
      <div class="btnrow"><button class="btn white small" data-act="salvageAll">🔨 일반·고급 장비 한꺼번에 분해</button></div>`;
  }

  function itemView(id) {
    const s = S();
    const item = s.inv.find((x) => x.id === id);
    if (!item) return;
    item.isNew = false;
    const html = () => {
      const isEq = s.eq[item.slot] === item.id;
      const cur = G.Stats.findItem(s, s.eq[item.slot]);
      const up = G.Loot.upgradeCost(item);
      const canUp = item.upg < G.Loot.MAX_UPG;
      return `<div class="card">${G.UI.itemCardHTML(item, isEq ? null : cur)}</div>
        <div class="btnrow">
          <button class="btn ${isEq ? 'white' : 'pink'}" data-act="toggleEquip">${isEq ? '해제' : '장착'}</button>
          <button class="btn ${canUp && s.gold >= up ? 'butter' : 'off'}" data-act="upgrade">${canUp ? `강화 +${item.upg + 1}<span class="cost">🪙${U.fmt(up)}</span>` : '최대 강화'}</button>
        </div>
        <div class="btnrow">
          <button class="btn white small" data-act="lock">${item.locked ? '🔓 잠금 해제' : '🔒 잠그기'}</button>
          <button class="btn white small ${isEq || item.locked ? 'off' : ''}" data-act="salvage">분해 +🪙${U.fmt(G.Loot.salvageValue(item))}</button>
          <button class="btn white small" data-act="close">닫기</button>
        </div>`;
    };
    G.UI.openModal(html(), {
      toggleEquip() {
        if (s.eq[item.slot] === item.id) s.eq[item.slot] = null;
        else equip(item);
        G.Sfx.play('upgrade');
        persist(); render();
        G.UI.updateModal(html());
      },
      upgrade() {
        const c = G.Loot.upgradeCost(item);
        if (item.upg >= G.Loot.MAX_UPG) return;
        if (s.gold < c) { deny('골드가 부족해요'); return; }
        s.gold -= c;
        item.upg++;
        G.Sfx.play('upgrade');
        G.UI.toast(`강화 성공! +${item.upg}`);
        persist(); render();
        G.UI.updateModal(html());
      },
      lock() { item.locked = !item.locked; persist(); render(); G.UI.updateModal(html()); },
      salvage() {
        if (s.eq[item.slot] === item.id || item.locked) { deny('장착 중이거나 잠긴 장비예요'); return; }
        const v = G.Loot.salvageValue(item);
        s.inv.splice(s.inv.indexOf(item), 1);
        s.gold += v;
        G.Sfx.play('coin');
        G.UI.toast(`분해 완료 +🪙${U.fmt(v)}`);
        persist(); G.UI.closeModal(); render();
      },
      close() { G.UI.closeModal(); render(); },
    }, { dismiss: true, onClose: render });
  }

  function equip(item) {
    const s = S();
    s.eq[item.slot] = item.id;
    item.isNew = false;
    G.Save.persist();
  }

  function salvageAll() {
    const s = S();
    const eq = equippedIds();
    const list = s.inv.filter((it) => it.rar <= 1 && !it.locked && !eq.has(it.id));
    if (!list.length) { G.UI.toast('분해할 일반·고급 장비가 없어요'); return; }
    const total = list.reduce((a, it) => a + G.Loot.salvageValue(it), 0);
    G.UI.openModal(`<h2>한꺼번에 분해</h2><div class="sub">잠기지 않은 일반·고급 장비 ${list.length}개를 분해할까요?</div>
      <div class="card" style="text-align:center;font-size:20px">+🪙 ${U.fmt(total)}</div>
      <div class="btnrow"><button class="btn pink" data-act="yes">분해하기</button><button class="btn white" data-act="no">그만두기</button></div>`, {
      yes() {
        const ids = new Set(list.map((x) => x.id));
        s.inv = s.inv.filter((x) => !ids.has(x.id));
        s.gold += total;
        G.Sfx.play('coin');
        persist(); G.UI.closeModal(); render();
      },
      no() { G.UI.closeModal(); },
    }, { dismiss: true });
  }

  // ── 성장: 룬 / 특성 / 스킬 ─────────────────────────────
  function renderGrow() {
    const sub = `<div class="subtabs">
      ${[['rune', '🔮 룬'], ['trait', '🌳 특성'], ['skill', '⚡ 스킬']].map(([k, n]) => `<button class="${ui.grow === k ? 'on' : ''}" data-act="sub" data-k="grow" data-v="${k}">${n}</button>`).join('')}
    </div>`;
    return sub + ({ rune: renderRunes, trait: renderTraits, skill: renderSkills })[ui.grow]();
  }

  function runeHTML(r, attrs) {
    const def = G.RUNE_TYPES[r.type];
    return `<button class="rune" style="background:${def.color}" ${attrs || ''}>${def.icon}<span class="g">${G.RUNE_GRADE_NAMES[r.grade - 1]}</span></button>`;
  }

  function renderRunes() {
    const s = S();
    const slotted = new Set(s.runeSlots.filter(Boolean));
    const slots = s.runeSlots.map((id, i) => {
      if (i >= s.runeSlotsOpen) {
        const cost = G.RUNE_SLOT_COST[i];
        return `<button class="rune locked" data-act="runeUnlock" data-i="${i}">🔒<span class="g">💎${cost}</span></button>`;
      }
      const r = s.runes.find((x) => x.id === id);
      return r ? runeHTML(r, `data-act="runeSlot" data-i="${i}"`) : `<button class="rune" data-act="runeSlot" data-i="${i}" style="font-size:14px">＋</button>`;
    }).join('');
    // 장착 효과
    const eff = {};
    for (let i = 0; i < s.runeSlotsOpen; i++) {
      const r = s.runes.find((x) => x.id === s.runeSlots[i]);
      if (!r) continue;
      const d = G.RUNE_TYPES[r.type];
      eff[d.stat] = (eff[d.stat] || 0) + d.vals[r.grade - 1];
    }
    const effHTML = Object.keys(eff).map((k) => `<span>${G.STAT_INFO[k].name} <b>${G.UI.fmtStat(k, eff[k])}</b></span>`).join('') || '<span>장착한 룬이 없어요</span>';
    const groups = {};
    for (const r of s.runes) {
      if (slotted.has(r.id)) continue;
      const k = r.type + ':' + r.grade;
      groups[k] = groups[k] || { type: r.type, grade: r.grade, n: 0 };
      groups[k].n++;
    }
    const list = Object.values(groups).sort((a, b) => b.grade - a.grade || a.type.localeCompare(b.type));
    return `<div class="card">
        <div class="sec-title">룬 슬롯 <small>보스를 물리치면 슬롯이 늘어나요</small></div>
        <div class="runeslots">${slots}</div>
        <div class="stats-line" style="margin-top:10px">${effHTML}</div>
      </div>
      <div class="sec-title" style="margin-top:14px">룬 가방 <small>같은 룬 3개 → 한 등급 위로!</small></div>
      <div class="btnrow" style="margin:0 0 10px"><button class="btn lilac small" data-act="runeMerge">✨ 모두 합성하기</button></div>
      <div class="runelist">${list.map((g) => {
        const d = G.RUNE_TYPES[g.type];
        return `<button class="runecard" data-act="runeEquip" data-type="${g.type}" data-grade="${g.grade}">
          <span class="rune" style="background:${d.color}">${d.icon}<span class="g">${G.RUNE_GRADE_NAMES[g.grade - 1]}</span></span>
          <span class="info"><b>${d.name} ×${g.n}</b>${G.STAT_INFO[d.stat].name} ${G.UI.fmtStat(d.stat, d.vals[g.grade - 1])}</span>
        </button>`;
      }).join('') || '<div class="muted">룬은 탑의 엘리트·보스·보물 상자, 상점의 룬 주머니에서 얻어요.</div>'}</div>`;
  }

  function treePoints(tree) {
    const s = S();
    return tree.nodes.reduce((a, n) => a + (s.traits[n.id] || 0), 0);
  }

  function renderTraits() {
    const s = S();
    return `<div class="muted" style="margin-bottom:8px">⭐ 별조각으로 영구 특성을 배워요. 층을 오를 때마다, 보스를 물리칠 때마다 별조각을 얻어요.</div>
      <div class="trees">${G.TRAIT_TREES.map((tree) => {
        const pts = treePoints(tree);
        return `<div class="tree"><h4 style="background:${tree.color}">${tree.icon} ${tree.name}</h4><div class="pts">${pts}포인트</div>
          ${tree.nodes.map((n, idx) => {
            const lv = s.traits[n.id] || 0;
            const locked = pts < n.req;
            const max = lv >= n.max;
            const cost = G.traitCost(n, lv, idx);
            const val = n.stat === 'potions' ? `물약 +${n.per}` : n.stat === 'revive' ? '부활 1회' : n.stat === 'choices' ? (lv ? '선택지 +1' : '다시 뽑기 +1') : `${G.STAT_INFO[n.stat].name} ${G.UI.fmtStat(n.stat, n.per)}`;
            return `<button class="tnode ${locked ? 'locked' : ''} ${max ? 'max' : ''}" data-act="trait" data-id="${n.id}">
              <span class="ic">${n.icon}</span><span class="nm">${n.name}</span><span class="lv">${lv}/${n.max}</span>
              <span class="muted" style="font-size:11px">${val}</span>
              <span style="font-size:12px">${max ? '완료' : locked ? `🔒 ${n.req}포인트` : `⭐${cost}`}</span>
            </button>`;
          }).join('')}</div>`;
      }).join('')}</div>`;
  }

  function skillDesc(key, lv) {
    const d = G.ACTIVE_SKILLS[key];
    return d.desc
      .replace('{d}', d.dmg ? Math.round(d.dmg * (1 + 0.2 * (lv - 1)) * 100) + '%' : '')
      .replace('{h}', d.heal ? Math.round((d.heal + 0.05 * (lv - 1)) * 100) + '%' : '')
      .replace('{u}', d.dur ? (d.dur + 0.3 * (lv - 1)).toFixed(1) : '');
  }

  function renderSkills() {
    const s = S();
    return `<div class="muted" style="margin-bottom:8px">스킬은 2개까지 들고 갈 수 있어요. 탑 안 오른쪽 아래 버튼으로 사용!</div>
      <div class="cards">${Object.keys(G.ACTIVE_SKILLS).map((k) => {
        const d = G.ACTIVE_SKILLS[k];
        const owned = s.skills.owned.includes(k);
        const lv = s.skills.lv[k] || 1;
        const slot = s.skills.eq.indexOf(k);
        const upCost = G.skillUpCost(lv);
        return `<div class="ucard ${slot >= 0 ? 'active' : ''} ${owned ? '' : 'locked'}">
          <div class="face">${G.Assets.icon('icon_skill_' + k) ? `<img src="${G.Assets.icon('icon_skill_' + k).src}" alt="">` : d.icon}</div>
          <div class="body"><div class="nm">${d.name} ${owned ? `<small>Lv ${lv}</small>` : ''} ${slot >= 0 ? `<span class="badge">슬롯 ${slot + 1}</span>` : ''}</div>
            <div class="ds">${skillDesc(k, lv)} <br>쿨다운 ${(d.cd * (1 - 0.04 * (lv - 1))).toFixed(1)}초</div></div>
          <div class="acts">${owned ? `
            <div class="row"><button class="btn small ${slot === 0 ? 'mint' : 'white'}" data-act="skillEquip" data-k="${k}" data-i="0">1</button><button class="btn small ${slot === 1 ? 'mint' : 'white'}" data-act="skillEquip" data-k="${k}" data-i="1">2</button></div>
            ${lv < G.SKILL_MAX_LV ? `<button class="btn small ${s.shards >= upCost ? 'butter' : 'off'}" data-act="skillUp" data-k="${k}">강화 ⭐${upCost}</button>` : '<span class="badge">MAX</span>'}`
            : `<button class="btn small ${s.shards >= d.cost ? 'pink' : 'off'}" data-act="skillLearn" data-k="${k}">배우기 ⭐${d.cost}</button>`}
          </div>
        </div>`;
      }).join('')}</div>`;
  }

  // ── 친구: 펫 / 동료 ────────────────────────────────────
  function renderFriends() {
    const sub = `<div class="subtabs">
      ${[['pet', '🐥 펫'], ['comp', '🤝 동료']].map(([k, n]) => `<button class="${ui.friends === k ? 'on' : ''}" data-act="sub" data-k="friends" data-v="${k}">${n}</button>`).join('')}
    </div>`;
    return sub + (ui.friends === 'pet' ? renderPets() : renderComps());
  }

  function passiveText(def, lv) {
    return Object.keys(def.passive).map((k) => `${G.STAT_INFO[k].name} ${G.UI.fmtStat(k, def.passive[k] + (def.per[k] || 0) * (lv - 1))}`).join(', ');
  }

  function renderPets() {
    const s = S();
    return `<div class="muted" style="margin-bottom:8px">펫은 탑 안에서 늘 곁을 따라다니며 싸워요. 펫 알은 상점에서!</div><div class="cards">${Object.keys(G.PETS).map((k) => {
      const d = G.PETS[k];
      const lv = s.pets.owned[k];
      const owned = lv != null;
      const active = s.pets.active === k;
      const cost = G.petUpCost(lv || 1);
      const hint = k === 'ppoyong' ? '5스테이지(50층) 보스를 구하면 함께해요' : '상점의 펫 알에서 만날 수 있어요';
      return `<div class="ucard ${active ? 'active' : ''} ${owned ? '' : 'locked'}">
        <div class="face"><img src="${G.Scene.portrait(d.look, k, 128, { dim: !owned })}" alt=""></div>
        <div class="body"><div class="nm">${owned ? d.name : '???'} ${owned ? `<small>Lv ${lv}/${G.PET_MAX_LV}</small>` : ''}</div>
          <div class="ds">${owned ? `<b>${d.skill}</b> · ${d.desc}<br>${passiveText(d, lv)}` : hint}</div></div>
        ${owned ? `<div class="acts">
          ${active ? '<span class="badge">함께하는 중</span>' : `<button class="btn small mint" data-act="petActive" data-k="${k}">데려가기</button>`}
          ${lv < G.PET_MAX_LV ? `<button class="btn small ${s.gold >= cost ? 'butter' : 'off'}" data-act="petUp" data-k="${k}">🪙${U.fmt(cost)}</button>` : '<span class="badge">MAX</span>'}
        </div>` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  function renderComps() {
    const s = S();
    return `<div class="muted" style="margin-bottom:8px">보스에게서 구해 낸 마을 친구들이 동료가 되어 함께 싸워요.</div><div class="cards">${Object.keys(G.COMPANIONS).map((k) => {
      const d = G.COMPANIONS[k];
      const lv = s.comps.owned[k];
      const owned = lv != null;
      const active = s.comps.active === k;
      const cost = G.compUpCost(lv || 1);
      const stage = G.STAGES.find((x) => x.villager === k);
      return `<div class="ucard ${active ? 'active' : ''} ${owned ? '' : 'locked'}">
        <div class="face"><img src="${G.Scene.portrait(d.look, k, 128, { dim: !owned })}" alt=""></div>
        <div class="body"><div class="nm">${owned ? d.name : '???'} <small>${d.role}</small> ${owned ? `<small>Lv ${lv}/${G.COMP_MAX_LV}</small>` : ''}</div>
          <div class="ds">${owned ? d.desc : `${stage ? stage.id * 10 : '?'}층 「${stage ? stage.name : ''}」의 보스를 물리치면 합류해요`}</div></div>
        ${owned ? `<div class="acts">
          ${active ? `<button class="btn small white" data-act="compActive" data-k="">쉬게 하기</button>` : `<button class="btn small mint" data-act="compActive" data-k="${k}">데려가기</button>`}
          ${lv < G.COMP_MAX_LV ? `<button class="btn small ${s.gold >= cost ? 'butter' : 'off'}" data-act="compUp" data-k="${k}">🪙${U.fmt(cost)}</button>` : '<span class="badge">MAX</span>'}
        </div>` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  // ── 상점 ───────────────────────────────────────────────
  function shopList() {
    const s = S();
    const lvl = Math.max(1, s.best);
    const box = Math.floor(60 * Math.pow(G.S(lvl), 0.85));
    const rune = Math.floor(140 * Math.pow(G.S(lvl), 0.7));
    const pot = Math.floor(200 * Math.pow(1.6, s.potionLv));
    return [
      { id: 'box', icon: '📦', name: '장비 상자', desc: `Lv${lvl} 장비 1개`, cur: 'gold', cost: box },
      { id: 'box10', icon: '🧳', name: '장비 상자 ×10', desc: `Lv${lvl} 장비 10개 (1개 덤)`, cur: 'gold', cost: box * 9 },
      { id: 'goldbox', icon: '💝', name: '반짝 장비 상자', desc: '희귀 등급 이상 보장', cur: 'gems', cost: 30 },
      { id: 'rune', icon: '🔮', name: '룬 주머니', desc: '무작위 룬 3개', cur: 'gold', cost: rune },
      { id: 'egg', icon: '🥚', name: '펫 알', desc: '새 펫 또는 펫 레벨업', cur: 'gems', cost: 40 },
      { id: 'potion', icon: '🧪', name: '물약 강화', desc: s.potionLv >= 10 ? '최대 강화' : `물약 회복량 ${30 + s.potionLv * 4}% → ${34 + s.potionLv * 4}%`, cur: 'gold', cost: s.potionLv >= 10 ? 0 : pot, max: s.potionLv >= 10 },
      { id: 'shards', icon: '⭐', name: '별조각 꾸러미', desc: '별조각 10개', cur: 'gems', cost: 25 },
    ];
  }

  function renderShop() {
    const s = S();
    const ready = Date.now() >= s.freeBoxAt;
    const left = Math.max(0, s.freeBoxAt - Date.now());
    const hh = Math.floor(left / 3600000), mm = Math.ceil((left % 3600000) / 60000);
    return `<div class="stack">
      <button class="card gift row" data-act="gift" style="text-align:left">
        <span style="font-size:30px;font-family:var(--emoji)">🎁</span>
        <span class="grow">무료 선물 <span class="muted">${ready ? '지금 받을 수 있어요!' : `${hh}시간 ${mm}분 뒤에 다시 와요`}</span></span>
      </button>
      <div class="shopgrid">${shopList().map((it) => {
        const have = it.cur === 'gold' ? s.gold : s.gems;
        const ok = !it.max && have >= it.cost;
        return `<div class="shopitem"><div class="ic">${it.icon}</div><div class="nm">${it.name}</div><div class="ds">${it.desc}</div>
          <button class="btn small ${ok ? 'mint' : 'off'}" data-act="shopBuy" data-id="${it.id}">${it.max ? 'MAX' : `${it.cur === 'gold' ? '🪙' : '💎'} ${U.fmt(it.cost)}`}</button></div>`;
      }).join('')}</div>
    </div>`;
  }

  function buy(id) {
    const s = S();
    const it = shopList().find((x) => x.id === id);
    if (!it || it.max) return;
    const key = it.cur;
    if (s[key] < it.cost) { deny(key === 'gold' ? '골드가 부족해요' : '보석이 부족해요'); return; }
    const lvl = Math.max(1, s.best);
    let got = [];
    switch (id) {
      case 'box': got = [G.Loot.randomItem(lvl, 0)]; break;
      case 'box10': for (let i = 0; i < 10; i++) got.push(G.Loot.randomItem(lvl, 0.1)); break;
      case 'goldbox': got = [G.Loot.randomItem(lvl, 0.6, 2)]; break;
      case 'rune': {
        const rs = [];
        for (let i = 0; i < 3; i++) rs.push(G.Loot.makeRune(null, G.Loot.runeGradeFor(lvl)));
        s.runes.push(...rs);
        G.UI.toast('룬 획득! ' + rs.map((r) => G.RUNE_TYPES[r.type].icon + G.RUNE_GRADE_NAMES[r.grade - 1]).join(' '));
        break;
      }
      case 'egg': {
        const pool = Object.keys(G.PETS).filter((k) => k !== 'ppoyong' && s.pets.owned[k] == null);
        if (pool.length) {
          const k = U.pick(pool);
          s.pets.owned[k] = 1;
          G.UI.openModal(`<h2>알이 깨졌어요!</h2><div class="card" style="text-align:center"><img src="${G.Scene.portrait(G.PETS[k].look, k, 160)}" style="width:140px" alt=""><div style="font-size:22px">${G.PETS[k].name}</div><div class="muted">${G.PETS[k].skill} · ${G.PETS[k].desc}</div></div><div class="btnrow"><button class="btn mint" data-act="take">데려가기</button><button class="btn white" data-act="ok">좋아요</button></div>`, {
            take() { s.pets.active = k; persist(); G.UI.closeModal(); render(); },
            ok() { G.UI.closeModal(); },
          });
        } else {
          const owned = Object.keys(s.pets.owned).filter((k) => s.pets.owned[k] < G.PET_MAX_LV);
          if (!owned.length) { deny('모든 펫이 최대 레벨이에요!'); return; }
          const k = U.pick(owned);
          s.pets.owned[k]++;
          G.UI.toast(`${G.PETS[k].name} 레벨 업! Lv ${s.pets.owned[k]}`);
        }
        break;
      }
      case 'potion': s.potionLv++; G.UI.toast('물약이 더 진해졌어요!'); break;
      case 'shards': s.shards += 10; G.UI.toast('⭐ 별조각 +10'); break;
    }
    s[key] -= it.cost;
    for (const item of got) G.Loot.addItemToSave(item);
    if (got.length === 1) G.UI.lootPopup(got[0], false);
    else if (got.length > 1) showMany(got);
    G.Sfx.play(got.some((x) => x.rar >= 4) ? 'legend' : 'chest');
    persist(); render();
  }

  function showMany(items) {
    G.UI.openModal(`<h2>상자를 열었어요!</h2><div class="lootrow">${items.map((it) => G.UI.slotHTML(it)).join('')}</div>
      <div class="btnrow"><button class="btn mint" data-act="ok">확인</button></div>`, { ok() { G.UI.closeModal(); } }, { dismiss: true });
  }

  function gift() {
    const s = S();
    if (Date.now() < s.freeBoxAt) { G.UI.toast('아직 선물이 준비되지 않았어요'); return; }
    const gold = Math.floor(100 * Math.pow(G.S(Math.max(1, s.best)), 0.8));
    s.gold += gold;
    s.gems += 5;
    s.freeBoxAt = Date.now() + GIFT_MS;
    G.Sfx.play('chest');
    G.UI.toast(`🎁 선물! 🪙${U.fmt(gold)} 💎5`, 'big');
    persist(); render();
  }

  // ── 이야기 · 도감 · 설정 ───────────────────────────────
  function openStory() {
    const s = S();
    const list = () => `<h2>📖 모찌와 백 층의 꿈</h2><div class="sub">스테이지 보스를 물리칠 때마다 다음 장이 열려요</div>
      <div class="chapters">${G.CHAPTER_TITLES.map((t, i) => {
        const open = i < s.chapters;
        return `<button class="${open ? '' : 'locked'}" data-act="read" data-i="${i}">${open ? t : `🔒 ${i < 11 ? `${i}스테이지 보스를 물리치면` : '탑 꼭대기에서'} 열려요`}</button>`;
      }).join('')}</div>
      <div class="btnrow"><button class="btn white" data-act="close">닫기</button></div>`;
    const reader = (i) => {
      const ch = (G.NOVEL || [])[i];
      const paras = ch ? ch.paras.map((p) => `<p>${U.esc(p)}</p>`).join('') : '<p>본문은 docs/novel 폴더에 있어요.</p>';
      return `<div class="reader"><h3>${U.esc(G.CHAPTER_TITLES[i])}</h3>${paras}</div>
        <div class="btnrow">
          ${i > 0 ? `<button class="btn white small" data-act="read" data-i="${i - 1}">◀ 이전 장</button>` : ''}
          <button class="btn white small" data-act="list">목차</button>
          ${i + 1 < s.chapters ? `<button class="btn mint small" data-act="read" data-i="${i + 1}">다음 장 ▶</button>` : ''}
        </div>`;
    };
    G.UI.openModal(list(), {
      read(el) {
        const i = +el.dataset.i;
        if (i >= s.chapters) { G.UI.toast('아직 열리지 않은 장이에요'); return; }
        G.UI.updateModal(reader(i));
        document.getElementById('modalCard').scrollTop = 0;
      },
      list() { G.UI.updateModal(list()); },
      close() { G.UI.closeModal(); },
    }, { dismiss: true, wide: true });
  }

  function openDex() {
    const s = S();
    const seen = Object.keys(s.dex).length;
    const total = Object.keys(G.MONSTERS).length + Object.keys(G.BOSSES).length;
    const html = `<h2>📚 몬스터 도감</h2><div class="sub">만난 몬스터 ${seen} / ${total}</div>
      ${G.STAGES.map((st) => {
        const keys = st.monsters.concat([st.boss]);
        return `<div class="dexstage">${st.id}. ${st.name} <span class="muted">${(st.id - 1) * 10 + 1}~${st.id * 10}층</span></div>
          <div class="dexgrid">${keys.map((k) => {
            const d = G.MONSTERS[k] || G.BOSSES[k];
            const ok = !!s.dex[k];
            return `<div class="dexcell"><img src="${G.Scene.portrait(d.look, k, 112, { dim: !ok })}" alt="">${ok ? U.esc(d.name) : '???'}</div>`;
          }).join('')}</div>`;
      }).join('')}
      <div class="btnrow"><button class="btn white" data-act="close">닫기</button></div>`;
    G.UI.openModal(html, { close() { G.UI.closeModal(); } }, { dismiss: true, wide: true });
  }

  function openSettings() {
    const s = S();
    let confirmReset = false;
    const html = () => `<h2>⚙️ 설정</h2>
      <div class="setting"><span>효과음</span><button class="toggle ${s.settings.sound ? 'on' : ''}" data-act="tog" data-k="sound" aria-label="효과음"></button></div>
      <div class="setting"><span>진동</span><button class="toggle ${s.settings.vibe ? 'on' : ''}" data-act="tog" data-k="vibe" aria-label="진동"></button></div>
      <div class="setting"><span>피해 숫자 표시</span><button class="toggle ${s.settings.dmgText ? 'on' : ''}" data-act="tog" data-k="dmgText" aria-label="피해 숫자"></button></div>
      <div class="setting"><span>조작</span><span class="muted">화면을 누르고 끌어서 이동 · 자동 공격<br>PC: WASD/방향키, Space 대시, Q·E 스킬, R 물약, Esc 일시정지</span></div>
      <div class="setting"><span>기록</span><span class="muted">탑 ${s.stats.runs}회 · 처치 ${U.fmt(s.stats.kills)} · 보스 ${s.stats.bosses}</span></div>
      <div class="btnrow"><button class="btn white small" data-act="reset">${confirmReset ? '정말로 모든 기록을 지울까요? 한 번 더 누르세요' : '🗑️ 처음부터 다시 하기'}</button></div>
      <div class="btnrow"><button class="btn mint" data-act="close">닫기</button></div>`;
    G.UI.openModal(html(), {
      tog(el) {
        const k = el.dataset.k;
        s.settings[k] = !s.settings[k];
        G.Save.persist();
        G.UI.updateModal(html());
      },
      reset() {
        if (!confirmReset) { confirmReset = true; G.UI.updateModal(html()); return; }
        G.Save.reset();
        G.Main.newGame();
        G.UI.closeModal();
        location.reload();
      },
      close() { G.UI.closeModal(); },
    }, { dismiss: true });
  }

  // ── 액션 ───────────────────────────────────────────────
  Object.assign(G.Actions, {
    tab(el) { ui.tab = el.dataset.tab; $('panelBody').scrollTop = 0; render(); },
    sub(el) { ui[el.dataset.k] = el.dataset.v; render(); },
    startFloor(el) { ui.start = +el.dataset.f; render(); },
    climb() { G.Main.startRun(ui.start); },
    filter(el) { ui.filter = el.dataset.f; render(); },
    itemView(el) { itemView(el.dataset.id); },
    salvageAll,
    gift,
    shopBuy(el) { buy(el.dataset.id); },
    openStory, openDex, openSettings,
    pause() { G.UI.pause(); },
    runeSlot(el) {
      const s = S(), i = +el.dataset.i;
      if (s.runeSlots[i]) { s.runeSlots[i] = null; persist(); render(); }
      else G.UI.toast('아래 룬 가방에서 룬을 눌러 끼워요');
    },
    runeUnlock(el) {
      const s = S(), i = +el.dataset.i;
      if (i !== s.runeSlotsOpen) { G.UI.toast('앞 슬롯부터 열어야 해요'); return; }
      const cost = G.RUNE_SLOT_COST[i];
      if (s.gems < cost) { deny('보석이 부족해요'); return; }
      s.gems -= cost;
      s.runeSlotsOpen++;
      G.Sfx.play('upgrade');
      persist(); render();
    },
    runeEquip(el) {
      const s = S();
      const slotted = new Set(s.runeSlots.filter(Boolean));
      const r = s.runes.find((x) => !slotted.has(x.id) && x.type === el.dataset.type && x.grade === +el.dataset.grade);
      if (!r) return;
      let i = -1;
      for (let k = 0; k < s.runeSlotsOpen; k++) if (!s.runeSlots[k]) { i = k; break; }
      if (i < 0) { deny('빈 슬롯이 없어요. 위의 룬을 눌러 빼세요'); return; }
      s.runeSlots[i] = r.id;
      G.Sfx.play('upgrade');
      persist(); render();
    },
    runeMerge() {
      const s = S();
      const slotted = new Set(s.runeSlots.filter(Boolean));
      let merged = 0, again = true;
      while (again) {
        again = false;
        const groups = {};
        for (const r of s.runes) {
          if (slotted.has(r.id) || r.grade >= 5) continue;
          const k = r.type + ':' + r.grade;
          (groups[k] = groups[k] || []).push(r);
        }
        for (const k in groups) {
          const g = groups[k];
          while (g.length >= 3) {
            const three = g.splice(0, 3);
            const ids = new Set(three.map((x) => x.id));
            s.runes = s.runes.filter((x) => !ids.has(x.id));
            s.runes.push(G.Loot.makeRune(three[0].type, three[0].grade + 1));
            merged++;
            again = true;
          }
        }
      }
      if (!merged) { G.UI.toast('합성할 룬이 없어요 (같은 룬 3개 필요)'); return; }
      G.Sfx.play('legend');
      G.UI.toast(`✨ 룬 ${merged}번 합성 성공!`, 'big');
      persist(); render();
    },
    trait(el) {
      const s = S();
      for (const tree of G.TRAIT_TREES) {
        const idx = tree.nodes.findIndex((n) => n.id === el.dataset.id);
        if (idx < 0) continue;
        const n = tree.nodes[idx];
        const lv = s.traits[n.id] || 0;
        if (lv >= n.max) return;
        if (treePoints(tree) < n.req) { deny(`${tree.name} 특성에 ${n.req}포인트가 필요해요`); return; }
        const cost = G.traitCost(n, lv, idx);
        if (s.shards < cost) { deny('별조각이 부족해요'); return; }
        s.shards -= cost;
        s.traits[n.id] = lv + 1;
        G.Sfx.play('upgrade');
        persist(); render();
      }
    },
    skillLearn(el) {
      const s = S(), k = el.dataset.k, d = G.ACTIVE_SKILLS[k];
      if (s.shards < d.cost) { deny('별조각이 부족해요'); return; }
      s.shards -= d.cost;
      s.skills.owned.push(k);
      G.Sfx.play('legend');
      G.UI.toast(`새 스킬 「${d.name}」!`, 'big');
      persist(); render();
    },
    skillUp(el) {
      const s = S(), k = el.dataset.k;
      const lv = s.skills.lv[k] || 1;
      const c = G.skillUpCost(lv);
      if (lv >= G.SKILL_MAX_LV) return;
      if (s.shards < c) { deny('별조각이 부족해요'); return; }
      s.shards -= c;
      s.skills.lv[k] = lv + 1;
      G.Sfx.play('upgrade');
      persist(); render();
    },
    skillEquip(el) {
      const s = S(), k = el.dataset.k, i = +el.dataset.i;
      const other = s.skills.eq.indexOf(k);
      if (other === i) return;
      if (other >= 0) s.skills.eq[other] = s.skills.eq[i];
      s.skills.eq[i] = k;
      persist(); render();
    },
    petActive(el) { S().pets.active = el.dataset.k; G.Sfx.play('pop'); persist(); render(); },
    petUp(el) {
      const s = S(), k = el.dataset.k, lv = s.pets.owned[k];
      const c = G.petUpCost(lv);
      if (lv >= G.PET_MAX_LV) return;
      if (s.gold < c) { deny('골드가 부족해요'); return; }
      s.gold -= c;
      s.pets.owned[k] = lv + 1;
      G.Sfx.play('upgrade');
      persist(); render();
    },
    compActive(el) { S().comps.active = el.dataset.k || null; G.Sfx.play('pop'); persist(); render(); },
    compUp(el) {
      const s = S(), k = el.dataset.k, lv = s.comps.owned[k];
      const c = G.compUpCost(lv);
      if (lv >= G.COMP_MAX_LV) return;
      if (s.gold < c) { deny('골드가 부족해요'); return; }
      s.gold -= c;
      s.comps.owned[k] = lv + 1;
      G.Sfx.play('upgrade');
      persist(); render();
    },
  });

  return { render, equip, ui, refreshRes };
})();
