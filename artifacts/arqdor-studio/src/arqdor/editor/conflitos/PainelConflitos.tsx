'use client';

/**
 * Compatibilização — consome `detectarConflitos` (AABB) de verdade.
 *
 * Não existe "desenho de MEP" ainda, então o tubo é criado por FORMULÁRIO: dois pontos em
 * planta, altura, diâmetro e camada. É entrada do usuário, não dado fake — o conflito que
 * aparece é calculado a partir do que foi digitado contra as paredes/lajes do projeto.
 */

import { useMemo, useState } from 'react';
import type { ElementoBim } from '../bim/schema';
import { derivar2d } from '../bim/derivar2d';
import { Icone } from '../design/icones';
import { detectarConflitos } from '../mep/colisao';
import type { CamadaMEP, ElementoMEP, ElementoMEPTipo } from '../mep/schema';

export interface PropsPainelConflitos {
  elementos: readonly ElementoBim[];
  mep: readonly ElementoMEP[];
  aoAdicionar: (elemento: ElementoMEP) => void;
  aoRemover: (id: string) => void;
}

const CAMADAS: ReadonlyArray<{ id: CamadaMEP; rotulo: string; cor: string }> = [
  { id: 'hidraulica', rotulo: 'Hidráulica', cor: '#3b82f6' },
  { id: 'eletrica', rotulo: 'Elétrica', cor: '#f59e0b' },
  { id: 'esgoto', rotulo: 'Esgoto', cor: '#8b5cf6' },
  { id: 'hvac', rotulo: 'HVAC', cor: '#06b6d4' },
  { id: 'gas', rotulo: 'Gás', cor: '#ef4444' },
];

/** O contrato tem tipos específicos por camada — o formulário escolhe o correto. */
const TIPO_POR_CAMADA: Record<CamadaMEP, ElementoMEPTipo> = {
  hidraulica: 'tubo_agua_fria',
  eletrica: 'conduite',
  esgoto: 'tubo_esgoto',
  gas: 'tubo_gas',
  hvac: 'difusor_ar',
};

function corDaCamada(camada: CamadaMEP): string {
  return CAMADAS.find((item) => item.id === camada)?.cor ?? '#6b7280';
}

