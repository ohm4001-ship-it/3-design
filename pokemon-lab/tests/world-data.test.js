import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/data.js';
import {
  WORLD_KEY, WORLD_BOUNDS, REGIONS, LANDMARKS, BERRY_NODES, WILD_SPAWNS, DEFAULT_PROGRESS,
  buildSpawns, normalizeProgress, loadProgress, saveProgress, getRegion, discoverAt,
  registerCatch, visitLandmark, collectBerry, getLevel, getQuests,
} from '../src/world-data.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}

test('progress normalization isolates defaults and rejects malformed or hostile save data', () => {
  for (const input of [null, [], false, 'broken', 14]) assert.deepEqual(normalizeProgress(input), DEFAULT_PROGRESS);
  const state = normalizeProgress({
    position: { x: Infinity, z: -900 }, balls: -4, exp: 41.9,
    discovered: ['forest', 'forest', '__proto__', 'bogus'],
    berries: [BERRY_NODES[0].id, BERRY_NODES[0].id, 'bogus'],
    landmarks: ['bogus', LANDMARKS[0].id], partnerId: '<img onerror=alert(1)>', extra: 'discard',
    caught: [null, {}, { spawnId: 'bogus', config: {} }, { spawnId: 'custom-<bad>', config: {} },
      { spawnId: WILD_SPAWNS[0].id, config: { color: 'url(bad)', size: 400 }, name: 'x'.repeat(40), caughtAt: 'bad', level: 1000, regionId: '__proto__' },
      { spawnId: WILD_SPAWNS[0].id, config: {} }],
  });
  assert.deepEqual(state.position, { x: 0, z: -WORLD_BOUNDS });
  assert.deepEqual(state.discovered, ['meadow', 'forest']);
  assert.equal(state.balls, 0);
  assert.equal(state.exp, 41);
  assert.equal(state.caught.length, 1);
  assert.equal(state.caught[0].config.color, DEFAULT_CONFIG.color);
  assert.equal(state.caught[0].config.size, 1.3);
  assert.equal(state.caught[0].name.length, 16);
  assert.equal(state.caught[0].level, 99);
  assert.equal(state.caught[0].caughtAt, '1970-01-01T00:00:00.000Z');
  assert.equal(state.caught[0].regionId, 'meadow');
  assert.equal(state.partnerId, null);
  assert.equal('extra' in state, false);
  state.discovered.push('lake');
  assert.deepEqual(DEFAULT_PROGRESS.discovered, ['meadow']);
});

test('corrupted storage recovers, valid adventures round-trip, and write failures propagate', () => {
  assert.deepEqual(loadProgress(memoryStorage({ [WORLD_KEY]: '{broken' })), DEFAULT_PROGRESS);
  assert.deepEqual(loadProgress({ getItem() { throw new Error('SecurityError'); } }), DEFAULT_PROGRESS);
  assert.deepEqual(loadProgress(null), DEFAULT_PROGRESS);
  const storage = memoryStorage();
  const progress = registerCatch(discoverAt(DEFAULT_PROGRESS, { x: 34, z: 0 }), buildSpawns()[0], '2026-10-16T00:00:00.000Z');
  assert.deepEqual(saveProgress(progress, storage), progress);
  assert.deepEqual(loadProgress(storage), progress);
  const quotaError = new Error('QuotaExceededError');
  assert.throws(() => saveProgress(progress, { setItem() { throw quotaError; } }), (error) => error === quotaError);
  assert.throws(() => saveProgress(progress, null), /저장/);
});

test('creator designs become stable, independent wild encounters and cannot mutate saved designs', () => {
  const one = { id: 'first-design', name: '모찌', config: { ...DEFAULT_CONFIG, color: '#abcdef', tail: 'curly' } };
  const two = { id: 'second-design', name: '구름', config: { ...DEFAULT_CONFIG, type: 'fairy' } };
  const left = buildSpawns([one, two]);
  const right = buildSpawns([two, one]);
  const custom = left.find((spawn) => spawn.id === 'custom-first-design');
  assert.deepEqual(custom, right.find((spawn) => spawn.id === custom.id));
  assert.equal(custom.config.color, '#abcdef');
  assert.equal(custom.config.name, '모찌');
  assert.equal(custom.custom, true);
  assert.ok(Math.abs(custom.x) <= 48 && Math.abs(custom.z) <= 48);
  custom.config.color = '#000000';
  assert.equal(one.config.color, '#abcdef');
  assert.equal(buildSpawns([one, one, { id: '<bad>', config: {} }, null]).length, WILD_SPAWNS.length + 1);
  assert.equal(buildSpawns(Array.from({ length: 40 }, (_, i) => ({ id: `saved-${i}`, config: {} }))).length, WILD_SPAWNS.length + 24);
  assert.deepEqual({ x: left[0].x, z: left[0].z }, { x: 4, z: 20 });
});

