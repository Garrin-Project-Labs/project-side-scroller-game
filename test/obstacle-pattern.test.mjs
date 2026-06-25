import test from 'node:test';
import assert from 'node:assert/strict';
import { createObstaclePatternState, nextObstacleSpawnDelay, nextObstacleSpec } from '../docs/src/obstacle-pattern.js';
import { GameConfig } from '../docs/src/runner-tuning.js';

const worldWidth = GameConfig.width;
const groundY = GameConfig.groundY;

function next(patternState, currentObstacles = [], random = () => 1) {
  return nextObstacleSpec({ patternState, tuning: GameConfig, worldWidth, groundY, currentObstacles, random });
}

test('Obstacle Pattern starts with a forgiving first trench', () => {
  const state = createObstaclePatternState();
  assert.deepEqual(next(state), { x: 990, y: 428, w: 72, h: 54, kind: 'trench' });
  assert.equal(state.index, 1);
});

test('Obstacle Pattern produces textured box and slide barrier specs', () => {
  const state = createObstaclePatternState();
  next(state);
  assert.deepEqual(next(state), { x: 990, y: 380, w: 64, h: 50, kind: 'box', texture: 'crate', depth: 4 });
  assert.deepEqual(next(state), { x: 990, y: 254, w: 56, h: 136, kind: 'slideBarrier' });
});

test('stacked boxes can downgrade unless a platform is nearby', () => {
  const state = createObstaclePatternState();
  for (let i = 0; i < 4; i++) next(state);
  assert.equal(next(state, [], () => 1).kind, 'box');

  const nearbyState = { index: 4 };
  const spec = next(nearbyState, [{ kind: 'platform', x: worldWidth - 100 }], () => 1);
  assert.equal(spec.kind, 'stackedBox');
  assert.equal(spec.h, GameConfig.boxSize * 2);
});

test('Obstacle Pattern owns spawn delay timing', () => {
  assert.equal(nextObstacleSpawnDelay({ patternState: { index: 3 }, tuning: GameConfig, speed: 2 }), 370);
  assert.equal(nextObstacleSpawnDelay({ patternState: { index: 4 }, tuning: GameConfig, speed: 2 }), 325);
});
