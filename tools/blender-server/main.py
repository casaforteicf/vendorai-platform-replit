"""
main.py — VendorAI Blender Server
Flask server que recebe jobs de render 3D e executa Blender headless.
"""

import os
import uuid
import json
import threading
import subprocess
import tempfile
import sqlite3
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from flask import Flask, request, jsonify, send_file
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# ─── Config ──────────────────────────────────────────────────────────────────
BLENDER_SECRET = os.getenv("BLENDER_SECRET", "")
PORT           = int(os.getenv("PORT", 8080))
BLENDER_PATH   = "/opt/blender/blender"
SCRIPT_PATH    = os.path.join(os.path.dirname(__file__), "blender_render.py")
OUTPUT_DIR     = "/tmp/renders"
SUPABASE_URL   = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY   = os.getenv("SUPABASE_KEY", "")
BUCKET         = "arch-renders"

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ─── Fila em memória ─────────────────────────────────────────────────────────
jobs_status: dict[str, dict] = {}
jobs_lock = threading.Lock()
MAX_WORKERS = max(1, min(int(os.getenv("ARQDOR_RENDER_WORKERS", "1")), 4))
executor = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="arqdor-render")
DB_PATH = os.getenv("ARQDOR_RENDER_QUEUE_DB", os.path.join(OUTPUT_DIR, "jobs.sqlite3"))
ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def db_connection():
    connection = sqlite3.connect(DB_PATH, timeout=20)
    connection.execute("PRAGMA busy_timeout = 20000")
    connection.execute("""CREATE TABLE IF NOT EXISTS render_jobs (
        job_id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )""")
    return connection


def persist_job(job_id, job):
    with db_connection() as connection:
        connection.execute(
            "INSERT INTO render_jobs(job_id,payload,status,updated_at) VALUES(?,?,?,?) "
            "ON CONFLICT(job_id) DO UPDATE SET payload=excluded.payload, "
            "status=excluded.status,updated_at=excluded.updated_at",
            (job_id, json.dumps(job, ensure_ascii=False), job["status"], job["updatedAt"]),
        )


def restore_jobs():
    with db_connection() as connection:
        records = connection.execute("SELECT job_id,payload FROM render_jobs").fetchall()
    for job_id, payload in records:
        job = json.loads(payload)
        if job["status"] in ("aguardando", "processando"):
            # A process may have died mid-render: report the interruption explicitly.
            job["status"] = "erro"
            job["erro"] = "Worker reiniciado durante processamento; reenviar o mesmo job para retomar."
            job["updatedAt"] = datetime.utcnow().isoformat() + "Z"
            persist_job(job_id, job)
        jobs_status[job_id] = job


restore_jobs()


