# FIX — prévia “Orçamento completo” quebrando o JSON

Atualização: 2026-11-24. Branch: `fix/proposta-print-json`.
Base: `2a07e6156`.

## Sintoma

Em `/propostas/:id/print`, ao abrir **“Orçamento completo · impressão e PDF”**,
o modal exibia:

```
Expected ',' or '}' after property value in JSON at position 91193 (line 1 column 91194)
```

O PDF não abria e o botão “Tentar novamente” repetia o erro.

## Causa

O `publicSiteGeneratorRouter` (site intelligence) envolvia `res.send` **globalmente**
e injetava o `<script id="vendorai-site-intelligence">` em qualquer string que
contivesse `</body>`. A rota `GET /api/propostas/:id/print-document` responde
`res.json({ html })` — o HTML do orçamento contém `</body>`, então o middleware
inseria o script **cru dentro do JSON**, quebrando a serialização. O erro
aparecia na leitura de `response.json()` no frontend.

Afetava qualquer JSON que carregasse HTML no corpo (não só propostas).

## Correção

`site_generator.ts`:

- Só injeta o script quando a resposta é **HTML**:
  - `Content-Type` `text/html`; ou
  - sem `Content-Type` e o corpo começa com `<!DOCTYPE html>`/`<html>`.
- Nunca injeta quando `Content-Type` é `application/json`/`+json`.
- Mantém a injeção nos sites públicos gerados.

## Testes

`src/__tests__/site-intelligence-injection.test.ts` — **3/3**:

1. JSON com HTML dentro **não** recebe o script e continua parseável.
2. HTML com `Content-Type` explícito recebe o script.
3. HTML sem `Content-Type` explícito recebe o script.

## Verificação com a proposta real

Proposta `bb529348-00f9-4d86-a0b1-2dda000658f6` (tenant `f437c65b-...`):

- API local com o código corrigido + banco de produção: `GET /api/propostas/:id/print-document`
  → **200**, JSON válido, `html_len=87185`, sem `vendorai-site-intelligence`.
- Antes: 200 com JSON inválido (parser quebrava no script injetado).

Nenhum dado de proposta foi alterado.

## Validação

- `tsc` completo da API: exit 0.
- `node build.mjs`: exit 0.
- Teste acima: 3/3.

## Estado

Implementado e validado tecnicamente. Sem merge/deploy automático.
Próximo passo: revisar/mergear e validar a abertura da prévia e o “Baixar PDF completo”.
