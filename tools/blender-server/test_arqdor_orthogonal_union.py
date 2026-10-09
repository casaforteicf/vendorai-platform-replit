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

    def test_diagonal_is_explicitly_unsupported(self):
        with self.assertRaisesRegex(ValueError, "diagonais"):
            union_orthogonal_walls([wall((0, 0), (3, 2))])


if __name__ == "__main__":
    unittest.main()
