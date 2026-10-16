Shader "PokeLab/SoftLit"
{
    Properties
    {
        _Color ("Soft tint", Color) = (1,1,1,1)
        [HDR] _EmissionColor ("Gentle glow", Color) = (0,0,0,0)
        _Glossiness ("Surface softness", Range(0,1)) = 0.25
        [HideInInspector] _Metallic ("Metallic compatibility", Float) = 0
        [HideInInspector] _Mode ("Surface mode", Float) = 0
        [HideInInspector] _SrcBlend ("Source blend", Float) = 1
        [HideInInspector] _DstBlend ("Destination blend", Float) = 0
        [HideInInspector] _ZWrite ("Depth write", Float) = 1
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }
        LOD 180
        Blend [_SrcBlend] [_DstBlend]
        ZWrite [_ZWrite]
        Cull Back

        CGPROGRAM
        // Forward lighting keeps the diorama's sun, local lanterns, SH ambient and soft shadows.
        // No texture/metallic/normal-map variants are needed for these sculpted, matte materials.
        #pragma target 3.0
        #pragma surface surf Lambert fullforwardshadows addshadow keepalpha finalcolor:FadeAdditionalLights exclude_path:deferred exclude_path:prepass nolightmap nodynlightmap
        #pragma shader_feature_local _EMISSION
        #pragma multi_compile_instancing
        #include "UnityCG.cginc"

        struct Input { float3 worldPos; };
        half _ZWrite;
        UNITY_INSTANCING_BUFFER_START(PokeLabProps)
            UNITY_DEFINE_INSTANCED_PROP(fixed4, _Color)
            UNITY_DEFINE_INSTANCED_PROP(half4, _EmissionColor)
        UNITY_INSTANCING_BUFFER_END(PokeLabProps)

        void surf(Input IN, inout SurfaceOutput output)
        {
            fixed4 tint = UNITY_ACCESS_INSTANCED_PROP(PokeLabProps, _Color);
            output.Albedo = tint.rgb;
            output.Alpha = tint.a;
            #if defined(_EMISSION)
                output.Emission = UNITY_ACCESS_INSTANCED_PROP(PokeLabProps, _EmissionColor).rgb;
            #endif
            #if defined(UNITY_PASS_SHADOWCASTER)
                // Faint portal veils must not make solid rectangular shadows.
                if (_ZWrite < 0.5) clip(-1);
            #endif
        }

        void FadeAdditionalLights(Input IN, SurfaceOutput output, inout fixed4 color)
        {
            #if defined(UNITY_PASS_FORWARDADD)
                // Generated additive-light passes use One/One blending; fade their light too.
                color.rgb *= output.Alpha;
            #endif
        }
        ENDCG
    }
    Fallback Off
}