test('capture consumes exactly one ball, grants experience once, and retains the custom configuration', () => {
  const spawn = buildSpawns([{ id: 'creator-pet', name: '포포', config: { ...DEFAULT_CONFIG, ears: 'round' } }]).at(-1);
  const start = normalizeProgress({ balls: 1 });
  const caught = registerCatch(start, spawn, 0);
  assert.equal(caught.balls, 0);
  assert.equal(caught.exp, 35);
  assert.equal(caught.caught.length, 1);
  assert.equal(caught.caught[0].spawnId, 'custom-creator-pet');
  assert.equal(caught.caught[0].config.ears, 'round');
  assert.equal(caught.caught[0].caughtAt, '1970-01-01T00:00:00.000Z');
  assert.deepEqual(registerCatch(caught, spawn), caught);
  assert.deepEqual(registerCatch(caught, buildSpawns()[0]), caught);
  assert.deepEqual(start, normalizeProgress({ balls: 1 }));
  for (const invalid of [null, {}, { id: 'bogus', config: {} }, { id: spawn.id, config: null }]) assert.deepEqual(registerCatch(start, invalid), start);
});

test('capture capacity preserves previous friends and never charges for an unsuccessful insert', () => {
  const records = Array.from({ length: 140 }, (_, i) => ({ spawnId: `custom-pet-${i}`, config: DEFAULT_CONFIG }));
  const state = normalizeProgress({ caught: records, balls: 10 });
  assert.equal(state.caught.length, 128);
  assert.deepEqual(registerCatch(state, buildSpawns()[0]), state);
});

test('landmark and berry rewards cannot be repeated, while camp reliably replenishes empty supplies', () => {
  const first = visitLandmark(DEFAULT_PROGRESS, LANDMARKS[1].id);
  assert.equal(first.exp, 30);
  assert.equal(first.balls, 16);
  assert.deepEqual(visitLandmark(first, LANDMARKS[1].id), first);
  const picked = collectBerry(first, BERRY_NODES[0].id);
  assert.equal(picked.exp, 40);
  assert.equal(picked.balls, 19);
  assert.deepEqual(collectBerry(picked, BERRY_NODES[0].id), picked);
  assert.deepEqual(collectBerry(picked, 'bogus'), picked);
  assert.deepEqual(visitLandmark(picked, 'bogus'), picked);
  const refill = visitLandmark({ ...picked, balls: 0, landmarks: [LANDMARKS[0].id] }, LANDMARKS[0].id);
  assert.equal(refill.balls, 12);
  assert.equal(refill.exp, picked.exp);
  assert.equal(collectBerry({ balls: 99 }, BERRY_NODES[0].id).balls, 99);
});

test('region discovery follows bounded movement and quest completion reflects actual milestones', () => {
  let state = normalizeProgress(null);
  for (const region of REGIONS) {
    assert.equal(getRegion(region.x, region.z).id, region.id);
    state = discoverAt(state, region);
  }
  assert.equal(state.discovered.length, 4);
  assert.equal(getRegion(NaN, 0).id, 'meadow');
  const unchanged = discoverAt(state, { x: NaN, z: Infinity });
  assert.deepEqual(unchanged.position, state.position);
  assert.deepEqual(discoverAt(state, { x: 400, z: -400 }).position, { x: 70, z: -70 });
  for (const spawn of buildSpawns().slice(0, 5)) state = registerCatch(state, spawn, 0);
  for (const landmark of LANDMARKS) state = visitLandmark(state, landmark.id);
  assert.ok(getQuests(state).every((quest) => quest.complete && quest.current === quest.target));
  assert.ok(getQuests(DEFAULT_PROGRESS).every((quest) => !quest.complete));
});

test('level thresholds carry experience correctly across multiple level gains', () => {
  assert.deepEqual(getLevel(0), { level: 1, current: 0, required: 100 });
  assert.deepEqual(getLevel(99), { level: 1, current: 99, required: 100 });
  assert.deepEqual(getLevel(100), { level: 2, current: 0, required: 140 });
  assert.deepEqual(getLevel(250), { level: 3, current: 10, required: 180 });
  assert.deepEqual(getLevel(Infinity), getLevel(0));
  assert.deepEqual(getLevel(-1), getLevel(0));
});
