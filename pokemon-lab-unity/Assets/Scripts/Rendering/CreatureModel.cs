using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace PokeLab
{
    /// <summary>Original, soft sculpted companions made entirely from native Unity meshes.</summary>
    public static class CreatureModel
    {
        static Mesh sphereMesh;

        public static GameObject Create(CreatureConfig config, Transform parent = null)
        {
            if (config == null) config = new CreatureConfig();
            var root = new GameObject(string.IsNullOrEmpty(config.name) ? "Little companion" : config.name);
            root.transform.SetParent(parent, false);
            root.transform.localScale = Vector3.one * Mathf.Clamp(config.size > 0 ? config.size : 1f, .65f, 1.4f);
            var resources = root.AddComponent<CreatureResources>();
            var art = Group("Sculpture", root.transform, Vector3.zero);
            art.localScale = Vector3.one * .68f;
            var build = new Sculptor(resources);
            Material body = build.Material("Velvet body", Parse(config.color, "#F4CC65"), .25f);
            Material accent = build.Material("Warm markings", Parse(config.accent, "#7F614F"), .18f);
            Material cream = build.Material("Soft tummy", Parse(config.belly, "#FFF0C7"), .22f);
            Material dark = build.Material("Glossy eyes", Parse("#242B31", "#242B31"), .68f);
            Material tips = build.Material("Ear tips", Parse("#3F3C3B", "#3F3C3B"), .2f);
            Material white = build.Material("Catchlight", Color.white, .48f);
            Material pink = build.Material("Rosy cheeks", CheekColor(config.type), .23f);
            Material leaf = build.Material("Fresh leaves", Parse("#69A878", "#69A878"), .28f);
            Material vein = build.Material("Leaf veins", Parse("#B9DA91", "#B9DA91"), .2f);
            float width = config.body == "chunky" ? .94f : config.body == "slim" ? .65f : .79f;
            float depth = config.body == "chunky" ? .68f : config.body == "slim" ? .53f : .61f;
            build.Ellipsoid("Pear-shaped body", art, new Vector3(0, 1.09f, -.04f), new Vector3(width, .85f, depth), body);
            build.Ellipsoid("Cream tummy", art, new Vector3(0, 1.04f, depth - .06f), new Vector3(width * .65f, .58f, .09f), cream);
            Transform head = Group("Head", art, new Vector3(0, 2.16f, .06f));
            build.Ellipsoid("Round head", head, Vector3.zero, new Vector3(1.01f, .85f, .79f), body);
            build.Ellipsoid("Soft muzzle", head, new Vector3(0, -.27f, .668f), new Vector3(.37f, .205f, .143f), body);
            var ears = new List<Transform>();
            var eyes = new List<Transform>();
            for (int side = -1; side <= 1; side += 2)
            {
                string label = side < 0 ? "Left" : "Right";
                Transform arm = build.Ellipsoid(label + " paw", art, new Vector3(side * width * .91f, 1.08f, .12f), new Vector3(.255f, .44f, .27f), body);
                arm.localRotation = Quaternion.Euler(-8, 0, side * 23);
                Transform foot = build.Ellipsoid(label + " foot", art, new Vector3(side * .46f, .21f, .24f), new Vector3(.35f, .21f, .46f), body);
                foot.localRotation = Quaternion.Euler(0, side * -8, 0);
                for (int toe = 0; toe < 2; toe++)
                    build.Curve(label + " toe crease", art, new[] { new Vector3(side * .46f + (toe - .5f) * .14f, .24f, .679f), new Vector3(side * .46f + (toe - .5f) * .14f, .29f, .65f) }, .009f, accent, 3);
                Transform cheek = build.Ellipsoid(label + " blush", head, new Vector3(side * .68f, -.22f, .561f), new Vector3(.16f, .11f, .028f), pink);
                cheek.localRotation = Quaternion.Euler(10, side * 30, side * -6);
                build.Ellipsoid(label + " blush sparkle", head, new Vector3(side * .68f - .04f, -.19f, .587f), new Vector3(.026f, .018f, .009f), cream);
                Transform eye = Group(label + " eye", head, new Vector3(side * .355f, .075f, .716f));
                if (config.eyes == "sleepy")
                {
                    build.Curve("Dreamy eyelid", eye, new[] { new Vector3(-.115f, .025f, .01f), new Vector3(0, -.025f, .04f), new Vector3(.115f, .025f, .01f) }, .025f, dark);
                }
                else
                {
                    eyes.Add(eye);
                    float eyeHeight = config.eyes == "round" ? .205f : .185f;
                    build.Ellipsoid("Obsidian eye", eye, Vector3.zero, new Vector3(.135f, eyeHeight, .086f), dark);
                    build.Ellipsoid("Lower iris light", eye, new Vector3(.014f, -.083f, .078f), new Vector3(.066f, .054f, .008f), accent);
                    build.Ellipsoid("Main eye light", eye, new Vector3(-.038f, .071f, .077f), new Vector3(.042f, .055f, .017f), white);
                    build.Ellipsoid("Tiny eye light", eye, new Vector3(.044f, -.035f, .086f), new Vector3(.019f, .022f, .01f), white);
                    build.Curve("Kind eyebrow", head, new[] { new Vector3(side * .355f - .08f, .36f, .663f), new Vector3(side * .355f, .385f, .676f), new Vector3(side * .355f + .08f, .365f, .662f) }, .012f, accent, 6);
                }
                CreateEar(build, head, config, side, body, tips, pink, accent, ears);
            }
            Transform nose = build.Ellipsoid("Tiny nose", head, new Vector3(0, -.145f, .814f), new Vector3(.052f, .034f, .031f), dark);
            nose.localRotation = Quaternion.Euler(0, 0, 180);
            build.Curve("Double smile", head, new[] { new Vector3(-.2f, -.265f, .77f), new Vector3(-.12f, -.31f, .809f), new Vector3(0, -.265f, .835f), new Vector3(.12f, -.31f, .809f), new Vector3(.2f, -.265f, .77f) }, .018f, dark);
            if (config.type == "ghost")
            {
                build.Ellipsoid("Playful little fang", head, new Vector3(.135f, -.32f, .809f), new Vector3(.035f, .055f, .02f), cream);
                for (int i = -1; i <= 1; i++)
                {
                    var spike = build.Leaf("Velvet back tuft", art, new Vector3(i * .27f, 1.65f, -.54f), .28f, .55f, .19f, body);
                    spike.localRotation = Quaternion.Euler(-32, 0, i * -22);
                }
            }
            else if (config.type == "water") CreateShell(build, art, accent, cream, depth);
            else if (config.type == "grass") CreateBulb(build, art, head, leaf, vein, accent, depth);
            else
            {
                for (int i = 0; i < 2; i++)
                    build.Ellipsoid("Back marking", art, new Vector3(0, 1.18f + i * .27f, -depth), new Vector3(width * .51f, .067f, .055f), accent);
            }
            if (config.type == "fairy")
            {
                for (int i = 0; i < 11; i++)
                {
                    float angle = i * Mathf.PI * 2 / 11;
                    build.Ellipsoid("Fluffy collar tuft", art, new Vector3(Mathf.Sin(angle) * .56f, 1.56f + Mathf.Cos(angle * 2) * .045f, Mathf.Cos(angle) * .45f), new Vector3(.24f, .22f, .23f), cream);
                }
            }
            Transform tail = CreateTail(build, art, config, body, accent, cream, leaf, vein);
            CreateAccessory(build, art, head, config.accessory, cream, leaf, vein);
            var motion = root.AddComponent<CreatureMotion>();
            motion.Initialize(art, head, ears.ToArray(), tail, eyes.ToArray());
            return root;
        }

        static void CreateEar(Sculptor s, Transform head, CreatureConfig c, int side, Material body, Material tips, Material pink, Material accent, List<Transform> ears)
        {
            if (c.ears == "none") return;
            Transform ear = Group(side < 0 ? "Left ear" : "Right ear", head, new Vector3(side * .6f, .59f, -.03f));
            ear.localRotation = Quaternion.Euler(0, 0, side * -16);
            ear.localScale = Vector3.one * Mathf.Clamp(c.earSize > 0 ? c.earSize : 1, .5f, 1.5f);
            ears.Add(ear);
            if (c.ears == "round")
            {
                s.Ellipsoid("Round ear", ear, new Vector3(0, .18f, 0), new Vector3(.31f, .34f, .185f), body);
                s.Ellipsoid("Inner ear", ear, new Vector3(0, .2f, .167f), new Vector3(.18f, .205f, .025f), pink);
            }
            else if (c.ears == "pointy")
            {
                s.Leaf("Pointed velvet ear", ear, new Vector3(0, -.07f, 0), .51f, .91f, .22f, body);
                s.Leaf("Pink ear inset", ear, new Vector3(0, .1f, .126f), .26f, .57f, .018f, pink);
            }
            else
            {
                s.Leaf("Long tapered ear", ear, new Vector3(0, -.1f, 0), .4f, 1.39f, .2f, body);
                s.Leaf("Ear-tip cap", ear, new Vector3(0, -.1f, 0), .405f, 1.395f, .205f, c.type == "fairy" ? accent : tips, .74f);
                s.Leaf("Inner ear velvet", ear, new Vector3(0, .16f, .105f), .145f, .66f, .015f, c.type == "fairy" ? accent : pink);
            }
        }

        static Transform CreateTail(Sculptor s, Transform art, CreatureConfig c, Material body, Material accent, Material cream, Material green, Material vein)
        {
            Transform tail = Group("Tail", art, new Vector3(.51f, .74f, -.46f));
            if (c.tail == "bolt")
            {
                var points = new[] { new Vector2(-.1f, 0), new Vector2(.22f, .2f), new Vector2(.1f, .6f), new Vector2(.48f, .54f), new Vector2(.36f, .98f), new Vector2(.86f, 1.48f), new Vector2(1.21f, 1.13f), new Vector2(.69f, .84f), new Vector2(.86f, .38f), new Vector2(.47f, .43f), new Vector2(.52f, .07f), new Vector2(.08f, -.18f) };
                s.Polygon("Sculpted lightning tail", tail, points, .18f, body);
                s.Curve("Tail root", tail, new[] { new Vector3(-.08f, -.04f, .015f), new Vector3(.12f, .09f, .015f), new Vector3(.23f, .16f, .015f) }, .095f, accent, 6);
            }
            else if (c.tail == "flame")
            {
                s.Curve("Curved salamander tail", tail, new[] { Vector3.zero, new Vector3(.48f, .02f, -.18f), new Vector3(.91f, .25f, -.12f), new Vector3(1.04f, .65f, .02f) }, .15f, body, 24, true);
                Material orange = s.Material("Flame coral", Parse("#FF9154", "#FF9154"), .2f, .18f);
                Material gold = s.Material("Flame honey", Parse("#FFDC87", "#FFDC87"), .2f, .2f);
                Transform flame = s.Leaf("Soft flame silhouette", tail, new Vector3(1.02f, .59f, .02f), .54f, .88f, .39f, orange);
                flame.localRotation = Quaternion.Euler(0, 0, -12);
                s.Leaf("Inner flame", tail, new Vector3(1.03f, .64f, .223f), .29f, .52f, .055f, gold);
                s.Leaf("Flame flick", tail, new Vector3(.84f, .77f, 0), .2f, .44f, .18f, orange).localRotation = Quaternion.Euler(0, 0, 25);
            }
            else if (c.tail == "curly")
            {
                s.Curve("Curled water tail", tail, new[] { Vector3.zero, new Vector3(.46f, .07f, -.17f), new Vector3(.86f, .35f, -.12f), new Vector3(.92f, .78f, -.05f), new Vector3(.64f, 1.02f, -.02f), new Vector3(.4f, .84f, .01f), new Vector3(.49f, .6f, .02f), new Vector3(.68f, .65f, .02f) }, .14f, body, 36);
            }
            else if (c.tail == "leaf")
            {
                if (c.type == "fairy")
                {
                    Transform fox = s.Leaf("Plush fox tail", tail, new Vector3(.1f, -.04f, -.1f), .75f, 1.43f, .6f, body);
                    fox.localRotation = Quaternion.Euler(-22, 0, -44);
                    s.Leaf("Cream tail tip", fox, new Vector3(0, 1.0f, 0), .52f, .44f, .42f, cream);
                }
                else
                {
                    s.Curve("Leaf tail stem", tail, new[] { Vector3.zero, new Vector3(.35f, .17f, -.06f), new Vector3(.65f, .54f, 0) }, .065f, accent);
                    Transform foliage = s.Leaf("Leaf tail", tail, new Vector3(.52f, .37f, 0), .66f, 1.18f, .105f, green);
                    foliage.localRotation = Quaternion.Euler(0, 0, -27);
                    s.Curve("Leaf midrib", foliage, new[] { new Vector3(0, .05f, .055f), new Vector3(0, .47f, .063f), new Vector3(0, 1.03f, .025f) }, .016f, vein);
                }
            }
            return tail;
        }

        static void CreateShell(Sculptor s, Transform art, Material brown, Material cream, float depth)
        {
            s.Ellipsoid("Shell cream rim", art, new Vector3(0, 1.12f, -depth + .09f), new Vector3(.77f, .83f, .25f), cream);
            s.Ellipsoid("Polished shell", art, new Vector3(0, 1.13f, -depth - .05f), new Vector3(.67f, .73f, .26f), brown);
            for (int i = 0; i < 6; i++)
            {
                float angle = i * Mathf.PI / 3;
                float next = (i + 1) * Mathf.PI / 3;
                Vector3 a = new Vector3(Mathf.Sin(angle) * .31f, 1.15f + Mathf.Cos(angle) * .37f, -depth - .296f);
                Vector3 b = new Vector3(Mathf.Sin(next) * .31f, 1.15f + Mathf.Cos(next) * .37f, -depth - .296f);
                s.Curve("Shell hexagonal seam", art, new[] { a, b }, .017f, cream, 2);
                s.Curve("Shell radial seam", art, new[] { a, new Vector3(Mathf.Sin(angle) * .59f, 1.15f + Mathf.Cos(angle) * .63f, -depth - .16f) }, .016f, cream, 2);
            }
            for (int i = 0; i < 3; i++)
                s.Curve("Tummy shell seam", art, new[] { new Vector3(-.38f, .79f + i * .2f, depth + .008f), new Vector3(0, .75f + i * .2f, depth + .035f), new Vector3(.38f, .79f + i * .2f, depth + .008f) }, .012f, brown);
        }

        static void CreateBulb(Sculptor s, Transform art, Transform head, Material leaf, Material vein, Material accent, float depth)
        {
            s.Ellipsoid("Dorsal seed bulb", art, new Vector3(0, 1.64f, -depth - .15f), new Vector3(.64f, .64f, .61f), leaf);
            for (int i = 0; i < 5; i++)
            {
                float angle = i * Mathf.PI * 2 / 5;
                Transform petal = s.Leaf("Bulb folded leaf", art, new Vector3(Mathf.Sin(angle) * .34f, 1.49f, -depth -.12f + Mathf.Cos(angle) * .32f), .48f, .88f, .18f, i % 2 == 0 ? vein : leaf);
                petal.localRotation = Quaternion.Euler(Mathf.Cos(angle) * -23, angle * Mathf.Rad2Deg, Mathf.Sin(angle) * 23);
            }
            for (int side = -1; side <= 1; side += 2)
            {
                Transform mark = s.Ellipsoid("Seedling forehead mark", head, new Vector3(side * .63f, .31f, .524f), new Vector3(.11f, .16f, .025f), accent);
                mark.localRotation = Quaternion.Euler(-16, side * 28, side * 24);
            }
        }

        static void CreateAccessory(Sculptor s, Transform art, Transform head, string accessory, Material cream, Material green, Material vein)
        {
            if (accessory == "scarf")
            {
                Material blue = s.Material("Woven sky scarf", Parse("#6BA9BD", "#6BA9BD"), .12f);
                var points = new Vector3[25];
                for (int i = 0; i < points.Length; i++) { float a = i * Mathf.PI * 2 / (points.Length - 1); points[i] = new Vector3(Mathf.Sin(a) * .59f, 1.57f, Mathf.Cos(a) * .45f); }
                s.Curve("Scarf collar", art, points, .105f, blue, 36);
                s.Ellipsoid("Scarf knot", art, new Vector3(.36f, 1.54f, .48f), new Vector3(.18f, .14f, .13f), blue);
                Transform end = s.Ellipsoid("Long scarf end", art, new Vector3(.43f, 1.24f, .6f), new Vector3(.14f, .34f, .067f), blue);
                end.localRotation = Quaternion.Euler(0, 0, 16);
                for (int i = 0; i < 3; i++) s.Curve("Scarf stitch", art, new[] { new Vector3(.3f + i * .07f, .96f, .658f), new Vector3(.31f + i * .07f, 1.01f, .664f) }, .007f, cream, 2);
            }
            else if (accessory == "flower")
            {
                Transform flower = Group("Blossom", head, new Vector3(-.74f, .49f, .44f));
                flower.localRotation = Quaternion.Euler(0, -20, -12);
                Material petal = s.Material("Peach blossom", Parse("#F5A7B5", "#F5A7B5"), .23f);
                for (int i = 0; i < 5; i++)
                {
                    float angle = i * Mathf.PI * 2 / 5;
                    Transform p = s.Ellipsoid("Blossom petal", flower, new Vector3(Mathf.Sin(angle) * .17f, Mathf.Cos(angle) * .17f, 0), new Vector3(.12f, .18f, .065f), petal);
                    p.localRotation = Quaternion.Euler(0, 0, -angle * Mathf.Rad2Deg);
                }
                s.Ellipsoid("Golden blossom heart", flower, new Vector3(0, 0, .066f), new Vector3(.105f, .105f, .055f), cream);
            }
            else if (accessory == "sprout")
            {
                s.Curve("Sprout stem", head, new[] { new Vector3(0, .79f, 0), new Vector3(0, .96f, 0), new Vector3(.04f, 1.11f, 0) }, .028f, green);
                Transform left = s.Leaf("Sprout left leaf", head, new Vector3(0, .94f, 0), .26f, .49f, .075f, green);
                left.localRotation = Quaternion.Euler(0, 0, 66);
                Transform right = s.Leaf("Sprout right leaf", head, new Vector3(.02f, 1.03f, 0), .28f, .53f, .075f, vein);
                right.localRotation = Quaternion.Euler(0, 0, -66);
            }
        }

        static Transform Group(string name, Transform parent, Vector3 position)
        {
            Transform t = new GameObject(name).transform;
            t.SetParent(parent, false);
            t.localPosition = position;
            return t;
        }

        static Color Parse(string html, string fallback)
        {
            Color color;
            if (string.IsNullOrEmpty(html) || !ColorUtility.TryParseHtmlString(html, out color)) ColorUtility.TryParseHtmlString(fallback, out color);
            return color;
        }

        static Color CheekColor(string type)
        {
            return Parse(type == "electric" ? "#F07D68" : type == "ghost" ? "#CA9CD1" : type == "water" ? "#E9AAB2" : type == "fairy" ? "#DD9BA9" : "#EDA28B", "#EDA28B");
        }

        sealed class Sculptor
        {
            readonly CreatureResources owner;
            public Sculptor(CreatureResources owner) { this.owner = owner; }
            public Material Material(string name, Color color, float gloss, float emission = 0)
            {
                var material = new Material(Shader.Find("PokeLab/SoftLit") ?? Shader.Find("Standard"));
                material.name = name;
                material.color = color;
                material.SetFloat("_Glossiness", gloss);
                material.SetFloat("_Metallic", 0);
                material.enableInstancing = true;
                if (emission > 0) { material.EnableKeyword("_EMISSION"); material.SetColor("_EmissionColor", color * emission); }
                owner.materials.Add(material);
                return material;
            }
            Transform Render(string name, Transform parent, Mesh mesh, Material material, Vector3 position)
            {
                var t = Group(name, parent, position);
                t.gameObject.AddComponent<MeshFilter>().sharedMesh = mesh;
                var renderer = t.gameObject.AddComponent<MeshRenderer>();
                renderer.sharedMaterial = material;
                renderer.shadowCastingMode = ShadowCastingMode.On;
                renderer.receiveShadows = true;
                return t;
            }
            public Transform Ellipsoid(string name, Transform parent, Vector3 position, Vector3 scale, Material material)
            {
                if (sphereMesh == null) sphereMesh = MakeSphere();
                var t = Render(name, parent, sphereMesh, material, position);
                t.localScale = scale;
                return t;
            }
            public Transform Leaf(string name, Transform parent, Vector3 position, float width, float height, float thickness, Material material, float start = 0)
            {
                const int rings = 13, sides = 16;
                var vertices = new List<Vector3>(); var uv = new List<Vector2>(); var triangles = new List<int>();
                for (int y = 0; y <= rings; y++)
                {
                    float t = Mathf.Lerp(start, 1, y / (float)rings);
                    float profile = Mathf.Pow(Mathf.Max(0, Mathf.Sin(t * Mathf.PI)), .75f) * (1.1f - .48f * t);
                    for (int j = 0; j <= sides; j++)
                    {
                        float a = j * Mathf.PI * 2 / sides;
                        vertices.Add(new Vector3(Mathf.Cos(a) * width * .5f * profile, t * height, Mathf.Sin(a) * thickness * .5f * profile));
                        uv.Add(new Vector2(j / (float)sides, t));
                    }
                }
                GridTriangles(triangles, rings, sides);
                Mesh mesh = FinishMesh(name, vertices, triangles, uv); owner.meshes.Add(mesh);
                return Render(name, parent, mesh, material, position);
            }
            public Transform Curve(string name, Transform parent, Vector3[] points, float radius, Material material, int segments = 16, bool taper = false)
            {
                const int sides = 7;
                var vertices = new List<Vector3>(); var uv = new List<Vector2>(); var indices = new List<int>();
                for (int i = 0; i <= segments; i++)
                {
                    float t = i / (float)segments;
                    Vector3 center = Spline(points, t);
                    Vector3 tangent = (Spline(points, Mathf.Min(1, t + .003f)) - Spline(points, Mathf.Max(0, t - .003f))).normalized;
                    Vector3 normal = Vector3.Cross(tangent, Mathf.Abs(Vector3.Dot(tangent, Vector3.forward)) > .95f ? Vector3.up : Vector3.forward).normalized;
                    Vector3 binormal = Vector3.Cross(normal, tangent).normalized;
                    float r = radius * (taper ? Mathf.Lerp(1.12f, .55f, t) : 1);
                    for (int j = 0; j <= sides; j++)
                    {
                        float a = j * Mathf.PI * 2 / sides;
                        vertices.Add(center + (normal * Mathf.Cos(a) + binormal * Mathf.Sin(a)) * r);
                        uv.Add(new Vector2(j / (float)sides, t));
                    }
                }
                GridTriangles(indices, segments, sides);
                Mesh mesh = FinishMesh(name, vertices, indices, uv); owner.meshes.Add(mesh);
                return Render(name, parent, mesh, material, Vector3.zero);
            }
            public Transform Polygon(string name, Transform parent, Vector2[] points, float depth, Material material)
            {
                // Ear-clipped front and back preserve the concave lightning silhouette.
                var vertices = new List<Vector3>(); var indices = new List<int>(); var uv = new List<Vector2>();
                int count = points.Length;
                for (int face = 0; face < 2; face++) foreach (Vector2 p in points) { vertices.Add(new Vector3(p.x, p.y, face == 0 ? depth * .5f : -depth * .5f)); uv.Add(p); }
                var polygon = new List<int>(); for (int i = 0; i < count; i++) polygon.Add(i);
                float area = 0; for (int i = 0; i < count; i++) area += Cross(points[i], points[(i + 1) % count]);
                if (area < 0) polygon.Reverse();
                int guard = count * count;
                while (polygon.Count > 2 && guard-- > 0)
                {
                    bool clipped = false;
                    for (int i = 0; i < polygon.Count; i++)
                    {
                        int a = polygon[(i + polygon.Count - 1) % polygon.Count], b = polygon[i], c = polygon[(i + 1) % polygon.Count];
                        if (Cross(points[b] - points[a], points[c] - points[b]) <= 0) continue;
                        bool contains = false;
                        foreach (int p in polygon) if (p != a && p != b && p != c && InTriangle(points[p], points[a], points[b], points[c])) { contains = true; break; }
                        if (contains) continue;
                        indices.Add(a); indices.Add(b); indices.Add(c);
                        indices.Add(c + count); indices.Add(b + count); indices.Add(a + count);
                        polygon.RemoveAt(i); clipped = true; break;
                    }
                    if (!clipped) break;
                }
                for (int i = 0; i < count; i++)
                {
                    int j = (i + 1) % count;
                    if (area > 0) { indices.Add(i); indices.Add(i + count); indices.Add(j); indices.Add(j); indices.Add(i + count); indices.Add(j + count); }
                    else { indices.Add(j); indices.Add(i + count); indices.Add(i); indices.Add(j + count); indices.Add(i + count); indices.Add(j); }
                }
                Mesh mesh = FinishMesh(name, vertices, indices, uv); owner.meshes.Add(mesh);
                return Render(name, parent, mesh, material, Vector3.zero);
            }
        }

        static bool InTriangle(Vector2 p, Vector2 a, Vector2 b, Vector2 c) { return Cross(b - a, p - a) >= 0 && Cross(c - b, p - b) >= 0 && Cross(a - c, p - c) >= 0; }
        static float Cross(Vector2 a, Vector2 b) { return a.x * b.y - a.y * b.x; }
        static Vector3 Spline(Vector3[] points, float t)
        {
            float f = t * (points.Length - 1); int i = Mathf.Min(Mathf.FloorToInt(f), points.Length - 2); float u = f - i;
            Vector3 a = points[Mathf.Max(0, i - 1)], b = points[i], c = points[i + 1], d = points[Mathf.Min(points.Length - 1, i + 2)];
            return .5f * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
        }
        static void GridTriangles(List<int> triangles, int rows, int columns)
        {
            for (int i = 0; i < rows; i++) for (int j = 0; j < columns; j++)
            {
                int a = i * (columns + 1) + j, b = a + columns + 1;
                triangles.Add(a); triangles.Add(b); triangles.Add(a + 1);
                triangles.Add(a + 1); triangles.Add(b); triangles.Add(b + 1);
            }
        }
        static Mesh FinishMesh(string name, List<Vector3> vertices, List<int> indices, List<Vector2> uv)
        {
            var mesh = new Mesh { name = name };
            mesh.SetVertices(vertices); mesh.SetTriangles(indices, 0); mesh.SetUVs(0, uv); mesh.RecalculateNormals(); mesh.RecalculateBounds();
            return mesh;
        }
        static Mesh MakeSphere()
        {
            const int rings = 18, sides = 24;
            var vertices = new List<Vector3>(); var uv = new List<Vector2>(); var triangles = new List<int>();
            for (int i = 0; i <= rings; i++)
            {
                float p = i * Mathf.PI / rings;
                for (int j = 0; j <= sides; j++)
                {
                    float t = j * Mathf.PI * 2 / sides;
                    vertices.Add(new Vector3(Mathf.Cos(t) * Mathf.Sin(p), -Mathf.Cos(p), Mathf.Sin(t) * Mathf.Sin(p)));
                    uv.Add(new Vector2(j / (float)sides, i / (float)rings));
                }
            }
            GridTriangles(triangles, rings, sides);
            Mesh mesh = FinishMesh("PokeLab smooth shared sphere", vertices, triangles, uv);
            var normals = new Vector3[vertices.Count]; for (int i = 0; i < vertices.Count; i++) normals[i] = vertices[i].normalized;
            mesh.normals = normals;
            return mesh;
        }
    }

    /// <summary>All movement is inside the art child, leaving gameplay positions untouched.</summary>
    public sealed class CreatureMotion : MonoBehaviour
    {
        public float excitement = 1;
        Transform art, head, tail;
        Transform[] ears = Array.Empty<Transform>(), eyes = Array.Empty<Transform>();
        Quaternion headRest, tailRest;
        Quaternion[] earRest;
        Vector3 artScale;
        float phase;
        public void Initialize(Transform art, Transform head, Transform[] ears, Transform tail, Transform[] eyes)
        {
            this.art = art; this.head = head; this.ears = ears; this.tail = tail; this.eyes = eyes;
            artScale = art.localScale; headRest = head.localRotation; tailRest = tail.localRotation;
            earRest = new Quaternion[ears.Length]; for (int i = 0; i < ears.Length; i++) earRest[i] = ears[i].localRotation;
            phase = UnityEngine.Random.Range(0, 6.28f);
        }
        void Update()
        {
            if (art == null) return;
            float time = Time.time + phase;
            float breath = Mathf.Sin(time * 2.2f) * .009f * excitement;
            art.localScale = Vector3.Scale(artScale, new Vector3(1 - breath * .35f, 1 + breath, 1 - breath * .35f));
            head.localRotation = headRest * Quaternion.Euler(Mathf.Sin(time * 1.2f) * 1.4f, Mathf.Sin(time * .68f) * 3.2f * excitement, Mathf.Sin(time * .9f) * 1.2f);
            for (int i = 0; i < ears.Length; i++) ears[i].localRotation = earRest[i] * Quaternion.Euler(Mathf.Sin(time * 1.8f + i) * 2.8f, 0, Mathf.Sin(time * 2.1f + i * 2) * 2);
            tail.localRotation = tailRest * Quaternion.Euler(0, Mathf.Sin(time * 2.3f) * 5.5f * excitement, Mathf.Sin(time * 1.7f) * 2);
            float blinkClock = Mathf.Repeat(time, 4.8f);
            float blink = blinkClock < .14f ? Mathf.Max(.06f, Mathf.Abs(blinkClock - .07f) / .07f) : 1;
            for (int i = 0; i < eyes.Length; i++) eyes[i].localScale = new Vector3(1, blink, 1);
        }
    }

    public sealed class CreatureResources : MonoBehaviour
    {
        public readonly List<Mesh> meshes = new List<Mesh>();
        public readonly List<Material> materials = new List<Material>();
        void OnDestroy()
        {
            foreach (var mesh in meshes) if (mesh != null) { if (Application.isPlaying) Destroy(mesh); else DestroyImmediate(mesh); }
            foreach (var material in materials) if (material != null) { if (Application.isPlaying) Destroy(material); else DestroyImmediate(material); }
        }
    }
}
