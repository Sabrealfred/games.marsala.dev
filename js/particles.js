/**
 * ParticleSystem - Canvas-based visual effects for chess events.
 * Renders floating ambient particles, capture explosions, check sparks.
 */
export class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.running = true;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.loop();
  }

  resize() {
    this.canvas.width = this.canvas.offsetWidth * devicePixelRatio;
    this.canvas.height = this.canvas.offsetHeight * devicePixelRatio;
    this.ctx.scale(devicePixelRatio, devicePixelRatio);
  }

  get w() { return this.canvas.offsetWidth; }
  get h() { return this.canvas.offsetHeight; }

  /** Ambient floating particles */
  spawnAmbient(count = 30) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.3 + 0.1,
        color: Math.random() > 0.5 ? '124,111,255' : '240,192,64',
        life: Infinity,
        type: 'ambient',
      });
    }
  }

  /** Explosion on capture - centered on board square */
  explode(x, y, color = 'gold') {
    const colors = {
      gold: ['255,215,0', '255,165,0', '255,100,50'],
      red: ['255,60,60', '255,100,100', '200,30,30'],
      purple: ['160,100,255', '124,111,255', '200,150,255'],
      white: ['255,255,255', '200,200,255', '220,220,240'],
    };
    const palette = colors[color] || colors.gold;
    for (let i = 0; i < 24; i++) {
      const angle = (Math.PI * 2 * i) / 24 + Math.random() * 0.3;
      const speed = Math.random() * 4 + 2;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: Math.random() * 3 + 1.5,
        alpha: 1,
        color: palette[Math.floor(Math.random() * palette.length)],
        life: 40 + Math.random() * 20,
        maxLife: 60,
        type: 'burst',
        friction: 0.96,
      });
    }
    // Central flash
    this.particles.push({
      x, y, vx: 0, vy: 0,
      r: 20, alpha: 0.8,
      color: palette[0],
      life: 15, maxLife: 15,
      type: 'flash',
    });
  }

  /** Sparks for check */
  sparks(x, y) {
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 6 + 3;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: Math.random() * 2 + 0.5,
        alpha: 1,
        color: '230,57,70',
        life: 30 + Math.random() * 15,
        maxLife: 45,
        type: 'spark',
        friction: 0.94,
        gravity: 0.15,
      });
    }
  }

  /** Rising celebration particles for victory */
  celebrate(duration = 3000) {
    const end = Date.now() + duration;
    const spawn = () => {
      if (Date.now() > end) return;
      for (let i = 0; i < 3; i++) {
        this.particles.push({
          x: Math.random() * this.w,
          y: this.h + 10,
          vx: (Math.random() - 0.5) * 2,
          vy: -(Math.random() * 3 + 2),
          r: Math.random() * 4 + 2,
          alpha: 1,
          color: ['255,215,0', '124,111,255', '42,157,143', '230,57,70'][Math.floor(Math.random() * 4)],
          life: 80 + Math.random() * 40,
          maxLife: 120,
          type: 'confetti',
          friction: 0.99,
          gravity: -0.02,
          rotation: Math.random() * 360,
          rotSpeed: (Math.random() - 0.5) * 10,
        });
      }
      requestAnimationFrame(spawn);
    };
    spawn();
  }

  /** Ring pulse effect */
  ring(x, y, color = '124,111,255') {
    this.particles.push({
      x, y, vx: 0, vy: 0,
      r: 5, alpha: 0.6,
      color,
      life: 25, maxLife: 25,
      type: 'ring',
      growRate: 3,
    });
  }

  loop() {
    if (!this.running) return;
    this.ctx.clearRect(0, 0, this.w, this.h);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      if (p.type !== 'ambient') {
        p.life--;
        if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      }

      // Physics
      p.x += p.vx;
      p.y += p.vy;
      if (p.friction) { p.vx *= p.friction; p.vy *= p.friction; }
      if (p.gravity) p.vy += p.gravity;

      // Wrap ambient particles
      if (p.type === 'ambient') {
        if (p.x < -5) p.x = this.w + 5;
        if (p.x > this.w + 5) p.x = -5;
        if (p.y < -5) p.y = this.h + 5;
        if (p.y > this.h + 5) p.y = -5;
      }

      // Fade
      let alpha = p.alpha;
      if (p.maxLife && p.life < p.maxLife * 0.4) {
        alpha *= p.life / (p.maxLife * 0.4);
      }

      this.ctx.save();

      if (p.type === 'ring') {
        const radius = p.r + (p.maxLife - p.life) * p.growRate;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        this.ctx.strokeStyle = `rgba(${p.color},${alpha})`;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      } else if (p.type === 'flash') {
        const radius = p.r * (p.life / p.maxLife);
        const grad = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        grad.addColorStop(0, `rgba(${p.color},${alpha})`);
        grad.addColorStop(1, `rgba(${p.color},0)`);
        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        this.ctx.fill();
      } else if (p.type === 'confetti') {
        this.ctx.translate(p.x, p.y);
        p.rotation += p.rotSpeed;
        this.ctx.rotate(p.rotation * Math.PI / 180);
        this.ctx.fillStyle = `rgba(${p.color},${alpha})`;
        this.ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      } else {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(${p.color},${alpha})`;
        this.ctx.fill();
      }

      this.ctx.restore();
    }

    requestAnimationFrame(() => this.loop());
  }

  destroy() {
    this.running = false;
    this.particles = [];
  }
}
