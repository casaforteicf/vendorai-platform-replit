# UI-01.7 — Handoff do pré-projeto público para conta universal

PR #3453 · Issue #3452

## Componentes existentes (confirmados)
- `/projeto/:slug` usa `PublicConceptSignup.tsx`.
- `GET /api/public/arqdor/:slug` consulta o perfil do link público e recursos do market.
- `POST /api/public/arqdor/:slug/cadastro` cria sessão restrita a um conceptId.
- `signGuestConceptToken` emite credencial `accessScope=preprojeto` cujo `sub` é o proprietário profissional do link, NÃO a identidade pessoal do visitante.
- O editor público reutiliza `ConceptPlanner` em modo convidado.

## Regra crítica
**Nunca associar automaticamente o pré-projeto à conta a partir do `sub` do JWT convidado.**
Esse `sub` designa o profissional responsável pelo link e não identifica o consumidor.
Uma transferência indevida pode expor projetos de outros clientes.

## Contrato de continuidade desejado (pendente de implementação)
1. Exibir convite opcional de instalação/login após criação e salvamento do pré-projeto.
2. Vinculação requer login real da pessoa + comprovação da posse do token convidado válido + prova adicional de titularidade (p.ex., confirmação no e-mail/telefone fornecido originalmente) e confirmação explícita.
3. Backend valida tenant, conceptId, vínculo com lead, status, consumo único de desafio, expiração e trilha de auditoria.
4. Uma transação idempotente cria membership do consumidor ao projeto, preservando IDs e histórico; não muda a propriedade do tenant.
5. Invalidar credenciais de handoff consumidas; permitir acesso futuro somente pelo vínculo autenticado.
6. Após vínculo, redirecionar para `Minha Jornada` e oferecer Studio/download conforme dispositivo e entitlement, sem conceder permissões profissionais por padrão.
7. Acesso de fornecedor, corretor, coproprietário e construtora sempre por convites/autorização independente.
8. Marketplace, split de pagamentos e seguros entram na etapa de contratação; são módulos independentes, não ampliam automaticamente o acesso ao projeto.

## Entrega efetiva deste corte
- `preprojectJourney.ts`: contrato de estados, links públicos e ações sugeridas.
- `preprojectJourney.test.ts`: validação de IDs e necessidade de sessão autenticada para etapas avançadas.
- **Não existe endpoint de claim/vinculação nesta entrega**; nenhum cadastro, token, rota pública ou UX ativa foi alterado.

## Próximos testes
- Executar Vitest + typecheck.
- Testar fluxo público atual com links válidos/inválidos.
- Projetar tabela de membership e desafio de claim sem reutilizar `sub` do convidado.
- Homologar isolamento cross-tenant e revogação antes de habilitar login progressivo.
