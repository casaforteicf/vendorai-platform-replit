import unittest
from arqdor_parametric_mesh import mesh_parametric_wall, mesh_parametric_project, inspect_mesh_edges


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
