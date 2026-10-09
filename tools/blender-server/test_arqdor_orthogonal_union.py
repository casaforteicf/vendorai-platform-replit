import unittest
from arqdor_orthogonal_union import union_orthogonal_walls
from arqdor_parametric_mesh import inspect_mesh_edges


def wall(a, b, thickness=.2, height=3, openings=None):
    return {"wall": {"start": [*a, 0], "end": [*b, 0],
                     "thickness": thickness, "height": height},
            "openings": openings or []}


class OrthogonalUnionTests(unittest.TestCase):
    def assert_closed(self, result):
        topology = inspect_mesh_edges(result)
        self.assertEqual(topology["boundaryEdges"], 0)
        self.assertEqual(topology["nonmanifoldEdges"], 0)
        self.assertEqual(topology["orientationErrors"], 0)

    def test_outward_faces_have_positive_signed_volume(self):
        mesh = union_orthogonal_walls([wall((0, 0), (4, 0))])
        volume = 0.0
        for face in mesh["faces"]:
            a, b, c = (mesh["vertices"][i] for i in face[:3])
            # Signed volume from a consistently outward-oriented polygon mesh.
            cross = (b[1]*c[2]-b[2]*c[1], b[2]*c[0]-b[0]*c[2],
                     b[0]*c[1]-b[1]*c[0])
            volume += sum(a[n]*cross[n] for n in range(3)) / 6
            if len(face) == 4:
                a, b, c = (mesh["vertices"][i] for i in (face[0], face[2], face[3]))
                cross = (b[1]*c[2]-b[2]*c[1], b[2]*c[0]-b[0]*c[2],
                         b[0]*c[1]-b[1]*c[0])
                volume += sum(a[n]*cross[n] for n in range(3)) / 6
        self.assertAlmostEqual(volume, mesh["volumePreviewM3"], places=6)

    def test_single_wall(self):
        mesh = union_orthogonal_walls([wall((0, 0), (4, 0))])
        self.assertEqual(len(mesh["faces"]), 6)
        self.assert_closed(mesh)

    def test_L_T_and_cross_junctions(self):
        horizontal = wall((0, 0), (4, 0))
        cases = [
            wall((4, 0), (4, 3)),
            wall((2, 0), (2, 3)),
            wall((2, -2), (2, 2)),
        ]
        for second in cases:
            with self.subTest(end=second["wall"]["end"]):
                result = union_orthogonal_walls([horizontal, second])
                self.assertGreater(len(result["faces"]), 6)
                self.assertTrue(result["internalFacesRemoved"])
                self.assert_closed(result)
                self.assertFalse(result["geometryApproved"])

    def test_through_window_and_door(self):
        openings = [{"kind": "door", "offset": .5, "width": 1,
                     "sill": 0, "height": 2.1},
                    {"kind": "window", "offset": 2, "width": 1,
                     "sill": 1, "height": 1}]
        result = union_orthogonal_walls([wall((0, 0), (4, 0), openings=openings)])
        self.assertEqual(result["openingCount"], 2)
        self.assert_closed(result)
        self.assertGreater(len(result["faces"]), 6)

    def test_union_volume_does_not_double_count_intersection(self):
        horizontal = wall((0, 0), (4, 0))
        vertical = wall((2, -2), (2, 2))
        result = union_orthogonal_walls([horizontal, vertical])
        # Each wall is 4 * .2 * 3; overlapping core is .2 * .2 * 3.
        self.assertAlmostEqual(result["volumePreviewM3"], 4.68, places=7)
        self.assertFalse(result["geometryApproved"])

    def test_openings_subtract_preview_volume(self):
        opening = [{"kind": "window", "offset": 1, "width": 1, "sill": 1, "height": 1}]
        result = union_orthogonal_walls([wall((0, 0), (4, 0), openings=opening)])
        self.assertAlmostEqual(result["volumePreviewM3"], 2.2, places=7)
        self.assert_closed(result)

    def test_nonfinite_tolerance_rejected(self):
        with self.assertRaises(ValueError):
            union_orthogonal_walls([wall((0, 0), (4, 0))], tolerance=float("nan"))

    def test_diagonal_is_explicitly_unsupported(self):
        with self.assertRaisesRegex(ValueError, "diagonais"):
            union_orthogonal_walls([wall((0, 0), (3, 2))])


if __name__ == "__main__":
    unittest.main()
