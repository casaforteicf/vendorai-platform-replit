"""Union of axis-aligned wall solids using an exact coordinate-partition boundary.

Supports overlapping L, T and cross junctions and rectangular through-openings
without a third-party CSG kernel. Not suitable for diagonal/curved walls, and
not an approved BIM or manufacturing geometry.
"""
import math
from arqdor_feature_contracts import inspect_parametric_wall


def union_orthogonal_walls(entries, tolerance=1e-8):
    if not isinstance(entries, list) or not 1 <= len(entries) <= 80:
        raise ValueError("Projeto deve conter entre 1 e 80 paredes")
    if not isinstance(tolerance, (int, float)) or not 0 < tolerance <= 1e-5:
        raise ValueError("Tolerância inválida")
    solids, apertures = [], []
    for i, entry in enumerate(entries):
        if not isinstance(entry, dict):
            raise ValueError("Parede inválida")
        wall, openings = entry.get("wall"), entry.get("openings", [])
        inspect_parametric_wall(wall, openings)
        a, b = wall["start"], wall["end"]
        if abs(a[2] - b[2]) > tolerance:
            raise ValueError("Parede inclinada verticalmente não suportada")
        dx, dy = b[0] - a[0], b[1] - a[1]
        if abs(dx) > tolerance and abs(dy) > tolerance:
            raise ValueError("Paredes diagonais não suportadas por este núcleo")
        horizontal = abs(dx) > tolerance
        axis = 0 if horizontal else 1
        length = abs(dx if horizontal else dy)
        thickness = wall["thickness"]
        if horizontal:
            footprint = (min(a[0], b[0]), max(a[0], b[0]),
                         a[1] - thickness / 2, a[1] + thickness / 2)
        else:
            footprint = (a[0] - thickness / 2, a[0] + thickness / 2,
                         min(a[1], b[1]), max(a[1], b[1]))
        box = (*footprint, a[2], a[2] + wall["height"])
        solids.append(box)
        voids = []
        for opening in openings:
            start = opening["offset"]
            end = start + opening["width"]
            origin = a[axis]
            sign = 1 if b[axis] >= a[axis] else -1
            lower, upper = sorted((origin + sign * start, origin + sign * end))
            if horizontal:
                void = (lower, upper, footprint[2], footprint[3],
                        a[2] + opening["sill"], a[2] + opening["sill"] + opening["height"])
            else:
                void = (footprint[0], footprint[1], lower, upper,
                        a[2] + opening["sill"], a[2] + opening["sill"] + opening["height"])
            voids.append(void)
        apertures.append(voids)

    xs = sorted({x for box in solids for x in box[:2]} |
                {x for voids in apertures for box in voids for x in box[:2]})
    ys = sorted({y for box in solids for y in box[2:4]} |
                {y for voids in apertures for box in voids for y in box[2:4]})
    zs = sorted({z for box in solids for z in box[4:]} |
                {z for voids in apertures for box in voids for z in box[4:]})
    if (len(xs) - 1) * (len(ys) - 1) * (len(zs) - 1) > 240000:
        raise ValueError("Geometria excede limite de células")
    def inside(box, x, y, z):
        return box[0] < x < box[1] and box[2] < y < box[3] and box[4] < z < box[5]
    filled = set()
    for i in range(len(xs) - 1):
        x = (xs[i] + xs[i + 1]) / 2
        for j in range(len(ys) - 1):
            y = (ys[j] + ys[j + 1]) / 2
            for k in range(len(zs) - 1):
                z = (zs[k] + zs[k + 1]) / 2
                if any(inside(box, x, y, z) and
                       not any(inside(void, x, y, z) for void in apertures[n])
                       for n, box in enumerate(solids)):
                    filled.add((i, j, k))
    vertices, faces, indexed = [], [], {}
    def vert(x, y, z):
        key = (round(x, 9), round(y, 9), round(z, 9))
        if key not in indexed:
            indexed[key] = len(vertices)
            vertices.append(list(key))
        return indexed[key]
    def face(points):
        faces.append([vert(*point) for point in points])
    for i, j, k in sorted(filled):
        x0, x1 = xs[i:i+2]
        y0, y1 = ys[j:j+2]
        z0, z1 = zs[k:k+2]
        # Every cell uses the same global grid, preventing T-junction edges.
        if (i - 1, j, k) not in filled:
            face([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)])
        if (i + 1, j, k) not in filled:
            face([(x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1)])
        if (i, j - 1, k) not in filled:
            face([(x0, y0, z1), (x0, y0, z0), (x1, y0, z0), (x1, y0, z1)])
        if (i, j + 1, k) not in filled:
            face([(x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0)])
        if (i, j, k - 1) not in filled:
            face([(x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)])
        if (i, j, k + 1) not in filled:
            face([(x0, y1, z1), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1)])
    return {"vertices": vertices, "faces": faces,
            "solidUnionMethod": "orthogonal_coordinate_partition",
            "internalFacesRemoved": True, "openingCount": sum(map(len, apertures)),
            "occupiedCells": len(filled), "geometryApproved": False,
            "quantitiesEnabled": False, "requiresManualReview": True}
