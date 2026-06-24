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
    for (const sign of this.tokyoSigns ?? []) {
      sign.label?.destroy();
      sign.subLabel?.destroy();
    }
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
    this.tokyoSigns = [
      { style: 'ramen', x: 76, y: 166, w: 142, h: 58, color: 0xff4fc3, accent: 0xffd36b, text: 'RAMEN', subText: 'NOODLES' },
      { style: 'vertical', x: 294, y: 122, w: 76, h: 112, color: 0xff5fbf, accent: 0x6ef7d2, text: '24H', subText: 'OPEN' },
      { style: 'billboard', x: 500, y: 176, w: 136, h: 54, color: 0x6ef7d2, accent: 0x8d5cff, text: 'ROBO', subText: 'PARTS' },
      { style: 'capsule', x: 722, y: 110, w: 92, h: 118, color: 0x8d5cff, accent: 0xff73d4, text: 'NEON', subText: 'CLUB' }
    ];
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
    this.bg.fillGradientStyle(0x120820, 0x120820, 0x321551, 0x050612, 1);
    this.bg.fillRect(0, 0, W, H);

    this.bg.fillStyle(0xff73d4, 0.9);
    this.bg.fillCircle(818, 72, 36);
    this.bg.fillStyle(0x8d5cff, 0.18);
    this.bg.fillCircle(818, 72, 68);

    this.drawCitySparkles();
    this.drawTokyoSkyline(0.12, 0x17102d, 250, 92);
    this.drawTokyoSkyline(0.28, 0x21133f, 286, 120);
    this.drawTokyoSigns();
    this.drawRoad();
  }

  drawTokyoSkyline(speedScale, color, baseY, maxHeight) {
    const offset = (this.tick * this.speed * speedScale) % 150;
    this.bg.fillStyle(color, 1);
    for (let x = -150 - offset; x < W + 180; x += 150) {
      const h1 = 70 + ((x + 400) % maxHeight);
      const h2 = 96 + ((x + 260) % (maxHeight + 36));
      const towerW = 58 + ((x + 90) % 36);
      this.bg.fillRect(x, baseY - h1, towerW, h1 + (GROUND_Y - baseY));
      this.bg.fillRect(x + 72, baseY - h2, towerW + 18, h2 + (GROUND_Y - baseY));
      this.bg.fillTriangle(x + 92, baseY - h2, x + 118, baseY - h2 - 46, x + 144, baseY - h2);

      const lit = speedScale > 0.2 ? 0.55 : 0.25;
      for (let wy = baseY - h1 + 16; wy < baseY - 8; wy += 22) {
        this.bg.fillStyle((wy + x) % 44 === 0 ? 0xffd36b : 0x6ef7d2, lit);
        this.bg.fillRect(x + 12, wy, 10, 8);
        this.bg.fillRect(x + 34, wy, 10, 8);
      }
      for (let wy = baseY - h2 + 18; wy < baseY - 8; wy += 24) {
        this.bg.fillStyle((wy + x) % 48 === 0 ? 0xff5fbf : 0xffffff, lit * 0.7);
        this.bg.fillRect(x + 88, wy, 12, 8);
        this.bg.fillRect(x + 118, wy, 12, 8);
      }
      this.bg.fillStyle(color, 1);
    }
  }

  drawTokyoSigns() {
    for (const sign of this.tokyoSigns) {
      const x = sign.x - ((this.tick * this.speed * 0.42) % (W + 180));
      const wrappedX = x < -150 ? x + W + 180 : x;
      const pulse = 0.72 + Math.sin(this.tick * 0.08 + sign.x) * 0.18;
      this.drawSignFrame(sign, wrappedX, pulse);
      this.positionSignLabels(sign, wrappedX, pulse);
    }
  }

  drawSignFrame(sign, x, pulse) {
    const g = this.bg;
    g.lineStyle(4, 0x090719, 0.9);
    g.lineBetween(x + sign.w / 2, sign.y - 18, x + sign.w / 2, sign.y + 2);
    g.lineStyle(2, 0xffffff, 0.22);
    g.lineBetween(x + sign.w / 2, sign.y - 18, x + sign.w / 2, sign.y + 2);

    g.fillStyle(0x090719, 0.86);
    g.fillRoundedRect(x - 8, sign.y - 8, sign.w + 16, sign.h + 16, 9);
    g.fillStyle(sign.color, 0.2 + pulse * 0.22);
    g.fillRoundedRect(x - 14, sign.y - 14, sign.w + 28, sign.h + 28, 14);

    if (sign.style === 'ramen') {
      g.fillStyle(0x18091f, 0.96);
      g.fillRoundedRect(x, sign.y, sign.w, sign.h, 8);
      g.fillStyle(sign.color, pulse);
      g.fillRoundedRect(x + 8, sign.y + 14, sign.w - 16, sign.h - 20, 5);
      for (let sx = x + 8; sx < x + sign.w - 8; sx += 24) {
        g.fillStyle((sx / 24) % 2 < 1 ? sign.accent : 0xffffff, 0.9);
        g.fillRect(sx, sign.y + 3, 18, 14);
      }
      g.fillStyle(sign.accent, 0.9);
      g.fillCircle(x + sign.w + 18, sign.y + 28, 17);
      g.lineStyle(3, 0xffffff, 0.55);
      g.strokeCircle(x + sign.w + 18, sign.y + 28, 17);
    } else if (sign.style === 'vertical') {
      g.fillStyle(0x120820, 0.98);
      g.fillRoundedRect(x, sign.y, sign.w, sign.h, 10);
      g.lineStyle(5, sign.color, pulse);
      g.strokeRoundedRect(x + 4, sign.y + 4, sign.w - 8, sign.h - 8, 8);
      g.lineStyle(2, sign.accent, 0.7);
      for (let y = sign.y + 20; y < sign.y + sign.h - 10; y += 22) g.lineBetween(x + 12, y, x + sign.w - 12, y);
      g.fillStyle(sign.accent, pulse);
      g.fillCircle(x + sign.w - 12, sign.y + 14, 5);
      g.fillCircle(x + 12, sign.y + sign.h - 14, 5);
    } else if (sign.style === 'billboard') {
      g.fillStyle(0x0b1027, 0.98);
      g.beginPath();
      g.moveTo(x + 10, sign.y);
      g.lineTo(x + sign.w - 8, sign.y + 4);
      g.lineTo(x + sign.w, sign.y + sign.h - 8);
      g.lineTo(x, sign.y + sign.h);
      g.closePath();
      g.fillPath();
      g.lineStyle(4, sign.color, pulse);
      g.strokePath();
      g.fillStyle(sign.accent, 0.8);
      for (let bx = x + 18; bx < x + sign.w - 12; bx += 22) g.fillCircle(bx, sign.y + sign.h - 8, 4);
      g.lineStyle(3, sign.accent, 0.55);
      g.lineBetween(x + 26, sign.y - 10, x + 46, sign.y);
      g.lineBetween(x + sign.w - 28, sign.y - 10, x + sign.w - 48, sign.y);
    } else {
      g.fillStyle(0x100821, 0.98);
      g.fillRoundedRect(x, sign.y, sign.w, sign.h, 28);
      g.lineStyle(5, sign.accent, pulse);
      g.strokeRoundedRect(x + 5, sign.y + 5, sign.w - 10, sign.h - 10, 22);
      g.fillStyle(sign.color, 0.28 + pulse * 0.24);
      g.fillRoundedRect(x + 14, sign.y + 16, sign.w - 28, sign.h - 32, 18);
      g.fillStyle(0xffffff, 0.55);
      g.fillCircle(x + sign.w / 2, sign.y + 14, 5);
      g.fillCircle(x + sign.w / 2, sign.y + sign.h - 14, 5);
    }
  }

  positionSignLabels(sign, x, pulse) {
    if (!sign.label) {
      const fontSize = sign.style === 'vertical' || sign.style === 'capsule' ? 22 : 23;
      sign.label = this.add.text(0, 0, sign.text, {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: `${fontSize}px`,
        color: '#ffffff',
        stroke: '#090719',
        strokeThickness: 5
      }).setOrigin(0.5).setDepth(1);
      sign.subLabel = this.add.text(0, 0, sign.subText, {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: sign.style === 'vertical' ? '13px' : '11px',
        color: '#fff6a6',
        stroke: '#090719',
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(1);
    }

    sign.label
      .setPosition(x + sign.w / 2, sign.y + sign.h * (sign.style === 'vertical' ? 0.42 : 0.48))
      .setAlpha(pulse)
      .setVisible(true);
    sign.subLabel
      .setPosition(x + sign.w / 2, sign.y + sign.h * (sign.style === 'vertical' ? 0.7 : 0.76))
      .setAlpha(0.72 + pulse * 0.24)
      .setVisible(true);
  }

  drawRoad() {
    const g = this.world;
    g.fillStyle(0x050611, 1);
    g.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    g.fillGradientStyle(0x26223a, 0x26223a, 0x070811, 0x070811, 1);
    g.fillRect(0, GROUND_Y + 10, W, H - GROUND_Y - 10);

    g.fillStyle(0xff4fc3, 1);
    g.fillRect(0, GROUND_Y, W, 5);
    g.fillStyle(0x6ef7d2, 0.9);
    g.fillRect(0, GROUND_Y + 5, W, 4);

    g.lineStyle(2, 0xffffff, 0.1);
    for (let y = GROUND_Y + 22; y < H; y += 24) g.lineBetween(0, y, W, y + 10);

    const laneOffset = (this.tick * this.speed * 2.2) % 96;
    g.fillStyle(0xffd36b, 0.95);
    for (let x = -96 + laneOffset; x < W + 96; x += 96) {
      g.fillRect(x, GROUND_Y + 56, 48, 7);
      g.fillRect(x + 18, GROUND_Y + 86, 70, 8);
    }

    g.fillStyle(0xffffff, 0.18);
    for (let x = -80 + ((this.tick * this.speed * 1.35) % 80); x < W + 80; x += 80) {
      g.fillRect(x, GROUND_Y + 22, 38, 4);
    }
  }

  drawCitySparkles() {
    for (const f of this.fireflies) {
      const pulse = 0.35 + Math.sin(this.tick * 0.055 + f.phase) * 0.22;
      this.bg.fillStyle(0x8fffe4, pulse);
      this.bg.fillRect(f.x, f.y, 2 + f.s, 2 + f.s);
      this.bg.fillStyle(0xff74d4, pulse * 0.34);
      this.bg.fillCircle(f.x + 2, f.y + 2, 4 + f.s * 1.7);
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
