"""Pure validation of Arqdor professional-import, camera-path and BIM contracts.

No external converters are invoked. SKP/IFC do not become GLB by renaming.
This module is intentionally independent of bpy so it can be unit tested.
"""
from pathlib import Path
import math

FORMAT_STATUS = {
    ".glb": "native",
    ".gltf": "requires_embedded_resources_validation",
    ".obj": "requires_mtl_texture_packaging",
    ".fbx": "requires_conversion_validation",
    ".ifc": "requires_ifc_bim_converter",
    ".skp": "requires_licensed_sketchup_converter",
}


def inspect_import_request(filename):
    if not isinstance(filename, str) or not filename or len(filename) > 255:
        raise ValueError("Nome de arquivo inválido")
    extension = Path(filename).suffix.lower()
    if extension not in FORMAT_STATUS:
        raise ValueError("Formato não suportado")
    return {
        "format": extension[1:],
        "status": FORMAT_STATUS[extension],
        "directImportEnabled": extension == ".glb",
        "preserveOriginal": True,
        "geometryReviewRequired": True,
    }


def validate_camera_path(keyframes, fps=24, max_seconds=120):
    if type(fps) is not int or not 1 <= fps <= 60:
        raise ValueError("FPS inválido")
    if not isinstance(keyframes, list) or not 2 <= len(keyframes) <= 120:
        raise ValueError("Informe de 2 a 120 quadros-chave")
    if type(max_seconds) is not int or not 1 <= max_seconds <= 600:
        raise ValueError("Duração máxima inválida")
    validated = []
    last_second = -1
    for entry in keyframes:
        if not isinstance(entry, dict):
            raise ValueError("Quadro-chave inválido")
        second = entry.get("second")
        if (not isinstance(second, (int, float)) or isinstance(second, bool)
                or not math.isfinite(second) or not 0 <= second <= max_seconds
                or second <= last_second):
            raise ValueError("Tempos dos quadros-chave devem ser crescentes")
        camera = {}
        for axis in ("position", "target"):
            point = entry.get(axis)
            if (not isinstance(point, (list, tuple)) or len(point) != 3
                    or any(not isinstance(v, (int, float)) or isinstance(v, bool)
                           or not math.isfinite(v) or abs(v) > 100000 for v in point)):
                raise ValueError("Coordenadas de câmera inválidas")
            camera[axis] = [float(v) for v in point]
        validated.append({"second": float(second), **camera})
        last_second = second
    frames = math.ceil(last_second * fps) + 1
    if frames > fps * max_seconds + 1:
        raise ValueError("Vídeo excede duração máxima")
    if frames > 720:
        raise ValueError("Passeio virtual excede 720 quadros por job")
    return {"fps": fps, "frames": frames, "keyframes": validated,
            "status": "validated_not_rendered"}


BIM_DISCIPLINES = ("architecture", "structure", "electrical", "hydraulic",
                   "sanitary", "stormwater", "hvac", "solar",
                   "heated_floor", "automation")


def bim_review_manifest(project_id, geometry_verified=False):
    if not isinstance(project_id, str) or not project_id.strip():
        raise ValueError("Identificador de projeto obrigatório")
    return {
        "projectId": project_id,
        "geometryVerified": bool(geometry_verified),
        "quantitiesEnabled": False,
        "doorWindowScheduleApproved": False,
        "deliverables": ("floor_plan", "elevations", "sections",
                         "door_window_schedule", "installations", "quantities"),
        "disciplines": {name: "pending_model_validation" for name in BIM_DISCIPLINES},
    }


RENDER_PRESETS = {
    "preview": ([960, 540], 16),
    "full_hd": ([1920, 1080], 64),
    "4k": ([3840, 2160], 256),
    "print": ([5760, 3240], 512),
}


def resolve_render_preset(config):
    """Return validated dimensions and samples independently of Blender."""
    if not isinstance(config, dict):
        raise ValueError("Configuração de render inválida")
    preset = config.get("qualityPreset")
    if preset is not None and (not isinstance(preset, str) or preset not in RENDER_PRESETS):
        raise ValueError("Preset de render desconhecido")
    defaults = RENDER_PRESETS.get(preset, ([1920, 1080], 64))
    resolution = config.get("resolution")
    samples = config.get("samples")
    if resolution is None:
        resolution = defaults[0]
    if samples is None:
        samples = defaults[1]
    if (not isinstance(resolution, (list, tuple)) or len(resolution) != 2
            or any(type(value) is not int or value < 64 or value > 8192 for value in resolution)):
        raise ValueError("Resolução inválida")
    if type(samples) is not int or not 1 <= samples <= 4096:
        raise ValueError("Amostras inválidas")
    return list(resolution), samples


def validate_postproduction(config):
    if config is None:
        config = {}
    if not isinstance(config, dict):
        raise ValueError("Pós-produção inválida")
    exposure, gamma = config.get("exposure", 0), config.get("gamma", 1)
    if (type(exposure) not in (int, float) or not math.isfinite(exposure)
            or not -5 <= exposure <= 5):
        raise ValueError("Exposição inválida")
    if (type(gamma) not in (int, float) or not math.isfinite(gamma)
            or not 0.2 <= gamma <= 4):
        raise ValueError("Gamma inválido")
    return {"exposure": exposure, "gamma": gamma}


