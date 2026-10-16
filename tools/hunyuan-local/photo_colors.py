"""Transfer photographed colour onto Hunyuan's mesh without changing geometry.

Uses Hunyuan's subject-side view names, alpha masks and an actual triangle
depth buffer. This is photo projection, not the separate Hunyuan-Paint model.
Unobserved vertices inherit the nearest observed colour; no missing logo or
texture is invented. GLB colour attributes are stored in linear colour space.
"""

import json
import struct

import numpy as np
from scipy.ndimage import map_coordinates, maximum_filter
from scipy.spatial import cKDTree


# Image-right vector, direction from the object towards the camera.
BASES = {
    "front": ((1, 0, 0), (0, 0, 1)),
    "back": ((-1, 0, 0), (0, 0, -1)),
    "left": ((0, 0, -1), (1, 0, 0)),
    "right": ((0, 0, 1), (-1, 0, 0)),
}


def depth_buffer(points, depths, faces, size=512):
    """Rasterize in bounded vectorized batches, including large triangles."""
    triangles = points[faces].astype(np.float32)
    z = depths[faces].astype(np.float32)
    lo = np.maximum(np.floor(triangles.min(axis=1)).astype(int), 0)
    hi = np.minimum(np.ceil(triangles.max(axis=1)).astype(int), size - 1)
    dimensions = np.maximum(hi - lo + 1, 1)
    buckets = np.ceil(np.log2(dimensions)).astype(int)
    keys = buckets[:, 0] * 16 + buckets[:, 1]
    result = np.full(size * size, -np.inf, dtype=np.float32)
    for key in np.unique(keys):
        ids = np.flatnonzero(keys == key)
        width = int(dimensions[ids, 0].max())
        height = int(dimensions[ids, 1].max())
        offsets_x, offsets_y = np.meshgrid(np.arange(width), np.arange(height))
        step = max(1, 262144 // (width * height))
        for start in range(0, len(ids), step):
            batch = ids[start:start + step]
            x = lo[batch, 0, None] + offsets_x.ravel()
            y = lo[batch, 1, None] + offsets_y.ravel()
            a, b, c = (triangles[batch, i] for i in range(3))
            denominator = (b[:, 1] - c[:, 1]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 1] - c[:, 1])
            safe = np.where(np.abs(denominator) > 1e-9, denominator, 1)
            u = ((b[:, 1] - c[:, 1])[:, None] * (x - c[:, 0, None]) + (c[:, 0] - b[:, 0])[:, None] * (y - c[:, 1, None])) / safe[:, None]
            v = ((c[:, 1] - a[:, 1])[:, None] * (x - c[:, 0, None]) + (a[:, 0] - c[:, 0])[:, None] * (y - c[:, 1, None])) / safe[:, None]
            w = 1 - u - v
            valid = ((u >= -1e-5) & (v >= -1e-5) & (w >= -1e-5)
                     & (x <= hi[batch, 0, None]) & (y <= hi[batch, 1, None])
                     & (np.abs(denominator)[:, None] > 1e-9))
            interpolated = u * z[batch, 0, None] + v * z[batch, 1, None] + w * z[batch, 2, None]
            np.maximum.at(result, (y * size + x)[valid], interpolated[valid])
    return result.reshape(size, size)


def srgb_to_linear(colors):
    return np.where(colors <= 0.04045, colors / 12.92, ((colors + 0.055) / 1.055) ** 2.4)


