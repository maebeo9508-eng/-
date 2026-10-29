/* 설정 화면: 단위, 화면(테마·격자·치수 글자), 스냅, 새로 그릴 때 기본값, 데이터 초기화.
   고치면 바로 반영되고 기기에 저장된다 (저장 버튼 없음) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const APP_VERSION = '1.0.0'; // sw.js의 VERSION과 같이 올림
  const LENGTHS = {
    gridSize: { label: '격자 간격', min: 1, max: 10000 },
    dimTextSize: { label: '치수 글자 크기', min: 10, max: 5000 },
    wallHeight: { label: '벽 높이', min: 100, max: 20000 },
    ceilingHeight: { label: '천장 높이', min: 100, max: 20000 },
  };

  let modal, body;
  const dark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  /** 테마 적용: 'auto'면 기기 설정을 따름 */
  function applyTheme() {
    const t = App.settings.theme;
    const isDark = t === 'dark' || (t === 'auto' && !!dark && dark.matches);
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#15191d' : '#ffffff');
  }

  /* ── 칸 만들기 ── */
  function choice(key, label, options, note = '') {
    return `
      <div class="field">
        <span class="field-label" id="lbl-${key}">${label}</span>
        <div class="seg-inline" role="radiogroup" aria-labelledby="lbl-${key}">
          ${options.map(([v, text]) => `<button type="button" class="seg-btn" role="radio" data-set="${key}" data-value="${esc(v)}"
            aria-checked="${App.settings[key] === v}">${esc(text)}</button>`).join('')}
        </div>
        ${note ? `<p class="props-meta">${note}</p>` : ''}
      </div>`;
  }
  function toggle(key, label, note = '') {
    return `
      <label class="check-row" for="s-${key}">
        <input type="checkbox" id="s-${key}" data-toggle="${key}" ${App.settings[key] ? 'checked' : ''}>
        <span><b>${label}</b>${note ? `<small>${note}</small>` : ''}</span>
      </label>`;
  }
  function length(key) {
    const f = LENGTHS[key];
    return `
      <div class="field">
        <label class="field-label" for="s-${key}">${f.label}</label>
        <div class="field-box">
          <input id="s-${key}" data-len="${key}" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="${App.units.inputLength(App.settings[key])}">
          <span class="field-unit">${App.units.lengthLabel()}</span>
        </div>
        <div class="field-error" role="alert" hidden></div>
        ${f.note ? `<p class="props-meta">${f.note}</p>` : ''}
      </div>`;
  }
  function pick(id, label, items, current, editKind) {
    return `
      <div class="field">
        <label class="field-label" for="${id}">${label}</label>
        <div class="field-row">
          <select id="${id}" class="field-select">
            ${items.map(([v, text]) => `<option value="${esc(v)}" ${v === current ? 'selected' : ''}>${esc(text)}</option>`).join('')}
          </select>
          <button type="button" class="btn" data-edit="${editKind}">목록 편집</button>
        </div>
      </div>`;
  }

  function preview() {
    const U = App.units;
    return `예: 벽 ${U.formatLength(3450)} · 방 ${U.formatArea(12e6)} · 전선관 ${U.formatRun(12300)}`;
  }

  function render() {
    const C = App.catalog;
    const cur = App.current;
    body.innerHTML = `
      <section class="set-sec" id="set-units">
        <h3 class="set-title">단위</h3>
        ${choice('lengthUnit', '길이', [['mm', 'mm'], ['cm', 'cm'], ['m', 'm'], ['ft', 'ft']])}
        ${choice('areaUnit', '면적', [['㎡', '㎡'], ['평', '평'], ['ft²', 'ft²']], '1평 = 3.305785㎡. 면적은 항상 mm 값으로 계산한 뒤 바꿉니다.')}
        ${choice('decimals', '소수점 자리', [[0, '0'], [1, '1'], [2, '2'], [3, '3']])}
        ${choice('runUnit', '배관·전선관 길이', [['m', 'm로 보기'], ['unit', '길이 단위와 같이']], '전선관·배관은 보통 m로 셉니다. 다루끼·석고 같은 자재는 늘 m·본·장으로 셉니다.')}
        <p class="set-preview" id="setPreview">${esc(preview())}</p>
      </section>

      <section class="set-sec">
        <h3 class="set-title">화면</h3>
        ${choice('theme', '색', [['light', '밝게'], ['dark', '어둡게'], ['auto', '기기 설정 따라']], '현장에서 밝은 햇빛 아래는 ‘밝게’, 실내·밤에는 ‘어둡게’가 눈이 덜 부십니다.')}
        ${toggle('showGrid', '격자 보이기')}
        <div class="field-grid">${length('gridSize')}${length('dimTextSize')}</div>
        <p class="props-meta">치수 글자는 확대·축소해도 화면에서 11px보다 작아지지 않습니다.</p>
      </section>

      <section class="set-sec">
        <h3 class="set-title">스냅 (도면 위쪽 버튼과 같음)</h3>
        ${toggle('snapGrid', '격자에 붙기')}
        ${toggle('snapEnd', '끝점에 붙기', '벽·선 끝, 기호 가운데, 가져온 도면의 꼭짓점')}
        ${toggle('snapMid', '중간점에 붙기')}
        ${toggle('snapFace', '벽면·선 위에 붙기', '벽을 그릴 때는 벽 중심선, 치수·선은 벽의 면, 배관과 가져온 도면의 선 위')}
        ${toggle('ortho', '직교 (가로·세로로만)', 'Shift를 누르는 동안은 반대로')}
        ${toggle('stretchWalls', '벽을 옮길 때 이어진 벽도 늘리기')}
      </section>

      <section class="set-sec">
        <h3 class="set-title">새로 그릴 때 기본값</h3>
        <div class="field-grid">${length('wallHeight')}${length('ceilingHeight')}</div>
        ${pick('s-wallType', '벽 종류 (두께는 벽 종류에서 정해짐)', C.wallTypes().map((t) => [t.id, `${t.name} · ${App.units.formatLength(C.thickness(t))}`]), cur.wallTypeId, 'wallType')}
        ${pick('s-door', '문 프리셋', C.presets('door').map((p) => [p.id, `${p.name} · ${C.describePreset(p)}`]), cur.doorPresetId, 'door')}
        ${pick('s-window', '창문 프리셋', C.presets('window').map((p) => [p.id, `${p.name} · ${C.describePreset(p)}`]), cur.windowPresetId, 'window')}
        <p class="props-meta">벽 종류·프리셋 목록은 도면마다 저장됩니다.</p>
      </section>

      <section class="set-sec">
        <h3 class="set-title">데이터</h3>
        <p class="props-meta">이 기기에 저장된 도면과 설정을 모두 지우고 처음 상태로 돌립니다. 되돌릴 수 없으니 필요한 도면은 먼저 파일로 백업하세요.</p>
        <button type="button" class="btn btn-danger" data-act="reset">전체 데이터 초기화</button>
      </section>

      <section class="set-sec">
        <h3 class="set-title">정보</h3>
        <p class="props-meta">현장도면 ${APP_VERSION}. 인터넷 없이 이 기기 안에서만 동작합니다.<br>
        DWG 열기에 GNU LibreDWG(GPL v3)를 씁니다. 라이선스 전문: lib/libredwg/LICENSE</p>
      </section>`;
  }

  /** 바뀐 설정을 화면 전체에 반영하고 저장 */
  function changed() {
    App.saveSettings();
    applyTheme();
    App.plan.readTheme();
    $('#unitLabel').textContent = `${App.settings.lengthUnit} · ${App.settings.areaUnit}`;
    App.ui.emit('settings');
    App.props.refresh();
    App.plan.requestRender();
    // 이 창의 선택 표시와 예시만 고침 (입력 중인 칸은 그대로)
    body.querySelectorAll('[data-set]').forEach((b) => {
      b.setAttribute('aria-checked', String(String(App.settings[b.dataset.set]) === b.dataset.value));
    });
    const pv = $('#setPreview');
    if (pv) pv.textContent = preview();
    body.querySelectorAll('[data-len]').forEach((input) => {
      if (document.activeElement !== input) input.value = App.units.inputLength(App.settings[input.dataset.len]);
      input.parentElement.querySelector('.field-unit').textContent = App.units.lengthLabel();
    });
  }

  function validateLength(key, text) {
    const f = LENGTHS[key];
    const mm = App.units.parseLength(text);
    if (Number.isNaN(mm)) return { error: '숫자를 입력하세요.' };
    if (mm <= 0) return { error: '0보다 큰 값을 입력하세요.' };
    if (mm < f.min) return { error: `${App.units.formatLength(f.min)} 이상으로 입력하세요.` };
    if (mm > f.max) return { error: `${App.units.formatLength(f.max)} 이하로 입력하세요.` };
    return { value: mm };
  }

  async function resetAll() {
    const r = await App.ui.dialog({
      title: '전체 데이터 초기화',
      html: `<p>이 기기에 저장된 <b>모든 도면과 설정</b>을 지웁니다. 되돌릴 수 없습니다.</p>
        <p class="dialog-note is-warn">필요한 도면이 있으면 먼저 ‘파일 → 백업 저장’으로 파일을 받아 두세요.</p>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'reset', label: '모두 지우기', danger: true }],
    });
    if (r.id !== 'reset') return;
    if (App.projects) App.projects.stopSaving(); // 지우는 사이에 자동 저장이 다시 쓰지 않게
    await App.storage.clearAll();
    location.reload();
  }

  function open(section) {
    render();
    modal.hidden = false;
    const target = section && document.getElementById(`set-${section}`);
    if (target) target.scrollIntoView({ block: 'start' });
    else body.scrollTop = 0;
    $('#settingsClose').focus();
  }
  function close() {
    if (document.activeElement && body.contains(document.activeElement)) document.activeElement.blur(); // 치던 값 확정
    modal.hidden = true;
  }

  function init() {
    modal = $('#settingsModal');
    body = $('#settingsBody');
    $('#unitLabel').textContent = `${App.settings.lengthUnit} · ${App.settings.areaUnit}`;
    $('#settingsClose').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden && $('#dialog').hidden) {
        e.stopPropagation();
        close();
      }
    }, true);
    if (dark && dark.addEventListener) {
      dark.addEventListener('change', () => {
        if (App.settings.theme !== 'auto') return;
        applyTheme();
        App.plan.readTheme();
      });
    }

    body.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-set]');
      if (opt) {
        const key = opt.dataset.set;
        App.settings[key] = typeof App.DEFAULT_SETTINGS[key] === 'number' ? Number(opt.dataset.value) : opt.dataset.value;
        changed();
        return;
      }
      const edit = e.target.closest('[data-edit]');
      if (edit) {
        close();
        App.catalogUI.open(edit.dataset.edit);
        return;
      }
      if (e.target.closest('[data-act="reset"]')) resetAll();
    });
    body.addEventListener('input', (e) => {
      const key = e.target.dataset.len;
      if (!key) return;
      const err = e.target.closest('.field').querySelector('.field-error');
      const r = validateLength(key, e.target.value);
      err.textContent = r.error || '';
      err.hidden = !r.error;
    });
    body.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.toggle) {
        App.settings[t.dataset.toggle] = t.checked;
        changed();
      } else if (t.dataset.len) {
        const r = validateLength(t.dataset.len, t.value);
        const err = t.closest('.field').querySelector('.field-error');
        if (r.error) {
          err.textContent = `${r.error} 값은 바뀌지 않았습니다.`;
          err.hidden = false;
          t.value = App.units.inputLength(App.settings[t.dataset.len]);
          return;
        }
        err.hidden = true;
        App.settings[t.dataset.len] = r.value;
        changed();
      } else if (t.id === 's-wallType' || t.id === 's-door' || t.id === 's-window') {
        const key = { 's-wallType': 'wallTypeId', 's-door': 'doorPresetId', 's-window': 'windowPresetId' }[t.id];
        App.current[key] = t.value;
        App.ui.emit('settings');
        App.ui.toast('다음에 그릴 때부터 이 종류로 그립니다. 이미 그린 것은 그대로입니다.');
      }
    });
    body.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur();
    });
  }

  App.settingsUI = { init, open, close, applyTheme, APP_VERSION };
})();
