import { PRESETS, normalizeConfig } from './data.js';

const preset = (id, changes = {}) => normalizeConfig({ ...PRESETS.find(item => item.id === id).config, ...changes });
const enemy = (name, config, maxHp, attack) => ({ name, config: normalizeConfig({ ...config, name }), maxHp, attack });
const freeze = value => {
  Object.values(value).forEach(item => { if (item && typeof item === 'object') freeze(item); });
  return Object.freeze(value);
};

export const DUNGEONS = freeze([
  {
    id: 'moss', name: '이끼빛 성소', subtitle: '잎사귀 아래 잠든 첫 번째 모험',
    description: '초록빛 회랑의 봉인을 풀고 숲의 수호자와 친구가 되어보세요.',
    color: '#8fbd93', accent: '#d7edab', floorColor: '#405f57', wallColor: '#577568', difficulty: '입문',
    guardian: preset('bulbasaur', { name: '이끼숲 수호자', color: '#6daa91', accent: '#315e4b', belly: '#d3ebac', accessory: 'sprout', size: 1.2 }),
    rooms: [
      { name: '싹의 회랑', enemy: enemy('새싹 파수꾼', preset('bulbasaur', { size: 0.8 }), 40, 9) },
      { name: '뿌리의 방', enemy: enemy('숲의 길잡이', preset('eevee', { color: '#9eba86', accent: '#55754b', belly: '#dce8b5', type: 'grass' }), 55, 11) },
      { name: '수호자의 정원', enemy: enemy('이끼숲 수호자', preset('bulbasaur', { color: '#6daa91', accent: '#315e4b', belly: '#d3ebac', accessory: 'sprout', size: 1.2 }), 90, 14) },
    ],
    reward: { exp: 100, balls: 6 },
  },
  {
    id: 'ember', name: '잿불 공방', subtitle: '꺼지지 않는 용기를 찾아서',
    description: '붉은 돌길을 따라 전진하세요. 적의 강한 공격 앞에서는 방어가 힘이 됩니다.',
    color: '#d99a77', accent: '#ffd3a0', floorColor: '#5f4541', wallColor: '#805b4d', difficulty: '보통',
    guardian: preset('charmander', { name: '잿불 수호자', color: '#cb795b', accent: '#81432f', belly: '#ffe0a1', size: 1.25 }),
    rooms: [
      { name: '온기의 회랑', enemy: enemy('불씨 파수꾼', preset('charmander', { size: 0.8 }), 48, 11) },
      { name: '용광로의 방', enemy: enemy('황금 불꽃', preset('pikachu', { color: '#d79557', accent: '#8c4932', belly: '#ffdfa1', type: 'fire' }), 64, 13) },
      { name: '잿불의 왕좌', enemy: enemy('잿불 수호자', preset('charmander', { color: '#cb795b', accent: '#81432f', belly: '#ffe0a1', size: 1.25 }), 105, 16) },
    ],
    reward: { exp: 140, balls: 6 },
  },
  {
    id: 'moon', name: '달그림자 유적', subtitle: '고요한 달빛 너머의 비밀',
    description: '회복약과 축복을 아껴 마지막 수호자에게 도전하세요.',
    color: '#aaa0d1', accent: '#e8d5ff', floorColor: '#49475e', wallColor: '#69617d', difficulty: '도전',
    guardian: preset('gengar', { name: '달그림자 수호자', color: '#8f7db7', accent: '#514760', belly: '#ddd1f1', size: 1.3 }),
    rooms: [
      { name: '별의 회랑', enemy: enemy('별빛 파수꾼', preset('gengar', { color: '#b0a4ce', size: 0.8 }), 54, 12) },
      { name: '메아리의 방', enemy: enemy('달빛 메아리', preset('eevee', { color: '#b0a3cb', accent: '#685776', belly: '#e3d5f0', type: 'ghost' }), 72, 14) },
      { name: '달그림자의 제단', enemy: enemy('달그림자 수호자', preset('gengar', { color: '#8f7db7', accent: '#514760', belly: '#ddd1f1', size: 1.3 }), 118, 18) },
    ],
    reward: { exp: 180, balls: 6 },
  },
]);

export const BOONS = freeze([
  { id: 'power', name: '용기의 축복', description: '기본 공격 +5 · 속성 기술 +8' },
  { id: 'vitality', name: '생명의 축복', description: '최대 체력 +25 · 체력 35 회복' },
  { id: 'ward', name: '수호의 축복', description: '받는 피해 25% 감소' },
]);

