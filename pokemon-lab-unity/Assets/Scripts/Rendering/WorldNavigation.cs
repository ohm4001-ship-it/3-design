using System.Collections.Generic;
using UnityEngine;

namespace PokeLab
{
    /// <summary>
    /// Lightweight island navigation for the manually moved explorer. Obstacle coordinates are
    /// local to the scenery root; Move and IsWalkable accept ordinary world-space positions.
    /// </summary>
    public sealed class WorldNavigation : MonoBehaviour
    {
        private struct Circle
        {
            public Vector2 centre;
            public float radius;
        }

        private struct BoxObstacle
        {
            public Vector2 centre, halfSize;
            public float cosine, sine;
        }

        private readonly List<Circle> circles = new List<Circle>();
        private readonly List<BoxObstacle> boxes = new List<BoxObstacle>();
        private const float ExplorerRadius = .38f;
        private const float CoastLimit = 45.8f;
        private const float StepLength = .14f;
        private const float Epsilon = .003f;
        private static readonly Vector2 LakeCentre = new Vector2(22, 12);
        private static readonly Vector2 LakeRadii = new Vector2(7.6f, 5.6f);
        private const float BridgeHalfWidth = .88f;

        public void AddCircle(Vector3 localCentre, float radius)
        {
            circles.Add(new Circle { centre = Flat(localCentre), radius = Mathf.Max(.05f, radius) });
        }

        public void AddBox(Vector3 localCentre, Vector2 halfSize, float yawDegrees)
        {
            float angle = -yawDegrees * Mathf.Deg2Rad;
            boxes.Add(new BoxObstacle { centre = Flat(localCentre), halfSize = halfSize,
                cosine = Mathf.Cos(angle), sine = Mathf.Sin(angle) });
        }

        /// <summary>Constrain walking to dry ground or the lake bridge, sliding along scenery.</summary>
        public Vector3 Move(Vector3 current, Vector3 proposed)
        {
            Vector2 position = Flat(transform.InverseTransformPoint(current));
            Vector2 destination = Flat(transform.InverseTransformPoint(proposed));
            if (!Finite(position) || !Finite(destination)) return current;
            Vector2 difference = destination - position;
            if (difference.sqrMagnitude < .0000001f)
                return Ground(transform.TransformPoint(new Vector3(position.x, 0, position.y)));

            // A large frame delta cannot jump across a trunk, a wall, or the lake.
            int steps = Mathf.Clamp(Mathf.CeilToInt(difference.magnitude / StepLength), 1, 2048);
            Vector2 step = difference / steps;
            for (int i = 0; i < steps; i++)
            {
                Vector2 candidate = ResolveSolids(position + step, position);
                candidate = Vector2.ClampMagnitude(candidate, CoastLimit);
                if (!DryGround(candidate))
                {
                    Vector2 alongX = ResolveSolids(new Vector2(candidate.x, position.y), position);
                    Vector2 alongZ = ResolveSolids(new Vector2(position.x, candidate.y), position);
                    bool xWorks = Valid(alongX), zWorks = Valid(alongZ);
                    if (xWorks && zWorks)
                        candidate = Vector2.Dot(alongX - position, step) >= Vector2.Dot(alongZ - position, step) ? alongX : alongZ;
                    else if (xWorks) candidate = alongX;
                    else if (zWorks) candidate = alongZ;
                    else candidate = position;
                }
                if (Valid(candidate)) position = candidate;
            }
            return Ground(transform.TransformPoint(new Vector3(position.x, 0, position.y)));
        }

        /// <summary>Place feet on the visible path, arched boardwalk, or sanctuary paving.</summary>
        public Vector3 Ground(Vector3 worldPosition)
        {
            Vector3 p = transform.InverseTransformPoint(worldPosition);
            float height = .065f;
            if (p.x >= 15 && p.x <= 29 && Mathf.Abs(p.z - LakeCentre.y) <= 1.25f)
                height = .35f + .12f * Mathf.Sin((p.x - 15) / 14 * Mathf.PI);
            else if (new Vector2(p.x, p.z - 32).sqrMagnitude < 4.6f * 4.6f)
                height = .2f;
            return transform.TransformPoint(new Vector3(p.x, height, p.z));
        }

