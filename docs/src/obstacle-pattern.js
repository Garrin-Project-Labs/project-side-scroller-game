export function createObstaclePatternState() {
  return { index: 0 };
}

export function nextObstacleSpec({ patternState, tuning, worldWidth, groundY, currentObstacles, random = Math.random }) {
  const kind = tuning.obstaclePattern[patternState.index % tuning.obstaclePattern.length];
  patternState.index++;

  if (kind === 'trench') {
    const w = patternState.index === 1
      ? tuning.firstTrenchWidth
      : tuning.trenchWidths[patternState.index % tuning.trenchWidths.length];
    return { x: worldWidth + 30, y: groundY - 2, w, h: 54, kind: 'trench' };
  }

  if (kind === 'box') {
    const h = tuning.boxHeights[patternState.index % tuning.boxHeights.length];
    return { x: worldWidth + 30, y: groundY - h, w: 64, h, kind: 'box', texture: 'crate', depth: 4 };
  }

  if (kind === 'stackedBox') {
    const stackH = tuning.boxSize * 2;
    const nearPlatform = currentObstacles.some(o => o.kind === 'platform' && o.x > worldWidth - 260);
    if (nearPlatform || random() < 0.45) {
      return { x: worldWidth + 30, y: groundY - stackH, w: tuning.boxSize, h: stackH, kind: 'stackedBox', texture: 'crate', depth: 4 };
    }
    return { x: worldWidth + 30, y: groundY - tuning.boxSize, w: 64, h: tuning.boxSize, kind: 'box', texture: 'crate', depth: 4 };
  }

  if (kind === 'slideBarrier') {
    return { x: worldWidth + 30, y: groundY - 176, w: 56, h: 136, kind: 'slideBarrier' };
  }

  return { x: worldWidth + 30, y: groundY - 62, w: 220, h: 62, kind: 'platform', texture: 'platform', depth: 3 };
}

export function nextObstacleSpawnDelay({ patternState, tuning, speed }) {
  const patternOffset = patternState.index % 3 === 0 ? 90 : 0;
  return Math.round((tuning.obstacleGapPixels + patternOffset) / speed);
}
