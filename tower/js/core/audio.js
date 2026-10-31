'use strict';
// WebAudio로 즉석에서 합성하는 효과음. 외부 파일이 필요 없습니다.
G.Sfx = (function () {
  let ac = null, master = null, noiseBuf = null;
  const last = {};

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 0.32;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }

  function tone(freq, dur, type, vol, slide, delay) {
    const t0 = ac.currentTime + (delay || 0);
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, freq, delay) {
    const t0 = ac.currentTime + (delay || 0);
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq || 1200;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0); s.stop(t0 + dur + 0.02);
  }

  const lib = {
    hit: () => tone(300, 0.05, 'square', 0.07, -120),
    crit: () => { tone(520, 0.06, 'square', 0.09, 300); noise(0.05, 0.08, 4000); },
    shoot: () => tone(700, 0.05, 'triangle', 0.06, 260),
    swing: () => noise(0.07, 0.12, 2600),
    slam: () => { noise(0.2, 0.25, 500); tone(110, 0.2, 'sine', 0.25, -50); },
    coin: () => { tone(988, 0.05, 'square', 0.06); tone(1319, 0.09, 'square', 0.06, 0, 0.05); },
    exp: () => tone(1100, 0.04, 'sine', 0.05, 500),
    lvl: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'triangle', 0.14, 0, i * 0.07)),
    hurt: () => { tone(220, 0.14, 'sawtooth', 0.12, -120); },
    boom: () => { noise(0.3, 0.28, 700); tone(90, 0.25, 'sine', 0.2, -40); },
    pop: () => tone(480, 0.07, 'sine', 0.1, 520),
    click: () => tone(820, 0.03, 'sine', 0.08),
    dash: () => noise(0.12, 0.1, 3200),
    portal: () => [392, 523, 659].forEach((f, i) => tone(f, 0.18, 'sine', 0.1, 120, i * 0.05)),
    boss: () => { tone(80, 0.6, 'sawtooth', 0.18, -30); noise(0.5, 0.15, 300); },
    chest: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.14, 'square', 0.07, 0, i * 0.06)),
    legend: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.2, 'triangle', 0.12, 0, i * 0.07)),
    heal: () => [660, 880].forEach((f, i) => tone(f, 0.15, 'sine', 0.1, 200, i * 0.08)),
    skill: () => { tone(400, 0.15, 'triangle', 0.12, 600); noise(0.1, 0.06, 5000); },
    zap: () => { tone(1400, 0.08, 'sawtooth', 0.06, -900); },
    freeze: () => tone(1800, 0.2, 'sine', 0.06, -1200),
    shield: () => tone(600, 0.2, 'sine', 0.1, 300),
    die: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.2, 'triangle', 0.14, 0, i * 0.12)),
    clear: () => [523, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.08, 0, i * 0.08)),
    upgrade: () => [784, 1047, 1568].forEach((f, i) => tone(f, 0.1, 'square', 0.07, 0, i * 0.05)),
  };

  function play(name) {
    if (!G.Save.data || !G.Save.data.settings.sound) return;
    if (!ac) return;
    const now = ac.currentTime;
    if (last[name] && now - last[name] < 0.035) return;
    last[name] = now;
    try { lib[name] && lib[name](); } catch (e) { /* 무시 */ }
  }

  function vibe(ms) {
    if (G.Save.data && G.Save.data.settings.vibe && navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (e) { /* 무시 */ }
    }
  }

  return { init, play, vibe };
})();
