# Biblioteca visual do Dublê — plano de validação

1. Abrir Vídeo com IA > Pessoas & Vozes e selecionar uma identidade ativa.
2. Confirmar que a seção “Biblioteca visual do Dublê” aparece antes do teste de fidelidade/geração.
3. Em Ambiente real, Cenário / inspiração e Roupa / look:
   - informar um nome;
   - enviar JPG, PNG ou WebP;
   - confirmar preview da imagem e selo “Em uso”.
4. Em cada categoria, enviar uma segunda imagem e confirmar que a anterior passa a ficar inativa.
5. Selecionar novamente uma imagem antiga com “Usar” e confirmar exclusividade por categoria.
6. Usar “Automático” e confirmar que nenhuma referência daquela categoria fica ativa.
7. Excluir uma referência e confirmar que ela some da biblioteca.
8. Gerar prévia/ vídeo do Dublê com ambiente e roupa ativos e confirmar:
   - identidade facial preservada pela imagem 1;
   - ambiente seguindo prioritariamente a referência real;
   - vestimenta seguindo a referência de roupa;
   - pessoas/rostos/textos/logos presentes nas referências não são copiados para a identidade.
9. Gerar novamente sem referências ativas e confirmar fallback para o catálogo automático existente.
10. Validar que todos os assets continuam tenant-scoped e vinculados ao identityId correto.
