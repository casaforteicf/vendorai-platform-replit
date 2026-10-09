import unittest
from arqdor_feature_contracts import (
    inspect_import_request, validate_camera_path, bim_review_manifest, resolve_render_preset, validate_postproduction,
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

    def test_bim_is_never_approved_from_manifest(self):
        data = bim_review_manifest("project-1", geometry_verified=True)
        self.assertFalse(data["quantitiesEnabled"])
        self.assertFalse(data["doorWindowScheduleApproved"])
        self.assertEqual(data["disciplines"]["electrical"], "pending_model_validation")


if __name__ == "__main__":
    unittest.main()
