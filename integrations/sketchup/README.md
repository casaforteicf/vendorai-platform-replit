# Arqdor Sync para SketchUp

Extensão inicial para sincronizar o modelo aberto no SketchUp com um pré-projeto do Arqdor.

## Fluxo

1. O SketchUp exporta o modelo atual para GLB.
2. A extensão gera um manifesto JSON com materiais, definições, instâncias e cenas.
3. O pacote é enviado para:
   `POST /api/arch/concept-projects/:id/sketchup-sync`
4. O Arqdor preserva o GLB e o manifesto como fonte do projeto.

## Instalação de desenvolvimento

Empacote `arqdor_sync.rb` e a pasta `arqdor_sync/` em um RBZ e instale pelo Extension Manager do SketchUp.

## Compatibilidade

O envio depende de uma versão do SketchUp cuja API de exportação suporte GLB. Em versões anteriores, use IFC/DXF ou o conversor SKP server-side quando o worker estiver disponível.

## Segurança

O protótipo solicita um token do VendorAI. Antes da distribuição pública, substituir por um fluxo de pareamento com código temporário para não persistir token longo nas preferências do SketchUp.