const statuses = new Set(['exploring', 'battle', 'boon', 'cleared', 'failed']);
const boonIds = new Set(BOONS.map(item => item.id));
const advantage = { fire: 'grass', grass: 'water', water: 'fire', electric: 'water', fairy: 'ghost', ghost: 'fairy' };
const copy = run => run == null ? null : structuredClone(run);
const log = (run, message) => { run.log = [...run.log.slice(-7), message]; };
const definition = run => DUNGEONS.find(item => item.id === run?.dungeonId);
const finite = value => typeof value === 'number' && Number.isFinite(value);

function isRun(run) {
  const dungeon = definition(run);
  return !!dungeon && Number.isInteger(run.roomIndex) && run.roomIndex >= 0 && run.roomIndex < dungeon.rooms.length
    && run.partner && typeof run.partner === 'object' && statuses.has(run.status)
    && finite(run.hp) && finite(run.maxHp) && run.maxHp >= 1 && run.hp >= 0 && run.hp <= run.maxHp
    && Number.isInteger(run.energy) && run.energy >= 0 && run.energy <= 3
    && Number.isInteger(run.potions) && run.potions >= 0 && run.potions <= 2
    && finite(run.attack) && run.attack > 0 && finite(run.skill) && run.skill > 0
    && Array.isArray(run.boons) && run.boons.every(id => boonIds.has(id)) && new Set(run.boons).size === run.boons.length
    && run.boons.length >= run.roomIndex && run.boons.length <= Math.min(2, run.roomIndex + 1)
    && Array.isArray(run.roomCleared) && run.roomCleared.every(index => Number.isInteger(index) && index >= 0 && index < 3)
    && new Set(run.roomCleared).size === run.roomCleared.length
    && run.roomCleared.every(index => index <= run.roomIndex)
    && Array.from({ length: run.roomIndex }, (_, index) => index).every(index => run.roomCleared.includes(index))
    && Number.isInteger(run.turns) && run.turns >= 0 && Array.isArray(run.log);
}

/** A run is deliberately temporary. The overworld keeps its own safe return position. */
export function createRun(dungeonId, partner) {
  if (!DUNGEONS.some(item => item.id === dungeonId)) return null;
  return {
    dungeonId, partner: normalizeConfig(partner), roomIndex: 0, hp: 100, maxHp: 100,
    energy: 3, potions: 2, attack: 17, skill: 29, boons: [], roomCleared: [],
    status: 'exploring', battle: null, turns: 0, log: ['던전 입구에 도착했어요. 파수꾼에게 다가가세요.'],
  };
}

/** The displayed intent is exactly the response that the next valid player action triggers. */
export function getIntent(run) {
  if (!run?.battle || !finite(run.battle.enemy?.attack) || !Number.isInteger(run.battle.turn) || run.battle.turn < 0) return null;
  const stage = run.battle.turn % 3;
  if (stage === 1) return { name: '힘 모으기', description: '이번 턴은 공격하지 않아요. 다음 턴에 강한 공격을 준비해요.', damage: 0, kind: 'charge' };
  const heavy = stage === 2;
  return {
    name: heavy ? '강한 일격' : '가벼운 공격',
    description: heavy ? '강한 공격이 다가와요. 방어로 피해를 줄여보세요.' : '기본 공격을 준비하고 있어요.',
    damage: Math.round(run.battle.enemy.attack * (heavy ? 1.8 : 1)), kind: heavy ? 'heavy' : 'strike',
  };
}

export function startBattle(run) {
  const next = copy(run);
  if (!isRun(run) || run.status !== 'exploring' || run.hp <= 0 || run.roomCleared.includes(run.roomIndex)) return next;
  const foe = copy(definition(run).rooms[run.roomIndex].enemy);
  next.status = 'battle';
  next.battle = { enemy: foe, enemyHp: foe.maxHp, enemyMaxHp: foe.maxHp, turn: 0, intent: null };
  next.battle.intent = getIntent(next);
  log(next, `${foe.name} 등장! 다음 행동을 보고 전략을 골라보세요.`);
  return next;
}

