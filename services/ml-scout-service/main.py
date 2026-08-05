"""
Microserviço de ML do Vendor.ai — separado do backend Node/TS porque
LightGBM roda em Python. Só faz duas coisas: treinar (quando tiver dado
suficiente) e servir predição (quando tiver modelo treinado). Fora
disso, sempre responde de forma explícita que não tem modelo — o
backend Node trata isso como "sem modelo, usa as regras normais",
nunca acha que tem uma predição quando não tem.
"""
import io
import os
import joblib
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel

from db import count_labeled_examples, load_active_model, MIN_EXAMPLES_TO_TRAIN, MIN_EXAMPLES_PER_CLASS
from train import train_and_save, InsufficientDataError, KNOWN_NUMERIC_FEATURES

app = FastAPI(title="Vendor.ai ML Scout Service")

# Chave simples compartilhada com o backend Node — esse serviço não tem
# autenticação de usuário nenhuma, só deve ser chamado internamente
# (Railway private network), essa chave é uma segunda trava.
INTERNAL_API_KEY = os.environ.get("ML_SERVICE_INTERNAL_KEY", "")


def check_internal_key(x_internal_key: str | None):
    if INTERNAL_API_KEY and x_internal_key != INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Chave interna inválida")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/status")
def status(x_internal_key: str | None = Header(default=None)):
    """Quantos exemplos rotulados já tem, e se já dá pra treinar —
    transparência de quão perto está de valer a pena, sem precisar
    consultar o banco na mão."""
    check_internal_key(x_internal_key)
    counts = count_labeled_examples()
    total = counts["total"] or 0
    ganhos = counts["ganhos"] or 0
    perdidos = counts["perdidos"] or 0
    pronto_pra_treinar = (
        total >= MIN_EXAMPLES_TO_TRAIN
        and ganhos >= MIN_EXAMPLES_PER_CLASS
        and perdidos >= MIN_EXAMPLES_PER_CLASS
    )
    return {
        "totalExemplosRotulados": total,
        "ganhos": ganhos,
        "perdidos": perdidos,
        "minimoNecessario": MIN_EXAMPLES_TO_TRAIN,
        "minimoPorClasse": MIN_EXAMPLES_PER_CLASS,
        "prontoParaTreinar": pronto_pra_treinar,
    }


class TrainRequest(BaseModel):
    nome: str = "propensao_conversao"
    tenantId: str | None = None


@app.post("/train")
def train(req: TrainRequest, x_internal_key: str | None = Header(default=None)):
    check_internal_key(x_internal_key)
    try:
        result = train_and_save(nome=req.nome, tenant_id=req.tenantId)
        return {"trained": True, **result}
    except InsufficientDataError as e:
        # 422, não 500 — não é um erro do serviço, é uma resposta válida
        # e esperada ("ainda não dá").
        raise HTTPException(status_code=422, detail=str(e))


class PredictRequest(BaseModel):
    nome: str = "propensao_conversao"
    tenantId: str | None = None
    features: dict


@app.post("/predict")
def predict(req: PredictRequest, x_internal_key: str | None = Header(default=None)):
    check_internal_key(x_internal_key)
    loaded = load_active_model(req.nome, req.tenantId)
    if not loaded:
        # Sem modelo treinado ainda — resposta explícita, não um erro
        # genérico. O backend Node sabe interpretar isso como "cai pra
        # regra normal".
        return {"hasModel": False, "probability": None}

    modelo_binario, metricas = loaded
    bundle = joblib.load(io.BytesIO(modelo_binario))
    model = bundle["model"]
    feature_cols = bundle["feature_cols"]

    row = [[req.features.get(col, 0) or 0 for col in feature_cols]]
    prob = float(model.predict_proba(row)[0][1])

    return {"hasModel": True, "probability": prob, "metricas": metricas}
