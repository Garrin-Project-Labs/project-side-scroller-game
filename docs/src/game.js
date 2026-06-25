import { RunnerAssets } from './assets.js';
import { groundLanding, hitsHazard, hitsPickup, pickupHitbox, platformLanding, robotHitbox } from './collision-rules.js';
import { createObstaclePatternState, nextObstacleSpawnDelay, nextObstacleSpec } from './obstacle-pattern.js';
import { RunnerSpriteAdapter } from './runner-sprite-adapter.js';
import { GameConfig } from './runner-tuning.js';
import { TokyoSigns } from './tokyo-signs.js';
import { TokyoStreetfronts } from './tokyo-streetfronts.js';

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
const BATTERY_GAP_PIXELS = GameConfig.batteryGapPixels;
const MILESTONE_SCORE_STEP = GameConfig.milestoneScoreStep;
const DISTRICT_PALETTES = GameConfig.districtPalettes;

// RobotBatteryRunnerScene owns the Runner World. Rendering is intentionally immediate-mode
// Phaser Graphics for now: simple data objects are easier to tune than converted DOM/canvas code.
class RobotBatteryRunnerScene extends Phaser.Scene {
  constructor() {
    super('runner');
  }

  preload() {
    for (const asset of RunnerAssets) this.load.svg(asset.key, asset.path, asset.svg);
  }

