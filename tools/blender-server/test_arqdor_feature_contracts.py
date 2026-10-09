import unittest
from arqdor_feature_contracts import (
    inspect_import_request, validate_camera_path, bim_review_manifest, resolve_render_preset, validate_postproduction, validate_conversion_request, suggest_architectural_classification, suggest_geometry_role, propose_opening_hosts,
)


class FeatureContractsTests(unittest.TestCase):
    def test_glb_only_direct_import(self):
        self.assertTrue(inspect_import_request("residencia.glb")["directImportEnabled"])
        for extension in ("skp", "ifc", "obj", "fbx", "gltf"):
            record = inspect_import_request("residencia." + extension)
            self.assertFalse(record["directImportEnabled"])
            self.assertTrue(record["geometryReviewRequired"])

    def test_reject_unknown_format(self):
        with self.assertRaises(ValueError):
            inspect_import_request("model.exe")

    def test_camera_path_is_ordered_and_bounded(self):
        path = [
            {"second": 0, "position": [1, 2, 3], "target": [0, 0, 0]},
            {"second": 3, "position": [4, 2, 3], "target": [0, 0, 0]},
        ]
        self.assertEqual(validate_camera_path(path)["frames"], 73)
        with self.assertRaises(ValueError):
            validate_camera_path(path[::-1])
        with self.assertRaises(ValueError):
            validate_camera_path(path, fps=100)

    def test_video_limit_prevents_unbounded_worker_render(self):
        long_path = [
            {"second": 0, "position": [0, 1, 2], "target": [0, 0, 0]},
            {"second": 40, "position": [2, 1, 2], "target": [0, 0, 0]},
        ]
        with self.assertRaises(ValueError):
            validate_camera_path(long_path, fps=24)
        short_path = [{**long_path[0]}, {**long_path[1], "second": 29}]
        self.assertEqual(validate_camera_path(short_path, fps=24)["frames"], 697)

    def test_4k_and_print_presets(self):
        self.assertEqual(resolve_render_preset({"qualityPreset": "4k"}), ([3840, 2160], 256))
        self.assertEqual(resolve_render_preset({"qualityPreset": "print"}), ([5760, 3240], 512))
        self.assertEqual(resolve_render_preset({"qualityPreset": "preview"}), ([960, 540], 16))
        self.assertEqual(resolve_render_preset({"qualityPreset": "4k", "samples": 32}), ([3840, 2160], 32))
        with self.assertRaises(ValueError):
            resolve_render_preset({"qualityPreset": "imaginary"})
        with self.assertRaises(ValueError):
            resolve_render_preset({"resolution": [100000, 100000]})
        with self.assertRaises(ValueError):
            resolve_render_preset({"samples": True})

    def test_optional_postproduction_and_bounds(self):
        self.assertEqual(validate_postproduction(None), {"exposure": 0, "gamma": 1})
        self.assertEqual(validate_postproduction({"exposure": 1.25, "gamma": 1.1}),
                         {"exposure": 1.25, "gamma": 1.1})
        with self.assertRaises(ValueError):
            validate_postproduction({"gamma": 0})
        with self.assertRaises(ValueError):
            validate_postproduction({"exposure": float("inf")})

    def test_obj_fbx_require_review_before_render(self):
        digest = "ab" * 32
        for extension in ("obj", "fbx"):
            report = validate_conversion_request("house." + extension, 4096, digest)
            self.assertFalse(report["approvedForRender"])
            self.assertTrue(report["geometryReviewRequired"])
        for extension in ("skp", "ifc", "exe"):
            with self.assertRaises(ValueError):
                validate_conversion_request("house." + extension, 4096, digest)
        with self.assertRaises(ValueError):
            validate_conversion_request("house.fbx", 0, digest)
        with self.assertRaises(ValueError):
            validate_conversion_request("house.obj", 4096, "../not-a-sha")

    def test_architectural_hints_require_review(self):
        for name, expected in (("Parede Externa", "wall"), ("Laje Superior", "slab"),
                               ("Porta Principal", "door"), ("Janela Cozinha", "window"),
                               ("Cobertura", "roof"), ("Pilar 01", "column")):
            hint = suggest_architectural_classification(name)
            self.assertEqual(hint["suggestedClass"], expected)
            self.assertFalse(hint["quantitiesEnabled"])
            self.assertEqual(hint["classificationStatus"], "unverified_name_hint")
        for name in ("Mesh 001", "Parede Janela"):
            hint = suggest_architectural_classification(name)
            self.assertIsNone(hint["suggestedClass"])
            self.assertEqual(hint["classificationStatus"], "manual_review_required")

    def test_geometry_hints_are_only_candidates(self):
        panel = suggest_geometry_role([4.0, 0.15, 2.8])
        self.assertEqual(panel["shapeHint"], "thin_panel_candidate")
        self.assertFalse(panel["geometryVerified"])
        self.assertFalse(panel["quantitiesEnabled"])
        member = suggest_geometry_role([0.15, 0.15, 3.0])
        self.assertEqual(member["shapeHint"], "linear_member_candidate")
        self.assertIsNone(suggest_geometry_role([2.0, 2.0, 2.0])["shapeHint"])
        for invalid in ([1, -1, 2], [1, float("nan"), 3], [1, 2]):
            with self.assertRaises(ValueError):
                suggest_geometry_role(invalid)

    def test_wall_opening_overlap_is_unverified(self):
        wall = {"name": "Parede A", "suggestedClass": "wall",
                "bounds": {"min": [0, 0, 0], "max": [4, 0.2, 3]}}
        window = {"name": "Janela A", "suggestedClass": "window",
                  "bounds": {"min": [1, 0.1, 1], "max": [2, 0.3, 2]}}
        remote = {"name": "Porta distante", "suggestedClass": "door",
                  "bounds": {"min": [20, 0, 0], "max": [21, 1, 2]}}
        result = propose_opening_hosts([wall, window, remote])
        self.assertEqual(result[0]["candidateWalls"], ["Parede A"])
        self.assertFalse(result[0]["openingDetected"])
        self.assertEqual(result[1]["candidateWalls"], [])
        with self.assertRaises(ValueError):
            propose_opening_hosts([{"name": "bad", "bounds": {"min": [2, 0, 0], "max": [1, 1, 1]}}])

    def test_bim_is_never_approved_from_manifest(self):
        data = bim_review_manifest("project-1", geometry_verified=True)
        self.assertFalse(data["quantitiesEnabled"])
        self.assertFalse(data["doorWindowScheduleApproved"])
        self.assertEqual(data["disciplines"]["electrical"], "pending_model_validation")


if __name__ == "__main__":
    unittest.main()
