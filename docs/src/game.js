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
      { layer: 'front', style: 'ramen', x: 90, y: 166, w: 142, h: 58, color: 0xff4fc3, accent: 0xffd36b, text: 'RAMEN', subText: 'NOODLES' },
      { layer: 'front', style: 'vertical', x: 430, y: 122, w: 76, h: 112, color: 0xff5fbf, accent: 0x6ef7d2, text: '24H', subText: 'OPEN' },
      { layer: 'back', style: 'billboard', x: 720, y: 150, w: 122, h: 48, color: 0x6ef7d2, accent: 0x8d5cff, text: 'ROBO', subText: 'PARTS' },
      { layer: 'front', style: 'capsule', x: 1060, y: 110, w: 92, h: 118, color: 0x8d5cff, accent: 0xff73d4, text: 'NEON', subText: 'CLUB' },
      { layer: 'front', style: 'billboard', x: 1390, y: 164, w: 132, h: 58, color: 0x1ca7ff, accent: 0x9effff, text: 'IDGF', subText: '' },
      { layer: 'back', style: 'vertical', x: 1740, y: 104, w: 70, h: 104, color: 0xffd36b, accent: 0xff73d4, text: 'KAI', subText: 'BAR' },
      { layer: 'front', style: 'billboard', x: 2070, y: 178, w: 148, h: 50, color: 0xff73d4, accent: 0xffd36b, text: 'PIXEL', subText: 'SHOP' },
      { layer: 'back', style: 'capsule', x: 2420, y: 92, w: 84, h: 106, color: 0x6ef7d2, accent: 0x1ca7ff, text: 'MTR', subText: 'LINE' },
      { layer: 'front', style: 'ramen', x: 2760, y: 170, w: 132, h: 54, color: 0xffd36b, accent: 0xff4fc3, text: 'SUSHI', subText: 'NIGHT' },
      { layer: 'back', style: 'billboard', x: 3130, y: 134, w: 120, h: 46, color: 0x8d5cff, accent: 0x6ef7d2, text: 'BYTE', subText: 'CAFE' },
      { layer: 'front', style: 'vertical', x: 3490, y: 126, w: 72, h: 112, color: 0x1ca7ff, accent: 0x9effff, text: 'ARC', subText: 'ADE' },
      { layer: 'back', style: 'billboard', x: 3850, y: 152, w: 140, h: 50, color: 0xff5fbf, accent: 0xffd36b, text: 'NOVA', subText: 'MART' },
      { layer: 'front', style: 'capsule', x: 4210, y: 116, w: 94, h: 112, color: 0xff73d4, accent: 0x8d5cff, text: 'VIBE', subText: 'ROOM' },
      { layer: 'back', style: 'vertical', x: 4580, y: 96, w: 76, h: 108, color: 0x6ef7d2, accent: 0xffd36b, text: 'BOT', subText: 'LAB' },
      { layer: 'front', style: 'billboard', x: 4930, y: 176, w: 150, h: 52, color: 0xffd36b, accent: 0xff5fbf, text: 'MOON', subText: 'TAXI' }
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
    this.drawTokyoSigns('back');
    this.drawNearTokyoStreetfront();
    this.drawTokyoSigns('front');
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

  drawNearTokyoStreetfront() {
    const segment = 190;
    const fronts = [
      { top: 88, w: 248, face: 0x22133e, trim: 0x6ef7d2, accent: 0xff73d4, roof: 'flat' },
      { top: 126, w: 226, face: 0x17102f, trim: 0xff5fbf, accent: 0xffd36b, roof: 'antenna' },
      { top: 72, w: 238, face: 0x281440, trim: 0xffd36b, accent: 0x6ef7d2, roof: 'slant' },
      { top: 112, w: 254, face: 0x101b37, trim: 0x8d5cff, accent: 0xff5fbf, roof: 'pipes' },
      { top: 98, w: 216, face: 0x2a102d, trim: 0xff73d4, accent: 0x6ef7d2, roof: 'stack' },
      { top: 58, w: 182, face: 0x132642, trim: 0x6ef7d2, accent: 0xffd36b, roof: 'antenna' },
      { top: 146, w: 168, face: 0x24102a, trim: 0xff5fbf, accent: 0x8d5cff, roof: 'flat' },
      { top: 82, w: 250, face: 0x0f1f34, trim: 0x8d5cff, accent: 0xff73d4, roof: 'pipes' },
      { top: 118, w: 196, face: 0x2b183d, trim: 0xffd36b, accent: 0x6ef7d2, roof: 'slant' },
      { top: 44, w: 154, face: 0x102b45, trim: 0x1ca7ff, accent: 0x9effff, roof: 'spire', windows: 'thin', shape: 'taper', cut: 46 },
      { top: 138, w: 276, face: 0x271529, trim: 0xff5fbf, accent: 0xffd36b, roof: 'arcade', windows: 'wide', shape: 'dome' },
      { top: 76, w: 224, face: 0x0e2a28, trim: 0x6ef7d2, accent: 0xff73d4, roof: 'billboardTop', windows: 'grid', shape: 'stepped' },
      { top: 104, w: 188, face: 0x2d203b, trim: 0xffd36b, accent: 0x8d5cff, roof: 'vents', windows: 'thin' },
      { top: 62, w: 258, face: 0x151538, trim: 0x8d5cff, accent: 0x6ef7d2, roof: 'antenna', windows: 'wide' },
      { top: 132, w: 142, face: 0x2b1028, trim: 0xff73d4, accent: 0x1ca7ff, roof: 'stack', windows: 'grid', shape: 'skinnyStack' }
    ];
    const stripWidth = segment * fronts.length;
    const offset = (this.tick * this.speed * 0.34) % stripWidth;

    for (let repeat = -1; repeat <= 1; repeat++) {
      for (let i = 0; i < fronts.length; i++) {
        const spec = fronts[i];
        const x = i * segment + repeat * stripWidth - offset;
        if (x + spec.w < -80 || x > W + 80) continue;
        this.drawStreetfrontBuilding(x, spec, i);
      }
    }

    this.bg.lineStyle(3, 0x090719, 0.9);
    this.bg.lineBetween(0, 148, W, 116);
    this.bg.lineStyle(1, 0xffffff, 0.18);
    this.bg.lineBetween(0, 146, W, 114);
  }

  drawStreetfrontBuilding(x, spec, index) {
    const g = this.bg;
    const top = spec.top;
    const w = spec.w;

    this.drawBuildingShape(x, top, w, spec);

    this.drawStreetfrontRoof(x, top, w, spec);
    this.drawBuildingShapeTrim(x, top, w, spec);
    this.cutBuildingSilhouette(x, top, w, spec);

    g.lineStyle(5, spec.trim, 0.46);
    g.lineBetween(x + 12, top + 14, x + w - 20, top + 14);
    g.lineStyle(3, spec.accent, 0.38);
    g.lineBetween(x + 16, GROUND_Y - 34, x + w - 24, GROUND_Y - 34);

    let row = 0;
    for (let wy = top + 34; wy < GROUND_Y - 62; wy += 34) {
      let col = 0;
      for (let wx = x + 24; wx < x + w - 34; wx += 36) {
        const palette = [0xffd36b, 0x6ef7d2, 0xff5fbf, 0x8d5cff];
        const color = palette[(index * 3 + row + col * 2) % palette.length];
        const lit = (index + row * 2 + col) % 5 !== 1;
        const winW = spec.windows === 'thin' ? 8 : spec.windows === 'wide' ? 24 : 16;
        const winH = spec.windows === 'thin' ? 22 : spec.windows === 'wide' ? 10 : 14;
        g.fillStyle(lit ? color : 0x090719, lit ? 0.38 : 0.72);
        g.fillRect(wx, wy, winW, winH);
        if (lit) {
          g.fillStyle(0xffffff, 0.12);
          g.fillRect(wx + 3, wy + 2, Math.max(4, winW * 0.32), Math.max(6, winH - 4));
        }
        col++;
      }
      row++;
    }

    const shopW = w - 58;
    g.fillStyle(0x100821, 1);
    g.fillRoundedRect(x + 22, GROUND_Y - 82, shopW, 62, 8);
    g.lineStyle(4, spec.trim, 0.62);
    g.strokeRoundedRect(x + 22, GROUND_Y - 82, shopW, 62, 8);
    g.lineStyle(2, spec.accent, 0.6);
    for (let sx = x + 38; sx < x + w - 58; sx += 28) g.lineBetween(sx, GROUND_Y - 76, sx + 14, GROUND_Y - 28);

    g.fillStyle(spec.accent, 0.74);
    for (let bulb = x + 28; bulb < x + w - 26; bulb += 22) g.fillCircle(bulb, top + 16, 3.5);
    g.fillStyle(spec.trim, 0.32);
    for (let strip = top + 46; strip < GROUND_Y - 104; strip += 58) g.fillRect(x + w - 18, strip, 6, 34);
  }

  drawBuildingShape(x, top, w, spec) {
    const g = this.bg;
    const bottom = GROUND_Y + 10;
    g.fillStyle(0x070512, 0.98);
    g.fillRect(x, top, w, bottom - top);
    g.fillStyle(spec.face, 0.98);

    if (spec.shape === 'taper') {
      g.beginPath();
      const cut = spec.cut ?? 28;
      g.moveTo(x + cut, top + 12);
      g.lineTo(x + w - cut, top + 12);
      g.lineTo(x + w - 10, bottom);
      g.lineTo(x + 10, bottom);
      g.closePath();
      g.fillPath();
    } else if (spec.shape === 'dome') {
      const r = (w - 28) / 2;
      const baseY = top + 58;
      g.fillRect(x + 10, baseY, w - 24, bottom - baseY);
      g.fillCircle(x + w / 2, baseY, r);
      g.fillStyle(0x120820, 0.98);
      g.fillRect(x - 4, top, w + 8, baseY - r - top);
      g.fillRect(x - 4, baseY, 14, bottom - baseY);
      g.fillRect(x + w - 14, baseY, 18, bottom - baseY);
    } else if (spec.shape === 'stepped') {
      g.fillRect(x + 66, top + 12, w - 132, 52);
      g.fillRect(x + 38, top + 58, w - 76, 60);
      g.fillRect(x + 10, top + 112, w - 24, bottom - top - 112);
    } else if (spec.shape === 'skinnyStack') {
      g.fillRect(x + 48, top + 10, w - 96, 62);
      g.fillRect(x + 30, top + 66, w - 60, 78);
      g.fillRect(x + 10, top + 138, w - 24, bottom - top - 138);
    } else {
      g.fillRect(x + 10, top + 12, w - 24, bottom - top - 12);
    }

    g.fillStyle(0xffffff, 0.04);
    g.fillRect(x + 18, top + 18, Math.max(40, w * 0.32), bottom - top - 22);
  }

  drawBuildingShapeTrim(x, top, w, spec) {
    const g = this.bg;
    if (!spec.shape) return;
    g.lineStyle(3, spec.trim, 0.34);
    const bottom = GROUND_Y + 8;
    if (spec.shape === 'taper') {
      const cut = spec.cut ?? 28;
      g.lineBetween(x + cut, top + 14, x + 10, bottom);
      g.lineBetween(x + w - cut, top + 14, x + w - 10, bottom);
    } else if (spec.shape === 'dome') {
      g.strokeCircle(x + w / 2, top + 58, (w - 28) / 2);
    } else if (spec.shape === 'stepped') {
      g.lineBetween(x + 66, top + 14, x + w - 66, top + 14);
      g.lineBetween(x + 38, top + 58, x + w - 38, top + 58);
      g.lineBetween(x + 10, top + 112, x + w - 10, top + 112);
    } else if (spec.shape === 'skinnyStack') {
      g.strokeRect(x + 48, top + 10, w - 96, 62);
      g.strokeRect(x + 30, top + 66, w - 60, 78);
    }
  }

  cutBuildingSilhouette(x, top, w, spec) {
    if (!spec.shape) return;
    const g = this.bg;
    const bottom = GROUND_Y + 10;
    g.fillStyle(0x120820, 0.96);

    if (spec.shape === 'taper') {
      const cut = spec.cut ?? 28;
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x + cut - 2, top + 12);
      g.lineTo(x + 8, bottom);
      g.lineTo(x, bottom);
      g.closePath();
      g.fillPath();
      g.beginPath();
      g.moveTo(x + w, top);
      g.lineTo(x + w - cut + 2, top + 12);
      g.lineTo(x + w - 8, bottom);
      g.lineTo(x + w, bottom);
      g.closePath();
      g.fillPath();
    } else if (spec.shape === 'dome') {
      const baseY = top + 58;
      const r = (w - 28) / 2;
      g.fillRect(x - 4, top, w + 8, baseY - r - top);
      g.fillRect(x - 4, baseY, 14, bottom - baseY);
      g.fillRect(x + w - 14, baseY, 18, bottom - baseY);
    } else if (spec.shape === 'stepped') {
      g.fillRect(x - 2, top, 68, bottom - top);
      g.fillRect(x + w - 66, top, 68, bottom - top);
      g.fillRect(x + 10, top, 28, 112);
      g.fillRect(x + w - 38, top, 28, 112);
    } else if (spec.shape === 'skinnyStack') {
      g.fillRect(x - 2, top, 50, bottom - top);
      g.fillRect(x + w - 48, top, 50, bottom - top);
      g.fillRect(x + 10, top, 20, 138);
      g.fillRect(x + w - 30, top, 20, 138);
    }
  }

  drawStreetfrontRoof(x, top, w, spec) {
    const g = this.bg;
    g.fillStyle(0x05040e, 0.96);
    if (spec.roof === 'slant') {
      g.beginPath();
      g.moveTo(x + 6, top + 14);
      g.lineTo(x + 44, top - 18);
      g.lineTo(x + w - 18, top + 6);
      g.lineTo(x + w - 18, top + 20);
      g.lineTo(x + 6, top + 20);
      g.closePath();
      g.fillPath();
    } else {
      g.fillRect(x + 6, top - 10, w - 24, 22);
    }

    g.lineStyle(3, spec.trim, 0.36);
    g.lineBetween(x + 14, top + 2, x + w - 26, top + 2);

    if (spec.roof === 'antenna') {
      g.lineStyle(3, spec.accent, 0.45);
      g.lineBetween(x + w - 58, top - 10, x + w - 38, top - 52);
      g.lineBetween(x + w - 38, top - 52, x + w - 18, top - 18);
    } else if (spec.roof === 'pipes') {
      g.lineStyle(5, spec.accent, 0.35);
      g.lineBetween(x + 34, top - 10, x + 34, top - 34);
      g.lineBetween(x + 34, top - 34, x + 92, top - 34);
    } else if (spec.roof === 'stack') {
      g.fillStyle(0x120820, 0.96);
      g.fillRect(x + 36, top - 38, 34, 30);
      g.fillRect(x + 84, top - 28, 48, 20);
      g.lineStyle(2, spec.accent, 0.4);
      g.lineBetween(x + 42, top - 30, x + 62, top - 30);
      g.lineBetween(x + 92, top - 20, x + 122, top - 20);
    } else if (spec.roof === 'spire') {
      g.fillStyle(0x090719, 0.98);
      g.fillTriangle(x + w / 2 - 28, top - 8, x + w / 2, top - 64, x + w / 2 + 28, top - 8);
      g.lineStyle(3, spec.trim, 0.5);
      g.lineBetween(x + w / 2, top - 64, x + w / 2, top - 92);
    } else if (spec.roof === 'arcade') {
      g.lineStyle(6, spec.accent, 0.36);
      for (let ax = x + 24; ax < x + w - 40; ax += 44) g.strokeCircle(ax, top + 10, 18);
    } else if (spec.roof === 'billboardTop') {
      g.fillStyle(0x100821, 0.98);
      g.fillRoundedRect(x + 24, top - 42, w - 58, 32, 6);
      g.lineStyle(3, spec.trim, 0.58);
      g.strokeRoundedRect(x + 24, top - 42, w - 58, 32, 6);
      g.lineStyle(2, spec.accent, 0.42);
      g.lineBetween(x + 42, top - 10, x + 42, top + 8);
      g.lineBetween(x + w - 52, top - 10, x + w - 52, top + 8);
    } else if (spec.roof === 'vents') {
      g.fillStyle(0x0b0718, 0.98);
      for (let vx = x + 28; vx < x + w - 40; vx += 38) {
        g.fillRect(vx, top - 30, 22, 20);
        g.lineStyle(2, spec.accent, 0.36);
        g.lineBetween(vx + 4, top - 24, vx + 18, top - 24);
      }
    }
  }

  drawTokyoSigns(layer = 'front') {
    const signStripWidth = 5320;
    const offset = (this.tick * this.speed * (layer === 'back' ? 0.16 : 0.26)) % signStripWidth;
    for (const sign of this.tokyoSigns) {
      if ((sign.layer || 'front') !== layer) continue;
      let visibleX = null;
      const pulse = 0.72 + Math.sin(this.tick * 0.08 + sign.x) * 0.18;
      for (let repeat = -1; repeat <= 1; repeat++) {
        const x = sign.x + repeat * signStripWidth - offset;
        if (x + sign.w < -140 || x > W + 140) continue;
        this.drawSignBuilding(sign, x);
        this.drawSignFrame(sign, x, pulse);
        visibleX = x;
      }
      this.positionSignLabels(sign, visibleX, pulse, layer);
    }
  }

  drawSignBuilding(sign, x) {
    const g = this.bg;
    const buildingX = x - 26;
    const buildingW = sign.w + (sign.style === 'ramen' ? 72 : 52);
    const roofY = Math.max(78, sign.y - 64);
    const faceBottom = GROUND_Y + 8;

    g.fillStyle(0x0a0718, 0.98);
    g.fillRect(buildingX, roofY, buildingW, faceBottom - roofY);
    g.fillStyle(0x0a0716, 0.86);
    g.fillRect(buildingX + buildingW - 12, roofY + 8, 12, faceBottom - roofY - 8);
    g.fillStyle(0x261542, 0.96);
    g.fillRect(buildingX + 6, roofY + 8, buildingW - 24, faceBottom - roofY - 8);

    g.lineStyle(3, 0x6ef7d2, 0.2);
    g.lineBetween(buildingX + 8, roofY + 10, buildingX + buildingW - 18, roofY + 10);
    g.lineStyle(2, 0xff73d4, 0.18);
    g.lineBetween(buildingX + 10, faceBottom - 18, buildingX + buildingW - 20, faceBottom - 18);

    for (let wy = roofY + 22; wy < faceBottom - 24; wy += 24) {
      for (let wx = buildingX + 16; wx < buildingX + buildingW - 26; wx += 24) {
        const lit = ((Math.floor(sign.x + wx + wy)) % 5) !== 0;
        g.fillStyle(lit ? ((Math.floor(sign.x + wx + wy)) % 2 === 0 ? 0x6ef7d2 : 0xff73d4) : 0x090719, lit ? 0.42 : 0.7);
        g.fillRect(wx, wy, 9, 10);
      }
    }

    g.lineStyle(3, sign.color, 0.42);
    g.lineBetween(buildingX + 12, sign.y - 12, buildingX + buildingW - 16, sign.y - 12);
    g.lineStyle(2, sign.accent, 0.32);
    for (let y = roofY + 18; y < faceBottom - 16; y += 28) g.lineBetween(buildingX + 10, y, buildingX + buildingW - 18, y);

    const railY = sign.y + sign.h / 2;
    g.lineStyle(5, 0x090719, 0.9);
    g.lineBetween(buildingX + 8, railY - 18, x + 4, railY - 18);
    g.lineBetween(buildingX + 8, railY + 18, x + 4, railY + 18);
    g.lineStyle(2, 0xffffff, 0.25);
    g.lineBetween(buildingX + 8, railY - 18, x + 4, railY - 18);
    g.lineBetween(buildingX + 8, railY + 18, x + 4, railY + 18);
  }

  drawSignFrame(sign, x, pulse) {
    const g = this.bg;
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

  positionSignLabels(sign, x, pulse, layer = 'front') {
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

    const visible = x !== null;
    const labelDepth = layer === 'back' ? -1 : 1;
    sign.label.setDepth(labelDepth);
    sign.subLabel.setDepth(labelDepth);
    sign.label
      .setPosition((x ?? -999) + sign.w / 2, sign.y + sign.h * (sign.style === 'vertical' ? 0.42 : 0.48))
      .setAlpha(pulse)
      .setVisible(visible);
    sign.subLabel
      .setPosition((x ?? -999) + sign.w / 2, sign.y + sign.h * (sign.style === 'vertical' ? 0.7 : 0.76))
      .setAlpha(0.72 + pulse * 0.24)
      .setVisible(visible && Boolean(sign.subText));
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
