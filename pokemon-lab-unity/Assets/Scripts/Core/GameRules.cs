using System;
using System.Collections.Generic;
using System.Text;

namespace PokeLab
{
    public static class GameRules
    {
        public const int CollectionCapacity = 24;
        public const int CaptureCapacity = 128;

        public static CreatureConfig Normalize(CreatureConfig source)
        {
            source = source ?? new CreatureConfig();
            var result = new CreatureConfig {
                id = CleanText(source.id, "", 128), name = CleanText(source.name, "나의 친구", 16),
                body = Option(source.body, GameCatalog.Bodies), ears = Option(source.ears, GameCatalog.Ears),
                tail = Option(source.tail, GameCatalog.Tails), eyes = Option(source.eyes, GameCatalog.Eyes),
                accessory = Option(source.accessory, GameCatalog.Accessories), type = Option(source.type, GameCatalog.Types),
                color = Hex(source.color, "#f6cc54"), accent = Hex(source.accent, "#88684c"), belly = Hex(source.belly, "#fff0bd"),
                size = Bounded(source.size, .75f, 1.3f, 1f), earSize = Bounded(source.earSize, .6f, 1.5f, 1f)
            };
            return result;
        }

        public static SaveData NormalizeSave(SaveData source)
        {
            if (source == null) return new SaveData();
            var result = new SaveData {
                partner = Normalize(source.partner ?? GameCatalog.Presets[0]),
                draft = Normalize(source.draft ?? GameCatalog.Presets[0]),
                balls = Clamp(source.balls, 0, 999), berries = Clamp(source.berries, 0, 99), xp = Clamp(source.xp, 0, 1000000),
                x = Bounded(source.x, -150f, 150f, 0f), z = Bounded(source.z, -150f, 150f, 0f),
                collection = NormalizeList(source.collection, CollectionCapacity, "created"),
                caught = NormalizeList(source.caught, CaptureCapacity, "caught")
            };
            if (source.clearedDungeons != null)
                foreach (var id in source.clearedDungeons)
                    if (GameCatalog.Dungeon(id) != null && !result.clearedDungeons.Contains(id)) result.clearedDungeons.Add(id);
            var regions = new[] { "meadow", "forest", "lake", "ruins" };
            if (source.discovered != null)
                foreach (var region in source.discovered)
                    if (Array.IndexOf(regions, region) >= 0 && !result.discovered.Contains(region)) result.discovered.Add(region);
            return result;
        }

        public static int Level(int xp) { return 1 + Math.Max(0, xp) / 100; }

        public static bool SaveCreature(SaveData save, CreatureConfig config)
        {
            if (save == null || config == null) return false;
            if (save.collection == null) save.collection = new List<CreatureConfig>();
            var normalized = Normalize(config);
            // A saved creation always receives its own identity; presets are templates.
            normalized.id = "created-" + Guid.NewGuid().ToString("N");
            if (save.collection.Count >= CollectionCapacity) return false;
            save.collection.Add(normalized);
            save.draft = normalized.Clone();
            save.partner = normalized.Clone();
            return true;
        }

        /// <summary>Timing accuracy is 0..1. A failed throw spends one ball, while invalid attempts spend nothing.</summary>
        public static bool TryCapture(SaveData save, CreatureConfig creature, float accuracy, bool berry = false)
        {
            if (save == null || creature == null || save.balls <= 0 || !Finite(accuracy)) return false;
            if (save.caught == null) save.caught = new List<CreatureConfig>();
            if (save.caught.Count >= CaptureCapacity) return false;
            var normalized = Normalize(creature);
            if (normalized.id.Length > 0 && save.caught.Exists(item => item != null && item.id == normalized.id)) return false;
            bool useBerry = berry && save.berries > 0;
            save.balls--;
            if (useBerry) save.berries--;
            if (accuracy < (useBerry ? .32f : .52f)) return false;
            if (normalized.id.Length == 0) normalized.id = "wild-" + Guid.NewGuid().ToString("N");
            save.caught.Add(normalized);
            save.xp = Clamp(save.xp + 25, 0, 1000000);
            return true;
        }

