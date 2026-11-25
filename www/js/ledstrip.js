/* LED 라인(스트립·바) 계산 — 종류·길이로 전력, SMPS(전원 장치), 릴·바 수, 알루미늄 프로파일, 전원 넣는 곳(전압 강하), 부속을 어림.
   설계 모드(장식벽·주방·붙박이장·수납장의 LED)와 인테리어(간접조명 선)가 함께 씀.
   값은 흔히 쓰는 제품 기준의 어림이라 실제로는 고른 제품의 사양서(W/m·최대 길이·SMPS 효율)로 확인해야 함 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  /* 종류: v 전압, wpm 1m당 전력(W), reel 한 롤·한 바 길이(mm), run 한쪽에서만 전원을 넣어도 되는 길이(mm, 넘으면 반대쪽·중간에도) */
  const TYPES = [
    { id: 'cob24', name: 'COB 라인 24V · 10W/m', v: 24, wpm: 10, reel: 5000, run: 10000 },
    { id: 'smd24', name: 'SMD 2835 24V · 12W/m', v: 24, wpm: 12, reel: 5000, run: 10000 },
    { id: 'smd12', name: 'SMD 2835 12V · 9.6W/m', v: 12, wpm: 9.6, reel: 5000, run: 5000 },
    { id: 'neon24', name: '네온 플렉스 24V · 8W/m (휘는 실리콘)', v: 24, wpm: 8, reel: 5000, run: 10000 },
    { id: 'bar12', name: 'LED 바 12V · 15W/m (1m 알루미늄 일체)', v: 12, wpm: 15, reel: 1000, run: 5000, rigid: true },
  ];
  const TEMPS = [['2700', '2700K 전구색'], ['3000', '3000K 웜'], ['4000', '4000K 주백색'], ['5700', '5700K 주광색'], ['rgb', 'RGB (색 바뀜)']];
  const LIGHT = { 2700: '#ffb85c', 3000: '#ffcf7a', 4000: '#fff0cf', 5700: '#e6f0ff', rgb: '#c77dff' };
  const PROFILES = [['alu', '알루미늄 프로파일 + 확산 커버'], ['none', '없음 (바로 붙임)']];
  const SMPS = [36, 60, 100, 150, 200, 350];   // 흔한 SMPS 용량(W)
  const PROFILE_LEN = 2000;                     // 알루미늄 프로파일 한 본
  const LOAD = 0.8;                             // SMPS는 용량의 80%까지만 씀

  const type = (id) => TYPES.find((t) => t.id === id) || TYPES[0];
  const temp = (k) => (TEMPS.some((x) => x[0] === String(k)) ? String(k) : '3000');
  const light = (k) => LIGHT[temp(k)];
  const tempName = (k) => (TEMPS.find((x) => x[0] === temp(k)) || TEMPS[1])[1];
  /** 설계물·프리셋 값에서 LED 설정: { type, k, prof, color } */
  const spec = (p = {}) => ({ type: type(p.ledType).id, k: temp(p.ledK), prof: p.ledProf === 'none' ? 'none' : 'alu', color: light(p.ledK) });

  /** 전원 장치: 필요한 W(여유 포함) → [{ w, n }] (350W를 넘으면 같은 용량 여러 대) */
  function smpsFor(need) {
    if (!(need > 0)) return [];
    const one = SMPS.find((w) => w >= need);
    if (one) return [{ w: one, n: 1 }];
    const n = Math.ceil(need / SMPS[SMPS.length - 1]);
    return [{ w: SMPS.find((w) => w >= need / n) || SMPS[SMPS.length - 1], n }];
  }
  /** 끝이 맞닿은 선들을 이어진 구간으로: segs [{ a: [x, y(, z)], b, type, k, prof }] → runs [{ len, type, k, prof, n }] (같은 종류·색끼리, 5mm 안이면 이어짐) */
  function chains(segs, tol = 5) {
    const list = (segs || []).filter((s) => s && s.a && s.b);
    const parent = list.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], (p[2] || 0) - (q[2] || 0));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        if (A.type !== B.type || String(A.k) !== String(B.k)) continue;
        if (d(A.a, B.a) <= tol || d(A.a, B.b) <= tol || d(A.b, B.a) <= tol || d(A.b, B.b) <= tol) parent[find(i)] = find(j);
      }
    }
    const runs = new Map();
    list.forEach((s, i) => {
      const r = find(i), cur = runs.get(r) || { len: 0, type: s.type, k: s.k, prof: s.prof, n: 0 };
      cur.len += d(s.a, s.b); cur.n++;
      runs.set(r, cur);
    });
    return [...runs.values()];
  }
  /** 프로파일 본 수: 구간마다 2m를 이어 붙이고, 남는 토막은 다른 구간의 자투리로 (큰 것부터 넣기) */
  function profileBars(lens) {
    let full = 0;
    const rest = [];
    lens.forEach((l) => { const n = Math.floor(l / PROFILE_LEN); full += n; const r = l - n * PROFILE_LEN; if (r > 30) rest.push(r); });
    const bins = [];
    rest.sort((a, b) => b - a).forEach((r) => { const bin = bins.find((b) => b + r + 5 <= PROFILE_LEN); if (bin != null) bins[bins.indexOf(bin)] += r + 5; else bins.push(r + 5); });
    return full + bins.length;
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  /** 이어진 구간들 → 계획. 돌려주는 값: { strips, smps, watts, total(mm), m, feeds, profBars, lines: [{ key, name, qty, unit, note }], text } */
  function plan(runs) {
    runs = (runs || []).filter((r) => r && r.len > 1);
    const groups = new Map();
    runs.forEach((r) => {
      const T = type(r.type), k = temp(r.k), key = `${T.id}|${k}`;
      const g = groups.get(key) || { T, k, runs: [], len: 0 };
      g.runs.push(r); g.len += r.len;
      groups.set(key, g);
    });
    const strips = [], byV = new Map(), profLens = [];
    let watts = 0, feeds = 0, rgb = 0;
    groups.forEach((g) => {
      const W = (g.len / 1000) * g.T.wpm;
      watts += W;
      const f = g.runs.reduce((t, r) => t + Math.max(1, Math.ceil(r.len / g.T.run - 1e-9)), 0);
      feeds += f;
      // 롤은 구간마다 자를 때 5cm쯤 버림, 바는 구간마다 1m 단위로 올림
      const pieces = g.T.rigid ? g.runs.reduce((t, r) => t + Math.ceil(r.len / g.T.reel - 1e-9), 0) : Math.ceil((g.len + g.runs.length * 50) / g.T.reel);
      strips.push({ type: g.T.id, name: g.T.name, k: g.k, kName: tempName(g.k), v: g.T.v, len: g.len, m: Math.ceil(g.len / 100) / 10, watts: r1(W), pieces, rigid: !!g.T.rigid, runs: g.runs.length, feeds: f });
      byV.set(g.T.v, (byV.get(g.T.v) || 0) + W);
      if (g.k === 'rgb') rgb += g.runs.length;
      if (!g.T.rigid) g.runs.forEach((r) => { if (r.prof !== 'none') profLens.push(r.len); });
    });
    const smps = [];
    byV.forEach((W, v) => smpsFor(W / LOAD).forEach((s) => smps.push({ v, w: s.w, n: s.n, load: Math.round((W / (s.w * s.n)) * 100) })));
    const profBars = profLens.length ? profileBars(profLens) : 0;
    const total = runs.reduce((t, r) => t + r.len, 0), m = Math.ceil(total / 100) / 10;
    const lines = [];
    strips.forEach((s) => lines.push({ key: `strip:${s.type}`, name: `LED ${s.rigid ? '바' : '스트립'} ${s.name} · ${s.kName}`, qty: s.m, unit: 'm', note: `${s.rigid ? `1m 바 ${s.pieces}개` : `5m 릴 ${s.pieces}개`} · ${s.watts}W · 이어진 구간 ${s.runs}개` }));
    if (profBars) lines.push({ key: 'strip:profile', name: '알루미늄 프로파일 2m (확산 커버·마구리 포함)', qty: profBars, unit: '본', note: `프로파일 넣는 구간 ${r1(profLens.reduce((t, l) => t + l, 0) / 1000)}m` });
    smps.forEach((s) => lines.push({ key: `strip:smps${s.v}-${s.w}`, name: `SMPS ${s.v}V ${s.w}W`, qty: s.n, unit: '대', note: `부하 약 ${s.load}% (용량의 80% 이하로 씀)` }));
    if (runs.length) lines.push({ key: 'strip:wire', name: '전원선·커넥터 (구간마다, 전원 넣는 곳마다)', qty: feeds, unit: '조', note: '24V는 10m, 12V는 5m 넘으면 반대쪽에도 전원' });
    if (runs.length) lines.push({ key: 'strip:clip', name: '고정 클립·양면테이프', qty: Math.ceil(total / 500), unit: '개', note: '50cm마다 어림' });
    if (rgb) lines.push({ key: 'strip:ctrl', name: 'RGB 컨트롤러·리모컨', qty: Math.max(1, smps.reduce((t, s) => t + s.n, 0)), unit: '개', note: 'SMPS마다 하나' });
    const smpsText = smps.map((s) => `${s.v}V ${s.w}W ${s.n}대`).join(' · ');
    return {
      strips, smps, watts: r1(watts), total, m, feeds, profBars, runs: runs.length, lines,
      text: runs.length ? `총 ${m}m · ${r1(watts)}W · SMPS ${smpsText} · 전원 넣는 곳 ${feeds}곳` : '',
    };
  }

  App.ledstrip = { TYPES, TEMPS, PROFILES, SMPS, LIGHT, PROFILE_LEN, type, temp, light, tempName, spec, smpsFor, chains, plan, profileBars };
})();
