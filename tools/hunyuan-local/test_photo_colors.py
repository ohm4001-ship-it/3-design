import io
import json
import struct
import unittest

import numpy as np
import trimesh
from PIL import Image

from photo_colors import depth_buffer, export_color_glb, project_colors, srgb_to_linear


class PhotoColorTests(unittest.TestCase):
    def test_triangle_visibility_uses_front_surface_not_just_vertices(self):
        points = np.array([[2, 2], [30, 2], [16, 30]] * 2)
        depth = depth_buffer(points, np.array([0, 0, 0, 2, 2, 2]), np.array([[0, 1, 2], [3, 4, 5]]), 32)
        self.assertEqual(depth[12, 16], 2)
        self.assertTrue(np.isneginf(depth[31, 31]))

    def test_subject_side_mapping_and_geometry_preservation(self):
        mesh = trimesh.creation.icosphere(subdivisions=3)
        vertices, faces = mesh.vertices.copy(), mesh.faces.copy()
        images = {name: Image.new("RGBA", (96, 128), color) for name, color in {
            "front": (255, 0, 0, 255), "back": (0, 0, 255, 255),
            "left": (0, 255, 0, 255), "right": (255, 255, 0, 255),
        }.items()}
        colors, stats = project_colors(mesh, images)
        for direction, expected in [((0, 0, 1), (1, 0, 0)), ((0, 0, -1), (0, 0, 1)),
                                    ((1, 0, 0), (0, 1, 0)), ((-1, 0, 0), (1, 1, 0))]:
            vertex = np.argmax(vertices @ np.array(direction))
            np.testing.assert_allclose(colors[vertex], expected, atol=0.02)
        np.testing.assert_array_equal(mesh.vertices, vertices)
        np.testing.assert_array_equal(mesh.faces, faces)
        self.assertGreater(stats["coverage"], 0.8)
        self.assertTrue(np.isfinite(colors).all())

    def test_transparent_background_does_not_paint_the_object(self):
        mesh = trimesh.creation.icosphere(subdivisions=2)
        image = Image.new("RGBA", (128, 128), (255, 0, 255, 0))
        image.paste((128, 64, 32, 255), (30, 20, 100, 110))
        colors, stats = project_colors(mesh, {"front": image})
        expected = srgb_to_linear(np.array([128, 64, 32]) / 255)
        np.testing.assert_allclose(colors, np.tile(expected, (len(colors), 1)), atol=0.005)
        self.assertLess(stats["coverage"], 0.7)  # Back is filled, not claimed observed.

    def test_empty_photo_is_an_error(self):
        with self.assertRaisesRegex(ValueError, "색을 옮길"):
            project_colors(trimesh.creation.box(), {"front": Image.new("RGBA", (16, 16))})

    def test_foreground_color_does_not_bleed_onto_surface_behind_it(self):
        axis = np.linspace(-1, 1, 101)
        x, y = np.meshgrid(axis, axis)
        vertices = np.column_stack((x.ravel(), y.ravel(), np.zeros(x.size)))
        cells = np.arange(len(vertices)).reshape(101, 101)
        a, b, c, d = cells[:-1, :-1].ravel(), cells[:-1, 1:].ravel(), cells[1:, :-1].ravel(), cells[1:, 1:].ravel()
        faces = np.vstack((np.column_stack((a, b, c)), np.column_stack((b, d, c))))
        plane = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
        foreground = trimesh.creation.box(extents=(0.2, 1, 0.1))
        foreground.apply_translation((0, 0, 0.5))
        mesh = trimesh.util.concatenate((plane, foreground))
        image = Image.new("RGBA", (1024, 1024), (255, 0, 0, 255))
        # Photograph's foreground bar is slightly wider than generated geometry.
        image.paste((0, 0, 0, 255), (448, 256, 576, 768))
        colors, _ = project_colors(mesh, {"front": image})
        at_edge = np.argmin(np.linalg.norm(vertices - (0.12, 0, 0), axis=1))
        np.testing.assert_allclose(colors[at_edge], (1, 0, 0), atol=0.01)

    def test_glb_contains_linear_colors_and_original_geometry(self):
        mesh = trimesh.creation.icosphere(subdivisions=1)
        linear = np.tile(srgb_to_linear(np.array([0.5, 0.25, 0.75])), (len(mesh.vertices), 1)).astype(np.float32)
        output = export_color_glb(mesh, linear)
        self.assertEqual(struct.unpack_from("<I", output, 8)[0], len(output))
        length = struct.unpack_from("<I", output, 12)[0]
        tree = json.loads(output[20:20 + length])
        primitive = tree["meshes"][0]["primitives"][0]
        accessor = tree["accessors"][primitive["attributes"]["COLOR_0"]]
        view = tree["bufferViews"][accessor["bufferView"]]
        stored = np.frombuffer(output, dtype="<f4", offset=28 + length + view["byteOffset"], count=linear.size).reshape(-1, 3)
        np.testing.assert_allclose(stored, linear)
        restored = trimesh.load(io.BytesIO(output), file_type="glb", force="mesh", process=False)
        np.testing.assert_allclose(restored.vertices, mesh.vertices, atol=1e-7)
        np.testing.assert_array_equal(restored.faces, mesh.faces)


if __name__ == "__main__":
    unittest.main()
