namespace PokeLab
{
    public static class GameCatalog
    {
        public static readonly string[] Types = { "electric", "fire", "water", "grass", "fairy", "ghost" };
        public static readonly string[] TypeNames = { "전기", "불꽃", "물", "풀", "페어리", "고스트" };
        public static readonly string[] Bodies = { "round", "slim", "chunky" };
        public static readonly string[] Ears = { "long", "pointy", "round", "none" };
        public static readonly string[] Tails = { "bolt", "flame", "leaf", "curly", "none" };
        public static readonly string[] Eyes = { "round", "happy", "sleepy" };
        public static readonly string[] Accessories = { "none", "flower", "scarf", "sprout" };

        public static readonly CreatureConfig[] Presets = {
            new CreatureConfig { id = "pikachu", name = "피카츄" },
            new CreatureConfig { id = "bulbasaur", name = "이상해씨", body = "chunky", ears = "pointy", tail = "leaf", eyes = "happy", accessory = "sprout", color = "#80c7a7", accent = "#397c68", belly = "#c9ebc8", type = "grass", earSize = .7f },
            new CreatureConfig { id = "squirtle", name = "꼬부기", ears = "none", tail = "curly", color = "#80bcd5", accent = "#986b4e", belly = "#f3dfa3", type = "water", size = .9f },
            new CreatureConfig { id = "charmander", name = "파이리", body = "slim", ears = "none", tail = "flame", color = "#ed9963", accent = "#d46349", belly = "#ffe2ac", type = "fire", size = 1.05f },
            new CreatureConfig { id = "eevee", name = "이브이", tail = "leaf", eyes = "happy", accessory = "scarf", color = "#bd8b64", accent = "#624639", belly = "#f4dfb2", type = "fairy", earSize = 1.15f },
            new CreatureConfig { id = "gengar", name = "팬텀", body = "chunky", ears = "pointy", tail = "none", eyes = "happy", color = "#9985c3", accent = "#625078", belly = "#b6a3d7", type = "ghost", size = 1.1f, earSize = .8f }
        };

        public static readonly Palette[] Palettes = {
            new Palette("선샤인", "#f6cc54", "#88684c", "#fff0bd"),
            new Palette("살구", "#ed9963", "#d46349", "#ffe2ac"),
            new Palette("바다", "#80bcd5", "#527eaa", "#d5eff3"),
            new Palette("클로버", "#80c7a7", "#397c68", "#c9ebc8"),
            new Palette("라벤더", "#9985c3", "#625078", "#d4c8ec"),
            new Palette("딸기 우유", "#e7a1b1", "#b36b86", "#ffe0e7"),
            new Palette("카라멜", "#bd8b64", "#624639", "#f4dfb2"),
            new Palette("구름", "#d8e1dd", "#839e97", "#f4f4e8")
        };

        public static readonly BoonDefinition[] Boons = {
            new BoonDefinition("power", "용기의 축복", "기본 공격 +5 · 속성 기술 +8"),
            new BoonDefinition("vitality", "생명의 축복", "최대 체력 +25 · 체력 35 회복"),
            new BoonDefinition("ward", "수호의 축복", "받는 피해 25% 감소")
        };

        public static readonly DungeonDefinition[] Dungeons = CreateDungeons();

        public static string TypeLabel(string type)
        {
            for (int i = 0; i < Types.Length; i++) if (Types[i] == type) return TypeNames[i];
            return TypeNames[0];
        }

        public static DungeonDefinition Dungeon(string id)
        {
            for (int i = 0; i < Dungeons.Length; i++) if (Dungeons[i].id == id) return Dungeons[i];
            return null;
        }

        static CreatureConfig Variant(int preset, string name, string color, string accent, string belly, string type, float size)
        {
            var config = Presets[preset].Clone();
            config.name = name; config.color = color; config.accent = accent; config.belly = belly;
            config.type = type; config.size = size;
            return config;
        }

        static RoomDefinition Room(string roomName, CreatureConfig config, int hp, int attack)
        {
            return new RoomDefinition { name = roomName, enemy = new EnemyDefinition { name = config.name, config = config, maxHp = hp, attack = attack } };
        }

        static DungeonDefinition[] CreateDungeons()
        {
            var moss = Variant(1, "이끼숲 수호자", "#6daa91", "#315e4b", "#d3ebac", "grass", 1.2f);
            var ember = Variant(3, "잿불 수호자", "#cb795b", "#81432f", "#ffe0a1", "fire", 1.25f);
            var moon = Variant(5, "달그림자 수호자", "#8f7db7", "#514760", "#ddd1f1", "ghost", 1.3f);
            return new[] {
                new DungeonDefinition {
                    id = "moss", name = "이끼빛 성소", subtitle = "잎사귀 아래 잠든 첫 번째 모험",
                    description = "초록빛 회랑의 봉인을 풀고 숲의 수호자와 친구가 되어보세요.",
                    color = "#8fbd93", accent = "#d7edab", floorColor = "#405f57", wallColor = "#577568", difficulty = "입문",
                    guardian = moss, rewardXp = 100, rewardBalls = 6,
                    rooms = new[] {
                        Room("싹의 회랑", Variant(1, "새싹 파수꾼", "#80c7a7", "#397c68", "#c9ebc8", "grass", .8f), 40, 9),
                        Room("뿌리의 방", Variant(4, "숲의 길잡이", "#9eba86", "#55754b", "#dce8b5", "grass", 1f), 55, 11),
                        Room("수호자의 정원", moss.Clone(), 90, 14)
                    }
                },
                new DungeonDefinition {
                    id = "ember", name = "잿불 공방", subtitle = "꺼지지 않는 용기를 찾아서",
                    description = "붉은 돌길을 따라 전진하세요. 적의 강한 공격 앞에서는 방어가 힘이 됩니다.",
                    color = "#d99a77", accent = "#ffd3a0", floorColor = "#5f4541", wallColor = "#805b4d", difficulty = "보통",
                    guardian = ember, rewardXp = 140, rewardBalls = 6,
                    rooms = new[] {
                        Room("온기의 회랑", Variant(3, "불씨 파수꾼", "#ed9963", "#d46349", "#ffe2ac", "fire", .8f), 48, 11),
                        Room("용광로의 방", Variant(0, "황금 불꽃", "#d79557", "#8c4932", "#ffdfa1", "fire", 1f), 64, 13),
                        Room("잿불의 왕좌", ember.Clone(), 105, 16)
                    }
                },
                new DungeonDefinition {
                    id = "moon", name = "달그림자 유적", subtitle = "고요한 달빛 너머의 비밀",
                    description = "회복약과 축복을 아껴 마지막 수호자에게 도전하세요.",
                    color = "#aaa0d1", accent = "#e8d5ff", floorColor = "#49475e", wallColor = "#69617d", difficulty = "도전",
                    guardian = moon, rewardXp = 180, rewardBalls = 6,
                    rooms = new[] {
                        Room("별의 회랑", Variant(5, "별빛 파수꾼", "#b0a4ce", "#625078", "#b6a3d7", "ghost", .8f), 54, 12),
                        Room("메아리의 방", Variant(4, "달빛 메아리", "#b0a3cb", "#685776", "#e3d5f0", "ghost", 1f), 72, 14),
                        Room("달그림자의 제단", moon.Clone(), 118, 18)
                    }
                }
            };
        }
    }
}
