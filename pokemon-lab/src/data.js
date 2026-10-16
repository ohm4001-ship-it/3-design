export const COLLECTION_KEY = 'pokemon-lab.collection.v1';
export const DRAFT_KEY = 'pokemon-lab.draft.v1';

export const TYPES = Object.freeze({
  electric: { label: '전기', color: '#edbb39', symbol: 'ϟ' },
  fire: { label: '불꽃', color: '#ed8867', symbol: '◈' },
  water: { label: '물', color: '#71afcf', symbol: '≈' },
  grass: { label: '풀', color: '#8ab88e', symbol: '✿' },
  fairy: { label: '페어리', color: '#d890b9', symbol: '✦' },
  ghost: { label: '고스트', color: '#9e8ec8', symbol: '☾' },
});

export const DEFAULT_CONFIG = Object.freeze({
  name: '나의 피카츄',
  body: 'round',
  ears: 'long',
  tail: 'bolt',
  eyes: 'round',
  accessory: 'none',
  color: '#f6cc54',
  accent: '#88684c',
  belly: '#fff0bd',
  type: 'electric',
  size: 1,
  earSize: 1,
});

export const PRESETS = [
  {
    id: 'pikachu', name: '피카츄', english: 'Pikachu',
    description: '작은 볼에 반짝이는 전기를 가득!',
    config: { ...DEFAULT_CONFIG },
  },
  {
    id: 'bulbasaur', name: '이상해씨', english: 'Bulbasaur',
    description: '햇살과 함께 자라는 초록빛 친구.',
    config: { ...DEFAULT_CONFIG, name: '나의 이상해씨', body: 'chunky', ears: 'pointy', tail: 'leaf', eyes: 'happy', accessory: 'sprout', color: '#80c7a7', accent: '#397c68', belly: '#c9ebc8', type: 'grass', earSize: 0.7 },
  },
  {
    id: 'squirtle', name: '꼬부기', english: 'Squirtle',
    description: '동글동글, 시원한 물빛 모험가.',
    config: { ...DEFAULT_CONFIG, name: '나의 꼬부기', body: 'round', ears: 'none', tail: 'curly', color: '#80bcd5', accent: '#986b4e', belly: '#f3dfa3', type: 'water', size: 0.9 },
  },
  {
    id: 'charmander', name: '파이리', english: 'Charmander',
    description: '꼬리 끝에 따뜻한 용기를 품었어요.',
    config: { ...DEFAULT_CONFIG, name: '나의 파이리', body: 'slim', ears: 'none', tail: 'flame', color: '#ed9963', accent: '#d46349', belly: '#ffe2ac', type: 'fire', size: 1.05 },
  },
  {
    id: 'eevee', name: '이브이', english: 'Eevee',
    description: '포근한 털 속, 무한한 가능성.',
    config: { ...DEFAULT_CONFIG, name: '나의 이브이', body: 'round', ears: 'long', tail: 'leaf', eyes: 'happy', accessory: 'scarf', color: '#bd8b64', accent: '#624639', belly: '#f4dfb2', type: 'fairy', earSize: 1.15 },
  },
  {
    id: 'gengar', name: '팬텀', english: 'Gengar',
    description: '장난기 가득한 보랏빛 그림자.',
    config: { ...DEFAULT_CONFIG, name: '나의 팬텀', body: 'chunky', ears: 'pointy', tail: 'none', eyes: 'happy', color: '#9985c3', accent: '#625078', belly: '#b6a3d7', type: 'ghost', size: 1.1, earSize: 0.8 },
  },
];

export const PALETTES = [
  { name: '선샤인', color: '#f6cc54', accent: '#88684c', belly: '#fff0bd' },
  { name: '살구', color: '#ed9963', accent: '#d46349', belly: '#ffe2ac' },
  { name: '바다', color: '#80bcd5', accent: '#527eaa', belly: '#d5eff3' },
  { name: '클로버', color: '#80c7a7', accent: '#397c68', belly: '#c9ebc8' },
  { name: '라벤더', color: '#9985c3', accent: '#625078', belly: '#d4c8ec' },
  { name: '딸기 우유', color: '#e7a1b1', accent: '#b36b86', belly: '#ffe0e7' },
  { name: '카라멜', color: '#bd8b64', accent: '#624639', belly: '#f4dfb2' },
  { name: '구름', color: '#d8e1dd', accent: '#839e97', belly: '#f4f4e8' },
];

