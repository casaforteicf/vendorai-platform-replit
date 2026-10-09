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
            if side == -1:
                quad.reverse()
            faces.append([vertex(*p) for p in quad])
        if (i - 1, j) not in cells:
            faces.append([vertex(a, -1, lo), vertex(a, -1, hi),
                          vertex(a, 1, hi), vertex(a, 1, lo)])
        if (i + 1, j) not in cells:
            faces.append([vertex(b, -1, hi), vertex(b, -1, lo),
                          vertex(b, 1, lo), vertex(b, 1, hi)])
        if (i, j - 1) not in cells:
            faces.append([vertex(a, -1, lo), vertex(b, -1, lo),
                          vertex(b, 1, lo), vertex(a, 1, lo)])
        if (i, j + 1) not in cells:
            faces.append([vertex(b, -1, hi), vertex(a, -1, hi),
                          vertex(a, 1, hi), vertex(b, 1, hi)])
    return {"vertices": vertices, "faces": faces,
            "openingCount": len(openings), "localWallClosedSurface": True,
            "crossWallJoinsResolved": False, "manufacturingApproved": False,
            "quantitiesEnabled": False, "geometryApproved": False,
            "requiresManualReview": True}


def mesh_parametric_project(walls):
    if not isinstance(walls, list) or len(walls) > 500:
        raise ValueError("Número de paredes inválido")
    joins = draft_wall_centerline_intersections(walls)
    meshes = [mesh_parametric_wall(e["wall"], e.get("openings", [])) for e in walls]
    return {"wallMeshes": meshes, "joinCandidates": joins["intersections"],
            "joinsResolved": not bool(joins["intersections"]),
            "globalWatertight": False, "geometryApproved": False,
            "quantitiesEnabled": False}
