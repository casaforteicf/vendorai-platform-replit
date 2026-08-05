"""
Conexão direta com o Postgres (mesmo banco do Vendor.ai/Supabase) — lê a
feature store (ml_feature_snapshots) e guarda/lê modelos treinados
(ml_models). Usa psycopg2 puro em vez de SQLAlchemy pra manter o serviço
enxuto; esse microserviço só faz treino/inferência, não é dono do schema
(quem é dono é o Drizzle no lado Node/TS).
"""
import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager

DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Abaixo desse número de exemplos rotulados, não treina — dado de menos
# produz um modelo que só decora ruído, não generaliza. 100 é um piso
# conservador pra classificação binária simples; revisar quando tiver
# dado real pra calibrar de verdade.
MIN_EXAMPLES_TO_TRAIN = 100
MIN_EXAMPLES_PER_CLASS = 20


@contextmanager
def get_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL não configurada")
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
    finally:
        conn.close()


def count_labeled_examples() -> dict:
    """Quantos exemplos rotulados existem hoje — usado tanto pelo /train
    (decide se treina) quanto por um endpoint de status (transparência
    de quão perto está de valer a pena treinar)."""
    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    count(*) AS total,
                    count(*) FILTER (WHERE resultado = 'ganho') AS ganhos,
                    count(*) FILTER (WHERE resultado = 'perdido') AS perdidos
                FROM ml_feature_snapshots
                WHERE resultado IS NOT NULL
            """)
            row = cur.fetchone()
            return dict(row)


def fetch_labeled_snapshots() -> list[dict]:
    """Todos os snapshots já rotulados, com as features (jsonb) já
    parseadas — pronto pra virar DataFrame do pandas."""
    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT id, tenant_id, lead_id, evento_tipo, features, resultado
                FROM ml_feature_snapshots
                WHERE resultado IS NOT NULL
            """)
            rows = cur.fetchall()
            result = []
            for row in rows:
                features = row["features"]
                if isinstance(features, str):
                    features = json.loads(features)
                result.append({
                    "id": row["id"],
                    "tenant_id": row["tenant_id"],
                    "resultado": row["resultado"],
                    **(features or {}),
                })
            return result


def save_model(nome: str, modelo_binario: bytes, metricas: dict, tenant_id: str | None = None):
    """Salva o modelo novo e desativa a versão anterior — mantém histórico
    (não apaga), só marca ativo=false nas anteriores do mesmo nome."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE ml_models SET ativo = false WHERE nome = %s AND ativo = true AND (tenant_id = %s OR (tenant_id IS NULL AND %s IS NULL))",
                (nome, tenant_id, tenant_id),
            )
            cur.execute(
                """
                INSERT INTO ml_models (id, tenant_id, nome, modelo_binario, metricas, ativo)
                VALUES (gen_random_uuid()::text, %s, %s, %s, %s, true)
                RETURNING id
                """,
                (tenant_id, nome, psycopg2.Binary(modelo_binario), json.dumps(metricas)),
            )
            model_id = cur.fetchone()[0]
            conn.commit()
            return model_id


def load_active_model(nome: str, tenant_id: str | None = None) -> tuple[bytes, dict] | None:
    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT modelo_binario, metricas FROM ml_models
                WHERE nome = %s AND ativo = true AND (tenant_id = %s OR (tenant_id IS NULL AND %s IS NULL))
                ORDER BY created_at DESC LIMIT 1
                """,
                (nome, tenant_id, tenant_id),
            )
            row = cur.fetchone()
            if not row:
                return None
            return bytes(row["modelo_binario"]), row["metricas"]
