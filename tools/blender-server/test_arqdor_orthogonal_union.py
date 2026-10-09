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
        self.assertEqual(result["topology"], topology)
        self.assertEqual(result["meshClosedByEdgeIncidence"], topology["watertightByEdgeIncidence"])
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
        self.assertAlmostEqual(mesh["signedVolumeM3"], mesh["volumePreviewM3"], places=6)
        self.assertTrue(mesh["signedVolumeMatchesOccupancy"])

    def test_y_normals_point_outward(self):
        mesh = union_orthogonal_walls([wall((0, 0), (4, 0))])
        for face in mesh["faces"]:
            pts = [mesh["vertices"][idx] for idx in face]
            if len({p[1] for p in pts}) != 1:
                continue
            a, b, c = pts[:3]
            normal_y = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])
            if abs(pts[0][1] + .1) < 1e-8:
                self.assertLess(normal_y, 0)
            if abs(pts[0][1] - .1) < 1e-8:
                self.assertGreater(normal_y, 0)

    def test_integrity_status_matches_calculated_topology(self):
        result = union_orthogonal_walls([wall((0, 0), (4, 0))])
        if result["meshClosedByEdgeIncidence"]:
            self.assertEqual(result["integrityStatus"], "closed_by_edge_incidence_unreviewed")
        else:
            self.assertEqual(result["integrityStatus"], "requires_geometric_repair")
        self.assertFalse(result["geometryApproved"])

    def test_disconnected_walls_not_automatically_approved(self):
        first = wall((0, 0), (2, 0))
        second = wall((2.1, 0), (4.1, 0))
        result = union_orthogonal_walls([first, second])
        self.assertFalse(result["geometryApproved"])
        self.assertEqual(result["connectedSolidComponents"], 2)
        self.assertEqual(result["integrityStatus"], "requires_geometric_repair")

    def test_surface_connectivity_is_reported(self):
        single = union_orthogonal_walls([wall((0, 0), (4, 0))])
        self.assertEqual(single["connectedBoundaryComponents"], 1)
        separated = union_orthogonal_walls([
            wall((0, 0), (2, 0)), wall((3, 0), (5, 0))
        ])
        self.assertEqual(separated["connectedBoundaryComponents"], 2)
        self.assertEqual(separated["integrityStatus"], "requires_geometric_repair")

    def test_single_wall(self):
        mesh = union_orthogonal_walls([wall((0, 0), (4, 0))])
        self.assertEqual(len(mesh["faces"]), 6)
        self.assertEqual(mesh["connectedSolidComponents"], 1)
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
        self.assertTrue(result["signedVolumeMatchesOccupancy"])
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
