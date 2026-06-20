// Runner Tuning: all feel/difficulty numbers live here so gameplay tweaks stay local.
const GameConfig = Object.freeze({
  width: 960,
  height: 540,
  groundY: 430,
  startSpeed: 1.28,
  maxSpeed: 8.8,
  baseSpeedRamp: 0.0005625,
  timeSpeedRamp: 0.00000001875,
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
    this.hudText = this.add.text(18, 16, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '22px',
      color: '#ffffff',
      stroke: '#07101d',
      strokeThickness: 4
    }).setDepth(20);
    this.helpText = this.add.text(W / 2, 58, 'Collect batteries. Jump over water pits!', {
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
      { x: 90, y: 80, s: 0.45 },
      { x: 390, y: 60, s: 0.7 },
      { x: 735, y: 105, s: 0.55 }
    ];
    this.gameOverText.setText('');
    this.restartText.setText('');
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
      this.obstacles.push({ x: W + 30, y: GROUND_Y - h, w: 48, h, kind: 'box' });
    } else if (kind === 'stackedBox') {
      const stackH = BOX_SIZE * 2;
      const nearPlatform = this.obstacles.some(o => o.kind === 'platform' && o.x > W - 260);
      if (nearPlatform || Math.random() < 0.45) this.obstacles.push({ x: W + 30, y: GROUND_Y - stackH, w: BOX_SIZE, h: stackH, kind: 'stackedBox' });
      else this.obstacles.push({ x: W + 30, y: GROUND_Y - BOX_SIZE, w: BOX_SIZE, h: BOX_SIZE, kind: 'box' });
    } else {
      this.obstacles.push({ x: W + 30, y: GROUND_Y - 62, w: 220, h: 62, kind: 'platform' });
    }

    const patternOffset = this.obstaclePatternIndex % 3 === 0 ? 90 : 0;
    this.spawnTimer = Math.round((OBSTACLE_GAP_PIXELS + patternOffset) / this.speed);
  }

  spawnNextBattery() {
    const high = this.obstaclePatternIndex % 2 === 0;
    this.pickups.push({ x: W + 40, y: high ? GROUND_Y - 168 : GROUND_Y - 112, w: 34, h: 50, bob: Math.random() * 10, collected: false });
    this.batteryTimer = Math.round(BATTERY_GAP_PIXELS / this.speed);
  }

  advanceRunnerWorld() {
    for (const c of this.clouds) {
      c.x -= this.speed * 0.09 * c.s;
      if (c.x < -130) c.x = W + 120;
    }
    for (const o of this.obstacles) o.x -= this.gameOver ? this.speed * 0.2 : this.speed;
    for (const p of this.pickups) {
      p.x -= this.gameOver ? this.speed * 0.2 : this.speed;
      p.bob += 0.08;
    }
    for (const s of this.sparks) {
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.25;
      s.life--;
    }
  }

  removeOffscreenObjects() {
    this.obstacles = this.obstacles.filter(o => o.x + o.w > -40);
    this.pickups = this.pickups.filter(p => p.x + p.w > -40 && !p.collected);
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
    this.gameOverText.setText('SPLASH!');
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
    for (const p of this.pickups) this.drawBattery(p);
    for (const o of this.obstacles) this.drawObstacle(o);
    this.drawRobot();
    this.drawSparks();
    this.drawHud();
  }

  drawBackground() {
    this.bg.fillGradientStyle(0x17375e, 0x17375e, 0x244b74, 0x102039, 1);
    this.bg.fillRect(0, 0, W, H);
    this.bg.fillStyle(0xffffff, 0.12);
    for (const c of this.clouds) {
      this.bg.fillCircle(c.x, c.y + 18, 28 * c.s);
      this.bg.fillCircle(c.x + 35 * c.s, c.y + 8, 38 * c.s);
      this.bg.fillCircle(c.x + 82 * c.s, c.y + 20, 26 * c.s);
    }
    this.bg.fillStyle(0x1c3558, 1);
    for (let x = -80 + ((this.tick * this.speed * 0.28) % 160); x < W + 200; x += 160) {
      this.bg.fillRect(x, 266, 70, 164);
      this.bg.fillRect(x + 20, 230, 32, 36);
    }
    this.world.fillStyle(0x17283f, 1);
    this.world.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    this.world.fillStyle(0x2bdf9f, 1);
    this.world.fillRect(0, GROUND_Y, W, 12);
    this.world.fillStyle(0xffffff, 0.12);
    for (let x = -80 + ((this.tick * this.speed) % 80); x < W + 80; x += 80) this.world.fillRect(x, GROUND_Y + 18, 38, 6);
  }

  drawRobot() {
    const r = this.robot;
    const g = this.world;
    const wobble = this.gameOver ? Math.sin(this.tick * 0.28) * 4 : 0;
    const x = r.x + wobble;
    const y = r.y;
    g.fillStyle(0xb9d4e9, 1);
    g.fillRoundedRect(x + 10, y + 20, 38, 42, 10);
    g.fillStyle(0xdff8ff, 1);
    g.fillRoundedRect(x + 5, y, 48, 34, 11);
    g.fillStyle(0x112033, 1);
    g.fillRoundedRect(x + 13, y + 9, 32, 14, 7);
    g.fillStyle(r.blink < 6 ? 0x112033 : 0x64f4ff, 1);
    g.fillCircle(x + 23, y + 16, 3.5);
    g.fillCircle(x + 36, y + 16, 3.5);
    g.lineStyle(4, 0x64f4ff, 1);
    g.lineBetween(x + 29, y, x + 29, y - 11);
    g.fillStyle(0xffd95a, 1);
    g.fillCircle(x + 29, y - 14, 5);
    const leg = r.grounded ? Math.sin(this.tick * 0.32) * 7 : -4;
    g.lineStyle(8, 0xdff8ff, 1);
    g.lineBetween(x + 18, y + 60, x + 14 + leg, y + 76);
    g.lineBetween(x + 40, y + 60, x + 44 - leg, y + 76);
    g.lineStyle(8, 0x9fd8ff, 1);
    g.lineBetween(x + 10, y + 32, x, y + 46 + Math.sin(this.tick * 0.25) * 4);
    g.lineBetween(x + 48, y + 32, x + 58, y + 46 - Math.sin(this.tick * 0.25) * 4);
  }

  drawObstacle(o) {
    if (o.kind === 'water') return this.drawWater(o);
    if (o.kind === 'platform') return this.drawPlatform(o);
    return this.drawBox(o);
  }

  drawWater(o) {
    const g = this.world;
    g.fillStyle(0x07101d, 1);
    g.beginPath();
    g.moveTo(o.x, o.y);
    g.lineTo(o.x + o.w, o.y);
    g.lineTo(o.x + o.w - 12, o.y + o.h);
    g.lineTo(o.x + 12, o.y + o.h);
    g.closePath();
    g.fillPath();
    g.fillGradientStyle(0x83f5ff, 0x83f5ff, 0x174dc8, 0x174dc8, 1);
    g.beginPath();
    g.moveTo(o.x + 10, o.y + 16);
    g.lineTo(o.x + o.w - 10, o.y + 16);
    g.lineTo(o.x + o.w - 20, o.y + o.h - 6);
    g.lineTo(o.x + 20, o.y + o.h - 6);
    g.closePath();
    g.fillPath();
    g.lineStyle(4, 0xdcffff, 0.9);
    g.beginPath();
    for (let x = 14; x < o.w - 20; x += 18) {
      const sy = o.y + 14 + Math.sin((this.tick + x) * 0.12) * 3;
      const ey = o.y + 14 + Math.sin((this.tick + x + 16) * 0.12) * 3;
      g.moveTo(o.x + x, sy);
      g.lineTo(o.x + x + 8, o.y + 8);
      g.lineTo(o.x + x + 16, ey);
    }
    g.strokePath();
    g.lineStyle(6, 0x2bdf9f, 1);
    g.lineBetween(o.x - 4, o.y + 1, o.x + 10, o.y + 1);
    g.lineBetween(o.x + o.w - 10, o.y + 1, o.x + o.w + 4, o.y + 1);
  }

  drawBox(o) {
    const g = this.world;
    const count = o.kind === 'stackedBox' ? 2 : 1;
    const blockH = o.h / count;
    for (let i = 0; i < count; i++) {
      const y = o.y + i * blockH;
      g.fillGradientStyle(0xd9a04f, 0xd9a04f, 0x8a5328, 0x8a5328, 1);
      g.fillRoundedRect(o.x, y, o.w, blockH, 6);
      g.lineStyle(4, 0x5b351c, 1);
      g.strokeRoundedRect(o.x + 2, y + 2, o.w - 4, blockH - 4, 5);
      g.lineStyle(3, 0xffffff, 0.26);
      g.lineBetween(o.x + 10, y + 12, o.x + o.w - 10, y + blockH - 10);
      g.lineBetween(o.x + o.w - 10, y + 12, o.x + 10, y + blockH - 10);
    }
  }

  drawPlatform(o) {
    const g = this.world;
    const corner = 24;
    g.fillStyle(0x17283f, 1);
    g.beginPath();
    g.moveTo(o.x, o.y + o.h);
    g.lineTo(o.x, o.y + corner);
    g.lineTo(o.x + corner, o.y + 8);
    g.lineTo(o.x + o.w - corner, o.y + 8);
    g.lineTo(o.x + o.w, o.y + corner);
    g.lineTo(o.x + o.w, o.y + o.h);
    g.closePath();
    g.fillPath();
    g.fillGradientStyle(0x68ffc7, 0x68ffc7, 0x2bdf9f, 0x2bdf9f, 1);
    g.beginPath();
    g.moveTo(o.x, o.y + corner);
    g.lineTo(o.x + 26, o.y);
    g.lineTo(o.x + o.w - 26, o.y);
    g.lineTo(o.x + o.w, o.y + corner);
    g.lineTo(o.x + o.w, o.y + 28);
    g.lineTo(o.x, o.y + 28);
    g.closePath();
    g.fillPath();
    g.fillStyle(0xffffff, 0.12);
    for (let x = o.x + 18; x < o.x + o.w - 20; x += 38) g.fillRect(x, o.y + 38, 22, 5);
  }

  drawBattery(p) {
    if (p.collected) return;
    const y = p.y + Math.sin(p.bob) * 8;
    const g = this.world;
    g.fillStyle(0x273142, 1);
    g.fillRoundedRect(p.x, y + 6, p.w, p.h - 6, 7);
    g.fillStyle(0xffd95a, 1);
    g.fillRoundedRect(p.x + 7, y + 13, p.w - 14, p.h - 20, 5);
    g.fillStyle(0x7dff8a, 1);
    g.fillRect(p.x + 11, y + 20, p.w - 22, 8);
    g.fillRect(p.x + 11, y + 32, p.w - 22, 8);
    g.fillStyle(0xe8f3ff, 1);
    g.fillRoundedRect(p.x + 10, y, p.w - 20, 8, 3);
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
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: RobotBatteryRunnerScene
  });
} else {
  document.body.innerHTML = '<p style="color:white;font:20px sans-serif;padding:24px">Phaser failed to load. Refresh the page.</p>';
}