def project_colors(mesh, images):
    vertices = np.asarray(mesh.vertices)
    normals = np.asarray(mesh.vertex_normals)
    accumulated = np.zeros((len(vertices), 3), dtype=np.float64)
    total = np.zeros(len(vertices))
    size = 512
    used_views = []
    for name, image in images.items():
        if name not in BASES:
            continue
        rgba = np.asarray(image.convert("RGBA"), dtype=np.float32) / 255
        rows, columns = np.where(rgba[:, :, 3] > 0.5)
        if len(rows) == 0:
            continue
        right, camera = (np.asarray(v) for v in BASES[name])
        plane = np.column_stack((vertices @ right, -vertices[:, 1]))
        low, high = plane.min(axis=0), plane.max(axis=0)
        span = high - low
        if np.any(span < 1e-9):
            continue
        uv = (plane - low) / span
        coords = np.column_stack((columns.min() + uv[:, 0] * (columns.max() - columns.min()),
                                  rows.min() + uv[:, 1] * (rows.max() - rows.min())))
        depth = vertices @ camera
        buffer = depth_buffer(uv * (size - 1), depth, mesh.faces, size)
        # Generated silhouettes differ slightly from the photograph. Leave a
        # conservative margin around foreground parts (especially handles) so
        # their colour is not projected onto the surface immediately behind.
        buffer = maximum_filter(buffer, size=13)
        xy = np.clip(np.rint(uv * (size - 1)).astype(int), 0, size - 1)
        front_depth = buffer[xy[:, 1], xy[:, 0]]
        facing = np.maximum(normals @ camera, 0)
        # A sloping surface naturally changes depth across that margin. Allow
        # its tangent-plane depth change, but reject a separate foreground part.
        slope_margin = (6 / (size - 1) * (np.abs(normals @ right) * span[0]
                        + np.abs(normals[:, 1]) * span[1]) / np.maximum(facing, 0.15))
        alpha = map_coordinates(rgba[:, :, 3], [coords[:, 1], coords[:, 0]], order=1, mode="nearest")
        visible = ((facing > 0.15) & (alpha > 0.9) & np.isfinite(front_depth)
                   & (depth >= front_depth - slope_margin - max(float(np.ptp(depth)) * 0.01, 1e-5)))
        weight = np.where(visible, facing ** 8, 0)
        if not np.any(weight):
            continue
        color = np.column_stack([map_coordinates(rgba[:, :, c], [coords[:, 1], coords[:, 0]], order=1, mode="nearest") for c in range(3)])
        accumulated += srgb_to_linear(color) * weight[:, None]
        total += weight
        used_views.append(name)
    observed = total > 0
    if not np.any(observed):
        raise ValueError("사진에서 색을 옮길 표면을 찾지 못했습니다. 물체가 잘 보이는 정면 사진을 넣어주세요.")
    colors = accumulated / np.maximum(total[:, None], 1e-20)
    if not np.all(observed):
        _, nearest = cKDTree(vertices[observed]).query(vertices[~observed])
        colors[~observed] = colors[observed][nearest]
    return colors.astype(np.float32), {"coverage": float(observed.mean()), "views": used_views}


def export_color_glb(mesh, linear_colors):
    """Append float colour data, preserving the exported positions and indices."""
    original = mesh.export(file_type="glb")
    json_length = struct.unpack_from("<I", original, 12)[0]
    tree = json.loads(original[20:20 + json_length])
    bin_start = 20 + json_length
    bin_length = struct.unpack_from("<I", original, bin_start)[0]
    binary = original[bin_start + 8:bin_start + 8 + bin_length]
    color_bytes = np.asarray(linear_colors, dtype="<f4").tobytes()
    view = len(tree["bufferViews"])
    accessor = len(tree["accessors"])
    tree["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(color_bytes), "target": 34962})
    tree["accessors"].append({"bufferView": view, "componentType": 5126, "count": len(linear_colors), "type": "VEC3"})
    material = len(tree.setdefault("materials", []))
    tree["materials"].append({"name": "사진 색", "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 1}})
    for primitive in tree["meshes"][0]["primitives"]:
        primitive["attributes"]["COLOR_0"] = accessor
        primitive["material"] = material
    binary += color_bytes
    tree["buffers"][0]["byteLength"] = len(binary)
    encoded = json.dumps(tree, ensure_ascii=True, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    binary += b"\0" * (-len(binary) % 4)
    return (struct.pack("<III", 0x46546C67, 2, 28 + len(encoded) + len(binary))
            + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
            + struct.pack("<II", len(binary), 0x004E4942) + binary)
