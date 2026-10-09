"""Draft watertight single-wall surface meshes with true rectangular openings.

Local axes: X along wall, Y across thickness, Z vertical. No cross-wall CSG.
"""
import math

from arqdor_feature_contracts import inspect_parametric_wall, draft_wall_centerline_intersections


def mesh_parametric_wall(wall, openings=None):
    openings = [] if openings is None else openings
    review = inspect_parametric_wall(wall, openings)
    start, end = wall["start"], wall["end"]
    length = math.hypot(end[0] - start[0], end[1] - start[1])
    xvals = sorted({0.0, length, *(float(o["offset"]) for o in openings),
                    *(float(o["offset"] + o["width"]) for o in openings)})
    zvals = sorted({0.0, float(wall["height"]), *(float(o["sill"]) for o in openings),
                    *(float(o["sill"] + o["height"]) for o in openings)})
    if len(xvals) * len(zvals) > 250000:
        raise ValueError("Parede excede limite de subdivisões")
    cells = set()
    for i in range(len(xvals) - 1):
        for j in range(len(zvals) - 1):
            x, z = (xvals[i] + xvals[i + 1]) / 2, (zvals[j] + zvals[j + 1]) / 2
            if not any(o["offset"] < x < o["offset"] + o["width"] and
                       o["sill"] < z < o["sill"] + o["height"] for o in openings):
                cells.add((i, j))
    ux, uy = (end[0] - start[0]) / length, (end[1] - start[1]) / length
    nx, ny = -uy, ux
    vertices, faces, lookup = [], [], {}
    def vertex(x, side, z):
        key = (round(x, 8), side, round(z, 8))
        if key not in lookup:
            px = start[0] + ux * x + nx * side * wall["thickness"] / 2
            py = start[1] + uy * x + ny * side * wall["thickness"] / 2
            lookup[key] = len(vertices)
            vertices.append([round(px, 8), round(py, 8), round(start[2] + z, 8)])
        return lookup[key]
    for i, j in sorted(cells):
        a, b, lo, hi = xvals[i], xvals[i + 1], zvals[j], zvals[j + 1]
        # Opposed wall faces subdivided consistently. Side/top/bottom reveal faces
        # exist only at the boundary with air, including the opening reveal.
        for side in (-1, 1):
            quad = [(a, side, lo), (b, side, lo), (b, side, hi), (a, side, hi)]
            if side == 1:
                quad.reverse()
            faces.append([vertex(*p) for p in quad])
        if (i - 1, j) not in cells:
            faces.append([vertex(a, -1, lo), vertex(a, -1, hi),
                          vertex(a, 1, hi), vertex(a, 1, lo)])
        if (i + 1, j) not in cells:
            faces.append([vertex(b, -1, hi), vertex(b, -1, lo),
                          vertex(b, 1, lo), vertex(b, 1, hi)])
        if (i, j - 1) not in cells:
            faces.append([vertex(a, 1, lo), vertex(b, 1, lo),
                          vertex(b, -1, lo), vertex(a, -1, lo)])
        if (i, j + 1) not in cells:
            faces.append([vertex(b, 1, hi), vertex(a, 1, hi),
                          vertex(a, -1, hi), vertex(b, -1, hi)])
    topology = inspect_mesh_edges({"vertices": vertices, "faces": faces})
    return {"vertices": vertices, "faces": faces, "topology": topology,
            "openingCount": len(openings), "localWallClosedSurface": topology["watertightByEdgeIncidence"],
            "crossWallJoinsResolved": False, "manufacturingApproved": False,
            "quantitiesEnabled": False, "geometryApproved": False,
            "requiresManualReview": True}



