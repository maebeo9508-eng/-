/* 편집 편의 기능: 레이어 보이기, 복사·붙여넣기·복제, 90° 돌리기, 정렬, 잠금, 검색, 단축키 안내 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const doc = () => App.doc;
  const render = () => App.plan.requestRender();

  /* ── 레이어 보이기·숨기기 (도면마다 저장: App.current.hiddenLayers) ── */
  const layers = {
    list: () => [...App.model.LAYERS, { id: 'ref', label: '가져온 도면' }],
    hidden: () => App.current.hiddenLayers || [],
    visible(el) {
      const h = App.current.hiddenLayers;
      return !h || !h.length || !h.includes(el.layer);
    },
    /** 숨긴 레이어를 집계에서도 뺄지 */
    excludeHidden: () => !!App.current.excludeHiddenFromSummary && layers.hidden().length > 0,
    set(id, show) {
      const h = new Set(layers.hidden());
      if (show) h.delete(id);
      else h.add(id);
      App.current.hiddenLayers = [...h];
      // 숨긴 것은 선택에서 뺌
      const keep = App.selection.list().filter((sid) => { const el = doc().get(sid); return el && layers.visible(el); });
      if (keep.length !== App.selection.size) App.selection.set(keep);
      changedLayers();
    },
  };
  function changedLayers() {
    App.ui.emit('current'); // 도면과 함께 저장
    App.ui.emit('layers');
    render();
    updateLayerButton();
  }
  function updateLayerButton() {
    const n = layers.hidden().length;
    const b = $('#btnLayers');
    b.classList.toggle('is-warn', n > 0);
    $('#layerCount').textContent = n ? ` · ${n}개 숨김` : '';
  }
  function layerMenuHtml() {
    const counts = {};
    for (const el of doc().all()) counts[el.layer] = (counts[el.layer] || 0) + 1;
    const hidden = new Set(layers.hidden());
    return `
      <div class="menu-label">보이는 레이어</div>
      ${layers.list().map((l) => `
        <label class="menu-check">
          <input type="checkbox" data-layer="${l.id}" ${hidden.has(l.id) ? '' : 'checked'}>
          <span>${l.label}</span><small>${counts[l.id] || 0}</small>
        </label>`).join('')}
      <div class="menu-sep" role="separator"></div>
      <label class="menu-check">
        <input type="checkbox" data-exclude ${App.current.excludeHiddenFromSummary ? 'checked' : ''}>
        <span>숨긴 레이어는 집계에서도 빼기</span>
      </label>`;
  }

  /* ── 복사·붙여넣기·복제 ── */
  let clip = null;         // { els, box }
  let pasteCount = 0;

  /** 복사할 묶음: 방을 고르면 둘레 벽도, 벽을 고르면 그 벽의 문·창문도. 벽 없는 문·창문과 밑그림은 뺌 */
  function expand(ids) {
    const set = new Set(ids.filter((id) => doc().has(id)));
    [...set].forEach((id) => {
      const el = doc().get(id);
      if (el.type === 'room') el.wallIds.forEach((w) => doc().has(w) && set.add(w));
    });
    [...set].forEach((id) => {
      const el = doc().get(id);
      if (el.type === 'wall') App.measure.openingsOf(el.id).forEach((o) => set.add(o.id));
    });
    return [...set].map((id) => doc().get(id)).filter((el) => {
      if (el.type === 'underlay') return false;
      if (el.type === 'door' || el.type === 'window') return set.has(el.wallId);
      return true;
    });
  }

  /** 요소들을 새 id로 복제하고 (dx, dy)만큼 옮긴 사본 목록. 서로 가리키는 id(벽·방·묶음)는 사본끼리 다시 이음 */
  function clones(els, dx, dy) {
    const T = App.model.TYPES;
    const idMap = new Map(els.map((el) => [el.id, App.model.newId(el.type)]));
    const groupMap = new Map();
    const now = new Date().toISOString();
    const out = [];
    els.forEach((src) => {
      const c = App.model.clone(src);
      c.id = idMap.get(src.id);
      c.createdAt = now;
      c.locked = false;
      if (c.group) {
        if (!groupMap.has(c.group)) groupMap.set(c.group, `grp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
        c.group = groupMap.get(c.group);
      }
      if (T[c.type].movedBy) Object.assign(c, T[c.type].movedBy(c, dx, dy));
      if (c.type === 'door' || c.type === 'window') {
        c.wallId = idMap.get(c.wallId);
      } else if (c.type === 'item' && c.wallId) {
        if (idMap.has(c.wallId)) c.wallId = idMap.get(c.wallId);
        else Object.assign(c, { wallId: null, t: null, side: null });
      } else if (c.type === 'room') {
        const walls = c.wallIds.map((w) => idMap.get(w));
        if (walls.some((w) => !w)) return; // 둘레 벽이 다 없으면 방은 빼고 (벽만 있으면 ‘방’ 도구로 다시 등록)
        c.wallIds = walls;
        c.issue = null;
      }
      out.push(c);
    });
    // 벽 먼저 넣어야 문·창문·방이 제자리를 찾음
    const order = { wall: 0, room: 2, door: 1, window: 1 };
    return out.sort((a, b) => (order[a.type] ?? 3) - (order[b.type] ?? 3));
  }

  const snapStep = (v) => (App.settings.snapGrid ? Math.round(v / App.snap.step()) * App.snap.step() : v);

  function copy(cut = false) {
    const ids = App.selection.list();
    const els = expand(ids);
    if (!els.length) {
      App.ui.toast(ids.length ? '가져온 도면(밑그림)은 복사하지 않습니다.' : '복사할 것을 먼저 고르세요.');
      return false;
    }
    clip = { els: App.model.clone(els), box: doc().bounds(els.map((e) => e.id)) };
    pasteCount = 0;
    App.ui.toast(`${els.length}개를 복사했습니다. Ctrl+V: 마우스 자리에 붙여넣기, Ctrl+Shift+V: 제자리에`);
    return true;
  }

  /** 붙여넣기. inPlace면 같은 자리, 아니면 마우스가 있는 곳(없으면 조금씩 비켜서) */
  function paste(inPlace = false) {
    if (!clip) {
      App.ui.toast('먼저 복사(Ctrl+C)하세요.');
      return false;
    }
    let dx = 0, dy = 0;
    if (!inPlace) {
      const m = App.nav.lastMouse;
      const b = clip.box;
      if (m) {
        const w = App.plan.view.toWorld(m.p.x, m.p.y);
        dx = snapStep(w.x - (b.minX + b.maxX) / 2);
        dy = snapStep(w.y - (b.minY + b.maxY) / 2);
      } else {
        pasteCount++;
        dx = dy = snapStep(500 * pasteCount);
      }
    }
    const els = clones(clip.els, dx, dy);
    doc().transact('붙여넣기', () => els.forEach((el) => doc().add(el)));
    App.selection.set(els.map((e) => e.id).filter((id) => doc().has(id)));
    App.ui.toast(`${els.length}개를 붙여넣었습니다.`);
    return true;
  }

  /** 고른 것을 조금 옆에 복제 (휴대폰에서도 쓰기 쉽게 버튼으로) */
  function duplicate() {
    const els = expand(App.selection.list());
    if (!els.length) {
      App.ui.toast('복제할 것을 먼저 고르세요.');
      return false;
    }
    const b = doc().bounds(els.map((e) => e.id));
    const step = snapStep(Math.max(500, Math.min(2000, (b.maxX - b.minX) * 0.1)));
    const copies = clones(els, step, step);
    doc().transact('복제', () => copies.forEach((el) => doc().add(el)));
    App.selection.set(copies.map((e) => e.id).filter((id) => doc().has(id)));
    App.ui.toast(`${copies.length}개를 복제했습니다. 끌어서 자리를 잡으세요.`);
    return true;
  }

  /* ── 90° 돌리기 (시계 방향) ── */
  /** 점 f(p)로 옮긴 모양 + 회전 */
  function rotatedPatch(el, f) {
    switch (el.type) {
      case 'wall':
      case 'line':
      case 'dim':
        return { start: f(el.start), end: f(el.end) };
      case 'item': {
        const p = f(el);
        return { x: p.x, y: p.y, rotation: (el.rotation + 90) % 360 };
      }
      case 'column': {
        const p = f(el);
        return el.shape === 'circle' ? { x: p.x, y: p.y } : { x: p.x, y: p.y, width: el.depth, depth: el.width };
      }
      case 'text': {
        const p = f(el);
        return { x: p.x, y: p.y };
      }
      case 'zone':
        return { points: el.points.map(f) };
      case 'room':
        return { points: el.points.map(f), seed: f(el.seed) };
      case 'underlay': {
        const p = f(el);
        return { x: p.x, y: p.y, rotation: ((el.rotation || 0) + 90) % 360 };
      }
      default:
        return null; // 문·창문은 벽을 따라감
    }
  }

  /** 고른 것을 90° 돌림. 기호·기둥만 골랐으면 각자 제자리에서, 아니면 전체 가운데를 중심으로 */
  function rotate() {
    const all = App.selection.list().map((id) => doc().get(id)).filter(Boolean);
    const els = all.filter((e) => !(e.locked && e.type !== 'underlay') && !(e.type === 'item' && e.wallId));
    if (!els.length) {
      if (all.some((e) => e.type === 'item' && e.wallId)) App.ui.toast('벽에 붙은 기호는 벽 방향을 따릅니다. ‘벽에서 떼기’ 뒤에 돌릴 수 있습니다.');
      else if (all.length) App.ui.toast('잠긴 항목은 돌리지 않습니다.');
      return false;
    }
    const each = els.every((e) => e.type === 'item' || e.type === 'column');
    const b = doc().bounds(els.map((e) => e.id));
    const c = { x: snapStep((b.minX + b.maxX) / 2), y: snapStep((b.minY + b.maxY) / 2) };
    const turn = (o) => (p) => ({ x: o.x - (p.y - o.y), y: o.y + (p.x - o.x) });
    doc().transact('90도 돌리기', () => els.forEach((el) => {
      const patch = rotatedPatch(el, turn(each ? { x: el.x, y: el.y } : c));
      if (patch) doc().update(el.id, patch);
    }));
    return true;
  }

  /* ── 정렬 ── */
  /** 고른 것(묶음은 한 덩어리, 방은 둘레 벽과 함께)을 왼쪽·가운데·오른쪽·위·아래로 맞춤 */
  function align(side) {
    const T = App.model.TYPES;
    const ids = App.selection.list().filter((id) => { const el = doc().get(id); return el && !el.locked; });
    // 덩어리 만들기: 묶음 id 또는 요소 id
    const units = new Map();
    ids.forEach((id) => {
      const el = doc().get(id);
      if (el.type === 'door' || el.type === 'window' || (el.type === 'item' && el.wallId)) return; // 벽을 따라가는 것
      const key = el.group || el.id;
      if (!units.has(key)) units.set(key, new Set());
      units.get(key).add(id);
      if (el.type === 'room') el.wallIds.forEach((w) => doc().has(w) && units.get(key).add(w));
    });
    if (units.size < 2) {
      App.ui.toast('정렬하려면 두 개 이상(또는 묶음 두 개 이상)을 고르세요.');
      return false;
    }
    const boxes = [...units.values()].map((set) => ({ ids: [...set], b: doc().bounds([...set]) })).filter((u) => u.b);
    const all = {
      minX: Math.min(...boxes.map((u) => u.b.minX)), maxX: Math.max(...boxes.map((u) => u.b.maxX)),
      minY: Math.min(...boxes.map((u) => u.b.minY)), maxY: Math.max(...boxes.map((u) => u.b.maxY)),
    };
    const delta = (b) => {
      switch (side) {
        case 'left': return [all.minX - b.minX, 0];
        case 'right': return [all.maxX - b.maxX, 0];
        case 'hcenter': return [(all.minX + all.maxX) / 2 - (b.minX + b.maxX) / 2, 0];
        case 'top': return [0, all.minY - b.minY];
        case 'bottom': return [0, all.maxY - b.maxY];
        case 'vcenter': return [0, (all.minY + all.maxY) / 2 - (b.minY + b.maxY) / 2];
        default: return [0, 0];
      }
    };
    const LABEL = { left: '왼쪽', right: '오른쪽', hcenter: '가로 가운데', top: '위', bottom: '아래', vcenter: '세로 가운데' };
    doc().transact(`${LABEL[side]} 정렬`, () => boxes.forEach((u) => {
      const [dx, dy] = delta(u.b);
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
      u.ids.forEach((id) => {
        const el = doc().get(id);
        if (el && T[el.type].movedBy) doc().update(id, T[el.type].movedBy(el, dx, dy));
      });
    }));
    return true;
  }

  /** 화살표 키로 조금씩 옮기기 (격자 한 칸, Shift는 열 칸) */
  /** 고른 것을 (dx, dy)만큼 옮김. 벽에 붙은 기호는 벽 방향으로 누르면 벽을 따라 미끄러지고,
      벽에서 멀어지는 방향이면 벽에서 떼어 옮김 */
  function nudge(dx, dy) {
    const T = App.model.TYPES;
    const ids = App.selection.list().filter((id) => { const el = doc().get(id); return el && !el.locked && T[el.type].movedBy && el.type !== 'door' && el.type !== 'window'; });
    if (!ids.length) return false;
    doc().transact('이동', () => ids.forEach((id) => {
      const el = doc().get(id);
      const w = el.type === 'item' && el.wallId && !ids.includes(el.wallId) ? doc().get(el.wallId) : null;
      if (w) {
        const L = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
        const along = L > 0 ? (dx * (w.end.x - w.start.x) + dy * (w.end.y - w.start.y)) / L : 0;
        if (Math.abs(along) >= Math.hypot(dx, dy) * 0.5) {
          doc().update(id, { t: Math.min(1, Math.max(0, el.t + along / L)) }); // 자리는 기록 직전 훅이 벽에 맞춤
          return;
        }
        doc().update(id, { wallId: null, t: null, side: null });
      }
      doc().update(id, T[el.type].movedBy(doc().get(id), dx, dy));
    }));
    return true;
  }

  /* ── 잠금 ── */
  function setLocked(ids, locked) {
    const list = ids.filter((id) => doc().has(id));
    if (!list.length) return;
    doc().transact(locked ? '잠금' : '잠금 풀기', () => list.forEach((id) => doc().update(id, { locked })));
    App.ui.toast(locked ? `${list.length}개를 잠갔습니다. 고를 수는 있지만 움직이거나 지워지지 않습니다.` : '잠금을 풀었습니다.');
  }

  /* ── 검색: 방 이름, 메모, 글자, 영역 이름, 기호 종류 ── */
  function searchItems(q) {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const T = App.model.TYPES;
    const out = [];
    for (const el of doc().all()) {
      const t = T[el.type];
      if (!t || t.catalog) continue;
      const fields = [];
      if (el.type === 'room' || el.type === 'zone') fields.push(['이름', el.name]);
      if (el.type === 'text') fields.push(['글자', el.content]);
      if (el.type === 'item') fields.push(['종류', App.catalog.itemLabel(el)]);
      if (el.type === 'underlay') fields.push(['파일', el.name]);
      if (el.memo) fields.push(['메모', el.memo]);
      const hit = fields.find(([, v]) => v && String(v).toLowerCase().includes(s));
      if (hit) out.push({ el, field: hit[0], text: String(hit[1]) });
      if (out.length >= 100) break;
    }
    return out;
  }
  function resultHtml(list, q) {
    if (!q.trim()) return '<p class="props-meta">방 이름, 메모, 글자, 영역 이름, 기호 종류(예: 콘센트)로 찾습니다.</p>';
    if (!list.length) return `<p class="props-meta">‘${esc(q)}’와 맞는 항목이 없습니다.</p>`;
    return `<div class="search-list">${list.map((r) => `
      <button type="button" class="btn btn-list" data-id="${esc(r.el.id)}">
        <span>${esc(r.text.length > 40 ? `${r.text.slice(0, 40)}…` : r.text)}</span>
        <small>${App.model.TYPES[r.el.type].label} · ${r.field}${layers.visible(r.el) ? '' : ' · 숨긴 레이어'}</small>
      </button>`).join('')}</div>`;
  }
  /** 찾은 것을 고르고 화면에 보이게 */
  function reveal(id) {
    const el = doc().get(id);
    if (!el) return;
    if (!layers.visible(el)) layers.set(el.layer, true);
    App.ui.setTool('select');
    App.selection.set([id]);
    const b = doc().bounds([id]);
    if (b) {
      const pad = Math.max(1500, (b.maxX - b.minX) * 0.6, (b.maxY - b.minY) * 0.6);
      App.plan.fitToContent({ minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad });
    }
  }
  async function search() {
    let found = [];
    const r = await App.ui.dialog({
      title: '찾기',
      html: `
        <div class="field">
          <div class="field-box"><input id="d-search" type="search" autocomplete="off" enterkeyhint="search" placeholder="예: 거실, 콘센트, 메모 내용" aria-label="찾을 말"></div>
        </div>
        <div id="d-results">${resultHtml([], '')}</div>`,
      actions: [{ id: 'cancel', label: '닫기' }, { id: 'first', label: '첫 결과로', primary: true }],
      onOpen(body) {
        const input = body.querySelector('#d-search');
        const box = body.querySelector('#d-results');
        input.addEventListener('input', () => {
          found = searchItems(input.value);
          box.innerHTML = resultHtml(found, input.value);
        });
        box.addEventListener('click', (e) => {
          const b = e.target.closest('[data-id]');
          if (!b) return;
          found = [{ el: doc().get(b.dataset.id) }];
          $('#dialogFoot [data-id="first"]').click();
        });
      },
    });
    if (r.id === 'first' && found.length) reveal(found[0].el.id);
  }

  /* ── 단축키 안내 ── */
  const SHORTCUTS = [
    ['도구', [['V', '선택'], ['W', '벽'], ['R', '방'], ['D', '문'], ['N', '창문'], ['C', '기둥'], ['E', '전기'], ['F', '설비'], ['L', '선 (배관·전선관·덕트)'], ['A', '영역'], ['T', '텍스트'], ['M', '치수'], ['Del', '지우개 / 고른 것 지우기']]],
    ['편집', [['Ctrl+Z', '실행 취소'], ['Ctrl+Y · Ctrl+Shift+Z', '다시 실행'], ['Ctrl+C', '복사'], ['Ctrl+V', '마우스 자리에 붙여넣기'], ['Ctrl+Shift+V', '제자리에 붙여넣기'], ['Ctrl+D', '복제'], ['Alt + 끌기', '복제하면서 옮기기'], ['Q', '90° 돌리기'], ['화살표', '격자 한 칸씩 옮기기 (Shift: 열 칸)'], ['Ctrl+A', '보이는 것 모두 고르기'], ['Ctrl+G · Ctrl+Shift+G', '묶기 · 묶음 풀기'], ['Ctrl+F', '찾기']]],
    ['그리기', [['Shift', '직교를 잠깐 반대로'], ['Enter · Esc · 오른쪽 클릭', '이어 그리기 끝내기'], ['Esc', '선택 풀기 / 선택 도구로']]],
    ['화면', [['휠', '확대·축소'], ['Space + 끌기 · 가운데 버튼', '화면 이동'], ['두 손가락', '휴대폰에서 확대·이동'], ['?', '이 안내']]],
  ];
  function shortcuts() {
    App.ui.dialog({
      title: '단축키',
      html: SHORTCUTS.map(([title, rows]) => `
        <h3 class="set-title">${title}</h3>
        <table class="sum-table keys-table"><tbody>
          ${rows.map(([k, v]) => `<tr><th scope="row"><kbd>${esc(k)}</kbd></th><td>${esc(v)}</td></tr>`).join('')}
        </tbody></table>`).join(''),
      actions: [{ id: 'ok', label: '닫기', primary: true }],
    });
  }

  function init() {
    // 레이어 메뉴
    const btn = $('#btnLayers'), menu = $('#layerMenu');
    const close = () => {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    };
    btn.addEventListener('click', () => {
      if (!menu.hidden) return close();
      menu.innerHTML = layerMenuHtml();
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    });
    document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('.layer-wrap')) close(); });
    menu.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.layer) layers.set(t.dataset.layer, t.checked);
      else if ('exclude' in t.dataset) {
        App.current.excludeHiddenFromSummary = t.checked;
        changedLayers();
      }
    });
    App.ui.on('project', updateLayerButton);
    App.doc.onChange(updateLayerButton);
    updateLayerButton();
    $('#btnSearch').addEventListener('click', search);
    const menuItem = (sel, fn) => $(sel).addEventListener('click', () => {
      $('#fileMenu').hidden = true;
      $('#btnFile').setAttribute('aria-expanded', 'false');
      fn();
    });
    menuItem('#menuShortcuts', shortcuts);
  }

  App.layers = layers;
  App.edit = { init, copy, paste, duplicate, rotate, align, nudge, setLocked, search, reveal, shortcuts, clones, expand, rotatedPatch };
})();
