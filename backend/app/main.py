from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
from datetime import datetime
import logging
import os

app = FastAPI(title="Revenue Scout API", version="1.0.0")

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger(__name__)

# ============================================
# MODELOS DE DADOS
# ============================================

class CompanyInfo(BaseModel):
    nome: str
    setor: str
    porte: str
    canais: List[str]
    regiao: str

class ProductInfo(BaseModel):
    id: str
    nome: str
    categoria: str
    valor_medio: Optional[float] = None
    prazo_instalacao_dias: int = 15
    garantia_anos: int = 5
    personalizavel: bool = True

class GenerateRulesRequest(BaseModel):
    tenant_id: str
    empresa: CompanyInfo
    produtos: List[ProductInfo]
    politicas: Dict
    comunicacao: Dict
    spam_controls: Dict

# ============================================
# ENDPOINTS DA API
# ============================================

@app.get("/")
async def root():
    return {
        "message": "Revenue Scout API",
        "status": "online",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.post("/api/rules/generate")
async def generate_rules(request: GenerateRulesRequest):
    """
    Gera regras baseadas no questionário
    """
    try:
        rules = []
        
        # 1. Regras de orçamento parado
        if 'orcamentos_parados' in request.politicas:
            prazos = request.politicas['orcamentos_parados'].get('prazos_por_produto', {})
            for produto in request.produtos:
                if produto.id in prazos:
                    dias = prazos[produto.id]
                    rules.append({
                        "id": len(rules) + 1,
                        "nome": f"Orçamento de {produto.nome} Parado",
                        "tipo": "orcamento_parado",
                        "condicoes": {
                            "diasParado": dias,
                            "produto": produto.id
                        },
                        "acao": {
                            "canal": request.empresa.canais[0] if request.empresa.canais else "whatsapp",
                            "mensagem": f"Olá {{nome}}, vimos que o orçamento para {produto.nome} que enviamos em {{data_envio}} ainda está em aberto. Vamos conversar?",
                            "tipo_mensagem": "reativacao",
                            "prioridade": 1
                        }
                    })
        
        # 2. Regras sazonais
        if 'sazonalidade' in request.politicas and request.politicas['sazonalidade'].get('ativo'):
            for evento in request.politicas['sazonalidade'].get('eventos', []):
                rules.append({
                    "id": len(rules) + 1,
                    "nome": f"Reativação Sazonal - {evento['nome']}",
                    "tipo": "reativacao_sazonal",
                    "condicoes": {
                        "mes": evento['mes'],
                        "sazonalidade": evento['nome'].lower(),
                        "dias_sem_interacao": evento.get('dias_sem_interacao', 30)
                    },
                    "acao": {
                        "canal": request.empresa.canais[0] if request.empresa.canais else "whatsapp",
                        "mensagem": f"Olá {{nome}}! O {evento['nome']} está chegando. Vamos conversar?",
                        "tipo_mensagem": "sazonal",
                        "prioridade": 2
                    }
                })
        
        # 3. Regras de whitespace/cross-sell
        if 'whitespace_cross_sell' in request.politicas and request.politicas['whitespace_cross_sell'].get('ativo'):
            for combo in request.politicas['whitespace_cross_sell'].get('combinacoes', []):
                produto_tem = next((p for p in request.produtos if p.id == combo['produto_tem']), None)
                produto_nao_tem = next((p for p in request.produtos if p.id == combo['produto_nao_tem']), None)
                
                if produto_tem and produto_nao_tem:
                    rules.append({
                        "id": len(rules) + 1,
                        "nome": f"Cross-Sell - {produto_tem.nome} + {produto_nao_tem.nome}",
                        "tipo": "whitespace_produto",
                        "condicoes": {
                            "produto_tem": combo['produto_tem'],
                            "produto_nao_tem": combo['produto_nao_tem'],
                            "dias_minimo": combo.get('dias_minimo', 90)
                        },
                        "acao": {
                            "canal": request.empresa.canais[0] if request.empresa.canais else "whatsapp",
                            "mensagem": f"Olá {{nome}}, vi que você já tem {produto_tem.nome}. Que tal adicionar {produto_nao_tem.nome}?",
                            "tipo_mensagem": "whitespace",
                            "prioridade": combo.get('prioridade', 2)
                        }
                    })
        
        return {
            "success": True,
            "message": f"{len(rules)} regras geradas com sucesso!",
            "rules": rules,
            "total_rules": len(rules)
        }
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tenants/{tenant_id}/rules")
async def get_rules(tenant_id: str):
    """Retorna regras de um tenant (simulado)"""
    return {"rules": []}

# ============================================
# EXECUÇÃO LOCAL
# ============================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
