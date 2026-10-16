import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, PRESETS } from '../src/data.js';
import { DUNGEONS, BOONS, createRun, startBattle, takeTurn, chooseBoon, advanceRoom, getIntent, isClearedRun } from '../src/dungeon-data.js';
import { WORLD_KEY, MAX_CAUGHT, normalizeProgress, loadProgress, saveProgress, claimDungeonReward } from '../src/world-data.js';

function playToClear(id = 'moss', partner = DEFAULT_CONFIG) {
  let run = createRun(id, partner);
  for (let steps = 0; steps < 150 && !['cleared', 'failed'].includes(run.status); steps += 1) {
    if (run.status === 'exploring') run = run.roomCleared.includes(run.roomIndex) ? advanceRoom(run) : startBattle(run);
    else if (run.status === 'boon') run = chooseBoon(run, run.roomIndex === 0 ? 'power' : 'vitality');
    else {
      const intent = getIntent(run);
      const action = run.hp <= run.maxHp - 40 && run.potions && intent.kind !== 'heavy' ? 'heal'
        : intent.kind === 'heavy' ? 'guard' : run.energy >= 2 ? 'skill' : 'attack';
      run = takeTurn(run, action);
    }
  }
  return run;
}

function clearFirstRoom() {
  let run = startBattle(createRun('moss', DEFAULT_CONFIG));
  while (run.status === 'battle') run = takeTurn(run, run.energy >= 2 ? 'skill' : 'attack');
  return run;
}

test('new runs normalize the chosen creation and isolate mutable run data', () => {
  const source = { ...DEFAULT_CONFIG, name: '내 친구', color: '#abcdef' };
  const one = createRun('moss', source);
  const two = createRun('moss', source);
  assert.equal(one.partner.name, source.name);
  assert.equal(one.partner.color, source.color);
  assert.equal(one.hp, 100);
  assert.equal(one.potions, 2);
  assert.equal(one.status, 'exploring');
  one.partner.name = '변경';
  one.log.push('새 기록');
  assert.equal(source.name, '내 친구');
  assert.equal(two.partner.name, '내 친구');
  assert.equal(two.log.length, 1);
  assert.equal(createRun('missing', source), null);
  assert.equal(DUNGEONS.length, 3);
  assert.ok(DUNGEONS.every(d => d.rooms.length === 3 && Object.isFrozen(d.rooms)));
  assert.deepEqual(BOONS.map(b => b.id), ['power', 'vitality', 'ward']);
});

test('intent predicts the actual strike, charge, and heavy response; guarding reduces damage', () => {
  const initial = startBattle(createRun('moss', DEFAULT_CONFIG));
  const frozen = structuredClone(initial);
  assert.equal(initial.battle.intent.kind, 'strike');
  let run = takeTurn(initial, 'guard');
  assert.equal(run.hp, 98);
  assert.equal(run.battle.intent.kind, 'charge');
  run = takeTurn(run, 'guard');
  assert.equal(run.hp, 98);
  assert.equal(run.battle.intent.kind, 'heavy');
  assert.equal(run.battle.intent.damage, 16);
  run = takeTurn(run, 'guard');
  assert.equal(run.hp, 94);
  assert.equal(run.battle.intent.kind, 'strike');
  assert.equal(run.energy, 3);
  assert.equal(run.battle.enemyHp, initial.battle.enemyHp);
  assert.deepEqual(initial, frozen);
});

test('unavailable skills, healing, and invalid actions never advance the enemy turn', () => {
  const initial = startBattle(createRun('moon', DEFAULT_CONFIG));
  const spent = takeTurn(initial, 'skill');
  assert.equal(spent.energy, 1);
  assert.deepEqual(takeTurn(spent, 'skill'), spent);
  assert.deepEqual(takeTurn(initial, 'heal'), initial);
  assert.deepEqual(takeTurn({ ...spent, potions: 0 }, 'heal'), { ...spent, potions: 0 });
  for (const action of ['', null, 'delete', 'flee']) assert.deepEqual(takeTurn(initial, action), initial);
  const recovered = takeTurn(spent, 'attack');
  assert.equal(recovered.energy, 2);
  const hurt = { ...initial, hp: 50 };
  const healed = takeTurn(hurt, 'heal');
  assert.equal(healed.potions, 1);
  assert.equal(healed.hp, 78);
  assert.equal(healed.turns, 1);
  assert.equal(healed.battle.turn, 1);
  assert.equal(hurt.hp, 50);
});

