/* AI 연결 (선택 — 쓰고 싶은 사람만).
   사용자가 넣은 자기 Claude(Anthropic) API 키로 평면도 그림을 읽혀 벽·문·창문·방을 만든다 (파일 → AI로 평면도 읽기).
   · 키는 이 기기에만(localStorage) 저장하고 도면·백업 파일에는 넣지 않는다.
   · 연결하지 않으면 앱은 인터넷을 쓰지 않는다. 읽기를 누를 때 그 그림만 Anthropic으로 보낸다. 요금은 사용자의 AI 계정에 청구된다.
   · 부르는 길: 공식 SDK(@anthropic-ai/sdk — lib/anthropic, 쓸 때만 불러옴)의 스트리밍 + 구조화 출력(JSON 스키마). 다듬기는 ai-plan.js */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KEY = 'hjdm.ai';
  const KEYS_URL = 'https://platform.claude.com/settings/keys';
  // 고를 수 있는 모델 (기본은 Claude Opus 5.5)
  const MODELS = [
    ['claude-opus-5-5', 'Claude Opus 5.5 (기본)'],
    ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (빠르고 저렴)'],
    ['claude-haiku-5-5', 'Claude Haiku 5.5 (가장 저렴)'],
    ['claude-fable-5-2', 'Claude Fable 5.2 (가장 정밀)'],
  ];
  const DEFAULT_MODEL = 'claude-opus-5-5';

  const load = () => { try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } };
  const store = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); return true; } catch (_) { return false; } };
  const cfg = () => { const o = load(); return { key: typeof o.key === 'string' ? o.key : '', model: MODELS.some(([id]) => id === o.model) ? o.model : DEFAULT_MODEL }; };
  const connected = () => !!cfg().key;
  const modelName = (id) => ((MODELS.find(([m]) => m === id) || [])[1] || id).replace(/\s*\(.*$/, '');
  const mask = (k) => (k.length > 12 ? `${k.slice(0, 7)}…${k.slice(-4)}` : '••••');

  /* ── SDK (쓸 때만 불러옴) ── */
  let sdkPromise = null;
  function sdk() {
    if (window.AnthropicSDK) return Promise.resolve(window.AnthropicSDK);
    if (!sdkPromise) {
      sdkPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'lib/anthropic/anthropic-sdk.min.js';
        s.onload = () => (window.AnthropicSDK ? resolve(window.AnthropicSDK) : reject(new Error('sdk')));
        s.onerror = () => { sdkPromise = null; s.remove(); reject(new Error('sdk')); };
        document.head.appendChild(s);
      });
    }
    return sdkPromise;
  }
  const clientOf = (A, key) => new A({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 10 * 60 * 1000 }); // 사용자의 자기 키를 자기 기기에서 직접 씀

  /** 오류를 사람이 읽을 글로 (SDK의 오류 종류로 가름) */
  function explain(e, A) {
    const short = (m) => String(m || '').replace(/\s+/g, ' ').slice(0, 160);
    if (!A || !(e instanceof A.APIError)) return 'AI를 부르지 못했습니다. 앱을 다시 열고 해 보세요.';
    if (e instanceof A.APIUserAbortError) return '';
    if (e instanceof A.AuthenticationError) return 'AI 키가 맞지 않습니다. 설정 → AI 연결에서 키를 다시 넣으세요.';
    if (e instanceof A.PermissionDeniedError) return '이 키로는 이 모델을 쓸 수 없습니다. 설정 → AI 연결에서 다른 모델을 고르거나 키의 권한을 확인하세요.';
    if (e instanceof A.NotFoundError) return '고른 AI 모델을 찾을 수 없습니다. 설정 → AI 연결에서 다른 모델을 고르세요.';
    if (e instanceof A.RateLimitError) return 'AI 사용 한도에 걸렸습니다. 잠시 뒤 다시 해 보세요.';
    if (e instanceof A.APIConnectionError) return '인터넷에 연결되지 않아 AI를 부르지 못했습니다. 연결을 확인하고 다시 해 보세요.';
    if (e instanceof A.BadRequestError) return `AI가 요청을 받지 않았습니다. 계정의 잔액·사용 설정을 확인하세요. (${short(e.message)})`;
    return e.status >= 500 ? 'AI 서버가 잠시 응답하지 않습니다. 잠시 뒤 다시 해 보세요.' : `AI 오류 (${e.status}): ${short(e.message)}`;
  }

  /** 키와 모델이 되는지 확인 (모델 정보만 물어봄 — 요금이 들지 않음). 돌려주는 것: '' 이면 됨, 아니면 까닭 */
  async function check(key, model) {
    let S;
    try { S = await sdk(); } catch (_) { return 'AI 연결에 필요한 파일을 불러오지 못했습니다. 앱을 다시 열고 해 보세요.'; }
    try { await clientOf(S.Anthropic, key).models.retrieve(model); return ''; } catch (e) { return explain(e, S.Anthropic) || '취소했습니다.'; }
  }

  let current = null; // 지금 읽는 중인 스트림 (취소할 때 씀)
  /** 평면도 그림(img: aiPlan.prepareImage의 결과)을 읽힘. 돌려주는 것: { data, usage, model } 또는 { error } (취소면 error: '') */
  async function readPlan(img, hintMm, onProgress) {
    const { key, model } = cfg();
    let S;
    try { S = await sdk(); } catch (_) { return { error: 'AI 연결에 필요한 파일을 불러오지 못했습니다. 앱을 다시 열고 해 보세요.' }; }
    const { Anthropic, jsonSchemaOutputFormat, betaJSONSchemaOutputFormat } = S;
    const client = clientOf(Anthropic, key);
    const base = {
      model,
      max_tokens: 32000,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img.base64 } },
        { type: 'text', text: App.aiPlan.prompt(img, hintMm) },
      ] }],
    };
    // 생각은 모델이 알아서(적응형, 기본), 깊이는 effort로. 답은 JSON 스키마에 맞춰 받음. 길어질 수 있어 스트리밍으로 받고 끝난 메시지를 씀.
    // 답 글자는 여기서 직접 풂 (거절·중간에 끊긴 답은 JSON이 아닐 수 있어, 멈춘 까닭부터 보고 나서 풀어야 함) — 그래서 SDK가 만든 형식에서 parse만 떼고 보냄
    const wire = (f) => ({ type: f.type, schema: f.schema });
    const run = (withFallback) => {
      const stream = withFallback
        // 안전 분류기가 요청을 거절하면 서버가 대신할 모델로 다시 돌림 (베타) — 평면도에서는 드물지만 기본으로 켜 둠
        ? client.beta.messages.stream({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'high', format: wire(betaJSONSchemaOutputFormat(App.aiPlan.SCHEMA)) } })
        : client.messages.stream({ ...base, output_config: { effort: 'high', format: wire(jsonSchemaOutputFormat(App.aiPlan.SCHEMA)) } });
      current = stream;
      if (onProgress) stream.on('text', (_delta, snapshot) => onProgress(snapshot.length));
      return stream.finalMessage();
    };
    let message;
    try {
      try { message = await run(true); } catch (e) {
        if (!(e instanceof Anthropic.BadRequestError)) throw e;
        message = await run(false); // 그 베타를 받지 않는 계정·모델이면 그것 없이 한 번 더 (다른 까닭의 400이면 여기서도 같은 오류가 남)
      }
    } catch (e) {
      return { error: explain(e, Anthropic) };
    } finally { current = null; }
    if (message.stop_reason === 'refusal') return { error: 'AI가 이 그림 읽기를 거절했습니다. 다른 그림으로 해 보세요.' };
    if (message.stop_reason === 'max_tokens') return { error: '도면이 복잡해 답이 중간에 끊겼습니다. 한 층씩·한 구역씩 나눠 찍어 다시 해 보세요.' };
    let data = null;
    try { data = JSON.parse(message.content.filter((b) => b.type === 'text').map((b) => b.text).join('')); } catch (_) { /* 아래에서 알림 */ }
    if (!data || typeof data !== 'object') return { error: 'AI의 답을 읽지 못했습니다. 다시 해 보세요.' };
    return { data, usage: message.usage, model: message.model };
  }
  function cancel() { if (current) { try { current.abort(); } catch (_) { /* 이미 끝남 */ } } }

  /* ── 설정: AI 연결 ── */
  async function settingsDialog() {
    const c = cfg();
    const r = await App.ui.dialog({
      title: 'AI 연결 (선택)',
      html: `
        <p>평면도 <b>사진이나 그림을 AI가 읽어</b> 벽·문·창문·방을 만들어 줍니다 (파일 → AI로 평면도 읽기). 쓰고 싶은 분만 자기 <b>Claude API 키</b>를 넣으면 됩니다.</p>
        <div class="field"><label class="field-label" for="aiKey">Claude API 키 ${c.key ? `<small>지금: ${esc(mask(c.key))}</small>` : ''}</label>
          <div class="field-box"><input id="aiKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${c.key ? '바꾸려면 새 키를 넣으세요' : 'sk-ant-…'}"></div></div>
        <div class="field"><label class="field-label" for="aiModel">모델</label>
          <select id="aiModel" class="field-select">${MODELS.map(([id, name]) => `<option value="${id}" ${id === c.model ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></div>
        <ul class="ai-notes">
          <li>키는 <b>이 기기에만</b> 저장됩니다. 도면·백업 파일에는 들어가지 않습니다.</li>
          <li>읽기를 누를 때 <b>그 그림만</b> Anthropic(Claude)으로 보냅니다. 연결하지 않으면 앱은 인터넷을 쓰지 않습니다.</li>
          <li>요금은 <b>내 AI 계정</b>에 쓴 만큼 청구됩니다 (읽을 때마다 사용량을 알려 줍니다).</li>
          <li>키는 Anthropic 콘솔에서 만듭니다: <span class="ai-url">${esc(KEYS_URL.replace('https://', ''))}</span></li>
        </ul>
        <div class="field-error" id="aiErr" role="alert" hidden></div>`,
      actions: [...(c.key ? [{ id: 'clear', label: '키 지우기', danger: true }] : []), { id: 'cancel', label: '닫기' }, { id: 'save', label: '확인하고 저장', primary: true }],
    });
    if (r.id === 'clear') { store({ model: c.model }); App.ui.toast('AI 키를 이 기기에서 지웠습니다.'); App.ui.emit('ai'); return false; }
    if (r.id !== 'save') return connected();
    const key = (r.body.querySelector('#aiKey').value || '').trim() || c.key, model = r.body.querySelector('#aiModel').value;
    if (!key) { App.ui.toast('키를 넣으세요.'); return settingsDialog(); }
    App.ui.busy('AI 연결을 확인하는 중…');
    const why = await check(key, model);
    App.ui.busy(false);
    if (why) { await App.ui.dialog({ title: '연결하지 못했습니다', html: `<p>${esc(why)}</p>`, actions: [{ id: 'ok', label: '확인', primary: true }] }); return settingsDialog(); }
    if (!store({ key, model })) { App.ui.toast('이 기기에 저장할 수 없습니다 (저장 공간·브라우저 설정 확인).'); return false; }
    App.ui.toast(`AI를 연결했습니다 (${modelName(model)}). 파일 → AI로 평면도 읽기`);
    App.ui.emit('ai');
    return true;
  }

  /* ── 평면도 읽기 ── */
  const pickImage = () => new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
    document.body.appendChild(input);
    let done = false;
    const finish = (v) => { if (done) return; done = true; input.remove(); resolve(v); };
    input.addEventListener('cancel', () => finish(null));
    input.addEventListener('change', () => finish((input.files && input.files[0]) || null));
    input.click();
  });
  const loadImage = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    im.src = url;
  });
  const parseMm = (t) => { const v = App.units.parseLength(String(t || '').trim()); return v > 0 ? v : null; };

  /** 파일 → AI로 평면도 읽기. file을 주면 고르기를 건너뜀 (시험·공유 받기) */
  async function importPlan(file) {
    if (!connected()) {
      const r = await App.ui.dialog({
        title: 'AI로 평면도 읽기',
        html: '<p>평면도 사진이나 그림을 AI가 읽어 벽·문·창문·방을 만들어 줍니다. 쓰려면 먼저 <b>자기 Claude API 키</b>를 연결해야 합니다 (쓰는 만큼 내 AI 계정에 요금이 청구됩니다).</p><p class="props-meta">연결하지 않아도 ‘사진 밑그림’으로 사진을 깔고 그 위에 직접 그릴 수 있습니다.</p>',
        actions: [{ id: 'cancel', label: '닫기' }, { id: 'go', label: 'AI 연결하기', primary: true }],
      });
      if (r.id !== 'go' || !(await settingsDialog())) return null;
    }
    file = file || await pickImage();
    if (!file) return null;
    let source;
    try { source = await loadImage(file); } catch (_) { App.ui.toast('그림을 읽지 못했습니다. 사진(JPG·PNG)을 골라 주세요.'); return null; }
    const model = cfg().model, img = App.aiPlan.prepareImage(source, model === 'claude-haiku-5-5' ? 1568 : 2000, true);
    const ask = await App.ui.dialog({
      title: 'AI로 평면도 읽기',
      html: `
        <img class="ai-thumb" src="${img.dataUrl}" alt="보낼 그림 (눈금자를 붙였습니다)">
        <div class="field"><label class="field-label" for="aiW">전체 가로 길이 <small>알면 넣기 — 비우면 도면의 치수 글자로 크기를 맞춤</small></label>
          <div class="field-box"><input id="aiW" type="text" inputmode="decimal" autocomplete="off" placeholder="예: 9600"><span class="field-unit">${App.units.lengthLabel()}</span></div></div>
        <div class="field"><span class="field-label">읽은 벽은</span>
          <div class="seg seg-inline" role="radiogroup" id="aiPhase">
            <button type="button" class="seg-btn" role="radio" data-v="keep" aria-checked="true">기존 벽 (물량에서 뺌)</button>
            <button type="button" class="seg-btn" role="radio" data-v="new" aria-checked="false">새로 세울 벽</button>
          </div></div>
        <p class="props-meta">이 그림을 Anthropic(Claude · ${esc(modelName(model))})으로 보내 읽습니다. 30초~2분쯤 걸리고, 쓴 만큼 내 AI 계정에 요금이 청구됩니다. 반듯하게 찍은 선명한 평면도일수록 잘 읽습니다. 결과는 어림이므로 치수는 꼭 확인하세요.</p>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '읽기', primary: true }],
      onOpen(body) {
        body.querySelector('#aiPhase').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) body.querySelectorAll('#aiPhase [data-v]').forEach((x) => x.setAttribute('aria-checked', String(x === b))); });
      },
    });
    if (ask.id !== 'ok') return null;
    const hint = parseMm(ask.body.querySelector('#aiW').value);
    const phase = (ask.body.querySelector('#aiPhase [aria-checked="true"]') || {}).dataset.v === 'new' ? 'new' : 'keep';

    // 읽는 동안: 취소할 수 있는 창
    let finished = false;
    const started = Date.now();
    const waiting = App.ui.dialog({
      title: 'AI가 평면도를 읽는 중',
      html: '<div class="ai-wait"><span class="spinner" aria-hidden="true"></span><span id="aiWaitText">그림을 보내는 중…</span></div><p class="props-meta">도면이 복잡하면 1~2분 걸립니다. 화면을 켜 두세요.</p>',
      actions: [{ id: 'cancel', label: '취소' }],
    }).then((r) => { if (!finished && r.id === 'cancel') cancel(); });
    const tick = setInterval(() => { const t = $('#aiWaitText'); if (t) t.textContent = `읽는 중… ${Math.round((Date.now() - started) / 1000)}초`; }, 1000);
    const res = await readPlan(img, hint, null);
    finished = true;
    clearInterval(tick);
    const closeBtn = document.querySelector('#dialogFoot [data-id="cancel"]');
    if (closeBtn && !$('#dialog').hidden) closeBtn.click();
    await waiting;
    if (res.error != null) { if (res.error) await App.ui.dialog({ title: '읽지 못했습니다', html: `<p>${esc(res.error)}</p>`, actions: [{ id: 'ok', label: '확인', primary: true }] }); return null; }
    return finish(res, img, file, { hint, phase });
  }

  /** 읽은 결과를 보여 주고 도면으로 만듦 */
  async function finish(res, img, file, opt) {
    const P = App.aiPlan;
    let n = P.normalize(res.data, { width: img.width, height: img.height, knownWidthMm: opt.hint });
    const used = res.usage ? `사용량: 입력 ${Number(res.usage.input_tokens || 0).toLocaleString('ko-KR')} · 출력 ${Number(res.usage.output_tokens || 0).toLocaleString('ko-KR')} 토큰` : '';
    if (!n.ok || !n.isPlan) {
      await App.ui.dialog({ title: '평면도를 찾지 못했습니다', html: `<p>${n.isPlan ? '벽을 읽지 못했습니다.' : '평면도가 아닌 그림으로 보입니다.'} 벽이 잘 보이게 반듯하게 찍은 그림으로 다시 해 보세요.</p>${n.note ? `<p class="props-meta">AI: ${esc(n.note)}</p>` : ''}<p class="props-meta">${esc(used)}</p>`, actions: [{ id: 'ok', label: '확인', primary: true }] });
      return null;
    }
    // 크기를 알 길이 없으면(치수 글자도 문도 못 읽음) 전체 가로를 물어봄. 문 폭으로 어림한 것은 알려 주고 고칠 수 있게
    const spanPx = Math.max(1, n.box.maxX - n.box.minX + n.thickPx);
    while (!n.scale || n.scale.source === 'door') {
      const guess = n.scale ? Math.round((spanPx * n.scale.mmPerPx) / 100) * 100 : null;
      const r = await App.ui.dialog({
        title: '도면 크기',
        html: `<p>${n.scale ? '치수 글자를 읽지 못해 <b>문 폭(900)</b>으로 크기를 어림했습니다. 전체 가로 길이를 알면 넣어 주세요.' : '치수 글자를 읽지 못했습니다. <b>전체 가로 길이</b>(왼쪽 바깥벽에서 오른쪽 바깥벽까지)를 넣어 주세요.'}</p>
          <div class="field"><label class="field-label" for="aiW2">전체 가로 길이</label><div class="field-box"><input id="aiW2" type="text" inputmode="decimal" autocomplete="off" value="${guess ? App.units.inputLength(guess) : ''}"><span class="field-unit">${App.units.lengthLabel()}</span></div></div>`,
        actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '이 크기로', primary: true }],
      });
      if (r.id !== 'ok') return null;
      const mm = parseMm(r.body.querySelector('#aiW2').value);
      if (!mm) { App.ui.toast('길이를 숫자로 넣으세요.'); continue; }
      n = P.toMm(n, mm / spanPx);
      n.scale.source = 'user';
    }
    const c = n.counts, wMm = Math.round(spanPx * n.scale.mmPerPx / 10) * 10, hMm = Math.round((n.box.maxY - n.box.minY + n.thickPx) * n.scale.mmPerPx / 10) * 10;
    const how = n.scale.source === 'dimension' ? `도면의 치수 글자 ${n.scale.n}개로 크기를 맞췄습니다` : '넣어 주신 전체 가로 길이로 크기를 맞췄습니다';
    const r = await App.ui.dialog({
      title: '읽은 결과',
      html: `<p><b>벽 ${c.walls} · 문 ${c.doors} · 창문 ${c.windows} · 방 이름 ${c.rooms}</b>을 읽었습니다.</p>
        <p>크기 약 <b>${esc(App.units.formatLength(wMm))} × ${esc(App.units.formatLength(hMm))}</b> — ${how}.</p>
        ${n.note ? `<p class="props-meta">AI: ${esc(n.note)}</p>` : ''}
        <p class="props-meta">새 도면에 벽을 그리고 원래 그림을 밑그림으로 깔아 둡니다. 겹쳐 보며 어긋난 곳을 고치세요 — 치수는 그림에서 읽은 어림이라 몇 cm 다를 수 있습니다. ${esc(used)}</p>`,
      actions: [{ id: 'cancel', label: '버리기' }, { id: 'ok', label: '새 도면으로 만들기', primary: true }],
    });
    if (r.id !== 'ok') return null;
    return apply(n, img, file, opt);
  }

  /** 새 도면을 만들고 밑그림 + 벽·문·창문·방을 넣음 */
  async function apply(n, img, file, opt) {
    const name = `${String((file && file.name) || '평면도').replace(/\.[a-z0-9]+$/i, '').slice(0, 30)} (AI)`;
    if (!(await App.projects.create(name, 'blank'))) return null;
    const s = n.scale.mmPerPx;
    // 밑그림: 보낸 그림의 (band, band)가 원래 그림의 왼쪽 위 — 벽과 같은 자리·같은 크기로
    let underlayId = null;
    try { if (file && App.underlay.addPhoto) underlayId = await App.underlay.addPhoto(file, { width: (img.width - img.band) * s, x: (img.band - n.origin.x) * s, y: (img.band - n.origin.y) * s, opacity: 0.45 }); } catch (_) { /* 밑그림 없이도 벽은 만듦 */ }
    const made = App.aiPlan.build(n, { phase: opt.phase });
    App.selection.clear();
    App.plan.fitToContent();
    App.ui.toast(`벽 ${made.walls} · 문 ${made.doors} · 창문 ${made.windows} · 방 ${made.rooms}개를 만들었습니다. 밑그림과 겹쳐 보고 고치세요.`, 6000);
    return { ...made, underlayId };
  }

  function init() {
    const item = $('#menuAiPlan');
    if (item) item.addEventListener('click', () => {
      $('#fileMenu').hidden = true;
      $('#btnFile').setAttribute('aria-expanded', 'false');
      importPlan();
    });
  }

  App.ai = { init, MODELS, DEFAULT_MODEL, cfg: () => { const c = cfg(); return { connected: !!c.key, model: c.model, keyMask: c.key ? mask(c.key) : '' }; }, connected, settingsDialog, importPlan, readPlan, check, finish, cancel };
})();
