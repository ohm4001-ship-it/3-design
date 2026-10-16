using System;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

namespace PokeLab
{
    public sealed class GameUI : MonoBehaviour
    {
        public static readonly Color Ink = Hex("#26443f"), Muted = Hex("#64796c"), Cream = Hex("#faf8ee"), Mint = Hex("#d6edcf"), Green = Hex("#355e4b"), Gold = Hex("#e7b965");
        public RectTransform Root { get; private set; }
        public RectTransform Overlay { get; private set; }
        public bool ModalLocked { get; private set; }
        public Font Font { get; private set; }
        Sprite rounded;
        CanvasScaler scaler;
        int layoutWidth = -1, layoutHeight = -1;
        bool refreshFontAtlas;
        public static Color Hex(string s) { return ColorUtility.TryParseHtmlString(s, out var c) ? c : Color.white; }
        public void Initialize()
        {
            Font = Resources.Load<Font>("Fonts/NotoSansKR");
            if (Font == null) Font = UnityEngine.Font.CreateDynamicFontFromOSFont(new[] { "Malgun Gothic", "Arial", "Apple SD Gothic Neo" }, 18);
            var texture = new Texture2D(64,64,TextureFormat.RGBA32,false) { filterMode = FilterMode.Bilinear, name = "Rounded panel" };
            for(int y=0;y<64;y++) for(int x=0;x<64;x++) { float dx=Mathf.Max(14-x, x-49), dy=Mathf.Max(14-y,y-49); float d=Mathf.Sqrt(Mathf.Max(0,dx)*Mathf.Max(0,dx)+Mathf.Max(0,dy)*Mathf.Max(0,dy)); texture.SetPixel(x,y,new Color(1,1,1,Mathf.Clamp01(14-d))); }
            texture.Apply(); rounded=Sprite.Create(texture,new Rect(0,0,64,64),new Vector2(.5f,.5f),100,0,SpriteMeshType.FullRect,new Vector4(16,16,16,16));
            var canvas=gameObject.AddComponent<Canvas>(); canvas.renderMode=RenderMode.ScreenSpaceOverlay;
            scaler=gameObject.AddComponent<CanvasScaler>(); scaler.uiScaleMode=CanvasScaler.ScaleMode.ScaleWithScreenSize; scaler.referenceResolution=new Vector2(1600,900); UpdateScale();
            gameObject.AddComponent<GraphicRaycaster>(); Root=GetComponent<RectTransform>();
            if(EventSystem.current==null) { var es=new GameObject("Input events"); es.AddComponent<EventSystem>(); es.AddComponent<StandaloneInputModule>(); }
        }
        void Update() { UpdateScale(); }
        void LateUpdate()
        {
            if (!refreshFontAtlas || Root == null) return;
            refreshFontAtlas = false;
            Text[] labels = Root.GetComponentsInChildren<Text>(false);
            var groups = new Dictionary<Font, Dictionary<int, StringBuilder>>();
            foreach (Text label in labels)
            {
                if (!label.isActiveAndEnabled || label.font == null || !label.font.dynamic || string.IsNullOrEmpty(label.text)) continue;
                int pixels = Mathf.Max(1, Mathf.RoundToInt(label.fontSize * label.pixelsPerUnit));
                int key = pixels * 4 + (int)label.fontStyle;
                if (!groups.TryGetValue(label.font, out var sizes)) groups[label.font] = sizes = new Dictionary<int, StringBuilder>();
                if (!sizes.TryGetValue(key, out var characters)) sizes[key] = characters = new StringBuilder();
                characters.Append(label.text);
            }
            // Request all visible glyphs before the Canvas generates any new text geometry.
            foreach (var font in groups) foreach (var group in font.Value)
                font.Key.RequestCharactersInTexture(group.Value.ToString(), group.Key / 4, (FontStyle)(group.Key % 4));
            foreach (Text label in labels)
            {
                if (!label.isActiveAndEnabled) continue;
                label.cachedTextGenerator.Invalidate();
                label.SetVerticesDirty();
                label.SetMaterialDirty();
            }
        }
        void UpdateScale()
        {
            if(scaler==null || (Screen.width==layoutWidth && Screen.height==layoutHeight)) return;
            layoutWidth=Screen.width; layoutHeight=Screen.height;
            refreshFontAtlas=true;
            // Preserve the complete 1600 x 900 layout on both narrow and ultrawide windows.
            scaler.matchWidthOrHeight=Screen.width/Mathf.Max(1f,Screen.height)<1600f/900f?0:1;
        }
        public void Clear() { foreach(Transform child in Root) { child.gameObject.SetActive(false); Destroy(child.gameObject); } Overlay=null; ModalLocked=false; refreshFontAtlas=true; }
        public RectTransform Rect(string name, Transform parent, float x,float y,float w,float h, Vector2? anchor=null)
        {
            var go=new GameObject(name,typeof(RectTransform)); var r=go.GetComponent<RectTransform>(); r.SetParent(parent,false);
            r.anchorMin=r.anchorMax=anchor ?? new Vector2(0,1); r.pivot=new Vector2(0,1); r.anchoredPosition=new Vector2(x,-y); r.sizeDelta=new Vector2(w,h); return r;
        }
        public RectTransform Panel(Transform parent,float x,float y,float w,float h,Color color, Vector2? anchor=null, bool shadow=false)
        {
            var r=Rect("Panel",parent,x,y,w,h,anchor); var image=r.gameObject.AddComponent<Image>(); image.sprite=rounded; image.type=Image.Type.Sliced; image.color=color;
            if(shadow) { var s=r.gameObject.AddComponent<Shadow>(); s.effectColor=new Color(.09f,.2f,.17f,.10f); s.effectDistance=new Vector2(0,-4); }
            return r;
        }
        public Text Label(Transform parent,string text,float x,float y,float w,float h,int size=18,Color? color=null,bool bold=false,TextAnchor align=TextAnchor.UpperLeft)
        {
            var r=Rect("Text",parent,x,y,w,h); var t=r.gameObject.AddComponent<StableText>(); t.font=Font; t.text=text; t.supportRichText=false; t.fontSize=size; t.color=color??Ink; t.fontStyle=bold?FontStyle.Bold:FontStyle.Normal; t.alignment=align; t.raycastTarget=false; t.horizontalOverflow=HorizontalWrapMode.Wrap; t.verticalOverflow=VerticalWrapMode.Overflow; t.lineSpacing=.9f; refreshFontAtlas=true; return t;
        }
        public Button Button(Transform parent,string text,float x,float y,float w,float h,Action click,Color? background=null,Color? foreground=null,int size=17)
        {
            var r=Panel(parent,x,y,w,h,background??Cream); var b=r.gameObject.AddComponent<Button>(); b.targetGraphic=r.GetComponent<Image>(); var c=b.colors; c.normalColor=Color.white; c.highlightedColor=new Color(.91f,.96f,.9f); c.pressedColor=new Color(.8f,.88f,.78f); c.selectedColor=Color.white; c.disabledColor=new Color(.7f,.7f,.7f,.5f); c.fadeDuration=.12f; b.colors=c;
            Label(r,text,8,0,w-16,h,size,foreground??Ink,true,TextAnchor.MiddleCenter); b.onClick.AddListener(()=>{ EventSystem.current?.SetSelectedGameObject(null); click?.Invoke(); }); return b;
        }
        public Image Bar(Transform parent,float x,float y,float w,float h,Color color,float value=1)
        {
            var back=Panel(parent,x,y,w,h,new Color(Ink.r,Ink.g,Ink.b,.12f)); var fill=Panel(back,0,0,w*Mathf.Clamp01(value),h,color); return fill.GetComponent<Image>();
        }
        public InputField Input(Transform parent,string value,float x,float y,float w,float h,int max=16,bool multi=false)
        {
            var p=Panel(parent,x,y,w,h,Color.white); var field=p.gameObject.AddComponent<InputField>(); var txt=Label(p,value,14,8,w-28,h-16,18); txt.supportRichText=false; field.textComponent=txt; field.characterLimit=max; field.lineType=multi?InputField.LineType.MultiLineNewline:InputField.LineType.SingleLine; field.text=value; return field;
        }
        public Slider Slider(Transform parent,float value,float min,float max,float x,float y,float w,Action<float> onChange)
        {
            var p=Rect("Slider",parent,x,y,w,28); var bg=Panel(p,0,10,w,8,Hex("#e1e5da")); var slider=p.gameObject.AddComponent<Slider>();
            var handleArea=Rect("Handle area",p,0,3,w,22); var handle=Panel(handleArea,0,0,22,0,Green); handle.pivot=new Vector2(.5f,.5f); handle.anchoredPosition=Vector2.zero; slider.handleRect=handle; slider.targetGraphic=handle.GetComponent<Image>(); slider.direction=UnityEngine.UI.Slider.Direction.LeftToRight; slider.minValue=min; slider.maxValue=max; slider.value=value; slider.onValueChanged.AddListener(v=>onChange(v)); return slider;
        }
        public RectTransform Modal(float width,float height,string title,string eyebrow,bool locked=false)
        {
            CloseModal(); ModalLocked=locked; Overlay=Rect("Modal overlay",Root,0,0,0,0); Overlay.anchorMin=Vector2.zero; Overlay.anchorMax=Vector2.one; Overlay.offsetMin=Overlay.offsetMax=Vector2.zero; var dim=Overlay.gameObject.AddComponent<Image>(); dim.color=new Color(.075f,.15f,.13f,.64f);
            var p=Panel(Overlay,-width/2,-height/2,width,height,Cream,new Vector2(.5f,.5f),true); Label(p,eyebrow,32,27,width-90,24,12,Muted,true); Label(p,title,32,57,width-90,48,30,Ink,true); if(!locked) Button(p,"×",width-62,23,36,36,CloseModal,Hex("#e9eddf")); return p;
        }
        public void CloseModal() { if(Overlay!=null) { Overlay.gameObject.SetActive(false); Destroy(Overlay.gameObject); } Overlay=null; ModalLocked=false; refreshFontAtlas=true; }
    }

    // uGUI 2.0 leaves this protected guard set when an empty label generates zero vertices.
    // Restore it even on that early return, so later font-atlas changes refresh existing glyph UVs.
    public sealed class StableText : Text
    {
        protected override void OnPopulateMesh(VertexHelper vertices)
        {
            try { base.OnPopulateMesh(vertices); }
            finally { m_DisableFontTextureRebuiltCallback = false; }
        }
    }
}