test('matching type advantages affect only skill damage and never require a particular creation', () => {
  const fire = startBattle(createRun('moss', { ...DEFAULT_CONFIG, type: 'fire' }));
  const neutral = startBattle(createRun('moss', DEFAULT_CONFIG));
  assert.equal(takeTurn(fire, 'skill').battle.enemyHp, 4);
  assert.equal(takeTurn(neutral, 'skill').battle.enemyHp, 11);
  assert.equal(takeTurn(fire, 'attack').battle.enemyHp, 23);
});

test('gates require a cleared room and one unique boon; boons and advances cannot be repeated', () => {
  const initial = createRun('moss', DEFAULT_CONFIG);
  assert.deepEqual(advanceRoom(initial), initial);
  assert.deepEqual(chooseBoon(initial, 'power'), initial);
  assert.deepEqual(startBattle({ ...initial, roomIndex: 2 }), { ...initial, roomIndex: 2 });
  assert.deepEqual(advanceRoom({ ...initial, roomIndex: -1 }), { ...initial, roomIndex: -1 });
  let run = clearFirstRoom();
  assert.equal(run.status, 'boon');
  assert.deepEqual(run.roomCleared, [0]);
  assert.deepEqual(advanceRoom(run), run);
  assert.deepEqual(startBattle(run), run);
  assert.deepEqual(chooseBoon(run, 'unknown'), run);
  run = chooseBoon(run, 'power');
  assert.equal(run.attack, 22);
  assert.equal(run.skill, 37);
  assert.equal(run.status, 'exploring');
  assert.deepEqual(chooseBoon(run, 'power'), run);
  assert.deepEqual(startBattle(run), run);
  run = advanceRoom(run);
  assert.equal(run.roomIndex, 1);
  assert.equal(run.battle, null);
  assert.deepEqual(advanceRoom(run), run);
  run = startBattle(run);
  while (run.status === 'battle') run = takeTurn(run, run.energy >= 2 ? 'skill' : 'attack');
  assert.deepEqual(chooseBoon(run, 'power'), run);
  const vital = chooseBoon(run, 'vitality');
  assert.equal(vital.maxHp, 125);
  assert.equal(vital.hp, Math.min(125, run.hp + 35));
  const ward = chooseBoon(run, 'ward');
  const wardBattle = startBattle(advanceRoom(ward));
  assert.equal(takeTurn(wardBattle, 'guard').hp, wardBattle.hp - 3);
});

test('all three dungeons are winnable with every preset using visible intents and finite resources', () => {
  for (const dungeon of DUNGEONS) {
    for (const preset of PRESETS) {
      const run = playToClear(dungeon.id, preset.config);
      assert.equal(run.status, 'cleared', `${dungeon.id} with ${preset.id}`);
      assert.ok(run.hp > 0 && run.turns < 35);
      assert.ok(run.potions >= 0 && run.potions <= 2);
      assert.ok(isClearedRun(run));
      assert.deepEqual(advanceRoom(run), run);
      assert.deepEqual(takeTurn(run, 'attack'), run);
      assert.equal(run.battle.intent, null);
    }
  }
});

test('endless guarding causes a recoverable failure without creating any reward', () => {
  let run = startBattle(createRun('moon', DEFAULT_CONFIG));
  for (let turn = 0; turn < 150 && run.status === 'battle'; turn += 1) run = takeTurn(run, 'guard');
  assert.equal(run.status, 'failed');
  assert.equal(run.hp, 0);
  assert.equal(run.energy, 3);
  assert.deepEqual(run.roomCleared, []);
  assert.deepEqual(takeTurn(run, 'heal'), run);
  assert.equal(isClearedRun(run), false);
  const fresh = createRun('moon', run.partner);
  assert.equal(fresh.hp, 100);
  assert.equal(fresh.potions, 2);
});

