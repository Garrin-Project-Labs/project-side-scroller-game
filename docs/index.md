<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Robot Battery Runner</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #09111f;
      --panel: rgba(7, 15, 28, 0.78);
      --cyan: #64f4ff;
      --yellow: #ffd95a;
      --green: #7dff8a;
      --red: #ff6b8a;
      --blue: #6aa8ff;
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

    canvas {
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
        <p class="hint">Jump the water, grab batteries, and keep your robot charged.</p>
      </div>
      <div class="stats" aria-label="Score board">
        <div class="stat"><span>Score</span><strong id="score">0</strong></div>
        <div class="stat"><span>Batteries</span><strong id="batteries">0</strong></div>
        <div class="stat"><span>Best</span><strong id="best">0</strong></div>
      </div>
    </section>

    <canvas id="game" width="960" height="540" aria-label="Robot Battery Runner game"></canvas>

    <section class="controls">
      <span class="pill"><kbd>Space</kbd> / <kbd>↑</kbd> / click to jump</span>
      <span class="pill"><kbd>R</kbd> restart after a splash</span>
    </section>
  </main>

  <script>
    const canvas = document.querySelector('#game');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.querySelector('#score');
    const batteriesEl = document.querySelector('#batteries');
    const bestEl = document.querySelector('#best');

    const W = canvas.width;
    const H = canvas.height;
    const groundY = 430;
    const gravity = 0.54;
    const jumpPower = -12.4;
    const maxJumpHeight = 168;
    const maxHeldJumpFrames = 60;
    const heldJumpGravityScale = 0.12;

    let best = Number(localStorage.getItem('robotBatteryRunnerBest') || 0);
    bestEl.textContent = best;

    const robot = {
      x: 128,
      y: groundY - 78,
      w: 58,
      h: 78,
      vy: 0,
      grounded: true,
      blink: 0,
    };

    let speed;
    let score;
    let batteries;
    let gameOver;
    let tick;
    let spawnTimer;
    let batteryTimer;
    let obstacles;
    let pickups;
    let clouds;
    let sparks;
    let jumpHeld;
    let heldJumpFrames;

    function reset() {
      robot.y = groundY - robot.h;
      robot.vy = 0;
      robot.grounded = true;
      robot.blink = 0;
      speed = 2.55;
      score = 0;
      batteries = 0;
      gameOver = false;
      tick = 0;
      spawnTimer = 75;
      batteryTimer = 45;
      obstacles = [];
      pickups = [];
      sparks = [];
      jumpHeld = false;
      heldJumpFrames = 0;
      clouds = [
        { x: 90, y: 80, s: 0.45 },
        { x: 390, y: 60, s: 0.7 },
        { x: 735, y: 105, s: 0.55 },
      ];
      updateHud();
    }

    function updateHud() {
      scoreEl.textContent = Math.floor(score);
      batteriesEl.textContent = batteries;
      bestEl.textContent = best;
    }

    function startJump() {
      jumpHeld = true;
      if (gameOver) {
        reset();
        return;
      }
      if (!robot.grounded) return;
      robot.vy = jumpPower;
      robot.grounded = false;
      heldJumpFrames = maxHeldJumpFrames;
      addSparks(robot.x + 12, groundY - 8, '#64f4ff', 8);
    }

    function stopJump() {
      jumpHeld = false;
      heldJumpFrames = 0;
    }

    function addSparks(x, y, color, count = 10) {
      for (let i = 0; i < count; i++) {
        sparks.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 6,
          vy: -Math.random() * 5 - 1,
          life: 24 + Math.random() * 18,
          color,
        });
      }
    }

    function spawnWater() {
      const width = 70 + Math.random() * 70;
      obstacles.push({ x: W + 30, y: groundY - 4, w: width, h: 26, kind: 'water' });
      spawnTimer = Math.max(66, 126 - speed * 5 + Math.random() * 66);
    }

    function spawnBattery() {
      const high = Math.random() > 0.5;
      pickups.push({ x: W + 40, y: high ? groundY - 168 : groundY - 112, w: 34, h: 50, bob: Math.random() * 10 });
      batteryTimer = 70 + Math.random() * 90;
    }

    function rectsOverlap(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function robotHitbox() {
      return { x: robot.x + 10, y: robot.y + 8, w: robot.w - 20, h: robot.h - 8 };
    }

    function splash() {
      if (gameOver) return;
      gameOver = true;
      best = Math.max(best, Math.floor(score));
      localStorage.setItem('robotBatteryRunnerBest', String(best));
      updateHud();
      addSparks(robot.x + robot.w / 2, groundY - 4, '#6aa8ff', 34);
    }

    function update() {
      tick++;
      if (!gameOver) {
        speed = Math.min(8.8, speed + 0.00075 + tick * 0.000000025);
        score += 0.09 * speed;
        spawnTimer--;
        batteryTimer--;
        if (spawnTimer <= 0) spawnWater();
        if (batteryTimer <= 0) spawnBattery();
      }

      const extendingJump = !robot.grounded && jumpHeld && heldJumpFrames > 0;
      if (extendingJump) heldJumpFrames--;

      const jumpGravity = extendingJump ? gravity * heldJumpGravityScale : gravity;
      robot.vy += jumpGravity;
      robot.y += robot.vy;

      const highestJumpY = groundY - robot.h - maxJumpHeight;
      if (robot.y < highestJumpY) {
        robot.y = highestJumpY;
        robot.vy = Math.max(0, robot.vy);
      }
      if (robot.y >= groundY - robot.h) {
        robot.y = groundY - robot.h;
        robot.vy = 0;
        robot.grounded = true;
      }
      robot.blink = (robot.blink + 1) % 120;

      clouds.forEach(cloud => {
        cloud.x -= speed * 0.09 * cloud.s;
        if (cloud.x < -130) cloud.x = W + 120;
      });

      obstacles.forEach(o => o.x -= gameOver ? speed * 0.2 : speed);
      pickups.forEach(p => {
        p.x -= gameOver ? speed * 0.2 : speed;
        p.bob += 0.08;
      });

      obstacles = obstacles.filter(o => o.x + o.w > -40);
      pickups = pickups.filter(p => p.x + p.w > -40 && !p.collected);

      sparks.forEach(s => {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.25;
        s.life--;
      });
      sparks = sparks.filter(s => s.life > 0);

      if (!gameOver) {
        const hit = robotHitbox();
        for (const water of obstacles) {
          const danger = { x: water.x + 5, y: water.y - 5, w: water.w - 10, h: water.h + 10 };
          if (rectsOverlap(hit, danger)) splash();
        }
        for (const battery of pickups) {
          const bobY = battery.y + Math.sin(battery.bob) * 8;
          if (rectsOverlap(hit, { ...battery, y: bobY })) {
            battery.collected = true;
            batteries++;
            score += 60;
            addSparks(battery.x + battery.w / 2, bobY + battery.h / 2, '#ffd95a', 16);
          }
        }
      }
      updateHud();
    }

    function drawBackground() {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#17375e');
      sky.addColorStop(0.62, '#244b74');
      sky.addColorStop(1, '#102039');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      clouds.forEach(c => drawCloud(c.x, c.y, c.s));

      ctx.fillStyle = '#1c3558';
      for (let x = -80 + ((tick * speed * 0.28) % 160); x < W + 200; x += 160) {
        ctx.fillRect(x, 266, 70, 164);
        ctx.fillRect(x + 20, 230, 32, 36);
      }

      ctx.fillStyle = '#17283f';
      ctx.fillRect(0, groundY, W, H - groundY);
      ctx.fillStyle = '#2bdf9f';
      ctx.fillRect(0, groundY, W, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let x = -80 + ((tick * speed) % 80); x < W + 80; x += 80) {
        ctx.fillRect(x, groundY + 18, 38, 6);
      }
    }

    function drawCloud(x, y, s) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.beginPath();
      ctx.arc(0, 18, 28, 0, Math.PI * 2);
      ctx.arc(35, 8, 38, 0, Math.PI * 2);
      ctx.arc(82, 20, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawRobot() {
      ctx.save();
      ctx.translate(robot.x, robot.y);
      if (gameOver) ctx.rotate(Math.sin(tick * 0.28) * 0.08);

      ctx.fillStyle = '#b9d4e9';
      roundRect(10, 20, 38, 42, 10, true);
      ctx.fillStyle = '#dff8ff';
      roundRect(5, 0, 48, 34, 11, true);
      ctx.fillStyle = '#112033';
      roundRect(13, 9, 32, 14, 7, true);
      ctx.fillStyle = robot.blink < 6 ? '#112033' : '#64f4ff';
      ctx.beginPath(); ctx.arc(23, 16, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(36, 16, 3.5, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = '#64f4ff';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(29, 0); ctx.lineTo(29, -11); ctx.stroke();
      ctx.fillStyle = '#ffd95a';
      ctx.beginPath(); ctx.arc(29, -14, 5, 0, Math.PI * 2); ctx.fill();

      const leg = robot.grounded ? Math.sin(tick * 0.32) * 7 : -4;
      ctx.strokeStyle = '#dff8ff';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(18, 60); ctx.lineTo(14 + leg, 76); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(40, 60); ctx.lineTo(44 - leg, 76); ctx.stroke();
      ctx.strokeStyle = '#9fd8ff';
      ctx.beginPath(); ctx.moveTo(10, 32); ctx.lineTo(0, 46 + Math.sin(tick * 0.25) * 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(48, 32); ctx.lineTo(58, 46 - Math.sin(tick * 0.25) * 4); ctx.stroke();

      ctx.restore();
    }

    function drawWater(water) {
      ctx.save();
      ctx.translate(water.x, water.y);
      const grad = ctx.createLinearGradient(0, -8, 0, water.h);
      grad.addColorStop(0, '#83f5ff');
      grad.addColorStop(1, '#286cff');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(water.w / 2, 13, water.w / 2, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(220, 255, 255, 0.9)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let x = 8; x < water.w - 6; x += 18) {
        ctx.moveTo(x, 4 + Math.sin((tick + x) * 0.12) * 4);
        ctx.quadraticCurveTo(x + 8, -3, x + 16, 4 + Math.sin((tick + x + 16) * 0.12) * 4);
      }
      ctx.stroke();
      ctx.restore();
    }

    function drawBattery(b) {
      const y = b.y + Math.sin(b.bob) * 8;
      ctx.save();
      ctx.translate(b.x, y);
      ctx.fillStyle = '#273142';
      roundRect(0, 6, b.w, b.h - 6, 7, true);
      ctx.fillStyle = '#ffd95a';
      roundRect(7, 13, b.w - 14, b.h - 20, 5, true);
      ctx.fillStyle = '#7dff8a';
      ctx.fillRect(11, 20, b.w - 22, 8);
      ctx.fillRect(11, 32, b.w - 22, 8);
      ctx.fillStyle = '#e8f3ff';
      roundRect(10, 0, b.w - 20, 8, 3, true);
      ctx.restore();
    }

    function drawSparks() {
      sparks.forEach(s => {
        ctx.globalAlpha = Math.max(0, s.life / 36);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    }

    function drawOverlay() {
      if (!gameOver && tick < 210) {
        ctx.save();
        ctx.fillStyle = 'rgba(7, 15, 28, 0.68)';
        roundRect(278, 32, 404, 76, 18, true);
        ctx.fillStyle = 'white';
        ctx.font = '700 24px ui-rounded, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Collect batteries. Jump over water!', W / 2, 65);
        ctx.fillStyle = '#bfd6f3';
        ctx.font = '16px ui-rounded, system-ui';
        ctx.fillText('Space / ↑ / click = jump', W / 2, 91);
        ctx.restore();
      }

      if (gameOver) {
        ctx.save();
        ctx.fillStyle = 'rgba(5, 10, 18, 0.72)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ff6b8a';
        ctx.font = '900 58px ui-rounded, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('SPLASH!', W / 2, 205);
        ctx.fillStyle = 'white';
        ctx.font = '800 28px ui-rounded, system-ui';
        ctx.fillText(`Score ${Math.floor(score)} • Batteries ${batteries}`, W / 2, 252);
        ctx.fillStyle = '#bfd6f3';
        ctx.font = '20px ui-rounded, system-ui';
        ctx.fillText('Press Space, ↑, click, or R to run again', W / 2, 294);
        ctx.restore();
      }
    }

    function roundRect(x, y, w, h, r, fill) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      if (fill) ctx.fill();
      else ctx.stroke();
    }

    function draw() {
      drawBackground();
      pickups.forEach(drawBattery);
      obstacles.forEach(drawWater);
      drawRobot();
      drawSparks();
      drawOverlay();
    }

    function loop() {
      update();
      draw();
      requestAnimationFrame(loop);
    }

    addEventListener('keydown', (event) => {
      if (event.code === 'Space' || event.code === 'ArrowUp') {
        event.preventDefault();
        if (!event.repeat) startJump();
      }
      if (event.code === 'KeyR' && gameOver) reset();
    });
    addEventListener('keyup', (event) => {
      if (event.code === 'Space' || event.code === 'ArrowUp') stopJump();
    });
    canvas.addEventListener('pointerdown', startJump);
    addEventListener('pointerup', stopJump);
    addEventListener('pointercancel', stopJump);

    reset();
    loop();
  </script>
</body>
</html>
