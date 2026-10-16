import { PRESETS, normalizeConfig } from './data.js';
import { DUNGEONS, isClearedRun } from './dungeon-data.js';

export const WORLD_KEY = 'pokemon-lab.world.v1';
export const WORLD_BOUNDS = 70;
export const MAX_CAUGHT = 128;

export const REGIONS = Object.freeze([
  { id: 'meadow', name: '햇살 초원', subtitle: '우리의 첫 모험이 시작되는 곳', x: 0, z: 26, radius: 27, color: '#c8df85' },
  { id: 'forest', name: '속삭임 숲', subtitle: '나뭇잎 사이에 숨은 작은 친구들', x: -32, z: -5, radius: 26, color: '#6bb493' },
  { id: 'lake', name: '별빛 호수', subtitle: '반짝이는 물결을 따라 걸어요', x: 34, z: 0, radius: 25, color: '#83c9d7' },
  { id: 'ruins', name: '달빛 유적', subtitle: '오래된 돌에 남겨진 모험의 흔적', x: 0, z: -40, radius: 27, color: '#b1a3d5' },
].map(Object.freeze));

export const LANDMARKS = Object.freeze([
  { id: 'base-camp', name: '새싹 캠프', kind: 'camp', x: 0, z: 32, radius: 5 },
  { id: 'ancient-grove', name: '소원 나무', kind: 'grove', x: -36, z: -14, radius: 5 },
  { id: 'lake-tower', name: '물빛 전망대', kind: 'tower', x: 40, z: 18, radius: 5 },
  { id: 'moon-ruins', name: '달의 제단', kind: 'ruins', x: 0, z: -45, radius: 5 },
].map(Object.freeze));

export const BERRY_NODES = Object.freeze([
  { id: 'berry-meadow-1', x: -4, z: 24 },
  { id: 'berry-meadow-2', x: 16, z: 32 },
  { id: 'berry-meadow-3', x: -19, z: 19 },
  { id: 'berry-forest-1', x: -26, z: -4 },
  { id: 'berry-forest-2', x: -43, z: -24 },
  { id: 'berry-lake-1', x: 24, z: 19 },
  { id: 'berry-lake-2', x: 47, z: -8 },
  { id: 'berry-ruins-1', x: -16, z: -31 },
  { id: 'berry-ruins-2', x: 17, z: -43 },
  { id: 'berry-ruins-3', x: 4, z: -24 },
].map(Object.freeze));

export const WILD_SPAWNS = Object.freeze([
  { id: 'wild-pikachu-1', presetId: 'pikachu', x: 4, z: 20, level: 2, regionId: 'meadow' },
  { id: 'wild-eevee-1', presetId: 'eevee', x: -13, z: 28, level: 3, regionId: 'meadow' },
  { id: 'wild-bulbasaur-1', presetId: 'bulbasaur', x: 18, z: 24, level: 2, regionId: 'meadow' },
  { id: 'wild-charmander-1', presetId: 'charmander', x: -7, z: 9, level: 4, regionId: 'meadow' },
  { id: 'wild-bulbasaur-2', presetId: 'bulbasaur', x: -30, z: 3, level: 5, regionId: 'forest' },
  { id: 'wild-eevee-2', presetId: 'eevee', x: -45, z: -5, level: 6, regionId: 'forest' },
  { id: 'wild-pikachu-2', presetId: 'pikachu', x: -27, z: -20, level: 7, regionId: 'forest' },
  { id: 'wild-gengar-1', presetId: 'gengar', x: -46, z: -24, level: 8, regionId: 'forest' },
  { id: 'wild-squirtle-1', presetId: 'squirtle', x: 23, z: 4, level: 4, regionId: 'lake' },
  { id: 'wild-squirtle-2', presetId: 'squirtle', x: 46, z: 10, level: 6, regionId: 'lake' },
  { id: 'wild-pikachu-3', presetId: 'pikachu', x: 36, z: -16, level: 7, regionId: 'lake' },
  { id: 'wild-eevee-3', presetId: 'eevee', x: 48, z: -7, level: 5, regionId: 'lake' },
  { id: 'wild-gengar-2', presetId: 'gengar', x: -13, z: -43, level: 10, regionId: 'ruins' },
  { id: 'wild-charmander-2', presetId: 'charmander', x: 16, z: -36, level: 9, regionId: 'ruins' },
  { id: 'wild-gengar-3', presetId: 'gengar', x: 6, z: -53, level: 12, regionId: 'ruins' },
  { id: 'wild-bulbasaur-3', presetId: 'bulbasaur', x: -4, z: -27, level: 8, regionId: 'ruins' },
].map(Object.freeze));

const regionIds = new Set(REGIONS.map(({ id }) => id));
const landmarkIds = new Set(LANDMARKS.map(({ id }) => id));
const berryIds = new Set(BERRY_NODES.map(({ id }) => id));
const wildIds = new Set(WILD_SPAWNS.map(({ id }) => id));
const dungeonIds = new Set(DUNGEONS.map(({ id }) => id));
const guardianIds = new Set(DUNGEONS.map(({ id }) => `dungeon-${id}-guardian`));
const presetById = new Map(PRESETS.map((preset) => [preset.id, preset]));
const EPOCH = '1970-01-01T00:00:00.000Z';