        /// <summary>Find a nearby clear arrival point for saved positions, travel, or creatures.</summary>
        public Vector3 FindSafePosition(Vector3 desired)
        {
            if (IsWalkable(desired)) return Ground(desired);
            Vector3 local = transform.InverseTransformPoint(desired);
            if (Finite(Flat(local)))
            {
                for (float radius = .5f; radius <= 8; radius += .5f)
                {
                    for (int i = 0; i < 24; i++)
                    {
                        float angle = i * Mathf.PI * 2 / 24;
                        Vector3 candidate = transform.TransformPoint(new Vector3(
                            local.x + Mathf.Cos(angle) * radius, 0, local.z + Mathf.Sin(angle) * radius));
                        if (IsWalkable(candidate)) return Ground(candidate);
                    }
                }
            }
            return Ground(transform.TransformPoint(Vector3.zero));
        }

        /// <summary>Useful when choosing wild creature spawns or new travel destinations.</summary>
        public bool IsWalkable(Vector3 worldPosition)
        {
            Vector2 p = Flat(transform.InverseTransformPoint(worldPosition));
            return Finite(p) && Valid(p);
        }

        private bool Valid(Vector2 p)
        {
            if (p.sqrMagnitude > (CoastLimit + Epsilon) * (CoastLimit + Epsilon) || !DryGround(p)) return false;
            foreach (Circle circle in circles)
            {
                float radius = circle.radius + ExplorerRadius - Epsilon;
                if ((p - circle.centre).sqrMagnitude < radius * radius) return false;
            }
            foreach (BoxObstacle box in boxes)
            {
                Vector2 local = ToBox(p, box);
                Vector2 half = box.halfSize + Vector2.one * (ExplorerRadius - Epsilon);
                if (Mathf.Abs(local.x) < half.x && Mathf.Abs(local.y) < half.y) return false;
            }
            return true;
        }

        private Vector2 ResolveSolids(Vector2 candidate, Vector2 previous)
        {
            // A second pass handles adjacent trunks, pillars, and large stones gracefully.
            for (int pass = 0; pass < 3; pass++)
            {
                foreach (Circle circle in circles)
                {
                    Vector2 delta = candidate - circle.centre;
                    float radius = circle.radius + ExplorerRadius + Epsilon;
                    if (delta.sqrMagnitude >= radius * radius) continue;
                    if (delta.sqrMagnitude < .000001f) delta = previous - circle.centre;
                    if (delta.sqrMagnitude < .000001f) delta = Vector2.down;
                    candidate = circle.centre + delta.normalized * radius;
                }
                foreach (BoxObstacle box in boxes)
                {
                    Vector2 local = ToBox(candidate, box);
                    Vector2 half = box.halfSize + Vector2.one * (ExplorerRadius + Epsilon);
                    float xPenetration = half.x - Mathf.Abs(local.x), zPenetration = half.y - Mathf.Abs(local.y);
                    if (xPenetration <= 0 || zPenetration <= 0) continue;
                    Vector2 before = ToBox(previous, box);
                    if (xPenetration < zPenetration)
                        local.x = Mathf.Abs(local.x) < Epsilon ? (before.x < 0 ? -half.x : half.x) : Mathf.Sign(local.x) * half.x;
                    else
                        local.y = Mathf.Abs(local.y) < Epsilon ? (before.y < 0 ? -half.y : half.y) : Mathf.Sign(local.y) * half.y;
                    candidate = FromBox(local, box);
                }
            }
            return candidate;
        }

        private static bool DryGround(Vector2 p)
        {
            // The boardwalk runs east/west through the lake. Its centre line includes (21,12).
            if (Mathf.Abs(p.y - LakeCentre.y) <= BridgeHalfWidth) return true;
            Vector2 delta = p - LakeCentre;
            float x = delta.x / (LakeRadii.x + ExplorerRadius);
            float z = delta.y / (LakeRadii.y + ExplorerRadius);
            return x * x + z * z >= 1;
        }

        private static Vector2 ToBox(Vector2 p, BoxObstacle box)
        {
            Vector2 delta = p - box.centre;
            return new Vector2(box.cosine * delta.x + box.sine * delta.y,
                -box.sine * delta.x + box.cosine * delta.y);
        }

        private static Vector2 FromBox(Vector2 p, BoxObstacle box)
        {
            return box.centre + new Vector2(box.cosine * p.x - box.sine * p.y,
                box.sine * p.x + box.cosine * p.y);
        }

        private static Vector2 Flat(Vector3 p) { return new Vector2(p.x, p.z); }
        private static bool Finite(Vector2 p)
        {
            return !float.IsNaN(p.x) && !float.IsInfinity(p.x) && !float.IsNaN(p.y) && !float.IsInfinity(p.y);
        }
    }
}