def validate_conversion_request(filename, size_bytes, expected_sha256):
    """Admission only: actual OBJ/FBX conversion and geometry QA are separate."""
    import re
    info = inspect_import_request(filename)
    if info["format"] not in ("obj", "fbx"):
        raise ValueError("Conversão direta permitida somente para OBJ/FBX nesta etapa")
    if type(size_bytes) is not int or not 0 < size_bytes <= 200 * 1024 * 1024:
        raise ValueError("Tamanho do modelo inválido")
    if not isinstance(expected_sha256, str) or not re.fullmatch(r"[a-fA-F0-9]{64}", expected_sha256):
        raise ValueError("SHA256 obrigatório")
    return {
        "format": info["format"],
        "sha256": expected_sha256.lower(),
        "maxBytes": 200 * 1024 * 1024,
        "conversionStatus": "requires_isolated_blender_conversion",
        "geometryReviewRequired": True,
        "materialsReviewRequired": True,
        "approvedForRender": False,
    }


# Names are *hints* only. Imported mesh topology and wall openings are not
# sufficient to certify IFC semantics, quantities or technical documentation.
ARCHITECTURAL_HINTS = {
    "wall": ("wall", "parede", "muro", "ifcwall"),
    "slab": ("slab", "laje", "piso", "floor", "ifcslab"),
    "door": ("door", "porta", "ifcdoor"),
    "window": ("window", "janela", "esquadria", "ifcwindow"),
    "roof": ("roof", "telhado", "cobertura", "ifcroof"),
    "column": ("column", "pilar", "coluna", "ifccolumn"),
    "beam": ("beam", "viga", "ifcbeam"),
}


def suggest_architectural_classification(name):
    """Conservative, non-authoritative classification of named 3D objects."""
    import unicodedata
    if not isinstance(name, str) or len(name) > 500:
        raise ValueError("Nome do objeto inválido")
    normalized = unicodedata.normalize("NFKD", name.casefold())
    normalized = "".join(c for c in normalized if not unicodedata.combining(c))
    import re
    tokens = set(re.findall(r"[a-z0-9]+", normalized))
    matches = [category for category, aliases in ARCHITECTURAL_HINTS.items()
               if any(alias in tokens for alias in aliases)]
    if len(matches) != 1:
        return {"suggestedClass": None, "classificationStatus": "manual_review_required",
                "confidence": "none", "quantitiesEnabled": False}
    return {"suggestedClass": matches[0], "classificationStatus": "unverified_name_hint",
            "confidence": "low", "quantitiesEnabled": False}


def suggest_geometry_role(dimensions):
    """Conservative shape hint in Blender Z-up coordinates, not BIM recognition.

    Units, rotations, openings and object composition may be unknown: no
    candidate is approved and no quantities may be derived from these hints.
    """
    if (not isinstance(dimensions, (list, tuple)) or len(dimensions) != 3
            or any(type(v) not in (int, float) or not math.isfinite(v) or v < 0
                   for v in dimensions)):
        raise ValueError("Dimensões geométricas inválidas")
    ordered = sorted(dimensions)
    thin, middle, long = ordered
    if long <= 0 or thin <= 0:
        role = None
    elif thin / long < 0.12 and middle / long >= 0.25:
        role = "thin_panel_candidate"
    elif middle / long < 0.12:
        role = "linear_member_candidate"
    else:
        role = None
    return {"shapeHint": role, "geometryVerified": False,
            "suggestedOnly": True, "quantitiesEnabled": False,
            "requiresScaleCalibration": True}


def propose_opening_hosts(objects, tolerance=0.15):
    """AABB proximity suggestions, never confirmation of a real wall opening.

    Expected records: {name, suggestedClass, bounds:{min:[x,y,z],max:[x,y,z]}}.
    All coordinates must share the same reference frame and calibrated scale.
    """
    if not isinstance(objects, list) or len(objects) > 2000:
        raise ValueError("Lista de objetos inválida")
    if type(tolerance) not in (int, float) or not math.isfinite(tolerance) or not 0 <= tolerance <= 1:
        raise ValueError("Tolerância inválida")
    def bounds(item):
        box = item.get("bounds") if isinstance(item, dict) else None
        if not isinstance(box, dict):
            raise ValueError("Limites ausentes")
        lo, hi = box.get("min"), box.get("max")
        if not isinstance(lo, (list, tuple)) or not isinstance(hi, (list, tuple)) or len(lo) != 3 or len(hi) != 3:
            raise ValueError("Limites inválidos")
        for low, high in zip(lo, hi):
            if (type(low) not in (int, float) or type(high) not in (int, float)
                    or not math.isfinite(low) or not math.isfinite(high) or low > high):
                raise ValueError("Coordenadas inválidas")
        return lo, hi
    indexed = [(item, *bounds(item)) for item in objects]
    walls = [(item, lo, hi) for item, lo, hi in indexed if item.get("suggestedClass") == "wall"]
    proposals = []
    for opening, lo, hi in indexed:
        if opening.get("suggestedClass") not in ("door", "window"):
            continue
        matches = []
        for wall, wlo, whi in walls:
            # Intersection of axis-aligned boxes suggests proximity only:
            # a closed wall surface can still intersect a window/door mesh.
            if all(lo[i] <= whi[i] + tolerance and hi[i] >= wlo[i] - tolerance for i in range(3)):
                matches.append(wall.get("name"))
        # Repeated names cannot safely identify a unique BIM host.
        unique = len(matches) == 1 and isinstance(matches[0], str) and bool(matches[0].strip())
        proposals.append({"opening": opening.get("name"), "type": opening["suggestedClass"],
                          "candidateWalls": matches[:20],
                          "hostRelationStatus": "single_spatial_candidate" if unique else
                              ("ambiguous_spatial_candidates" if matches else "no_spatial_candidate"),
                          "requiresManualReview": True,
                          "status": "unverified_spatial_overlap",
                          "openingDetected": False, "quantitiesEnabled": False})
    return proposals


