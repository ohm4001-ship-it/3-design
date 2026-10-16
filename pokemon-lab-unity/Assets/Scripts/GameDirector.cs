using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

namespace PokeLab
{
    public sealed class GameDirector : MonoBehaviour
    {
        #if UNITY_WEBGL && !UNITY_EDITOR
        [System.Runtime.InteropServices.DllImport("__Internal")] static extern void PokeLabSyncSave(string objectName);
        [System.Runtime.InteropServices.DllImport("__Internal")] static extern void PokeLabDownloadJson(string name,string content);
        [System.Runtime.InteropServices.DllImport("__Internal")] static extern void PokeLabInstallClipboardBridge(string objectName);
        #endif
        enum Mode { World, Studio, Dungeon }
        sealed class Wild { public CreatureConfig config; public GameObject model; public Vector3 home; public float phase; }
        [Serializable] sealed class ProjectFile { public string format="poke-lab"; public int version=1; public CreatureConfig config; }
        GameUI ui; Camera cam; Light sun; GameObject scenery, hero, enemy, stage;
        SaveData save; CreatureConfig draft; DungeonRun run; Mode mode;
        readonly List<Wild> wilds=new List<Wild>(); Wild nearest, capture;
        Text inventory, location, prompt, toast, partyText, battleLog;
        Image captureNeedle; RectTransform miniMap, miniDot; GameObject welcome;
        float toastUntil, captureStart, saveTimer, yaw=140, zoom=15, moveAmount; bool useBerry, busy;
        Vector3 worldPosition; string region="meadow", log=""; AudioSource audioSource;
        bool IsSmoke => Array.IndexOf(Environment.GetCommandLineArgs(),"-pokeSmoke")>=0;
        string SavePath => Path.Combine(Application.persistentDataPath,IsSmoke?"smoke-adventure.json":"adventure.json");
        public static GameDirector Instance { get; private set; }
        public SaveData Save => save;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Bootstrap() { if(FindFirstObjectByType<GameDirector>()==null) new GameObject("POKE LAB · Adventure").AddComponent<GameDirector>(); }
        void Awake()
        {
            if(Instance!=null) { Destroy(gameObject); return; } Instance=this;
            Application.targetFrameRate=60; QualitySettings.vSyncCount=1; QualitySettings.antiAliasing=4; QualitySettings.shadows=ShadowQuality.All; QualitySettings.shadowResolution=ShadowResolution.High; QualitySettings.shadowDistance=100;
            save=IsSmoke?new SaveData():Load(); draft=save.draft.Clone(); worldPosition=new Vector3(save.x,0,save.z); if(worldPosition.magnitude>42) worldPosition=Vector3.zero;
            foreach(var old in FindObjectsByType<Camera>(FindObjectsSortMode.None)) Destroy(old.gameObject);
            cam=new GameObject("Adventure camera").AddComponent<Camera>(); cam.tag="MainCamera"; cam.nearClipPlane=.1f; cam.farClipPlane=240; cam.fieldOfView=42; cam.backgroundColor=GameUI.Hex("#b9dcd4"); cam.clearFlags=CameraClearFlags.SolidColor; cam.allowHDR=true; cam.gameObject.AddComponent<AudioListener>();
            sun=new GameObject("Afternoon sunlight").AddComponent<Light>(); sun.type=LightType.Directional; sun.transform.rotation=Quaternion.Euler(42,-32,0); sun.color=GameUI.Hex("#fff1cf"); sun.intensity=1.25f; sun.shadows=LightShadows.Soft; sun.shadowBias=.04f; sun.shadowNormalBias=.3f;
            RenderSettings.ambientMode=UnityEngine.Rendering.AmbientMode.Trilight; RenderSettings.ambientSkyColor=GameUI.Hex("#c3e0df"); RenderSettings.ambientEquatorColor=GameUI.Hex("#a6c2af"); RenderSettings.ambientGroundColor=GameUI.Hex("#6f806c"); RenderSettings.fog=true; RenderSettings.fogMode=FogMode.ExponentialSquared; RenderSettings.fogColor=cam.backgroundColor; RenderSettings.fogDensity=.006f;
            var canvas=new GameObject("Adventure UI",typeof(RectTransform)); ui=canvas.AddComponent<GameUI>(); ui.Initialize(); audioSource=gameObject.AddComponent<AudioSource>(); audioSource.volume=.16f;
            #if UNITY_WEBGL && !UNITY_EDITOR
            PokeLabInstallClipboardBridge(gameObject.name);
            #endif
            OpenWorld();
            if(IsSmoke) StartCoroutine(Smoke());
        }
        #if UNITY_WEBGL && !UNITY_EDITOR
        [UnityEngine.Scripting.Preserve]
        public void OnBrowserPaste(string content)
        {
            if (content == null || EventSystem.current == null) return;
            GameObject selected = EventSystem.current.currentSelectedGameObject;
            InputField field = selected != null ? selected.GetComponent<InputField>() : null;
            if (field == null || !field.isActiveAndEnabled || !field.interactable || field.readOnly) return;
            field.text = content.Length > 20000 ? content.Substring(0, 20000) : content;
            field.MoveTextEnd(false);
        }
        #endif
        SaveData Load()
        {
            try { if(File.Exists(SavePath)) return GameRules.NormalizeSave(JsonUtility.FromJson<SaveData>(File.ReadAllText(SavePath))); }
            catch(Exception e) { Debug.LogWarning("Save could not be read; trying backup: "+e.Message); try { return GameRules.NormalizeSave(JsonUtility.FromJson<SaveData>(File.ReadAllText(SavePath+".bak"))); } catch { } }
            return new SaveData();
        }
        void Persist()
        {
            try { save.draft=GameRules.Normalize(draft); save.x=worldPosition.x; save.z=worldPosition.z; Directory.CreateDirectory(Application.persistentDataPath); var temp=SavePath+".tmp"; File.WriteAllText(temp,JsonUtility.ToJson(save,true)); if(File.Exists(SavePath)) File.Copy(SavePath,SavePath+".bak",true); File.Copy(temp,SavePath,true); File.Delete(temp);
                #if UNITY_WEBGL && !UNITY_EDITOR
                PokeLabSyncSave(gameObject.name);
                #endif
            }
            catch(Exception e) { Debug.LogError("Save failed: "+e.Message); Notify("저장 공간을 확인해주세요. 이번 변경을 저장하지 못했어요."); }
        }
        void OnApplicationQuit() { Persist(); }
        public void OnWebStorageError(string message) { Debug.LogWarning(message); Notify("브라우저 저장 공간을 확인해주세요. 진행 기록을 저장하지 못했어요."); }
        void OnApplicationFocus(bool focus) { if(!focus && save!=null) Persist(); }
        void ClearScene()
        {
            StopAllCoroutinesExceptSmoke();
            if(scenery!=null) Destroy(scenery); if(hero!=null) Destroy(hero); if(enemy!=null) Destroy(enemy); if(stage!=null) Destroy(stage);
            wilds.Clear(); nearest=null; capture=null; captureNeedle=null; busy=false; ui.Clear(); toast=null; inventory=null; prompt=null; miniMap=null; miniDot=null; partyText=null; welcome=null;
        }
        void StopAllCoroutinesExceptSmoke() { /* Effects finish against guarded object references; smoke may span scenes. */ }
        public void OpenWorld()
        {
            ClearScene(); mode=Mode.World; run=null; scenery=WorldBuilder.BuildOverworld(); worldPosition=scenery.GetComponent<WorldNavigation>().FindSafePosition(worldPosition); hero=CreatureModel.Create(save.partner); hero.transform.position=worldPosition; hero.transform.rotation=Quaternion.Euler(0,140,0);
            cam.fieldOfView=42; RenderSettings.fogDensity=.006f; RenderSettings.fogColor=cam.backgroundColor=GameUI.Hex("#b9dcd4"); sun.intensity=1.25f; sun.color=GameUI.Hex("#fff1cf"); SpawnWilds(); BuildWorldUI(); SnapCamera();
        }
        void SpawnWilds()
        {
            var points=new[]{new Vector3(6,0,5),new Vector3(-7,0,8),new Vector3(11,0,-4),new Vector3(-12,0,-5),new Vector3(-21,0,15),new Vector3(-27,0,21),new Vector3(-18,0,25),new Vector3(21,0,8),new Vector3(25,0,16),new Vector3(15,0,20),new Vector3(-5,0,28),new Vector3(8,0,31),new Vector3(-23,0,-19),new Vector3(24,0,-23)};
            for(int i=0;i<points.Length;i++) { var c=GameCatalog.Presets[i%6].Clone(); c.id="wild-"+i; c.name=c.name.Replace("나의 ",""); c.size*=.76f; AddWild(c,points[i]); }
            for(int i=0;i<save.collection.Count;i++) { float a=i*2.4f; var c=save.collection[i].Clone(); c.id="wild-created-"+c.id; AddWild(c,new Vector3(Mathf.Cos(a)*15,0,Mathf.Sin(a)*15)); }
        }
        void AddWild(CreatureConfig c,Vector3 pos)
        {
            if(save.caught.Exists(x=>x.id==c.id)) return;
            pos=scenery.GetComponent<WorldNavigation>().FindSafePosition(pos);
            var model=CreatureModel.Create(c,scenery.transform); model.transform.position=pos; model.transform.rotation=Quaternion.Euler(0,130+wilds.Count*39,0); wilds.Add(new Wild{config=c,model=model,home=pos,phase=wilds.Count*1.7f});
        }
        void BuildWorldUI()
        {
            BuildHeader("W I L D S  /  01");
            var quest=ui.Panel(ui.Root,30,119,290,182,GameUI.Cream,shadow:true); ui.Label(quest,"오늘의 탐험",22,20,240,26,14,GameUI.Muted,true); ui.Label(quest,save.caught.Count==0?"첫 친구를 만나볼까요?":"섬 너머의 이야기를 찾아서",22,55,250,32,20,null,true); ui.Label(quest,"친구 수집  "+save.caught.Count+" / 16\n성소 탐험  "+save.clearedDungeons.Count+" / 3",22,102,245,62,16,GameUI.Muted);
            var party=ui.Panel(ui.Root,30,-155,290,125,GameUI.Cream,new Vector2(0,0),true); ui.Label(party,"함께하는 친구",20,16,230,20,12,GameUI.Muted,true); partyText=ui.Label(party,save.partner.name,20,47,250,30,22,null,true); ui.Label(party,GameCatalog.TypeLabel(save.partner.type)+"  ·  언제나 당신의 편",20,86,250,22,14,GameUI.Muted);
            var mini=ui.Panel(ui.Root,-226,119,196,216,GameUI.Cream,new Vector2(1,1),true); ui.Label(mini,"ISLAND JOURNAL",15,13,166,21,11,GameUI.Muted,true); miniMap=ui.Panel(mini,14,43,168,152,GameUI.Hex("#bcdbd0"));
            ui.Panel(miniMap,26,18,117,117,GameUI.Hex("#d1dcae")); ui.Label(miniMap,"숲",25,29,38,23,12); ui.Label(miniMap,"호수",113,55,45,24,12); ui.Label(miniMap,"유적",66,5,45,24,12); miniDot=ui.Panel(miniMap,80,73,9,9,GameUI.Green);
            var nav=ui.Panel(ui.Root,-366,-100,732,70,GameUI.Cream,new Vector2(.5f,0),true);
            ui.Button(nav,"친구 만들기",10,10,164,50,OpenStudio,GameUI.Green,Color.white); ui.Button(nav,"탐험 도감  [C]",183,10,164,50,ShowCollection); ui.Button(nav,"성소 탐험  [J]",356,10,164,50,ShowDungeons); ui.Button(nav,"섬 지도  [M]",529,10,193,50,ShowMap);
            prompt=ui.Label(ui.Root,"",-300,-172,600,42,20,GameUI.Ink,true,TextAnchor.MiddleCenter); prompt.rectTransform.anchorMin=prompt.rectTransform.anchorMax=new Vector2(.5f,0); prompt.rectTransform.anchoredPosition=new Vector2(-300,172);
            var keys=ui.Panel(ui.Root,-238,-86,208,56,GameUI.Cream,new Vector2(1,0)); ui.Label(keys,"WASD 이동   Shift 달리기\n마우스 우클릭 회전 · 휠 줌",12,8,188,45,12,GameUI.Muted);
            if(save.caught.Count==0) { var w=ui.Panel(ui.Root,30,320,290,202,GameUI.Cream,shadow:true); welcome=w.gameObject; ui.Label(w,"HELLO, LITTLE ADVENTURER",22,21,250,22,11,GameUI.Muted,true); ui.Label(w,"작은 친구와,\n더 넓은 세상으로.",22,57,250,76,27,null,true); ui.Label(w,"야생 친구에게 다가가 E를 눌러보세요.",22,151,245,34,14,GameUI.Muted); }
            RefreshHud();
        }
        void BuildHeader(string chapter)
        {
            var brand=ui.Panel(ui.Root,30,26,290,74,GameUI.Cream,shadow:true); ui.Label(brand,"POKÉ LAB",20,13,160,32,26,null,true); ui.Label(brand,chapter,21,49,190,15,10,GameUI.Muted,true); ui.Label(brand,"Lv. "+GameRules.Level(save.xp),216,24,64,32,17,GameUI.Green,true);
            var place=ui.Panel(ui.Root,-130,34,260,54,GameUI.Cream,new Vector2(.5f,1)); location=ui.Label(place,"햇살 초원",12,0,236,54,18,null,true,TextAnchor.MiddleCenter);
            var bag=ui.Panel(ui.Root,-306,26,276,74,GameUI.Cream,new Vector2(1,1),true); inventory=ui.Label(bag,"",18,15,248,47,17,GameUI.Ink,true,TextAnchor.MiddleCenter);
        }
        void RefreshHud() { if(inventory!=null) inventory.text="볼  "+save.balls+"    열매  "+save.berries+"\n수집  "+save.caught.Count+"    EXP  "+save.xp; }
        void Update()
        {
            if(toast!=null && Time.unscaledTime>toastUntil) { Destroy(toast.transform.parent.gameObject); toast=null; }
            if(capture!=null && captureNeedle!=null) { float t=CaptureTiming(); captureNeedle.rectTransform.anchoredPosition=new Vector2(10+t*440,-2); if(Input.GetKeyDown(KeyCode.Space)) ThrowBall(false); }
            if(capture!=null && ui.Overlay==null) { capture=null; captureNeedle=null; }
            if(Input.GetKeyDown(KeyCode.Escape) && !ui.ModalLocked) { if(capture!=null) { capture=null; captureNeedle=null; } if(ui.Overlay!=null) ui.CloseModal(); else if(mode==Mode.Studio) { Persist(); OpenWorld(); } else if(mode==Mode.Dungeon) ShowLeaveDungeon(); }
            if(mode==Mode.World) UpdateWorld();
            else if(mode==Mode.Studio && hero!=null) { if(Input.GetMouseButton(1)) yaw+=Input.GetAxis("Mouse X")*4; hero.transform.rotation=Quaternion.Euler(0,yaw,0); }
            else if(mode==Mode.Dungeon && !busy && ui.Overlay==null && run!=null && run.phase=="battle") { if(Input.GetKeyDown(KeyCode.Alpha1)) Battle("attack"); if(Input.GetKeyDown(KeyCode.Alpha2)) Battle("skill"); if(Input.GetKeyDown(KeyCode.Alpha3)) Battle("guard"); if(Input.GetKeyDown(KeyCode.Alpha4)) Battle("heal"); }
        }
        void UpdateWorld()
        {
            if(hero==null) return;
            if(ui.Overlay==null)
            {
                Vector2 input=new Vector2(Input.GetAxisRaw("Horizontal"),Input.GetAxisRaw("Vertical")); input=Vector2.ClampMagnitude(input,1); moveAmount=input.magnitude;
                Vector3 f=cam.transform.forward; f.y=0; f.Normalize(); Vector3 right=cam.transform.right; right.y=0; right.Normalize(); Vector3 move=(f*input.y+right*input.x);
                if(move.sqrMagnitude>.01f) { if(welcome!=null) { Destroy(welcome); welcome=null; } var proposed=worldPosition+move*(Input.GetKey(KeyCode.LeftShift)?8:4.8f)*Time.deltaTime; var navigation=scenery.GetComponent<WorldNavigation>(); worldPosition=navigation!=null?navigation.Move(worldPosition,proposed):Vector3.ClampMagnitude(proposed,42); hero.transform.position=worldPosition; hero.transform.rotation=Quaternion.Slerp(hero.transform.rotation,Quaternion.LookRotation(move),Time.deltaTime*12); }
                if(Input.GetMouseButton(1)) yaw+=Input.GetAxis("Mouse X")*3; zoom=Mathf.Clamp(zoom-Input.mouseScrollDelta.y,10,24);
                if(Input.GetKeyDown(KeyCode.C)) ShowCollection(); if(Input.GetKeyDown(KeyCode.J)) ShowDungeons(); if(Input.GetKeyDown(KeyCode.M)) ShowMap(); if(Input.GetKeyDown(KeyCode.E)) Interact();
            }
            nearest=null; float closest=4.5f;
            foreach(var w in wilds) if(w.model!=null) { float d=Vector3.Distance(w.model.transform.position,worldPosition); if(d<closest) { closest=d; nearest=w; } if(d>6) { var proposed=w.home+new Vector3(Mathf.Sin(Time.time*.19f+w.phase),0,Mathf.Cos(Time.time*.16f+w.phase))*.65f;w.model.transform.position=scenery.GetComponent<WorldNavigation>().Move(w.model.transform.position,proposed); } else { var target=worldPosition-w.model.transform.position;target.y=0;if(target.sqrMagnitude>.1f) w.model.transform.rotation=Quaternion.Slerp(w.model.transform.rotation,Quaternion.LookRotation(target),Time.deltaTime*2); } }
            bool camp=worldPosition.magnitude<5, portal=Vector3.Distance(worldPosition,new Vector3(0,0,32))<6;
            if(prompt!=null) prompt.text=nearest!=null?"[E]  "+nearest.config.name+" 만나기":portal?"[E]  달빛 문 너머, 성소 탐험":camp?"[E]  캠프에서 쉬기 · 볼과 열매 보충":"";
            string next=worldPosition.z>26?"ruins":worldPosition.x<-14&&worldPosition.z>8?"forest":worldPosition.x>13&&worldPosition.z>4?"lake":"meadow";
            if(region!=next) { region=next; if(!save.discovered.Contains(region)) { save.discovered.Add(region); save.xp+=15; Notify("새로운 장소 발견 · EXP +15"); Persist(); RefreshHud(); } }
            if(location!=null) location.text=RegionName(region);
            if(miniDot!=null) miniDot.anchoredPosition=new Vector2(80+worldPosition.x*1.4f,-(73-worldPosition.z*1.4f));
            saveTimer+=Time.deltaTime; if(saveTimer>12) { saveTimer=0; Persist(); }
        }
        void LateUpdate()
        {
            if(mode!=Mode.World || hero==null) return; Vector3 target=worldPosition+Vector3.up*1.2f; var offset=Quaternion.Euler(0,yaw-140,0)*new Vector3(zoom*.8f,zoom,-zoom); cam.transform.position=Vector3.Lerp(cam.transform.position,target+offset,1-Mathf.Exp(-5*Time.deltaTime)); cam.transform.LookAt(target);
        }
        void SnapCamera() { if(mode==Mode.World) { cam.transform.position=worldPosition+new Vector3(12,16,-15); cam.transform.LookAt(worldPosition+Vector3.up); } }
        string RegionName(string id) { switch(id) { case "forest":return "속삭임 숲"; case "lake":return "별빛 호수"; case "ruins":return "달빛 유적"; default:return "햇살 초원"; } }
        void Interact() { if(nearest!=null) BeginCapture(nearest); else if(worldPosition.magnitude<5) { GameRules.RestAtCamp(save); Persist(); RefreshHud(); Notify("포근한 쉼! 볼 18개 · 열매 5개까지 보충했어요."); Tone(660); } else if(Vector3.Distance(worldPosition,new Vector3(0,0,32))<6) ShowDungeons(); }
        void BeginCapture(Wild wild)
        {
            if(save.balls<=0) { Notify("볼이 없어요. 캠프에서 보충해주세요."); return; }
            capture=wild; useBerry=false; captureStart=Time.time; DrawCapture();
        }
        void DrawCapture()
        {
            var p=ui.Modal(550,392,capture.config.name+"를 만났어요","A NEW LITTLE FRIEND"); ui.Label(p,GameCatalog.TypeLabel(capture.config.type)+"  ·  초록 구간에 맞춰 볼을 던져보세요.",32,120,480,34,16,GameUI.Muted);
            float captureThreshold=useBerry?.32f:.52f; // Same accuracy threshold as GameRules.TryCapture; accuracy = 1 - |2t - 1|.
            var bar=ui.Panel(p,40,176,470,38,GameUI.Hex("#e2e6d8")); ui.Panel(bar,10+440*captureThreshold*.5f,5,440*(1-captureThreshold),28,GameUI.Mint); captureNeedle=ui.Panel(bar,10,2,5,34,GameUI.Green).GetComponent<Image>();
            ui.Button(p,"볼 던지기  [Space]",32,238,300,54,()=>ThrowBall(false),GameUI.Green,Color.white); ui.Button(p,useBerry?"열매 사용 중":"열매 사용",344,238,174,54,()=>{ if(save.berries>0) { useBerry=!useBerry; DrawCapture(); } else Notify("남은 열매가 없어요."); },useBerry?GameUI.Mint:GameUI.Hex("#e9ecdf"));
            ui.Button(p,"편하게 수집하기",32,308,486,46,()=>ThrowBall(true),GameUI.Hex("#e9ecdf"),GameUI.Muted,15);
        }
        float CaptureTiming() { return (Mathf.Sin((Time.time-captureStart)*2.5f)+1)*.5f; }
        void ThrowBall(bool gentle)
        {
            if(capture==null) return; var target=capture; float accuracy=gentle?1:1-Mathf.Abs(CaptureTiming()-.5f)*2; bool ok=GameRules.TryCapture(save,target.config,accuracy,useBerry); capture=null; captureNeedle=null; ui.CloseModal(); Persist(); RefreshHud();
            if(ok) { var pos=target.model.transform.position+Vector3.up; Destroy(target.model); wilds.Remove(target); Spark(pos,GameUI.Hex(target.config.color)); Notify(target.config.name+"와 친구가 되었어요!  EXP +25"); Tone(880); } else { Notify(save.balls==0?"캠프에서 볼을 보충해주세요.":"살짝 빗나갔어요. 다시 다가가 시도해보세요."); Tone(320); }
        }
        void ShowCollection()
        {
            var p=ui.Modal(900,640,"우리들의 탐험 도감","LITTLE FRIENDS, BIG MEMORIES"); ui.Label(p,"만든 친구 "+save.collection.Count+"  ·  만난 친구 "+save.caught.Count+"     카드를 누르면 함께 탐험해요.",32,117,825,30,16,GameUI.Muted);
            var entries=new List<CreatureConfig>(save.collection); entries.AddRange(save.caught); if(entries.Count==0) { ui.Label(p,"아직 비어 있는 첫 페이지.\n초원에서 첫 친구를 만나보세요!",100,235,700,120,27,GameUI.Muted,false,TextAnchor.MiddleCenter); return; }
            var viewport=ui.Rect("Collection viewport",p,24,165,852,445); viewport.gameObject.AddComponent<RectMask2D>(); var content=ui.Rect("Collection cards",viewport,0,0,852,Mathf.Ceil(entries.Count/3f)*130);
            var scroll=viewport.gameObject.AddComponent<ScrollRect>(); scroll.viewport=viewport; scroll.content=content; scroll.horizontal=false; scroll.movementType=ScrollRect.MovementType.Clamped; scroll.scrollSensitivity=35;
            for(int i=0;i<entries.Count;i++) { var c=entries[i]; float x=i%3*282, y=i/3*130; var card=ui.Panel(content,x,y,270,118,Color.white); ui.Panel(card,16,22,52,52,GameUI.Hex(c.color)); ui.Label(card,c.name,82,22,176,31,18,null,true); ui.Label(card,GameCatalog.TypeLabel(c.type)+(save.partner.id==c.id?" · 함께하는 중":""),82,61,174,25,13,GameUI.Muted); var button=card.gameObject.AddComponent<Button>(); button.onClick.AddListener(()=>ShowFriend(c)); }
        }
        void ShowFriend(CreatureConfig c)
        {
            var p=ui.Modal(560,360,c.name,"A FRIEND FOR EVERY ADVENTURE");ui.Label(p,GameCatalog.TypeLabel(c.type)+" · 함께할 다음 모험이 기다려져요.",32,127,496,40,18,GameUI.Muted);ui.Button(p,"함께 탐험하기",32,198,496,55,()=>{save.partner=c.Clone();Persist();OpenWorld();Notify(c.name+"와 함께 떠나요!");},GameUI.Green,Color.white);ui.Button(p,save.collection.Exists(x=>x.id==c.id)?"공방에서 편집하기":"이 친구로 새 친구 만들기",32,271,496,50,()=>{draft=c.Clone();if(!save.collection.Exists(x=>x.id==c.id))draft.id="";OpenStudio();},GameUI.Mint);
        }
        void ShowMap()
        {
            var p=ui.Modal(800,600,"바람결 섬의 지도","YOUR NEXT SMALL ADVENTURE"); ui.Label(p,"장소를 선택해 빠르게 이동하세요.",32,116,700,30,16,GameUI.Muted); var map=ui.Panel(p,32,169,736,390,GameUI.Hex("#beddd5")); ui.Panel(map,135,20,450,345,GameUI.Hex("#d5dfb9"));
            MapPin(map,"속삭임 숲",115,105,new Vector3(-22,0,18)); MapPin(map,"별빛 호수",480,155,new Vector3(21,0,12)); MapPin(map,"달빛 유적",295,35,new Vector3(0,0,30)); MapPin(map,"베이스 캠프",295,235,Vector3.zero); ui.Label(map,"~   바람결 바다   ~",250,342,250,25,14,GameUI.Muted,false,TextAnchor.MiddleCenter);
        }
        void MapPin(Transform p,string title,float x,float y,Vector3 target) { ui.Button(p,title,x,y,150,50,()=>{ worldPosition=scenery.GetComponent<WorldNavigation>().FindSafePosition(target); ui.CloseModal(); hero.transform.position=worldPosition; SnapCamera(); Persist(); }); }
        public void OpenStudio()
        {
            if(mode==Mode.World) worldPosition=hero.transform.position; ClearScene(); mode=Mode.Studio; draft=GameRules.Normalize(draft); yaw=140; scenery=new GameObject("Creator atelier");
            var floor=GameObject.CreatePrimitive(PrimitiveType.Cylinder); floor.transform.SetParent(scenery.transform); floor.transform.position=new Vector3(0,-.16f,0); floor.transform.localScale=new Vector3(6,.16f,6); floor.GetComponent<Renderer>().material=Mat("#dce8d4");
            var baseDisc=GameObject.CreatePrimitive(PrimitiveType.Cylinder); baseDisc.transform.SetParent(scenery.transform); baseDisc.transform.position=new Vector3(0,-.4f,0); baseDisc.transform.localScale=new Vector3(6.5f,.13f,6.5f); baseDisc.GetComponent<Renderer>().material=Mat("#b5c6ae");
            var plane=GameObject.CreatePrimitive(PrimitiveType.Plane); plane.transform.SetParent(scenery.transform); plane.transform.position=Vector3.down*.7f; plane.transform.localScale=Vector3.one*100; plane.GetComponent<Renderer>().material=Mat("#e8ecdf");
            var stageResources=scenery.AddComponent<WorldEffects>();foreach(var renderer in scenery.GetComponentsInChildren<Renderer>())stageResources.Own(renderer.sharedMaterial);
            cam.transform.position=new Vector3(0,3.3f,-8.5f); cam.transform.LookAt(new Vector3(0,1.1f,0)); cam.fieldOfView=38; RenderSettings.fogDensity=.009f; RenderSettings.fogColor=cam.backgroundColor=GameUI.Hex("#e8ecdf"); sun.intensity=1.1f;
            RefreshModel(); BuildStudioUI();
        }
        void RefreshModel() { if(hero!=null) Destroy(hero); hero=CreatureModel.Create(draft); hero.transform.rotation=Quaternion.Euler(0,yaw,0); }
        void BuildStudioUI()
        {
            ui.Clear(); BuildHeader("C R E A T O R  /  02"); location.text="작은 친구 공방"; RefreshHud();
            var presets=ui.Panel(ui.Root,30,119,242,510,GameUI.Cream,shadow:true); ui.Label(presets,"어떤 친구로 시작할까요?",20,22,210,28,17,null,true);
            for(int i=0;i<GameCatalog.Presets.Length;i++) { var c=GameCatalog.Presets[i]; ui.Button(presets,c.name.Replace("나의 ",""),16,70+i*69,210,56,()=>{ draft=c.Clone(); RefreshModel(); BuildStudioUI(); },GameUI.Hex(c.color)); }
            ui.Label(ui.Root,"MAKE A LITTLE MAGIC",320,130,720,30,13,GameUI.Muted,true,TextAnchor.MiddleCenter); ui.Label(ui.Root,"세상에 하나뿐인 나의 친구",320,170,720,57,34,null,true,TextAnchor.MiddleCenter);
            var edit=ui.Panel(ui.Root,-372,119,342,665,GameUI.Cream,new Vector2(1,1),true); ui.Label(edit,"친구의 이름",22,19,290,22,13,GameUI.Muted,true); var name=ui.Input(edit,draft.name,20,49,302,48); name.onEndEdit.AddListener(v=>{draft.name=v;draft=GameRules.Normalize(draft);});
            ui.Label(edit,"컬러 팔레트",22,117,290,22,13,GameUI.Muted,true); for(int i=0;i<GameCatalog.Palettes.Length;i++) { var pal=GameCatalog.Palettes[i]; var b=ui.Button(edit,"",22+(i%4)*74,149+(i/4)*49,62,38,()=>{ draft.color=pal.color;draft.accent=pal.accent;draft.belly=pal.belly;RefreshModel(); },GameUI.Hex(pal.color)); }
            Cycle(edit,"체형",draft.body,new[]{"동글동글","날씬하게","통통하게"},GameCatalog.Bodies,258,v=>draft.body=v);
            Cycle(edit,"귀 모양",draft.ears,new[]{"긴 귀","뾰족 귀","둥근 귀","없음"},GameCatalog.Ears,310,v=>draft.ears=v);
            Cycle(edit,"꼬리",draft.tail,new[]{"번개","불꽃","나뭇잎","소용돌이","없음"},GameCatalog.Tails,362,v=>draft.tail=v);
            Cycle(edit,"표정",draft.eyes,new[]{"동그란 눈","웃는 눈","졸린 눈"},GameCatalog.Eyes,414,v=>draft.eyes=v);
            Cycle(edit,"꾸미기",draft.accessory,new[]{"없음","꽃","스카프","새싹"},GameCatalog.Accessories,466,v=>draft.accessory=v);
            Cycle(edit,"속성",draft.type,GameCatalog.TypeNames,GameCatalog.Types,518,v=>draft.type=v);
            ui.Label(edit,"크기",22,580,280,20,13,GameUI.Muted,true); ui.Slider(edit,draft.size,.75f,1.3f,22,610,295,v=>{draft.size=v; if(hero!=null) hero.transform.localScale=Vector3.one*v;});
            var footer=ui.Panel(ui.Root,-330,-100,660,70,GameUI.Cream,new Vector2(.5f,0),true); ui.Button(footer,"섬으로 돌아가기",10,10,180,50,()=>{Persist();cam.fieldOfView=42;OpenWorld();}); ui.Button(footer,"랜덤 친구",200,10,150,50,Randomize); ui.Button(footer,"저장하고 함께 떠나기",360,10,290,50,SaveDraft,GameUI.Green,Color.white);
            ui.Button(ui.Root,"JSON 가져오기",30,654,242,46,ShowImport,GameUI.Cream,GameUI.Muted,15); ui.Button(ui.Root,"JSON 내보내기",30,713,242,46,Export,GameUI.Cream,GameUI.Muted,15);
            ui.Label(ui.Root,"우클릭으로 돌려보기",320,-155,720,30,15,GameUI.Muted,false,TextAnchor.MiddleCenter);
            var hint=ui.Root.GetChild(ui.Root.childCount-1).GetComponent<RectTransform>(); hint.anchorMin=hint.anchorMax=new Vector2(.5f,0); hint.anchoredPosition=new Vector2(-360,145); RefreshHud();
        }
        void Cycle(Transform p,string label,string value,string[] labels,string[] values,float y,Action<string> set)
        { int index=Array.IndexOf(values,value); string display=index>=0&&index<labels.Length?labels[index]:value; ui.Label(p,label,22,y+10,95,26,15,GameUI.Muted); ui.Button(p,display+"   ›",118,y,204,42,()=>{int n=(Array.IndexOf(values,value)+1)%values.Length;set(values[n]);RefreshModel();BuildStudioUI();},Color.white,null,15); }
        void Randomize() { draft=GameCatalog.Presets[UnityEngine.Random.Range(0,6)].Clone(); var p=GameCatalog.Palettes[UnityEngine.Random.Range(0,GameCatalog.Palettes.Length)]; draft.color=p.color;draft.accent=p.accent;draft.belly=p.belly;draft.name=new[]{"몽글이","모찌","토리","반짝이","포포"}[UnityEngine.Random.Range(0,5)]; RefreshModel();BuildStudioUI();Tone(740); }
        void SaveDraft() { int existing=save.collection.FindIndex(c=>c.id==draft.id); if(existing>=0) { save.collection[existing]=GameRules.Normalize(draft); save.draft=save.collection[existing].Clone(); save.partner=save.draft.Clone(); } else if(!GameRules.SaveCreature(save,draft)) {Notify("친구 보관함이 가득 찼어요. 도감에서 기존 친구를 편집해주세요.");return;} draft=save.draft.Clone();Persist();cam.fieldOfView=42;OpenWorld();Notify(draft.name+"와 새로운 모험을 시작해요!");Tone(780); }
        void ShowImport()
        {
            var p=ui.Modal(720,510,"웹에서 만든 친구 가져오기","IMPORT A FRIEND"); ui.Label(p,"기존 POKÉ LAB에서 내보낸 JSON 파일 내용을 붙여넣으세요.",32,117,655,50,16,GameUI.Muted); var field=ui.Input(p,"",32,176,656,215,20000,true); ui.Button(p,"친구 불러오기",32,419,656,54,()=>{try {string raw=field.text.Trim(); if(!raw.StartsWith("{")||!raw.EndsWith("}")||raw.IndexOf("\"color\"",StringComparison.Ordinal)<0) throw new FormatException(); var wrapped=JsonUtility.FromJson<ProjectFile>(raw); draft=GameRules.Normalize(wrapped.config??JsonUtility.FromJson<CreatureConfig>(raw)); ui.CloseModal(); RefreshModel();BuildStudioUI();Notify("친구를 불러왔어요. 저장하면 함께 탐험할 수 있어요.");}catch{Notify("올바른 POKÉ LAB 캐릭터 JSON인지 확인해주세요.");}},GameUI.Green,Color.white);
        }
        void Export()
        {
            #if UNITY_WEBGL && !UNITY_EDITOR
            PokeLabDownloadJson("friend.pokelab.json",JsonUtility.ToJson(new ProjectFile{config=GameRules.Normalize(draft)},true));Notify("캐릭터 JSON 다운로드를 시작했어요.");
            #else
            try { var folder=Path.Combine(Application.persistentDataPath,"Exports");Directory.CreateDirectory(folder);var file=Path.Combine(folder,"friend-"+DateTime.Now.ToString("yyyyMMdd-HHmmss")+".json");File.WriteAllText(file,JsonUtility.ToJson(new ProjectFile{config=GameRules.Normalize(draft)},true)); GUIUtility.systemCopyBuffer=File.ReadAllText(file);Notify("JSON을 내보내고 클립보드에 복사했어요.");Application.OpenURL(new Uri(folder).AbsoluteUri); }catch(Exception e){Debug.LogWarning(e);Notify("파일을 저장하지 못했어요.");}
            #endif
        }
        void ShowDungeons()
        {
            var p=ui.Modal(1060,550,"바람결 섬의 세 성소","DUNGEON EXPEDITIONS"); ui.Label(p,"세 개의 방, 두 번의 축복, 그리고 새로운 수호자 친구.",32,116,960,34,17,GameUI.Muted);
            for(int i=0;i<3;i++) { int index=i; var d=GameCatalog.Dungeons[i]; var card=ui.Panel(p,32+i*334,178,312,335,Color.white); ui.Panel(card,0,0,312,10,GameUI.Hex(d.color));ui.Label(card,"0"+(i+1)+"  /  "+d.difficulty,22,29,268,24,13,GameUI.Muted,true);ui.Label(card,d.name,22,75,268,42,26,null,true);ui.Label(card,d.subtitle,22,129,268,62,16,GameUI.Muted);ui.Label(card,"3개 방  ·  수호자 영입\nEXP +"+d.rewardXp+"  ·  볼 +"+d.rewardBalls,22,198,268,62,15,GameUI.Muted); ui.Button(card,save.clearedDungeons.Contains(d.id)?"다시 탐험하기  ✓":"탐험 시작  →",20,269,272,48,()=>StartDungeon(index),GameUI.Hex(d.color)); }
        }
        public void StartDungeon(int index)
        {
            if(mode==Mode.World) worldPosition=hero.transform.position; ClearScene(); mode=Mode.Dungeon; run=new DungeonRun(GameCatalog.Dungeons[index].id,save.partner); log="파수꾼의 다음 행동을 읽어보세요."; BuildDungeonRoom();
        }
        void BuildDungeonRoom()
        {
            if(scenery!=null)Destroy(scenery);if(hero!=null)Destroy(hero);if(enemy!=null)Destroy(enemy);
            int index=Array.FindIndex(GameCatalog.Dungeons,d=>d.id==run.dungeonId);scenery=WorldBuilder.BuildDungeon(index,run.room);hero=CreatureModel.Create(save.partner);hero.transform.position=new Vector3(-3,.09f,-3);hero.transform.rotation=Quaternion.Euler(0,45,0);enemy=CreatureModel.Create(run.Enemy.config);enemy.transform.position=new Vector3(3,.09f,3);enemy.transform.rotation=Quaternion.Euler(0,225,0);
            cam.fieldOfView=42;cam.transform.position=new Vector3(15,16,-21);cam.transform.LookAt(new Vector3(0,1,1));RenderSettings.fogColor=cam.backgroundColor=GameUI.Hex(index==0?"#2b4943":index==1?"#513c3a":"#36354f");RenderSettings.fogDensity=.012f;sun.intensity=.85f;sun.color=GameUI.Hex(run.Dungeon.accent);BuildBattleUI();
        }
        void BuildBattleUI()
        {
            ui.Clear();BuildHeader("E X P E D I T I O N  /  03");location.text=run.Dungeon.name;RefreshHud();
            var route=ui.Panel(ui.Root,30,119,290,160,GameUI.Cream,shadow:true);ui.Label(route,"성소의 기록",20,19,250,23,12,GameUI.Muted,true);ui.Label(route,run.RoomName,20,54,250,34,23,null,true);ui.Label(route,"● ─── "+(run.room>=1?"●":"○")+" ─── "+(run.room>=2?"●":"○")+"     "+(run.room+1)+" / 3",20,108,250,30,18,GameUI.Green,true);
            ui.Button(ui.Root,"캠프로 돌아가기",30,297,290,46,ShowLeaveDungeon,GameUI.Cream,GameUI.Muted,15);
            var foe=ui.Panel(ui.Root,-372,119,342,194,GameUI.Cream,new Vector2(1,1),true);ui.Label(foe,run.Enemy.name,20,20,300,34,23,null,true);ui.Label(foe,GameCatalog.TypeLabel(run.Enemy.config.type)+"  ·  HP "+run.enemyHp+" / "+run.Enemy.maxHp,20,62,300,25,14,GameUI.Muted);ui.Bar(foe,20,99,302,10,GameUI.Hex(run.Dungeon.color),(float)run.enemyHp/run.Enemy.maxHp);ui.Label(foe,run.Intent==null?"봉인이 풀렸어요":("다음 행동  ·  "+run.Intent.name+"  "+run.Intent.damage),20,133,300,33,16,GameUI.Green,true);
            var player=ui.Panel(ui.Root,30,-197,290,167,GameUI.Cream,new Vector2(0,0),true);ui.Label(player,save.partner.name,20,17,250,32,21,null,true);ui.Label(player,"HP "+run.hp+" / "+run.maxHp+"     에너지 "+run.energy+" / 3",20,61,250,24,14,GameUI.Muted);ui.Bar(player,20,98,250,10,GameUI.Green,(float)run.hp/run.maxHp);ui.Label(player,"축복 "+run.Boons.Count+"  ·  회복약 "+run.potions,20,126,250,23,14,GameUI.Muted);
            var actions=ui.Panel(ui.Root,-423,-187,846,157,GameUI.Cream,new Vector2(.5f,0),true);battleLog=ui.Label(actions,log,20,15,806,54,16,GameUI.Muted,false,TextAnchor.MiddleCenter);
            string[] titles={"기본 공격  [1]","속성 기술  [2]","방어  [3]","회복  [4]"}, ids={"attack","skill","guard","heal"};for(int i=0;i<4;i++){string action=ids[i];var b=ui.Button(actions,titles[i],12+i*208,86,198,57,()=>Battle(action),i==1?GameUI.Green:GameUI.Hex("#e8eddf"),i==1?Color.white:GameUI.Ink,16);b.interactable=!busy&&run.phase=="battle"&&(i!=1||run.energy>=2)&&(i!=3||(run.potions>0&&run.hp<run.maxHp));}
            if(run.phase=="boon") ShowBoons(); else if(run.phase=="ready") ui.Button(ui.Root,"다음 방으로  →",-150,350,300,58,()=>{log=run.Advance();BuildDungeonRoom();},GameUI.Mint).GetComponent<RectTransform>().anchorMin= new Vector2(.5f,1);
        }
        void Battle(string action) { if(busy||run==null||run.phase!="battle")return; if(action=="skill"&&run.energy<2)return; if(action=="heal"&&(run.potions==0||run.hp==run.maxHp))return; StartCoroutine(BattleAnimation(action)); }
        IEnumerator BattleAnimation(string action)
        {
            busy=true; var actor=hero;var foe=enemy;Vector3 start=actor.transform.position;var target=foe.transform.position;bool hit=action=="attack"||action=="skill";
            Tone(action=="skill"?780:action=="heal"?580:440); for(float t=0;t<.3f;t+=Time.deltaTime){if(actor==null){busy=false;yield break;}if(hit)actor.transform.position=start+(target-start).normalized*Mathf.Sin(t/.3f*Mathf.PI)*1.3f;yield return null;}
            if(actor==null||foe==null){busy=false;yield break;}actor.transform.position=start;Spark(hit?target+Vector3.up:start+Vector3.up,GameUI.Hex(hit?save.partner.color:"#a8dda8"));log=run.Act(action);busy=false;BuildBattleUI();
            if(run.phase=="cleared") {bool reward=GameRules.ClaimDungeonReward(save,run);Persist();ShowResult(true,reward);}else if(run.phase=="defeated")ShowResult(false,false);
        }
        void ShowBoons()
        {
            var p=ui.Modal(850,440,"다음 여정을 위한 선물","CHOOSE A BLESSING",true);ui.Label(p,"한 번 선택한 축복은 이번 탐험 내내 함께해요.",32,117,790,30,17,GameUI.Muted);
            for(int i=0;i<GameCatalog.Boons.Length;i++){var boon=GameCatalog.Boons[i];var card=ui.Panel(p,32+i*267,176,252,224,Color.white);ui.Label(card,boon.name,20,25,215,35,23,null,true);ui.Label(card,boon.description,20,82,210,72,16,GameUI.Muted);var b=ui.Button(card,run.HasBoon(boon.id)?"이미 받은 축복":"축복 받기 →",18,164,216,43,()=>{log=run.ChooseBoon(boon.id);log=run.Advance();ui.CloseModal();BuildDungeonRoom();},GameUI.Mint);b.interactable=!run.HasBoon(boon.id);}
        }
        void ShowResult(bool won,bool rewarded)
        {
            var p=ui.Modal(600,450,won?"새로운 우정이 피어났어요":"다음 모험을 위한 쉼표",won?"EXPEDITION COMPLETE":"REST & TRY AGAIN",true);ui.Label(p,won?(rewarded?run.Dungeon.guardian.name+"가 도감에 함께해요!\nEXP +"+run.Dungeon.rewardXp+"   ·   볼 +"+run.Dungeon.rewardBalls:"다시 한번 성소의 시험을 통과했어요.\n첫 탐험 보상은 이미 받았어요."):"이번 탐험은 여기까지.\n모은 친구와 기록은 안전하게 남아 있어요.",32,131,536,113,21,GameUI.Muted,false,TextAnchor.MiddleCenter);ui.Label(p,run.TotalTurns+"번의 선택  ·  "+run.Boons.Count+"개의 축복",32,266,536,32,16,GameUI.Muted,false,TextAnchor.MiddleCenter);ui.Button(p,"섬으로 돌아가기",32,343,536,62,()=>{worldPosition=Vector3.zero;OpenWorld();},GameUI.Green,Color.white);
        }
        void ShowLeaveDungeon() { if(busy || ui.ModalLocked)return; var p=ui.Modal(560,330,"캠프로 돌아갈까요?","TAKE A BREATHER");ui.Label(p,"현재 성소의 방과 축복은 초기화돼요.\n수집한 친구와 완료 기록은 유지돼요.",32,124,496,80,18,GameUI.Muted);ui.Button(p,"탐험 계속",32,240,234,55,ui.CloseModal,GameUI.Mint);ui.Button(p,"캠프로 돌아가기",280,240,248,55,()=>{worldPosition=Vector3.zero;OpenWorld();},GameUI.Green,Color.white); }
        void Notify(string text) { if(ui==null)return;if(toast!=null)Destroy(toast.transform.parent.gameObject);var p=ui.Panel(ui.Root,-340,105,680,59,GameUI.Green,new Vector2(.5f,1),true);toast=ui.Label(p,text,16,0,648,59,17,Color.white,true,TextAnchor.MiddleCenter);toastUntil=Time.unscaledTime+4.3f; }
        static Material Mat(string c) { var m=new Material(Shader.Find("PokeLab/SoftLit"));m.color=GameUI.Hex(c);m.SetFloat("_Glossiness",.15f);m.enableInstancing=true;return m; }
        void Tone(float frequency) { int count=11025;var data=new float[count];for(int i=0;i<count;i++){float t=i/44100f;data[i]=Mathf.Sin(t*frequency*Mathf.PI*2)*Mathf.Exp(-t*17)*.45f;}var clip=AudioClip.Create("soft bell",count,1,44100,false);clip.SetData(data,0);audioSource.PlayOneShot(clip);Destroy(clip,1); }
        void Spark(Vector3 position,Color color) { for(int i=0;i<14;i++){var o=GameObject.CreatePrimitive(PrimitiveType.Sphere);Destroy(o.GetComponent<Collider>());o.transform.position=position;o.transform.localScale=Vector3.one*.12f;var renderer=o.GetComponent<Renderer>();renderer.material=Mat(ColorUtility.ToHtmlStringRGB(color).Insert(0,"#"));o.AddComponent<AdventureSpark>().velocity=UnityEngine.Random.onUnitSphere*3;Destroy(o,1.2f);} }
        IEnumerator Smoke()
        {
            string path=Path.GetFullPath(Path.Combine(Application.dataPath,"../Evidence"));Directory.CreateDirectory(path);
            yield return new WaitForSeconds(4);ScreenCapture.CaptureScreenshot(Path.Combine(path,"01-world.png"));yield return new WaitForSeconds(.5f);
            OpenStudio();draft=GameCatalog.Presets[1].Clone();draft.name="민트 모찌";RefreshModel();BuildStudioUI();yield return new WaitForSeconds(1);ScreenCapture.CaptureScreenshot(Path.Combine(path,"02-creator.png"));yield return new WaitForSeconds(.5f);
            SaveDraft();if(save.collection.Count!=1 || save.partner.name!="민트 모찌")throw new Exception("Smoke: creation was not saved/equipped");yield return null;
            BeginCapture(wilds[0]);yield return new WaitForSeconds(.4f);ScreenCapture.CaptureScreenshot(Path.Combine(path,"03-capture.png"));yield return new WaitForSeconds(.3f);ThrowBall(true);if(save.caught.Count!=1)throw new Exception("Smoke: capture failed");
            ShowCollection();yield return new WaitForSeconds(.4f);ScreenCapture.CaptureScreenshot(Path.Combine(path,"04-collection.png"));yield return new WaitForSeconds(.3f);ui.CloseModal();
            ShowMap();yield return new WaitForSeconds(.4f);ScreenCapture.CaptureScreenshot(Path.Combine(path,"05-map.png"));yield return new WaitForSeconds(.3f);ui.CloseModal();
            ShowDungeons();yield return new WaitForSeconds(.4f);ScreenCapture.CaptureScreenshot(Path.Combine(path,"06-dungeons.png"));yield return new WaitForSeconds(.3f);StartDungeon(0);yield return new WaitForSeconds(1);ScreenCapture.CaptureScreenshot(Path.Combine(path,"07-battle.png"));yield return new WaitForSeconds(.3f);
            int turns=0;
            while(run.phase!="cleared" && run.phase!="defeated" && turns++<40)
            {
                if(run.phase=="boon") { if(!ui.ModalLocked)throw new Exception("Smoke: boon dialog must not be dismissible");if(run.room==0){ScreenCapture.CaptureScreenshot(Path.Combine(path,"08-blessing.png"));yield return new WaitForSeconds(.3f);}string id=run.HasBoon("power")?"vitality":"power";run.ChooseBoon(id);run.Advance();BuildDungeonRoom();yield return null; }
                else if(run.phase=="battle") { Battle(run.hp<40&&run.potions>0?"heal":run.energy>=2?"skill":"attack");yield return new WaitForSeconds(.45f); }
            }
            if(run.phase!="cleared"||!save.clearedDungeons.Contains("moss")||save.caught.Count!=2)throw new Exception("Smoke: dungeon/rewards did not finish");yield return new WaitForSeconds(.6f);ScreenCapture.CaptureScreenshot(Path.Combine(path,"09-cleared.png"));yield return new WaitForSeconds(.4f);
            Persist();var restored=Load();if(restored.collection.Count!=1||restored.caught.Count!=2||!restored.clearedDungeons.Contains("moss"))throw new Exception("Smoke: persistence round trip failed");
            StartDungeon(1);yield return new WaitForSeconds(.6f);ScreenCapture.CaptureScreenshot(Path.Combine(path,"10-ember.png"));yield return new WaitForSeconds(.3f);StartDungeon(2);yield return new WaitForSeconds(.6f);ScreenCapture.CaptureScreenshot(Path.Combine(path,"11-moon.png"));yield return new WaitForSeconds(.3f);
            File.WriteAllText(Path.Combine(path,"runtime-smoke.txt"),"PASS: creator save/equip, overworld generation, capture, collection, map, dungeon selection, battle animation, mandatory boon UI, full 3-room clear, guardian/rewards, save reload, ember/moon rendering.\nUnity "+Application.unityVersion+"\n");Debug.Log("POKELAB_SMOKE_OK");OpenWorld();
            if(Array.IndexOf(Environment.GetCommandLineArgs(),"-pokeSmokeQuit")>=0) {
                #if UNITY_EDITOR
                UnityEditor.EditorApplication.Exit(0);
                #else
                Application.Quit(0);
                #endif
            }
        }
    }
    public sealed class AdventureSpark : MonoBehaviour
    {
        public Vector3 velocity; void Update(){transform.position+=velocity*Time.deltaTime;velocity+=Vector3.down*Time.deltaTime*4;transform.localScale*=Mathf.Exp(-Time.deltaTime*1.4f);}void OnDestroy(){var r=GetComponent<Renderer>();if(r!=null)Destroy(r.sharedMaterial);}
    }
}