def inspect_mesh_edges(mesh):
    """Check exact indexed mesh incidence and orientation, not just visual closure."""
    vertices, faces = mesh.get("vertices"), mesh.get("faces")
    if not isinstance(vertices, list) or not isinstance(faces, list):
        raise ValueError("Malha inválida")
    edges = {}
    for face in faces:
        if not isinstance(face, list) or len(face) < 3 or len(set(face)) != len(face):
            raise ValueError("Face degenerada")
        if any(type(v) is not int or v < 0 or v >= len(vertices) for v in face):
            raise ValueError("Índice de vértice inválido")
        for a, b in zip(face, face[1:] + face[:1]):
            key = (min(a, b), max(a, b))
            count, balance = edges.get(key, (0, 0))
            edges[key] = (count + 1, balance + (1 if a < b else -1))
    boundaries = sum(count == 1 for count, _ in edges.values())
    nonmanifold = sum(count > 2 for count, _ in edges.values())
    orientation_errors = sum(count == 2 and balance != 0 for count, balance in edges.values())
    return {"boundaryEdges": boundaries, "nonmanifoldEdges": nonmanifold,
            "orientationErrors": orientation_errors, "watertightByEdgeIncidence":
            bool(faces) and boundaries == 0 and nonmanifold == 0 and orientation_errors == 0}



def mesh_parametric_project(walls):
    if not isinstance(walls, list) or len(walls) > 500:
        raise ValueError("Número de paredes inválido")
    joins = draft_wall_centerline_intersections(walls)
    meshes = [mesh_parametric_wall(e["wall"], e.get("openings", [])) for e in walls]
    return {"wallMeshes": meshes, "joinCandidates": joins["intersections"],
            "joinsResolved": not bool(joins["intersections"]),
            "globalWatertight": False, "geometryApproved": False,
            "quantitiesEnabled": False}


def merge_collinear_end_to_end_walls(walls, tolerance=1e-6):
    """Resolve safe collinear endpoint joins by replacing two runs with one.

    Orthogonal L/T/cross joins and intersections near openings are intentionally
    not altered; they need robust solid union rather than snapping centerlines.
    """
    if not isinstance(walls, list) or len(walls) > 500:
        raise ValueError("Paredes inválidas")
    if type(tolerance) not in (int, float) or not math.isfinite(tolerance) or not 0 < tolerance <= .001:
        raise ValueError("Tolerância inválida")
    result = []
    for entry in walls:
        if not isinstance(entry, dict):
            raise ValueError("Parede inválida")
        inspect_parametric_wall(entry.get("wall"), entry.get("openings", []))
        result.append({"wall": {**entry["wall"]}, "openings": [dict(o) for o in entry.get("openings", [])]})
    merged_pairs = []
    changed = True
    while changed:
        changed = False
        for i in range(len(result)):
            if changed:
                break
            for j in range(len(result)):
                if i == j:
                    continue
                left, right = result[i], result[j]
                a, b = left["wall"]["start"], left["wall"]["end"]
                c, d = right["wall"]["start"], right["wall"]["end"]
                if math.dist(b, c) > tolerance:
                    continue
                dx, dy = b[0] - a[0], b[1] - a[1]
                ex, ey = d[0] - c[0], d[1] - c[1]
                if (abs(dx * ey - dy * ex) > tolerance * max(1, math.hypot(dx, dy), math.hypot(ex, ey))
                        or dx * ex + dy * ey <= 0):
                    continue
                if any(abs(left["wall"][field] - right["wall"][field]) > tolerance
                       for field in ("height", "thickness")):
                    continue
                left_len = math.hypot(dx, dy)
                merged = {"wall": {**left["wall"], "end": list(d)},
                          "openings": left["openings"] + [
                              {**opening, "offset": opening["offset"] + left_len}
                              for opening in right["openings"]]}
                inspect_parametric_wall(merged["wall"], merged["openings"])
                merged_pairs.append([i, j])
                result = [v for k, v in enumerate(result) if k not in (i, j)] + [merged]
                changed = True
                break
    return {"walls": result, "collinearPairsMerged": len(merged_pairs),
            "nonCollinearJoinsResolved": False, "geometryApproved": False}
