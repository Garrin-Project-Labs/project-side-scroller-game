import test from 'node:test';
import assert from 'node:assert/strict';
import { BestScoreStorage } from '../docs/src/best-score-storage.js';

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

test('BestScoreStorage loads missing score as zero', () => {
  assert.equal(new BestScoreStorage(fakeStorage()).load(), 0);
});

test('BestScoreStorage saves and reloads best score through configured key', () => {
  const storage = fakeStorage();
  const scores = new BestScoreStorage(storage, 'best');
  scores.save(1234);
  assert.equal(storage.values.get('best'), '1234');
  assert.equal(scores.load(), 1234);
});