        public static bool ClaimDungeonReward(SaveData save, DungeonRun run)
        {
            if (save == null || run == null || !run.IsCleared) return false;
            if (save.clearedDungeons == null) save.clearedDungeons = new List<string>();
            if (save.caught == null) save.caught = new List<CreatureConfig>();
            if (save.clearedDungeons.Contains(run.Dungeon.id)) return false;
            string guardianId = "dungeon-" + run.Dungeon.id + "-guardian";
            bool hasGuardian = save.caught.Exists(item => item != null && item.id == guardianId);
            if (!hasGuardian && save.caught.Count >= CaptureCapacity) return false;
            // The marker, guardian and inventory rewards are applied in one synchronous transaction.
            if (!hasGuardian) {
                var guardian = Normalize(run.Dungeon.guardian);
                guardian.id = guardianId;
                save.caught.Add(guardian);
            }
            save.clearedDungeons.Add(run.Dungeon.id);
            save.xp = Clamp(save.xp + run.Dungeon.rewardXp, 0, 1000000);
            save.balls = Clamp(save.balls + run.Dungeon.rewardBalls, 0, 999);
            return true;
        }

        public static void RestAtCamp(SaveData save)
        {
            if (save == null) return;
            save.balls = Math.Max(save.balls, 18);
            save.berries = Math.Max(save.berries, 5);
        }

        public static bool IsEffective(string attackType, string defenseType)
        {
            switch (attackType) {
                case "fire": return defenseType == "grass";
                case "grass": return defenseType == "water";
                case "water": return defenseType == "fire";
                case "electric": return defenseType == "water";
                case "fairy": return defenseType == "ghost";
                case "ghost": return defenseType == "fairy";
                default: return false;
            }
        }

        static List<CreatureConfig> NormalizeList(List<CreatureConfig> source, int limit, string prefix)
        {
            var result = new List<CreatureConfig>();
            var seen = new HashSet<string>();
            if (source == null) return result;
            for (int i = 0; i < source.Count && result.Count < limit; i++) {
                if (source[i] == null) continue;
                var config = Normalize(source[i]);
                if (config.id.Length == 0) config.id = prefix + "-restored-" + i;
                if (seen.Add(config.id)) result.Add(config);
            }
            return result;
        }

        static string Option(string value, string[] options) { return Array.IndexOf(options, value) >= 0 ? value : options[0]; }
        static string Hex(string value, string fallback)
        {
            if (value == null || value.Length != 7 || value[0] != '#') return fallback;
            for (int i = 1; i < value.Length; i++) if (!Uri.IsHexDigit(value[i])) return fallback;
            return value.ToLowerInvariant();
        }
        static string CleanText(string value, string fallback, int maxCharacters)
        {
            if (string.IsNullOrEmpty(value)) return fallback;
            var buffer = new StringBuilder();
            int characters = 0;
            string trimmed = value.Trim();
            for (int i = 0; i < trimmed.Length && characters < maxCharacters; i++) {
                char c = trimmed[i];
                if (char.IsControl(c)) continue;
                if (char.IsHighSurrogate(c)) {
                    if (i + 1 < trimmed.Length && char.IsLowSurrogate(trimmed[i + 1])) {
                        buffer.Append(c).Append(trimmed[++i]); characters++;
                    }
                } else if (!char.IsLowSurrogate(c)) { buffer.Append(c); characters++; }
            }
            string cleaned = buffer.ToString().Trim();
            return cleaned.Length == 0 ? fallback : cleaned;
        }
        static bool Finite(float value) { return !float.IsNaN(value) && !float.IsInfinity(value); }
        static float Bounded(float value, float min, float max, float fallback) { return Finite(value) ? Math.Min(max, Math.Max(min, value)) : fallback; }
        static int Clamp(int value, int min, int max) { return Math.Min(max, Math.Max(min, value)); }
    }
}
