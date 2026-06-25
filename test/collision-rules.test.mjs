import test from 'node:test';
import assert from 'node:assert/strict';
import { groundLanding, hazardHitbox, hitsHazard, overlap, platformLanding, robotHitbox } from '../docs/src/collision-rules.js';
import { GameConfig } from '../docs/src/runner-tuning.js';

const robot = { x: 128, y: GameConfig.groundY - 78, w: 58, h: 78, vy: 0, sliding: false };

test('robotHitbox matches standing runner collision shape', () => {
  assert.deepEqual(robotHitbox(robot, GameConfig), { x: 138, y: 360, w: 38, h: 70 });
});

test('robotHitbox matches sliding runner collision shape', () => {
  const hitbox = robotHitbox({ ...robot, sliding: true }, GameConfig);
  assert.deepEqual({ x: hitbox.x, y: hitbox.y, h: hitbox.h }, { x: 136, y: 402, h: 24 });
  assert.equal(Math.round(hitbox.w * 100), 6396);
});

test('overlap is true only when rectangles share area', () => {
  assert.equal(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 10, h: 10 }), true);
  assert.equal(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false);
  assert.equal(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 10, w: 10, h: 10 }), false);
});

test('hazardHitbox keeps collision padding local to hazard kind', () => {
  assert.deepEqual(hazardHitbox({ kind: 'trench', x: 100, y: 428, w: 72, h: 54 }), { x: 105, y: 423, w: 62, h: 64 });
  assert.deepEqual(hazardHitbox({ kind: 'slideBarrier', x: 100, y: 254, w: 56, h: 136 }), { x: 106, y: 258, w: 44, h: 132 });
  assert.equal(hazardHitbox({ kind: 'platform' }), null);
});

test('hitsHazard checks robot box against hazard hitbox', () => {
  assert.equal(hitsHazard({ x: 105, y: 423, w: 10, h: 10 }, { kind: 'trench', x: 100, y: 428, w: 72, h: 54 }), true);
  assert.equal(hitsHazard({ x: 0, y: 0, w: 10, h: 10 }, { kind: 'platform', x: 0, y: 0, w: 220, h: 62 }), false);
});

test('platformLanding resolves only when falling from above and overlapping x', () => {
  const landing = platformLanding({
    robot: { ...robot, y: 350, vy: 3 },
    previousY: 320,
    platform: { kind: 'platform', x: 120, y: 400, w: 220, h: 62 },
  });
  assert.deepEqual(landing, { y: 322, vy: 0, grounded: true });

  assert.equal(platformLanding({ robot: { ...robot, y: 350, vy: -1 }, previousY: 320, platform: { kind: 'platform', x: 120, y: 400, w: 220, h: 62 } }), null);
});

test('groundLanding resolves when robot reaches Runner World ground', () => {
  assert.deepEqual(groundLanding({ ...robot, y: 355 }, GameConfig), { y: 352, vy: 0, grounded: true });
  assert.equal(groundLanding({ ...robot, y: 300 }, GameConfig), null);
});
