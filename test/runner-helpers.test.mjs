import test from 'node:test';
import assert from 'node:assert/strict';

const groundY = 430;
const robot = { x: 128, y: groundY - 78, w: 58, h: 78, sliding: false };

function robotHitbox(r) {
  if (r.sliding) return { x: r.x + 8, y: groundY - 28, w: 78 * 0.82, h: 24 };
  return { x: r.x + 10, y: r.y + 8, w: r.w - 20, h: r.h - 8 };
}

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

test('robotHitbox matches standing runner collision shape', () => {
  assert.deepEqual(robotHitbox(robot), { x: 138, y: 360, w: 38, h: 70 });
});

test('robotHitbox matches sliding runner collision shape', () => {
  const hitbox = robotHitbox({ ...robot, sliding: true });
  assert.deepEqual({ x: hitbox.x, y: hitbox.y, h: hitbox.h }, { x: 136, y: 402, h: 24 });
  assert.equal(Math.round(hitbox.w * 100), 6396);
});

test('overlap is true only when rectangles share area', () => {
  assert.equal(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 10, h: 10 }), true);
  assert.equal(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false);
  assert.equal(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 10, w: 10, h: 10 }), false);
});