  create() {
    this.best = Number(localStorage.getItem('robotBatteryRunnerBest') || 0);
    this.keys = this.input.keyboard.addKeys('SPACE,UP,DOWN,SHIFT,W,S,R');
    this.input.keyboard.on('keydown-SPACE', () => this.startJump());
    this.input.keyboard.on('keydown-UP', () => this.startJump());
    this.input.keyboard.on('keydown-W', () => this.startJump());
    this.input.keyboard.on('keyup-SPACE', () => this.stopJump());
    this.input.keyboard.on('keyup-UP', () => this.stopJump());
    this.input.keyboard.on('keyup-W', () => this.stopJump());
    this.input.keyboard.on('keydown-DOWN', () => this.startSlide());
    this.input.keyboard.on('keydown-SHIFT', () => this.startSlide());
    this.input.keyboard.on('keydown-S', () => this.startSlide());
    this.input.on('pointerdown', () => this.startJump());
    this.input.on('pointerup', () => this.stopJump());
    this.input.on('pointerupoutside', () => this.stopJump());

    this.bg = this.add.graphics();
    this.world = this.add.graphics();
    this.effects = this.add.graphics();
    this.hud = this.add.graphics();
    this.spriteAdapter = new RunnerSpriteAdapter(this);
    this.robotSprite = this.add.image(ROBOT_X, GROUND_Y - ROBOT_H, 'robot').setOrigin(0, 0).setDisplaySize(ROBOT_W, ROBOT_H).setDepth(8);
    this.hudText = this.add.text(18, 16, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '22px',
      color: '#ffffff',
      stroke: '#07101d',
      strokeThickness: 4
    }).setDepth(20);
    this.helpText = this.add.text(W / 2, 58, 'Neon Tokyo sprint: jump gaps, slide under laser gates!', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '24px',
      color: '#ffffff',
      stroke: '#07101d',
      strokeThickness: 5
    }).setOrigin(0.5).setDepth(20);
    this.subHelpText = this.add.text(W / 2, 92, 'Space / ↑ / W / click = jump   •   Down / Shift / S = slide', {
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
    this.milestoneText = this.add.text(W / 2, 142, '', {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '34px',
      color: '#9effff',
      align: 'center',
      stroke: '#07101d',
      strokeThickness: 7
    }).setOrigin(0.5).setDepth(25);

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
      blink: 0,
      sliding: false,
      slideFrames: 0
    };
    this.speed = GameConfig.startSpeed;
    this.score = 0;
    this.batteries = 0;
    this.district = 0;
    this.lastMilestone = 0;
    this.milestoneFlash = 0;
    this.tick = 0;
    this.gameOver = false;
    this.jumpHeld = false;
    this.heldJumpFrames = 0;
    this.spawnTimer = Math.round(560 / this.speed);
    this.batteryTimer = Math.round(820 / this.speed);
    this.obstaclePattern = createObstaclePatternState();
    this.nextRunnerObjectId = 1;
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
    this.tokyoSigns = TokyoSigns.map(sign => ({ ...sign }));
    this.gameOverText.setText('');
    this.restartText.setText('');
    this.milestoneText.setText('');
    this.robotSprite.setPosition(this.robot.x, this.robot.y).setRotation(0);
  }

  clearDynamicObjects() {
    this.spriteAdapter?.destroyAll();
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

  startSlide() {
    if (this.gameOver || !this.robot.grounded || this.robot.sliding) return;
    this.robot.sliding = true;
    this.robot.slideFrames = 62;
    this.addSparks(this.robot.x + 8, GROUND_Y - 6, 0x1ca7ff, 10);
  }

  // Main loop order: tune speed/spawns, move the Runner World, resolve hazards, then draw.
  update() {
    if (this.gameOver && Phaser.Input.Keyboard.JustDown(this.keys.R)) this.resetRun();
    this.tick++;

    if (!this.gameOver) {
      this.speed = Math.min(GameConfig.maxSpeed, this.speed + GameConfig.baseSpeedRamp + this.tick * GameConfig.timeSpeedRamp);
      this.score += 0.09 * this.speed;
      this.checkMilestone();
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

  checkMilestone() {
    const milestone = Math.floor(this.score / MILESTONE_SCORE_STEP);
    if (milestone <= this.lastMilestone) return;
    this.lastMilestone = milestone;
    this.district = milestone % DISTRICT_PALETTES.length;
    this.milestoneFlash = 150;
    this.milestoneText.setText(`${DISTRICT_PALETTES[this.district].name} // ${milestone * MILESTONE_SCORE_STEP}`);
    this.addSparks(W / 2, 120, DISTRICT_PALETTES[this.district].moon, 28);
  }

  updateRobot() {
    const previousY = this.robot.y;
    const extendingJump = !this.robot.grounded && this.jumpHeld && this.heldJumpFrames > 0;
    if (extendingJump) this.heldJumpFrames--;

    if (this.robot.sliding) {
      this.robot.slideFrames--;
      if (this.robot.slideFrames <= 0) this.robot.sliding = false;
    }

    this.robot.vy += extendingJump ? GRAVITY * HELD_JUMP_GRAVITY_SCALE : GRAVITY;
    this.robot.y += this.robot.vy;

    const highestJumpY = GROUND_Y - this.robot.h - MAX_JUMP_HEIGHT;
    if (this.robot.y < highestJumpY) {
      this.robot.y = highestJumpY;
      this.robot.vy = Math.max(0, this.robot.vy);
    }

    let landing = null;
    for (const o of this.obstacles) {
      landing = platformLanding({ robot: this.robot, previousY, platform: o });
      if (landing) break;
    }

    landing ??= groundLanding(this.robot, GameConfig);
    if (landing) {
      this.robot.y = landing.y;
      this.robot.vy = landing.vy;
      this.robot.grounded = landing.grounded;
    } else {
      this.robot.grounded = false;
    }
    this.robot.blink = (this.robot.blink + 1) % 120;
  }

  // Obstacle Pattern seam: change the pattern/timing here without touching collision or drawing.
  spawnNextObstacle() {
    const obstacle = nextObstacleSpec({
      patternState: this.obstaclePattern,
      tuning: GameConfig,
      worldWidth: W,
      groundY: GROUND_Y,
      currentObstacles: this.obstacles,
    });
    this.obstacles.push(this.addRunnerObject(obstacle));
    this.spawnTimer = nextObstacleSpawnDelay({ patternState: this.obstaclePattern, tuning: GameConfig, speed: this.speed });
  }

  addRunnerObject(object) {
    const runnerObject = { id: this.nextRunnerObjectId++, ...object };
    this.spriteAdapter.addObstacle(runnerObject);
    return runnerObject;
  }

  spawnNextBattery() {
    const high = this.obstaclePattern.index % 2 === 0;
    const x = W + 40;
    const y = high ? GROUND_Y - 168 : GROUND_Y - 112;
    const pickup = { id: this.nextRunnerObjectId++, x, y, w: 34, h: 50, bob: Math.random() * 10, collected: false };
    this.pickups.push(pickup);
    this.spriteAdapter.addPickup(pickup);
    this.batteryTimer = Math.round(BATTERY_GAP_PIXELS / this.speed);
  }

  advanceRunnerWorld() {
    for (const c of this.clouds) {
      c.x -= this.speed * 0.09 * c.s;
      if (c.x < -130) c.x = W + 120;
    }
    for (const o of this.obstacles) {
      o.x -= this.gameOver ? this.speed * 0.2 : this.speed;
      this.spriteAdapter.updateObstacle(o);
    }
    for (const p of this.pickups) {
      p.x -= this.gameOver ? this.speed * 0.2 : this.speed;
      p.bob += 0.08;
      this.spriteAdapter.updatePickup(p);
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
      this.spriteAdapter.destroyObject(o);
      return false;
    });
    this.pickups = this.pickups.filter(p => {
      if (p.x + p.w > -40 && !p.collected) return true;
      this.spriteAdapter.destroyObject(p);
      return false;
    });
    this.sparks = this.sparks.filter(s => s.life > 0);
  }

  // Collision seam: hazards end the run, pickups reward score, platforms are handled in updateRobot.
  handleRunnerCollisions() {
    if (this.gameOver) return;
    const hit = robotHitbox(this.robot, GameConfig);
    for (const o of this.obstacles) {
      if (hitsHazard(hit, o)) this.endRunWithSplash();
    }
    for (const p of this.pickups) {
      const pickupBox = pickupHitbox(p);
      if (hitsPickup(hit, p)) {
        p.collected = true;
        this.spriteAdapter.destroyObject(p);
        this.batteries++;
        this.score += 60;
        this.addSparks(p.x + p.w / 2, pickupBox.y + p.h / 2, 0xffd95a, 16);
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
    const palette = DISTRICT_PALETTES[this.district % DISTRICT_PALETTES.length];
    this.bg.fillGradientStyle(palette.top, palette.top, palette.mid, palette.bottom, 1);
    this.bg.fillRect(0, 0, W, H);

    this.bg.fillStyle(palette.moon, 0.9);
    this.bg.fillCircle(818, 72, 36);
    this.bg.fillStyle(palette.glow, 0.18);
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
    const fronts = TokyoStreetfronts;
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
    g.fillStyle(0xff4fc3, 0.85);
    g.fillRect(0, GROUND_Y, W, 3);

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
    if (this.robot.sliding) {
      this.robotSprite
        .setPosition(this.robot.x + 6, GROUND_Y - 24)
        .setDisplaySize(ROBOT_H * 0.9, ROBOT_W * 0.7)
        .setRotation(-0.18)
        .setAlpha(this.gameOver ? 0.88 : 1);
      return;
    }
    this.robotSprite
      .setPosition(this.robot.x, this.robot.y)
      .setDisplaySize(ROBOT_W, ROBOT_H)
      .setRotation(wobble)
      .setAlpha(this.gameOver ? 0.88 : 1);
  }

  drawObstacle(o) {
    if (o.kind === 'trench') return this.drawTrench(o);
    if (o.kind === 'slideBarrier') return this.drawSlideBarrier(o);
  }

  drawSlideBarrier(o) {
    const g = this.world;
    const left = o.x + 5;
    const right = o.x + o.w - 5;
    const top = o.y + 2;
    const bottom = o.y + o.h;
    const pulse = 0.82 + Math.sin(this.tick * 0.18 + o.x * 0.03) * 0.14;
    const rungs = [top + 22, top + 54, top + 86, bottom - 18];

    g.fillStyle(0xff5fbf, 0.1 * pulse);
    g.fillRoundedRect(left - 16, top - 8, right - left + 32, bottom - top + 18, 12);

    g.fillStyle(0x080613, 0.96);
    g.fillRoundedRect(left - 7, top, 14, bottom - top + 6, 5);
    g.fillRoundedRect(right - 7, top, 14, bottom - top + 6, 5);

    g.lineStyle(4, 0xff5fbf, 0.95);
    g.lineBetween(left, top + 4, left, bottom);
    g.lineBetween(right, top + 4, right, bottom);
    g.lineStyle(2, 0x9effff, 0.95);
    g.lineBetween(left + 2, top + 8, left + 2, bottom - 4);
    g.lineBetween(right - 2, top + 8, right - 2, bottom - 4);

    for (const y of rungs) {
      g.lineStyle(9, 0xff5fbf, 0.16 * pulse);
      g.lineBetween(left + 7, y, right - 7, y);
      g.lineStyle(4, 0xff5fbf, 0.9 * pulse);
      g.lineBetween(left + 8, y, right - 8, y);
      g.lineStyle(2, 0x9effff, 1);
      g.lineBetween(left + 10, y - 1, right - 10, y - 1);
      g.fillStyle(0xffd36b, 0.95);
      g.fillCircle(left, y, 3.5);
      g.fillCircle(right, y, 3.5);
    }

    g.lineStyle(2, 0xffd36b, 0.65);
    g.strokeRoundedRect(left - 7, top, 14, 12, 4);
    g.strokeRoundedRect(right - 7, top, 14, 12, 4);
    g.strokeRoundedRect(left - 7, bottom - 6, 14, 12, 4);
    g.strokeRoundedRect(right - 7, bottom - 6, 14, 12, 4);
  }

  drawTrench(o) {
    const g = this.world;
    const top = GROUND_Y + 2;
    const bottom = GROUND_Y + 50;

    g.fillStyle(0x03050c, 1);
    g.fillRect(o.x, top, o.w, bottom - top);
    g.fillGradientStyle(0x070811, 0x070811, 0x31114a, 0x31114a, 1);
    g.fillRect(o.x + 8, top + 8, o.w - 16, bottom - top - 12);

    g.lineStyle(5, 0xffd36b, 0.95);
    g.lineBetween(o.x - 6, top, o.x + 18, top);
    g.lineBetween(o.x + o.w - 18, top, o.x + o.w + 6, top);
    g.lineStyle(3, 0x6ef7d2, 0.85);
    g.lineBetween(o.x + 10, top + 9, o.x + o.w - 10, top + 9);

    g.lineStyle(4, 0xff5fbf, 0.78);
    for (let x = 18; x < o.w - 18; x += 24) {
      g.lineBetween(o.x + x, top + 15, o.x + x - 8, bottom - 8);
    }
    g.fillStyle(0xff5fbf, 0.16);
    g.fillRect(o.x + 8, top + 12, o.w - 16, 18);
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
    if (this.milestoneFlash > 0) {
      this.milestoneFlash--;
      const alpha = Math.min(1, this.milestoneFlash / 45);
      this.milestoneText.setAlpha(alpha).setVisible(true);
      this.hud.fillStyle(DISTRICT_PALETTES[this.district].glow, 0.08 * alpha);
      this.hud.fillRect(0, 0, W, H);
    } else {
      this.milestoneText.setVisible(false);
    }
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
