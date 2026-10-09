"""Opt-in, headless OBJ/FBX -> GLB conversion for isolated Blender workers.

Not an upload endpoint. Caller MUST verify sha256, isolate input paths and run
this with an unprivileged process and resource limits before accepting a model.
Conversion is not architectural validation or BIM reconstruction.
"""
import argparse
import json
from pathlib import Path

import bpy
from arqdor_feature_contracts import validate_conversion_request


def convert(src: Path, dst: Path, sha256: str):
    request = validate_conversion_request(src.name, src.stat().st_size, sha256)
    if src.resolve() == dst.resolve():
        raise ValueError("Entrada e saída devem ser diferentes")
    if dst.suffix.lower() != ".glb":
        raise ValueError("A saída deve ser GLB")
    # Fresh in-memory scene prevents accidental export of template geometry.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if request["format"] == "obj":
        bpy.ops.wm.obj_import(filepath=str(src.resolve()))
    else:
        bpy.ops.import_scene.fbx(filepath=str(src.resolve()))
    meshes = [item for item in bpy.data.objects if item.type == "MESH"]
    if not meshes:
        raise ValueError("Arquivo sem malha renderizável")
    bpy.ops.export_scene.gltf(filepath=str(dst.resolve()), export_format="GLB",
                              use_selection=False, export_apply=False)
    if not dst.is_file() or dst.stat().st_size == 0:
        raise RuntimeError("Exportação GLB vazia")
    return {"status": "converted_pending_geometry_review", "sourceFormat": request["format"],
            "meshCount": len(meshes), "outputBytes": dst.stat().st_size,
            "geometryApproved": False, "materialsApproved": False}


if __name__ == "__main__":
    import sys
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--sha256", required=True)
    values = parser.parse_args(args)
    source = Path(values.input)
    if not source.is_file():
        raise ValueError("Arquivo de origem ausente")
    import hashlib
    hasher = hashlib.sha256()
    with source.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    if hasher.hexdigest() != values.sha256.lower():
        raise ValueError("Integridade SHA256 divergente")
    print(json.dumps(convert(source, Path(values.output), values.sha256)))