const OPTIONS = {
  body: ['round', 'slim', 'chunky'],
  ears: ['long', 'pointy', 'round', 'none'],
  tail: ['bolt', 'flame', 'leaf', 'curly', 'none'],
  eyes: ['happy', 'round', 'sleepy'],
  accessory: ['none', 'flower', 'scarf', 'sprout'],
  type: Object.keys(TYPES),
};

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanName(value, fallback = DEFAULT_CONFIG.name) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return Array.from(trimmed).slice(0, 16).join('') || fallback;
}

function boundedNumber(value, min, max, fallback) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

/** Return a fresh, complete config with only supported fields. */
export function normalizeConfig(input) {
  const source = isObject(input) ? input : {};
  const config = { ...DEFAULT_CONFIG, name: cleanName(source.name) };
  for (const [key, values] of Object.entries(OPTIONS)) {
    if (values.includes(source[key])) config[key] = source[key];
  }
  for (const key of ['color', 'accent', 'belly']) {
    if (typeof source[key] === 'string' && /^#[0-9a-f]{6}$/i.test(source[key])) {
      config[key] = source[key].toLowerCase();
    }
  }
  config.size = boundedNumber(source.size, 0.75, 1.3, DEFAULT_CONFIG.size);
  config.earSize = boundedNumber(source.earSize, 0.6, 1.5, DEFAULT_CONFIG.earSize);
  return config;
}

export function randomConfig() {
  const choose = (items) => items[Math.floor(Math.random() * items.length)];
  const palette = choose(PALETTES);
  const names = ['몽글이', '반짝이', '토리', '포포', '보리', '모찌', '구르미', '두두'];
  return normalizeConfig({
    name: choose(names),
    ...Object.fromEntries(Object.entries(OPTIONS).map(([key, values]) => [key, choose(values)])),
    color: palette.color,
    accent: palette.accent,
    belly: palette.belly,
    size: Math.round((0.85 + Math.random() * 0.3) * 100) / 100,
    earSize: Math.round((0.75 + Math.random() * 0.5) * 100) / 100,
  });
}

// Resolve storage lazily: browser privacy settings can throw on property access.
function getStorage(storage) {
  return storage === undefined ? globalThis.localStorage : storage;
}

function readJson(key, storage) {
  try {
    const raw = getStorage(storage)?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value, storage) {
  const target = getStorage(storage);
  if (!target || typeof target.setItem !== 'function') {
    throw new Error('이 브라우저에서는 저장 공간을 사용할 수 없어요.');
  }
  // Let quota and security errors reach the UI so it can explain failed saves.
  target.setItem(key, JSON.stringify(value));
}

function normalizeCollection(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  return items.flatMap((item, index) => {
    if (!isObject(item) || !isObject(item.config)) return [];
    const config = normalizeConfig(item.config);
    const name = cleanName(item.name, config.name);
    config.name = name;
    const id = typeof item.id === 'string' && item.id.trim()
      ? item.id.trim().slice(0, 128)
      : `restored-${index}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const date = (typeof item.createdAt === 'string' || typeof item.createdAt === 'number')
      ? new Date(item.createdAt)
      : new Date(0);
    const createdAt = Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
    const image = typeof item.image === 'string' && /^data:image\/(?:png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(item.image)
      ? item.image
      : '';
    return [{ id, name, config, image, createdAt }];
  }).slice(0, 24);
}

export function loadCollection(storage) {
  return normalizeCollection(readJson(COLLECTION_KEY, storage));
}

export function saveCollection(items, storage) {
  const collection = normalizeCollection(items);
  writeJson(COLLECTION_KEY, collection, storage);
  return collection;
}

export function loadDraft(storage) {
  return normalizeConfig(readJson(DRAFT_KEY, storage));
}

export function saveDraft(config, storage) {
  const draft = normalizeConfig(config);
  writeJson(DRAFT_KEY, draft, storage);
  return draft;
}
