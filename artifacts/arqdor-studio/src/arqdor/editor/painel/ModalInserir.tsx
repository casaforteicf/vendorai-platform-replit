'use client';

/**
 * Inserção paramétrica — o usuário digita as medidas e o sólido nasce exato.
 *
 * A posição é o CANTO MÍNIMO: uma parede em X=0, Z=0 com largura 4 ocupa 0..4.
 * Presets (parede/laje/pilar/caixa) só preenchem os campos; nada é criado até "Inserir".
 */

import { useState } from 'react';
import type { DimensoesCaixa } from '../modelador/caixa';
import { PRESETS_INSERCAO } from '../modelador/caixa';
import type { NomePreset } from '../modelador/caixa';
import { Icone } from '../design/icones';

export interface MedidasInsercao {
  nome: string;
  posicao: [number, number, number];
  dimensoes: DimensoesCaixa;
}

export interface PropsModalInserir {
  aberto: boolean;
  aoFechar: () => void;
  aoInserir: (medidas: MedidasInsercao) => void;
}

function numero(valor: string): number {
  return Number(valor.replace(',', '.'));
}

export function ModalInserir({ aberto, aoFechar, aoInserir }: PropsModalInserir) {
  const [nome, setNome] = useState('Parede');
  const [x, setX] = useState('0');
  const [y, setY] = useState('0');
  const [z, setZ] = useState('0');
  const [largura, setLargura] = useState('4');
  const [altura, setAltura] = useState('2.8');
  const [profundidade, setProfundidade] = useState('0.15');
  const [erro, setErro] = useState<string | null>(null);

  if (!aberto) return null;

  const aplicarPreset = (preset: NomePreset): void => {
    const dados = PRESETS_INSERCAO[preset];
    setNome(dados.nome);
    setLargura(String(dados.dimensoes.largura));
    setAltura(String(dados.dimensoes.altura));
    setProfundidade(String(dados.dimensoes.profundidade));
    setErro(null);
  };

  const inserir = (): void => {
    const valores = [x, y, z, largura, altura, profundidade].map(numero);
    if (!valores.every((valor) => Number.isFinite(valor))) {
      setErro('Preencha todos os campos com número.');
      return;
    }
    const [px, py, pz, l, a, p] = valores;
    if (l <= 0 || a <= 0 || p <= 0) {
      setErro('Largura, altura e profundidade precisam ser maiores que zero.');
      return;
    }
    setErro(null);
    aoInserir({ nome: nome.trim().length > 0 ? nome.trim() : 'Elemento', posicao: [px, py, pz], dimensoes: { largura: l, altura: a, profundidade: p } });
  };

  return (
    <div className="arq-modal-fundo" role="dialog" aria-modal="true" aria-label="Inserir elemento">
      <div className="arq-modal">
        <div className="arq-modal-head">
          <strong>Inserir elemento</strong>
          <button type="button" className="arq-kebab" onClick={aoFechar} aria-label="Fechar">
            ×
          </button>
        </div>

        <p className="arq-muted" style={{ margin: '0 0 10px', lineHeight: 1.5 }}>
          A posição é o <strong>canto mínimo</strong>: X/Z definem onde começa, Y a base.
        </p>

        <div className="arq-modal-presets">
          {(Object.keys(PRESETS_INSERCAO) as NomePreset[]).map((preset) => (
            <button key={preset} type="button" className="arq-btn" onClick={() => aplicarPreset(preset)}>
              {PRESETS_INSERCAO[preset].nome}
            </button>
          ))}
        </div>

        <label className="arq-muted">Nome
          <input className="arq-field" style={{ width: '100%', marginTop: 3 }} value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>

        <div className="arq-modal-grade">
          <label className="arq-muted">X (m)<input className="arq-field" value={x} onChange={(e) => setX(e.target.value)} inputMode="decimal" /></label>
          <label className="arq-muted">Y (m)<input className="arq-field" value={y} onChange={(e) => setY(e.target.value)} inputMode="decimal" /></label>
          <label className="arq-muted">Z (m)<input className="arq-field" value={z} onChange={(e) => setZ(e.target.value)} inputMode="decimal" /></label>
          <label className="arq-muted">Largura X (m)<input className="arq-field" value={largura} onChange={(e) => setLargura(e.target.value)} inputMode="decimal" /></label>
          <label className="arq-muted">Altura Y (m)<input className="arq-field" value={altura} onChange={(e) => setAltura(e.target.value)} inputMode="decimal" /></label>
          <label className="arq-muted">Profund. Z (m)<input className="arq-field" value={profundidade} onChange={(e) => setProfundidade(e.target.value)} inputMode="decimal" /></label>
        </div>

        {erro !== null ? <p className="arq-muted" style={{ color: '#b91c1c', margin: '8px 0 0' }}>{erro}</p> : null}

        <div className="arq-modal-acoes">
          <button type="button" className="arq-btn" onClick={aoFechar}>Cancelar</button>
          <button type="button" className="arq-btn arq-btn-primary" onClick={inserir}>
            <Icone nome="mais" tamanho={15} />
            Inserir
          </button>
        </div>
      </div>
    </div>
  );
}