export function takeTurn(run, action) {
  const next = copy(run);
  if (!isRun(run) || run.status !== 'battle' || !run.battle || run.hp <= 0
    || !finite(run.battle.enemyHp) || run.battle.enemyHp <= 0 || !getIntent(run)
    || !['attack', 'skill', 'guard', 'heal'].includes(action)
    || (action === 'skill' && run.energy < 2) || (action === 'heal' && (run.potions < 1 || run.hp >= run.maxHp))) return next;

  const intent = getIntent(run);
  let dealt = 0;
  if (action === 'attack') {
    dealt = Math.round(run.attack);
    next.energy = Math.min(3, run.energy + 1);
    log(next, `기본 공격! ${dealt} 피해 · 에너지 +1`);
  } else if (action === 'skill') {
    const effective = advantage[run.partner.type] === run.battle.enemy.config.type;
    dealt = Math.round(run.skill * (effective ? 1.25 : 1));
    next.energy -= 2;
    log(next, `속성 기술! ${dealt} 피해${effective ? ' · 효과가 좋아요!' : ''}`);
  } else if (action === 'guard') {
    next.energy = Math.min(3, run.energy + 1);
    log(next, '방어 자세! 이번 턴 받는 피해 75% 감소 · 에너지 +1');
  } else {
    const healed = Math.min(40, run.maxHp - run.hp);
    next.potions -= 1;
    next.hp += healed;
    log(next, `회복약으로 체력 ${healed} 회복!`);
  }
  next.turns += 1;
  next.battle.enemyHp = Math.max(0, run.battle.enemyHp - dealt);
  if (next.battle.enemyHp === 0) {
    next.roomCleared.push(run.roomIndex);
    next.status = run.roomIndex === 2 ? 'cleared' : 'boon';
    next.battle.intent = null;
    log(next, next.status === 'cleared' ? '수호자의 시험을 통과했어요! 던전 탐험 완료.' : '방의 봉인이 풀렸어요! 다음 방에 가기 전 축복을 선택하세요.');
    return next;
  }

  // Even repeated guarding takes chip damage; energy never grows beyond three.
  const reduction = (action === 'guard' ? 0.25 : 1) * (run.boons.includes('ward') ? 0.75 : 1);
  const received = intent.damage > 0 ? Math.max(1, Math.round(intent.damage * reduction)) : 0;
  next.hp = Math.max(0, next.hp - received);
  log(next, received ? `${run.battle.enemy.name}의 ${intent.name}! 체력 -${received}` : `${run.battle.enemy.name}가 힘을 모으고 있어요.`);
  next.battle.turn += 1;
  if (next.hp === 0) {
    next.status = 'failed';
    next.battle.intent = null;
    log(next, '잠시 쉬어갈 시간이에요. 기존 친구와 모험 기록은 그대로예요.');
  } else next.battle.intent = getIntent(next);
  return next;
}

export function chooseBoon(run, id) {
  const next = copy(run);
  if (!isRun(run) || run.status !== 'boon' || run.roomIndex >= 2 || !run.roomCleared.includes(run.roomIndex)
    || run.boons.length !== run.roomIndex || !boonIds.has(id) || run.boons.includes(id)) return next;
  next.boons.push(id);
  if (id === 'power') { next.attack += 5; next.skill += 8; }
  if (id === 'vitality') { next.maxHp += 25; next.hp = Math.min(next.maxHp, next.hp + 35); }
  next.status = 'exploring';
  log(next, `${BOONS.find(boon => boon.id === id).name}을 받았어요. 열린 문으로 이동하세요.`);
  return next;
}

export function advanceRoom(run) {
  const next = copy(run);
  if (!isRun(run) || run.status !== 'exploring' || run.roomIndex >= 2 || !run.roomCleared.includes(run.roomIndex)
    || run.boons.length !== run.roomIndex + 1) return next;
  next.roomIndex += 1;
  next.battle = null;
  log(next, `${definition(run).rooms[next.roomIndex].name}에 도착했어요.`);
  return next;
}

/** Used by reward code so intermediate, failed, or malformed runs cannot claim a clear. */
export function isClearedRun(run) {
  return isRun(run) && run.status === 'cleared' && run.hp > 0 && run.roomIndex === 2
    && run.roomCleared.length === 3 && [0, 1, 2].every(index => run.roomCleared.includes(index))
    && run.boons.length === 2 && run.battle?.enemyHp === 0
    && run.battle?.enemy?.name === definition(run).guardian.name;
}
