"""
blender_render.py
Executa Blender em modo headless e faz upload do render para o Supabase.
"""

import os
import json
import subprocess
import tempfile
import textwrap
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

BLENDER_PATH = os.getenv("BLENDER_PATH", "/home/user/blender/blender")
HDRI_DIR     = os.getenv("HDRI_DIR",     "/home/user/hdri")
OUTPUT_DIR   = os.getenv("OUTPUT_DIR",   "/tmp/renders")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

BUCKET = "arch-renders"


def _get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL / SUPABASE_KEY not configured")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def _pick_hdri(config: dict) -> str:
    """
    Retorna o caminho do arquivo HDRI a usar.
    config pode ter { hdri: 'studio' | 'outdoor' | 'sunset' | 'path/custom.hdr' }
    """
    presets = {
        "studio":  "studio_small.hdr",
        "outdoor": "outdoor_umbrellas.hdr",
        "sunset":  "sunset_jhbcentral.hdr",
        "interior": "interior_atelier.hdr",
    }
    key = config.get("hdri", "studio")
    filename = presets.get(key, presets["studio"])
    full_path = os.path.join(HDRI_DIR, filename)
    if os.path.exists(full_path):
        return full_path
    # fallback: any .hdr in HDRI_DIR
    hdrs = list(Path(HDRI_DIR).glob("*.hdr")) + list(Path(HDRI_DIR).glob("*.exr"))
    if hdrs:
        return str(hdrs[0])
    return ""


def _build_blender_script(config: dict, output_path: str, hdri_path: str) -> str:
    """
    Gera um script Python que o Blender executa em modo headless.
    config keys:
      resolution    : [width, height]   default [1920, 1080]
      samples       : int               default 64
      camera        : { location: [x,y,z], rotation: [rx,ry,rz] }
      objects       : [ { type, location, rotation, scale, color, metallic, roughness } ]
      background    : { color: [r,g,b,a] } or { hdri: 'studio' }
      hdriStrength  : float             default 1.0
    """
    res    = config.get("resolution",  [1920, 1080])
    samples = config.get("samples",   64)
    cam    = config.get("camera",      {})
    objs   = config.get("objects",     [])
    bg     = config.get("background",  {})
    hdri_strength = float(config.get("hdriStrength", 1.0))

    cam_loc = cam.get("location", [0, -5, 2])
    cam_rot = cam.get("rotation", [70, 0, 0])

    def _col(c, default=(0.8, 0.8, 0.8)):
        if isinstance(c, (list, tuple)) and len(c) >= 3:
            return list(c[:3])
        return list(default)

    objects_code = []
    for i, obj in enumerate(objs):
        obj_type  = obj.get("type", "cube").lower()
        loc       = obj.get("location", [0, 0, 0])
        rot       = obj.get("rotation", [0, 0, 0])
        scale     = obj.get("scale",    [1, 1, 1])
        color     = _col(obj.get("color"), (0.8, 0.8, 0.8))
        metallic  = float(obj.get("metallic",  0.0))
        roughness = float(obj.get("roughness", 0.5))
        name      = obj.get("name", f"obj_{i}")

        if obj_type == "sphere":
            mesh_op = "bpy.ops.mesh.primitive_uv_sphere_add"
            mesh_args = f"radius=1, location={loc}"
        elif obj_type == "cylinder":
            mesh_op = "bpy.ops.mesh.primitive_cylinder_add"
            mesh_args = f"radius=1, depth=2, location={loc}"
        elif obj_type == "plane":
            mesh_op = "bpy.ops.mesh.primitive_plane_add"
            mesh_args = f"size=2, location={loc}"
        elif obj_type == "cone":
            mesh_op = "bpy.ops.mesh.primitive_cone_add"
            mesh_args = f"radius1=1, depth=2, location={loc}"
        else:
            mesh_op = "bpy.ops.mesh.primitive_cube_add"
            mesh_args = f"size=2, location={loc}"

        import math
        rot_rad = [math.radians(r) for r in rot]

        objects_code.append(textwrap.dedent(f"""
        {mesh_op}({mesh_args})
        obj_{i} = bpy.context.active_object
        obj_{i}.name = {json.dumps(name)}
        obj_{i}.rotation_euler = {tuple(rot_rad)}
        obj_{i}.scale = {tuple(scale)}
        mat_{i} = bpy.data.materials.new(name="mat_{i}")
        mat_{i}.use_nodes = True
        bsdf_{i} = mat_{i}.node_tree.nodes["Principled BSDF"]
        bsdf_{i}.inputs["Base Color"].default_value = {tuple(color + [1.0])}
        bsdf_{i}.inputs["Metallic"].default_value   = {metallic}
        bsdf_{i}.inputs["Roughness"].default_value  = {roughness}
        obj_{i}.data.materials.append(mat_{i})
        """))

    import math
    cam_rot_rad = [math.radians(r) for r in cam_rot]

    if hdri_path:
        world_code = textwrap.dedent(f"""
        world = bpy.data.worlds["World"]
        world.use_nodes = True
        env_node = world.node_tree.nodes.new("ShaderNodeTexEnvironment")
        env_node.image = bpy.data.images.load({json.dumps(hdri_path)})
        bg_node = world.node_tree.nodes["Background"]
        bg_node.inputs["Strength"].default_value = {hdri_strength}
        world.node_tree.links.new(env_node.outputs["Color"], bg_node.inputs["Color"])
        """)
    else:
        bg_color = _col(bg.get("color"), (0.9, 0.9, 0.9))
        world_code = textwrap.dedent(f"""
        world = bpy.data.worlds["World"]
        world.use_nodes = True
        bg_node = world.node_tree.nodes["Background"]
        bg_node.inputs["Color"].default_value    = {tuple(bg_color + [1.0])}
        bg_node.inputs["Strength"].default_value = 1.0
        """)

    script = textwrap.dedent(f"""
    import bpy, math, json

    # --- Limpa cena ---
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

    # --- Render settings ---
    scene = bpy.context.scene
    scene.render.engine          = "CYCLES"
    scene.render.resolution_x   = {res[0]}
    scene.render.resolution_y   = {res[1]}
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath        = {json.dumps(output_path)}
    scene.cycles.samples         = {samples}
    scene.cycles.use_denoising  = True

    # GPU se disponível
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "CUDA"
    try:
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = "GPU"
    except Exception:
        scene.cycles.device = "CPU"

    # --- Objetos ---
    {"".join(objects_code)}

    # --- Câmera ---
    bpy.ops.object.camera_add(location={tuple(cam_loc)})
    cam_obj = bpy.context.active_object
    cam_obj.rotation_euler = {tuple(cam_rot_rad)}
    scene.camera = cam_obj

    # --- Iluminação ---
    bpy.ops.object.light_add(type="SUN", location=(5, 5, 10))
    sun = bpy.context.active_object
    sun.data.energy = 3.0

    # --- World / HDRI ---
    {world_code}

    # --- Plano de chão ---
    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -1))
    floor = bpy.context.active_object
    floor.name = "Floor"
    mat_floor = bpy.data.materials.new("Floor")
    mat_floor.use_nodes = True
    bsdf_f = mat_floor.node_tree.nodes["Principled BSDF"]
    bsdf_f.inputs["Base Color"].default_value = (0.9, 0.9, 0.9, 1.0)
    bsdf_f.inputs["Roughness"].default_value  = 0.8
    floor.data.materials.append(mat_floor)

    # --- Render ---
    bpy.ops.render.render(write_still=True)
    print("RENDER_DONE:" + {json.dumps(output_path)})
    """)

    return script