def preview_scale_calibration(measured_distance, actual_meters, dimensions):
    """Explicit scale preview, not a geometry modification or BIM approval."""
    for number in (measured_distance, actual_meters):
        if type(number) not in (int, float) or not math.isfinite(number) or number <= 0:
            raise ValueError("Medidas de referência inválidas")
    if (not isinstance(dimensions, (list, tuple)) or len(dimensions) != 3
            or any(type(v) not in (int, float) or not math.isfinite(v) or v < 0
                   for v in dimensions)):
        raise ValueError("Dimensões inválidas")
    factor = actual_meters / measured_distance
    if not math.isfinite(factor) or factor < 0.00001 or factor > 100000:
        raise ValueError("Escala fora dos limites")
    return {"scaleFactor": factor, "dimensionsMeters": [v * factor for v in dimensions],
            "status": "pending_geometry_review", "appliedToModel": False,
            "quantitiesEnabled": False}


def draft_opening_schedule(objects, calibrated_scale=None):
    """Unapproved door/window schedule using mesh AABBs; never fabrication sizes.

    Blender coordinates are Z-up. AABB dimensions differ from real frame sizes
    for rotated elements, hardware, composite meshes or uncalibrated imports.
    """
    relations = propose_opening_hosts(objects)
    if calibrated_scale is not None and (
            type(calibrated_scale) not in (int, float)
            or not math.isfinite(calibrated_scale)
            or not 0.00001 <= calibrated_scale <= 100000):
        raise ValueError("Escala inválida")
    by_name = {}
    for item in objects:
        name = item.get("name")
        if not isinstance(name, str) or not name:
            raise ValueError("Nome de objeto inválido")
        by_name.setdefault(name, []).append(item)
    output = []
    for relation in relations:
        elements = by_name.get(relation["opening"], [])
        if len(elements) != 1:
            output.append({**relation, "measurementStatus": "ambiguous_object_name",
                           "dimensionsMeters": None, "approved": False})
            continue
        box = elements[0]["bounds"]
        lo, hi = box["min"], box["max"]
        span = [hi[i] - lo[i] for i in range(3)]
        # Smaller XY AABB dimension approximates wall depth; the larger is
        # only a candidate opening width, not a verified technical dimension.
        width = max(span[0], span[1])
        height = span[2]
        dimensions = None if calibrated_scale is None else {
            "approxWidth": round(width * calibrated_scale, 4),
            "approxHeight": round(height * calibrated_scale, 4),
            "approxSillElevation": round(lo[2] * calibrated_scale, 4),
        }
        output.append({**relation, "measurementStatus": "aabb_estimate_requires_review",
                       "dimensionsMeters": dimensions,
                       "scaleCalibrated": calibrated_scale is not None,
                       "approved": False, "fabricationReady": False})
    return output


def evaluate_wall_mesh_topology(vertex_count, edge_count, face_count,
                                boundary_edges, nonmanifold_edges):
    """Diagnostic evidence only, not recognition of doors/windows or voids.

    An open mesh can contain deliberate openings or simply be incomplete;
    a watertight mesh may still contain real wall apertures with jambs.
    """
    values = (vertex_count, edge_count, face_count, boundary_edges, nonmanifold_edges)
    if any(type(v) is not int or v < 0 or v > 100_000_000 for v in values):
        raise ValueError("Contagens de topologia inválidas")
    if boundary_edges > edge_count or nonmanifold_edges > edge_count:
        raise ValueError("Topologia inconsistente")
    if vertex_count == 0 or face_count == 0:
        status = "no_surface"
    elif nonmanifold_edges:
        status = "nonmanifold_requires_review"
    elif boundary_edges:
        status = "open_surface_requires_review"
    else:
        status = "closed_surface_not_void_verified"
    return {"topologyStatus": status, "boundaryEdges": boundary_edges,
            "nonmanifoldEdges": nonmanifold_edges,
            "openingDetected": False, "quantitiesEnabled": False,
            "requiresManualReview": True}
