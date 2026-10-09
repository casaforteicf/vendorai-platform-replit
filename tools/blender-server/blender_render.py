"""
blender_render.py
Script Python executado DENTRO do Blender em modo headless:
    /opt/blender/blender --background --python blender_render.py

Lê o sceneConfig de os.environ['SCENE_CONFIG_PATH'] (arquivo JSON temporário).
Salva o render PNG em os.environ['OUTPUT_PATH'].

sceneConfig esperado:
{
  "resolution": [1920, 1080],
  "samples": 64,
  "hdri": "interior_warm" | "interior_cool" | "natural",
  "hdriStrength": 1.0,
  "room": {
    "width": 6.0, "depth": 6.0, "height": 2.8,
    "wallColor": [0.9, 0.9, 0.9],
    "floorColor": [0.6, 0.5, 0.4],
    "floorRoughness": 0.7,
    "floorMetallic": 0.0
  },
  "camera": {
    "location": [0, -5, 1.6],
    "target":   [0, 0, 1.0],
    "fov": 60
  },
  "objects": [
    {
      "type": "sofa",
      "name": "Sofá Principal",
      "location": [0, 1, 0],
      "rotation": [0, 0, 0],
      "scale": [1, 1, 1],
      "color": [0.3, 0.25, 0.2],
      "metallic": 0.0,
      "roughness": 0.8
    }
  ]
}

Tipos de objeto suportados:
  sofa, mesa, cadeira, cama, armario, luminaria, janela, porta
"""

import bpy
import os
import sys
import json
import math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from imported_model import import_model


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def load_config() -> dict:
    path = os.environ.get("SCENE_CONFIG_PATH", "")
    if not path or not os.path.exists(path):
        print(f"ERRO: SCENE_CONFIG_PATH não definido ou arquivo não encontrado: {path}")
        sys.exit(1)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def output_path() -> str:
    path = os.environ.get("OUTPUT_PATH", "/tmp/render_output.png")
    os.makedirs(os.path.dirname(path) or "/tmp", exist_ok=True)
    return path


def deg2rad(d):
    return math.radians(d)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in [bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras]:
        for item in list(block):
            block.remove(item)


