import unittest
from arqdor_feature_contracts import (
    inspect_import_request, validate_camera_path, bim_review_manifest,
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

    def test_bim_is_never_approved_from_manifest(self):
        data = bim_review_manifest("project-1", geometry_verified=True)
        self.assertFalse(data["quantitiesEnabled"])
        self.assertFalse(data["doorWindowScheduleApproved"])
        self.assertEqual(data["disciplines"]["electrical"], "pending_model_validation")


if __name__ == "__main__":
    unittest.main()
