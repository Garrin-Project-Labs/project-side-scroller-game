export function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function robotHitbox(robot, tuning) {
  if (robot.sliding) {
    return {
      x: robot.x + 8,
      y: tuning.groundY - 28,
      w: tuning.robotHeight * 0.82,
      h: 24,
    };
  }
  return { x: robot.x + 10, y: robot.y + 8, w: robot.w - 20, h: robot.h - 8 };
}

export function hazardHitbox(obstacle) {
  if (obstacle.kind === 'trench') return { x: obstacle.x + 5, y: obstacle.y - 5, w: obstacle.w - 10, h: obstacle.h + 10 };
  if (obstacle.kind === 'box' || obstacle.kind === 'stackedBox') return { x: obstacle.x + 4, y: obstacle.y + 4, w: obstacle.w - 8, h: obstacle.h - 4 };
  if (obstacle.kind === 'slideBarrier') return { x: obstacle.x + 6, y: obstacle.y + 4, w: obstacle.w - 12, h: obstacle.h - 4 };
  return null;
}

export function hitsHazard(robotBox, obstacle) {
  const hitbox = hazardHitbox(obstacle);
  return Boolean(hitbox && overlap(robotBox, hitbox));
}

export function pickupHitbox(pickup) {
  return { ...pickup, y: pickup.y + Math.sin(pickup.bob) * 8 };
}

export function hitsPickup(robotBox, pickup) {
  return overlap(robotBox, pickupHitbox(pickup));
}

export function platformLanding({ robot, previousY, platform }) {
  if (platform.kind !== 'platform') return null;
  const wasAbove = previousY + robot.h <= platform.y + 8;
  const overlapsX = robot.x + robot.w - 8 > platform.x && robot.x + 8 < platform.x + platform.w;
  if (robot.vy >= 0 && wasAbove && overlapsX && robot.y + robot.h >= platform.y) {
    return { y: platform.y - robot.h, vy: 0, grounded: true };
  }
  return null;
}

export function groundLanding(robot, tuning) {
  if (robot.y < tuning.groundY - robot.h) return null;
  return { y: tuning.groundY - robot.h, vy: 0, grounded: true };
}
