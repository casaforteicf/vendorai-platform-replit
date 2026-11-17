/**
 * ARQDOR STUDIO 2.0 — Vídeo (contrato).
 *
 * E13 (aplicada): `MediaRecorder` NÃO captura canvas de worker — `OffscreenCanvas`
 * não tem `captureStream()`, e `MediaRecorder` só aceita `MediaStream`.
 * Caminho principal passa a ser WebCodecs (`VideoEncoder`); `MediaRecorder` fica como
 * fallback declarado, na thread principal, com aviso de que a aba precisa ficar em foco.
 *
 * E14 (aplicada): modelo de memória explícito. Encoder incremental com no máximo
 * `maxFramesEmVoo` frames em voo. 60 s × 30 fps 1080p bufferizados seriam ~15 GB.
 */

export type ModoVideo = 'rapido' | 'final';

export interface CameraKeyframe {
  /** Segundos desde o início do vídeo. */
  tempo: number;
  posicao: [number, number, number];
  alvo: [number, number, number];
  fov: number;
  easing: 'linear' | 'ease_in_out' | 'ease_in' | 'ease_out';
}

export interface CameraPath {
  keyframes: CameraKeyframe[];
  loop: boolean;
}

export type EstrategiaCodificacao =
  | { tipo: 'webcodecs'; codec: 'vp09.00.10.08' | 'avc1.42001f'; muxer: 'webm' | 'mp4' }
  | { tipo: 'mediarecorder'; mimeType: string; exigeAbaEmFoco: true };

export interface OpcoesRenderVideo {
  resolucao: { largura: number; altura: number };
  fps: 24 | 30 | 60;
  duracaoSegundos: number;
  qualidade: 'rascunho' | 'media' | 'alta';
  estrategia: EstrategiaCodificacao;
  /** E14: teto de frames simultâneos (1..8). Nunca acumula o vídeo inteiro. */
  maxFramesEmVoo: number;
  bitrateKbps: number;
}

export interface ProgressoRenderVideo {
  framesRenderizados: number;
  totalFrames: number;
  /** Estimativa para a UI; não é promessa de tempo total. */
  restanteSegundos?: number;
}

export interface RenderVideo {
  id: string;
  projetoId: string;
  modo: ModoVideo;
  camera: CameraPath;
  opcoes: OpcoesRenderVideo;
  status: 'pendente' | 'renderizando' | 'pronto' | 'erro' | 'cancelado';
  progresso: ProgressoRenderVideo;
  resolucaoEfetiva: { largura: number; altura: number };
  /** Reduzida automaticamente quando o orçamento estoura (degradação declarada). */
  degradado: boolean;
  url?: string;
  thumbnailUrl?: string;
  criadoEm: string;
  concluidoEm?: string;
}

/**
 * Contrato do codificador. `enviarFrame` DEVE respeitar backpressure
 * (não retornar antes de o encoder aceitar o próximo frame).
 */
/** Quadro pronto para codificar. Quem recebe o quadro é dono de chamar `fechar()`. */
export interface QuadroVideo {
  readonly largura: number;
  readonly altura: number;
  /** Libera o buffer nativo. Obrigatório: sem isso o decoder/encoder vaza memória. */
  fechar(): void;
}

export interface CodificadorVideo {
  readonly tipo: EstrategiaCodificacao['tipo'];
  /** Frames aceitos e ainda não codificados (métrica de backpressure). */
  readonly emVoo: number;
  iniciar(opcoes: OpcoesRenderVideo): Promise<void>;
  /**
   * Entrega um frame. Resolve apenas quando o encoder aceitou (nunca antes de
   * `emVoo < maxFramesEmVoo`). A implementação chama `frame.fechar()` sempre —
   * inclusive em erro.
   */
  enviarFrame(frame: QuadroVideo, timestampUs: number): Promise<void>;
  /** Espera `emVoo` chegar a zero. Obrigatório antes de `finalizar()`. */
  drenar(): Promise<void>;
  finalizar(): Promise<Blob>;
  cancelar(): Promise<void>;
}