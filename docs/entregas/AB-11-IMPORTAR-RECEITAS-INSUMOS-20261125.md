# AB-11 — importar receitas gerando insumos e cadastro detalhado

Atualização: 2026-11-25. Branch: `feat/ab-import-ingredientes-20261125`.
Base: `8002db561`.

## Sintoma

Ao importar a ficha `01_Costelinhas ao Barbecue Caseiro.pdf`, o preview mostrava
**0 itens reconhecidos** e uma lista enorme de avisos. As linhas reais de
ingredientes estavam no formato `3 kg de costelinhas de porco`, enquanto o parser
só entendia `Nome: 3 kg`, e o modo de preparo era tratado como ingrediente.

## Correção da leitura

- O parser de receitas agora reconhece **quantidade → unidade → nome**
  (`3 kg de costelinhas`, `300 g ketchup`, `1,5 L de caldo`), além do formato
  nome → quantidade.
- Seções `Ingredientes` e `Modo de preparo` delimitam a leitura. Instruções
  depois do preparo não viram insumo.
- Rendimento é lido de `Porções: 6`, `Rende 6 porções` ou `Rendimento: 6`.
- Medidas caseiras comuns são convertidas: xícara/copo = 240 ml, colher de sopa
  = 15 ml, colher de chá = 5 ml, pitada = 1 g, dente/folha/ramo = 1 un.
- `Sal a gosto` / `q.b.` entra como 1 g para o insumo existir e ser ajustado.
- Ingredientes repetidos com a mesma unidade são somados.
- Linhas como `1 peça de aprox. 2 kg` usam o primeiro termo da receita
  (`Lagarto Recheado` → `Lagarto`) em vez de criar um insumo chamado
  “1 peça de aprox”.
- O aviso de linhas não lidas agora mostra até 5 linhas exatas para revisão.
- PDF/DOCX/CSV sem nenhum item agora retorna erro claro em vez de preview vazio.
- Avisos são resumidos (máximo de 8 na tela).

## Geração automática de insumos

- A confirmação de receita já criava o insumo ausente; agora o retorno informa
  **`insumosCriados`**.
- A tela de importação tem a opção **“Criar automaticamente os insumos/ingredientes
  que ainda não existem”**, ligada por padrão.
- Se desligada, a confirmação falha com `Ingrediente não cadastrado: ...` em vez
  de criar silenciosamente.
- Cada receita gera a ficha técnica, os vínculos de insumos e o catálogo
  `restaurante`; o custo usa o preço médio cadastrado.

## Quantidade por porção (correção do briffing)

- As quantidades lidas do PDF são da **receita inteira**. A confirmação divide
  pelo `rendimentoPorcoes` antes de gravar em `ab_ficha_insumos`.
- Exemplo: `3 kg de costelas` com rendimento 6 vira **500 g por porção**;
  150 hóspedes pedem 75 kg, não 450 kg.
- O preview avisa que a quantidade é total e será dividida pelo rendimento.
- As duas fichas existentes do tenant AJ foram corrigidas em produção
  (costelas 500 g/porção e lagarto 200 g/porção).

## Ingredientes sem duplicidade

- O parser remove a forma de preparo do nome: `cebola picada` → `cebola`,
  `cenoura cortada em tiras` → `cenoura`, `bacon em cubos pequenos` → `bacon`,
  `alho picado grosseiramente` → `alho`, `linguiça calabresa fresca em pedaços
  médios` → `linguiça calabresa` e `pimenta do reino preta` → `pimenta do reino`.
- Antes de criar um insumo, a importação procura no catálogo pela chave
  normalizada (sem acento, sem preparo e singularizada). Se existir, reutiliza e
  renomeia o cadastro para o nome limpo.
- O catálogo do tenant AJ foi normalizado e o `Lagarto` duplicado foi removido.

## Cadastro detalhado do item

Em **Restaurante → Ingredientes**, o formulário ganhou:

- **Preço médio** por kg/L/unidade base, com conversão para g/ml.
- **Fornecedor preferencial**.
- **Marca** e **fabricante**.
- Código, categoria e descrição já existentes.
- A lista mostra fornecedor/marca/fabricante abaixo do preço.

## Validação

- `vitest restaurante-importacao`: **13/13**, incluindo PDF com quantidade
  primeiro, modo de preparo ignorado, medidas caseiras e nome antes da quantidade.
- `tsc -p tsconfig.launch-ci.json --noEmit`: exit 0.
- `vite build`: exit 0.
