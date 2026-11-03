'use client';

/**
 * Chat mínimo do Vendi IA (o DeepSeek refaz o visual depois).
 *
 * A UI só orquestra: contexto → API → plano → executor → ponte. Nenhuma regra de geometria aqui.
 */

import { useState } from 'react';
import { FAMILIAS_PADRAO } from '../biblioteca/familias';
import { catalogoPadrao } from '../materiais/catalogo';
import { projetoAtivoId } from '../persistencia/localStore';
import { useBIMStore } from '../stores/useBIMStore';
import { useChatIAStore } from '../stores/useChatIAStore';
import { useModeladorStore } from '../stores/useModeladorStore';
import { mensagemDoResultado, montarPlanoDoChat } from './chat-core';
import type { RespostaChat } from './chat-core';
import { resumirDocumento } from './contexto';
import { executarPlano } from './executor';
import type { EstadoIa } from './ferramentas';
import { aplicarPassoDaIA } from './integracao';

interface Linha {
  papel: 'usuario' | 'ia' | 'erro';
  texto: string;
}

export function ChatIA() {
  const aberto = useChatIAStore((s) => s.aberto);
  const fechar = useChatIAStore((s) => s.fechar);
  const [pergunta, setPergunta] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [enviando, setEnviando] = useState(false);

  if (!aberto) return null;

  const adicionar = (papel: Linha['papel'], texto: string): void => {
    setLinhas((atual) => [...atual, { papel, texto }]);
  };

  const enviar = async (): Promise<void> => {
    const texto = pergunta.trim();
    if (texto.length === 0 || enviando) return;

    setPergunta('');
    adicionar('usuario', texto);
    setEnviando(true);

    try {
      const projetoId = projetoAtivoId();
      if (projetoId === null) {
        adicionar('erro', 'Abra um projeto antes de usar a IA.');
        return;
      }

      const modelador = useModeladorStore.getState();
      const bim = useBIMStore.getState();
      const estado: EstadoIa = {
        modelador: modelador.estado,
        elementos: bim.bim.elementos,
        catalogo: catalogoPadrao(),
        familias: FAMILIAS_PADRAO,
        projetoId,
        camadaAtivaId: bim.camadas.camadaAtivaId,
      };

      const contexto = resumirDocumento({
        modelador: estado.modelador,
        elementos: estado.elementos,
        catalogo: estado.catalogo,
        familias: estado.familias,
      }).texto;

      const resposta = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta: texto, contexto }),
      });

      if (!resposta.ok) {
        const corpo = (await resposta.json().catch(() => ({}))) as { erro?: unknown };
        const erro = typeof corpo.erro === 'string' ? corpo.erro : 'API_INDISPONIVEL';
        adicionar(
          'erro',
          erro === 'IA_NAO_CONFIGURADA'
            ? 'IA não configurada: defina DEEPSEEK_API_KEY em artifacts/arqdor-studio/.env.local e reinicie o dev.'
            : 'Assistente indisponível: ' + erro + '.',
        );
        return;
      }

      const dados = (await resposta.json()) as RespostaChat;
      const textoModelo = typeof dados.texto === 'string' ? dados.texto : null;
      if (textoModelo !== null && textoModelo.trim().length > 0) adicionar('ia', textoModelo);

      const plano = montarPlanoDoChat(
        { texto: textoModelo, toolCalls: Array.isArray(dados.toolCalls) ? dados.toolCalls : [] },
        texto,
      );
      if (plano === null) {
        if (textoModelo === null) adicionar('ia', 'O assistente não propôs nenhuma ação.');
        return;
      }

      const resultado = executarPlano(plano, estado);
      if (!resultado.ok) {
        adicionar('erro', mensagemDoResultado(resultado).texto);
        return;
      }

      if (resultado.passo === null) {
        adicionar('ia', mensagemDoResultado(resultado).texto);
        return;
      }

      const aplicado = aplicarPassoDaIA(resultado.passo);
      if (!aplicado.ok) {
        adicionar('erro', 'Aplicação recusada: ' + aplicado.erro + '.');
        return;
      }
      adicionar('ia', mensagemDoResultado(resultado).texto);
    } catch (erro) {
      adicionar('erro', 'Falha no chat: ' + (erro instanceof Error ? erro.message : String(erro)));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        width: 340,
        maxHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#0f1f1a',
        border: '1px solid rgba(255,255,255,.12)',
        borderRadius: 12,
        boxShadow: '0 18px 40px rgba(0,0,0,.45)',
        zIndex: 50,
        fontFamily: 'Montserrat, Segoe UI, sans-serif',
        color: '#e6eeea',
      }}
      role="dialog"
      aria-label="Vendi IA"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: '#00c896' }}>VENDI IA</span>
        <button
          type="button"
          onClick={fechar}
          style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: '#9fb3ad', cursor: 'pointer', fontSize: 16 }}
          aria-label="Fechar chat"
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 120 }}>
        {linhas.length === 0 ? (
          <p style={{ margin: 0, fontSize: 11.5, color: '#8fa39c', lineHeight: 1.5 }}>
            Ex.: “crie uma parede de 4 × 2,8 × 0,15”.
          </p>
        ) : null}
        {linhas.map((linha, indice) => (
          <div
            key={String(indice)}
            style={{
              fontSize: 11.5,
              lineHeight: 1.5,
              padding: '6px 8px',
              borderRadius: 8,
              background: linha.papel === 'usuario' ? 'rgba(0,200,150,.14)' : 'rgba(255,255,255,.04)',
              color: linha.papel === 'erro' ? '#fca5a5' : '#e6eeea',
              whiteSpace: 'pre-wrap',
            }}
          >
            {linha.texto}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <input
          value={pergunta}
          onChange={(evento) => setPergunta(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') {
              evento.preventDefault();
              void enviar();
            }
          }}
          placeholder={enviando ? 'Enviando…' : 'Peça algo ao Vendi IA'}
          aria-label="Mensagem para o Vendi IA"
          style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(0,0,0,.32)', color: '#fff', font: 'inherit', fontSize: 12 }}
        />
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={enviando}
          style={{ padding: '8px 12px', borderRadius: 8, border: 0, background: '#00c896', color: '#06231b', fontWeight: 700, fontSize: 12, cursor: enviando ? 'default' : 'pointer', opacity: enviando ? 0.6 : 1 }}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
