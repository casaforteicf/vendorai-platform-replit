# VendorAI Blender Server

Servidor Python/Flask que executa **Blender headless** para gerar renders 3D de projetos de arquitetura/design de interiores. Integra com o banco Supabase do VendorAI para armazenar as imagens geradas.

---

## Passo a passo de instalação

### 1. Criar novo Replit (Python)

1. Acesse [replit.com](https://replit.com) e clique em **Create Repl**
2. Escolha o template **Python**
3. Nomeie como `vendorai-blender-server`
4. Clique em **Create Repl**

### 2. Copiar os arquivos

No Shell do novo Replit, faça upload ou cole o conteúdo de cada arquivo:

```
main.py
blender_render.py
requirements.txt
install_blender.sh
download_hdri.sh
.env.example  →  renomear para .env
```

Você pode usar o botão **Upload file** na aba Files, ou criar cada arquivo manualmente pelo editor.

### 3. Instalar dependências Python

No Shell:

```bash
pip install -r requirements.txt
```

### 4. Instalar o Blender headless

```bash
bash install_blender.sh
```

Este script:
- Instala dependências de sistema (libx11, libGL etc.)
- Baixa o Blender 4.1 LTS (~220 MB)
- Extrai em `~/blender/`
- Imprime o caminho do binário ao final

⏱️ Tempo estimado: 3–5 minutos

### 5. Baixar HDRIs de iluminação

```bash
bash download_hdri.sh
```

Baixa 4 HDRIs gratuitas (CC0) do Poly Haven para iluminação realista de cenas:
- `studio_small.hdr` — ambiente de estúdio neutro
- `outdoor_umbrellas.hdr` — exterior com sombras
- `sunset_jhbcentral.hdr` — pôr do sol
- `interior_atelier.hdr` — ateliê interior

⏱️ Tempo estimado: 1–2 minutos (~80 MB)

### 6. Configurar o arquivo `.env`

Renomeie `.env.example` para `.env` e preencha:

```env
# Gere um UUID em https://www.uuidgenerator.net/
BLENDER_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# URL e chave do seu projeto Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_KEY=sua-service-role-key

# Caminhos (preenchidos automaticamente pelos scripts acima)
BLENDER_PATH=/home/user/blender/blender
HDRI_DIR=/home/user/hdri
OUTPUT_DIR=/tmp/renders

PORT=8080
```

> **SUPABASE_KEY**: use a **service_role key** (não a anon key), pois o servidor precisa fazer upload de arquivos no bucket `arch-renders`.

#### Criar o bucket no Supabase

No painel do Supabase → **Storage** → **New bucket**:
- Nome: `arch-renders`
- Visibilidade: **Public** (para que os URLs funcionem sem autenticação)

### 7. Rodar o servidor

```bash
python main.py
```

Saída esperada:
```
VendorAI Blender Server — porta 8080
Blender: Blender 4.1.1
 * Running on http://0.0.0.0:8080
```

### 8. Configurar o VendorAI principal

1. Copie a URL do seu Replit. Ela segue o padrão:
   ```
   https://vendorai-blender-server.seuusuario.repl.co
   ```

2. No **Replit do VendorAI principal**, adicione/atualize a secret:
   ```
   BLENDER_SERVER_URL = https://vendorai-blender-server.seuusuario.repl.co
   BLENDER_SECRET     = (mesmo valor do .env do blender-server)
   ```

---

## Referência da API

### Autenticação

Todas as rotas (exceto `/health`) exigem o header:
```
X-Blender-Secret: <valor do BLENDER_SECRET>
```

---

### `POST /render`

Envia um job de render.

**Body JSON:**
```json
{
  "jobId": "uuid-opcional",
  "cenaId": "uuid-da-cena",
  "tenantId": "uuid-do-tenant",
  "sceneConfig": {
    "resolution": [1920, 1080],
    "samples": 64,
    "hdri": "studio",
    "hdriStrength": 1.0,
    "camera": {
      "location": [0, -5, 2],
      "rotation": [70, 0, 0]
    },
    "objects": [
      {
        "type": "cube",
        "name": "Sofá",
        "location": [0, 0, 0],
        "rotation": [0, 0, 45],
        "scale": [2, 1, 0.5],
        "color": [0.3, 0.2, 0.15],
        "metallic": 0.0,
        "roughness": 0.8
      }
    ]
  }
}
```

**Resposta `202`:**
```json
{ "jobId": "uuid", "status": "aguardando" }
```

---

### `GET /render/:jobId`

Consulta o status de um job.

**Resposta:**
```json
{
  "jobId": "uuid",
  "status": "aguardando | processando | concluido | erro | cancelado",
  "imageUrl": "https://...supabase.co/storage/v1/object/public/arch-renders/...",
  "erro": null,
  "updatedAt": "2025-01-01T12:00:00Z"
}
```

---

### `GET /health`

Sem autenticação.

```json
{ "status": "ok", "blender_version": "Blender 4.1.1", "timestamp": "..." }
```

---

### `DELETE /render/:jobId`

Marca job como cancelado (não interrompe render em andamento).

---

### `GET /render`

Lista todos os jobs em memória.

---

## Valores de `sceneConfig`

| Campo | Tipo | Padrão | Descrição |
|---|---|---|---|
| `resolution` | `[w, h]` | `[1920, 1080]` | Resolução do render |
| `samples` | `int` | `64` | Amostras Cycles (qualidade) |
| `hdri` | `string` | `"studio"` | `studio`, `outdoor`, `sunset`, `interior` |
| `hdriStrength` | `float` | `1.0` | Intensidade da iluminação HDRI |
| `camera.location` | `[x,y,z]` | `[0,-5,2]` | Posição da câmera |
| `camera.rotation` | `[rx,ry,rz]` | `[70,0,0]` | Rotação em graus |
| `objects[].type` | `string` | `"cube"` | `cube`, `sphere`, `cylinder`, `plane`, `cone` |
| `objects[].color` | `[r,g,b]` | `[0.8,0.8,0.8]` | Cor base (0–1) |
| `objects[].metallic` | `float` | `0.0` | 0 = plástico, 1 = metal |
| `objects[].roughness` | `float` | `0.5` | 0 = espelho, 1 = fosco |

---

## Notas

- **Memória**: jobs ficam em memória — reiniciar o servidor limpa a fila. Para persistência, substitua o dict `jobs` por uma tabela Supabase.
- **GPU**: o script tenta usar CUDA automaticamente; se não houver GPU disponível, usa CPU (mais lento).
- **Timeout**: cada render tem limite de 10 minutos (`timeout=600`).
- **Concorrência**: cada job roda em uma thread separada; muitos jobs simultâneos podem esgotar a RAM.