def render_scene(job_id: str, cena_id: str, tenant_id: str, config: dict) -> str:
    """
    Executa Blender headless e faz upload da imagem.
    Retorna a URL pública da imagem no Supabase.
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    output_path = os.path.join(OUTPUT_DIR, f"{job_id}.png")
    hdri_path   = _pick_hdri(config)
    script_body = _build_blender_script(config, output_path, hdri_path)

    # Escreve script temporário
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".py", delete=False, prefix=f"blender_{job_id}_"
    ) as f:
        f.write(script_body)
        script_path = f.name

    try:
        cmd = [
            BLENDER_PATH,
            "--background",
            "--python", script_path,
        ]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,  # 10 min max
        )

        if result.returncode != 0:
            raise RuntimeError(
                f"Blender exited with code {result.returncode}.\n"
                f"STDOUT: {result.stdout[-2000:]}\n"
                f"STDERR: {result.stderr[-2000:]}"
            )

        if not os.path.exists(output_path):
            raise RuntimeError(
                f"Blender finished but output file not found: {output_path}\n"
                f"STDOUT: {result.stdout[-1000:]}"
            )

    finally:
        try:
            os.unlink(script_path)
        except OSError:
            pass

    image_url = _upload_to_supabase(output_path, job_id, tenant_id, cena_id)

    try:
        os.unlink(output_path)
    except OSError:
        pass

    return image_url


def _upload_to_supabase(
    local_path: str, job_id: str, tenant_id: str, cena_id: str
) -> str:
    client = _get_supabase()

    storage_key = f"{tenant_id}/{cena_id}/{job_id}.png"

    with open(local_path, "rb") as f:
        data = f.read()

    try:
        client.storage.from_(BUCKET).upload(
            path=storage_key,
            file=data,
            file_options={"content-type": "image/png", "upsert": "true"},
        )
    except Exception as e:
        raise RuntimeError(f"Supabase upload failed: {e}")

    public = client.storage.from_(BUCKET).get_public_url(storage_key)
    return public