def new_material(name: str, color=(0.8, 0.8, 0.8), metallic=0.0, roughness=0.5,
                 emission=(0, 0, 0), emission_strength=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.blend_method = "OPAQUE" if alpha >= 1.0 else "BLEND"
    tree = mat.node_tree
    tree.nodes.clear()

    out  = tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
    out.location  = (300, 0)
    bsdf.location = (0, 0)

    r, g, b = color
    bsdf.inputs["Base Color"].default_value    = (r, g, b, alpha)
    bsdf.inputs["Metallic"].default_value      = metallic
    bsdf.inputs["Roughness"].default_value     = roughness
    bsdf.inputs["Alpha"].default_value         = alpha

    if any(v > 0 for v in emission):
        er, eg, eb = emission
        bsdf.inputs["Emission"].default_value         = (er, eg, eb, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength

    tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def assign_material(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


# ─────────────────────────────────────────────────────────────────────────────
# Ambiente (paredes / piso / teto)
# ─────────────────────────────────────────────────────────────────────────────

def build_room(room: dict):
    W  = float(room.get("width",  6.0))
    D  = float(room.get("depth",  6.0))
    H  = float(room.get("height", 2.8))
    wc = room.get("wallColor",  [0.92, 0.92, 0.92])
    fc = room.get("floorColor", [0.55, 0.45, 0.35])
    fr = float(room.get("floorRoughness", 0.75))
    fm = float(room.get("floorMetallic",  0.0))

    mat_wall  = new_material("mat_wall",  color=wc,                        roughness=0.9)
    mat_floor = new_material("mat_floor", color=fc, metallic=fm,           roughness=fr)
    mat_ceil  = new_material("mat_ceil",  color=[0.98, 0.98, 0.98],        roughness=0.95)

    hw = W / 2
    hd = D / 2

    def add_plane(name, loc, rot, sx, sy, mat):
        bpy.ops.mesh.primitive_plane_add(size=1, location=loc)
        obj = bpy.context.active_object
        obj.name = name
        obj.rotation_euler = [deg2rad(r) for r in rot]
        obj.scale = (sx, sy, 1)
        assign_material(obj, mat)
        return obj

    # Piso
    add_plane("Piso",  (0, 0, 0),      (0,   0, 0),   W, D, mat_floor)
    # Teto
    add_plane("Teto",  (0, 0, H),      (180, 0, 0),   W, D, mat_ceil)
    # Parede fundo (Y+)
    add_plane("Parede_Fundo", (0, hd, H/2), (90, 0, 0),    W, H, mat_wall)
    # Parede frente (Y-) — câmera passa por ela; sem teto para não bloquear
    # Parede esquerda (X-)
    add_plane("Parede_Esq",   (-hw, 0, H/2), (90, 0, 90), D, H, mat_wall)
    # Parede direita (X+)
    add_plane("Parede_Dir",   (hw,  0, H/2), (90, 0, -90), D, H, mat_wall)


# ─────────────────────────────────────────────────────────────────────────────
# Objetos por tipo de produto
# ─────────────────────────────────────────────────────────────────────────────

def add_object(spec: dict):
    obj_type  = str(spec.get("type", "cube")).lower()
    name      = spec.get("name", obj_type)
    loc       = spec.get("location", [0, 0, 0])
    rot_deg   = spec.get("rotation", [0, 0, 0])
    scale     = spec.get("scale",    [1, 1, 1])
    color     = spec.get("color",    [0.8, 0.8, 0.8])
    metallic  = float(spec.get("metallic",  0.0))
    roughness = float(spec.get("roughness", 0.5))

    mat = new_material(f"mat_{name}", color=color, metallic=metallic, roughness=roughness)

    parts = []  # lista de objetos criados para este item

    # ── Sofa ─────────────────────────────────────
    if obj_type == "sofa":
        # Base
        bpy.ops.mesh.primitive_cube_add(size=1, location=(loc[0], loc[1], loc[2] + 0.25))
        base = bpy.context.active_object
        base.name = f"{name}_base"
        base.scale = (scale[0] * 2.0, scale[1] * 0.9, scale[2] * 0.5)
        assign_material(base, mat)
        parts.append(base)
        # Encosto
        bpy.ops.mesh.primitive_cube_add(size=1, location=(loc[0], loc[1] + scale[1] * 0.4, loc[2] + 0.7))
        back = bpy.context.active_object
        back.name = f"{name}_back"
        back.scale = (scale[0] * 2.0, scale[1] * 0.2, scale[2] * 0.7)
        assign_material(back, mat)
        parts.append(back)
        # Braços
        for dx in [-1, 1]:
            bpy.ops.mesh.primitive_cube_add(size=1, location=(
                loc[0] + dx * scale[0] * 1.05, loc[1], loc[2] + 0.45))
            arm = bpy.context.active_object
            arm.name = f"{name}_arm_{dx}"
            arm.scale = (scale[0] * 0.12, scale[1] * 0.9, scale[2] * 0.4)
            assign_material(arm, mat)
            parts.append(arm)

    # ── Mesa ─────────────────────────────────────
    elif obj_type == "mesa":
        h   = scale[2] * 0.75
        top_t = 0.05
        # Tampo
        bpy.ops.mesh.primitive_cube_add(size=1, location=(loc[0], loc[1], loc[2] + h))
        top = bpy.context.active_object
        top.name = f"{name}_tampo"
        top.scale = (scale[0] * 1.0, scale[1] * 0.6, top_t)
        assign_material(top, mat)
        parts.append(top)
        # Pernas
        for dx in [-0.45, 0.45]:
            for dy in [-0.25, 0.25]:
                bpy.ops.mesh.primitive_cube_add(size=1, location=(
                    loc[0] + dx * scale[0], loc[1] + dy * scale[1], loc[2] + h / 2))
                leg = bpy.context.active_object
                leg.name = f"{name}_leg"
                leg.scale = (0.03, 0.03, h / 2)
                assign_material(leg, mat)
                parts.append(leg)

    # ── Cadeira ──────────────────────────────────
    elif obj_type == "cadeira":
        seat_h = scale[2] * 0.45
        # Assento
        bpy.ops.mesh.primitive_cube_add(size=1, location=(loc[0], loc[1], loc[2] + seat_h))
        seat = bpy.context.active_object
        seat.name = f"{name}_assento"
        seat.scale = (scale[0] * 0.45, scale[1] * 0.45, 0.05)
        assign_material(seat, mat)
        parts.append(seat)
        # Encosto
        bpy.ops.mesh.primitive_cube_add(size=1, location=(loc[0], loc[1] + 0.2, loc[2] + seat_h + 0.3))
        back = bpy.context.active_object
        back.name = f"{name}_encosto"
        back.scale = (scale[0] * 0.45, 0.04, 0.3)
        assign_material(back, mat)
        parts.append(back)
        # Pernas
        for dx in [-0.2, 0.2]:
            for dy in [-0.2, 0.2]:
                bpy.ops.mesh.primitive_cube_add(size=1, location=(
                    loc[0] + dx, loc[1] + dy, loc[2] + seat_h / 2))
                leg = bpy.context.active_object
                leg.name = f"{name}_leg"
                leg.scale = (0.025, 0.025, seat_h / 2)
                assign_material(leg, mat)
                parts.append(leg)

    # ── Cama ─────────────────────────────────────
    elif obj_type == "cama":
        # Base/estrado
        bpy.ops.mesh.primitive_cube_add(size=1, location=(loc[0], loc[1], loc[2] + 0.2))
        base = bpy.context.active_object
        base.name = f"{name}_base"
        base.scale = (scale[0] * 1.0, scale[1] * 2.0, 0.2)
        assign_material(base, mat)
        parts.append(base)
        # Colchão
        mat_mattress = new_material(f"mat_{name}_col", color=[0.95, 0.95, 0.95], roughness=0.9)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(loc[0], loc[1], loc[2] + 0.45))
        mattress = bpy.context.active_object
        mattress.name = f"{name}_colchao"
        mattress.scale = (scale[0] * 0.95, scale[1] * 1.9, 0.15)
        assign_material(mattress, mat_mattress)
        parts.append(mattress)
        # Cabeceira
        bpy.ops.mesh.primitive_cube_add(size=1, location=(loc[0], loc[1] - scale[1] * 1.05, loc[2] + 0.7))
        head = bpy.context.active_object
        head.name = f"{name}_cabeceira"
        head.scale = (scale[0] * 1.0, 0.08, 0.55)
        assign_material(head, mat)
        parts.append(head)

    # ── Armário ──────────────────────────────────
    elif obj_type == "armario":
        bpy.ops.mesh.primitive_cube_add(size=1, location=(loc[0], loc[1], loc[2] + scale[2] * 1.0))
        body = bpy.context.active_object
        body.name = f"{name}_corpo"
        body.scale = (scale[0] * 1.0, scale[1] * 0.5, scale[2] * 1.0)
        assign_material(body, mat)
        parts.append(body)
        # Portas (2)
        mat_door = new_material(f"mat_{name}_door",
                                color=[c * 0.85 for c in color],
                                metallic=metallic, roughness=roughness * 0.8)
        for dx in [-0.25, 0.25]:
            bpy.ops.mesh.primitive_cube_add(size=1, location=(
                loc[0] + dx * scale[0], loc[1] - scale[1] * 0.26, loc[2] + scale[2]))
            door = bpy.context.active_object
            door.name = f"{name}_porta"
            door.scale = (scale[0] * 0.48, 0.02, scale[2] * 0.95)
            assign_material(door, mat_door)
            parts.append(door)

    # ── Luminária ────────────────────────────────
    elif obj_type == "luminaria":
        # Haste
        bpy.ops.mesh.primitive_cylinder_add(radius=0.03, depth=1.0,
                                             location=(loc[0], loc[1], loc[2] + 0.5))
        pole = bpy.context.active_object
        pole.name = f"{name}_haste"
        assign_material(pole, mat)
        parts.append(pole)
        # Cúpula (esfera achatada)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.2, location=(loc[0], loc[1], loc[2] + 1.05))
        shade = bpy.context.active_object
        shade.name = f"{name}_cupula"
        shade.scale = (1, 1, 0.5)
        mat_shade = new_material(f"mat_{name}_shade",
                                 color=[0.9, 0.8, 0.6],
                                 emission=[1.0, 0.9, 0.7], emission_strength=3.0)
        assign_material(shade, mat_shade)
        parts.append(shade)
        # Ponto de luz
        bpy.ops.object.light_add(type="POINT", location=(loc[0], loc[1], loc[2] + 1.0))
        light = bpy.context.active_object
        light.name = f"{name}_luz"
        light.data.energy = 200
        light.data.color  = (1.0, 0.95, 0.8)
        parts.append(light)

    # ── Janela ───────────────────────────────────
    elif obj_type == "janela":
        # Marco
        mat_frame = new_material(f"mat_{name}_frame", color=[0.9, 0.9, 0.85], roughness=0.6)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(loc[0], loc[1], loc[2] + 1.0))
        frame = bpy.context.active_object
        frame.name = f"{name}_marco"
        frame.scale = (scale[0] * 0.8, 0.05, scale[2] * 0.6)
        assign_material(frame, mat_frame)
        parts.append(frame)
        # Vidro
        mat_glass = new_material(f"mat_{name}_glass",
                                 color=[0.7, 0.85, 0.95], metallic=0.0,
                                 roughness=0.0, alpha=0.25)
        mat_glass.blend_method = "BLEND"
        bpy.ops.mesh.primitive_cube_add(size=1, location=(loc[0], loc[1] + 0.01, loc[2] + 1.0))
        glass = bpy.context.active_object
        glass.name = f"{name}_vidro"
        glass.scale = (scale[0] * 0.75, 0.01, scale[2] * 0.55)
        assign_material(glass, mat_glass)
        parts.append(glass)

    # ── Porta ────────────────────────────────────
    elif obj_type == "porta":
        bpy.ops.mesh.primitive_cube_add(size=1, location=(loc[0], loc[1], loc[2] + 1.05))
        door = bpy.context.active_object
        door.name = f"{name}_folha"
        door.scale = (scale[0] * 0.45, 0.04, 1.05)
        assign_material(door, mat)
        parts.append(door)
        # Maçaneta
        mat_handle = new_material(f"mat_{name}_handle",
                                  color=[0.8, 0.7, 0.3], metallic=0.9, roughness=0.2)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.03,
                                              location=(loc[0] + scale[0] * 0.38,
                                                        loc[1] - 0.06, loc[2] + 1.0))
        handle = bpy.context.active_object
        handle.name = f"{name}_maceta"
        assign_material(handle, mat_handle)
        parts.append(handle)

    # ── Fallback ─────────────────────────────────
    else:
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
        obj = bpy.context.active_object
        obj.name = name
        obj.scale = tuple(scale)
        assign_material(obj, mat)
        parts.append(obj)

    # Aplica rotação ao primeiro objeto (corpo principal)
    if parts:
        rot_rad = [deg2rad(r) for r in rot_deg]
        parts[0].rotation_euler = rot_rad


