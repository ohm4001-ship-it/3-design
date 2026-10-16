using System;
using System.Collections.Generic;

namespace PokeLab
{
    /// <summary>A temporary expedition. Only a verified completed run can grant permanent rewards.</summary>
    public sealed class DungeonRun
    {
        public readonly string dungeonId;
        public readonly CreatureConfig partner;
        public int hp = 100, maxHp = 100, energy = 3, potions = 2;
        public int room, enemyHp, attack = 17, skill = 29, turn;
        public string phase = "battle";
        readonly List<string> boons = new List<string>();
        int roomsCompleted;
        int totalTurns;
        public DungeonDefinition Dungeon { get; private set; }
        public EnemyDefinition Enemy { get { return Dungeon.rooms[room].enemy; } }
        public string RoomName { get { return Dungeon.rooms[room].name; } }
        public IReadOnlyList<string> Boons { get { return boons.AsReadOnly(); } }
        public int TotalTurns { get { return totalTurns; } }
        public bool IsCleared { get { return phase == "cleared" && hp > 0 && room == 2 && roomsCompleted == 3 && boons.Count == 2 && enemyHp == 0; } }

        public EnemyIntent Intent {
            get {
                if (phase != "battle") return null;
                if (turn % 3 == 1) return new EnemyIntent("charge", "힘 모으기", "이번 턴은 공격하지 않아요. 다음 턴의 강한 공격을 준비해요.", 0);
                bool heavy = turn % 3 == 2;
                return new EnemyIntent(heavy ? "heavy" : "strike", heavy ? "강한 일격" : "가벼운 공격",
                    heavy ? "방어로 강한 공격의 피해를 줄여보세요." : "기본 공격을 준비하고 있어요.", Round(Enemy.attack * (heavy ? 1.8f : 1f)));
            }
        }

        public DungeonRun(string dungeonId, CreatureConfig partner)
        {
            Dungeon = GameCatalog.Dungeon(dungeonId);
            if (Dungeon == null) throw new ArgumentException("알 수 없는 던전입니다.", "dungeonId");
            this.dungeonId = dungeonId;
            this.partner = GameRules.Normalize(partner);
            enemyHp = Enemy.maxHp;
        }

        public string Act(string action)
        {
            if (phase != "battle" || hp <= 0 || enemyHp <= 0) return "지금은 행동할 수 없어요.";
            if (action != "attack" && action != "skill" && action != "guard" && action != "heal") return "알 수 없는 행동이에요.";
            if (action == "skill" && energy < 2) return "에너지가 부족해요. 기본 공격이나 방어로 모아보세요.";
            if (action == "heal" && potions <= 0) return "남은 회복약이 없어요.";
            if (action == "heal" && hp >= maxHp) return "체력이 이미 가득해요.";
            EnemyIntent intent = Intent;
            int dealt = 0;
            string result;
            if (action == "attack") {
                dealt = attack; energy = Math.Min(3, energy + 1);
                result = "기본 공격! " + dealt + " 피해 · 에너지 +1";
            } else if (action == "skill") {
                bool effective = GameRules.IsEffective(partner.type, Enemy.config.type);
                dealt = Round(skill * (effective ? 1.25f : 1f)); energy -= 2;
                result = "속성 기술! " + dealt + " 피해" + (effective ? " · 효과가 좋아요!" : "");
            } else if (action == "guard") {
                energy = Math.Min(3, energy + 1);
                result = "방어 자세! 받는 피해 75% 감소 · 에너지 +1";
            } else {
                int healed = Math.Min(40, maxHp - hp); potions--; hp += healed;
                result = "회복약으로 체력 " + healed + " 회복!";
            }
            totalTurns++;
            enemyHp = Math.Max(0, enemyHp - dealt);
            if (enemyHp == 0) {
                roomsCompleted++;
                phase = room == 2 ? "cleared" : "boon";
                return result + (phase == "cleared" ? "\n수호자의 시험을 통과했어요! 탐험 완료." : "\n봉인이 풀렸어요. 축복을 골라주세요.");
            }
            float reduction = (action == "guard" ? .25f : 1f) * (boons.Contains("ward") ? .75f : 1f);
            int received = intent.damage > 0 ? Math.Max(1, Round(intent.damage * reduction)) : 0;
            hp = Math.Max(0, hp - received); turn++;
            if (hp == 0) {
                phase = "defeated";
                return result + "\n잠시 쉬어갈 시간이에요. 수집한 친구와 기록은 그대로예요.";
            }
            return result + (received > 0 ? "\n" + Enemy.name + "의 " + intent.name + "! 체력 -" + received : "\n" + Enemy.name + "가 힘을 모으고 있어요.");
        }

        public string ChooseBoon(string id)
        {
            if (phase != "boon" || room >= 2 || roomsCompleted != room + 1 || boons.Count != room) return "지금은 축복을 선택할 수 없어요.";
            BoonDefinition definition = Array.Find(GameCatalog.Boons, item => item.id == id);
            if (definition == null) return "알 수 없는 축복이에요.";
            if (boons.Contains(id)) return "이미 받은 축복이에요. 다른 축복을 골라주세요.";
            boons.Add(id);
            if (id == "power") { attack += 5; skill += 8; }
            if (id == "vitality") { maxHp += 25; hp = Math.Min(maxHp, hp + 35); }
            phase = "ready";
            return definition.name + "을 받았어요. 다음 방으로 이동하세요.";
        }

        public string Advance()
        {
            if (phase != "ready" || room >= 2 || roomsCompleted != room + 1 || boons.Count != room + 1) return "먼저 파수꾼을 이기고 축복을 골라주세요.";
            room++; turn = 0; enemyHp = Enemy.maxHp; phase = "battle";
            return RoomName + "에 도착했어요. " + Enemy.name + " 등장!";
        }

        public bool HasBoon(string id) { return boons.Contains(id); }
        static int Round(float value) { return (int)Math.Floor(value + .5f); }
    }
}