# ─── Auth ─────────────────────────────────────────────────────────────────────
def require_auth(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        secret = request.headers.get("X-Blender-Secret", "")
        if not BLENDER_SECRET:
            return jsonify({"error": "BLENDER_SECRET not configured on server"}), 500
        if secret != BLENDER_SECRET:
            return jsonify({"error": "Unauthorized — invalid X-Blender-Secret"}), 401
        return f(*args, **kwargs)
    return decorated


# ─── Blender version helper ──────────────────────────────────────────────────
def get_blender_version() -> str:
    try:
        r = subprocess.run(
            [BLENDER_PATH, "--version"],
            capture_output=True, text=True, timeout=10
        )
        lines = r.stdout.strip().splitlines()
        return lines[0] if lines else "unknown"
    except FileNotFoundError:
        return f"Blender não encontrado em {BLENDER_PATH}"
    except Exception as e:
        return f"error: {e}"


# ─── Upload Supabase ─────────────────────────────────────────────────────────
def upload_to_supabase(local_path: str, storage_key: str) -> str:
    """Faz upload do arquivo para o Supabase Storage e retorna a URL pública."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL / SUPABASE_KEY não configurados")

    from supabase import create_client
    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    with open(local_path, "rb") as f:
        data = f.read()

    client.storage.from_(BUCKET).upload(
        path=storage_key,
        file=data,
        file_options={"content-type": "image/png", "upsert": "true"},
    )

    return client.storage.from_(BUCKET).get_public_url(storage_key)


# ─── Execute render (chamada em thread) ─────────────────────────────────────
def execute_render(job_id: str, cena_id: str, tenant_id: str, scene_config: dict):
    """
    Escreve o sceneConfig em arquivo temporário, executa o Blender headless,
    faz upload do PNG gerado para o Supabase e atualiza jobs_status.
    """
    def set_status(status: str, image_url: str | None = None, erro: str | None = None):
        with jobs_lock:
            if job_id in jobs_status:
                jobs_status[job_id]["status"]    = status
                jobs_status[job_id]["imageUrl"]  = image_url
                jobs_status[job_id]["erro"]      = erro
                jobs_status[job_id]["updatedAt"] = datetime.utcnow().isoformat() + "Z"
                persist_job(job_id, jobs_status[job_id])

    set_status("processando")

    config_file  = None
    output_path  = os.path.join(OUTPUT_DIR, f"{job_id}.png")

    try:
        # 1. Escreve sceneConfig em arquivo temporário
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, prefix=f"scene_{job_id}_"
        ) as f:
            json.dump(scene_config, f, ensure_ascii=False)
            config_file = f.name

        # 2. Executa Blender headless
        env = os.environ.copy()
        env["SCENE_CONFIG_PATH"] = config_file
        env["OUTPUT_PATH"]       = output_path

        cmd = [
            BLENDER_PATH,
            "--background",
            "--python", SCRIPT_PATH,
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,
            env=env,
        )

        if result.returncode != 0:
            raise RuntimeError(
                f"Blender retornou código {result.returncode}.\n"
                f"STDOUT (últimas 2000 chars):\n{result.stdout[-2000:]}\n"
                f"STDERR:\n{result.stderr[-1000:]}"
            )

        if not os.path.exists(output_path):
            raise RuntimeError(
                f"Blender concluiu mas o arquivo de saída não foi criado: {output_path}\n"
                f"STDOUT:\n{result.stdout[-1000:]}"
            )

        # Result remains private on the worker until the authenticated API
        # transfers it into the tenant media library.
        with open(output_path, "rb") as source:
            signature = source.read(8)
        if signature != bytes.fromhex("89504e470d0a1a0a"):
            raise RuntimeError("Resultado Blender não é PNG válido")
        private_result = os.path.join(OUTPUT_DIR, f"{job_id}.result.png")
        os.replace(output_path, private_result)
        set_status("concluido")

    except subprocess.TimeoutExpired:
        set_status("erro", erro="Timeout: render excedeu 10 minutos.")
    except Exception as e:
        set_status("erro", erro=str(e))
    finally:
        # Limpa arquivos temporários
        if config_file and os.path.exists(config_file):
            try:
                os.unlink(config_file)
            except OSError:
                pass
        if os.path.exists(output_path):
            try:
                os.unlink(output_path)
            except OSError:
                pass


# ─────────────────────────────────────────────────────────────────────────────
# Rotas
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status":          "ok",
        "blender_version": get_blender_version(),
        "timestamp":       datetime.utcnow().isoformat() + "Z",
    })


@app.route("/render", methods=["POST"])
@require_auth
def post_render():
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "JSON body obrigatório"}), 400

    job_id       = str(body.get("jobId")    or uuid.uuid4())
    cena_id      = str(body.get("cenaId")   or "")
    tenant_id    = str(body.get("tenantId") or "")
    scene_config = body.get("sceneConfig")  or {}

    if not cena_id:
        return jsonify({"error": "cenaId é obrigatório"}), 400
    if not tenant_id:
        return jsonify({"error": "tenantId é obrigatório"}), 400
    if not all(ID_PATTERN.fullmatch(value) for value in (job_id, cena_id, tenant_id)):
        return jsonify({"error": "Identificador inválido"}), 422
    if not isinstance(scene_config, dict):
        return jsonify({"error": "sceneConfig deve ser um objeto"}), 422

    now = datetime.utcnow().isoformat() + "Z"
    job = {
        "jobId":       job_id,
        "cenaId":      cena_id,
        "tenantId":    tenant_id,
        "status":      "aguardando",
        "imageUrl":    None,
        "erro":        None,
        "createdAt":   now,
        "updatedAt":   now,
    }

    with jobs_lock:
        previous = jobs_status.get(job_id)
        if previous:
            if previous.get("tenantId") != tenant_id or previous.get("cenaId") != cena_id:
                return jsonify({"error": "Job já pertence a outra cena ou tenant"}), 409
            if previous["status"] != "erro":
                return jsonify({"jobId": job_id, "status": previous["status"]}), 200
            # Retry only interrupted/failed jobs, with the same tenant and scene.
        jobs_status[job_id] = job
        persist_job(job_id, job)

    executor.submit(execute_render, job_id, cena_id, tenant_id, scene_config)

    return jsonify({"jobId": job_id, "status": "aguardando"}), 202


@app.route("/render/<job_id>", methods=["GET"])
@require_auth
def get_render(job_id):
    with jobs_lock:
        job = jobs_status.get(job_id)

    if not job:
        return jsonify({"error": f"Job '{job_id}' não encontrado"}), 404

    return jsonify({
        "jobId":     job["jobId"],
        "status":    job["status"],
        "imageUrl":  job.get("imageUrl"),
        "erro":      job.get("erro"),
        "updatedAt": job.get("updatedAt"),
    })


@app.route("/render/<job_id>/artifact", methods=["GET"])
@require_auth
def get_render_artifact(job_id):
    if not ID_PATTERN.fullmatch(job_id):
        return jsonify({"error": "Identificador inválido"}), 422
    with jobs_lock:
        job = jobs_status.get(job_id)
        if not job:
            return jsonify({"error": "Job não encontrado"}), 404
        if job["status"] != "concluido":
            return jsonify({"error": "Resultado ainda indisponível"}), 409
    artifact = os.path.join(OUTPUT_DIR, f"{job_id}.result.png")
    if not os.path.isfile(artifact):
        return jsonify({"error": "PNG não encontrado no worker"}), 404
    response = send_file(artifact, mimetype="image/png", as_attachment=True, download_name=f"{job_id}.png")
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.route("/render", methods=["GET"])
@require_auth
def list_renders():
    with jobs_lock:
        all_jobs = list(jobs_status.values())
    return jsonify(all_jobs)


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"")
    print(f"  VendorAI Blender Server")
    print(f"  Porta     : {PORT}")
    print(f"  Blender   : {get_blender_version()}")
    print(f"  Output dir: {OUTPUT_DIR}")
    print(f"")
    app.run(host="0.0.0.0", port=PORT, threaded=True)
