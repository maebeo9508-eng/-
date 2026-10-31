/* 프로젝트(도면) 저장: 고친 뒤 1초 지나면 이 기기에 자동 저장, 새로 열어도 그대로.
   여러 도면을 목록으로 관리하고, JSON 파일로 백업·불러오기, 새 도면은 템플릿에서 시작.
   저장 데이터에는 구조 버전(dataVersion)을 넣어 나중에 구조가 바뀌어도 읽을 수 있게 함 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const S = () => App.storage;
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const FILE_KIND = 'hyeonjang-domyeon'; // 백업 파일 표시
  const SAVE_DELAY = 1000;
  const KEY_INDEX = 'hjdm.projects';
  const KEY_CURRENT = 'hjdm.current';
  const keyOf = (id) => `hjdm.p.${id}`;
  const NAME_MAX = 40;

  let current = null;       // { id, name, createdAt }
  let timer = 0;
  let loading = false;      // 도면을 바꿔 끼우는 동안에는 저장하지 않음
  let stopped = false;      // 전체 초기화 중
  let warned = false;       // 저장 실패 경고는 한 번만 크게
  let quietVersion = -1;    // 연 직후의 도면 버전 (열기만 한 것은 고친 것으로 보지 않음)

  const newId = () => `prj-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const index = () => {
    const list = S().read(KEY_INDEX);
    return Array.isArray(list) ? list.filter((p) => p && p.id) : [];
  };
  const drawnCount = (elements) => elements.filter((e) => App.model.TYPES[e.type] && !App.model.TYPES[e.type].catalog).length;
  const timeText = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  /* ── 저장 상태 표시 (위쪽 막대) ── */
  function setState(state) {
    const el = $('#saveState');
    if (!el) return;
    el.dataset.state = state;
    el.textContent = state === 'saved' ? '저장됨' : state === 'pending' ? '저장 중…' : '저장 실패';
    $('#btnProject').title = state === 'failed'
      ? '이 기기에 저장하지 못했습니다. 백업 파일로 내려받으세요.'
      : `도면 목록 · ${state === 'saved' ? `마지막 저장 ${new Date().toLocaleTimeString('ko-KR')}` : '저장 중'}`;
  }
  function showName() {
    $('#projectName').textContent = current ? current.name : '';
    document.title = current ? `${current.name} · 현장도면` : '현장도면';
  }

  /* ── 도면 ↔ 저장 데이터 ── */
  function snapshot() {
    const v = App.plan.view;
    return {
      kind: FILE_KIND,
      dataVersion: App.model.DATA_VERSION,
      appVersion: App.settingsUI.APP_VERSION,
      id: current.id,
      name: current.name,
      createdAt: current.createdAt,
      savedAt: new Date().toISOString(),
      current: { ...App.current },
      // 화면 가운데의 도면 좌표와 배율: 화면 크기가 달라도(휴대폰 회전 등) 같은 곳이 가운데 오게
      view: { scale: v.scale, cx: (App.plan.width / 2 - v.ox) / v.scale, cy: (App.plan.height / 2 - v.oy) / v.scale },
      elements: [...App.doc.all()],
    };
  }

  /** 저장된 데이터를 지금 구조로 맞춤. 모르는 요소 종류는 빼고 개수를 알려 줌 */
  function migrate(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.elements)) throw new Error('도면 데이터가 아닙니다.');
    const version = Number(data.dataVersion) || 1;
    const TYPES = App.model.TYPES;
    const elements = data.elements.filter((e) => e && typeof e.id === 'string' && TYPES[e.type]);
    const dropped = data.elements.length - elements.length;
    // 벽 종류·프리셋 목록이 없으면 기본 목록을 넣음
    if (!elements.some((e) => e.type === 'wallType')) elements.push(...App.catalog.defaultElements());
    // 마감재(아트보드·데코타일 등)가 생기기 전에 만든 도면에는 기본 마감재를 넣음
    else if (!elements.some((e) => e.type === 'preset' && e.kind === 'finish')) elements.push(...App.catalog.defaultFinishes());
    // (dataVersion 1 이후 구조가 바뀌면 여기서 옛 데이터를 고침)
    return { ...data, elements, dropped, newer: version > App.model.DATA_VERSION };
  }

  /** 지금 도면을 바로 저장. 성공하면 true */
  function saveNow() {
    clearTimeout(timer);
    timer = 0;
    if (!current || loading || stopped) return true;
    const data = snapshot();
    const ok = S().write(keyOf(current.id), data);
    if (ok) {
      const list = index().filter((p) => p.id !== current.id);
      list.unshift({
        id: current.id, name: current.name, createdAt: current.createdAt, updatedAt: data.savedAt,
        count: drawnCount(data.elements),
        underlays: [...new Set(data.elements.filter((e) => e.type === 'underlay').map((e) => e.dataId))],
      });
      S().write(KEY_INDEX, list);
      S().write(KEY_CURRENT, current.id);
      warned = false;
    }
    setState(ok ? 'saved' : 'failed');
    if (!ok && !warned) {
      warned = true;
      App.ui.dialog({
        title: '이 기기에 저장하지 못했습니다',
        html: `<p>저장 공간이 부족하거나 브라우저가 저장을 막고 있습니다. 고친 내용은 앱을 닫으면 사라질 수 있습니다.</p>
          <p class="dialog-note is-warn">지금 <b>백업 파일</b>로 내려받아 두세요. 가져온 도면(밑그림)을 지우거나 오래된 도면을 정리하면 공간이 생깁니다.</p>`,
        actions: [{ id: 'later', label: '나중에' }, { id: 'backup', label: '백업 저장', primary: true }],
      }).then((r) => { if (r.id === 'backup') exportBackup(); });
    }
    return ok;
  }

  function schedule() {
    if (loading || stopped || !current || App.doc.version === quietVersion) return;
    setState('pending');
    clearTimeout(timer);
    timer = setTimeout(saveNow, SAVE_DELAY);
  }
  /** 앱이 가려지거나 닫힐 때: 기다리지 않고 바로 저장 */
  function flush() {
    if (timer) saveNow();
  }

  /** 저장 데이터를 화면에 띄움 */
  async function apply(data, meta) {
    const m = migrate(data);
    loading = true;
    try {
      if (App.tools.current && App.tools.current.cancel) App.tools.current.cancel();
      App.ui.setTool('select');
      App.selection.set([]);
      App.doc.reset(m.elements);
      quietVersion = App.doc.version;
      App.current = { ...(m.current || {}) };
      App.catalog.ensureCurrent();
      current = { id: meta.id, name: meta.name, createdAt: meta.createdAt };
      const v = m.view;
      if (v && Number.isFinite(v.scale) && v.scale > 0 && Number.isFinite(v.cx) && Number.isFinite(v.cy)) {
        App.plan.view.scale = v.scale;
        App.plan.view.ox = App.plan.width / 2 - v.cx * v.scale;
        App.plan.view.oy = App.plan.height / 2 - v.cy * v.scale;
        App.plan.requestRender();
      } else {
        App.plan.fitToContent();
      }
    } finally {
      loading = false;
    }
    showName();
    App.ui.updateHistory();
    App.ui.emit('project');
    setState('saved');
    const missing = await App.underlay.loadAll();
    if (missing) App.ui.toast(`가져온 도면 ${missing}개의 밑그림 데이터를 이 기기에서 찾지 못했습니다. 지우고 다시 불러오세요.`);
    if (m.dropped) App.ui.toast(`이 앱이 모르는 항목 ${m.dropped}개는 빼고 열었습니다.`);
    return m;
  }

  async function open(id) {
    if (current && id === current.id) return true;
    flush();
    const data = S().read(keyOf(id));
    if (!data) {
      App.ui.toast('그 도면을 찾지 못했습니다.');
      return false;
    }
    const meta = index().find((p) => p.id === id) || {};
    await apply(data, { id, name: meta.name || data.name || '이름 없는 도면', createdAt: meta.createdAt || data.createdAt });
    S().write(KEY_CURRENT, id);
    return true;
  }

  /* ── 템플릿 ── */
  const TEMPLATES = [
    { id: 'blank', name: '빈 도면', desc: '벽 종류·문·창문 목록만 들어 있습니다.' },
    { id: 'room', name: '방 1개', desc: '3 × 4 m 방 하나와 문이 그려져 있습니다.' },
    { id: 'studio', name: '원룸 예시', desc: '방·욕실, 문·창문, 콘센트·스위치·조명, 전선관까지 들어 있어 집계를 바로 볼 수 있습니다.' },
  ];

  /** 템플릿 요소 만들기: 빈 도면에서 시작해 도면 API로 그린 뒤 결과를 돌려줌 */
  function templateElements(id) {
    const doc = App.doc;
    doc.reset(App.catalog.defaultElements());
    App.current = {};
    App.catalog.ensureCurrent();
    if (id === 'blank') return [...doc.all()];
    const T = App.model.TYPES, C = App.catalog;
    const wall = (a, b) => {
      const w = T.wall.create({ x: a[0], y: a[1] }, { x: b[0], y: b[1] });
      doc.add(w);
      return w;
    };
    const ring = (pts) => pts.map((p, i) => wall(p, pts[(i + 1) % pts.length]));
    const addRooms = (names) => {
      App.rooms.faces().forEach((f) => {
        const name = names.find((n) => App.geom.pointInPolygon(n.at, f.points));
        doc.add(T.room.create(f.points, f.wallIds, name ? name.name : App.rooms.nextName()));
      });
    };
    const preset = (kind, name) => C.presets(kind).find((p) => p.name === name) || C.presets(kind)[0];
    // 벽에 붙는 기호: 시계 방향으로 그린 바깥 벽은 왼쪽(+1)이 방 안쪽
    const mounted = (w, t, kind, side = 1) => {
      const def = C.itemDef(kind);
      const m = App.model.mountPoint(w, t, side, def.size * def.aspect);
      const it = T.item.create(m, C.ITEM_KINDS.elec.includes(def) ? 'elec' : 'mech', def, m.rotation, { wallId: w.id, t, side });
      doc.add(it);
      return it;
    };
    const free = (x, y, kind) => {
      const def = C.itemDef(kind);
      const it = T.item.create({ x, y }, C.ITEM_KINDS.elec.includes(def) ? 'elec' : 'mech', def, 0, null);
      doc.add(it);
      return it;
    };

    if (id === 'room') {
      doc.transact('템플릿', () => {
        const [, , bottom] = ring([[0, 0], [3000, 0], [3000, 4000], [0, 4000]]);
        doc.add(T.door.create(bottom.id, 0.75, preset('door', '방문'), 1, 'start'));
      });
      doc.transact('방', () => addRooms([{ at: { x: 1500, y: 2000 }, name: '방 1' }]));
    } else if (id === 'studio') {
      let top, right, bottom, left, part;
      doc.transact('템플릿', () => {
        [top, right, bottom, left] = ring([[0, 0], [6600, 0], [6600, 5400], [0, 5400]]);
        wall([0, 3300], [1800, 3300]);
        part = wall([1800, 3300], [1800, 5400]);
        doc.add(T.window.create(top.id, 0.5, preset('window', '거실 창')));
        doc.add(T.window.create(right.id, 0.3, preset('window', '방 창')));
        doc.add(T.door.create(bottom.id, 0.45, preset('door', '현관 방화문'), 1, 'end'));
        doc.add(T.door.create(part.id, 0.5, preset('door', '욕실문'), -1, 'start'));
      });
      doc.transact('방', () => addRooms([{ at: { x: 4000, y: 2500 }, name: '거실·방' }, { at: { x: 900, y: 4350 }, name: '욕실' }]));
      doc.transact('기호', () => {
        mounted(top, 0.15, '콘센트');
        mounted(top, 0.85, '콘센트');
        mounted(right, 0.75, '콘센트');
        const sw = mounted(bottom, 0.25, '스위치');
        const light = free(4200, 2200, '조명');
        free(900, 3900, '조명');
        mounted(left, 0.85, '분전반');
        mounted(right, 0.3, '에어컨 실내기');
        free(900, 4950, '배수구');
        const conduit = C.presets('line').find((p) => p.category === '전선관');
        doc.add(T.line.create({ x: sw.x, y: sw.y }, { x: sw.x, y: light.y }, conduit));
        doc.add(T.line.create({ x: sw.x, y: light.y }, { x: light.x, y: light.y }, conduit));
      });
    }
    return [...doc.all()];
  }

  /** 새 도면 만들어 열기 */
  async function create(name, templateId = 'blank') {
    flush();
    loading = true;
    let elements;
    try {
      elements = templateElements(templateId);
    } finally {
      loading = false;
    }
    const meta = { id: newId(), name: name.slice(0, NAME_MAX), createdAt: new Date().toISOString() };
    await apply({ elements, current: { ...App.current } }, meta);
    App.plan.fitToContent();
    saveNow();
    return meta.id;
  }

  /* ── 백업 파일 ── */
  const safeFile = (s) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || '도면';

  async function exportBackup() {
    saveNow();
    const data = snapshot();
    const underlays = {};
    data.elements.filter((e) => e.type === 'underlay').forEach((e) => {
      const u = App.underlay.exportData(e.dataId);
      if (u) underlays[e.dataId] = u;
    });
    data.underlays = underlays;
    const name = `${safeFile(current.name)}_${App.exporter.stamp()}.json`;
    App.exporter.download(name, JSON.stringify(data), 'application/json');
    App.ui.toast(`‘${name}’을 저장했습니다. 다른 기기에서는 ‘파일 → 백업 불러오기’로 열 수 있습니다.`);
  }

  async function importBackup(file) {
    let data;
    try {
      data = JSON.parse(await file.text());
      if (data.kind !== FILE_KIND && !Array.isArray(data.elements)) throw new Error();
      migrate(data);
    } catch (_) {
      await App.ui.dialog({ title: '백업 파일을 읽지 못했습니다', html: '<p>이 앱에서 저장한 도면 백업(.json) 파일인지 확인하세요.</p>' });
      return false;
    }
    flush();
    App.ui.busy('백업을 여는 중…');
    let lost = 0;
    try {
      for (const u of Object.values(data.underlays || {})) if (!(await App.underlay.importData(u))) lost++;
    } finally {
      App.ui.busy(false);
    }
    const names = new Set(index().map((p) => p.name));
    let name = String(data.name || file.name.replace(/\.json$/i, '')).slice(0, NAME_MAX);
    if (names.has(name)) name = `${name} (불러옴)`.slice(0, NAME_MAX);
    const meta = { id: newId(), name, createdAt: data.createdAt || new Date().toISOString() };
    const m = await apply(data, meta);
    saveNow();
    App.ui.toast(`‘${name}’ 도면을 열었습니다.${lost ? ' 밑그림 일부는 이 기기에 저장하지 못했습니다.' : ''}`);
    if (m.newer) App.ui.toast('더 새 버전의 앱에서 만든 파일입니다. 일부 항목이 빠졌을 수 있습니다.');
    return meta.id;
  }

  /* ── 목록·이름·복제·삭제 ── */
  function rename(id, name) {
    const n = name.trim().slice(0, NAME_MAX);
    if (!n) return false;
    if (current && id === current.id) {
      current.name = n;
      showName();
      saveNow();
      return true;
    }
    const list = index();
    const p = list.find((x) => x.id === id);
    const data = S().read(keyOf(id));
    if (!p || !data) return false;
    p.name = n;
    data.name = n;
    return S().write(keyOf(id), data) && S().write(KEY_INDEX, list);
  }

  function duplicate(id) {
    if (current && id === current.id) saveNow();
    const data = S().read(keyOf(id));
    const p = index().find((x) => x.id === id);
    if (!data || !p) return null;
    const copy = { ...data, id: newId(), name: `${p.name} 사본`.slice(0, NAME_MAX), createdAt: new Date().toISOString() };
    if (!S().write(keyOf(copy.id), copy)) return null;
    const list = index();
    list.splice(list.findIndex((x) => x.id === id) + 1, 0, { ...p, id: copy.id, name: copy.name, createdAt: copy.createdAt, updatedAt: copy.createdAt });
    S().write(KEY_INDEX, list);
    return copy.id;
  }

  async function remove(id) {
    S().remove(keyOf(id));
    const list = index().filter((p) => p.id !== id);
    S().write(KEY_INDEX, list);
    if (current && id === current.id) {
      current = null;
      if (list.length) await open(list[0].id);
      else await create('새 도면', 'blank');
    }
    App.underlay.cleanup(usedUnderlays());
  }

  const usedUnderlays = () => {
    const used = new Set();
    index().forEach((p) => (p.underlays || []).forEach((id) => used.add(id)));
    if (current) App.underlay.list().forEach((u) => used.add(u.dataId));
    return used;
  };

  /* ── 화면: 새 도면, 도면 목록 ── */
  function defaultName() {
    const names = new Set(index().map((p) => p.name));
    for (let i = 1; ; i++) if (!names.has(`현장 ${i}`)) return `현장 ${i}`;
  }

  async function newDialog() {
    let pick = 'blank';
    const r = await App.ui.dialog({
      title: '새 도면',
      html: `
        <div class="field">
          <label class="field-label" for="d-pname">이름</label>
          <div class="field-box"><input id="d-pname" type="text" maxlength="${NAME_MAX}" autocomplete="off" value="${esc(defaultName())}"></div>
        </div>
        <div class="tpl-list" role="radiogroup" aria-label="시작 모양">
          ${TEMPLATES.map((t) => `<button type="button" class="tpl" role="radio" data-tpl="${t.id}" aria-checked="${t.id === pick}">
            <b>${t.name}</b><small>${t.desc}</small></button>`).join('')}
        </div>
        <p class="props-meta">지금 도면은 자동 저장되어 ‘도면 목록’에 남습니다.</p>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '만들기', primary: true }],
      onOpen(body) {
        body.querySelector('.tpl-list').addEventListener('click', (e) => {
          const b = e.target.closest('[data-tpl]');
          if (!b) return;
          pick = b.dataset.tpl;
          body.querySelectorAll('[data-tpl]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        });
      },
    });
    if (r.id !== 'ok') return;
    const name = r.body.querySelector('#d-pname').value.trim() || defaultName();
    await create(name, pick);
    App.ui.toast(`‘${name}’ 도면을 만들었습니다.`);
  }

  function listHtml() {
    if (current) saveNow();
    const list = index();
    return `
      <div class="prj-list">
        ${list.map((p) => `
          <div class="prj${current && p.id === current.id ? ' is-current' : ''}" data-id="${esc(p.id)}">
            <button type="button" class="prj-open" data-act="open">
              <b>${esc(p.name)}</b>
              <small>${current && p.id === current.id ? '지금 연 도면 · ' : ''}그린 것 ${p.count || 0}개 · ${esc(timeText(p.updatedAt))}</small>
            </button>
            <div class="prj-acts">
              <button type="button" class="btn" data-act="rename">이름</button>
              <button type="button" class="btn" data-act="dup">복제</button>
              <button type="button" class="btn btn-danger" data-act="del">삭제</button>
            </div>
          </div>`).join('') || '<p class="props-meta">저장된 도면이 없습니다.</p>'}
      </div>`;
  }

  async function listDialog() {
    const r = await App.ui.dialog({
      title: '도면 목록',
      html: listHtml(),
      actions: [{ id: 'new', label: '새 도면' }, { id: 'close', label: '닫기', primary: true }],
      onOpen(body) {
        body.addEventListener('click', async (e) => {
          const act = e.target.closest('[data-act]');
          const row = act && act.closest('[data-id]');
          if (!row) return;
          const id = row.dataset.id;
          const p = index().find((x) => x.id === id);
          if (act.dataset.act === 'open') {
            document.querySelector('#dialogFoot [data-id="close"]').click();
            if (await open(id)) App.ui.toast(`‘${p.name}’ 도면을 열었습니다.`);
          } else if (act.dataset.act === 'rename') {
            // 그 줄을 이름 칸으로 바꿈
            row.innerHTML = `
              <div class="field-box prj-name" data-keys="local"><input type="text" maxlength="${NAME_MAX}" autocomplete="off" value="${esc(p.name)}" aria-label="도면 이름"></div>
              <div class="prj-acts">
                <button type="button" class="btn btn-primary" data-act="rename-ok">저장</button>
                <button type="button" class="btn" data-act="cancel">취소</button>
              </div>`;
            const input = row.querySelector('input');
            input.select();
            input.addEventListener('keydown', (k) => {
              if (k.key === 'Enter') { k.preventDefault(); k.stopPropagation(); row.querySelector('[data-act="rename-ok"]').click(); }
              if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); body.innerHTML = listHtml(); }
            });
          } else if (act.dataset.act === 'rename-ok') {
            if (!rename(id, row.querySelector('input').value)) {
              App.ui.toast('이름을 비워 둘 수 없습니다.');
              return;
            }
            body.innerHTML = listHtml();
          } else if (act.dataset.act === 'cancel') {
            body.innerHTML = listHtml();
          } else if (act.dataset.act === 'dup') {
            if (duplicate(id)) body.innerHTML = listHtml();
            else App.ui.toast('복제하지 못했습니다. 저장 공간이 부족할 수 있습니다.');
          } else if (act.dataset.act === 'del') {
            // 실수로 지우지 않게 한 번 더 누르게 함
            act.dataset.act = 'del-ok';
            act.textContent = '정말 삭제';
            act.classList.add('is-armed');
            setTimeout(() => {
              if (act.isConnected && act.dataset.act === 'del-ok') {
                act.dataset.act = 'del';
                act.textContent = '삭제';
                act.classList.remove('is-armed');
              }
            }, 3000);
          } else if (act.dataset.act === 'del-ok') {
            await remove(id);
            body.innerHTML = listHtml();
            App.ui.toast(`‘${p.name}’ 도면을 지웠습니다.`);
          }
        });
      },
    });
    if (r.id === 'new') newDialog();
  }

  /* ── 시작 ── */
  async function init() {
    App.doc.onChange(schedule);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    window.addEventListener('beforeunload', flush);
    // 안드로이드 앱이 뒤로 숨을 때도 바로 저장
    const C = window.Capacitor;
    if (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.App) C.Plugins.App.addListener('pause', flush);
    App.ui.on('settings', schedule); // 기본 벽 종류 등 고른 값도 저장
    App.ui.on('current', schedule);

    const fileInput = $('#projectFile');
    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0];
      fileInput.value = '';
      if (f) importBackup(f);
    });
    const menu = (sel, fn) => $(sel).addEventListener('click', () => {
      $('#fileMenu').hidden = true;
      $('#btnFile').setAttribute('aria-expanded', 'false');
      fn();
    });
    menu('#menuNew', newDialog);
    menu('#menuProjects', listDialog);
    menu('#menuBackup', exportBackup);
    menu('#menuRestore', () => fileInput.click());
    $('#btnProject').addEventListener('click', listDialog);

    const list = index();
    const lastId = S().read(KEY_CURRENT);
    const target = list.find((p) => p.id === lastId) || list[0];
    let opened = false;
    if (target) {
      try {
        opened = await open(target.id);
      } catch (e) {
        App.ui.toast('마지막 도면을 열지 못해 새 도면으로 시작합니다.');
      }
    }
    if (!opened) await create('새 도면', 'blank');
    App.underlay.cleanup(usedUnderlays());
  }

  App.projects = {
    init, saveNow, flush, open, create, exportBackup, importBackup, rename, duplicate, remove, newDialog, listDialog, TEMPLATES,
    stopSaving() {
      stopped = true;
      clearTimeout(timer);
    },
    get current() { return current; },
    list: index,
  };
})();
