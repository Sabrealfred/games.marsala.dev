/**
 * SoundEngine - Web Audio API synthesized sounds.
 * No external audio files needed — everything is generated in real-time.
 */
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.3;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  ensureContext() {
    this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** Soft piece placement sound */
  move() {
    if (!this.enabled) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
    gain.gain.setValueAtTime(this.volume * 0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /** Impactful capture sound */
  capture() {
    if (!this.enabled) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    // Thump
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);
    gain.gain.setValueAtTime(this.volume * 0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);

    // Crack noise
    const bufferSize = this.ctx.sampleRate * 0.05;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
    }
    const noise = this.ctx.createBufferSource();
    const noiseGain = this.ctx.createGain();
    noise.buffer = buffer;
    noise.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noiseGain.gain.setValueAtTime(this.volume * 0.3, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    noise.start(now);
  }

  /** Alarming check sound */
  check() {
    if (!this.enabled) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(i === 0 ? 880 : 660, now + i * 0.12);
      gain.gain.setValueAtTime(this.volume * 0.25, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.1);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.1);
    }
  }

  /** Triumphant checkmate / game over */
  gameOver(isWin) {
    if (!this.enabled) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const notes = isWin
      ? [523, 659, 784, 1047]   // C major ascending
      : [440, 349, 294, 220];   // Descending minor

    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.2);
      gain.gain.setValueAtTime(this.volume * 0.35, now + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.3);
      osc.start(now + i * 0.2);
      osc.stop(now + i * 0.2 + 0.3);
    });
  }

  /** Subtle click for selection */
  select() {
    if (!this.enabled) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    gain.gain.setValueAtTime(this.volume * 0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  /** Castle sound — deep + regal */
  castle() {
    if (!this.enabled) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    [260, 330, 390].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + i * 0.08);
      gain.gain.setValueAtTime(this.volume * 0.3, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.2);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.2);
    });
  }

  /** Low tick for timer */
  tick() {
    if (!this.enabled) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, now);
    gain.gain.setValueAtTime(this.volume * 0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}
