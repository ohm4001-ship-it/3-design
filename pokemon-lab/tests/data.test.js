import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG, PRESETS, COLLECTION_KEY, DRAFT_KEY, normalizeConfig,
  randomConfig, loadCollection, saveCollection, loadDraft, saveDraft,
} from '../src/data.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test('normalization rejects invalid fields, clamps sliders, and removes unknown fields', () => {
  const normalized = normalizeConfig({
    name: '  12345678901234567890  ', body: 'unsafe', ears: 'round',
    color: 'url(https://example.com)', accent: '#ABCDEF', belly: '#fff',
    size: Infinity, earSize: -20, type: '__proto__', extra: 'discard',
  });
  assert.equal(normalized.name, '1234567890123456');
  assert.equal(normalized.body, DEFAULT_CONFIG.body);
  assert.equal(normalized.ears, 'round');
  assert.equal(normalized.color, DEFAULT_CONFIG.color);
  assert.equal(normalized.accent, '#abcdef');
  assert.equal(normalized.belly, DEFAULT_CONFIG.belly);
  assert.equal(normalized.size, 1);
  assert.equal(normalized.earSize, 0.6);
  assert.equal(normalized.type, DEFAULT_CONFIG.type);
  assert.equal('extra' in normalized, false);
  assert.equal(normalizeConfig({ size: 99, earSize: 99 }).size, 1.3);
  assert.equal(normalizeConfig({ size: 0, earSize: 99 }).size, 0.75);
  assert.equal(normalizeConfig({ size: 0, earSize: 99 }).earSize, 1.5);
  assert.equal(normalizeConfig({ size: '1.2', earSize: NaN }).earSize, 1);
});

test('invalid input falls back to fresh defaults and names are Unicode safe', () => {
  for (const input of [null, undefined, false, 12, [], 'bad']) {
    const config = normalizeConfig(input);
    assert.deepEqual(config, DEFAULT_CONFIG);
    assert.notEqual(config, DEFAULT_CONFIG);
  }
  assert.equal(Array.from(normalizeConfig({ name: '🌱'.repeat(20) }).name).length, 16);
  assert.equal(normalizeConfig({ name: '  \n\t ' }).name, DEFAULT_CONFIG.name);
});

test('corrupted, missing, and inaccessible storage recover safely', () => {
  const corrupted = memoryStorage({ [COLLECTION_KEY]: '{broken', [DRAFT_KEY]: 'null' });
  assert.deepEqual(loadCollection(corrupted), []);
  assert.deepEqual(loadDraft(corrupted), DEFAULT_CONFIG);
  assert.deepEqual(loadCollection(memoryStorage({ [COLLECTION_KEY]: '{"unexpected":[]}' })), []);
  assert.deepEqual(loadDraft(memoryStorage()), DEFAULT_CONFIG);
  const blocked = { getItem() { throw new Error('SecurityError'); } };
  assert.deepEqual(loadCollection(blocked), []);
  assert.deepEqual(loadDraft(blocked), DEFAULT_CONFIG);
});

test('stored entries are normalized, duplicate IDs removed, and unsafe images discarded', () => {
  const stored = [null, {}, { id: 'one', name: '포포', config: { body: 'bad', size: 42 }, image: 'javascript:alert(1)', createdAt: 'invalid' }, { id: 'one', config: {} }];
  const result = loadCollection(memoryStorage({ [COLLECTION_KEY]: JSON.stringify(stored) }));
  assert.equal(result.length, 1);
  assert.equal(result[0].config.size, 1.3);
  assert.equal(result[0].config.body, DEFAULT_CONFIG.body);
  assert.equal(result[0].config.name, '포포');
  assert.equal(result[0].image, '');
  assert.equal(result[0].createdAt, '1970-01-01T00:00:00.000Z');
});

test('collection and draft round-trip without losing valid editable state', () => {
  const storage = memoryStorage();
  const config = { ...PRESETS[3].config, name: '작은 불꽃', accessory: 'flower' };
  assert.deepEqual(saveDraft(config, storage), config);
  assert.deepEqual(loadDraft(storage), config);
  const collection = [{ id: 'pocket-1', name: config.name, config, image: 'data:image/png;base64,YWJj', createdAt: '2026-10-16T00:00:00.000Z' }];
  assert.deepEqual(saveCollection(collection, storage), collection);
  assert.deepEqual(loadCollection(storage), collection);
});

test('collection capacity is 24 and write failures are surfaced to callers', () => {
  const items = Array.from({ length: 30 }, (_, index) => ({ id: `pet-${index}`, config: DEFAULT_CONFIG }));
  const storage = memoryStorage();
  assert.equal(saveCollection(items, storage).length, 24);
  assert.equal(loadCollection(storage).length, 24);
  const writeError = new Error('QuotaExceededError');
  const fullStorage = { setItem() { throw writeError; } };
  assert.throws(() => saveCollection(items, fullStorage), (error) => error === writeError);
  assert.throws(() => saveDraft(DEFAULT_CONFIG, fullStorage), (error) => error === writeError);
  assert.throws(() => saveDraft(DEFAULT_CONFIG, null), /저장 공간/);
});

test('all presets and randomized creatures produce supported complete configs', () => {
  assert.equal(PRESETS.length, 6);
  for (const preset of PRESETS) assert.deepEqual(normalizeConfig(preset.config), preset.config);
  for (let index = 0; index < 30; index += 1) {
    const random = randomConfig();
    assert.deepEqual(normalizeConfig(random), random);
    assert.ok(random.size >= 0.85 && random.size <= 1.15);
  }
});
