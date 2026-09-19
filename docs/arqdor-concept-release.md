# Arqdor Concept — Release Checklist

## Escopo

Branch de release:

`feat/arqdor-concept-parametric-openings`

Base integrada da `main`:

`ad04c0b35c4bed775a974bd1e07a9de8ccf9a02c`

Merge de sincronização do branch:

`270d54095614fc99602d85b5259caf66f06af997`

O branch está sincronizado com a `main` e preserva a implementação completa do Concept.

## Funcionalidades incluídas

- Portas e janelas paramétricas
- Escadas paramétricas e abertura real da laje
- Cobertura paramétrica
- Biblioteca de móveis e objetos
- Validações arquitetônicas
- Modelo 3D e materialidade
- Editor mobile/touch
- Modelo derivado centralizado entre 2D, 3D e fachada
- Persistência única do Concept
- Render conceitual
- Promoção para Projeto Arqdor
- Sincronização seletiva de `arq_objects`
- Sincronização seletiva de `arq_materials`
- Resolução segura do tenant efetivo para Super Admin
- Isolamento do rascunho ao trocar de tenant
- Salvamento obrigatório antes da promoção

## Banco de dados

**Não há migração de banco necessária para esta release.**

As extensões de dados foram feitas em colunas JSONB já existentes:

- `arch_concept_projects.configuration`
- `arch_concept_projects.rooms`
- `arch_concept_projects.facade_preferences`
- `arq_objects.position`

As tabelas profissionais já possuem os campos usados pela promoção:

- `arq_objects`
- `arq_materials`

## Ordem de publicação

1. Integrar o branch na `main`.
2. Aguardar o Railway concluir o deploy do serviço `vendorai-platform-replit`.
3. Confirmar status Railway `SUCCESS`.
4. Confirmar healthcheck da API em `/api/auth/healthz`.
5. Aguardar o frontend Cloudflare concluir o deploy da `main`.
6. Confirmar Cloudflare `Deployed successfully`.
7. Executar o smoke test abaixo.

O backend deve entrar antes ou junto do frontend para que o salvamento do tenant efetivo esteja disponível quando o novo Concept abrir.

## Smoke test pós-deploy

### Sessão / tenant

- Abrir como tenant normal.
- Salvar um novo pré-projeto.
- Abrir como Super Admin com tenant selecionado.
- Confirmar que o rascunho pertence apenas ao tenant selecionado.
- Trocar de tenant e confirmar que dados da empresa anterior não permanecem no editor.

### Editor

- Criar/abrir um Concept.
- Verificar planta 2D.
- Verificar 3D.
- Verificar Fachada.
- Abrir Render sem erro.
- Testar painéis Itens, Mais e Ajustes.
- Testar wall-first.
- Criar/editar porta e janela.
- Criar/editar escada.
- Alterar cobertura.
- Inserir e mover um objeto.
- Trocar material de piso/parede/cobertura.
- Salvar e reabrir.

### Promoção

- Informar nome + telefone ou e-mail do cliente.
- Enviar ao profissional.
- Confirmar criação/vínculo com Projeto Arqdor.
- Confirmar objetos com origem `source:arqdor_concept`.
- Confirmar materiais com origem `source:arqdor_concept`.
- Confirmar que objetos e materiais criados manualmente no Projeto Arqdor não são removidos em uma nova sincronização.

## Critérios de aceite

A release é aceita quando:

- Railway = `SUCCESS`
- Cloudflare = `Deployed successfully`
- Salvar pré-projeto funciona
- Reabrir preserva o modelo
- Troca de tenant não cruza dados
- 2D, 3D e fachada continuam derivados do mesmo modelo
- Promoção cria/vincula o Projeto Arqdor
- Objetos e materiais promovidos permanecem seletivos e não destrutivos

## Rollback

Se o backend falhar após integração:

1. Não executar alterações manuais no banco.
2. Reverter o merge da release na `main`.
3. Aguardar o redeploy automático do Railway.
4. Confirmar `SUCCESS` e healthcheck.
5. Reverter/republicar o frontend correspondente se necessário.

Como não há migração de banco nesta release, o rollback não exige rollback de schema.