# ─────────────────────────────────────────────────────────────────────────────
# Câmera
# ─────────────────────────────────────────────────────────────────────────────

def setup_camera(cam_cfg: dict):
    loc    = cam_cfg.get("location", [0, -5, 1.6])
    target = cam_cfg.get("target",   [0, 0, 1.0])
    fov    = float(cam_cfg.get("fov", 60))

    bpy.ops.object.camera_add(location=loc)
    cam_obj = bpy.context.active_object
    cam_obj.name = "Camera"
    bpy.context.scene.camera = cam_obj

    cam_obj.data.angle = math.radians(fov)

    # Aponta câmera para o target via Track To
    bpy.ops.object.empty_add(location=target)
    empty = bpy.context.active_object
    empty.name = "CameraTarget"

    constraint = cam_obj.constraints.new("TRACK_TO")
    constraint.target    = empty
    constraint.track_axis  = "TRACK_NEGATIVE_Z"
    constraint.up_axis     = "UP_Y"


# ─────────────────────────────────────────────────────────────────────────────
# Iluminação HDRI via World nodes
# ─────────────────────────────────────────────────────────────────────────────

HDRI_MAP = {
    "interior_warm": "interior_warm.hdr",
    "interior_cool": "interior_cool.hdr",
    "natural":       "natural.hdr",
}
HDRI_DIR = "/opt/blender/hdri"


