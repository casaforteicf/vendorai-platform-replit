"""Opt-in, headless OBJ/FBX -> GLB conversion for isolated Blender workers.

Not an upload endpoint. Caller MUST verify sha256, isolate input paths and run
this with an unprivileged process and resource limits before accepting a model.
Conversion is not architectural validation or BIM reconstruction.
"""
import argparse
import json
import math
from mathutils import Vector
from pathlib import Path

import bpy
from arqdor_feature_contracts import validate_conversion_request, suggest_architectural_classification, suggest_geometry_role, propose_opening_hosts, draft_opening_schedule, associate_boundary_candidates, evaluate_wall_mesh_topology, inspect_boundary_loops


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
    world_points = []
    material_names = set()
    vertex_count = 0
    polygon_count = 0
    for obj in meshes:
        vertex_count += len(obj.data.vertices)
        polygon_count += len(obj.data.polygons)
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            if not all(math.isfinite(value) for value in point):
                raise ValueError("Geometria contém coordenadas não finitas")
            world_points.append(point)
        for slot in obj.material_slots:
            if slot.material:
                material_names.add(slot.material.name)
    if not world_points:
        raise ValueError("Modelo sem limites geométricos")
    minimum = [min(v[axis] for v in world_points) for axis in range(3)]
    maximum = [max(v[axis] for v in world_points) for axis in range(3)]
    dimensions = [maximum[axis] - minimum[axis] for axis in range(3)]
    if any(not math.isfinite(value) or value > 100000 for value in dimensions):
        raise ValueError("Dimensões incompatíveis com limites do conversor")
    classification_hints = []
    for obj in meshes[:2000]:
        world_corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        local_bounds = [max(point[axis] for point in world_corners)
                        - min(point[axis] for point in world_corners)
                        for axis in range(3)]
        topology = {}
        if suggest_architectural_classification(obj.name)["suggestedClass"] == "wall":
            # Blender edge.is_manifold is only a topology diagnostic, not an
            # aperture detector. Closed walls may still contain actual voids.
            # MeshEdge does not consistently expose is_boundary across Blender
            # versions; bmesh provides stable edge topology on a copied mesh.
            import bmesh
            bm = bmesh.new()
            try:
                bm.from_mesh(obj.data)
                boundary = sum(1 for edge in bm.edges if edge.is_boundary)
                nonmanifold = sum(1 for edge in bm.edges if not edge.is_manifold and not edge.is_boundary)
                topology = evaluate_wall_mesh_topology(
                    len(obj.data.vertices), len(obj.data.edges),
                    len(obj.data.polygons), boundary, nonmanifold)
                if boundary <= 50000 and len(obj.data.vertices) <= 200000:
                    bm.verts.index_update()
                    boundary_vertices = [[float(v) for v in (obj.matrix_world @ vertex.co)]
                                         for vertex in obj.data.vertices]
                    boundary_connections = [[edge.verts[0].index, edge.verts[1].index]
                                            for edge in bm.edges if edge.is_boundary]
                    topology["boundaryLoopReview"] = inspect_boundary_loops(
                        boundary_vertices, boundary_connections)
                else:
                    topology["boundaryLoopReview"] = {
                        "closedBoundaryCandidates": [],
                        "status": "skipped_resource_limits",
                        "requiresManualReview": True,
                        "quantitiesEnabled": False,
                    }
            finally:
                bm.free()
        classification_hints.append({
            "name": obj.name,
            "topologyReview": topology or None,
            "boundsDimensions": local_bounds,
            "bounds": {"min": [min(p[a] for p in world_corners) for a in range(3)],
                       "max": [max(p[a] for p in world_corners) for a in range(3)]},
            **suggest_architectural_classification(obj.name),
            **suggest_geometry_role(local_bounds),
        })
    opening_hosts = propose_opening_hosts(classification_hints)
    opening_schedule = draft_opening_schedule(classification_hints)
    boundary_matches = associate_boundary_candidates(opening_hosts, classification_hints)
    bpy.ops.export_scene.gltf(filepath=str(dst.resolve()), export_format="GLB",
                              use_selection=False, export_apply=False)
    if not dst.is_file() or dst.stat().st_size == 0:
        raise RuntimeError("Exportação GLB vazia")
    return {"status": "converted_pending_geometry_review", "sourceFormat": request["format"],
            "meshCount": len(meshes), "vertexCount": vertex_count,
            "polygonCount": polygon_count,
            "materialNames": sorted(material_names)[:1000],
            "bounds": {"min": minimum, "max": maximum, "dimensions": dimensions},
            "units": "unverified", "classifications": classification_hints,
            "openingHostCandidates": opening_hosts,
            "openingScheduleDraft": opening_schedule,
            "boundaryOpeningReview": boundary_matches,
            "outputBytes": dst.stat().st_size,
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
