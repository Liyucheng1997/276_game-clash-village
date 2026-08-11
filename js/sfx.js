// ============ 简易音效 (WebAudio 合成) ============
const SFX = (() => {
  let ctx = null;
  let enabled = true;

  function ac() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { enabled = false; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, slide) {
    if (!enabled) return;
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.08, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }

  function noise(dur, vol, lowpass) {
    if (!enabled) return;
    const c = ac(); if (!c) return;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = vol || 0.1;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass || 1200;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start();
  }

  const api = {
    click()    { tone(700, 0.06, 'square', 0.05); },
    coin()     { tone(950, 0.08, 'triangle', 0.09, 300); tone(1400, 0.1, 'triangle', 0.06, 200); },
    build()    { tone(300, 0.15, 'square', 0.07, 150); },
    done()     { tone(600, 0.1, 'triangle', 0.08); setTimeout(() => tone(900, 0.15, 'triangle', 0.08), 90); },
    error()    { tone(180, 0.18, 'sawtooth', 0.07, -60); },
    cannon()   { noise(0.18, 0.14, 900); tone(120, 0.15, 'sine', 0.12, -60); },
    arrow()    { tone(1800, 0.05, 'sine', 0.03, -900); },
    boom()     { noise(0.4, 0.22, 700); tone(70, 0.35, 'sine', 0.18, -30); },
    hit()      { tone(250, 0.05, 'square', 0.04, -80); },
    zap()      { noise(0.15, 0.12, 4000); tone(2200, 0.2, 'sawtooth', 0.06, -1800); },
    deploy()   { tone(500, 0.08, 'square', 0.06, 200); },
    win()      { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.1), i * 140)); },
    lose()     { [400, 350, 300, 200].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'sawtooth', 0.07), i * 160)); },
    spell()    { tone(800, 0.3, 'sine', 0.08, 600); },
    heal()     { tone(1000, 0.25, 'sine', 0.05, 300); },
    get enabled() { return enabled; },
    toggle() { enabled = !enabled; return enabled; },
  };
  return api;
})();
