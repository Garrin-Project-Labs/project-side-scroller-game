<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Robot Battery Runner</title>
  <style>
    :root {
      color-scheme: dark;
      --panel: rgba(7, 15, 28, 0.78);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 20% 10%, rgba(100, 244, 255, 0.18), transparent 30%),
        radial-gradient(circle at 80% 0%, rgba(255, 217, 90, 0.13), transparent 28%),
        linear-gradient(180deg, #07101d 0%, #142640 48%, #09111f 100%);
      font-family: ui-rounded, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: white;
      overflow: hidden;
    }

    .shell {
      width: min(100vw, 1060px);
      padding: 18px;
    }

    .topbar {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 10px;
    }

    h1 {
      margin: 0;
      font-size: clamp(1.4rem, 3vw, 2.4rem);
      letter-spacing: 0.03em;
      text-shadow: 0 0 18px rgba(100, 244, 255, 0.35);
    }

    .hint {
      margin: 4px 0 0;
      color: #bfd6f3;
      font-size: 0.95rem;
    }

    .stats {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: end;
    }

    .stat {
      min-width: 104px;
      padding: 9px 12px;
      border: 1px solid rgba(100, 244, 255, 0.24);
      border-radius: 14px;
      background: var(--panel);
      box-shadow: 0 12px 34px rgba(0, 0, 0, 0.25);
      text-align: center;
    }

    .stat span {
      display: block;
      color: #9ab3d2;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }

    .stat strong {
      display: block;
      margin-top: 2px;
      font-size: 1.35rem;
      color: white;
    }

    #game-container canvas {
      width: 100%;
      aspect-ratio: 16 / 9;
      display: block;
      border: 2px solid rgba(100, 244, 255, 0.36);
      border-radius: 24px;
      background: #102039;
      box-shadow:
        0 24px 70px rgba(0, 0, 0, 0.48),
        inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    }

    .controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 10px;
      color: #c8ddf7;
      font-size: 0.95rem;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 10px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }

    kbd {
      padding: 2px 7px;
      border-radius: 7px;
      background: #edf6ff;
      color: #102039;
      font-weight: 800;
      box-shadow: 0 3px 0 #87a8cc;
    }

    @media (max-width: 740px) {
      .topbar, .controls { align-items: stretch; flex-direction: column; }
      .stats { justify-content: stretch; }
      .stat { flex: 1; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="topbar" aria-label="Game header">
      <div>
        <h1>🤖 Robot Battery Runner</h1>
        <p class="hint">Now powered by Phaser. Jump water pits, clear boxes, and collect batteries.</p>
      </div>
      <div class="stats" aria-label="Score board">
        <div class="stat"><span>Score</span><strong id="score">0</strong></div>
        <div class="stat"><span>Batteries</span><strong id="batteries">0</strong></div>
        <div class="stat"><span>Best</span><strong id="best">0</strong></div>
      </div>
    </section>

    <div id="game-container" aria-label="Robot Battery Runner game"></div>

    <section class="controls">
      <span class="pill"><kbd>Space</kbd> / <kbd>↑</kbd> / click or tap to jump</span>
      <span class="pill"><kbd>R</kbd> restart after a splash</span>
    </section>
  </main>

  <script src="https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js"></script>
  <script>
    const scoreEl = document.querySelector('#score');
    const batteriesEl = document.querySelector('#batteries');
    const bestEl = document.querySelector('#best');

    const W = 960;
    const H = 540;
    const groundY = 430;
    const gravity = 0.54;
    const jumpPower = -12.4;
    const maxJumpHeight = 168;
    const maxHeldJumpFrames = 60;
    const heldJumpGravityScale = 0.12;
    const obstacleGapPixels = 650;
    const batteryGapPixels = 1120;
    const waterWidths = [78, 96, 84, 116, 88];
    const boxHeights = [38, 46, 34];
    const boxSize = 44;
    const obstaclePattern = ['water', 'box', 'platform', 'stackedBox', 'water', 'box', 'water', 'platform'];

    class RunnerScene extends Phaser.Scene {
      constructor() {
        super('runner');
      }

      create() {
        this.best = Number(localStorage.getItem('robotBatteryRunnerBest') || 0);
        bestEl.textContent = this.best;

        this.keys = this.input.keyboard.addKeys({
          jump: Phaser.Input.Keyboard.KeyCodes.SPACE,
          up: Phaser.Input.Keyboard.KeyCodes.UP,
          restart: Phaser.Input.Keyboard.KeyCodes.R,
        });

        this.input.keyboard.on('keydown-SPACE', () => this.startJump());
        this.input.keyboard.on('keydown-UP', () => this.startJump());
        this.input.keyboard.on('keyup-SPACE', () => this.stopJump());
        this.input.keyboard.on('keyup-UP', () => this.stopJump());
        this.input.on('pointerdown', () => this.startJump());
        this.input.on('pointerup', () => this.stopJump());
        this.input.on('pointerupoutside', () => this.stopJump());

        this.makeTextures();
        this.buildWorld();
        this.resetRun();
      }

      makeTextures() {
        this.makeRobotTexture();
        this.makeBatteryTexture();
        this.makeBoxTexture('box', boxSize, boxSize, 1);
        this.makeBoxTexture('stackedBox', boxSize, boxSize * 2, 2);
        this.makePlatformTexture();
      }

      makeRobotTexture() {
        const g = this.add.graphics();
        g.fillStyle(0xb9d4e9, 1).fillRoundedRect(10, 20, 38, 42, 10);
        g.fillStyle(0xdff8ff, 1).fillRoundedRect(5, 0, 48, 34, 11);
        g.fillStyle(0x112033, 1).fillRoundedRect(13, 9, 32, 14, 7);
        g.fillStyle(0x64f4ff, 1).fillCircle(23, 16, 3.5).fillCircle(36, 16, 3.5);
        g.lineStyle(4, 0x64f4ff, 1).lineBetween(29, 0, 29, -11);
        g.fillStyle(0xffd95a, 1).fillCircle(29, -14, 5);
        g.lineStyle(8, 0xdff8ff, 1).lineBetween(18, 60, 14, 76).lineBetween(40, 60, 44, 76);
        g.lineStyle(8, 0x9fd8ff, 1).lineBetween(10, 32, 0, 46).lineBetween(48, 32, 58, 46);
        g.generateTexture('robot', 64, 94);
        g.destroy();
      }

      makeBatteryTexture() {
        const g = this.add.graphics();
        g.fillStyle(0x273142, 1).fillRoundedRect(0, 6, 34, 44, 7);
        g.fillStyle(0xffd95a, 1).fillRoundedRect(7, 13, 20, 30, 5);
        g.fillStyle(0x7dff8a, 1).fillRect(11, 20, 12, 8).fillRect(11, 32, 12, 8);
        g.fillStyle(0xe8f3ff, 1).fillRoundedRect(10, 0, 14, 8, 3);
        g.generateTexture('battery', 34, 50);
        g.destroy();
      }

      makeBoxTexture(key, width, height, count) {
        const g = this.add.graphics();
        const blockH = height / count;
        for (let i = 0; i < count; i++) {
          const y = i * blockH;
          g.fillGradientStyle(0xd9a04f, 0xd9a04f, 0x8a5328, 0x8a5328, 1);
          g.fillRoundedRect(0, y, width, blockH, 6);
          g.lineStyle(4, 0x5b351c, 1).strokeRoundedRect(2, y + 2, width - 4, blockH - 4, 5);
          g.lineStyle(3, 0xffffff, 0.26).lineBetween(10, y + 12, width - 10, y + blockH - 10).lineBetween(width - 10, y + 12, 10, y + blockH - 10);
        }
        g.generateTexture(key, width, height);
        g.destroy();
      }

      makePlatformTexture() {
        const g = this.add.graphics();
        const width = 220;
        const height = 62;
        g.fillStyle(0x17283f, 1);
        g.beginPath();
        g.moveTo(0, height);
        g.lineTo(0, 30);
        g.quadraticCurveTo(0, 8, 24, 8);
        g.lineTo(width - 24, 8);
        g.quadraticCurveTo(width, 8, width, 30);
        g.lineTo(width, height);
        g.closePath();
        g.fillPath();
        g.fillGradientStyle(0x68ffc7, 0x68ffc7, 0x2bdf9f, 0x2bdf9f, 1);
        g.beginPath();
        g.moveTo(0, 24);
        g.quadraticCurveTo(0, 0, 26, 0);
        g.lineTo(width - 26, 0);
        g.quadraticCurveTo(width, 0, width, 24);
        g.lineTo(width, 28);
        g.lineTo(0, 28);
        g.closePath();
        g.fillPath();
        g.generateTexture('platform', width, height);
        g.destroy();
      }

      buildWorld() {
        this.bg = this.add.graphics();
        this.ground = this.add.graphics();
        this.clouds = [
          { x: 90, y: 80, s: 0.45 },
          { x: 390, y: 60, s: 0.7 },
          { x: 735, y: 105, s: 0.55 },
        ];

        this.obstacles = [];
        this.pickups = [];
        this.sparks = [];

        this.robotSprite = this.add.image(128, groundY - 78, 'robot').setOrigin(0, 0);
        this.overlay = this.add.container(0, 0).setDepth(20);
        this.overlayBg = this.add.rectangle(W / 2, 70, 404, 76, 0x070f1c, 0.68).setStrokeStyle(1, 0x64f4ff, 0.22);
        this.overlayTitle = this.add.text(W / 2, 52, 'Collect batteries. Jump over water pits!', {
          fontFamily: 'ui-rounded, system-ui',
          fontSize: '24px',
          fontStyle: '700',
          color: '#ffffff',
        }).setOrigin(0.5);
        this.overlayHint = this.add.text(W / 2, 88, 'Space / ↑ / click = jump', {
          fontFamily: 'ui-rounded, system-ui',
          fontSize: '16px',
          color: '#bfd6f3',
        }).setOrigin(0.5);
        this.overlay.add([this.overlayBg, this.overlayTitle, this.overlayHint]);
      }

      resetRun() {
        this.clearDynamicObjects();
        this.clearGameOver();
        this.robot = {
          x: 128,
          y: groundY - 78,
          w: 58,
          h: 78,
          vy: 0,
          grounded: true,
          blink: 0,
        };
        this.speed = 1.28;
        this.score = 0;
        this.batteries = 0;
        this.gameOver = false;
        this.tick = 0;
        this.spawnTimer = Math.round(560 / this.speed);
        this.batteryTimer = Math.round(820 / this.speed);
        this.obstaclePatternIndex = 0;
        this.jumpHeld = false;
        this.heldJumpFrames = 0;
        this.updateHud();
        this.overlay.setVisible(true);
        this.robotSprite.setRotation(0).setPosition(this.robot.x, this.robot.y);
      }

      clearDynamicObjects() {
        for (const item of [...this.obstacles, ...this.pickups, ...this.sparks]) item.obj?.destroy();
        this.obstacles = [];
        this.pickups = [];
        this.sparks = [];
      }

      updateHud() {
        scoreEl.textContent = Math.floor(this.score);
        batteriesEl.textContent = this.batteries;
        bestEl.textContent = this.best;
      }

      startJump() {
        this.jumpHeld = true;
        if (this.gameOver) {
          this.resetRun();
          return;
        }
        if (!this.robot.grounded) return;
        this.robot.vy = jumpPower;
        this.robot.grounded = false;
        this.heldJumpFrames = maxHeldJumpFrames;
        this.addSparks(this.robot.x + 12, groundY - 8, 0x64f4ff, 8);
      }

      stopJump() {
        this.jumpHeld = false;
        this.heldJumpFrames = 0;
      }

      addSparks(x, y, color, count) {
        for (let i = 0; i < count; i++) {
          const obj = this.add.circle(x, y, 3.5, color, 1).setDepth(10);
          this.sparks.push({
            obj,
            x,
            y,
            vx: (Math.random() - 0.5) * 6,
            vy: -Math.random() * 5 - 1,
            life: 24 + Math.random() * 18,
          });
        }
      }

      spawnObstacle() {
        const kind = obstaclePattern[this.obstaclePatternIndex % obstaclePattern.length];
        this.obstaclePatternIndex++;
        let obstacle;
        if (kind === 'water') {
          const width = this.obstaclePatternIndex === 1 ? 48 : waterWidths[this.obstaclePatternIndex % waterWidths.length];
          obstacle = this.makeWaterPit(W + 30, groundY - 2, width, 54);
        } else if (kind === 'box') {
          const height = boxHeights[this.obstaclePatternIndex % boxHeights.length];
          obstacle = this.makeSpriteObstacle('box', W + 30, groundY - height, 48, height, 'box');
        } else if (kind === 'stackedBox') {
          const stackHeight = boxSize * 2;
          const platformNearby = this.obstacles.some(o => o.kind === 'platform' && o.x > W - 260);
          if (platformNearby || Math.random() < 0.45) {
            obstacle = this.makeSpriteObstacle('stackedBox', W + 30, groundY - stackHeight, boxSize, stackHeight, 'stackedBox');
          } else {
            obstacle = this.makeSpriteObstacle('box', W + 30, groundY - boxSize, boxSize, boxSize, 'box');
          }
        } else {
          obstacle = this.makeSpriteObstacle('platform', W + 30, groundY - 62, 220, 62, 'platform');
        }
        this.obstacles.push(obstacle);
        const patternOffset = this.obstaclePatternIndex % 3 === 0 ? 90 : 0;
        this.spawnTimer = Math.round((obstacleGapPixels + patternOffset) / this.speed);
      }

      makeSpriteObstacle(texture, x, y, w, h, kind) {
        const obj = this.add.image(x, y, texture).setOrigin(0, 0).setDepth(3);
        obj.displayWidth = w;
        obj.displayHeight = h;
        return { obj, x, y, w, h, kind };
      }

      makeWaterPit(x, y, w, h) {
        const obj = this.add.graphics().setDepth(2);
        this.drawWaterPit(obj, x, y, w, h, 0);
        return { obj, x, y, w, h, kind: 'water' };
      }

      spawnBattery() {
        const high = this.obstaclePatternIndex % 2 === 0;
        const y = high ? groundY - 168 : groundY - 112;
        const obj = this.add.image(W + 40, y, 'battery').setOrigin(0, 0).setDepth(4);
        this.pickups.push({ obj, x: W + 40, y, w: 34, h: 50, bob: Math.random() * 10, collected: false });
        this.batteryTimer = Math.round(batteryGapPixels / this.speed);
      }

      update() {
        if (this.keys.restart.isDown && this.gameOver) this.resetRun();
        this.tick++;
        this.drawBackground();

        if (!this.gameOver) {
          this.speed = Math.min(8.8, this.speed + 0.0005625 + this.tick * 0.00000001875);
          this.score += 0.09 * this.speed;
          this.spawnTimer--;
          this.batteryTimer--;
          if (this.spawnTimer <= 0) this.spawnObstacle();
          if (this.batteryTimer <= 0) this.spawnBattery();
        }

        this.updateRobot();
        this.updateScrollingObjects();
        this.checkCollisions();
        this.updateHud();
        this.overlay.setVisible(!this.gameOver && this.tick < 210);
      }

      updateRobot() {
        const previousY = this.robot.y;
        const extendingJump = !this.robot.grounded && this.jumpHeld && this.heldJumpFrames > 0;
        if (extendingJump) this.heldJumpFrames--;

        const jumpGravity = extendingJump ? gravity * heldJumpGravityScale : gravity;
        this.robot.vy += jumpGravity;
        this.robot.y += this.robot.vy;

        const highestJumpY = groundY - this.robot.h - maxJumpHeight;
        if (this.robot.y < highestJumpY) {
          this.robot.y = highestJumpY;
          this.robot.vy = Math.max(0, this.robot.vy);
        }

        let landedOnSurface = false;
        for (const obstacle of this.obstacles) {
          if (obstacle.kind !== 'platform') continue;
          const wasAbove = previousY + this.robot.h <= obstacle.y + 8;
          const overlapsX = this.robot.x + this.robot.w - 8 > obstacle.x && this.robot.x + 8 < obstacle.x + obstacle.w;
          if (this.robot.vy >= 0 && wasAbove && overlapsX && this.robot.y + this.robot.h >= obstacle.y) {
            this.robot.y = obstacle.y - this.robot.h;
            this.robot.vy = 0;
            this.robot.grounded = true;
            landedOnSurface = true;
            break;
          }
        }

        if (!landedOnSurface && this.robot.y >= groundY - this.robot.h) {
          this.robot.y = groundY - this.robot.h;
          this.robot.vy = 0;
          this.robot.grounded = true;
          landedOnSurface = true;
        }
        if (!landedOnSurface) this.robot.grounded = false;

        this.robot.blink = (this.robot.blink + 1) % 120;
        this.robotSprite.setPosition(this.robot.x, this.robot.y);
        this.robotSprite.setRotation(this.gameOver ? Math.sin(this.tick * 0.28) * 0.08 : 0);
      }

      updateScrollingObjects() {
        for (const cloud of this.clouds) {
          cloud.x -= this.speed * 0.09 * cloud.s;
          if (cloud.x < -130) cloud.x = W + 120;
        }

        for (const obstacle of this.obstacles) {
          obstacle.x -= this.gameOver ? this.speed * 0.2 : this.speed;
          if (obstacle.kind === 'water') this.drawWaterPit(obstacle.obj, obstacle.x, obstacle.y, obstacle.w, obstacle.h, this.tick);
          else obstacle.obj.setPosition(obstacle.x, obstacle.y);
        }

        for (const battery of this.pickups) {
          battery.x -= this.gameOver ? this.speed * 0.2 : this.speed;
          battery.bob += 0.08;
          battery.obj.setPosition(battery.x, battery.y + Math.sin(battery.bob) * 8);
        }

        for (const spark of this.sparks) {
          spark.x += spark.vx;
          spark.y += spark.vy;
          spark.vy += 0.25;
          spark.life--;
          spark.obj.setPosition(spark.x, spark.y).setAlpha(Math.max(0, spark.life / 36));
        }

        this.obstacles = this.obstacles.filter(o => {
          if (o.x + o.w > -40) return true;
          o.obj.destroy();
          return false;
        });
        this.pickups = this.pickups.filter(p => {
          if (p.x + p.w > -40 && !p.collected) return true;
          p.obj.destroy();
          return false;
        });
        this.sparks = this.sparks.filter(s => {
          if (s.life > 0) return true;
          s.obj.destroy();
          return false;
        });
      }

      checkCollisions() {
        if (this.gameOver) return;
        const hit = this.robotHitbox();
        for (const water of this.obstacles.filter(o => o.kind === 'water')) {
          const danger = { x: water.x + 5, y: water.y - 5, w: water.w - 10, h: water.h + 10 };
          if (this.rectsOverlap(hit, danger)) this.splash();
        }
        for (const box of this.obstacles.filter(o => o.kind === 'box' || o.kind === 'stackedBox')) {
          const danger = { x: box.x + 4, y: box.y + 4, w: box.w - 8, h: box.h - 4 };
          if (this.rectsOverlap(hit, danger)) this.splash();
        }
        for (const battery of this.pickups) {
          const bobY = battery.y + Math.sin(battery.bob) * 8;
          if (this.rectsOverlap(hit, { ...battery, y: bobY })) {
            battery.collected = true;
            this.batteries++;
            this.score += 60;
            this.addSparks(battery.x + battery.w / 2, bobY + battery.h / 2, 0xffd95a, 16);
          }
        }
      }

      splash() {
        if (this.gameOver) return;
        this.gameOver = true;
        this.best = Math.max(this.best, Math.floor(this.score));
        localStorage.setItem('robotBatteryRunnerBest', String(this.best));
        this.updateHud();
        this.addSparks(this.robot.x + this.robot.w / 2, groundY - 4, 0x6aa8ff, 34);
        this.showGameOver();
      }

      showGameOver() {
        const blocker = this.add.rectangle(W / 2, H / 2, W, H, 0x050a12, 0.72).setDepth(30);
        const title = this.add.text(W / 2, 205, 'SPLASH!', { fontFamily: 'ui-rounded, system-ui', fontSize: '58px', fontStyle: '900', color: '#ff6b8a' }).setOrigin(0.5).setDepth(31);
        const score = this.add.text(W / 2, 252, `Score ${Math.floor(this.score)} • Batteries ${this.batteries}`, { fontFamily: 'ui-rounded, system-ui', fontSize: '28px', fontStyle: '800', color: '#ffffff' }).setOrigin(0.5).setDepth(31);
        const hint = this.add.text(W / 2, 294, 'Press Space, ↑, click, or R to run again', { fontFamily: 'ui-rounded, system-ui', fontSize: '20px', color: '#bfd6f3' }).setOrigin(0.5).setDepth(31);
        this.gameOverObjects = [blocker, title, score, hint];
      }

      clearGameOver() {
        for (const item of this.gameOverObjects ?? []) item.destroy();
        this.gameOverObjects = [];
      }

      drawBackground() {
        this.bg.clear();
        this.bg.fillGradientStyle(0x17375e, 0x17375e, 0x244b74, 0x102039, 1);
        this.bg.fillRect(0, 0, W, H);

        this.bg.fillStyle(0xffffff, 0.12);
        for (const cloud of this.clouds) this.drawCloud(this.bg, cloud.x, cloud.y, cloud.s);

        this.bg.fillStyle(0x1c3558, 1);
        for (let x = -80 + ((this.tick * this.speed * 0.28) % 160); x < W + 200; x += 160) {
          this.bg.fillRect(x, 266, 70, 164);
          this.bg.fillRect(x + 20, 230, 32, 36);
        }

        this.ground.clear();
        this.ground.fillStyle(0x17283f, 1).fillRect(0, groundY, W, H - groundY);
        this.ground.fillStyle(0x2bdf9f, 1).fillRect(0, groundY, W, 12);
        this.ground.fillStyle(0xffffff, 0.12);
        for (let x = -80 + ((this.tick * this.speed) % 80); x < W + 80; x += 80) {
          this.ground.fillRect(x, groundY + 18, 38, 6);
        }
      }

      drawCloud(g, x, y, s) {
        g.fillCircle(x, y + 18, 28 * s);
        g.fillCircle(x + 35 * s, y + 8, 38 * s);
        g.fillCircle(x + 82 * s, y + 20, 26 * s);
      }

      drawWaterPit(g, x, y, w, h, tick) {
        g.clear();
        g.fillStyle(0x07101d, 1);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + w, y);
        g.lineTo(x + w - 12, y + h);
        g.lineTo(x + 12, y + h);
        g.closePath();
        g.fillPath();

        g.fillGradientStyle(0x83f5ff, 0x83f5ff, 0x174dc8, 0x174dc8, 1);
        g.beginPath();
        g.moveTo(x + 10, y + 16);
        g.lineTo(x + w - 10, y + 16);
        g.lineTo(x + w - 20, y + h - 6);
        g.lineTo(x + 20, y + h - 6);
        g.closePath();
        g.fillPath();

        g.lineStyle(4, 0xdcffff, 0.9);
        g.beginPath();
        for (let waveX = 14; waveX < w - 20; waveX += 18) {
          const startY = y + 14 + Math.sin((tick + waveX) * 0.12) * 3;
          const endY = y + 14 + Math.sin((tick + waveX + 16) * 0.12) * 3;
          g.moveTo(x + waveX, startY);
          g.quadraticCurveTo(x + waveX + 8, y + 8, x + waveX + 16, endY);
        }
        g.strokePath();

        g.lineStyle(6, 0x2bdf9f, 1);
        g.beginPath();
        g.moveTo(x - 4, y + 1);
        g.lineTo(x + 10, y + 1);
        g.moveTo(x + w - 10, y + 1);
        g.lineTo(x + w + 4, y + 1);
        g.strokePath();
      }

      robotHitbox() {
        return { x: this.robot.x + 10, y: this.robot.y + 8, w: this.robot.w - 20, h: this.robot.h - 8 };
      }

      rectsOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      }
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-container',
      width: W,
      height: H,
      backgroundColor: '#102039',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: RunnerScene,
    });
  </script>
</body>
</html>
