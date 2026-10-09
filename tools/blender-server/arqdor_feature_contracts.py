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
        proposals.append({"opening": opening.get("name"), "objectId": opening.get("objectId"),
                          "sourceObjectKey": opening.get("sourceObjectKey"),
                          "type": opening["suggestedClass"],
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
        # Deterministic source-local identity distinguishes duplicated names.
        # Never infer correspondence from name alone when duplicates exist.
        object_id = relation.get("objectId")
        if object_id is not None:
            elements = [item for item in elements if item.get("objectId") == object_id]
        source_key = relation.get("sourceObjectKey")
        if source_key is not None:
            elements = [item for item in elements if item.get("sourceObjectKey") == source_key]
        if len(elements) != 1:
            output.append({**relation, "measurementStatus": "ambiguous_object_name",
                           "objectCountWithName": len(elements),
                           "dimensionsMeters": None, "scaleCalibrated": False,
                           "approved": False, "fabricationReady": False})
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
        output.append({**relation, "objectId": elements[0].get("objectId"),
                       "sourceObjectKey": elements[0].get("sourceObjectKey"),
                       "measurementStatus": "aabb_estimate_requires_review",
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


def inspect_boundary_loops(vertices, edges, max_edges=50000):
    """Trace closed boundary rings from mesh-edge coordinates, not true voids.

    Only degree-2 components can form candidate loops. A closed boundary ring
    can also be a missing exterior face: never certify it as a door/window.
    """
    if (type(max_edges) is not int or not 1 <= max_edges <= 50000
            or not isinstance(vertices, list) or not isinstance(edges, list)
            or len(edges) > max_edges or len(vertices) > 200000):
        raise ValueError("Contorno excede limite ou está inválido")
    for point in vertices:
        if (not isinstance(point, (list, tuple)) or len(point) != 3
                or any(type(v) not in (int, float) or not math.isfinite(v) for v in point)):
            raise ValueError("Vértice inválido")
    adjacency = {}
    unique_edges = set()
    for edge in edges:
        if (not isinstance(edge, (list, tuple)) or len(edge) != 2
                or any(type(i) is not int or not 0 <= i < len(vertices) for i in edge)
                or edge[0] == edge[1]):
            raise ValueError("Aresta inválida")
        a, b = edge
        normalized_edge = (min(a, b), max(a, b))
        if normalized_edge in unique_edges:
            raise ValueError("Aresta duplicada no contorno")
        unique_edges.add(normalized_edge)
        adjacency.setdefault(a, set()).add(b)
        adjacency.setdefault(b, set()).add(a)
    seen = set()
    loops = []
    for start in adjacency:
        if start in seen:
            continue
        stack, component = [start], set()
        while stack:
            current = stack.pop()
            if current in component:
                continue
            component.add(current)
            stack.extend(adjacency[current] - component)
        seen.update(component)
        if len(component) < 3 or any(len(adjacency[v]) != 2 for v in component):
            continue
        coords = [vertices[v] for v in component]
        low = [min(p[i] for p in coords) for i in range(3)]
        high = [max(p[i] for p in coords) for i in range(3)]
        loops.append({"vertexCount": len(component), "bounds": {"min": low, "max": high},
                      "status": "closed_boundary_candidate", "openingConfirmed": False})
    return {"closedBoundaryCandidates": loops[:100],
            "requiresManualReview": True, "quantitiesEnabled": False}


def associate_boundary_candidates(opening_hosts, classifications, tolerance=0.15):
    """Cross-check candidate boundary rings with nearby door/window AABBs.

    A ring can be an outside mesh boundary; matching it with an object only
    raises a review priority. Neither an opening nor its size is certified.
    """
    if (not isinstance(opening_hosts, list) or not isinstance(classifications, list)
            or len(opening_hosts) > 2000 or len(classifications) > 2000):
        raise ValueError("Dados espaciais inválidos ou acima do limite")
    if type(tolerance) not in (int, float) or not math.isfinite(tolerance) or not 0 <= tolerance <= 1:
        raise ValueError("Tolerância inválida")
    walls = {}
    for item in classifications:
        if not isinstance(item, dict):
            raise ValueError("Elemento inválido")
        if item.get("suggestedClass") == "wall":
            walls.setdefault(item.get("name"), []).append(item)
    openings = {}
    for item in classifications:
        if item.get("suggestedClass") in ("door", "window"):
            openings.setdefault(item.get("name"), []).append(item)
    findings = []
    for relation in opening_hosts:
        if not isinstance(relation, dict):
            raise ValueError("Relação espacial inválida")
        name = relation.get("opening")
        matches = openings.get(name, [])
        if relation.get("objectId") is not None:
            matches = [item for item in matches if item.get("objectId") == relation["objectId"]]
        candidates = relation.get("candidateWalls", [])
        verified_candidates = []
        if len(matches) == 1 and isinstance(candidates, list):
            opening_bounds = matches[0].get("bounds", {})
            low, high = opening_bounds.get("min"), opening_bounds.get("max")
            if isinstance(low, list) and isinstance(high, list) and len(low) == len(high) == 3:
                for wall_name in candidates[:20]:
                    wall_items = walls.get(wall_name, [])
                    if len(wall_items) != 1:
                        continue
                    # Exterior outline rings commonly overlap windows near
                    # the facade: do not count rings touching the wall envelope.
                    wall_bounds = wall_items[0].get("bounds") or {}
                    wall_min, wall_max = wall_bounds.get("min"), wall_bounds.get("max")
                    if (not isinstance(wall_min, list) or not isinstance(wall_max, list)
                            or len(wall_min) != 3 or len(wall_max) != 3):
                        continue
                    review = wall_items[0].get("topologyReview") or {}
                    if not isinstance(review, dict):
                        continue
                    boundary_review = review.get("boundaryLoopReview") or {}
                    if not isinstance(boundary_review, dict):
                        continue
                    loops = boundary_review.get("closedBoundaryCandidates", [])
                    if not isinstance(loops, list):
                        continue
                    for loop in loops[:100]:
                        if not isinstance(loop, dict):
                            continue
                        box = loop.get("bounds", {})
                        if not isinstance(box, dict):
                            continue
                        bmin, bmax = box.get("min"), box.get("max")
                        if not isinstance(bmin, list) or not isinstance(bmax, list) or len(bmin) != 3 or len(bmax) != 3:
                            continue
                        if (any(type(value) not in (int, float) or not math.isfinite(value)
                                for value in (*low, *high, *bmin, *bmax))):
                            continue
                        if (any(low[i] > high[i] or bmin[i] > bmax[i] for i in range(3))):
                            continue
                        # A rectangular ring must be strictly inside the
                        # horizontal span and height of its wall to be prioritized.
                        # This is only a filter, not proof of a physical cut-out.
                        if (any(type(v) not in (int, float) or not math.isfinite(v)
                                for v in (*wall_min, *wall_max))):
                            continue
                        axes = (0, 2) if (wall_max[0] - wall_min[0]) >= (wall_max[1] - wall_min[1]) else (1, 2)
                        if any(bmin[i] <= wall_min[i] + tolerance
                               or bmax[i] >= wall_max[i] - tolerance for i in axes):
                            continue
                        if all(low[i] <= bmax[i] + tolerance and high[i] >= bmin[i] - tolerance for i in range(3)):
                            verified_candidates.append({"wall": wall_name, "boundaryBounds": box})
        findings.append({
            "opening": name, "objectId": relation.get("objectId"),
            "sourceObjectKey": relation.get("sourceObjectKey"),
            "candidateBoundaryMatches": verified_candidates[:20],
            "reviewPriority": "boundary_and_object_overlap" if verified_candidates else "spatial_only",
            "openingConfirmed": False, "fabricationReady": False,
            "requiresManualReview": True, "quantitiesEnabled": False,
        })
    return findings


def build_opening_review_queue(schedule_rows, boundary_reviews):
    """Deterministic, read-only triage of draft opening issues; no BIM approval."""
    if (not isinstance(schedule_rows, list) or not isinstance(boundary_reviews, list)
            or len(schedule_rows) > 2000 or len(boundary_reviews) > 2000):
        raise ValueError("Fila de revisão inválida")
    reviews = {}
    for review in boundary_reviews:
        if not isinstance(review, dict):
            raise ValueError("Revisão inválida")
        key = review.get("sourceObjectKey") or review.get("objectId")
        if isinstance(key, str) and key:
            reviews.setdefault(key, []).append(review)
    queue = []
    for index, row in enumerate(schedule_rows):
        if not isinstance(row, dict):
            raise ValueError("Esquadria inválida")
        key = row.get("sourceObjectKey") or row.get("objectId")
        related = reviews.get(key, []) if isinstance(key, str) else []
        reasons = []
        if row.get("measurementStatus") == "ambiguous_object_name":
            reasons.append("ambiguous_identity")
        if row.get("hostRelationStatus") != "single_spatial_candidate":
            reasons.append("missing_or_ambiguous_wall")
        if row.get("dimensionsMeters") is None:
            reasons.append("unverified_dimensions")
        if not any(r.get("candidateBoundaryMatches") for r in related):
            reasons.append("no_matching_boundary_evidence")
        severity = "high" if "ambiguous_identity" in reasons or "missing_or_ambiguous_wall" in reasons else "medium"
        queue.append({"sourceObjectKey": row.get("sourceObjectKey"),
                      "objectId": row.get("objectId"), "name": row.get("opening"),
                      "priority": severity, "issues": reasons, "reviewStatus": "pending_manual_review",
                      "approved": False, "fabricationReady": False,
                      "quantitiesEnabled": False, "_index": index})
    queue.sort(key=lambda item: (0 if item["priority"] == "high" else 1, item["_index"]))
    for item in queue:
        del item["_index"]
    return queue


def create_opening_review_queue(schedule, source_sha256, project_version):
    """Build a read-only review queue scoped to a specific import and project version.

    Review rows are proposals, not approved BIM elements. The caller must persist
    review decisions separately, with reviewer and audit history.
    """
    import re
    if (not isinstance(source_sha256, str)
            or not re.fullmatch(r"[a-fA-F0-9]{64}", source_sha256)):
        raise ValueError("Hash de origem inválido")
    if (not isinstance(project_version, str) or not project_version.strip()
            or len(project_version) > 128):
        raise ValueError("Versão do projeto inválida")
    if not isinstance(schedule, list) or len(schedule) > 2000:
        raise ValueError("Quadro de revisão inválido")
    digest = source_sha256.lower()
    rows = []
    seen = set()
    for entry in schedule:
        if not isinstance(entry, dict):
            raise ValueError("Registro inválido")
        key = entry.get("sourceObjectKey")
        object_id = entry.get("objectId")
        expected = f"{digest}:{object_id}" if isinstance(object_id, str) else None
        if not isinstance(key, str) or key.lower() != expected or key in seen:
            raise ValueError("Identidade de objeto ausente, divergente ou duplicada")
        seen.add(key)
        status = entry.get("measurementStatus")
        reasons = []
        if status != "aabb_estimate_requires_review":
            reasons.append("ambiguous_or_missing_measurement")
        if entry.get("hostRelationStatus") != "single_spatial_candidate":
            reasons.append("unresolved_wall_host")
        if entry.get("dimensionsMeters") is None:
            reasons.append("uncalibrated_or_missing_dimensions")
        conflict = bool(reasons)
        rows.append({
            "reviewKey": f"{project_version}:{key}",
            "projectVersion": project_version,
            "sourceSha256": digest,
            "objectId": object_id,
            "sourceObjectKey": key,
            "name": entry.get("opening"),
            "kind": entry.get("type"),
            "conflict": conflict,
            "conflictReasons": reasons,
            "reviewStatus": "needs_manual_review",
            "estimatedDimensionsMeters": entry.get("dimensionsMeters"),
            "geometryApproved": False,
            "fabricationReady": False,
            "quantitiesEnabled": False,
        })
    return {"projectVersion": project_version, "sourceSha256": digest,
            "reviewRequired": True, "rows": rows}


def record_opening_review_decision(queue, review_key, reviewer_id, decision,
                                   reason, reviewed_at):
    """Pure append-only audit proposal; persistence and authorization are external.

    A reviewer decision records disposition only. It never certifies source
    geometry, fabrication dimensions, quantities or releases.
    """
    if not isinstance(queue, dict) or not isinstance(queue.get("rows"), list):
        raise ValueError("Fila de revisão inválida")
    if decision not in ("accept_for_detailed_review", "reject_candidate", "request_information"):
        raise ValueError("Decisão inválida")
    if (not isinstance(reviewer_id, str) or not reviewer_id.strip()
            or len(reviewer_id) > 128 or not isinstance(reason, str)
            or not reason.strip() or len(reason) > 2000):
        raise ValueError("Responsável e justificativa obrigatórios")
    if (not isinstance(reviewed_at, str) or len(reviewed_at) > 40
            or not reviewed_at.endswith("Z")):
        raise ValueError("Data de revisão UTC obrigatória")
    from datetime import datetime, timezone
    try:
        parsed = datetime.fromisoformat(reviewed_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Data de revisão inválida") from exc
    if parsed.tzinfo is None or parsed.utcoffset().total_seconds() != 0:
        raise ValueError("Data deve ser UTC")
    matches = [row for row in queue["rows"]
               if isinstance(row, dict) and row.get("reviewKey") == review_key]
    if len(matches) != 1:
        raise ValueError("Chave de revisão ausente ou duplicada")
    row = matches[0]
    event = {"reviewKey": review_key, "projectVersion": row.get("projectVersion"),
             "sourceSha256": row.get("sourceSha256"), "objectId": row.get("objectId"),
             "reviewerId": reviewer_id.strip(), "decision": decision,
             "reason": reason.strip(), "reviewedAt": parsed.astimezone(timezone.utc).isoformat(),
             "geometryApproved": False, "fabricationReady": False,
             "quantitiesEnabled": False}
    return {"event": event, "persisted": False,
            "requiresAuthorizedAuditStore": True}


def summarize_opening_review_history(queue, events):
    """Rebuild a read-only review view from scoped audit events, without approvals."""
    from datetime import datetime
    if not isinstance(queue, dict) or not isinstance(queue.get("rows"), list):
        raise ValueError("Fila inválida")
    if not isinstance(events, list) or len(events) > 10000:
        raise ValueError("Histórico inválido")
    keys = [r.get("reviewKey") for r in queue["rows"] if isinstance(r, dict)]
    if len(keys) != len(queue["rows"]) or len(set(keys)) != len(keys):
        raise ValueError("Identidades de revisão duplicadas")
    indexed = {key: [] for key in keys}
    for i, event in enumerate(events):
        if not isinstance(event, dict) or event.get("reviewKey") not in indexed:
            raise ValueError("Evento não pertence à revisão")
        if (event.get("projectVersion") != queue.get("projectVersion")
                or event.get("sourceSha256") != queue.get("sourceSha256")
                or event.get("decision") not in (
                    "accept_for_detailed_review", "reject_candidate", "request_information")):
            raise ValueError("Evento incompatível com versão ou decisão")
        timestamp = event.get("reviewedAt")
        try:
            parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except (AttributeError, TypeError, ValueError) as exc:
            raise ValueError("Data de evento inválida") from exc
        if parsed.tzinfo is None or parsed.utcoffset().total_seconds() != 0:
            raise ValueError("Data sem fuso UTC")
        indexed[event["reviewKey"]].append((parsed, i, event))
    result = []
    dispositions = {
        "accept_for_detailed_review": "awaiting_detailed_review",
        "reject_candidate": "rejected_candidate",
        "request_information": "waiting_for_information",
    }
    for row in queue["rows"]:
        timeline = sorted(indexed[row["reviewKey"]], key=lambda e: (e[0], e[1]))
        latest = timeline[-1][2] if timeline else None
        result.append({**row, "reviewStatus": (
            dispositions[latest["decision"]] if latest else "needs_manual_review"),
            "lastReviewerId": latest.get("reviewerId") if latest else None,
            "lastReviewedAt": latest.get("reviewedAt") if latest else None,
            "eventCount": len(timeline), "geometryApproved": False,
            "fabricationReady": False, "quantitiesEnabled": False})
    return {"rows": result, "auditEventCount": len(events),
            "persisted": False, "reviewRequired": True}


def opening_review_dashboard(review_summary):
    """Aggregate review counters for a future UI, with no fabrication approvals."""
    if not isinstance(review_summary, dict) or not isinstance(review_summary.get("rows"), list):
        raise ValueError("Resumo inválido")
    allowed = ("needs_manual_review", "awaiting_detailed_review",
               "rejected_candidate", "waiting_for_information")
    counts = {status: 0 for status in allowed}
    conflicts = 0
    for row in review_summary["rows"]:
        if not isinstance(row, dict) or row.get("reviewStatus") not in counts:
            raise ValueError("Situação de revisão desconhecida")
        counts[row["reviewStatus"]] += 1
        conflicts += int(row.get("conflict") is True)
    return {"totalCandidates": len(review_summary["rows"]),
            "conflicts": conflicts, "statuses": counts,
            "fabricationReady": False, "quantitiesEnabled": False}


def prepare_opening_review_workspace(queue, events=None, search="", status="all",
                                     conflicts_only=False, limit=100):
    """Read-only UI view model; no persistence, authorization or BIM approval."""
    if not isinstance(search, str) or len(search) > 200:
        raise ValueError("Busca inválida")
    allowed = {"all", "needs_manual_review", "awaiting_detailed_review",
               "rejected_candidate", "waiting_for_information"}
    if status not in allowed or type(conflicts_only) is not bool:
        raise ValueError("Filtro inválido")
    if type(limit) is not int or not 1 <= limit <= 200:
        raise ValueError("Limite inválido")
    summary = summarize_opening_review_history(queue, [] if events is None else events)
    counters = opening_review_dashboard(summary)
    needle = search.casefold().strip()
    records = []
    for row in summary["rows"]:
        if status != "all" and row["reviewStatus"] != status:
            continue
        if conflicts_only and not row.get("conflict"):
            continue
        if needle and not any(needle in str(row.get(field) or "").casefold()
                              for field in ("name", "objectId", "sourceObjectKey")):
            continue
        records.append(row)
    records.sort(key=lambda row: (
        0 if row.get("conflict") else 1,
        0 if row["reviewStatus"] == "needs_manual_review" else 1,
        str(row.get("name") or "").casefold(), row["reviewKey"]))
    return {"projectVersion": queue.get("projectVersion"),
            "sourceSha256": queue.get("sourceSha256"),
            "dashboard": counters, "filteredCount": len(records),
            "rows": records[:limit], "truncated": len(records) > limit,
            "readOnly": True, "requiresManualReview": True,
            "fabricationReady": False, "quantitiesEnabled": False}


def inspect_parametric_wall(wall, openings=None):
    """Geometry-first Z-up wall preview; conservative, never modifies the BIM model."""
    if not isinstance(wall, dict) or not isinstance(openings, list) or len(openings) > 500:
        raise ValueError("Parede ou aberturas inválidas")
    def point(value):
        if not isinstance(value, (list, tuple)) or len(value) != 3 or any(
                type(v) not in (int, float) or not math.isfinite(v) or abs(v) > 100000
                for v in value):
            raise ValueError("Coordenada inválida")
        return [float(v) for v in value]
    start, end = point(wall.get("start")), point(wall.get("end"))
    thickness, height = wall.get("thickness"), wall.get("height")
    if any(type(v) not in (int, float) or not math.isfinite(v) or not 0.05 <= v <= 20
           for v in (thickness, height)):
        raise ValueError("Espessura ou altura inválida")
    planar = math.hypot(end[0] - start[0], end[1] - start[1])
    if planar < 0.1 or abs(end[2] - start[2]) > 1e-6:
        raise ValueError("Parede não horizontal em planta")
    reviewed = []
    occupied = []
    for opening in openings:
        if not isinstance(opening, dict) or opening.get("kind") not in ("door", "window"):
            raise ValueError("Abertura inválida")
        offset, width, sill, opening_height = (opening.get(k) for k in ("offset", "width", "sill", "height"))
        if any(type(v) not in (int, float) or not math.isfinite(v) for v in
               (offset, width, sill, opening_height)):
            raise ValueError("Dimensões de abertura inválidas")
        if (offset < 0 or width <= 0 or sill < 0 or opening_height <= 0 or
                offset + width > planar or sill + opening_height > height):
            raise ValueError("Abertura ultrapassa parede")
        if any(offset < hi and offset + width > lo and sill < zhi and
               sill + opening_height > zlo for lo, hi, zlo, zhi in occupied):
            raise ValueError("Aberturas sobrepostas")
        occupied.append((offset, offset + width, sill, sill + opening_height))
        reviewed.append({"kind": opening["kind"], "offset": offset, "width": width,
                         "sill": sill, "height": opening_height,
                         "openingConfirmed": False})
    return {"wallLength": round(planar, 5), "thickness": thickness, "height": height,
            "openingCandidates": reviewed, "geometryApproved": False,
            "quantitiesEnabled": False, "requiresManualReview": True}


def draft_architectural_deliverables(walls):
    """Count validated draft wall inputs and flag all downstream documents for review."""
    if not isinstance(walls, list) or len(walls) > 2000:
        raise ValueError("Lista de paredes inválida")
    drafts = [inspect_parametric_wall(item.get("wall"), item.get("openings", []))
              for item in walls if isinstance(item, dict)]
    if len(drafts) != len(walls):
        raise ValueError("Item inválido")
    return {"wallCount": len(drafts),
            "openingCandidateCount": sum(len(w["openingCandidates"]) for w in drafts),
            "floorPlans": "pending_bim_geometry_validation",
            "sections": "pending_bim_geometry_validation",
            "elevations": "pending_bim_geometry_validation",
            "doorWindowSchedule": "draft_only",
            "quantityTakeoff": "disabled_pending_review",
            "fabricationReady": False, "geometryApproved": False}


def validate_professional_render_job(job):
    """Bound image/video render requests before any Blender or GPU dispatch."""
    if not isinstance(job, dict):
        raise ValueError("Job inválido")
    preset = job.get("preset", "preview")
    if preset not in RENDER_PRESETS:
        raise ValueError("Preset desconhecido")
    mode = job.get("mode", "image")
    if mode not in ("image", "video"):
        raise ValueError("Modo inválido")
    resolution, samples = resolve_render_preset({"qualityPreset": preset})
    result = {"mode": mode, "resolution": resolution, "samples": samples,
              "status": "validated_not_rendered"}
    if mode == "video":
        result["cameraPath"] = validate_camera_path(job.get("keyframes"), job.get("fps", 24))
    return result


def draft_parametric_floor_plan(walls):
    """Deterministic 2D orthogonal-offset polygons from validated Z-up walls.

    This is a draft projection, not a boolean union, solved intersection, BIM
    topology or approved construction drawing.
    """
    if not isinstance(walls, list) or len(walls) > 2000:
        raise ValueError("Lista de paredes inválida")
    result = []
    for index, entry in enumerate(walls):
        if not isinstance(entry, dict):
            raise ValueError("Parede inválida")
        wall = entry.get("wall")
        openings = entry.get("openings", [])
        review = inspect_parametric_wall(wall, openings)
        start, end = wall["start"], wall["end"]
        dx, dy = end[0] - start[0], end[1] - start[1]
        length = math.hypot(dx, dy)
        nx, ny = -dy / length * review["thickness"] / 2, dx / length * review["thickness"] / 2
        outline = [[round(x, 6), round(y, 6)] for x, y in (
            (start[0] + nx, start[1] + ny), (end[0] + nx, end[1] + ny),
            (end[0] - nx, end[1] - ny), (start[0] - nx, start[1] - ny))]
        guides = []
        for opening in review["openingCandidates"]:
            a = opening["offset"] / length
            b = (opening["offset"] + opening["width"]) / length
            guides.append({"kind": opening["kind"],
                           "segment": [[round(start[0] + dx * t, 6),
                                        round(start[1] + dy * t, 6)] for t in (a, b)],
                           "sill": opening["sill"], "height": opening["height"],
                           "geometryApproved": False})
        result.append({"wallIndex": index, "outline": outline,
                       "centerline": [[start[0], start[1]], [end[0], end[1]]],
                       "openingGuides": guides, "height": review["height"],
                       "wallLength": review["wallLength"], "approved": False})
    return {"walls": result, "coordinateSystem": "z_up_meters_unverified",
            "intersectionsResolved": False, "openingVoidsApplied": False,
            "geometryApproved": False, "requiresManualReview": True}


def draft_parametric_wall_solids(walls):
    """Create lightweight wall prisms and opening void *descriptors* from one 2D source.

    Not a watertight mesh or a CSG operation. A future kernel must resolve
    joins, boolean subtraction, topology and IFC classifications.
    """
    plan = draft_parametric_floor_plan(walls)
    solids = []
    for entry, shape in zip(walls, plan["walls"]):
        source = entry["wall"]
        z = float(source["start"][2])
        height = float(shape["height"])
        base = [[float(x), float(y), z] for x, y in shape["outline"]]
        top = [[x, y, z + height] for x, y, _ in base]
        voids = []
        start, end = source["start"], source["end"]
        dx, dy = end[0] - start[0], end[1] - start[1]
        length = math.hypot(dx, dy)
        for opening in entry.get("openings", []):
            t0 = opening["offset"] / length
            t1 = (opening["offset"] + opening["width"]) / length
            voids.append({"kind": opening["kind"],
                          "start": [round(start[0] + dx * t0, 6), round(start[1] + dy * t0, 6), z + opening["sill"]],
                          "end": [round(start[0] + dx * t1, 6), round(start[1] + dy * t1, 6),
                                  z + opening["sill"] + opening["height"]],
                          "subtracted": False})
        solids.append({"wallIndex": shape["wallIndex"], "base": base, "top": top,
                       "openingVoidDescriptors": voids, "watertight": False})
    return {"wallSolids": solids, "openingVoidsApplied": False,
            "wallJoinsResolved": False, "geometryApproved": False,
            "quantitiesEnabled": False, "requiresManualReview": True}


def draft_wall_centerline_intersections(walls, tolerance=1e-8):
    """Flag crossings and T-junctions in 2D without changing any wall geometry."""
    if type(tolerance) not in (int, float) or not math.isfinite(tolerance) or not 0 < tolerance <= 0.01:
        raise ValueError("Tolerância inválida")
    if not isinstance(walls, list) or len(walls) > 500:
        raise ValueError("Paredes inválidas ou acima do limite")
    lines = []
    for entry in walls:
        if not isinstance(entry, dict):
            raise ValueError("Parede inválida")
        inspect_parametric_wall(entry.get("wall"), entry.get("openings", []))
        start, end = entry["wall"]["start"], entry["wall"]["end"]
        lines.append(((start[0], start[1]), (end[0], end[1])))
    def cross(a, b):
        return a[0] * b[1] - a[1] * b[0]
    intersections = []
    for i, (a, b) in enumerate(lines):
        r = (b[0] - a[0], b[1] - a[1])
        for j in range(i + 1, len(lines)):
            c, d = lines[j]
            vec = (d[0] - c[0], d[1] - c[1])
            den = cross(r, vec)
            relative = (c[0] - a[0], c[1] - a[1])
            if abs(den) <= tolerance:
                # Collinear overlaps need dedicated join-resolution review.
                if abs(cross(relative, r)) <= tolerance:
                    intersections.append({"walls": [i, j], "type": "parallel_or_collinear_review"})
                continue
            t, u = cross(relative, vec) / den, cross(relative, r) / den
            if -tolerance <= t <= 1 + tolerance and -tolerance <= u <= 1 + tolerance:
                kind = "crossing" if tolerance < t < 1 - tolerance and tolerance < u < 1 - tolerance else "junction"
                intersections.append({"walls": [i, j], "type": kind,
                                      "point": [round(a[0] + r[0] * t, 6),
                                                round(a[1] + r[1] * t, 6)]})
    return {"intersections": intersections[:10000],
            "joinsResolved": False, "geometryApproved": False}
