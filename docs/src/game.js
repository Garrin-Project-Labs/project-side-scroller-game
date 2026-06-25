import { RunnerAssets } from './assets.js';
import { BestScoreStorage } from './best-score-storage.js';
import { groundLanding, hitsHazard, hitsPickup, pickupHitbox, platformLanding, robotHitbox } from './collision-rules.js';
import { createObstaclePatternState, nextObstacleSpawnDelay, nextObstacleSpec } from './obstacle-pattern.js';
import { RunnerInput } from './runner-input.js';
import { RunnerRenderer } from './runner-renderer.js';
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
    this.bestScoreStorage = new BestScoreStorage(localStorage);
    this.best = this.bestScoreStorage.load();
    this.runnerInput = new RunnerInput(this, {
      startJump: () => this.startJump(),
      stopJump: () => this.stopJump(),
      startSlide: () => this.startSlide(),
    });
    this.runnerInput.bind();

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
    this.renderer = new RunnerRenderer({
      scene: this,
      tuning: GameConfig,
      graphs: { bg: this.bg, world: this.world, effects: this.effects, hud: this.hud },
      texts: {
        hudText: this.hudText,
        helpText: this.helpText,
        subHelpText: this.subHelpText,
        milestoneText: this.milestoneText,
      },
      robotSprite: this.robotSprite,
      signs: this.tokyoSigns ?? [],
      streetfronts: TokyoStreetfronts,
    });

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
    this.renderer.signs = this.tokyoSigns;
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
    if (this.gameOver && this.runnerInput.restartPressed(Phaser.Input.Keyboard)) this.resetRun();
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
    this.bestScoreStorage.save(this.best);
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
    if (this.milestoneFlash > 0) this.milestoneFlash--;
    this.renderer.draw({
      robot: this.robot,
      obstacles: this.obstacles,
      sparks: this.sparks,
      tick: this.tick,
      speed: this.speed,
      district: this.district,
      gameOver: this.gameOver,
      score: this.score,
      batteries: this.batteries,
      best: this.best,
      milestoneFlash: this.milestoneFlash,
    });
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
