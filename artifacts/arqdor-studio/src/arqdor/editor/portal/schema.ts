/**
 * ARQDOR STUDIO 2.0 — Portal do cliente (contrato).
 *
 * E15 (aplicada): o token deixou de ser credencial de API.
 *  - Banco guarda apenas `tokenHash`; o token em texto existe só no link entregue.
 *  - Primeiro acesso troca token por SESSÃO curta (cookie HttpOnly) — token não viaja
 *    em toda requisição, não vaza em log/referrer/histórico.
 *  - `PATCH` de comentário é restrito ao autor (IDOR fechado).
 *  - Aprovação identifica a PESSOA e o QUE foi aprovado (hash da versão); IP/UA são
 *    evidência adicional, nunca identidade.
 *  - Datas em ISO 8601 (DTO atravessa JSON; `Date` não sobrevive à serialização).
 */

export interface PortalPermissoes {
  visualizar: boolean;
  comentar: boolean;
  aprovar: boolean;
  ver_orcamento: boolean;
}

/** Registro de link (server-side). O token em claro nunca é armazenado. */
export interface PortalLink {
  id: string;
  projetoId: string;
  clienteId: string;
  /** SHA-256 do token — o valor original só aparece na URL entregue ao cliente. */
  tokenHash: string;
  expiraEm?: string;
  permissoes: PortalPermissoes;
  acessos: number;
  ultimoAcesso?: string;
}

/** Sessão curta obtida na troca do token. É o que autentica as requisições. */
export interface PortalSessao {
  id: string;
  linkId: string;
  projetoId: string;
  permissoes: PortalPermissoes;
  expiraEm: string;
}

/**
 * O portal é READ-ONLY sobre o documento. As duas únicas escritas permitidas
 * são anotação e aceite — nenhuma toca BIM, Modelador, MEP ou Render.
 */
export type EscritaPermitidaPortal = 'comentario' | 'aprovacao';

export interface PortalComentario {
  id: string;
  linkId: string;
  autorTipo: 'cliente' | 'arquiteto';
  /** Obrigatório: sem autor não há como restringir PATCH/DELETE. */
  autorId: string;
  posicao3d?: [number, number, number];
  cameraEstado?: { posicao: [number, number, number]; alvo: [number, number, number] };
  texto: string;
  resolvido: boolean;
  criadoEm: string;
}

export type EtapaAprovacao = 'conceito' | 'executivo' | 'final';

export interface PortalAprovacao {
  id: string;
  linkId: string;
  etapa: EtapaAprovacao;
  aprovado: boolean;
  observacao?: string;
  /** Identidade de quem aprovou (não inferida de IP). */
  aprovador: { nome: string; email: string; documento?: string };
  /** SHA-256 do snapshot do projeto aprovado — prova o QUE foi aprovado. */
  hashProjeto: string;
  versaoProjeto: string;
  /** Evidência adicional, não identidade. */
  ip?: string;
  userAgent?: string;
  criadaEm: string;
}