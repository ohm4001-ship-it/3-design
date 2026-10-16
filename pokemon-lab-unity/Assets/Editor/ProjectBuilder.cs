using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace PokeLab.Editor
{
    /// <summary>Creates the launch scene once, and supplies reproducible local build/visual checks.</summary>
    [InitializeOnLoad]
    public static class ProjectBuilder
    {
        public const string ScenePath = "Assets/Scenes/Adventure.unity";
        const string PendingBuild = "PokeLab.PendingBuild";
        const string SmokeActive = "PokeLab.RuntimeSmokeActive";
        const string SmokeDeadline = "PokeLab.RuntimeSmokeDeadline";
        static string ProjectRoot => Path.GetFullPath(Path.Combine(Application.dataPath, ".."));

        static ProjectBuilder()
        {
            if (SessionState.GetBool(SmokeActive, false)) InstallSmokeWatchdog();
            if (!Application.isBatchMode) EditorApplication.delayCall += OnEditorReady;
        }

        static void OnEditorReady()
        {
            if (EditorApplication.isCompiling || EditorApplication.isUpdating)
            {
                EditorApplication.delayCall += OnEditorReady;
                return;
            }
            if (EditorApplication.isPlayingOrWillChangePlaymode) return;
            if (!File.Exists(Path.Combine(ProjectRoot, ScenePath))) Prepare();
            string pending = SessionState.GetString(PendingBuild, "");
            if (pending.Length == 0) return;
            SessionState.EraseString(PendingBuild);
            if (pending == "WebGL") BuildWebGL();
            else if (pending == "Windows") BuildWindows();
        }

        [MenuItem("PokeLab/Prepare project", priority = 1)]
        public static void Prepare()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play mode before preparing or building the project.");
            PlayerSettings.companyName = "PokeLab";
            PlayerSettings.productName = "PokeLab Wilds";
            PlayerSettings.bundleVersion = "1.0.0";
            PlayerSettings.defaultScreenWidth = 1600;
            PlayerSettings.defaultScreenHeight = 900;
            PlayerSettings.defaultWebScreenWidth = 1600;
            PlayerSettings.defaultWebScreenHeight = 900;
            PlayerSettings.resizableWindow = true;
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            PlayerSettings.runInBackground = true;
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);
            GraphicsSettings.defaultRenderPipeline = null;
            QualitySettings.renderPipeline = null;
            QualitySettings.antiAliasing = 4;
            QualitySettings.shadows = ShadowQuality.All;
            QualitySettings.shadowResolution = ShadowResolution.High;
            QualitySettings.shadowDistance = 100;
            QualitySettings.vSyncCount = 1;
            QualitySettings.pixelLightCount = 4;

            // This project uses UnityEngine.Input and StandaloneInputModule, without the Input System package.
            Object[] playerAssets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset");
            if (playerAssets.Length > 0)
            {
                var serialized = new SerializedObject(playerAssets[0]);
                SerializedProperty input = serialized.FindProperty("activeInputHandler");
                if (input != null && input.intValue != 0) { input.intValue = 0; serialized.ApplyModifiedPropertiesWithoutUndo(); }
            }
            IncludeRuntimeShaders();
            EnsureInputAxes();
            EnsureAdventureScene();
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            AssetDatabase.SaveAssets();
            Debug.Log("POKELAB_PREPARED: Open Assets/Scenes/Adventure.unity and press Play.");
        }

        static void IncludeRuntimeShaders()
        {
            Object[] assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset");
            if (assets.Length == 0) throw new InvalidOperationException("Unity has not initialized GraphicsSettings.asset yet. Finish importing, then run Prepare again.");
            var serialized = new SerializedObject(assets[0]);
            SerializedProperty included = serialized.FindProperty("m_AlwaysIncludedShaders");
            if (included == null) throw new InvalidOperationException("Could not configure shaders required by the procedural models.");
            for (int i = included.arraySize - 1; i >= 0; i--)
            {
                var previous = included.GetArrayElementAtIndex(i).objectReferenceValue as Shader;
                if (previous != null && previous.name == "Standard")
                {
                    included.GetArrayElementAtIndex(i).objectReferenceValue = null;
                    included.DeleteArrayElementAtIndex(i);
                }
            }
            foreach (string shaderName in new[] { "PokeLab/SoftLit", "UI/Default", "UI/Default Font", "Sprites/Default", "Unlit/Color" })
            {
                Shader shader = Shader.Find(shaderName);
                if (shader == null) throw new InvalidOperationException("Required shader is missing: " + shaderName);
                bool found = false;
                for (int i = 0; i < included.arraySize; i++) if (included.GetArrayElementAtIndex(i).objectReferenceValue == shader) { found = true; break; }
                if (!found) { int index = included.arraySize; included.InsertArrayElementAtIndex(index); included.GetArrayElementAtIndex(index).objectReferenceValue = shader; }
            }
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        static void EnsureInputAxes()
        {
            var inputAssets=AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/InputManager.asset");
            if(inputAssets.Length==0)return;
            var serialized=new SerializedObject(inputAssets[0]);var axes=serialized.FindProperty("m_Axes");
            EnsureAxis(axes,"Horizontal","left","right","a","d",0,0);
            EnsureAxis(axes,"Vertical","down","up","s","w",0,0);
            EnsureAxis(axes,"Mouse X","","","","",1,0);
            EnsureAxis(axes,"Mouse Y","","","","",1,1);
            EnsureAxis(axes,"Submit","","return","","space",0,0);
            EnsureAxis(axes,"Cancel","","escape","","",0,0);
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }
        static void EnsureAxis(SerializedProperty axes,string name,string negative,string positive,string alternateNegative,string alternatePositive,int type,int axis)
        {
            for(int i=0;i<axes.arraySize;i++)if(axes.GetArrayElementAtIndex(i).FindPropertyRelative("m_Name").stringValue==name)return;
            int next=axes.arraySize;axes.InsertArrayElementAtIndex(next);var item=axes.GetArrayElementAtIndex(next);
            item.FindPropertyRelative("m_Name").stringValue=name;
            item.FindPropertyRelative("negativeButton").stringValue=negative;item.FindPropertyRelative("positiveButton").stringValue=positive;
            item.FindPropertyRelative("altNegativeButton").stringValue=alternateNegative;item.FindPropertyRelative("altPositiveButton").stringValue=alternatePositive;
            item.FindPropertyRelative("gravity").floatValue=type==1?0:3;item.FindPropertyRelative("dead").floatValue=.001f;
            item.FindPropertyRelative("sensitivity").floatValue=type==1?.1f:3;item.FindPropertyRelative("snap").boolValue=type==0;
            item.FindPropertyRelative("invert").boolValue=false;item.FindPropertyRelative("type").intValue=type;item.FindPropertyRelative("axis").intValue=axis;
            item.FindPropertyRelative("joyNum").intValue=0;
        }

        static void EnsureAdventureScene()
        {
            if (File.Exists(Path.Combine(ProjectRoot, ScenePath))) return;
            Directory.CreateDirectory(Path.Combine(Application.dataPath, "Scenes"));
            AssetDatabase.Refresh();
            Scene previous = SceneManager.GetActiveScene();
            bool replaceInitialScene = CanReplaceInitialScene(previous);
            if (HasUntitledScene() && !replaceInitialScene) ThrowUnsavedScene();
            // Unity forbids additive scene creation while its fresh Untitled scene is open.
            // Only replace the untouched initial scene; edited scenes remain in place.
            Scene created = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, replaceInitialScene ? NewSceneMode.Single : NewSceneMode.Additive);
            SceneManager.SetActiveScene(created);
            var bootstrap = new GameObject("POKE LAB · Press Play to explore");
            bootstrap.AddComponent<GameDirector>();
            if (!EditorSceneManager.SaveScene(created, ScenePath)) throw new IOException("Could not save " + ScenePath);
            if (!replaceInitialScene)
            {
                EditorSceneManager.CloseScene(created, true);
                if (previous.IsValid() && previous.isLoaded) SceneManager.SetActiveScene(previous);
            }
        }

        static bool CanReplaceInitialScene(Scene scene)
        {
            return SceneManager.sceneCount == 1 && scene.IsValid() && string.IsNullOrEmpty(scene.path) && !scene.isDirty;
        }

        static bool HasUntitledScene()
        {
            for (int i = 0; i < SceneManager.sceneCount; i++)
                if (string.IsNullOrEmpty(SceneManager.GetSceneAt(i).path)) return true;
            return false;
        }

        static void ThrowUnsavedScene()
        {
            throw new InvalidOperationException("Save your Untitled scene before using PokeLab project tools. Its unsaved contents have been preserved.");
        }

        [MenuItem("PokeLab/Build/Windows game", priority = 20)]
        public static void BuildWindows()
        {
            if (!EnsureTarget(BuildTarget.StandaloneWindows64, BuildTargetGroup.Standalone, "Windows", "Win64")) return;
            Prepare();
            Build(BuildTarget.StandaloneWindows64, "Builds/Windows/PokeLabWilds.exe");
        }

        [MenuItem("PokeLab/Build/Web game", priority = 21)]
        public static void BuildWebGL()
        {
            if (!EnsureTarget(BuildTarget.WebGL, BuildTargetGroup.WebGL, "WebGL", "WebGL")) return;
            Prepare();
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.WebGL, ScriptingImplementation.IL2CPP);
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
            PlayerSettings.WebGL.decompressionFallback = true;
            PlayerSettings.WebGL.initialMemorySize = 256;
            PlayerSettings.WebGL.maximumMemorySize = 2048;
            PlayerSettings.WebGL.template = "PROJECT:PokeLab";
            Build(BuildTarget.WebGL, "Builds/WebGL");
        }

        static bool EnsureTarget(BuildTarget target, BuildTargetGroup group, string label, string argument)
        {
            if (!BuildPipeline.IsBuildTargetSupported(group, target)) throw new InvalidOperationException(label + " support is not installed. Add it in Unity Hub > Installs > Add modules.");
            if (EditorUserBuildSettings.activeBuildTarget == target) return true;
            if (Application.isBatchMode) throw new InvalidOperationException("Start Unity with -buildTarget " + argument + " before executing this build method.");
            SessionState.SetString(PendingBuild, label);
            if (!EditorUserBuildSettings.SwitchActiveBuildTarget(group, target))
            {
                SessionState.EraseString(PendingBuild);
                throw new InvalidOperationException("Unity could not switch to " + label + ".");
            }
            // Target switches recompile scripts. Resume after the new domain is ready.
            EditorApplication.delayCall += OnEditorReady;
            return false;
        }

        static void Build(BuildTarget target, string relativeOutput)
        {
            string output = Path.Combine(ProjectRoot, relativeOutput);
            Directory.CreateDirectory(target == BuildTarget.WebGL ? output : Path.GetDirectoryName(output));
            BuildReport report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
                scenes = new[] { ScenePath }, locationPathName = output, target = target,
                options = BuildOptions.StrictMode
            });
            if (report.summary.result != BuildResult.Succeeded)
                throw new BuildFailedException("PokeLab " + target + " build " + report.summary.result + ": " + report.summary.totalErrors + " errors.");
            Debug.Log("POKELAB_BUILD_SUCCEEDED: " + output + " (" + report.summary.totalSize + " bytes)");
        }

        [MenuItem("PokeLab/Validate generated geometry", priority = 30)]
        public static void ValidateGeometry()
        {
            Prepare();
            WithTemporaryScene(() => {
                int renderers = 0;
                foreach (CreatureConfig preset in GameCatalog.Presets)
                {
                    GameObject creature = CreatureModel.Create(preset);
                    renderers += ValidateRoot(creature);
                    Object.DestroyImmediate(creature);
                }
                GameObject world = WorldBuilder.BuildOverworld();
                renderers += ValidateRoot(world);
                ValidateNavigation(world.GetComponent<WorldNavigation>());
                Object.DestroyImmediate(world);
                for (int theme = 0; theme < 3; theme++) for (int room = 0; room < 3; room++)
                {
                    GameObject dungeon = WorldBuilder.BuildDungeon(theme, room);
                    renderers += ValidateRoot(dungeon);
                    Object.DestroyImmediate(dungeon);
                }
                Directory.CreateDirectory(Path.Combine(ProjectRoot, "Logs"));
                File.WriteAllText(Path.Combine(ProjectRoot, "Logs/geometry-validation.txt"), "PASS: six creature presets, overworld and all nine dungeon rooms.\nMesh renderers checked: " + renderers + "\nUnity: " + Application.unityVersion + "\n");
                Debug.Log("POKELAB_GEOMETRY_VALID: " + renderers + " mesh renderers; all vertices finite, meshes and shaders present.");
            });
        }

        static int ValidateRoot(GameObject root)
        {
            MeshRenderer[] renderers = root.GetComponentsInChildren<MeshRenderer>();
            if (renderers.Length == 0) throw new InvalidOperationException(root.name + " contains no visible geometry.");
            var seen = new HashSet<Mesh>();
            foreach (MeshRenderer renderer in renderers)
            {
                MeshFilter filter = renderer.GetComponent<MeshFilter>();
                if (filter == null || filter.sharedMesh == null || filter.sharedMesh.vertexCount == 0) throw new InvalidOperationException(renderer.name + " is missing mesh data.");
                foreach (Material material in renderer.sharedMaterials)
                    if (material == null || material.shader == null) throw new InvalidOperationException(renderer.name + " is missing a material or shader.");
                if (!seen.Add(filter.sharedMesh)) continue;
                foreach (Vector3 vertex in filter.sharedMesh.vertices)
                    if (!Finite(vertex.x) || !Finite(vertex.y) || !Finite(vertex.z)) throw new InvalidOperationException(renderer.name + " contains a non-finite vertex.");
                foreach (int index in filter.sharedMesh.triangles)
                    if (index < 0 || index >= filter.sharedMesh.vertexCount) throw new InvalidOperationException(renderer.name + " contains an invalid triangle index.");
            }
            return renderers.Length;
        }

        static bool Finite(float value) { return !float.IsInfinity(value) && !float.IsNaN(value); }

        static void ValidateNavigation(WorldNavigation navigation)
        {
            if(navigation==null)throw new InvalidOperationException("Overworld is missing its navigation.");
            foreach(var point in new[]{Vector3.zero,new Vector3(-22,0,18),new Vector3(21,0,12),new Vector3(0,0,30)})
            {
                var safe=navigation.FindSafePosition(point);
                if(!navigation.IsWalkable(safe))throw new InvalidOperationException("A travel destination has no safe arrival.");
            }
            var bridge=navigation.Move(new Vector3(18,0,12),new Vector3(26,0,12));
            if(bridge.x<25.5f||bridge.y<.3f)throw new InvalidOperationException("Lake bridge is not traversable at the boardwalk height.");
            var shore=navigation.FindSafePosition(new Vector3(22,0,2));
            var blocked=navigation.Move(shore,new Vector3(22,0,9));
            if(!navigation.IsWalkable(blocked)||blocked.z>7)throw new InvalidOperationException("Walking can enter the lake outside the bridge.");
            var coast=navigation.Move(navigation.FindSafePosition(new Vector3(42,0,0)),new Vector3(60,0,0));
            if(new Vector2(coast.x,coast.z).magnitude>45.81f)throw new InvalidOperationException("Walking can escape the coastline.");
        }

        public static void RunRuntimeSmoke()
        {
            if (!Application.isBatchMode) throw new InvalidOperationException("RunRuntimeSmoke is a batch automation entry point; use Play for interactive testing.");
            Prepare();
            EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            SessionState.SetBool(SmokeActive, true);
            SessionState.SetString(SmokeDeadline, DateTime.UtcNow.AddMinutes(5).ToString("O", CultureInfo.InvariantCulture));
            InstallSmokeWatchdog();
            EditorApplication.isPlaying = true;
            Debug.Log("POKELAB_RUNTIME_SMOKE_STARTED: Waiting for the GameDirector smoke coroutine.");
        }

        [MenuItem("PokeLab/Play adventure", priority = 2)]
        public static void Play()
        {
            Prepare();
            EditorSceneManager.OpenScene(ScenePath,OpenSceneMode.Single);
            EditorApplication.ExecuteMenuItem("Window/General/Game");
            EditorApplication.isPlaying=true;
        }

        static void InstallSmokeWatchdog()
        {
            EditorApplication.update -= CheckSmokeDeadline;
            EditorApplication.update += CheckSmokeDeadline;
            Application.logMessageReceived -= OnSmokeLog;
            Application.logMessageReceived += OnSmokeLog;
        }

        static void CheckSmokeDeadline()
        {
            if (!SessionState.GetBool(SmokeActive, false)) return;
            DateTime deadline;
            if (!DateTime.TryParse(SessionState.GetString(SmokeDeadline, ""), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out deadline) || DateTime.UtcNow > deadline)
            {
                SessionState.SetBool(SmokeActive, false);
                Console.Error.WriteLine("POKELAB_RUNTIME_SMOKE_FAILED: The five-minute runtime deadline expired.");
                EditorApplication.Exit(1);
            }
        }

        static void OnSmokeLog(string message, string stackTrace, LogType type)
        {
            if (!SessionState.GetBool(SmokeActive, false) || (type != LogType.Exception && type != LogType.Error)) return;
            SessionState.SetBool(SmokeActive, false);
            Console.Error.WriteLine("POKELAB_RUNTIME_SMOKE_FAILED: " + message + "\n" + stackTrace);
            EditorApplication.Exit(1);
        }

        [MenuItem("PokeLab/Capture art previews", priority = 31)]
        public static void CaptureScene()
        {
            Prepare();
            if (SystemInfo.graphicsDeviceType == GraphicsDeviceType.Null) throw new InvalidOperationException("Rendering requires a graphics device. Run this method without -nographics.");
            string folder = Path.Combine(ProjectRoot, "Evidence");
            Directory.CreateDirectory(folder);
            WithTemporaryScene(() => {
                Camera camera = MakeCaptureCamera();
                GameObject world = WorldBuilder.BuildOverworld();
                AddLight();
                camera.transform.position = new Vector3(60, 64, 76);
                camera.transform.LookAt(new Vector3(0, 0, 3)); camera.fieldOfView = 48;
                RenderPng(camera, Path.Combine(folder, "01-island.png"));
                Object.DestroyImmediate(world);

                var lineup = new GameObject("Companion collection preview");
                for (int i = 0; i < GameCatalog.Presets.Length; i++)
                {
                    var model = CreatureModel.Create(GameCatalog.Presets[i], lineup.transform);
                    model.transform.position = new Vector3((i - 2.5f) * 2.3f, 0, 0);
                    model.transform.rotation = Quaternion.Euler(0, -10, 0);
                }
                GameObject floor = GameObject.CreatePrimitive(PrimitiveType.Cube);
                floor.transform.SetParent(lineup.transform); floor.transform.position = new Vector3(0, -.2f, 0); floor.transform.localScale = new Vector3(30, .4f, 20);
                var floorMaterial = new Material(Shader.Find("PokeLab/SoftLit")) { color = new Color(.76f, .84f, .76f) };
                floor.GetComponent<Renderer>().sharedMaterial = floorMaterial;
                camera.transform.position = new Vector3(0, 5.3f, 17); camera.transform.LookAt(new Vector3(0, 1.15f, 0)); camera.fieldOfView = 34;
                RenderPng(camera, Path.Combine(folder, "02-companions.png"));
                Object.DestroyImmediate(lineup); Object.DestroyImmediate(floorMaterial);

                for (int theme = 0; theme < 3; theme++)
                {
                    GameObject dungeon = WorldBuilder.BuildDungeon(theme, 2);
                    GameObject companion = CreatureModel.Create(GameCatalog.Presets[0], dungeon.transform);
                    companion.transform.position = new Vector3(-3, .11f, -3); companion.transform.rotation = Quaternion.Euler(0, 45, 0);
                    GameObject guardian = CreatureModel.Create(GameCatalog.Dungeons[theme].guardian, dungeon.transform);
                    guardian.transform.position = new Vector3(3, .11f, 3); guardian.transform.rotation = Quaternion.Euler(0, 200, 0);
                    camera.transform.position = new Vector3(21, 23, -27); camera.transform.LookAt(new Vector3(0, 1.2f, 1)); camera.fieldOfView = 43;
                    camera.backgroundColor = new Color(.58f, .66f, .66f);
                    RenderPng(camera, Path.Combine(folder, "0" + (theme + 3) + "-" + GameCatalog.Dungeons[theme].id + ".png"));
                    Object.DestroyImmediate(dungeon);
                }
            });
            Debug.Log("POKELAB_ART_CAPTURED: " + folder);
        }

        static void WithTemporaryScene(Action action)
        {
            Scene previous = SceneManager.GetActiveScene();
            if (HasUntitledScene())
            {
                if (!CanReplaceInitialScene(previous)) ThrowUnsavedScene();
                // Prepare has already created Adventure. Keep it loaded while the temporary scene runs.
                previous = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            }
            Scene temp = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
            SceneManager.SetActiveScene(temp);
            try { action(); }
            finally
            {
                // Explicit destruction invokes resource owners before the temporary scene is closed.
                foreach (GameObject root in temp.GetRootGameObjects()) if (root != null) Object.DestroyImmediate(root);
                EditorSceneManager.CloseScene(temp, true);
                if (previous.IsValid() && previous.isLoaded) SceneManager.SetActiveScene(previous);
            }
        }

        static Camera MakeCaptureCamera()
        {
            var camera = new GameObject("Art capture camera").AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(.73f, .86f, .84f);
            camera.nearClipPlane = .1f; camera.farClipPlane = 400; camera.allowHDR = false;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(.8f, .88f, .88f);
            RenderSettings.ambientEquatorColor = new Color(.65f, .75f, .68f);
            RenderSettings.ambientGroundColor = new Color(.45f, .52f, .44f);
            RenderSettings.fog = false;
            return camera;
        }

        static void AddLight()
        {
            Light light = new GameObject("Soft afternoon sun").AddComponent<Light>();
            light.type = LightType.Directional; light.transform.rotation = Quaternion.Euler(45, -30, 0);
            light.color = new Color(1, .94f, .82f); light.intensity = 1.2f;
            light.shadows = LightShadows.Soft; light.shadowBias = .03f; light.shadowNormalBias = .2f;
        }

        static void RenderPng(Camera camera, string path)
        {
            const int width = 1600, height = 1000;
            var target = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
            var texture = new Texture2D(width, height, TextureFormat.RGB24, false);
            RenderTexture previous = RenderTexture.active;
            try
            {
                camera.targetTexture = target; camera.aspect = width / (float)height; camera.Render();
                RenderTexture.active = target;
                texture.ReadPixels(new Rect(0, 0, width, height), 0, 0); texture.Apply();
                File.WriteAllBytes(path, texture.EncodeToPNG());
            }
            finally
            {
                camera.targetTexture = null; RenderTexture.active = previous;
                target.Release(); Object.DestroyImmediate(target); Object.DestroyImmediate(texture);
            }
        }
    }
}
