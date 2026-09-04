/**
 * A integração da Biblioteca de Mídias foi incorporada diretamente ao composer
 * de Conversas. Este componente permanece como no-op temporário porque ainda é
 * montado em main.tsx junto dos demais bridges globais; mantê-lo neutro evita
 * duplicar UI e, principalmente, elimina a antiga interceptação global de
 * window.fetch para anexar mídia ao "próximo envio".
 */
export function MediaConversationsBridge() {
  return null;
}
