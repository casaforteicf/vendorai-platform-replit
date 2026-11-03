/**
 * Importação — Web Worker.
 *
 * O trabalho pesado (parse de GLB/DXF) roda fora da thread da UI. O worker é burro de propósito:
 * recebe bytes e devolve o resultado de `processarArquivo` (que é testado fora do worker).
 *
 * WIRING PENDENTE (UI): `new Worker(new URL('./worker.ts', import.meta.url))` precisa de
 * configuração de worker no bundler do Next — fica para a tela nova, junto com o botão de importar.
 */

import { processarArquivo } from './processar';

interface PedidoWorker {
  nome: string;
  bytes: ArrayBuffer;
  idSolido: string;
}

interface ContextoWorker {
  onmessage: ((evento: MessageEvent<PedidoWorker>) => void) | null;
  postMessage: (mensagem: unknown) => void;
}

const contexto = globalThis as unknown as ContextoWorker;

contexto.onmessage = (evento: MessageEvent<PedidoWorker>): void => {
  const resultado = processarArquivo({
    nome: evento.data.nome,
    bytes: evento.data.bytes,
    idSolido: evento.data.idSolido,
  });
  contexto.postMessage(resultado);
};