export const DEFAULT_PROGRESS = Object.freeze({
  position: Object.freeze({ x: 0, z: 26 }),
  discovered: Object.freeze(['meadow']),
  caught: Object.freeze([]),
  exp: 0,
  balls: 12,
  berries: Object.freeze([]),
  landmarks: Object.freeze([]),
  partnerId: null,
  dungeons: Object.freeze({ cleared: Object.freeze([]) }),
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function bounded(value, min, max, fallback) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value)) : fallback;
}

function validId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
}

function validSpawnId(value) {
  return wildIds.has(value) || guardianIds.has(value) || (typeof value === 'string' && value.startsWith('custom-') && validId(value.slice(7)));
}

function uniqueKnown(values, known) {
  return Array.isArray(values) ? [...new Set(values.filter((value) => known.has(value)))] : [];
}

function positionOf(value, fallback = DEFAULT_PROGRESS.position) {
  const source = isObject(value) ? value : {};
  return {
    x: bounded(source.x, -WORLD_BOUNDS, WORLD_BOUNDS, fallback.x),
    z: bounded(source.z, -WORLD_BOUNDS, WORLD_BOUNDS, fallback.z),
  };
}

function isoDate(value) {
  const date = (typeof value === 'number' || typeof value === 'string') ? new Date(value) : new Date(0);
  return Number.isFinite(date.getTime()) ? date.toISOString() : EPOCH;
}

export function getRegion(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return REGIONS[0];
  return REGIONS.reduce((nearest, region) => (
    Math.hypot(x - region.x, z - region.z) < Math.hypot(x - nearest.x, z - nearest.z)
      ? region : nearest
  ), REGIONS[0]);
}

/** Hash only the saved ID so reordering the creator collection does not move a creature. */
function customPosition(id) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
  const angle = (hash % 3600) / 3600 * Math.PI * 2;
  const radius = 15 + ((hash >>> 12) % 30);
  let x = Math.round(Math.cos(angle) * radius * 10) / 10;
  let z = Math.round(Math.sin(angle) * radius * 10) / 10;
  // The renderer's lake occupies x34/z7, with 11x8 radii. Keep encounters on shore.
  if (((x - 34) / 13) ** 2 + ((z - 7) / 10) ** 2 < 1) x = 20;
  return { x, z };
}

export function buildSpawns(collection = []) {
  const spawns = WILD_SPAWNS.map((spawn) => {
    const preset = presetById.get(spawn.presetId);
    return { ...spawn, name: preset.name, config: normalizeConfig({ ...preset.config, name: preset.name }), custom: false };
  });
  const seen = new Set();
  for (const item of (Array.isArray(collection) ? collection : [])) {
    if (!isObject(item) || !validId(item.id) || !isObject(item.config) || seen.has(item.id)) continue;
    seen.add(item.id);
    const config = normalizeConfig({ ...item.config, name: typeof item.name === 'string' ? item.name : item.config.name });
    const position = customPosition(item.id);
    spawns.push({ id: `custom-${item.id}`, presetId: null, ...position, level: 5, regionId: getRegion(position.x, position.z).id, name: config.name, config, custom: true });
    if (seen.size >= 24) break;
  }
  return spawns;
}

/** Rebuild untrusted local storage data; never copy unknown fields or shared arrays. */
export function normalizeProgress(input) {
  const source = isObject(input) ? input : {};
  const seen = new Set();
  const caught = [];
  for (const item of (Array.isArray(source.caught) ? source.caught : [])) {
    if (!isObject(item) || !validSpawnId(item.spawnId) || !isObject(item.config) || seen.has(item.spawnId)) continue;
    const config = normalizeConfig({ ...item.config, name: typeof item.name === 'string' ? item.name : item.config.name });
    caught.push({
      spawnId: item.spawnId, config, name: config.name, caughtAt: isoDate(item.caughtAt),
      regionId: regionIds.has(item.regionId) ? item.regionId : 'meadow',
      level: Math.floor(bounded(item.level, 1, 99, 1)),
    });
    seen.add(item.spawnId);
    if (caught.length >= MAX_CAUGHT) break;
  }
  return {
    position: positionOf(source.position),
    discovered: [...new Set(['meadow', ...uniqueKnown(source.discovered, regionIds)])],
    caught,
    exp: Math.floor(bounded(source.exp, 0, 1000000, 0)),
    balls: Math.floor(bounded(source.balls, 0, 99, 12)),
    berries: uniqueKnown(source.berries, berryIds),
    landmarks: uniqueKnown(source.landmarks, landmarkIds),
    partnerId: validId(source.partnerId) || validSpawnId(source.partnerId) ? source.partnerId : null,
    dungeons: { cleared: uniqueKnown(isObject(source.dungeons) ? source.dungeons.cleared : [], dungeonIds) },
  };
}