export function PainelConflitos({ elementos, mep, aoAdicionar, aoRemover }: PropsPainelConflitos) {
  const [camada, setCamada] = useState<CamadaMEP>('hidraulica');
  const [altura, setAltura] = useState('2.40');
  const [diametro, setDiametro] = useState('50');
  const [x1, setX1] = useState('0.50');
  const [z1, setZ1] = useState('2.00');
  const [x2, setX2] = useState('4.50');
  const [z2, setZ2] = useState('2.00');
  const [erro, setErro] = useState<string | null>(null);

  const resultado = useMemo(() => detectarConflitos(mep, elementos), [mep, elementos]);
  const linhas = useMemo(() => derivar2d(elementos), [elementos]);

  const numero = (valor: string): number => Number(valor.replace(',', '.'));

  const adicionar = (): void => {
    const a = numero(x1);
    const b = numero(z1);
    const c = numero(x2);
    const d = numero(z2);
    const h = numero(altura);
    const diam = numero(diametro);
    if (![a, b, c, d, h, diam].every((valor) => Number.isFinite(valor))) {
      setErro('Preencha todos os campos com número.');
      return;
    }
    if (Math.hypot(c - a, d - b) < 0.01) {
      setErro('Os dois pontos precisam ser diferentes.');
      return;
    }
    setErro(null);
    aoAdicionar({
      id: 'mep_' + String(Date.now()),
      tipo: TIPO_POR_CAMADA[camada],
      caminho: [
        [a, h, b],
        [c, h, d],
      ],
      diametroMm: diam,
      alturaM: h,
      camada,
    });
  };

  // Enquadramento do desenho em planta
  const pontos: Array<[number, number]> = [];
  for (const linha of linhas) pontos.push([linha.x1, linha.y1], [linha.x2, linha.y2]);
  for (const elemento of mep) for (const ponto of elemento.caminho) pontos.push([ponto[0], ponto[2]]);
  const xs = pontos.map((p) => p[0]);
  const ys = pontos.map((p) => p[1]);
  const minX = xs.length > 0 ? Math.min(...xs) : 0;
  const maxX = xs.length > 0 ? Math.max(...xs) : 1;
  const minY = ys.length > 0 ? Math.min(...ys) : 0;
  const maxY = ys.length > 0 ? Math.max(...ys) : 1;
  const largura = Math.max(0.5, maxX - minX);
  const alturaDesenho = Math.max(0.5, maxY - minY);
  const folga = Math.max(largura, alturaDesenho) * 0.08;

  return (
    <div className="arq-conflitos">
      <div className="arq-conflitos-form">
        <div className="arq-rail-label" style={{ padding: '0 0 6px' }}>Novo tubo (planta em metros)</div>
        <div className="arq-conflitos-campos">
          <label>
            Camada
            <select className="arq-field" value={camada} onChange={(evento) => setCamada(evento.target.value as CamadaMEP)}>
              {CAMADAS.map((item) => (
                <option key={item.id} value={item.id}>{item.rotulo}</option>
              ))}
            </select>
          </label>
          <label>Altura (m)<input className="arq-field" value={altura} onChange={(e) => setAltura(e.target.value)} inputMode="decimal" /></label>
          <label>Ø (mm)<input className="arq-field" value={diametro} onChange={(e) => setDiametro(e.target.value)} inputMode="decimal" /></label>
          <label>X1<input className="arq-field" value={x1} onChange={(e) => setX1(e.target.value)} inputMode="decimal" /></label>
          <label>Z1<input className="arq-field" value={z1} onChange={(e) => setZ1(e.target.value)} inputMode="decimal" /></label>
          <label>X2<input className="arq-field" value={x2} onChange={(e) => setX2(e.target.value)} inputMode="decimal" /></label>
          <label>Z2<input className="arq-field" value={z2} onChange={(e) => setZ2(e.target.value)} inputMode="decimal" /></label>
          <button type="button" className="arq-btn arq-btn-primary" onClick={adicionar} style={{ height: 34 }}>
            <Icone nome="mais" tamanho={15} />
            Adicionar tubo
          </button>
        </div>
        {erro !== null ? <p className="arq-muted" style={{ color: '#b91c1c', margin: '6px 0 0' }}>{erro}</p> : null}
      </div>

      <div className="arq-conflitos-planta">
        <svg viewBox={String(minX - folga) + ' ' + String(minY - folga) + ' ' + String(largura + folga * 2) + ' ' + String(alturaDesenho + folga * 2)} style={{ width: '100%', height: '100%' }}>
          {linhas.map((linha, indice) => (
            <line
              key={'l' + String(indice)}
              x1={linha.x1}
              y1={linha.y1}
              x2={linha.x2}
              y2={linha.y2}
              stroke={linha.tipo === 'parede' ? '#cbd5d1' : '#94a3b8'}
              strokeWidth={0.03}
            />
          ))}
          {mep.map((elemento) => {
            const a = elemento.caminho[0];
            const b = elemento.caminho[elemento.caminho.length - 1];
            return (
              <line
                key={elemento.id}
                x1={a[0]}
                y1={a[2]}
                x2={b[0]}
                y2={b[2]}
                stroke={corDaCamada(elemento.camada)}
                strokeWidth={0.05}
                strokeLinecap="round"
              />
            );
          })}
          {resultado.conflitos.map((conflito, indice) => {
            const centro: [number, number] = [
              (conflito.caixa.min[0] + conflito.caixa.max[0]) / 2,
              (conflito.caixa.min[2] + conflito.caixa.max[2]) / 2,
            ];
            return <circle key={'c' + String(indice)} cx={centro[0]} cy={centro[1]} r={0.12} fill="none" stroke="#ef4444" strokeWidth={0.04} />;
          })}
        </svg>
      </div>

      <div className="arq-conflitos-lista">
        <div className="arq-painel-head" style={{ marginBottom: 8 }}>
          <h2>Conflitos ({resultado.conflitos.length})</h2>
        </div>
        {resultado.conflitos.length === 0 ? (
          <p className="arq-muted" style={{ margin: 0 }}>
            Nenhuma interseção entre a tubulação e as paredes/lajes. Adicione um tubo que atravesse uma parede.
          </p>
        ) : (
          <table className="arq-tabela">
            <thead>
              <tr>
                <th>Elemento</th>
                <th>Tipo</th>
                <th>Tubo</th>
                <th className="num">Volume (m³)</th>
              </tr>
            </thead>
            <tbody>
              {resultado.conflitos.map((conflito, indice) => (
                <tr key={String(indice)}>
                  <td>{conflito.elementoId}</td>
                  <td>{conflito.tipoElemento}</td>
                  <td>{conflito.mepId}</td>
                  <td className="num">{conflito.volumeM3.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {resultado.ignorados.length > 0 ? (
          <p className="arq-muted" style={{ marginTop: 8 }}>
            {String(resultado.ignorados.length)} contato(s) intencional(is) ignorado(s) (tomada na própria parede).
          </p>
        ) : null}
        {resultado.elementosSemGeometria.length > 0 ? (
          <p className="arq-muted" style={{ marginTop: 4 }}>
            {String(resultado.elementosSemGeometria.length)} elemento(s) sem geometria para testar.
          </p>
        ) : null}

        <div className="arq-rail-label" style={{ padding: '12px 0 6px' }}>Tubulação ({mep.length})</div>
        {mep.length === 0 ? (
          <p className="arq-muted" style={{ margin: 0 }}>Nenhum tubo ainda.</p>
        ) : (
          <ul className="arq-conflitos-mep">
            {mep.map((elemento) => (
              <li key={elemento.id}>
                <span className="ponto" style={{ background: corDaCamada(elemento.camada) }} />
                <span>{elemento.camada} · Ø{elemento.diametroMm ?? 50} mm · h {elemento.alturaM ?? 0} m</span>
                <button type="button" className="arq-kebab" onClick={() => aoRemover(elemento.id)} title="Remover tubo">
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
