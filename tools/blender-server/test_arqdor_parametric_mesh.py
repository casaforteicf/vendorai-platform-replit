import unittest
from arqdor_parametric_mesh import mesh_parametric_wall, mesh_parametric_project, inspect_mesh_edges, merge_collinear_end_to_end_walls, classify_wall_solid_joins


class ParametricMeshTests(unittest.TestCase):
    def setUp(self):
        self.wall = {"start": [0, 0, 0], "end": [4, 0, 0],
                     "thickness": .2, "height": 3}

    def test_topology_checker_rejects_open_and_invalid_mesh(self):
        triangle = {"vertices": [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
                    "faces": [[0, 1, 2]]}
        report = inspect_mesh_edges(triangle)
        self.assertEqual(report["boundaryEdges"], 3)
        self.assertFalse(report["watertightByEdgeIncidence"])
        with self.assertRaises(ValueError):
            inspect_mesh_edges({"vertices": triangle["vertices"], "faces": [[0, 1, 5]]})

    def test_collinear_join_preserves_shifted_openings(self):
        a = {"wall": {"start": [0, 0, 0], "end": [3, 0, 0],
                      "thickness": .15, "height": 3},
             "openings": [{"kind": "door", "offset": .5, "width": 1, "sill": 0, "height": 2.1}]}
        b = {"wall": {"start": [3, 0, 0], "end": [6, 0, 0],
                      "thickness": .15, "height": 3},
             "openings": [{"kind": "window", "offset": 1, "width": 1, "sill": 1, "height": 1}]}
        joined = merge_collinear_end_to_end_walls([a, b])
        self.assertEqual(len(joined["walls"]), 1)
        self.assertEqual(joined["walls"][0]["wall"]["end"], [6, 0, 0])
        self.assertEqual(joined["walls"][0]["openings"][1]["offset"], 4)
        self.assertFalse(joined["geometryApproved"])

    def test_noncollinear_and_incompatible_walls_are_not_merged(self):
        a = {"wall": self.wall}
        perpendicular = {"wall": {"start": [4, 0, 0], "end": [4, 3, 0],
                                  "thickness": .2, "height": 3}}
        different_thickness = {"wall": {"start": [4, 0, 0], "end": [6, 0, 0],
                                       "thickness": .3, "height": 3}}
        self.assertEqual(len(merge_collinear_end_to_end_walls([a, perpendicular])["walls"]), 2)
        self.assertEqual(len(merge_collinear_end_to_end_walls([a, different_thickness])["walls"]), 2)

    def test_solid_join_candidate_classification_and_vertical_separation(self):
        horizontal = {"wall": self.wall}
        vertical = {"wall": {"start": [2, -2, 0], "end": [2, 2, 0],
                             "height": 3, "thickness": .2}}
        cross = classify_wall_solid_joins([horizontal, vertical])
        self.assertEqual(cross["joinCandidates"][0]["kind"], "cross")
        self.assertFalse(cross["solidJoinsResolved"])
        upstairs = {"wall": {"start": [2, -2, 3], "end": [2, 2, 3],
                             "height": 3, "thickness": .2}}
        self.assertEqual(classify_wall_solid_joins([horizontal, upstairs])["joinCandidates"], [])
        terminal = {"wall": {"start": [4, 0, 0], "end": [4, 3, 0],
                             "height": 3, "thickness": .2}}
        self.assertEqual(classify_wall_solid_joins([horizontal, terminal])["joinCandidates"][0]["kind"], "L")
        tee = {"wall": {"start": [2, 0, 0], "end": [2, 2, 0],
                        "height": 3, "thickness": .2}}
        self.assertEqual(classify_wall_solid_joins([horizontal, tee])["joinCandidates"][0]["kind"], "T")

    def test_single_wall_has_faces_and_no_automatic_approval(self):
        mesh = mesh_parametric_wall(self.wall)
        self.assertEqual(len(mesh["faces"]), 6)
        self.assertFalse(mesh["geometryApproved"])
        self.assertFalse(mesh["quantitiesEnabled"])

    def test_window_removes_wall_panel_and_forms_reveals(self):
        window = {"kind": "window", "offset": 1, "width": 1,
                  "sill": 1, "height": 1}
        mesh = mesh_parametric_wall(self.wall, [window])
        self.assertGreater(len(mesh["faces"]), 6)
        self.assertEqual(mesh["openingCount"], 1)
        # No front/back covering surface wholly inside the aperture.
        for face in mesh["faces"]:
            pts = [mesh["vertices"][i] for i in face]
            if len({p[1] for p in pts}) == 1 and abs(pts[0][1]) == .1:
                cx = sum(p[0] for p in pts) / 4
                cz = sum(p[2] for p in pts) / 4
                self.assertFalse(1 < cx < 2 and 1 < cz < 2)

    def test_door_opening_and_cross_wall_joins_remain_unapproved(self):
        door = {"kind": "door", "offset": 1, "width": 1,
                "sill": 0, "height": 2.2}
        second = {"start": [2, -2, 0], "end": [2, 2, 0],
                  "thickness": .2, "height": 3}
        project = mesh_parametric_project([
            {"wall": self.wall, "openings": [door]}, {"wall": second}])
        self.assertTrue(project["joinCandidates"])
        self.assertFalse(project["joinsResolved"])
        self.assertFalse(project["globalWatertight"])
        with self.assertRaises(ValueError):
            mesh_parametric_wall(self.wall, [{**door, "offset": 3.9}])


if __name__ == "__main__":
    unittest.main()
