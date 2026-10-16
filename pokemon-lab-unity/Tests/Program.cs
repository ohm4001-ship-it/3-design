using System;
using System.Collections.Generic;
using PokeLab;

static class Program
{
    static int count;

    static void Main()
    {
        Test("normalization repairs unsupported configuration without changing its source", () => {
            var source = new CreatureConfig { body = "bad", type = null, color = "#nothex", accent = "#ABCDEF", name = "\0 새 친구\n", size = float.NaN, earSize = 900 };
            var config = GameRules.Normalize(source);
            Equal("round", config.body); Equal("electric", config.type); Equal("#f6cc54", config.color);
            Equal("#abcdef", config.accent); Equal("새 친구", config.name); Equal(1f, config.size); Equal(1.5f, config.earSize);
            Equal("bad", source.body);
            config = GameRules.Normalize(new CreatureConfig { name = new string('가', 30) });
            Equal(16, config.name.Length);
            Equal("나의 친구", GameRules.Normalize(new CreatureConfig { name = "\0   \0" }).name);
        });
        Test("save recovery deduplicates identities and restores finite position and bounds", () => {
            var save = new SaveData { balls = -9, berries = int.MaxValue, xp = -1, x = float.NaN, z = float.PositiveInfinity, partner = null, draft = null };
            save.caught.Add(new CreatureConfig { id = "same" }); save.caught.Add(new CreatureConfig { id = "same" }); save.caught.Add(null);
            save.clearedDungeons.AddRange(new[] { "moss", "moss", "invalid" });
            var restored = GameRules.NormalizeSave(save);
            Equal(0, restored.balls); Equal(99, restored.berries); Equal(0, restored.xp); Equal(0f, restored.x); Equal(0f, restored.z);
            Equal(1, restored.caught.Count); Equal(1, restored.clearedDungeons.Count);
            True(restored.partner != null && restored.draft != null); Equal(3, save.caught.Count);
        });
        Test("saving a creation makes independent collection, draft and partner snapshots", () => {
            var save = new SaveData(); var creature = GameCatalog.Presets[0].Clone();
            True(GameRules.SaveCreature(save, creature)); Equal(1, save.collection.Count);
            True(save.collection[0].id.StartsWith("created-"));
            creature.name = "changed"; save.partner.color = "#000000";
            Equal("피카츄", save.collection[0].name); Equal("#f6cc54", save.collection[0].color);
            for (int i = 1; i < GameRules.CollectionCapacity; i++) True(GameRules.SaveCreature(save, creature));
            True(!GameRules.SaveCreature(save, creature)); Equal(GameRules.CollectionCapacity, save.collection.Count);
        });
        Test("capture spends resources only for a valid throw and rewards a unique catch once", () => {
            var save = new SaveData(); var wild = new CreatureConfig { id = "wild-1" };
            True(!GameRules.TryCapture(save, wild, .2f)); Equal(17, save.balls); Equal(0, save.xp);
            True(GameRules.TryCapture(save, wild, .4f, true)); Equal(16, save.balls); Equal(4, save.berries); Equal(25, save.xp);
            True(!GameRules.TryCapture(save, wild, 1f, true)); Equal(16, save.balls); Equal(4, save.berries); Equal(25, save.xp);
            True(!GameRules.TryCapture(save, new CreatureConfig { id = "bad" }, float.NaN)); Equal(16, save.balls);
            save.balls = 0; True(!GameRules.TryCapture(save, new CreatureConfig { id = "empty" }, 1));
            GameRules.RestAtCamp(save); Equal(18, save.balls); Equal(5, save.berries);
        });
        Test("full capture storage never consumes a ball or berry", () => {
            var save = FullCollection();
            True(!GameRules.TryCapture(save, new CreatureConfig { id = "new" }, 1f, true));
            Equal(18, save.balls); Equal(5, save.berries); Equal(0, save.xp);
        });
        Test("invalid actions and unavailable skills do not advance enemy intent", () => {
            var run = new DungeonRun("moss", GameCatalog.Presets[0]);
            run.Act("heal"); run.Act("invalid"); Equal(0, run.TotalTurns); Equal(100, run.hp); Equal(2, run.potions);
            run.energy = 1; run.Act("skill"); Equal(1, run.energy); Equal(0, run.turn); Equal(40, run.enemyHp);
        });
        Test("enemy intent matches strike, charge and heavy response; guard reduces heavy damage", () => {
            var run = new DungeonRun("moss", GameCatalog.Presets[0]);
            Equal("strike", run.Intent.kind); Equal(9, run.Intent.damage);
            run.Act("guard"); Equal(98, run.hp); Equal("charge", run.Intent.kind); Equal(0, run.Intent.damage);
            run.Act("guard"); Equal(98, run.hp); Equal("heavy", run.Intent.kind); Equal(16, run.Intent.damage);
            run.Act("guard"); Equal(94, run.hp); Equal(3, run.energy); Equal("strike", run.Intent.kind);
        });
        Test("a killing move does not trigger a defeated enemy response", () => {
            var run = new DungeonRun("moss", GameCatalog.Presets[3]);
            run.Act("skill"); Equal(4, run.enemyHp); Equal(91, run.hp);
            run.Act("attack"); Equal("boon", run.phase); Equal(91, run.hp); True(run.Intent == null);
            run.Act("attack"); Equal(2, run.TotalTurns);
        });
        Test("rooms require a unique boon before advancing and completed runs reject extra actions", () => {
            var run = new DungeonRun("moss", GameCatalog.Presets[3]);
            run.Advance(); Equal(0, run.room);
            FinishRoom(run); run.Advance(); Equal(0, run.room);
            run.ChooseBoon("power"); Equal("ready", run.phase); Equal(22, run.attack); Equal(37, run.skill);
            run.ChooseBoon("power"); Equal(22, run.attack); run.Advance(); Equal(1, run.room); Equal(0, run.turn);
            FinishRoom(run); run.ChooseBoon("power"); Equal("boon", run.phase);
            run.ChooseBoon("vitality"); Equal(125, run.maxHp); run.Advance(); Equal(2, run.room);
            FinishRoom(run); True(run.IsCleared); Equal("cleared", run.phase); var turns = run.TotalTurns;
            run.Act("attack"); run.Advance(); Equal(turns, run.TotalTurns); Equal(2, run.room);
        });
        Test("all three dungeons can be completed and each first-clear reward is idempotent", () => {
            var save = new SaveData();
            foreach (var definition in GameCatalog.Dungeons) {
                var run = Complete(definition.id);
                True(run.IsCleared); int previousXp = save.xp; int previousBalls = save.balls;
                True(GameRules.ClaimDungeonReward(save, run));
                Equal(previousXp + definition.rewardXp, save.xp); Equal(previousBalls + definition.rewardBalls, save.balls);
                True(!GameRules.ClaimDungeonReward(save, run)); Equal(previousXp + definition.rewardXp, save.xp);
            }
            Equal(3, save.caught.Count); Equal(3, save.clearedDungeons.Count); Equal(420, save.xp); Equal(5, GameRules.Level(save.xp));
        });
        Test("unfinished or forged completion and full-storage rewards are rejected atomically", () => {
            var save = new SaveData(); var forged = new DungeonRun("moss", GameCatalog.Presets[0]);
            forged.phase = "cleared"; forged.room = 2; forged.enemyHp = 0;
            True(!GameRules.ClaimDungeonReward(save, forged)); Equal(0, save.xp); Equal(0, save.clearedDungeons.Count);
            save = FullCollection(); var run = Complete("moss");
            True(!GameRules.ClaimDungeonReward(save, run)); Equal(18, save.balls); Equal(0, save.xp); Equal(0, save.clearedDungeons.Count);
        });
        Test("defeat ends a run without changing persistent exploration progress", () => {
            var run = new DungeonRun("moon", GameCatalog.Presets[0]); run.hp = 1;
            run.Act("guard"); Equal("defeated", run.phase); Equal(0, run.hp); True(!run.IsCleared); True(run.Intent == null);
            run.Act("heal"); Equal(0, run.hp); Equal(2, run.potions);
        });
        Console.WriteLine("PASS: " + count + " gameplay checks.");
    }

