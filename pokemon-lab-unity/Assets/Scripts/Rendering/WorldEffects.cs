using System.Collections.Generic;
using UnityEngine;

namespace PokeLab
{
    /// <summary>Small environmental motions, with all generated resources owned by the scene root.</summary>
    public sealed class WorldEffects : MonoBehaviour
    {
        private sealed class Motion
        {
            public Transform target;
            public Vector3 origin;
            public Vector3 scale;
            public float amplitude, speed, phase, rotation, pulse;
        }

        private readonly List<Motion> motions = new List<Motion>();
        private readonly List<Object> resources = new List<Object>();
        private float elapsed;

        public void Own(Object resource)
        {
            if (resource != null) resources.Add(resource);
        }

        public void Animate(Transform target, float amplitude = 0, float speed = 1,
            float phase = 0, float rotation = 0, float pulse = 0)
        {
            if (target == null) return;
            motions.Add(new Motion { target = target, origin = target.localPosition,
                scale = target.localScale, amplitude = amplitude, speed = speed,
                phase = phase, rotation = rotation, pulse = pulse });
        }

        private void Update()
        {
            elapsed += Time.deltaTime;
            foreach (Motion motion in motions)
            {
                if (motion.target == null) continue;
                float wave = Mathf.Sin(elapsed * motion.speed + motion.phase);
                if (motion.amplitude != 0)
                    motion.target.localPosition = motion.origin + Vector3.up * (wave * motion.amplitude);
                if (motion.rotation != 0)
                    motion.target.Rotate(0, motion.rotation * Time.deltaTime, 0, Space.Self);
                if (motion.pulse != 0)
                    motion.target.localScale = motion.scale * (1 + wave * motion.pulse);
            }
        }

        private void OnDestroy()
        {
            foreach (Object resource in resources)
            {
                if (resource == null) continue;
                if (Application.isPlaying) Destroy(resource);
                else DestroyImmediate(resource);
            }
            resources.Clear();
        }
    }
}