def setup_hdri(hdri_key: str, strength: float = 1.0):
    filename = HDRI_MAP.get(hdri_key, "interior_warm.hdr")
    hdri_path = os.path.join(HDRI_DIR, filename)

    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    tree = world.node_tree
    tree.nodes.clear()

    out   = tree.nodes.new("ShaderNodeOutputWorld")
    bg    = tree.nodes.new("ShaderNodeBackground")
    out.location = (300, 0)
    bg.location  = (0, 0)

    if os.path.exists(hdri_path):
        env  = tree.nodes.new("ShaderNodeTexEnvironment")
        env.location = (-300, 0)
        env.image = bpy.data.images.load(hdri_path)

        mapping = tree.nodes.new("ShaderNodeMapping")
        coord   = tree.nodes.new("ShaderNodeTexCoord")
        mapping.location = (-600, 0)
        coord.location   = (-900, 0)

        tree.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
        tree.links.new(mapping.outputs["Vector"],  env.inputs["Vector"])
        tree.links.new(env.outputs["Color"],       bg.inputs["Color"])
    else:
        # Fallback: céu neutro branco-quente
        bg.inputs["Color"].default_value = (0.9, 0.9, 1.0, 1.0)

    bg.inputs["Strength"].default_value = strength
    tree.links.new(bg.outputs["Background"], out.inputs["Surface"])



