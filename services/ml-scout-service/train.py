"""
Treino do modelo de propensão. NUNCA treina com dado simulado/de exemplo
— só com o que a feature store acumulou de verdade
(ml_feature_snapshots.resultado preenchido). Recusa treinar se não tiver
volume mínimo — ver MIN_EXAMPLES_TO_TRAIN em db.py.
"""
import io
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score

from db import (
    fetch_labeled_snapshots,
    save_model,
    MIN_EXAMPLES_TO_TRAIN,
    MIN_EXAMPLES_PER_CLASS,
)

# Features numéricas conhecidas hoje (capturadas em
# lib/mlFeatureStore.ts do lado Node). Isso é o ponto de partida —
# revisar/expandir quando houver dado real suficiente pra ver quais
# features realmente aparecem preenchidas com frequência.
KNOWN_NUMERIC_FEATURES = ["diasDesdeEntrada", "intentScore", "propensityScore"]


class InsufficientDataError(Exception):
    def __init__(self, total: int, ganhos: int, perdidos: int):
        self.total = total
        self.ganhos = ganhos
        self.perdidos = perdidos
        super().__init__(
            f"Dado insuficiente pra treinar: {total} exemplos rotulados "
            f"({ganhos} ganhos, {perdidos} perdidos). Mínimo: {MIN_EXAMPLES_TO_TRAIN} "
            f"no total, {MIN_EXAMPLES_PER_CLASS} por classe."
        )


def build_dataframe(snapshots: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(snapshots)
    for col in KNOWN_NUMERIC_FEATURES:
        if col not in df.columns:
            df[col] = None
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["target"] = (df["resultado"] == "ganho").astype(int)
    return df


def train_and_save(nome: str = "propensao_conversao", tenant_id: str | None = None) -> dict:
    snapshots = fetch_labeled_snapshots()
    ganhos = sum(1 for s in snapshots if s.get("resultado") == "ganho")
    perdidos = sum(1 for s in snapshots if s.get("resultado") == "perdido")
    total = len(snapshots)

    if total < MIN_EXAMPLES_TO_TRAIN or ganhos < MIN_EXAMPLES_PER_CLASS or perdidos < MIN_EXAMPLES_PER_CLASS:
        raise InsufficientDataError(total, ganhos, perdidos)

    df = build_dataframe(snapshots)
    feature_cols = KNOWN_NUMERIC_FEATURES
    X = df[feature_cols].fillna(0)
    y = df["target"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    model = LGBMClassifier(
        n_estimators=200,
        learning_rate=0.05,
        max_depth=5,
        random_state=42,
        verbose=-1,
    )
    model.fit(X_train, y_train)

    probs = model.predict_proba(X_test)[:, 1]
    auc = float(roc_auc_score(y_test, probs)) if len(set(y_test)) > 1 else None

    buffer = io.BytesIO()
    import joblib
    joblib.dump({"model": model, "feature_cols": feature_cols}, buffer)
    modelo_binario = buffer.getvalue()

    metricas = {
        "auc": auc,
        "numExemplos": total,
        "numGanhos": ganhos,
        "numPerdidos": perdidos,
        "features": feature_cols,
    }

    model_id = save_model(nome, modelo_binario, metricas, tenant_id)
    return {"modelId": model_id, **metricas}