    static SaveData FullCollection()
    {
        var save = new SaveData();
        for (int i = 0; i < GameRules.CaptureCapacity; i++) save.caught.Add(new CreatureConfig { id = "captured-" + i });
        return save;
    }

    static DungeonRun Complete(string dungeon)
    {
        var partner = GameCatalog.Presets[dungeon == "moss" ? 3 : dungeon == "ember" ? 2 : 4];
        var run = new DungeonRun(dungeon, partner);
        for (int room = 0; room < 3; room++) {
            FinishRoom(run);
            if (room < 2) { run.ChooseBoon(room == 0 ? "power" : "vitality"); run.Advance(); }
        }
        return run;
    }

    static void FinishRoom(DungeonRun run)
    {
        int safety = 0;
        while (run.phase == "battle" && safety++ < 100) {
            int skillDamage = (int)Math.Floor(run.skill * (GameRules.IsEffective(run.partner.type, run.Enemy.config.type) ? 1.25f : 1f) + .5f);
            if (run.enemyHp <= run.attack) run.Act("attack");
            else if (run.enemyHp <= skillDamage && run.energy >= 2) run.Act("skill");
            else if (run.hp <= 35 && run.potions > 0) run.Act("heal");
            else if (run.Intent.kind == "heavy") run.Act("guard");
            else run.Act(run.energy >= 2 ? "skill" : "attack");
        }
        True(run.phase == "boon" || run.phase == "cleared", "Expected completed room; got " + run.phase);
    }

    static void Test(string name, Action action)
    {
        try { action(); count++; Console.WriteLine("PASS " + name); }
        catch (Exception ex) { Console.Error.WriteLine("FAIL " + name + ": " + ex.Message); Environment.Exit(1); }
    }
    static void True(bool value, string message = "Assertion was false") { if (!value) throw new Exception(message); }
    static void Equal<T>(T expected, T actual) { if (!EqualityComparer<T>.Default.Equals(expected, actual)) throw new Exception("Expected " + expected + ", got " + actual); }
}
