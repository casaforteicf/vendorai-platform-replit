"""Runs inside Blender; imports a real GLB instead of generating placeholder objects."""
import json
import os
import struct

from model_validation import resolve_model, fingerprint, scale_factor, check_dimensions


def check_embedded_glb(path):
    # Reject external buffers/images: the importer must not read arbitrary local paths.
    with open(path, "rb") as source:
        header = source.read(12)
        if len(header) != 12:
            raise ValueError("GLB incompleto")
        magic, version, total = struct.unpack("<4sII", header)
        if magic != b"glTF" or version != 2 or total != path.stat().st_size:
            raise ValueError("GLB 2.0 inválido")
        chunk_header = source.read(8)
        if len(chunk_header) != 8:
            raise ValueError("GLB sem metadados")
        length, kind = struct.unpack("<II", chunk_header)
        if kind != 0x4E4F534A or length > 16 * 1024 * 1024 or length > total - 20:
            raise ValueError("Metadados GLB inválidos ou excessivos")
        metadata = json.loads(source.read(length))
    for resource in metadata.get("buffers", []) + metadata.get("images", []):
        uri = resource.get("uri")
        if uri is not None and (not isinstance(uri, str) or not uri.startswith("data:")):
            raise ValueError("GLB deve incorporar todos os recursos")
    return metadata


def import_model(config):
    import bpy
    from mathutils import Matrix, Vector
    root = os.environ.get("ARQDOR_MODEL_ROOT")
    if not root:
        raise ValueError("ARQDOR_MODEL_ROOT não configurado")
    path = resolve_model(config, root)
    if path.stat().st_size > 200 * 1024 * 1024:
        raise ValueError("Modelo excede 200 MB")
    check_embedded_glb(path)
    version = fingerprint(path)
    expected_version = config.get("sha256")
    if not isinstance(expected_version, str) or version != expected_version:
        raise ValueError("Versão do modelo não corresponde ao SHA-256 informado")
    factor = scale_factor(config.get("calibration"))
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = list(bpy.context.scene.objects)
    # Only root transforms are scaled; children inherit the scale once.
    for obj in imported:
        if obj.parent is None:
            obj.matrix_world = Matrix.Scale(factor, 4) @ obj.matrix_world
    bpy.context.view_layer.update()
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise ValueError("Modelo sem geometria de malha")
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in meshes:
        evaluated = obj.evaluated_get(depsgraph)
        points.extend(evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box)
    low = [min(point[i] for point in points) for i in range(3)]
    high = [max(point[i] for point in points) for i in range(3)]
    dimensions = [high[i] - low[i] for i in range(3)]
    validation = check_dimensions(dimensions, config.get("referenceDimensions"),
                                  config.get("tolerance", 0.01))
    report = {"modelSha256": version, "scaleFactor": factor,
              "bounds": {"min": low, "max": high}, **validation,
              "objects": [{"name": obj.name, "polygons": len(obj.data.polygons),
                           "materials": [slot.material.name if slot.material else None
                                         for slot in obj.material_slots]} for obj in meshes],
              "materials": [{"name": mat.name, "specificationStatus": "unconfirmed"}
                            for mat in bpy.data.materials]}
    if not validation["passed"]:
        raise ValueError("Dimensões divergentes da referência independente; revise a escala")
    # Imported cameras/lights are retained, with explicit render-camera override in the caller.
    return report