/** Grant a dungeon's first-clear rewards together, or preserve every item on refusal. */
export function claimDungeonReward(progress, run, now = Date.now()) {
  const next = normalizeProgress(progress);
  if (!isClearedRun(run)) return { progress: next, claimed: false, reason: 'invalid-run' };
  const dungeon = DUNGEONS.find(item => item.id === run.dungeonId);
  if (next.dungeons.cleared.includes(dungeon.id)) return { progress: next, claimed: false, reason: 'already-claimed' };
  const spawnId = `dungeon-${dungeon.id}-guardian`;
  const alreadyCaught = next.caught.some(item => item.spawnId === spawnId);
  // A full collection never silently loses a guardian or permanently consumes a reward.
  if (!alreadyCaught && next.caught.length >= MAX_CAUGHT) return { progress: next, claimed: false, reason: 'capacity' };
  next.dungeons.cleared.push(dungeon.id);
  next.exp = Math.min(1000000, next.exp + dungeon.reward.exp);
  next.balls = Math.min(99, next.balls + dungeon.reward.balls);
  if (!alreadyCaught) {
    const config = normalizeConfig(dungeon.guardian);
    next.caught.push({ spawnId, config, name: config.name, caughtAt: isoDate(now), regionId: 'ruins', level: 12 + DUNGEONS.indexOf(dungeon) * 3 });
  }
  return { progress: next, claimed: true, reason: 'claimed' };
}

export function loadProgress(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    const raw = target?.getItem(WORLD_KEY);
    return normalizeProgress(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeProgress(null);
  }
}

export function saveProgress(progress, storage) {
  const normalized = normalizeProgress(progress);
  const target = storage === undefined ? globalThis.localStorage : storage;
  if (!target || typeof target.setItem !== 'function') throw new Error('이 브라우저에서는 모험을 저장할 수 없어요.');
  target.setItem(WORLD_KEY, JSON.stringify(normalized));
  return normalized;
}

export function discoverAt(progress, position) {
  const next = normalizeProgress(progress);
  next.position = positionOf(position, next.position);
  const id = getRegion(next.position.x, next.position.z).id;
  if (!next.discovered.includes(id)) next.discovered.push(id);
  return next;
}

export function registerCatch(progress, spawn, now = Date.now()) {
  const next = normalizeProgress(progress);
  if (!isObject(spawn) || !validSpawnId(spawn.id) || !isObject(spawn.config)
    || next.balls < 1 || next.caught.length >= MAX_CAUGHT || next.caught.some(({ spawnId }) => spawnId === spawn.id)) return next;
  const config = normalizeConfig({ ...spawn.config, name: typeof spawn.name === 'string' ? spawn.name : spawn.config.name });
  const regionId = regionIds.has(spawn.regionId) ? spawn.regionId : getRegion(spawn.x, spawn.z).id;
  next.caught.push({ spawnId: spawn.id, name: config.name, config, caughtAt: isoDate(now), regionId, level: Math.floor(bounded(spawn.level, 1, 99, 1)) });
  next.balls -= 1;
  next.exp = Math.min(1000000, next.exp + 35);
  if (!next.discovered.includes(regionId)) next.discovered.push(regionId);
  return next;
}

export function visitLandmark(progress, id) {
  const next = normalizeProgress(progress);
  const landmark = LANDMARKS.find((item) => item.id === id);
  if (!landmark) return next;
  if (!next.landmarks.includes(id)) {
    next.landmarks.push(id);
    next.balls = Math.min(99, next.balls + 4);
    next.exp = Math.min(1000000, next.exp + 30);
  }
  if (landmark.kind === 'camp') next.balls = Math.max(12, next.balls);
  return next;
}

export function collectBerry(progress, id) {
  const next = normalizeProgress(progress);
  if (!berryIds.has(id) || next.berries.includes(id)) return next;
  next.berries.push(id);
  next.balls = Math.min(99, next.balls + 3);
  next.exp = Math.min(1000000, next.exp + 10);
  return next;
}

export function getLevel(exp) {
  let current = Math.floor(bounded(exp, 0, 1000000, 0));
  let level = 1;
  let required = 100;
  while (current >= required) {
    current -= required;
    level += 1;
    required = 100 + (level - 1) * 40;
  }
  return { level, current, required };
}

export function getQuests(progress) {
  const state = normalizeProgress(progress);
  return [
    { id: 'first-friend', title: '첫 번째 친구', description: '야생 포켓몬 1마리를 수집하세요.', current: state.caught.length, target: 1 },
    { id: 'wide-world', title: '세상 밖으로', description: '서로 다른 지역 3곳을 탐험하세요.', current: state.discovered.length, target: 3 },
    { id: 'growing-team', title: '함께하는 모험', description: '포켓몬 5마리를 수집하세요.', current: state.caught.length, target: 5 },
    { id: 'island-explorer', title: '섬의 탐험가', description: '캠프와 숲, 호수, 유적의 명소를 모두 방문하세요.', current: state.landmarks.length, target: LANDMARKS.length },
  ].map((quest) => ({ ...quest, current: Math.min(quest.current, quest.target), complete: quest.current >= quest.target }));
}
