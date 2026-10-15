# CRM-3520 — imagem de capa e logo no PDF v1

2026-10-15. Branch fix/proposta-pdf-imagens-autenticadas-20261015.

Problema reportado: PDF da proposta Isabella Balbrasto Maia P001 R26 baixado com capa e logo quebradas. Caminho encontrado no código: storage privado exige sessão; Chromium acessava localhost sem autorização. O gerador aceitava imagens com evento error e ainda exportava o PDF.

Implementação: incorpora imagens de storage em data URLs antes de renderizar/exportar, usando autorização e cookie da requisição somente em chamada ao storage da própria API em loopback. A API de storage preserva isolamento por tenant e pastas bloqueadas. Não usa service role para contornar permissões. Hosts externos nunca recebem credenciais. Redirecionamentos não são seguidos. Deduplicação, limites de tamanho e concorrência, checagem de MIME e erro explícito se não houver imagem. Imagens CSS suportadas. Sessão não é incluída no HTML final.

Abrange PDF e HTML de proposta comercial, PDF do orçamento e prévia de impressão completa. Imagens incorporadas não dependem de URLs privadas após download. Chromium aguarda imagens e recusa gerar PDF com imagem ausente; ausência não é convertida em fallback HTML silencioso. Geração automática sem sessão deve usar imagens já públicas/assinadas ou fornecer contexto autorizado; fontes privadas sem acesso produzem erro.

Validação local: dez testes aprovados, TypeScript backend launch-ci aprovado, build backend aprovado (2169ms), diff check aprovado. Sem geração visual real com Chromium ou validação da proposta autenticada em produção. Não foi instalado frontend ou banco. Sem migrations.

ReleaseStatus Contabo CRM-3520: LOT_NOT_REGISTERED; BUILD=BLOCKED; PRODUCTION=untouched. Integrador deve registrar lote/SHA, executar gates completos e homologar antes da promoção. Sem merge/deploy executado.