test('old saves migrate without losing progress, and dungeon metadata rejects unknown IDs', () => {
  const oldSave = { position: { x: 15, z: -25 }, balls: 22, exp: 145, discovered: ['forest'], partnerId: 'my-creation', caught: [{ spawnId: 'wild-pikachu-1', config: DEFAULT_CONFIG }] };
  const migrated = normalizeProgress(oldSave);
  assert.deepEqual(migrated.position, oldSave.position);
  assert.equal(migrated.balls, 22);
  assert.equal(migrated.exp, 145);
  assert.equal(migrated.partnerId, 'my-creation');
  assert.equal(migrated.caught.length, 1);
  assert.deepEqual(migrated.dungeons, { cleared: [] });
  const invalid = normalizeProgress({ ...oldSave, dungeons: { cleared: ['moss', 'moss', 'bogus', '__proto__'], room: 99 } });
  assert.deepEqual(invalid.dungeons, { cleared: ['moss'] });
  const store = new Map([[WORLD_KEY, JSON.stringify(oldSave)]]);
  const storage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) };
  const claimed = claimDungeonReward(loadProgress(storage), playToClear('moon'), 0).progress;
  saveProgress(claimed, storage);
  const restored = loadProgress(storage);
  assert.deepEqual(restored, claimed);
  assert.equal(restored.caught.at(-1).spawnId, 'dungeon-moon-guardian');
  assert.equal(restored.caught.at(-1).caughtAt, '1970-01-01T00:00:00.000Z');
  assert.deepEqual(restored.position, oldSave.position);
});

test('a verified clear grants its first reward exactly once and rejects incomplete runs', () => {
  let progress = normalizeProgress({ exp: 5, balls: 2, position: { x: -10, z: 31 } });
  for (const dungeon of DUNGEONS) {
    const run = playToClear(dungeon.id);
    const before = structuredClone(progress);
    const claimed = claimDungeonReward(progress, run, 0);
    assert.equal(claimed.reason, 'claimed');
    assert.equal(claimed.claimed, true);
    assert.equal(claimed.progress.exp, progress.exp + dungeon.reward.exp);
    assert.equal(claimed.progress.balls, progress.balls + 6);
    assert.equal(claimed.progress.caught.at(-1).name, dungeon.guardian.name);
    assert.deepEqual(claimed.progress.position, progress.position);
    assert.deepEqual(progress, before);
    const duplicate = claimDungeonReward(claimed.progress, run, 999);
    assert.equal(duplicate.reason, 'already-claimed');
    assert.equal(duplicate.claimed, false);
    assert.deepEqual(duplicate.progress, claimed.progress);
    progress = claimed.progress;
  }
  for (const invalid of [null, {}, createRun('moss', DEFAULT_CONFIG), { ...playToClear(), roomCleared: [2] }, { ...playToClear(), status: 'failed' }]) {
    const result = claimDungeonReward(progress, invalid);
    assert.equal(result.reason, 'invalid-run');
    assert.deepEqual(result.progress, progress);
  }
});

test('capacity refuses the entire reward without consuming it, and capped resources stay bounded', () => {
  const caught = Array.from({ length: MAX_CAUGHT }, (_, index) => ({ spawnId: `custom-friend-${index}`, config: DEFAULT_CONFIG }));
  const progress = normalizeProgress({ caught, balls: 9, exp: 40 });
  const run = playToClear();
  const result = claimDungeonReward(progress, run);
  assert.equal(result.reason, 'capacity');
  assert.equal(result.claimed, false);
  assert.deepEqual(result.progress, progress);
  const retry = claimDungeonReward({ ...progress, caught: progress.caught.slice(1) }, run);
  assert.equal(retry.claimed, true);
  assert.equal(retry.progress.caught.length, MAX_CAUGHT);
  assert.equal(retry.progress.caught.at(-1).spawnId, 'dungeon-moss-guardian');
  const capped = claimDungeonReward({ balls: 98, exp: 999999 }, run);
  assert.equal(capped.progress.balls, 99);
  assert.equal(capped.progress.exp, 1000000);
});
