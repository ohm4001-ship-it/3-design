using System;
using System.Collections.Generic;

namespace PokeLab
{
    [Serializable]
    public sealed class CreatureConfig
    {
        public string id = "";
        public string name = "나의 피카츄";
        public string body = "round";
        public string ears = "long";
        public string tail = "bolt";
        public string eyes = "round";
        public string accessory = "none";
        public string color = "#f6cc54";
        public string accent = "#88684c";
        public string belly = "#fff0bd";
        public string type = "electric";
        public float size = 1f;
        public float earSize = 1f;

        public CreatureConfig Clone() { return (CreatureConfig)MemberwiseClone(); }
    }

    [Serializable]
    public sealed class SaveData
    {
        public int version = 1;
        public List<CreatureConfig> collection = new List<CreatureConfig>();
        public List<CreatureConfig> caught = new List<CreatureConfig>();
        public CreatureConfig partner = GameCatalog.Presets[0].Clone();
        public CreatureConfig draft = GameCatalog.Presets[0].Clone();
        public int balls = 18;
        public int berries = 5;
        public int xp;
        public List<string> clearedDungeons = new List<string>();
        public List<string> discovered = new List<string> { "meadow" };
        public float x;
        public float z;
    }

    [Serializable]
    public sealed class Palette
    {
        public string name, color, accent, belly;
        public Palette(string name, string color, string accent, string belly)
        { this.name = name; this.color = color; this.accent = accent; this.belly = belly; }
    }

    [Serializable]
    public sealed class EnemyDefinition
    {
        public string name;
        public CreatureConfig config;
        public int maxHp, attack;
    }

    [Serializable]
    public sealed class RoomDefinition
    {
        public string name;
        public EnemyDefinition enemy;
    }

    [Serializable]
    public sealed class DungeonDefinition
    {
        public string id, name, subtitle, description, color, accent, floorColor, wallColor, difficulty;
        public CreatureConfig guardian;
        public RoomDefinition[] rooms;
        public int rewardXp, rewardBalls;
    }

    [Serializable]
    public sealed class BoonDefinition
    {
        public string id, name, description;
        public BoonDefinition(string id, string name, string description)
        { this.id = id; this.name = name; this.description = description; }
    }

    public sealed class EnemyIntent
    {
        public readonly string kind, name, description;
        public readonly int damage;
        public EnemyIntent(string kind, string name, string description, int damage)
        { this.kind = kind; this.name = name; this.description = description; this.damage = damage; }
    }
}
