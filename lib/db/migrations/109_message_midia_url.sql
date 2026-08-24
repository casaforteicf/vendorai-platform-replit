-- no-transaction
-- Anexos (imagem/vídeo/documento/áudio) em conversas — botão de anexar
-- do chat interno. midia_url guarda a URL pública do arquivo (nosso
-- object storage); tipo_conteudo (já existia) diferencia texto/imagem/
-- audio/documento/video na exibição.
--
-- Arquivo roda SEM transação (marcador acima) porque ALTER TYPE ...
-- ADD VALUE não pode executar dentro de uma transação explícita que
-- também vai usar esse valor novo na mesma transação.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS midia_url TEXT;

-- "video" era tratado como "documento" antes — valor novo pra exibir
-- corretamente (player de vídeo em vez de link de arquivo genérico).
ALTER TYPE message_tipo_conteudo ADD VALUE IF NOT EXISTS 'video';
