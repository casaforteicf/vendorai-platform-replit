# ALINHA-01 — Qualidade dos criativos gerados por IA

Data: 2026-11-27 · Escopo: produção automática de imagens do Marketing (todos os tenants)
Estado: **correção implementada e publicada no lote de imagem**; sem publicação de conteúdo.

## Sintoma observado

Criativos do Plano de Mídia saíam "desconexos" do negócio: no caso AJ Termas, uma imagem
gerada era um **mockup de folheto impresso** ("AJ Termas Hotel Iraí / PACOTES 2027") cercado
de toalhas e sais de banho — com texto embutido, embora o prompt pedisse "no text".

## Causa raiz (evidência real)

1. **Referência privada inacessível.** A tela passava `/api/storage/objects/...` para o
   gerador; o backend baixava por HTTP interno **sem sessão** e recebia 401. O fallback era
   texto→imagem, sem nenhuma foto real do hotel. (O tenant tinha 19 fotos reais na Biblioteca,
   incluindo piscina, nenhuma usada.)
2. **Nome da marca vazio.** `business_profiles.nome_fantasia` do tenant está vazio; o prompt
   saía com `Brand: "a empresa"` em vez de "Aj termas irai".
3. **Conceitos de fotografia de produto.** O gerador aplicava sempre a mesma sequência
   "hero product / macro / flat-lay", mesmo para hotelaria/serviços.
4. **Prompt meta.** No fallback, o texto "Improve this product/marketing image..." virava o
   *subject* da geração — pedindo para "melhorar" uma imagem que não existia.
5. **Zero direção de campanha na imagem.** Produto, público, região, oferta e mensagem não
   chegavam ao prompt de imagem; só o texto longo do planejamento.

## Correção implementada

- **Direção visual por tipo de negócio** (`lib/vendor-brain/src/image-direction.ts`, 7 testes):
  detecta hotelaria, food, imobiliário, varejo e serviço a partir do produto/tema/vertical e
  escolhe cenas coerentes. Hotelaria usa suíte/piscina/café da manhã/entorno — nunca flat-lay.
- **Assinatura da referência privada**: `fetchImageBuffer` assina objetos `/objects/...` via
  `ObjectStorageService` antes do download. Validado em produção: **200, 1,7 MB** na foto real.
- **Nome de marca**: fallback `Perfil.nomeFantasia → tenants.nomeEmpresa → tenants.name`.
- **Briefing visual**: assunto curto (produto + região + tema) em vez do texto inteiro;
  inclui produto, público, região, oferta, mensagem e campanha.
- **Referência preferencial**: a tela usa **foto real do tenant** (upload/imported) como
  referência; imagem já gerada não é usada como referência (evita recursão).
- **Prompt final** com estilo editorial realista, restrições negativas explícitas
  (sem texto, sem logotipo, sem colagem, sem distorção) e "não inventar amenities".
- **Rastreabilidade**: o prompt e `imageDirection`/`visualSubject` ficam no metadata do asset;
  o `contextAudit` guarda o `visualBrief` da campanha para regenerações.

## O que ainda pode ser feito (próximos passos de qualidade)

1. **Camada de texto/branding determinística**: gerar a foto limpa e aplicar headline/CTA/logo
   por código, em vez de pedir texto à IA (que às vezes ignora o "no text").
2. **Biblioteca aprovada**: marcar fotos oficiais (piscina, quartos) como `final_material` e
   priorizá-las; hoje o `aiRole` não é preenchido para o AJ.
3. **QA visual**: usar visão para detectar texto/folheto/colagem na imagem gerada e regenerar
   automaticamente (custo por imagem; habilitar por plano).
4. **Série coerente**: uma imagem "hero" por campanha, reaproveitada como referência das
   demais para manter paleta e cenário.
