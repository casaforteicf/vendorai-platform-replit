import os
import uuid
import threading
import subprocess
from datetime import datetime
from flask import Flask, request, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

BLENDER_SECRET = os.getenv("BLENDER_SECRET", "")
PORT = int(os.getenv("PORT", 8080))
BLENDER_PATH = os.getenv("BLENDER_PATH", "/home/user/blender/blender")

jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()


def require_auth(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        secret = request.headers.get("X-Blender-Secret", "")
        if not BLENDER_SECRET:
            return jsonify({"error": "BLENDER_SECRET not configured"}), 500
        if secret != BLENDER_SECRET:
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated


def get_blender_version():
    try:
        result = subprocess.run(
            [BLENDER_PATH, "--version"],
            capture_output=True, text=True, timeout=10
        )
        first_line = result.stdout.strip().splitlines()[0] if result.stdout else "unknown"
        return first_line
    except Exception as e:
        return f"error: {e}"


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "blender_version": get_blender_version(),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    })


@app.route("/render", methods=["POST"])
@require_auth
def post_render():
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "JSON body required"}), 400

    job_id    = body.get("jobId")    or str(uuid.uuid4())
    cena_id   = body.get("cenaId")   or ""
    tenant_id = body.get("tenantId") or ""
    scene_config = body.get("sceneConfig") or {}

    if not cena_id or not tenant_id:
        return jsonify({"error": "cenaId and tenantId are required"}), 400

    job = {
        "jobId":    job_id,
        "cenaId":   cena_id,
        "tenantId": tenant_id,
        "status":   "aguardando",
        "imageUrl": None,
        "erro":     None,
        "createdAt": datetime.utcnow().isoformat() + "Z",
        "updatedAt": datetime.utcnow().isoformat() + "Z",
    }

    with jobs_lock:
        jobs[job_id] = job

    t = threading.Thread(
        target=run_render,
        args=(job_id, cena_id, tenant_id, scene_config),
        daemon=True,
    )
    t.start()

    return jsonify({"jobId": job_id, "status": "aguardando"}), 202


@app.route("/render/<job_id>", methods=["GET"])
@require_auth
def get_render(job_id):
    with jobs_lock:
        job = jobs.get(job_id)

    if not job:
        return jsonify({"error": "Job not found"}), 404

    return jsonify({
        "jobId":    job["jobId"],
        "status":   job["status"],
        "imageUrl": job.get("imageUrl"),
        "erro":     job.get("erro"),
        "updatedAt": job.get("updatedAt"),
    })


@app.route("/render/<job_id>", methods=["DELETE"])
@require_auth
def cancel_render(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            return jsonify({"error": "Job not found"}), 404
        if job["status"] in ("concluido", "erro"):
            return jsonify({"error": "Job already finished"}), 409
        job["status"] = "cancelado"
        job["updatedAt"] = datetime.utcnow().isoformat() + "Z"

    return jsonify({"jobId": job_id, "status": "cancelado"})


@app.route("/render", methods=["GET"])
@require_auth
def list_renders():
    with jobs_lock:
        snapshot = list(jobs.values())
    return jsonify(snapshot)


def run_render(job_id: str, cena_id: str, tenant_id: str, scene_config: dict):
    from blender_render import render_scene

    def update(status, image_url=None, erro=None):
        with jobs_lock:
            if job_id in jobs:
                jobs[job_id]["status"]    = status
                jobs[job_id]["imageUrl"]  = image_url
                jobs[job_id]["erro"]      = erro
                jobs[job_id]["updatedAt"] = datetime.utcnow().isoformat() + "Z"

    update("processando")
    try:
        image_url = render_scene(job_id, cena_id, tenant_id, scene_config)
        update("concluido", image_url=image_url)
    except Exception as e:
        update("erro", erro=str(e))


if __name__ == "__main__":
    os.makedirs(os.getenv("OUTPUT_DIR", "/tmp/renders"), exist_ok=True)
    print(f"VendorAI Blender Server — porta {PORT}")
    print(f"Blender: {get_blender_version()}")
    app.run(host="0.0.0.0", port=PORT, threaded=True)
