# VendorAI Blender Server

Servidor Python/Flask que executa o **Blender 3.6.5 em modo headless** para gerar renders 3D de projetos de interiores. Integra com o Supabase do VendorAI para armazenar as imagens geradas.

---

## Passo a passo de deploy

### 1. Criar novo Replit Python

1. Acesse [replit.com](https://replit.com) → **Create Repl**
2. Template: **Python**
3. Nome: `vendorai-blender-server`
4. Clique em **Create Repl**

---

### 2. Copiar os arquivos

No editor do Replit, crie cada arquivo abaixo e cole o conteúdo correspondente:

| Arquivo | Descrição |
|---|---|
| `main.py` | Servidor Flask principal |
| `blender_render.py` | Script executado dentro do Blender |
| `requirements.txt` | Dependências Python |
| `install_blender.sh` | Instala o Blender |
| `download_hdri.sh` | Baixa as HDRIs de iluminação |
| `.env` | Variáveis de ambiente (ver passo 5) |

Você pode usar o botão **Upload file** ou criar cada arquivo pelo editor.

---

### 3. Instalar dependências Python

No **Shell** do Replit:

```bash
pip install -r requirements.txt
```

---

### 4. Instalar o Blender headless

```bash
bash install_blender.sh
```

O script vai:
- Instalar dependências de sistema (`libx11`, `libGL`, etc.)
- Baixar o Blender 3.6.5 Linux x64 (~200 MB) de um mirror oficial
- Extrair em `/opt/blender/`
- Verificar o binário e imprimir a versão
- Criar a pasta `/opt/blender/hdri/`

⏱️ Tempo estimado: **3–5 minutos**

> **Nota**: se o Replit não tiver permissão de escrita em `/opt`, o script falhará.
> Nesse caso, edite `install_blender.sh` e `main.py` trocando `/opt/blender` por `$HOME/blender`.

---

### 5. Baixar as HDRIs de iluminação

```bash
bash download_hdri.sh
```

Baixa 3 HDRIs gratuitas (CC0) do Poly Haven para `/opt/blender/hdri/`:

| Arquivo local | Preset | Uso ideal |
|---|---|---|
| `interior_warm.hdr` | `"interior_warm"` | Sala de estar, quarto |
| `interior_cool.hdr` | `"interior_cool"` | Escritório, cozinha |
| `natural.hdr` | `"natural"` | Espaços com luz natural |

⏱️ Tempo estimado: **1–2 minutos (~60–90 MB)**

---

### 6. Configurar o arquivo `.env`

Crie o arquivo `.env` na raiz do Replit com o conteúdo abaixo:

```env
# Gere um UUID em: https://www.uuidgenerator.net/
BLENDER_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# URL e chave do seu projeto Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_KEY=sua-service-role-key

PORT=8080
```

**Onde encontrar os valores do Supabase:**

1. Acesse o painel do seu projeto Supabase → **Settings → API**
2. Copie:
   - **Project URL** → `SUPABASE_URL`
   - **service_role (secret)** → `SUPABASE_KEY` *(não a anon key)*

**Criar o bucket de imagens:**

No Supabase → **Storage → New bucket**:
- Nome: `arch-renders`
- Visibilidade: **Public** ✓

---

### 7. Rodar o servidor

```bash
python main.py
```

Saída esperada:

```
  VendorAI Blender Server
  Porta     : 8080
  Blender   : Blender 3.6.5
  Output dir: /tmp/renders
```

Para manter o servidor rodando, você pode usar o botão **Run** do Replit (que executa `python main.py` automaticamente).

---

### 8. Conectar ao VendorAI principal

1. Copie a URL do seu Replit Blender Server. Ela segue o padrão:
   ```
   https://vendorai-blender-server.seuusuario.repl.co
   ```

2. No **Replit do VendorAI principal**, adicione as secrets:

   | Secret | Valor |
   |---|---|
   | `BLENDER_SERVER_URL` | `https://vendorai-blender-server.seuusuario.repl.co` |
   | `BLENDER_SECRET` | Mesmo valor do `.env` do blender-server |

3. O VendorAI já está configurado para usar essas variáveis ao chamar `POST /render`.

---

## Referência da API

### Autenticação

Todas as rotas (exceto `/health`) exigem o header:
```
X-Blender-Secret: <valor do BLENDER_SECRET>
```

---

### `GET /health`

Verifica se o servidor e o Blender estão funcionando.

**Sem autenticação.** Resposta:
```json
{
  "status": "ok",
  "blender_version": "Blender 3.6.5",
  "timestamp": "2025-01-01T12:00:00Z"
}
```

---

### `POST /render`

Inicia um job de render em background.

**Body JSON:**
```json
{
  "jobId": "uuid-opcional",
  "cenaId": "uuid-da-cena-no-banco",
  "tenantId": "uuid-do-tenant",
  "sceneConfig": {
    "resolution": [1920, 1080],
    "samples": 64,
    "hdri": "interior_warm",
    "hdriStrength": 1.0,
    "room": {
      "width": 6.0,
      "depth": 6.0,
      "height": 2.8,
      "wallColor": [0.92, 0.92, 0.92],
      "floorColor": [0.55, 0.45, 0.35],
      "floorRoughness": 0.7,
      "floorMetallic": 0.0
    },
    "camera": {
      "location": [0, -5, 1.6],
      "target": [0, 0, 1.0],
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
      },
      {
        "type": "mesa",
        "name": "Mesa de Centro",
        "location": [0, -0.5, 0],
        "color": [0.6, 0.4, 0.2],
        "metallic": 0.1,
        "roughness": 0.4
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

Consulta o status de um job de render.

**Resposta:**
```json
{
  "jobId": "uuid",
  "status": "aguardando | processando | concluido | erro",
  "imageUrl": "https://...supabase.co/storage/v1/object/public/arch-renders/.../uuid.png",
  "erro": null,
  "updatedAt": "2025-01-01T12:05:00Z"
}
```

O campo `imageUrl` é preenchido apenas quando `status == "concluido"`.  
O campo `erro` é preenchido apenas quando `status == "erro"`.

---

### `GET /render`

Lista todos os jobs em memória (reiniciar o servidor apaga a lista).

---

## Tipos de objetos suportados

| `type` | Geometria gerada |
|---|---|
| `sofa` | Base + encosto + 2 braços |
| `mesa` | Tampo + 4 pernas |
| `cadeira` | Assento + encosto + 4 pernas |
| `cama` | Estrado + colchão + cabeceira |
| `armario` | Corpo + 2 portas |
| `luminaria` | Haste + cúpula emissiva + ponto de luz |
| `janela` | Marco + vidro transparente |
| `porta` | Folha + maçaneta metálica |

## Parâmetros do `sceneConfig`

| Campo | Tipo | Padrão | Descrição |
|---|---|---|---|
| `resolution` | `[w, h]` | `[1920, 1080]` | Resolução do render |
| `samples` | `int` | `64` | Amostras Cycles (64 = rápido, 256+ = alta qualidade) |
| `hdri` | `string` | `"interior_warm"` | `interior_warm`, `interior_cool`, `natural` |
| `hdriStrength` | `float` | `1.0` | Intensidade da iluminação HDRI |
| `room.width/depth/height` | `float` | `6/6/2.8` | Dimensões do ambiente em metros |
| `room.wallColor` | `[r,g,b]` | `[0.92, 0.92, 0.92]` | Cor das paredes (0–1) |
| `room.floorColor` | `[r,g,b]` | `[0.55, 0.45, 0.35]` | Cor do piso (0–1) |
| `camera.location` | `[x,y,z]` | `[0,-5,1.6]` | Posição da câmera |
| `camera.target` | `[x,y,z]` | `[0,0,1.0]` | Ponto para onde a câmera aponta |
| `camera.fov` | `float` | `60` | Campo de visão em graus |
| `objects[].color` | `[r,g,b]` | `[0.8,0.8,0.8]` | Cor base (0–1) |
| `objects[].metallic` | `float` | `0.0` | 0 = plástico / 1 = metal |
| `objects[].roughness` | `float` | `0.5` | 0 = espelho / 1 = totalmente fosco |

---

## Observações

- **Memória**: os jobs ficam em `jobs_status` (dict em memória). Reiniciar o processo apaga todos. Para persistência, substitua por uma tabela Supabase.
- **CPU**: o render usa Cycles CPU por padrão. Com GPU (CUDA), o servidor detecta e usa automaticamente — mas Replits padrão não têm GPU.
- **Tempo**: 64 samples em 1920×1080 CPU leva ~3–8 min dependendo da complexidade. Reduza `samples` para 32 em testes rápidos.
- **Timeout**: cada job tem limite de 10 minutos (`timeout=600` em `execute_render`).