def apply_imported_scene_settings(settings, material_mapping=None):
    """Apply explicitly supplied preview settings; never change geometry."""
    if not isinstance(settings, dict):
        return
    sunlight = settings.get("sunlight")
    if isinstance(sunlight, (int, float)) and math.isfinite(sunlight) and 0 <= sunlight <= 4:
        bpy.ops.object.light_add(type="SUN", location=(0, 0, 20))
        sun = bpy.context.object
        sun.name = "Arqdor_Preview_Sun"
        sun.data.energy = sunlight
        sun.rotation_euler = (math.radians(35), math.radians(-20), math.radians(25))
    # Saved WebGL cameras use Y-up, whereas Blender uses Z-up.
    # Convert coordinates explicitly; never silently use the wrong axes.
    cameras = settings.get("cameras", [])
    if isinstance(cameras, list) and cameras:
        camera = cameras[0]
        position, target = camera.get("position"), camera.get("target")
        if (isinstance(position, list) and isinstance(target, list)
                and len(position) == len(target) == 3
                and all(isinstance(v, (int, float)) and math.isfinite(v)
                        for v in position + target)):
            convert = lambda p: [p[0], -p[2], p[1]]
            setup_camera({"location": convert(position), "target": convert(target), "fov": 50})
    overrides = settings.get("materials", {})
    if overrides:
        mapping = material_mapping or {}
        if not isinstance(overrides, dict):
            raise ValueError("Substituições de materiais inválidas")
        for key, color in overrides.items():
            name = mapping.get(key)
            if not name:
                raise ValueError(f"Material sem correspondência inequívoca: {key}")
            if not isinstance(color, str) or len(color) != 7 or color[0] != "#":
                raise ValueError("Cor de material inválida")
            try:
                rgb = [int(color[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
            except ValueError as error:
                raise ValueError("Cor hexadecimal inválida") from error
            material = bpy.data.materials.get(name)
            if not material or not material.use_nodes:
                raise ValueError(f"Material não encontrado no Blender: {name}")
            principled = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
            if principled is None:
                raise ValueError(f"Material sem shader compatível: {name}")
            principled.inputs["Base Color"].default_value = (*rgb, 1.0)
            material.diffuse_color = (*rgb, 1.0)

# ─────────────────────────────────────────────────────────────────────────────
# Render settings
# ─────────────────────────────────────────────────────────────────────────────

def resolve_render_preset(config):
    """Resolve explicit quality modes while bounding render workload."""
    profiles = {
        "preview": ([960, 540], 16),
        "full_hd": ([1920, 1080], 64),
        "4k": ([3840, 2160], 256),
        "print": ([5760, 3240], 512),
    }
    preset = config.get("qualityPreset")
    if preset is None:
        return config.get("resolution") or [1920, 1080], config.get("samples") or 64
    if preset not in profiles:
        raise ValueError("Preset de render desconhecido")
    resolution, samples = profiles[preset]
    return config.get("resolution") or resolution, config.get("samples") or samples


def configure_postproduction(config):
    """Non-destructive color management applied only to the render output."""
    post = config.get("postproduction", {})
    if not isinstance(post, dict):
        raise ValueError("Pós-produção inválida")
    exposure = post.get("exposure", 0)
    gamma = post.get("gamma", 1)
    if (not isinstance(exposure, (int, float)) or not math.isfinite(exposure)
            or exposure < -5 or exposure > 5):
        raise ValueError("Exposição fora do intervalo")
    if (not isinstance(gamma, (int, float)) or not math.isfinite(gamma)
            or gamma < 0.2 or gamma > 4):
        raise ValueError("Gamma fora do intervalo")
    view = bpy.context.scene.view_settings
    view.exposure = exposure
    view.gamma = gamma


def configure_render(config: dict, out_path: str):
    scene = bpy.context.scene
    res, samples = resolve_render_preset(config)
    # Reject oversized/malformed render requests before allocating GPU memory.
    if (not isinstance(res, (list, tuple)) or len(res) != 2
            or any(type(v) is not int or v < 64 or v > 8192 for v in res)
            or res[0] * res[1] > 8192 * 8192):
        raise ValueError("Resolução de render inválida (64–8192 pixels por eixo)")
    if type(samples) is not int or samples < 1 or samples > 4096:
        raise ValueError("Amostragem de render inválida (1–4096)")
    samp = samples

    scene.render.engine               = "CYCLES"
    scene.render.resolution_x         = int(res[0])
    scene.render.resolution_y         = int(res[1])
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath             = out_path

    scene.cycles.samples              = samp
    scene.cycles.use_denoising        = True
    scene.cycles.device               = "CPU"

    # GPU opt-in: CPU remains the safe fallback when a compatible device
    # is missing or unavailable. Do not assume CUDA exists on every host.
    requested = os.environ.get("ARQDOR_CYCLES_GPU_BACKEND", "").upper()
    if requested in ("CUDA", "OPTIX", "HIP", "ONEAPI", "METAL"):
        try:
            addon = bpy.context.preferences.addons.get("cycles")
            if addon is None:
                raise RuntimeError("Cycles não disponível")
            prefs = addon.preferences
            prefs.compute_device_type = requested
            prefs.get_devices()
            devices = [device for device in prefs.devices if device.type == requested]
            if not devices:
                raise RuntimeError("Nenhuma GPU compatível encontrada")
            for device in prefs.devices:
                device.use = device in devices
            scene.cycles.device = "GPU"
            print(f"Cycles GPU habilitada: {requested} ({len(devices)} dispositivo(s))")
        except Exception as error:
            scene.cycles.device = "CPU"
            print(f"GPU indisponível: {error}. Usando CPU.")
    elif requested:
        raise ValueError("Backend de GPU não permitido")



# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    config   = load_config()
    out_path = output_path()

    print(f"=== VendorAI Blender Render ===")
    print(f"Resolução : {config.get('resolution', [1920, 1080])}")
    print(f"Samples   : {config.get('samples', 64)}")
    print(f"HDRI      : {config.get('hdri', 'interior_warm')}")
    print(f"Objetos   : {len(config.get('objects', []))}")
    print(f"Saída     : {out_path}")
    print("")

    clear_scene()
    configure_render(config, out_path)
    configure_postproduction(config)

    if config.get("model"):
        report = import_model(config["model"])
        report_path = os.environ.get("MODEL_REPORT_PATH")
        if report_path:
            with open(report_path, "w", encoding="utf-8") as report_file:
                json.dump(report, report_file, ensure_ascii=False)
        if os.environ.get("MODEL_INSPECT_ONLY") == "1":
            print("MODEL_INSPECTION_DONE")
            return
    else:
        room_cfg = config.get("room", {})
        build_room(room_cfg)

    hdri_key      = config.get("hdri", "interior_warm")
    hdri_strength = float(config.get("hdriStrength", 1.0))
    setup_hdri(hdri_key, hdri_strength)

    for obj_spec in ([] if config.get("model") else config.get("objects", [])):
        try:
            add_object(obj_spec)
        except Exception as e:
            print(f"[AVISO] Erro ao adicionar objeto '{obj_spec.get('name', '?')}': {e}")

    if config.get("model") and config.get("sceneSettings", {}).get("cameras"):
        apply_imported_scene_settings(config["sceneSettings"], report.get("materialMapping", {}))
    else:
        setup_camera(config.get("camera", {}))
        if config.get("model"):
            apply_imported_scene_settings({**config.get("sceneSettings", {}), "cameras": []}, report.get("materialMapping", {}))

    print("Iniciando render...")
    bpy.ops.render.render(write_still=True)
    print(f"RENDER_DONE:{out_path}")


main()

