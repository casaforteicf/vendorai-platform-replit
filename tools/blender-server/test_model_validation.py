import json
import struct
import tempfile
import unittest
from pathlib import Path

from model_validation import resolve_model, scale_factor, check_dimensions, fingerprint
from imported_model import check_embedded_glb


class ModelValidationTests(unittest.TestCase):
    def test_calibration_converts_centimeters_to_meters(self):
        self.assertEqual(scale_factor({"measuredDistance": 250, "actualMeters": 2.5}), .01)

    def test_invalid_calibration(self):
        for value in (0, -1, float("inf"), float("nan"), True, "1", None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                scale_factor({"measuredDistance": value, "actualMeters": 2})

    def test_overflow_calibration(self):
        with self.assertRaises(ValueError):
            scale_factor({"measuredDistance": 1e-308, "actualMeters": 1e308})

    def test_dimensions_do_not_approve_geometry_or_quantities(self):
        report = check_dimensions([4, 5, 3], {"width": 4, "depth": 5, "height": 3})
        self.assertTrue(report["passed"])
        self.assertEqual(report["geometryStatus"], "requires_review")
        self.assertFalse(report["quantitiesEnabled"])

    def test_independent_dimension_detects_wrong_scale(self):
        report = check_dimensions([400, 5, 3], {"width": 4, "depth": 5, "height": 3})
        self.assertFalse(report["passed"])

    def test_invalid_reference_or_tolerance(self):
        for expected, tolerance in (({}, .01), ({"width": 1, "depth": 2, "height": 3}, .5)):
            with self.assertRaises(ValueError):
                check_dimensions([1, 2, 3], expected, tolerance)

    def test_private_paths_and_file_fingerprint(self):
        with tempfile.TemporaryDirectory() as root:
            tenant = Path(root) / "tenant-a"
            tenant.mkdir()
            source = tenant / "model.glb"
            source.write_bytes(b"first")
            model = {"tenantId": "tenant-a", "key": "model.glb"}
            self.assertEqual(resolve_model(model, root), source)
            before = fingerprint(source)
            source.write_bytes(b"second")
            self.assertNotEqual(before, fingerprint(source))
            for key in ("../tenant-b/model.glb", "/etc/passwd", "model.skp"):
                with self.subTest(key=key), self.assertRaises(ValueError):
                    resolve_model({**model, "key": key}, root)
            source.unlink()
            source.symlink_to("/etc/passwd")
            with self.assertRaises(ValueError):
                resolve_model(model, root)

    def test_tenant_path_traversal(self):
        with self.assertRaises(ValueError):
            resolve_model({"tenantId": "../other", "key": "model.glb"}, "/tmp")

    def write_glb(self, path, metadata):
        data = json.dumps(metadata).encode()
        data += b" " * (-len(data) % 4)
        path.write_bytes(struct.pack("<4sII", b"glTF", 2, 20 + len(data)) +
                         struct.pack("<II", len(data), 0x4E4F534A) + data)

    def test_embedded_glb(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "model.glb"
            self.write_glb(path, {"buffers": [{"byteLength": 0}]})
            self.assertIn("buffers", check_embedded_glb(path))

    def test_external_resources_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "model.glb"
            for uri in ("../../secret", "https://example.test/texture.png", "file:///etc/passwd"):
                self.write_glb(path, {"images": [{"uri": uri}]})
                with self.subTest(uri=uri), self.assertRaises(ValueError):
                    check_embedded_glb(path)

    def test_truncated_glb(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "model.glb"
            path.write_bytes(b"glTF")
            with self.assertRaises(ValueError):
                check_embedded_glb(path)


if __name__ == "__main__":
    unittest.main()
