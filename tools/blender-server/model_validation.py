"""Pure validation rules shared by the model inspection and render worker."""
import hashlib
import math
from pathlib import Path


FORMATS = {".glb"}  # Embedded resources only until converters are benchmarked.


def positive_number(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label}: número positivo obrigatório")
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"{label}: número finito positivo obrigatório")
    return float(value)


def resolve_model(model, root):
    """Accept only files inside a configured, tenant-scoped staging directory."""
    if not isinstance(model, dict):
        raise ValueError("model deve ser um objeto")
    tenant = model.get("tenantId", "")
    import re
    if not isinstance(tenant, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", tenant):
        raise ValueError("tenantId inválido")
    key = model.get("key")
    if not isinstance(key, str) or not key or Path(key).is_absolute():
        raise ValueError("key deve ser relativa ao diretório do tenant")
    tenant_root = Path(root).resolve() / tenant
    # Reject symlinked tenant roots too, not just symlinked files.
    if tenant_root.resolve() != tenant_root:
        raise ValueError("Diretório do tenant não pode ser um link")
    path = (tenant_root / key).resolve()
    if not path.is_relative_to(tenant_root):
        raise ValueError("Modelo fora do diretório do tenant")
    if path.suffix.lower() not in FORMATS:
        raise ValueError("Formato não habilitado. Use GLB com recursos incorporados.")
    if not path.is_file():
        raise ValueError("Modelo não encontrado")
    return path


def fingerprint(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def scale_factor(calibration):
    if not isinstance(calibration, dict):
        raise ValueError("Calibração de escala obrigatória")
    measured = positive_number(calibration.get("measuredDistance"), "Distância no modelo")
    actual = positive_number(calibration.get("actualMeters"), "Distância real em metros")
    return positive_number(actual / measured, "Fator de escala")


def check_dimensions(dimensions, expected, tolerance=0.01):
    """Independent dimension checks do not prove topology or geometric fidelity."""
    if not isinstance(expected, dict):
        raise ValueError("Informe largura, profundidade e altura de referência")
    tolerance = positive_number(tolerance, "Tolerância")
    if tolerance > 0.05:
        raise ValueError("Tolerância máxima: 5%")
    checks = []
    for axis, observed in zip(("width", "depth", "height"), dimensions, strict=True):
        observed = positive_number(observed, axis)
        reference = positive_number(expected.get(axis), f"Referência {axis}")
        error = abs(observed - reference) / reference
        checks.append({"axis": axis, "meters": observed, "referenceMeters": reference,
                       "relativeError": error, "passed": error <= tolerance})
    return {"checks": checks, "passed": all(c["passed"] for c in checks),
            "tolerance": tolerance, "geometryStatus": "requires_review",
            "quantitiesEnabled": False}
