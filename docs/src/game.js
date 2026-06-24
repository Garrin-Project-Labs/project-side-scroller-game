// Runner Tuning: all feel/difficulty numbers live here so gameplay tweaks stay local.
const GameConfig = Object.freeze({
  width: 960,
  height: 540,
  groundY: 430,
  startSpeed: 1.36,
  maxSpeed: 9.4,
  baseSpeedRamp: 0.00062,
  timeSpeedRamp: 0.000000021,
  robotX: 128,
  robotWidth: 58,
  robotHeight: 78,
  gravity: 0.54,
  jumpPower: -12.4,
  maxJumpHeight: 168,
  maxHeldJumpFrames: 60,
  heldJumpGravityScale: 0.12,
  obstacleGapPixels: 650,
  batteryGapPixels: 1120,
  firstWaterWidth: 48,
  waterWidths: [78, 96, 84, 116, 88],
  boxHeights: [38, 46, 34],
  boxSize: 44,
  obstaclePattern: ['water', 'box', 'platform', 'stackedBox', 'water', 'box', 'water', 'platform'],
});

const W = GameConfig.width;
const H = GameConfig.height;
const GROUND_Y = GameConfig.groundY;
const ROBOT_X = GameConfig.robotX;
const ROBOT_W = GameConfig.robotWidth;
const ROBOT_H = GameConfig.robotHeight;
const GRAVITY = GameConfig.gravity;
const JUMP_POWER = GameConfig.jumpPower;
const MAX_JUMP_HEIGHT = GameConfig.maxJumpHeight;
const MAX_HELD_JUMP_FRAMES = GameConfig.maxHeldJumpFrames;
const HELD_JUMP_GRAVITY_SCALE = GameConfig.heldJumpGravityScale;
const OBSTACLE_GAP_PIXELS = GameConfig.obstacleGapPixels;
const BATTERY_GAP_PIXELS = GameConfig.batteryGapPixels;
const WATER_WIDTHS = GameConfig.waterWidths;
const BOX_HEIGHTS = GameConfig.boxHeights;
const BOX_SIZE = GameConfig.boxSize;
const OBSTACLE_PATTERN = GameConfig.obstaclePattern;

// RobotBatteryRunnerScene owns the Runner World. Rendering is intentionally immediate-mode
// Phaser Graphics for now: simple data objects are easier to tune than converted DOM/canvas code.
class RobotBatteryRunnerScene extends Phaser.Scene {
  constructor() {
    super('runner');
  }

  preload() {
    this.load.svg('robot', 'src/assets/robot.svg', { width: 128, height: 188 });
    this.load.svg('battery', 'src/assets/battery.svg', { width: 136, height: 200 });
    this.load.svg('crate', 'src/assets/crate.svg', { width: 176, height: 176 });
    this.load.svg('platform', 'src/assets/platform.svg', { width: 880, height: 248 });
  }

