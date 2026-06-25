export class RunnerRenderer {
  constructor({ scene, tuning, graphs, texts, robotSprite, signs, streetfronts }) {
    this.scene = scene;
    this.tuning = tuning;
    this.bg = graphs.bg;
    this.world = graphs.world;
    this.effects = graphs.effects;
    this.hud = graphs.hud;
    this.texts = texts;
    this.robotSprite = robotSprite;
    this.signs = signs;
    this.streetfronts = streetfronts;
  }

  clear() {
    this.bg.clear();
    this.world.clear();
    this.effects.clear();
    this.hud.clear();
  }

  draw({ robot, obstacles, sparks, tick, speed, district, gameOver, score, batteries, best, milestoneFlash, awaitingStart }) {
    this.clear();
    this.drawBackground({ tick, speed, district });
    for (const obstacle of obstacles) this.drawObstacle(obstacle, tick);
    this.drawRobot({ robot, tick, gameOver });
    this.drawSparks(sparks);
    this.drawHud({ tick, gameOver, score, batteries, best, district, milestoneFlash, awaitingStart });
  }

  drawBackground({ tick, speed, district }) {
    const { width: W, height: H, groundY: GROUND_Y, districtPalettes } = this.tuning;
    const palette = districtPalettes[district % districtPalettes.length];
    this.bg.fillGradientStyle(palette.top, palette.top, palette.mid, palette.bottom, 1);
    this.bg.fillRect(0, 0, W, H);

    this.bg.fillStyle(palette.moon, 0.9);
    this.bg.fillCircle(818, 72, 36);
    this.bg.fillStyle(palette.glow, 0.18);
    this.bg.fillCircle(818, 72, 68);

    this.drawCitySparkles(tick);
    this.drawTokyoSigns({ layer: 'back', tick, speed });
    this.drawNearTokyoStreetfront({ tick, speed });
    this.drawTokyoSigns({ layer: 'front', tick, speed });
    this.drawRoad({ tick, speed, width: W, height: H, groundY: GROUND_Y });
  }

  drawNearTokyoStreetfront({ tick, speed }) {
    const { width: W } = this.tuning;
    const segment = 190;
    const fronts = this.streetfronts;
    const stripWidth = segment * fronts.length;
    const offset = (tick * speed * 0.34) % stripWidth;

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
    const { groundY: GROUND_Y } = this.tuning;
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
    const { groundY: GROUND_Y } = this.tuning;
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
    const { groundY: GROUND_Y } = this.tuning;
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
    const { groundY: GROUND_Y } = this.tuning;
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

  drawTokyoSigns({ layer = 'front', tick, speed }) {
    const { width: W } = this.tuning;
    const signStripWidth = 5320;
    const offset = (tick * speed * (layer === 'back' ? 0.16 : 0.26)) % signStripWidth;
    for (const sign of this.signs) {
      if ((sign.layer || 'front') !== layer) continue;
      let visibleX = null;
      const pulse = 0.72 + Math.sin(tick * 0.08 + sign.x) * 0.18;
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
    const { groundY: GROUND_Y } = this.tuning;
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
      sign.label = this.scene.add.text(0, 0, sign.text, {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: `${fontSize}px`,
        color: '#ffffff',
        stroke: '#090719',
        strokeThickness: 5
      }).setOrigin(0.5).setDepth(1);
      sign.subLabel = this.scene.add.text(0, 0, sign.subText, {
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

  drawRoad({ tick, speed, width: W, height: H, groundY: GROUND_Y }) {
    const g = this.world;
    g.fillStyle(0x050611, 1);
    g.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    g.fillStyle(0xff4fc3, 0.85);
    g.fillRect(0, GROUND_Y, W, 3);

    g.lineStyle(2, 0xffffff, 0.1);
    for (let y = GROUND_Y + 22; y < H; y += 24) g.lineBetween(0, y, W, y + 10);

    const laneOffset = (tick * speed * 2.2) % 96;
    g.fillStyle(0xffd36b, 0.95);
    for (let x = -96 + laneOffset; x < W + 96; x += 96) {
      g.fillRect(x, GROUND_Y + 56, 48, 7);
      g.fillRect(x + 18, GROUND_Y + 86, 70, 8);
    }

    g.fillStyle(0xffffff, 0.18);
    for (let x = -80 + ((tick * speed * 1.35) % 80); x < W + 80; x += 80) {
      g.fillRect(x, GROUND_Y + 22, 38, 4);
    }
  }

  drawCitySparkles(tick) {
    for (const f of this.scene.fireflies) {
      const pulse = 0.35 + Math.sin(tick * 0.055 + f.phase) * 0.22;
      this.bg.fillStyle(0x8fffe4, pulse);
      this.bg.fillRect(f.x, f.y, 2 + f.s, 2 + f.s);
      this.bg.fillStyle(0xff74d4, pulse * 0.34);
      this.bg.fillCircle(f.x + 2, f.y + 2, 4 + f.s * 1.7);
    }
  }

  drawRobot({ robot, tick, gameOver }) {
    const { groundY: GROUND_Y, robotWidth: ROBOT_W, robotHeight: ROBOT_H } = this.tuning;
    const wobble = gameOver ? Math.sin(tick * 0.28) * 0.08 : 0;
    if (robot.sliding) {
      this.robotSprite
        .setPosition(robot.x + 6, GROUND_Y - 24)
        .setDisplaySize(ROBOT_H * 0.9, ROBOT_W * 0.7)
        .setRotation(-0.18)
        .setAlpha(gameOver ? 0.88 : 1);
      return;
    }
    this.robotSprite
      .setPosition(robot.x, robot.y)
      .setDisplaySize(ROBOT_W, ROBOT_H)
      .setRotation(wobble)
      .setAlpha(gameOver ? 0.88 : 1);
  }

  drawObstacle(obstacle, tick) {
    if (obstacle.kind === 'trench') return this.drawTrench(obstacle);
    if (obstacle.kind === 'slideBarrier') return this.drawSlideBarrier(obstacle, tick);
  }

  drawSlideBarrier(o, tick) {
    const g = this.world;
    const left = o.x + 5;
    const right = o.x + o.w - 5;
    const top = o.y + 2;
    const bottom = o.y + o.h;
    const pulse = 0.82 + Math.sin(tick * 0.18 + o.x * 0.03) * 0.14;
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
    const { groundY: GROUND_Y } = this.tuning;
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

  drawSparks(sparks) {
    for (const s of sparks) {
      this.effects.fillStyle(s.color, Math.max(0, s.life / 36));
      this.effects.fillCircle(s.x, s.y, 3.5);
    }
  }

  drawHud({ tick, gameOver, score, batteries, best, district, milestoneFlash, awaitingStart }) {
    const { width: W, height: H, districtPalettes } = this.tuning;
    const { hudText, helpText, subHelpText, startTitleText, startControlsText, startTrapsText, startPromptText, milestoneText } = this.texts;
    hudText.setText(`Score ${Math.floor(score)}   Batteries ${batteries}   Best ${best}`);
    helpText.setVisible(!awaitingStart && !gameOver && tick < 210);
    subHelpText.setVisible(!awaitingStart && !gameOver && tick < 210);
    this.drawStartScreen({ tick, awaitingStart, startTitleText, startControlsText, startTrapsText, startPromptText });
    if (milestoneFlash > 0) {
      const alpha = Math.min(1, milestoneFlash / 45);
      milestoneText.setAlpha(alpha).setVisible(true);
      this.hud.fillStyle(districtPalettes[district].glow, 0.08 * alpha);
      this.hud.fillRect(0, 0, W, H);
    } else {
      milestoneText.setVisible(false);
    }
  }

  drawStartScreen({ tick, awaitingStart, startTitleText, startControlsText, startTrapsText, startPromptText }) {
    for (const text of [startTitleText, startControlsText, startTrapsText, startPromptText]) text.setVisible(awaitingStart);
    if (!awaitingStart) return;

    const pulse = 0.82 + Math.sin(tick * 0.08) * 0.18;
    this.hud.fillStyle(0x050612, 0.7);
    this.hud.fillRect(0, 0, this.tuning.width, this.tuning.height);
    this.hud.fillStyle(0x9effff, 0.08 * pulse);
    this.hud.fillCircle(this.tuning.width / 2, 94, 210);

    this.hud.fillStyle(0x090719, 0.88);
    this.hud.fillRoundedRect(96, 142, 372, 196, 18);
    this.hud.fillRoundedRect(492, 142, 372, 196, 18);
    this.hud.lineStyle(4, 0x6ef7d2, 0.74);
    this.hud.strokeRoundedRect(96, 142, 372, 196, 18);
    this.hud.lineStyle(4, 0xff5fbf, 0.74);
    this.hud.strokeRoundedRect(492, 142, 372, 196, 18);

    this.hud.fillStyle(0x07101d, 0.92);
    this.hud.fillRoundedRect(206, 372, 548, 62, 22);
    this.hud.lineStyle(4, 0xffd36b, 0.75 + pulse * 0.25);
    this.hud.strokeRoundedRect(206, 372, 548, 62, 22);
    startPromptText.setAlpha(0.78 + pulse * 0.22);

    this.drawStartTrapIcons(tick);
  }

  drawStartTrapIcons(tick) {
    const bob = Math.sin(tick * 0.06) * 4;

    this.hud.lineStyle(5, 0x9effff, 0.9);
    this.hud.lineBetween(150, 296, 220, 296);
    this.hud.lineBetween(282, 296, 352, 296);
    this.hud.fillStyle(0x03050c, 0.96);
    this.hud.fillRect(220, 296, 62, 34);
    this.hud.fillStyle(0xff5fbf, 0.24);
    this.hud.fillRect(228, 304, 46, 18);

    this.hud.fillStyle(0x7a4a27, 0.96);
    this.hud.fillRoundedRect(548, 284, 40, 40, 6);
    this.hud.lineStyle(3, 0xffd36b, 0.8);
    this.hud.strokeRoundedRect(548, 284, 40, 40, 6);
    this.hud.lineBetween(552, 292, 584, 316);

    this.hud.lineStyle(4, 0xff5fbf, 0.95);
    this.hud.lineBetween(640, 246, 704, 246);
    this.hud.lineBetween(640, 284, 704, 284);
    this.hud.lineStyle(10, 0xff5fbf, 0.18);
    this.hud.lineBetween(640, 266, 704, 266);
    this.hud.lineStyle(4, 0x9effff, 0.9);
    this.hud.lineBetween(642, 266, 702, 266);

    this.hud.fillStyle(0xffd36b, 0.95);
    this.hud.fillRoundedRect(744, 284 + bob, 22, 34, 6);
    this.hud.fillStyle(0xffffff, 0.52);
    this.hud.fillRect(750, 292 + bob, 10, 12);
  }
}
