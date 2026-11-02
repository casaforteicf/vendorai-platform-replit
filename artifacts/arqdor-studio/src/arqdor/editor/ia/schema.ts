/**
 * ARQDOR STUDIO 2.0 — IA orquestradora (contrato).
 *
 * Regra D9: a IA não executa nada. Toda tool_call vira operação de domínio existente,
 * passa por `AplicarPasso` e entra no histórico como UM passo.
 *
 * Correções aplicadas:
 *  - E4: `ResultadoIA` com sucesso NÃO exige mais `passoUndoId` (memorial e leitura não
 *    alteram documento). O campo virou `passo: Passo | null` — null = nada a desfazer.
 *  - E7/E5: o campo `store` (singular) foi removido; quem carrega os escopos é o `Passo`.
 *  - E17: aprovação estrutural deixou de ser boolean no DTO e virou registro verificável.
 */

import type { Passo } from '../transacao';

export type IATipo =
  | 'layout'
  | 'decoracao'
  | 'memorial'
  | 'terreno'
  | 'cronograma'
  | 'estrutura'
  | 'solar';

export interface ToolCallIA {
  nome: string;
  argumentos: Record<string, unknown>;
  resultado?: { ok: boolean; erro?: string };
}

export interface TransacaoIA {
  id: string;
  tipo: IATipo;
  prompt: string;
  contexto: Record<string, unknown>;
  toolCalls: ToolCallIA[];
  status: 'pendente' | 'aplicada' | 'revertida' | 'erro';
  /** Passo efetivamente aplicado (null em memorial/leitura). */
  passo?: Passo;
}

export type IAErro =
  | { codigo: 'API_INDISPONIVEL'; provedor: 'openai' | 'anthropic' }
  | { codigo: 'TOOL_CALL_INVALIDA'; tool: string; detalhe: string }
  | { codigo: 'OPERACAO_NAO_SUPORTADA'; tool: string }
  | { codigo: 'ROLLBACK_FALHOU'; passoId: string; recuperacao: 'restaurar_snapshot' | 'congelar_sessao' }
  | { codigo: 'LIMITE_TOKENS'; usado: number; limite: number }
  | { codigo: 'PROMPT_INSEGURO'; motivo: string };

export type ResultadoIA =
  | { ok: true; transacao: TransacaoIA; passo: Passo | null }
  | { ok: false; erro: IAErro; transacao: TransacaoIA };

// ---------- IA E (estrutura) — E17 ----------

export type SistemaEstrutural =
  | 'concreto_armado'
  | 'metalica'
  | 'madeira'
  | 'alvenaria_estrutural';

/**
 * Registro de aprovação estrutural. Vive no servidor, com autoria verificável.
 * `application` só executa se este registro existir e o `hashCalculo` casar com o
 * memorial gerado — um booleano no payload não prova nada.
 */
export interface AprovacaoEstrutural {
  id: string;
  projetoId: string;
  engenheiro: { nome: string; crea: string };
  /** SHA-256 do memorial de cálculo aprovado. */
  hashCalculo: string;
  versaoProjeto: string;
  /** ISO 8601. */
  assinadaEm: string;
  artNumero?: string;
}

export interface EstruturaInput {
  projetoId: string;
  sistemaEstrutural: SistemaEstrutural;
  normas: ('NBR_6118' | 'NBR_8800' | 'NBR_7190' | 'NBR_16868')[];
  cargas?: { permanente: number; acidental: number; vento: number };
  /** E17: id do registro de aprovação. Ausente ⇒ aplicar_secao recusa. */
  aprovacaoId?: string;
}