  create() {
    this.best = Number(localStorage.getItem('robotBatteryRunnerBest') || 0);
    this.keys = this.input.keyboard.addKeys('SPACE,UP,R');
    this.input.keyboard.on('keydown-SPACE', () => this.startJump());
    this.input.keyboard.on('keydown-UP', () => this.startJump());
    this.input.keyboard.on('keyup-SPACE', () => this.stopJump());
    this.input.keyboard.on('keyup-UP', () => this.stopJump());
    this.input.on('pointerdown', () => this.startJump());
    this.input.on('pointerup', () => this.stopJump());
    this.input.on('pointerupoutside', () => this.stopJump());

    this.bg = this.add.graphics();
    this.world = this.add.graphics();
    this.effects = this.add.graphics();
    this.hud = this.add.graphics();
    this.robotSprite = this.add.image(ROBOT_X, GROUND_Y - ROBOT_H, 'robot').setOrigin(0, 0).setDisplaySize(ROBOT_W, ROBOT_H).setDepth(8);
    this.hudText = this.add.text(18, 16, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '22px',
      color: '#ffffff',
      stroke: '#07101d',
      strokeThickness: 4
    }).setDepth(20);
    this.helpText = this.add.text(W / 2, 58, 'Neon forest sprint: collect batteries, dodge glow pools!', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '24px',
      color: '#ffffff',
      stroke: '#07101d',
      strokeThickness: 5
    }).setOrigin(0.5).setDepth(20);
    this.subHelpText = this.add.text(W / 2, 92, 'Space / ↑ / click = jump', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      color: '#bfd6f3',
      stroke: '#07101d',
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(20);
    this.gameOverText = this.add.text(W / 2, H / 2 - 38, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '52px',
      color: '#ff6b8a',
      align: 'center',
      stroke: '#07101d',
      strokeThickness: 7
    }).setOrigin(0.5).setDepth(30);
    this.restartText = this.add.text(W / 2, H / 2 + 28, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '22px',
      color: '#ffffff',
      align: 'center',
      stroke: '#07101d',
      strokeThickness: 5
    }).setOrigin(0.5).setDepth(30);

    this.resetRun();
  }

  resetRun() {
    this.clearDynamicObjects();
    this.robot = {
      x: ROBOT_X,
      y: GROUND_Y - ROBOT_H,
      w: ROBOT_W,
      h: ROBOT_H,
      vy: 0,
      grounded: true,
      blink: 0
    };
    this.speed = GameConfig.startSpeed;
    this.score = 0;
    this.batteries = 0;
    this.tick = 0;
    this.gameOver = false;
    this.jumpHeld = false;
    this.heldJumpFrames = 0;
    this.spawnTimer = Math.round(560 / this.speed);
    this.batteryTimer = Math.round(820 / this.speed);
    this.obstaclePatternIndex = 0;
    this.obstacles = [];
    this.pickups = [];
    this.sparks = [];
    this.clouds = [
      { x: 90, y: 84, s: 0.45 },
      { x: 390, y: 62, s: 0.7 },
      { x: 735, y: 108, s: 0.55 }
    ];
    this.fireflies = Array.from({ length: 26 }, (_, i) => ({
      x: (i * 83 + 35) % W,
      y: 54 + ((i * 47) % 284),
      s: 0.45 + (i % 5) * 0.12,
      phase: i * 0.71
    }));
    this.signalGhosts = Array.from({ length: 10 }, (_, i) => ({
      x: (i * 137 + 90) % (W + 220),
      y: 246 + ((i * 53) % 142),
      w: 42 + (i % 4) * 22,
      h: 10 + (i % 3) * 8,
      phase: i * 0.83,
      tint: i % 2 === 0 ? 0xff5fbf : 0x6ef7d2
    }));
    this.gameOverText.setText('');
    this.restartText.setText('');
    this.robotSprite.setPosition(this.robot.x, this.robot.y).setRotation(0);
  }

  clearDynamicObjects() {
    for (const item of [...(this.obstacles ?? []), ...(this.pickups ?? [])]) item.sprite?.destroy();
    this.obstacles = [];
    this.pickups = [];
    this.sparks = [];
  }

  startJump() {
    this.jumpHeld = true;
    if (this.gameOver) {
      this.resetRun();
      return;
    }
    if (!this.robot.grounded) return;
    this.robot.vy = JUMP_POWER;
    this.robot.grounded = false;
    this.heldJumpFrames = MAX_HELD_JUMP_FRAMES;
    this.addSparks(this.robot.x + 12, GROUND_Y - 8, 0x64f4ff, 8);
  }

  stopJump() {
    this.jumpHeld = false;
    this.heldJumpFrames = 0;
  }

  // Main loop order: tune speed/spawns, move the Runner World, resolve hazards, then draw.
  update() {
    if (this.gameOver && Phaser.Input.Keyboard.JustDown(this.keys.R)) this.resetRun();
    this.tick++;

    if (!this.gameOver) {
      this.speed = Math.min(GameConfig.maxSpeed, this.speed + GameConfig.baseSpeedRamp + this.tick * GameConfig.timeSpeedRamp);
      this.score += 0.09 * this.speed;
      this.spawnTimer--;
      this.batteryTimer--;
      if (this.spawnTimer <= 0) this.spawnNextObstacle();
      if (this.batteryTimer <= 0) this.spawnNextBattery();
    }

    this.updateRobot();
    this.advanceRunnerWorld();
    this.handleRunnerCollisions();
    this.removeOffscreenObjects();
    this.draw();
  }

  updateRobot() {
    const previousY = this.robot.y;
    const extendingJump = !this.robot.grounded && this.jumpHeld && this.heldJumpFrames > 0;
    if (extendingJump) this.heldJumpFrames--;

    this.robot.vy += extendingJump ? GRAVITY * HELD_JUMP_GRAVITY_SCALE : GRAVITY;
    this.robot.y += this.robot.vy;

    const highestJumpY = GROUND_Y - this.robot.h - MAX_JUMP_HEIGHT;
    if (this.robot.y < highestJumpY) {
      this.robot.y = highestJumpY;
      this.robot.vy = Math.max(0, this.robot.vy);
    }

    let landed = false;
    for (const o of this.obstacles) {
      if (o.kind !== 'platform') continue;
      const wasAbove = previousY + this.robot.h <= o.y + 8;
      const overlapsX = this.robot.x + this.robot.w - 8 > o.x && this.robot.x + 8 < o.x + o.w;
      if (this.robot.vy >= 0 && wasAbove && overlapsX && this.robot.y + this.robot.h >= o.y) {
        this.robot.y = o.y - this.robot.h;
        this.robot.vy = 0;
        this.robot.grounded = true;
        landed = true;
        break;
      }
    }

    if (!landed && this.robot.y >= GROUND_Y - this.robot.h) {
      this.robot.y = GROUND_Y - this.robot.h;
      this.robot.vy = 0;
      this.robot.grounded = true;
      landed = true;
    }
    if (!landed) this.robot.grounded = false;
    this.robot.blink = (this.robot.blink + 1) % 120;
  }

  // Obstacle Pattern seam: change the pattern/timing here without touching collision or drawing.
  spawnNextObstacle() {
    const kind = OBSTACLE_PATTERN[this.obstaclePatternIndex % OBSTACLE_PATTERN.length];
    this.obstaclePatternIndex++;
    if (kind === 'water') {
      const w = this.obstaclePatternIndex === 1 ? GameConfig.firstWaterWidth : WATER_WIDTHS[this.obstaclePatternIndex % WATER_WIDTHS.length];
      this.obstacles.push({ x: W + 30, y: GROUND_Y - 2, w, h: 54, kind: 'water' });
    } else if (kind === 'box') {
      const h = BOX_HEIGHTS[this.obstaclePatternIndex % BOX_HEIGHTS.length];
      this.obstacles.push(this.makeTexturedObstacle('box', W + 30, GROUND_Y - h, 48, h));
    } else if (kind === 'stackedBox') {
      const stackH = BOX_SIZE * 2;
      const nearPlatform = this.obstacles.some(o => o.kind === 'platform' && o.x > W - 260);
      if (nearPlatform || Math.random() < 0.45) this.obstacles.push(this.makeTexturedObstacle('stackedBox', W + 30, GROUND_Y - stackH, BOX_SIZE, stackH));
      else this.obstacles.push(this.makeTexturedObstacle('box', W + 30, GROUND_Y - BOX_SIZE, BOX_SIZE, BOX_SIZE));
    } else {
      this.obstacles.push(this.makeTexturedObstacle('platform', W + 30, GROUND_Y - 62, 220, 62));
    }

    const patternOffset = this.obstaclePatternIndex % 3 === 0 ? 90 : 0;
    this.spawnTimer = Math.round((OBSTACLE_GAP_PIXELS + patternOffset) / this.speed);
  }

  makeTexturedObstacle(kind, x, y, w, h) {
    const texture = kind === 'platform' ? 'platform' : 'crate';
    const sprite = this.add.image(x, y, texture).setOrigin(0, 0).setDisplaySize(w, h).setDepth(kind === 'platform' ? 3 : 4);
    return { x, y, w, h, kind, sprite };
  }

  spawnNextBattery() {
    const high = this.obstaclePatternIndex % 2 === 0;
    const x = W + 40;
    const y = high ? GROUND_Y - 168 : GROUND_Y - 112;
    const sprite = this.add.image(x, y, 'battery').setOrigin(0, 0).setDisplaySize(34, 50).setDepth(5);
    this.pickups.push({ x, y, w: 34, h: 50, bob: Math.random() * 10, collected: false, sprite });
    this.batteryTimer = Math.round(BATTERY_GAP_PIXELS / this.speed);
  }

  advanceRunnerWorld() {
    for (const c of this.clouds) {
      c.x -= this.speed * 0.09 * c.s;
      if (c.x < -130) c.x = W + 120;
    }
    for (const o of this.obstacles) {
      o.x -= this.gameOver ? this.speed * 0.2 : this.speed;
      o.sprite?.setPosition(o.x, o.y);
    }
    for (const p of this.pickups) {
      p.x -= this.gameOver ? this.speed * 0.2 : this.speed;
      p.bob += 0.08;
      p.sprite?.setPosition(p.x, p.y + Math.sin(p.bob) * 8);
    }
    for (const s of this.sparks) {
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.25;
      s.life--;
    }
  }

  removeOffscreenObjects() {
    this.obstacles = this.obstacles.filter(o => {
      if (o.x + o.w > -40) return true;
      o.sprite?.destroy();
      return false;
    });
    this.pickups = this.pickups.filter(p => {
      if (p.x + p.w > -40 && !p.collected) return true;
      p.sprite?.destroy();
      return false;
    });
    this.sparks = this.sparks.filter(s => s.life > 0);
  }

  // Collision seam: hazards end the run, pickups reward score, platforms are handled in updateRobot.
  handleRunnerCollisions() {
    if (this.gameOver) return;
    const hit = this.robotHitbox();
    for (const o of this.obstacles) {
      if (o.kind === 'water') {
        if (this.overlap(hit, { x: o.x + 5, y: o.y - 5, w: o.w - 10, h: o.h + 10 })) this.endRunWithSplash();
      }
      if (o.kind === 'box' || o.kind === 'stackedBox') {
        if (this.overlap(hit, { x: o.x + 4, y: o.y + 4, w: o.w - 8, h: o.h - 4 })) this.endRunWithSplash();
      }
    }
    for (const p of this.pickups) {
      const y = p.y + Math.sin(p.bob) * 8;
      if (this.overlap(hit, { ...p, y })) {
        p.collected = true;
        p.sprite?.destroy();
        this.batteries++;
        this.score += 60;
        this.addSparks(p.x + p.w / 2, y + p.h / 2, 0xffd95a, 16);
      }
    }
  }

  endRunWithSplash() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.best = Math.max(this.best, Math.floor(this.score));
    localStorage.setItem('robotBatteryRunnerBest', String(this.best));
    this.addSparks(this.robot.x + this.robot.w / 2, GROUND_Y - 4, 0x6aa8ff, 34);
    this.gameOverText.setText('ZAP-SPLASH!');
    this.restartText.setText(`Score ${Math.floor(this.score)} • Batteries ${this.batteries}\nPress Space, ↑, click, or R to run again`);
  }

  addSparks(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      this.sparks.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 6,
        vy: -Math.random() * 5 - 1,
        life: 24 + Math.random() * 18,
        color
      });
    }
  }

  draw() {
    this.bg.clear();
    this.world.clear();
    this.effects.clear();
    this.hud.clear();

    this.drawBackground();
    for (const o of this.obstacles) this.drawObstacle(o);
    this.drawRobot();
    this.drawSparks();
    this.drawHud();
  }

  drawBackground() {
    this.bg.fillGradientStyle(0x211142, 0x211142, 0x5c2f75, 0x0b1027, 1);
    this.bg.fillRect(0, 0, W, H);

    this.bg.fillStyle(0xffd36b, 0.95);
    this.bg.fillCircle(804, 76, 42);
    this.bg.fillStyle(0xfff0b2, 0.16);
    this.bg.fillCircle(804, 76, 70);

    this.bg.fillStyle(0xffffff, 0.08);
    for (const c of this.clouds) {
      this.bg.fillCircle(c.x, c.y + 18, 28 * c.s);
      this.bg.fillCircle(c.x + 35 * c.s, c.y + 8, 38 * c.s);
      this.bg.fillCircle(c.x + 82 * c.s, c.y + 20, 26 * c.s);
    }

    this.drawNeonStars();

    this.bg.fillStyle(0x261947, 1);
    for (let x = -110 + ((this.tick * this.speed * 0.22) % 210); x < W + 240; x += 210) {
      this.bg.fillTriangle(x, GROUND_Y, x + 82, 162, x + 164, GROUND_Y);
      this.bg.fillStyle(0x35205b, 1);
      this.bg.fillTriangle(x + 70, GROUND_Y, x + 126, 196, x + 196, GROUND_Y);
      this.bg.fillStyle(0x261947, 1);
    }

    this.bg.lineStyle(5, 0x6ef7d2, 0.3);
    for (let x = -100 + ((this.tick * this.speed * 0.38) % 180); x < W + 220; x += 180) {
      this.bg.lineBetween(x, GROUND_Y, x + 38, 276);
      this.bg.lineBetween(x + 38, 276, x + 76, GROUND_Y);
      this.bg.fillStyle(0x2cffbb, 0.18);
      this.bg.fillCircle(x + 38, 274, 14);
    }

    this.drawSignalNoise();

    this.world.fillStyle(0x130f2a, 1);
    this.world.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    this.world.fillGradientStyle(0x23133e, 0x23133e, 0x0b1027, 0x0b1027, 1);
    this.world.fillRect(0, GROUND_Y + 12, W, H - GROUND_Y - 12);
    this.world.fillStyle(0xff5fbf, 1);
    this.world.fillRect(0, GROUND_Y, W, 8);
    this.world.fillStyle(0x6ef7d2, 1);
    this.world.fillRect(0, GROUND_Y + 8, W, 5);
    this.world.fillStyle(0xffffff, 0.16);
    for (let x = -80 + ((this.tick * this.speed) % 80); x < W + 80; x += 80) this.world.fillRect(x, GROUND_Y + 24, 38, 6);
  }

  drawNeonStars() {
    for (const f of this.fireflies) {
      const pulse = 0.45 + Math.sin(this.tick * 0.055 + f.phase) * 0.25;
      this.bg.fillStyle(0x8fffe4, pulse);
      this.bg.fillCircle(f.x, f.y, 1.8 + f.s);
      this.bg.fillStyle(0xff74d4, pulse * 0.42);
      this.bg.fillCircle(f.x, f.y, 5.5 + f.s * 2);
    }
  }

  // Visual-noise seam: these are harmless background decoys that raise the read-the-screen challenge.
  drawSignalNoise() {
    const heat = Math.min(1, this.tick / 1800);
    const shimmer = Math.sin(this.tick * 0.09) * 0.5 + 0.5;
    const alpha = 0.07 + heat * 0.18;

    for (let y = 150; y < GROUND_Y - 22; y += 38) {
      const x = -180 + ((this.tick * this.speed * (0.42 + y * 0.0007)) % 220);
      this.bg.fillStyle(y % 76 === 0 ? 0xff5fbf : 0x6ef7d2, alpha * 0.18);
      this.bg.fillRect(x, y, W + 260, 3);
    }

    for (const g of this.signalGhosts) {
      const drift = (this.tick * this.speed * (0.34 + (g.w % 5) * 0.015)) % (W + 260);
      const x = W + 70 + g.x - drift;
      const y = g.y + Math.sin(this.tick * 0.045 + g.phase) * 8;
      const pulse = alpha * (0.55 + Math.sin(this.tick * 0.08 + g.phase) * 0.25);
      this.bg.fillStyle(g.tint, pulse);
      this.bg.fillRect(x, y, g.w, g.h);
      this.bg.fillStyle(0xffffff, pulse * 0.45);
      this.bg.fillRect(x + 8, y + 2, Math.max(8, g.w * 0.42), 3);
    }

    this.bg.lineStyle(2, 0xffd36b, 0.08 + heat * 0.14);
    for (let i = 0; i < 6; i++) {
      const x = -90 + ((this.tick * this.speed * (0.55 + i * 0.06) + i * 154) % (W + 180));
      const y = GROUND_Y - 106 + i * 13 + Math.sin(this.tick * 0.05 + i) * 9;
      this.bg.beginPath();
      this.bg.moveTo(x, y);
      this.bg.lineTo(x + 24, y - 20);
      this.bg.lineTo(x + 48, y + 10);
      this.bg.lineTo(x + 74, y - 12);
      this.bg.strokePath();
    }

    this.bg.fillStyle(0xffffff, 0.025 + shimmer * 0.025);
    for (let x = -24 + ((this.tick * this.speed * 1.7) % 48); x < W + 48; x += 48) {
      this.bg.fillRect(x, 132, 3, GROUND_Y - 132);
    }
  }

  drawRobot() {
    const wobble = this.gameOver ? Math.sin(this.tick * 0.28) * 0.08 : 0;
    this.robotSprite
      .setPosition(this.robot.x, this.robot.y)
      .setRotation(wobble)
      .setAlpha(this.gameOver ? 0.88 : 1);
  }

  drawObstacle(o) {
    if (o.kind === 'water') return this.drawWater(o);
  }

  drawWater(o) {
    const g = this.world;
    g.fillStyle(0x090719, 1);
    g.beginPath();
    g.moveTo(o.x, o.y);
    g.lineTo(o.x + o.w, o.y);
    g.lineTo(o.x + o.w - 12, o.y + o.h);
    g.lineTo(o.x + 12, o.y + o.h);
    g.closePath();
    g.fillPath();
    g.fillGradientStyle(0xff7adf, 0xff7adf, 0x4b1fff, 0x4b1fff, 1);
    g.beginPath();
    g.moveTo(o.x + 10, o.y + 16);
    g.lineTo(o.x + o.w - 10, o.y + 16);
    g.lineTo(o.x + o.w - 20, o.y + o.h - 6);
    g.lineTo(o.x + 20, o.y + o.h - 6);
    g.closePath();
    g.fillPath();
    g.lineStyle(4, 0x9efff1, 0.95);
    g.beginPath();
    for (let x = 14; x < o.w - 20; x += 18) {
      const sy = o.y + 14 + Math.sin((this.tick + x) * 0.12) * 3;
      const ey = o.y + 14 + Math.sin((this.tick + x + 16) * 0.12) * 3;
      g.moveTo(o.x + x, sy);
      g.lineTo(o.x + x + 8, o.y + 8);
      g.lineTo(o.x + x + 16, ey);
    }
    g.strokePath();
    g.lineStyle(6, 0xff5fbf, 1);
    g.lineBetween(o.x - 4, o.y + 1, o.x + 10, o.y + 1);
    g.lineBetween(o.x + o.w - 10, o.y + 1, o.x + o.w + 4, o.y + 1);
  }

  drawSparks() {
    for (const s of this.sparks) {
      this.effects.fillStyle(s.color, Math.max(0, s.life / 36));
      this.effects.fillCircle(s.x, s.y, 3.5);
    }
  }

  drawHud() {
    this.hudText.setText(`Score ${Math.floor(this.score)}   Batteries ${this.batteries}   Best ${this.best}`);
    this.helpText.setVisible(!this.gameOver && this.tick < 210);
    this.subHelpText.setVisible(!this.gameOver && this.tick < 210);
  }

  robotHitbox() {
    return { x: this.robot.x + 10, y: this.robot.y + 8, w: this.robot.w - 20, h: this.robot.h - 8 };
  }

  overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
}

if (window.Phaser) {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    backgroundColor: '#102039',
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: false
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: RobotBatteryRunnerScene
  });
} else {
  document.body.innerHTML = '<p style="color:white;font:20px sans-serif;padding:24px">Phaser failed to load. Refresh the page.</p>';
}
