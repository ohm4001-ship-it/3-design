using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace PokeLab
{
    /// <summary>Native, asset-free diorama environments. Gameplay owns all interactions and cameras.</summary>
    public static class WorldBuilder
    {
        public static GameObject BuildOverworld()
        {
            Builder b = new Builder("Aster Island · Overworld", 17031);
            b.Overworld();
            return b.Root;
        }

        public static GameObject BuildDungeon(int theme, int room)
        {
            Builder b = new Builder("Sanctuary · " + theme + " · Chamber " + (room + 1), 719 + theme * 43 + room);
            b.Dungeon(Mathf.Clamp(theme, 0, 2), Mathf.Clamp(room, 0, 2));
            return b.Root;
        }

        private sealed class Builder
        {
            public GameObject Root { get; private set; }
            private readonly System.Random random;
            private readonly Dictionary<string, Material> materials = new Dictionary<string, Material>();
            private readonly WorldEffects effects;
            private readonly Mesh pebble;
            private readonly Mesh cone;
            private WorldNavigation navigation;

            private readonly Color grass = Hex("91B98C");
            private readonly Color grassLight = Hex("B4CC9A");
            private readonly Color sand = Hex("E9DAB1");
            private readonly Color wood = Hex("92705A");
            private readonly Color woodDark = Hex("654D43");
            private readonly Color stone = Hex("94A6A0");
            private readonly Color darkStone = Hex("647E79");

            public Builder(string name, int seed)
            {
                Root = new GameObject(name);
                effects = Root.AddComponent<WorldEffects>();
                random = new System.Random(seed);
                pebble = MakeIcosahedron();
                cone = MakeCone(7);
                effects.Own(pebble);
                effects.Own(cone);
            }

            public void Overworld()
            {
                navigation = Root.AddComponent<WorldNavigation>();
                Transform terrain = Group("Sculpted coastline");
                Disc("Quiet turquoise sea", terrain, new Vector3(0, -3.75f, 0), 350, 350,
                    Hex("71B9B6"), 64);
                RingLand(terrain);
                Disc("Island meadow", terrain, Vector3.zero, 46, 46, grass, 96, .032f);
                Disc("Forest glade", terrain, new Vector3(-23, .012f, 19), 15, 13,
                    Hex("82AC85"), 48, .08f);
                Disc("Warm southern field", terrain, new Vector3(-22, .018f, -22), 12, 11,
                    Hex("B9BB91"), 44, .08f);
                Disc("Lavender meadow", terrain, new Vector3(23, .023f, -22), 12, 11,
                    Hex("A5B79A"), 44, .075f);
                Disc("Sanctuary clearing", terrain, new Vector3(0, .024f, 32), 9.5f, 8,
                    Hex("A8BE94"), 42, .055f);

                Transform paths = Group("Soft winding trails");
                Trail(paths, new[] { V(0, -9), V(-2, 0), V(-10, 7), V(-18, 12), V(-22, 18) }, 2.1f, sand);
                Trail(paths, new[] { V(-1, 0), V(8, 2), V(14, 7), V(22, 12), V(28, 18) }, 2.25f, sand);
                Trail(paths, new[] { V(-1, 3), V(-2, 12), V(3, 21), V(0, 31) }, 2.4f, sand);
                Trail(paths, new[] { V(-2, -5), V(-10, -10), V(-16, -19), V(-25, -20) }, 2, sand);
                Trail(paths, new[] { V(2, -6), V(10, -10), V(17, -19), V(25, -23) }, 2, sand);
                Trail(paths, new[] { V(-22, 18), V(-18, 27), V(-8, 30), V(0, 32) }, 1.5f, Hex("CBCAA4"));
                Trail(paths, new[] { V(0, 31), V(13, 28), V(20, 22), V(27, 17) }, 1.5f, Hex("CBCAA4"));

                Camp();
                Lake();
                Sanctuary();
                Forest();
                SouthernBiomes();
                CoastDetails();
                FieldDetails();
                Backdrop();
            }

            private void RingLand(Transform parent)
            {
                const int sides = 96;
                float[] radii = { 45.5f, 48, 49.5f, 50.4f, 49.9f };
                float[] heights = { -.015f, -.12f, -.65f, -2.5f, -3.8f };
                Color[] colors = { sand, Hex("DDD0AB"), Hex("ABA998"), Hex("859590") };
                for (int ring = 0; ring < 4; ring++)
                {
                    List<Vector3> vertices = new List<Vector3>();
                    List<int> indices = new List<int>();
                    for (int i = 0; i <= sides; i++)
                    {
                        float angle = i * Mathf.PI * 2 / sides;
                        float shape = 1 + Mathf.Sin(angle * 5 + .4f) * .022f + Mathf.Cos(angle * 9) * .017f;
                        float x = Mathf.Sin(angle), z = Mathf.Cos(angle);
                        vertices.Add(new Vector3(x * radii[ring] * shape, heights[ring], z * radii[ring] * shape));
                        vertices.Add(new Vector3(x * radii[ring + 1] * shape, heights[ring + 1], z * radii[ring + 1] * shape));
                        if (i < sides)
                        {
                            int p = i * 2;
                            indices.AddRange(new[] { p, p + 1, p + 2, p + 2, p + 1, p + 3 });
                        }
                    }
                    Custom("Coast stratum " + ring, parent, vertices, indices, colors[ring]);
                }
                for (int i = 0; i < 28; i++)
                {
                    float angle = i * Mathf.PI * 2 / 28;
                    Arc(parent, new Vector3(0, -3.65f, 0), 52 + Mathf.Sin(i) * 1.1f,
                        angle, .065f + Rand(0, .04f), .22f, Hex("BEE0CD"), 8);
                }
                for (int i = 0; i < 70; i++)
                {
                    float angle = Rand(0, Mathf.PI * 2), radius = Rand(59, 135);
                    Vector3 p = new Vector3(Mathf.Sin(angle) * radius, -3.69f, Mathf.Cos(angle) * radius);
                    GameObject wave = Box("Distant sea glimmer", parent, p, new Vector3(Rand(1, 4), .025f, .12f),
                        Hex(i % 3 == 0 ? "A8D7C8" : "87C7BC"));
                    wave.transform.rotation = Quaternion.Euler(0, Rand(-18, 18), 0);
                }
            }

            private void Camp()
            {
                Transform camp = Group("Wayfarer's camp");
                Disc("Camp clearing", camp, new Vector3(0, .04f, 0), 6, 5.2f, Hex("DED4AE"), 42, .04f);
                Transform tent = Group("Cream canvas field tent", camp, new Vector3(-5, .04f, -1.5f));
                tent.localRotation = Quaternion.Euler(0, -20, 0);
                navigation.AddBox(Root.transform.InverseTransformPoint(tent.position), new Vector2(2.25f, 2.3f), -20);
                Box("Tent groundsheet", tent, new Vector3(0, .035f, 0), new Vector3(4.5f, .07f, 4.6f), Hex("797F6B"));
                Vector3 a = new Vector3(-2.2f, .05f, -2.2f), b = new Vector3(0, 3.25f, -2.2f),
                    c = new Vector3(2.2f, .05f, -2.2f), d = new Vector3(-2.2f, .05f, 2.2f),
                    e = new Vector3(0, 3.25f, 2.2f), f = new Vector3(2.2f, .05f, 2.2f);
                Quad("Sunlit canvas", tent, a, d, e, b, Hex("F2E9CF"), true);
                Quad("Shaded canvas", tent, b, e, f, c, Hex("D4D8BF"), true);
                Tri("Closed rear canvas", tent, d, f, e, Hex("D4D3B7"), true);
                Tri("Left folded entrance", tent, a, b, new Vector3(-1, .05f, -2.22f), Hex("E7DCBA"), true);
                Tri("Right folded entrance", tent, b, c, new Vector3(1, .05f, -2.22f), Hex("F6EBD0"), true);
                Beam("Front ridge pole", tent, new Vector3(0, .05f, -2.27f), new Vector3(0, 3.45f, -2.27f), .075f, woodDark);
                Beam("Rear ridge pole", tent, new Vector3(0, .05f, 2.27f), new Vector3(0, 3.45f, 2.27f), .075f, woodDark);
                Beam("Ridge seam", tent, new Vector3(0, 3.27f, -2.3f), new Vector3(0, 3.27f, 2.3f), .045f, Hex("BFC7AA"));
                for (int i = -1; i <= 1; i += 2)
                {
                    Beam("Tent guy rope", tent, new Vector3(i * 1.75f, .6f, -2.1f), new Vector3(i * 3, .08f, -3), .018f, Hex("E8D3A9"));
                    Beam("Wooden peg", tent, new Vector3(i * 3, .01f, -3), new Vector3(i * 3, .3f, -3), .06f, woodDark);
                }
                Box("Woven bedroll", tent, new Vector3(.1f, .14f, .5f), new Vector3(1.4f, .18f, 2.8f), Hex("7EAAA0"));
                Box("Cream pillow", tent, new Vector3(.1f, .3f, 1.3f), new Vector3(1.05f, .28f, .5f), Hex("EFE5C8"));
                Transform flag = Group("Mint camp flag", camp, new Vector3(-8, 0, 2));
                Beam("Flag pole", flag, Vector3.zero, new Vector3(0, 4.2f, 0), .06f, wood);
                Tri("Swallowtail banner", flag, new Vector3(0, 4, 0), new Vector3(1.6f, 3.65f, 0), new Vector3(0, 3.15f, 0), Hex("4F9E8E"), true);
                Gem("Flag finial", flag, new Vector3(0, 4.3f, 0), new Vector3(.16f, .24f, .16f), Hex("E3C382"));
                Fire(camp, new Vector3(2.6f, .12f, -1.5f), .75f);
                Bench(camp, new Vector3(3.6f, .05f, -3.2f), -28);
                Crate(camp, new Vector3(-3, .05f, 2.9f), .85f);
                Crate(camp, new Vector3(-4.1f, .05f, 2.7f), .65f);
                Lantern(camp, new Vector3(4, 0, 3.5f), 2.6f, Hex("FFE3A3"));
                Lantern(camp, new Vector3(-7.5f, 0, -5.2f), 2.3f, Hex("FFE3A3"));
                Sign(camp, new Vector3(3.3f, 0, 5.3f), 18);
                for (int i = 0; i < 8; i++)
                {
                    float angle = i * Mathf.PI * 2 / 8;
                    Rock(camp, new Vector3(2.6f + Mathf.Cos(angle), .13f, -1.5f + Mathf.Sin(angle)), new Vector3(.38f, .27f, .31f), stone);
                }
            }

            private void Lake()
            {
                Transform lake = Group("Starfall lake");
                Disc("Pale stone shore", lake, new Vector3(22, .047f, 12), 8.8f, 6.8f, Hex("D5D3AE"), 50, .07f);
                Disc("Shallow lake shelf", lake, new Vector3(22, .053f, 12), 8, 6, Hex("97CCC0"), 50, .075f);
                Disc("Jade lake", lake, new Vector3(22, .058f, 12), 7.35f, 5.45f, Hex("68B5AF"), 50, .07f);
                Disc("Deep blue pool", lake, new Vector3(23.2f, .061f, 12.6f), 4.9f, 3.9f, Hex("64A9AB"), 40, .06f);
                for (int i = 0; i < 14; i++)
                {
                    float a = i * Mathf.PI * 2 / 14;
                    Rock(lake, new Vector3(22 + Mathf.Cos(a) * 8.6f, .2f, 12 + Mathf.Sin(a) * 6.6f),
                        new Vector3(Rand(.35f, .85f), Rand(.3f, .7f), Rand(.4f, .8f)), Hex("9CAEA0"));
                }
                for (int i = 0; i < 12; i++)
                {
                    Vector3 p = new Vector3(Rand(19, 27), .082f, Rand(9, 15));
                    if (Mathf.Abs(p.z - 12) < 1.7f) p.z += 2.5f;
                    Disc("Water lily leaf", lake, p, .4f, .32f, Hex("8BAE84"), 9);
                    if (i % 3 == 0) Flower(lake, p + new Vector3(.03f, .03f, 0), Hex("F2E2D1"), .8f);
                    if (i < 4) Arc(lake, p, .8f, 0, Mathf.PI * 1.7f, .025f, Hex("B6DAD0"), 24);
                }
                Transform bridge = Group("Lakeside boardwalk", lake, new Vector3(22, .08f, 12));
                for (int i = 0; i < 24; i++)
                    Box("Sun-bleached bridge plank", bridge, new Vector3((i - 11.5f) * .59f, .17f + Mathf.Sin(i / 23f * Mathf.PI) * .12f, 0),
                        new Vector3(.55f, .18f, 2.55f), Hex(i % 3 == 0 ? "B19D7A" : "C3B08A"));
                for (int i = -1; i <= 1; i += 2)
                {
                    Beam("Boardwalk supporting rail", bridge, new Vector3(-7, .08f, i * .95f), new Vector3(7, .08f, i * .95f), .1f, woodDark);
                    for (int j = -3; j <= 3; j++)
                    {
                        Box("Boardwalk post", bridge, new Vector3(j * 2.1f, .53f, i * 1.4f), new Vector3(.18f, 1.2f, .18f), wood);
                        if (j < 3) Beam("Rope handrail", bridge, new Vector3(j * 2.1f, 1.03f, i * 1.4f), new Vector3((j + 1) * 2.1f, 1.03f, i * 1.4f), .033f, Hex("DCC99D"));
                    }
                }
                Tree(lake, new Vector3(33, 0, 15), 1.4f, 2);
                Tree(lake, new Vector3(29, 0, 22), .85f, 0);
                Tree(lake, new Vector3(14, 0, 17), .85f, 2);
                for (int i = 0; i < 15; i++)
                {
                    Vector3 p = new Vector3(22 + Mathf.Sin(i * .52f) * 8.6f, 0, 12 + Mathf.Cos(i * .52f) * 6.7f);
                    Reeds(lake, p, .8f + Rand(0, .45f));
                }
                Lantern(lake, new Vector3(14.3f, 0, 9.4f), 2.4f, Hex("FFE7B0"));
                Sign(lake, new Vector3(31, 0, 11), -25);
            }

            private void Sanctuary()
            {
                Transform ruins = Group("Moonwell gateway");
                Disc("Ancient sanctuary dais", ruins, new Vector3(0, .08f, 32), 4.7f, 4.7f, Hex("B6BDA7"), 12);
                Ring("Inlaid stone circle", ruins, new Vector3(0, .095f, 32), 4.25f, .14f, Hex("D6D5B8"), 48, true);
                for (int i = 0; i < 14; i++)
                {
                    float a = Mathf.PI * 2 * i / 14;
                    Box("Radial sanctuary tile", ruins, new Vector3(Mathf.Sin(a) * 3.7f, .12f, 32 + Mathf.Cos(a) * 3.7f),
                        new Vector3(.5f, .14f, 1.1f), Hex(i % 2 == 0 ? "A8B4A3" : "D0D0B3"), Quaternion.Euler(0, a * Mathf.Rad2Deg, 0));
                }
                Portal(ruins, new Vector3(0, .1f, 34), Hex("91E0CD"), false);
                Column(ruins, new Vector3(-5, 0, 34), 3.5f, Hex("9DAFA3"), true);
                Column(ruins, new Vector3(5.3f, 0, 33.8f), 2.3f, Hex("9DAFA3"), true);
                Column(ruins, new Vector3(-3.9f, 0, 28.6f), 1.2f, Hex("A5B6A6"), false);
                for (int i = 0; i < 9; i++)
                {
                    float x = Rand(-6, 6), z = Rand(34, 39);
                    Rock(ruins, new Vector3(x, .17f, z), new Vector3(Rand(.4f, .9f), Rand(.3f, .65f), Rand(.5f, 1)), stone);
                }
                Tree(ruins, new Vector3(-10, 0, 36), 1.5f, 0);
                Tree(ruins, new Vector3(10, 0, 36), 1.7f, 0);
                Tree(ruins, new Vector3(5, 0, 41), 1.15f, 2);
                Motes(ruins, new Vector3(0, 2.6f, 32), 12, 5, Hex("BCEACA"));
            }

            private void Forest()
            {
                Transform forest = Group("Whisperwood forest");
                Vector3[] positions = { V(-30, 10), V(-32, 16), V(-34, 22), V(-29, 25), V(-24, 28),
                    V(-18, 24), V(-15, 19), V(-17, 15), V(-24, 10), V(-36, 14), V(-31, 29),
                    V(-20, 34), V(-27, 33), V(-35, 8), V(-39, 20), V(-12, 34) };
                for (int i = 0; i < positions.Length; i++) Tree(forest, positions[i], Rand(.8f, 1.4f), i % 3 == 0 ? 1 : 0);
                Tree(forest, new Vector3(-26.5f, 0, 20), 2.1f, 0);
                Disc("Heartwood resting place", forest, new Vector3(-22, .037f, 18), 3, 2.6f, Hex("B8C29A"), 24, .05f);
                Bench(forest, new Vector3(-25, .05f, 15.5f), 30);
                Sign(forest, new Vector3(-19, 0, 16), -14);
                for (int i = 0; i < 38; i++)
                {
                    Vector3 p = new Vector3(Rand(-35, -14), .02f, Rand(9, 31));
                    if (Vector2.Distance(new Vector2(p.x, p.z), new Vector2(-22, 18)) < 3.5f) continue;
                    if (i % 2 == 0) Mushroom(forest, p, Rand(.3f, .6f), Hex(i % 4 == 0 ? "E5B37E" : "B0CAC0"));
                    else Bush(forest, p, Rand(.55f, 1.15f), Hex("6F9F79"));
                }
                for (int i = 0; i < 5; i++) Rock(forest, new Vector3(-30 + i * .8f, .3f, 15 + Rand(-1, 1)), new Vector3(.8f, .8f, .8f), darkStone);
                Motes(forest, new Vector3(-22, 2, 21), 9, 7, Hex("E0E8AF"));
            }

            private void SouthernBiomes()
            {
                Transform ember = Group("Sunstone ridge");
                Color orangeStone = Hex("BF9B7F");
                for (int i = 0; i < 15; i++)
                {
                    Vector3 p = new Vector3(Rand(-36, -18), .15f, Rand(-32, -16));
                    if (Vector2.Distance(new Vector2(p.x, p.z), new Vector2(-25, -20)) < 3.7f) continue;
                    Rock(ember, p, new Vector3(Rand(.7f, 1.8f), Rand(.7f, 2), Rand(.7f, 1.7f)), orangeStone);
                    if (i % 3 == 0) Crystal(ember, p + new Vector3(.5f, .2f, .5f), .8f, Hex("F3C58D"));
                }
                Tree(ember, new Vector3(-28, 0, -28), 1.1f, 3);
                Tree(ember, new Vector3(-35, 0, -23), 1.3f, 3);
                Tree(ember, new Vector3(-17, 0, -27), .9f, 3);
                Tree(ember, new Vector3(-20, 0, -12), .7f, 3);
                Disc("Amber lookout", ember, new Vector3(-25, .04f, -20), 3, 2.6f, Hex("D0C3A0"), 20);
                Sign(ember, new Vector3(-23, 0, -23), 35);
                Column(ember, new Vector3(-29, 0, -19), 2.8f, orangeStone, true);
                Transform moon = Group("Moonflower meadow");
                for (int i = 0; i < 9; i++)
                {
                    float a = i * Mathf.PI * 2 / 9;
                    Vector3 p = new Vector3(25 + Mathf.Sin(a) * 6.3f, 0, -23 + Mathf.Cos(a) * 5.6f);
                    if (i % 2 == 0) Tree(moon, p, Rand(.8f, 1.3f), 4);
                    else Rock(moon, p, new Vector3(.8f, 1.2f, .9f), Hex("A8A7B5"));
                }
                Disc("Moonflower clearing", moon, new Vector3(25, .04f, -23), 3.5f, 3.5f, Hex("CBC8B6"), 24);
                Ring("Moonflower mosaic", moon, new Vector3(25, .055f, -23), 2.7f, .1f, Hex("E0DACA"), 32, true);
                for (int i = 0; i < 24; i++)
                {
                    float a = Rand(0, Mathf.PI * 2), r = Rand(4.3f, 8);
                    Flower(moon, new Vector3(25 + Mathf.Sin(a) * r, .03f, -23 + Mathf.Cos(a) * r), Hex(i % 3 == 0 ? "DCCBD6" : "ECE2CF"), Rand(.6f, 1));
                }
                Motes(moon, new Vector3(25, 2, -23), 10, 6, Hex("D5CEEF"));
                Sign(moon, new Vector3(22.2f, 0, -25.2f), -24);
            }

            private void CoastDetails()
            {
                Transform coast = Group("Coastal stones and grasses");
                for (int i = 0; i < 65; i++)
                {
                    float a = Rand(0, Mathf.PI * 2), r = Rand(43, 47.5f);
                    Vector3 p = new Vector3(Mathf.Cos(a) * r, .1f, Mathf.Sin(a) * r);
                    Rock(coast, p, new Vector3(Rand(.5f, 1.7f), Rand(.4f, 1.1f), Rand(.6f, 1.9f)), i % 3 == 0 ? Hex("B5B7A6") : stone);
                    if (i % 4 == 0) Reeds(coast, p + new Vector3(1, -.1f, .5f), .8f);
                }
                for (int i = 0; i < 11; i++)
                {
                    float a = 2.8f + i * .25f;
                    Tree(coast, new Vector3(Mathf.Cos(a) * 37, 0, Mathf.Sin(a) * 37), Rand(.65f, 1.15f), i % 3 == 0 ? 1 : 0);
                }
                Transform dock = Group("Little arrival dock", coast, new Vector3(5, -.16f, -46));
                for (int i = 0; i < 14; i++)
                    Box("Dock plank", dock, new Vector3(0, 0, -i * .55f), new Vector3(2.6f, .18f, .5f), Hex(i % 2 == 0 ? "B8A487" : "A99479"));
                for (int i = 0; i < 4; i++)
                    for (int side = -1; side <= 1; side += 2)
                        Box("Dock post", dock, new Vector3(side * 1.35f, -1, -i * 2.2f), new Vector3(.22f, 3.7f, .22f), woodDark);
                Lantern(dock, new Vector3(1.4f, .2f, -6.4f), 2, Hex("FFE3AA"));
            }

            private void FieldDetails()
            {
                Transform flora = Group("Meadow wildflowers");
                Vector3[] extraTrees = { V(10, -4), V(18, -3), V(-11, -5), V(-12, -22), V(35, -3), V(34, -12), V(6, 37), V(-7, 23), V(10, 16) };
                for (int i = 0; i < extraTrees.Length; i++) Tree(flora, extraTrees[i], Rand(.65f, .95f), i % 3 == 0 ? 2 : 0);
                for (int i = 0; i < 220; i++)
                {
                    Vector3 p = new Vector3(Rand(-40, 40), .025f, Rand(-39, 39));
                    if (new Vector2(p.x, p.z).magnitude > 43 || p.sqrMagnitude < 55 || NearTrail(p) || InLake(p)) continue;
                    if (i % 5 == 0) Bush(flora, p, Rand(.4f, .75f), Hex("7AA87F"));
                    else if (i % 3 == 0) GrassTuft(flora, p, Rand(.4f, .8f), Hex("6C9878"));
                    else Flower(flora, p, Hex(i % 4 == 0 ? "E8C997" : i % 4 == 1 ? "E4D9DF" : "ECE8C9"), Rand(.45f, .85f));
                }
                for (int i = 0; i < 22; i++)
                {
                    Vector3 p = new Vector3(Rand(-35, 35), .16f, Rand(-32, 32));
                    if (NearTrail(p) || InLake(p) || p.sqrMagnitude < 60) continue;
                    Rock(flora, p, new Vector3(Rand(.4f, 1.1f), Rand(.35f, .8f), Rand(.5f, 1.1f)), Hex("AAB4A0"));
                }
                // Individually modelled butterflies provide a quiet scale cue close to the camp.
                for (int i = 0; i < 7; i++)
                {
                    Transform butterfly = Group("Meadow butterfly", flora, new Vector3(Rand(-12, 14), Rand(1, 2.2f), Rand(-10, 10)));
                    Color tint = Hex(i % 2 == 0 ? "E7CEA4" : "B8D9CC");
                    Gem("Left wing", butterfly, new Vector3(-.1f, 0, 0), new Vector3(.16f, .035f, .12f), tint);
                    Gem("Right wing", butterfly, new Vector3(.1f, 0, 0), new Vector3(.16f, .035f, .12f), tint);
                    effects.Animate(butterfly, .3f, Rand(1, 2), i, Rand(-15, 15));
                }
            }

            private void Backdrop()
            {
                Transform backdrop = Group("Distant island silhouettes");
                for (int i = 0; i < 9; i++)
                {
                    float x = -90 + i * 22, z = Rand(95, 115);
                    Gem("Sea stack", backdrop, new Vector3(x, -4, z), new Vector3(Rand(9, 17), Rand(13, 24), Rand(8, 14)), Hex(i % 2 == 0 ? "94BAB5" : "9DC4BA"));
                }
                for (int i = 0; i < 7; i++)
                {
                    Transform cloud = Group("Soft distant cloud", backdrop, new Vector3(-75 + i * 24, Rand(24, 32), Rand(80, 125)));
                    for (int j = 0; j < 4; j++) Gem("Cloud puff", cloud, new Vector3(j * 3.1f, Rand(-.3f, .8f), 0),
                        new Vector3(Rand(3, 5), Rand(1.3f, 2.7f), 2), Hex("E6EBDD"), false);
                    effects.Animate(cloud, .35f, .15f, i);
                }
            }

            public void Dungeon(int theme, int room)
            {
                Color[] floors = { Hex("6B8578"), Hex("866955"), Hex("76758D") };
                Color[] walls = { Hex("88A08C"), Hex("AA8870"), Hex("9A94AC") };
                Color[] accents = { Hex("B8E5AF"), Hex("FFD18D"), Hex("D1C3F1") };
                Color floor = floors[theme], wall = walls[theme], accent = accents[theme];
                Transform architecture = Group("Carved sanctuary chamber");
                Box("Floating stone foundation", architecture, new Vector3(0, -.7f, 0), new Vector3(23.5f, 1.4f, 24.5f), Color.Lerp(floor, Color.black, .18f));
                Box("Foundation lower moulding", architecture, new Vector3(0, -1.2f, 0), new Vector3(24.1f, .35f, 25.1f), Color.Lerp(floor, Color.black, .25f));
                for (int x = -5; x <= 5; x++)
                {
                    for (int z = -5; z <= 5; z++)
                    {
                        Color tile = Color.Lerp(floor, Hex("C7C8AF"), Rand(.015f, .12f));
                        Box("Hand-cut floor slab", architecture, new Vector3(x * 2.03f, -.035f + Rand(-.008f, .008f), z * 2.03f),
                            new Vector3(1.99f, .14f, 1.99f), tile);
                    }
                }
                Box("Rear carved plinth", architecture, new Vector3(0, .24f, 11), new Vector3(23.5f, .5f, 1), wall);
                Box("Left broken wall plinth", architecture, new Vector3(-11.5f, .24f, 0), new Vector3(.75f, .5f, 23), wall);
                Box("Right broken wall plinth", architecture, new Vector3(11.5f, .24f, 0), new Vector3(.75f, .5f, 23), wall);
                for (int x = -5; x <= 5; x++)
                {
                    if (Mathf.Abs(x) <= 1) continue;
                    int rows = x % 2 == 0 ? 3 : 2;
                    for (int y = 0; y < rows; y++)
                        Box("Weathered rear wall block", architecture, new Vector3(x * 2.05f + (y % 2) * .2f, .65f + y * .74f, 11),
                            new Vector3(1.98f, .7f, .85f), Color.Lerp(wall, floor, Rand(0, .23f)));
                }
                for (int side = -1; side <= 1; side += 2)
                {
                    Column(architecture, new Vector3(side * 9, 0, 8.7f), 5.1f, wall, false);
                    Column(architecture, new Vector3(side * 10.4f, 0, 1.8f), 3.5f, wall, true);
                    Column(architecture, new Vector3(side * 10.4f, 0, -6.7f), 1.3f, wall, true);
                    Lantern(architecture, new Vector3(side * 7.2f, 0, 7.3f), 2.5f, accent);
                    for (int j = 0; j < 4; j++)
                        Rock(architecture, new Vector3(side * Rand(9, 10.6f), .25f, Rand(-7, 8)),
                            new Vector3(Rand(.35f, .75f), Rand(.3f, .6f), Rand(.4f, .8f)), wall);
                }
                Portal(architecture, new Vector3(0, .08f, 10.35f), accent, true);
                Box("Doorstep", architecture, new Vector3(0, .12f, 8.9f), new Vector3(4.6f, .24f, 1.4f), Color.Lerp(wall, Color.white, .12f));
                Transform sigils = Group("Inlaid battle sigils");
                Ring("Central battle seal", sigils, new Vector3(0, .05f, 0), 6.6f, .075f, Color.Lerp(accent, floor, .5f), 64, true);
                Ring("Inner battle seal", sigils, new Vector3(0, .052f, 0), 5.9f, .035f, Color.Lerp(accent, floor, .6f), 64, true);
                Ring("Companion circle", sigils, new Vector3(-3, .075f, -3), 1.7f, .09f, Color.Lerp(accent, Color.white, .25f), 40, true);
                Ring("Guardian circle", sigils, new Vector3(3, .075f, 3), room == 2 ? 2.6f : 1.9f, .09f, accent, 40, true);
                for (int i = 0; i < 12; i++)
                {
                    float angle = i * Mathf.PI * 2 / 12;
                    Box("Twelve-point rune", sigils, new Vector3(Mathf.Sin(angle) * 6.25f, .062f, Mathf.Cos(angle) * 6.25f),
                        new Vector3(.09f, .025f, i % 3 == 0 ? .75f : .35f), accent, Quaternion.Euler(0, angle * Mathf.Rad2Deg + 45, 0));
                }
                // Chamber number is represented by a readable sequence of glowing stones above the portal.
                for (int i = 0; i < 3; i++)
                    Gem("Chamber progress jewel", architecture, new Vector3((i - 1) * .6f, 6.05f, 10.1f),
                        new Vector3(.16f, .23f, .13f), i <= room ? accent : Color.Lerp(wall, Color.black, .25f), true, i <= room ? 1 : 0);
                ThemeDetails(theme, room, architecture, accent, wall);
                Motes(architecture, new Vector3(0, 2.3f, 3), 24, 9, Color.Lerp(accent, Color.white, .25f));
                PointLight("Portal glow", architecture, new Vector3(0, 3.3f, 8), accent, 1.5f, 11);
                PointLight("Warm companion fill", architecture, new Vector3(-6, 4, -5), Hex("F1E5C4"), .8f, 14);
            }

            private void ThemeDetails(int theme, int room, Transform parent, Color accent, Color wall)
            {
                if (theme == 0)
                {
                    for (int i = 0; i < 20; i++)
                    {
                        float side = i % 2 == 0 ? -1 : 1;
                        Vector3 p = new Vector3(side * Rand(8.5f, 10.8f), .08f, Rand(-8.5f, 9));
                        Bush(parent, p, Rand(.5f, 1), Hex(i % 3 == 0 ? "8FB384" : "789E7B"));
                        if (i % 3 == 0) Mushroom(parent, p + new Vector3(.6f, 0, -.5f), .7f, Hex("CAD8AD"));
                    }
                    for (int side = -1; side <= 1; side += 2)
                    {
                        Beam("Ancient winding root", parent, new Vector3(side * 10.8f, .2f, 5), new Vector3(side * 9.5f, .28f, 8.5f), .25f, Hex("758D6D"));
                        Beam("Climbing sanctuary vine", parent, new Vector3(side * 9.4f, .4f, 8.4f), new Vector3(side * 8.7f, 4.1f, 8.9f), .08f, Hex("78956B"));
                        for (int j = 0; j < 5; j++)
                            Gem("Vine leaf", parent, new Vector3(side * (9.3f - j * .11f), 1 + j * .6f, 8.45f),
                                new Vector3(.35f, .15f, .19f), Hex("94B181"));
                    }
                    if (room == 2)
                    {
                        Tree(parent, new Vector3(-7, 0, 10.5f), 1.25f, 0);
                        Tree(parent, new Vector3(7, 0, 10.5f), 1.25f, 0);
                    }
                }
                else if (theme == 1)
                {
                    for (int side = -1; side <= 1; side += 2)
                    {
                        Box("Recessed ember channel", parent, new Vector3(side * 8.2f, .065f, 0), new Vector3(.55f, .04f, 16.8f), Hex("B77648"));
                        Box("Ember seam", parent, new Vector3(side * 8.2f, .09f, 0), new Vector3(.16f, .025f, 16.3f), accent, null, .6f);
                        Fire(parent, new Vector3(side * 8, .45f, 5.8f), 1);
                        Cylinder("Brazier base", parent, new Vector3(side * 8, .25f, 5.8f), new Vector3(1.4f, .23f, 1.4f), Hex("605B54"));
                    }
                    for (int i = 0; i < 12; i++)
                        Crystal(parent, new Vector3((i % 2 == 0 ? -1 : 1) * Rand(9.3f, 10.8f), .15f, Rand(-8, 9)), Rand(.55f, 1.1f), Hex("DDB382"));
                    Crate(parent, new Vector3(-9, .1f, -7), 1.1f);
                    Crate(parent, new Vector3(-9.7f, .1f, -5.6f), .75f);
                }
                else
                {
                    for (int i = 0; i < 15; i++)
                    {
                        Vector3 p = new Vector3((i % 2 == 0 ? -1 : 1) * Rand(8.8f, 10.8f), .15f, Rand(-8.7f, 9));
                        Crystal(parent, p, Rand(.6f, 1.35f), Hex(i % 3 == 0 ? "B8D8D5" : "B9ABD4"));
                    }
                    for (int i = 0; i < 6; i++)
                    {
                        GameObject shard = Gem("Suspended moon shard", parent, new Vector3((i % 2 == 0 ? -1 : 1) * Rand(7, 9.5f), Rand(2.6f, 4.6f), Rand(3, 9)),
                            new Vector3(.3f, .6f, .3f), accent, true, .3f);
                        effects.Animate(shard.transform, .23f, .8f, i, 12);
                    }
                    Ring("Celestial wall medallion", parent, new Vector3(0, 7.4f, 10.5f), .8f, .065f, accent, 40, false);
                    Gem("Celestial suspended star", parent, new Vector3(0, 7.4f, 10.5f), new Vector3(.22f, .35f, .12f), accent, true, .7f);
                }
            }

            private void Portal(Transform parent, Vector3 position, Color color, bool dungeon)
            {
                Transform portal = Group("Ancient ring gateway", parent, position);
                Color masonry = dungeon ? Hex("9FA69E") : Hex("9BAC9D");
                for (int side = -1; side <= 1; side += 2)
                {
                    Column(portal, new Vector3(side * 2.15f, 0, 0), 2.7f, masonry, false);
                    Crystal(portal, new Vector3(side * 3.2f, .1f, -.5f), .9f, color);
                }
                Ring("Cut-stone arch", portal, new Vector3(0, 3.05f, 0), 2.1f, .34f, masonry, 18, false);
                Ring("Mint luminous inner ring", portal, new Vector3(0, 3.05f, -.09f), 1.8f, .075f, color, 48, false, 1.1f);
                Ring("Outer bronze trim", portal, new Vector3(0, 3.05f, -.05f), 2.4f, .055f, Hex("CEBE94"), 48, false);
                GameObject veil = Disc("Veil of light", portal, new Vector3(0, 3.05f, .035f), 1.73f, 1.73f,
                    new Color(color.r, color.g, color.b, .2f), 48);
                veil.transform.localRotation = Quaternion.Euler(-90, 0, 0);
                for (int i = 0; i < 8; i++)
                {
                    float a = i * Mathf.PI / 4;
                    Gem("Portal rune", portal, new Vector3(Mathf.Sin(a) * 2.12f, 3.05f + Mathf.Cos(a) * 2.12f, -.36f),
                        new Vector3(.105f, .18f, .075f), color, true, .7f);
                }
                GameObject crystal = Gem("Gateway heart", portal, new Vector3(0, 2.9f, -.12f), new Vector3(.23f, .4f, .18f), color, true, 1.2f);
                effects.Animate(crystal.transform, .15f, .9f, 0, 14, .06f);
                PointLight("Gate radiance", portal, new Vector3(0, 2.9f, -1.4f), color, 1, 7);
            }

            private void Tree(Transform parent, Vector3 position, float size, int style)
            {
                Transform tree = Group("Layered " + (style == 1 ? "pine" : style == 2 ? "willow" : style == 3 ? "amber tree" : style == 4 ? "moon tree" : "oak"), parent, position);
                tree.localScale = Vector3.one * size;
                tree.localRotation = Quaternion.Euler(0, Rand(0, 360), 0);
                if (navigation != null)
                    navigation.AddCircle(Root.transform.InverseTransformPoint(tree.position), .3f * size);
                Beam("Tapered trunk", tree, new Vector3(0, 0, 0), new Vector3(.12f, 3.15f, 0), .23f, woodDark);
                Beam("Left bough", tree, new Vector3(0, 1.5f, 0), new Vector3(-.9f, 3.4f, .1f), .13f, wood);
                Beam("Right bough", tree, new Vector3(.05f, 1.8f, 0), new Vector3(1, 3.5f, .2f), .12f, wood);
                Color dark = Hex(style == 3 ? "BC9B71" : style == 4 ? "9B9BB2" : style == 2 ? "75A79A" : "6D9978");
                Color light = Hex(style == 3 ? "DEC08C" : style == 4 ? "C0B8C9" : style == 2 ? "A0C5AE" : "ABC68F");
                if (style == 1)
                {
                    for (int i = 0; i < 3; i++)
                        MeshPart("Seven-sided pine tier", tree, cone, new Vector3(0, 1.55f + i * 1.2f, 0),
                            new Vector3(2.1f - i * .4f, 2.5f, 2.1f - i * .4f), Color.Lerp(dark, light, i * .24f));
                }
                else
                {
                    Gem("Low shadow canopy", tree, new Vector3(0, 3.1f, 0), new Vector3(2.05f, 1.22f, 1.8f), dark);
                    Gem("Left leaf crown", tree, new Vector3(-.95f, 3.7f, -.1f), new Vector3(1.48f, 1.45f, 1.5f), Color.Lerp(dark, light, .35f));
                    Gem("Right leaf crown", tree, new Vector3(.95f, 3.9f, .15f), new Vector3(1.55f, 1.45f, 1.5f), Color.Lerp(dark, light, .6f));
                    Gem("Sunlit leaf crown", tree, new Vector3(0, 4.6f, -.15f), new Vector3(1.6f, 1.5f, 1.55f), light);
                    if (style == 2)
                    {
                        for (int i = 0; i < 5; i++)
                        {
                            float a = i * Mathf.PI * 2 / 5;
                            Gem("Hanging willow foliage", tree, new Vector3(Mathf.Sin(a) * 1.65f, 2.75f, Mathf.Cos(a) * 1.4f),
                                new Vector3(.55f, 1.5f, .55f), Color.Lerp(dark, light, .25f));
                        }
                    }
                }
                for (int i = 0; i < 3; i++)
                {
                    float a = i * Mathf.PI * 2 / 3;
                    Beam("Surface root", tree, new Vector3(0, .08f, 0), new Vector3(Mathf.Sin(a) * .65f, .04f, Mathf.Cos(a) * .65f), .11f, woodDark);
                }
            }

            private void Column(Transform parent, Vector3 p, float height, Color color, bool broken)
            {
                Transform column = Group(broken ? "Broken fluted column" : "Fluted stone column", parent, p);
                if (navigation != null)
                    navigation.AddCircle(Root.transform.InverseTransformPoint(column.position), .7f);
                Box("Stepped column foot", column, new Vector3(0, .16f, 0), new Vector3(1.35f, .32f, 1.35f), color);
                Box("Column foot moulding", column, new Vector3(0, .39f, 0), new Vector3(1.05f, .15f, 1.05f), Color.Lerp(color, Color.white, .05f));
                Cylinder("Octagonal stone shaft", column, new Vector3(0, .42f + height * .5f, 0), new Vector3(.73f, height * .5f, .73f), color);
                for (int i = 0; i < 6; i++)
                {
                    float a = i * Mathf.PI / 3;
                    Beam("Column flute", column, new Vector3(Mathf.Sin(a) * .35f, .55f, Mathf.Cos(a) * .35f),
                        new Vector3(Mathf.Sin(a) * .35f, height + .3f, Mathf.Cos(a) * .35f), .025f, Color.Lerp(color, Color.black, .1f));
                }
                if (!broken)
                {
                    Box("Column capital", column, new Vector3(0, height + .53f, 0), new Vector3(1.1f, .24f, 1.1f), color);
                    Box("Column crown", column, new Vector3(0, height + .7f, 0), new Vector3(1.35f, .15f, 1.35f), Color.Lerp(color, Color.white, .06f));
                }
                else Rock(column, new Vector3(.06f, height + .42f, 0), new Vector3(.44f, .22f, .41f), color);
            }

            private void Fire(Transform parent, Vector3 p, float size)
            {
                Transform fire = Group("Friendly campfire", parent, p);
                fire.localScale = Vector3.one * size;
                for (int i = 0; i < 3; i++)
                {
                    float angle = i * Mathf.PI / 3;
                    Vector3 direction = new Vector3(Mathf.Cos(angle), 0, Mathf.Sin(angle));
                    Beam("Charred firewood", fire, direction * -.7f + Vector3.up * .08f, direction * .7f + Vector3.up * .08f, .13f, woodDark);
                }
                GameObject flame = Gem("Amber flame", fire, new Vector3(0, .55f, 0), new Vector3(.42f, .8f, .42f), Hex("ECA05D"), false, .6f);
                GameObject core = Gem("Cream flame heart", fire, new Vector3(0, .4f, -.08f), new Vector3(.23f, .52f, .23f), Hex("FFE1A0"), false, 1.3f);
                effects.Animate(flame.transform, .04f, 3.1f, 0, 12, .1f);
                effects.Animate(core.transform, .025f, 4.5f, 1, -7, .12f);
                PointLight("Firelight", fire, new Vector3(0, 1, 0), Hex("FFCE8E"), 1.2f, 6);
            }

            private void Lantern(Transform parent, Vector3 p, float height, Color glow)
            {
                Transform lantern = Group("Field lantern", parent, p);
                Beam("Lantern post", lantern, Vector3.zero, new Vector3(0, height, 0), .07f, woodDark);
                Beam("Lantern bracket", lantern, new Vector3(0, height, 0), new Vector3(.5f, height, 0), .055f, woodDark);
                Beam("Lantern chain", lantern, new Vector3(.45f, height, 0), new Vector3(.45f, height - .25f, 0), .018f, woodDark);
                Box("Glowing lantern glass", lantern, new Vector3(.45f, height - .5f, 0), new Vector3(.3f, .42f, .3f), glow, null, .65f);
                Box("Lantern cap", lantern, new Vector3(.45f, height - .27f, 0), new Vector3(.4f, .08f, .4f), woodDark);
                Box("Lantern base", lantern, new Vector3(.45f, height - .74f, 0), new Vector3(.38f, .08f, .38f), woodDark);
                for (int x = -1; x <= 1; x += 2)
                    for (int z = -1; z <= 1; z += 2)
                        Box("Lantern frame", lantern, new Vector3(.45f + x * .16f, height - .5f, z * .16f), new Vector3(.025f, .46f, .025f), woodDark);
                PointLight("Lantern pool", lantern, new Vector3(.45f, height - .5f, 0), glow, .65f, 4.5f);
            }

            private void Crate(Transform parent, Vector3 p, float size)
            {
                Transform crate = Group("Field supply crate", parent, p);
                crate.localScale = Vector3.one * size;
                Box("Wooden crate", crate, new Vector3(0, .5f, 0), Vector3.one, Hex("B19A74"));
                for (int i = 0; i < 4; i++)
                    Box("Crate plank seam", crate, new Vector3(0, .15f + i * .23f, -.506f), new Vector3(1, .025f, .015f), wood);
                Box("Crate top band", crate, new Vector3(0, .87f, -.52f), new Vector3(1.06f, .13f, .07f), wood);
                Box("Crate bottom band", crate, new Vector3(0, .13f, -.52f), new Vector3(1.06f, .13f, .07f), wood);
                Beam("Diagonal crate brace", crate, new Vector3(-.45f, .18f, -.55f), new Vector3(.45f, .82f, -.55f), .05f, Hex("C8B18B"));
            }

            private void Bench(Transform parent, Vector3 p, float rotation)
            {
                Transform bench = Group("Resting bench", parent, p);
                bench.localRotation = Quaternion.Euler(0, rotation, 0);
                for (int i = -1; i <= 1; i++)
                    Box("Bench seat plank", bench, new Vector3(0, .7f, i * .23f), new Vector3(2.1f, .12f, .2f), Hex("B5A17F"));
                for (int side = -1; side <= 1; side += 2)
                {
                    Box("Bench foot", bench, new Vector3(side * .7f, .32f, 0), new Vector3(.24f, .65f, .55f), woodDark);
                    Beam("Bench back support", bench, new Vector3(side * .8f, .3f, .32f), new Vector3(side * .8f, 1.35f, .5f), .06f, woodDark);
                }
                Box("Bench backrest", bench, new Vector3(0, 1.15f, .47f), new Vector3(2.1f, .25f, .12f), wood);
            }

            private void Sign(Transform parent, Vector3 p, float rotation)
            {
                Transform sign = Group("Wayfinding signpost", parent, p);
                sign.localRotation = Quaternion.Euler(0, rotation, 0);
                Beam("Sign post", sign, Vector3.zero, new Vector3(0, 2.05f, 0), .075f, woodDark);
                Box("Arrow board", sign, new Vector3(.1f, 1.7f, 0), new Vector3(1.5f, .38f, .12f), Hex("C8B18A"));
                Tri("Arrow tip", sign, new Vector3(.83f, 1.9f, -.06f), new Vector3(1.14f, 1.7f, -.06f), new Vector3(.83f, 1.5f, -.06f), Hex("C8B18A"), true);
                Ring("Compass sign emblem", sign, new Vector3(-.25f, 1.7f, -.07f), .105f, .025f, Hex("507F73"), 12, false);
                Box("Painted path mark", sign, new Vector3(.3f, 1.7f, -.08f), new Vector3(.45f, .055f, .015f), Hex("507F73"));
            }

            private void Bush(Transform parent, Vector3 p, float size, Color color)
            {
                Transform bush = Group("Leafy understory", parent, p);
                Gem("Bush centre", bush, new Vector3(0, size * .4f, 0), new Vector3(size, size * .7f, size * .75f), color);
                Gem("Bush shoot", bush, new Vector3(size * .45f, size * .55f, .05f), new Vector3(size * .65f, size * .65f, size * .55f), Color.Lerp(color, grassLight, .25f));
            }

            private void GrassTuft(Transform parent, Vector3 p, float size, Color color)
            {
                Transform tuft = Group("Three-blade grass", parent, p);
                for (int i = 0; i < 3; i++)
                {
                    float angle = i * Mathf.PI * 2 / 3;
                    Vector3 end = new Vector3(Mathf.Sin(angle) * size * .3f, size * (i == 0 ? 1 : .7f), Mathf.Cos(angle) * size * .3f);
                    Tri("Grass blade", tuft, new Vector3(-.07f, 0, 0), new Vector3(.07f, 0, 0), end, color, true);
                }
            }

            private void Reeds(Transform parent, Vector3 p, float size)
            {
                Transform reeds = Group("Lakeside reeds", parent, p);
                for (int i = 0; i < 4; i++)
                {
                    Vector3 offset = new Vector3(Rand(-.25f, .25f), 0, Rand(-.25f, .25f));
                    float h = size * Rand(.7f, 1.3f);
                    Beam("Reed stem", reeds, offset, offset + new Vector3(.12f, h, .06f), .018f, Hex("7B9C74"));
                    Gem("Reed seed head", reeds, offset + new Vector3(.12f, h, .06f), new Vector3(.06f, .2f, .06f), Hex("B7A47B"));
                }
            }

            private void Flower(Transform parent, Vector3 p, Color color, float size)
            {
                Transform flower = Group("Meadow bloom", parent, p);
                flower.localScale = Vector3.one * size;
                Beam("Flower stem", flower, Vector3.zero, new Vector3(.04f, .48f, 0), .018f, Hex("789E78"));
                Gem("Five-petal blossom", flower, new Vector3(.04f, .5f, 0), new Vector3(.21f, .105f, .21f), color);
                Gem("Flower centre", flower, new Vector3(.04f, .57f, 0), new Vector3(.065f, .045f, .065f), Hex("D8B773"));
            }

            private void Mushroom(Transform parent, Vector3 p, float size, Color color)
            {
                Transform mushroom = Group("Forest mushroom", parent, p);
                Beam("Mushroom stem", mushroom, Vector3.zero, new Vector3(0, size, 0), size * .13f, Hex("E5DDC1"));
                Gem("Mushroom cap", mushroom, new Vector3(0, size, 0), new Vector3(size * .8f, size * .36f, size * .8f), color);
            }

            private void Crystal(Transform parent, Vector3 p, float size, Color color)
            {
                Transform crystal = Group("Faceted mineral cluster", parent, p);
                GameObject centre = Gem("Tall mineral point", crystal, new Vector3(0, size * .65f, 0), new Vector3(size * .32f, size, size * .3f), color, true, .12f);
                centre.transform.localRotation = Quaternion.Euler(0, 25, -9);
                Gem("Small mineral point", crystal, new Vector3(size * .35f, size * .32f, size * .12f), new Vector3(size * .23f, size * .55f, size * .22f), Color.Lerp(color, Color.white, .15f), true, .1f);
                Gem("Low mineral point", crystal, new Vector3(-size * .3f, size * .24f, -.1f), new Vector3(size * .25f, size * .45f, size * .22f), Color.Lerp(color, darkStone, .15f));
            }

            private void Motes(Transform parent, Vector3 centre, int count, float radius, Color color)
            {
                Transform motes = Group("Drifting light motes", parent);
                for (int i = 0; i < count; i++)
                {
                    Vector3 p = centre + new Vector3(Rand(-radius, radius), Rand(-1, 1.4f), Rand(-radius * .6f, radius * .6f));
                    float size = Rand(.025f, .065f);
                    GameObject mote = Gem("Luminous mote", motes, p, Vector3.one * size, color, false, .8f);
                    effects.Animate(mote.transform, Rand(.15f, .5f), Rand(.45f, 1.2f), i, 15, .2f);
                }
            }

            private void Trail(Transform parent, Vector3[] points, float width, Color color)
            {
                List<Vector3> smooth = new List<Vector3>();
                for (int i = 0; i < points.Length - 1; i++)
                {
                    Vector3 a = points[Mathf.Max(0, i - 1)], b = points[i], c = points[i + 1], d = points[Mathf.Min(points.Length - 1, i + 2)];
                    for (int j = 0; j < 12; j++)
                    {
                        float t = j / 12f;
                        smooth.Add(.5f * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t));
                    }
                }
                smooth.Add(points[points.Length - 1]);
                List<Vector3> vertices = new List<Vector3>();
                List<int> indices = new List<int>();
                for (int i = 0; i < smooth.Count; i++)
                {
                    Vector3 direction = smooth[Mathf.Min(i + 1, smooth.Count - 1)] - smooth[Mathf.Max(0, i - 1)];
                    Vector3 side = Vector3.Cross(direction.normalized, Vector3.up);
                    float localWidth = width * (1 + Mathf.Sin(i * .21f) * .1f) * .5f;
                    Vector3 p = smooth[i]; p.y = .045f;
                    vertices.Add(p + side * localWidth);
                    vertices.Add(p - side * localWidth);
                    if (i < smooth.Count - 1)
                    {
                        int n = i * 2;
                        indices.AddRange(new[] { n, n + 2, n + 1, n + 1, n + 2, n + 3 });
                    }
                }
                Custom("Winding footpath", parent, vertices, indices, color);
            }

            private bool NearTrail(Vector3 p)
            {
                Vector3[][] trails = {
                    new[] { V(0,-9),V(-2,0),V(-10,7),V(-18,12),V(-22,18) },
                    new[] { V(-1,0),V(8,2),V(14,7),V(22,12),V(28,18) },
                    new[] { V(-1,3),V(-2,12),V(3,21),V(0,31) },
                    new[] { V(-2,-5),V(-10,-10),V(-16,-19),V(-25,-20) },
                    new[] { V(2,-6),V(10,-10),V(17,-19),V(25,-23) }
                };
                Vector2 q = new Vector2(p.x, p.z);
                foreach (Vector3[] trail in trails)
                    for (int i = 0; i < trail.Length - 1; i++)
                    {
                        Vector2 a = new Vector2(trail[i].x, trail[i].z), b = new Vector2(trail[i + 1].x, trail[i + 1].z);
                        Vector2 ab = b - a;
                        float t = Mathf.Clamp01(Vector2.Dot(q - a, ab) / ab.sqrMagnitude);
                        if (Vector2.Distance(q, a + ab * t) < 1.9f) return true;
                    }
                return false;
            }

            private static bool InLake(Vector3 p) { return Mathf.Pow((p.x - 22) / 9, 2) + Mathf.Pow((p.z - 12) / 7, 2) < 1; }

            private GameObject Disc(string name, Transform parent, Vector3 position, float rx, float rz, Color color, int segments, float irregularity = 0)
            {
                List<Vector3> vertices = new List<Vector3> { Vector3.zero };
                List<int> indices = new List<int>();
                for (int i = 0; i <= segments; i++)
                {
                    float a = i * Mathf.PI * 2 / segments;
                    float shape = 1 + Mathf.Sin(a * 5 + .4f) * irregularity * .6f + Mathf.Cos(a * 9) * irregularity * .4f;
                    vertices.Add(new Vector3(Mathf.Sin(a) * rx * shape, 0, Mathf.Cos(a) * rz * shape));
                    if (i < segments) indices.AddRange(new[] { 0, i + 1, i + 2 });
                }
                GameObject result = Custom(name, parent, vertices, indices, color);
                result.transform.localPosition = position;
                return result;
            }

            private GameObject Ring(string name, Transform parent, Vector3 position, float radius, float thickness,
                Color color, int segments, bool horizontal, float emission = 0)
            {
                List<Vector3> vertices = new List<Vector3>();
                List<int> indices = new List<int>();
                const int tubeSides = 6;
                for (int i = 0; i <= segments; i++)
                {
                    float a = i * Mathf.PI * 2 / segments;
                    for (int j = 0; j <= tubeSides; j++)
                    {
                        float b = j * Mathf.PI * 2 / tubeSides;
                        float r = radius + Mathf.Cos(b) * thickness;
                        Vector3 p = horizontal ? new Vector3(Mathf.Sin(a) * r, Mathf.Sin(b) * thickness * .35f, Mathf.Cos(a) * r)
                            : new Vector3(Mathf.Sin(a) * r, Mathf.Cos(a) * r, Mathf.Sin(b) * thickness);
                        vertices.Add(p);
                        if (i < segments && j < tubeSides)
                        {
                            int k = i * (tubeSides + 1) + j, next = k + tubeSides + 1;
                            indices.AddRange(new[] { k, k + 1, next, k + 1, next + 1, next });
                        }
                    }
                }
                GameObject result = Custom(name, parent, vertices, indices, color, emission, true);
                result.transform.localPosition = position;
                return result;
            }

            private void Arc(Transform parent, Vector3 position, float radius, float start, float length, float width, Color color, int segments)
            {
                List<Vector3> vertices = new List<Vector3>();
                List<int> indices = new List<int>();
                for (int i = 0; i <= segments; i++)
                {
                    float a = start + length * i / segments;
                    vertices.Add(new Vector3(Mathf.Sin(a) * (radius - width), 0, Mathf.Cos(a) * (radius - width)));
                    vertices.Add(new Vector3(Mathf.Sin(a) * (radius + width), 0, Mathf.Cos(a) * (radius + width)));
                    if (i < segments)
                    {
                        int k = i * 2;
                        indices.AddRange(new[] { k, k + 2, k + 1, k + 1, k + 2, k + 3 });
                    }
                }
                GameObject arc = Custom("Water ripple", parent, vertices, indices, color, 0, true);
                arc.transform.localPosition = position;
            }

            private GameObject Rock(Transform parent, Vector3 p, Vector3 size, Color color)
            {
                GameObject rock = Gem("Weathered stone", parent, p, size, color);
                rock.transform.localRotation = Quaternion.Euler(Rand(-10, 10), Rand(0, 360), Rand(-12, 12));
                if (navigation != null && size.y >= .7f)
                    navigation.AddCircle(Root.transform.InverseTransformPoint(rock.transform.position), Mathf.Max(size.x, size.z) * .72f);
                return rock;
            }

            private GameObject Gem(string name, Transform parent, Vector3 p, Vector3 scale, Color color, bool shadows = true, float emission = 0)
            {
                return MeshPart(name, parent, pebble, p, scale, color, shadows, emission);
            }

            private GameObject MeshPart(string name, Transform parent, Mesh mesh, Vector3 p, Vector3 scale, Color color, bool shadows = true, float emission = 0)
            {
                GameObject obj = new GameObject(name);
                obj.transform.SetParent(parent, false);
                obj.transform.localPosition = p;
                obj.transform.localScale = scale;
                obj.AddComponent<MeshFilter>().sharedMesh = mesh;
                MeshRenderer renderer = obj.AddComponent<MeshRenderer>();
                renderer.sharedMaterial = Mat(color, emission);
                renderer.shadowCastingMode = shadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
                renderer.receiveShadows = shadows;
                return obj;
            }

            private GameObject Box(string name, Transform parent, Vector3 p, Vector3 size, Color color, Quaternion? rotation = null, float emission = 0)
            {
                GameObject result = Primitive(name, parent, PrimitiveType.Cube, p, size, color, emission);
                if (rotation.HasValue) result.transform.localRotation = rotation.Value;
                return result;
            }

            private GameObject Cylinder(string name, Transform parent, Vector3 p, Vector3 size, Color color)
            {
                return Primitive(name, parent, PrimitiveType.Cylinder, p, size, color);
            }

            private GameObject Primitive(string name, Transform parent, PrimitiveType type, Vector3 p, Vector3 scale, Color color, float emission = 0)
            {
                GameObject obj = GameObject.CreatePrimitive(type);
                obj.name = name;
                obj.transform.SetParent(parent, false);
                obj.transform.localPosition = p;
                obj.transform.localScale = scale;
                Collider collider = obj.GetComponent<Collider>();
                collider.enabled = false;
                if (Application.isPlaying) UnityEngine.Object.Destroy(collider);
                else UnityEngine.Object.DestroyImmediate(collider);
                obj.GetComponent<Renderer>().sharedMaterial = Mat(color, emission);
                return obj;
            }

            private GameObject Beam(string name, Transform parent, Vector3 a, Vector3 b, float radius, Color color)
            {
                GameObject beam = Cylinder(name, parent, (a + b) * .5f, new Vector3(radius * 2, (b - a).magnitude * .5f, radius * 2), color);
                beam.transform.localRotation = Quaternion.FromToRotation(Vector3.up, b - a);
                return beam;
            }

            private void Tri(string name, Transform parent, Vector3 a, Vector3 b, Vector3 c, Color color, bool doubleSided = false)
            {
                Custom(name, parent, new List<Vector3> { a, b, c }, new List<int> { 0, 1, 2 }, color, 0, doubleSided);
            }

            private void Quad(string name, Transform parent, Vector3 a, Vector3 b, Vector3 c, Vector3 d, Color color, bool doubleSided = false)
            {
                Custom(name, parent, new List<Vector3> { a, b, c, d }, new List<int> { 0, 1, 2, 0, 2, 3 }, color, 0, doubleSided);
            }

            private GameObject Custom(string name, Transform parent, List<Vector3> vertices, List<int> indices, Color color, float emission = 0, bool doubleSided = false)
            {
                if (doubleSided)
                {
                    int original = indices.Count;
                    int vertexCount = vertices.Count;
                    vertices.AddRange(vertices.ToArray());
                    for (int i = 0; i < original; i += 3)
                        indices.AddRange(new[] { indices[i + 2] + vertexCount, indices[i + 1] + vertexCount, indices[i] + vertexCount });
                }
                Mesh mesh = new Mesh { name = name };
                if (vertices.Count > 65535) mesh.indexFormat = IndexFormat.UInt32;
                mesh.SetVertices(vertices);
                mesh.SetTriangles(indices, 0);
                mesh.RecalculateNormals();
                mesh.RecalculateBounds();
                effects.Own(mesh);
                return MeshPart(name, parent, mesh, Vector3.zero, Vector3.one, color, true, emission);
            }

            private Material Mat(Color color, float emission = 0)
            {
                string key = ColorUtility.ToHtmlStringRGBA(color) + ":" + emission.ToString("F2", System.Globalization.CultureInfo.InvariantCulture);
                Material material;
                if (materials.TryGetValue(key, out material)) return material;
                Shader shader = Shader.Find("PokeLab/SoftLit");
                if (shader == null) shader = Shader.Find("Standard");
                if (shader == null) shader = Shader.Find("Universal Render Pipeline/Lit");
                if (shader == null) shader = Shader.Find("Unlit/Color");
                material = new Material(shader) { name = "Diorama " + key, color = color };
                material.enableInstancing = true;
                if (material.HasProperty("_Glossiness")) material.SetFloat("_Glossiness", .08f);
                if (material.HasProperty("_Smoothness")) material.SetFloat("_Smoothness", .08f);
                if (material.HasProperty("_Metallic")) material.SetFloat("_Metallic", 0);
                if (emission > 0)
                {
                    material.EnableKeyword("_EMISSION");
                    material.SetColor("_EmissionColor", color * emission);
                }
                if (color.a < .99f)
                {
                    material.SetFloat("_Mode", 3);
                    material.SetInt("_SrcBlend", (int)BlendMode.SrcAlpha);
                    material.SetInt("_DstBlend", (int)BlendMode.OneMinusSrcAlpha);
                    material.SetInt("_ZWrite", 0);
                    material.DisableKeyword("_ALPHATEST_ON");
                    material.EnableKeyword("_ALPHABLEND_ON");
                    material.DisableKeyword("_ALPHAPREMULTIPLY_ON");
                    material.renderQueue = 3000;
                }
                materials[key] = material;
                effects.Own(material);
                return material;
            }

            private Transform Group(string name, Transform parent = null, Vector3? p = null)
            {
                GameObject obj = new GameObject(name);
                obj.transform.SetParent(parent == null ? Root.transform : parent, false);
                if (p.HasValue) obj.transform.localPosition = p.Value;
                return obj.transform;
            }

            private void PointLight(string name, Transform parent, Vector3 p, Color color, float intensity, float range)
            {
                Transform t = Group(name, parent, p);
                Light light = t.gameObject.AddComponent<Light>();
                light.type = LightType.Point;
                light.color = color;
                light.intensity = intensity;
                light.range = range;
                light.shadows = LightShadows.None;
                light.renderMode = LightRenderMode.Auto;
            }

            private float Rand(float min, float max) { return min + (float)random.NextDouble() * (max - min); }
            private static Vector3 V(float x, float z) { return new Vector3(x, 0, z); }
            private static Color Hex(string hex) { Color color; ColorUtility.TryParseHtmlString("#" + hex, out color); return color; }

            private static Mesh MakeIcosahedron()
            {
                float t = (1 + Mathf.Sqrt(5)) / 2;
                Vector3[] points = {
                    new Vector3(-1,t,0),new Vector3(1,t,0),new Vector3(-1,-t,0),new Vector3(1,-t,0),
                    new Vector3(0,-1,t),new Vector3(0,1,t),new Vector3(0,-1,-t),new Vector3(0,1,-t),
                    new Vector3(t,0,-1),new Vector3(t,0,1),new Vector3(-t,0,-1),new Vector3(-t,0,1)
                };
                int[] triangles = { 0,11,5, 0,5,1, 0,1,7, 0,7,10, 0,10,11, 1,5,9, 5,11,4, 11,10,2, 10,7,6,
                    7,1,8, 3,9,4, 3,4,2, 3,2,6, 3,6,8, 3,8,9, 4,9,5, 2,4,11, 6,2,10, 8,6,7, 9,8,1 };
                List<Vector3> vertices = new List<Vector3>();
                List<int> indices = new List<int>();
                for (int i = 0; i < triangles.Length; i += 3)
                {
                    Vector3 a = points[triangles[i]].normalized, b = points[triangles[i + 1]].normalized, c = points[triangles[i + 2]].normalized;
                    Vector3 ab = (a + b).normalized, bc = (b + c).normalized, ca = (c + a).normalized;
                    AddFace(vertices, indices, a, ab, ca);
                    AddFace(vertices, indices, b, bc, ab);
                    AddFace(vertices, indices, c, ca, bc);
                    AddFace(vertices, indices, ab, bc, ca);
                }
                Mesh mesh = new Mesh { name = "Soft faceted icosphere", vertices = vertices.ToArray(), triangles = indices.ToArray() };
                mesh.RecalculateNormals(); mesh.RecalculateBounds();
                return mesh;
            }

            private static void AddFace(List<Vector3> vertices, List<int> indices, Vector3 a, Vector3 b, Vector3 c)
            {
                int n = vertices.Count;
                vertices.Add(a); vertices.Add(b); vertices.Add(c);
                indices.Add(n); indices.Add(n + 1); indices.Add(n + 2);
            }

            private static Mesh MakeCone(int sides)
            {
                List<Vector3> vertices = new List<Vector3>();
                List<int> indices = new List<int>();
                for (int i = 0; i < sides; i++)
                {
                    float a = i * Mathf.PI * 2 / sides, b = (i + 1) * Mathf.PI * 2 / sides;
                    Vector3 pa = new Vector3(Mathf.Sin(a), 0, Mathf.Cos(a)), pb = new Vector3(Mathf.Sin(b), 0, Mathf.Cos(b));
                    AddFace(vertices, indices, pa, pb, Vector3.up);
                    AddFace(vertices, indices, pb, pa, Vector3.zero);
                }
                Mesh mesh = new Mesh { name = "Seven-sided conifer", vertices = vertices.ToArray(), triangles = indices.ToArray() };
                mesh.RecalculateNormals(); mesh.RecalculateBounds();
                return mesh;
            }
        }
    }
}
