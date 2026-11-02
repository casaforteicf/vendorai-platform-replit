'use client';

/**
 * Barra de medidas flutuante (padrão SketchUp).
 *
 * Fica no canto inferior direito do viewport. O usuário digita ("2,8", "3x4") e Enter
 * aplica no contexto da ferramenta ativa — o número substitui o mouse.
 */

import { useEffect, useRef, useState } from 'react';
import { Icone } from '../design/icones';

export interface PropsBarraMedidas {
  dica: string;
  /** Aplica a medida. Devolve mensagem de erro (ou null quando aplicou). */
  aoAplicar: (texto: string) => string | null;
}

export function BarraMedidas(props: PropsBarraMedidas) {
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const entradaRef = useRef<HTMLInputElement | null>(null);

  // atalho: digitar um número em qualquer lugar foca a barra (como no SketchUp)
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent): void => {
      const alvo = evento.target as HTMLElement | null;
      if (alvo !== null && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT')) return;
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
      if (!/^[0-9.,x;\-\s]$/i.test(evento.key)) return;
      entradaRef.current?.focus();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  const aplicar = (): void => {
    const problema = props.aoAplicar(texto);
    if (problema === null) {
      setTexto('');
      setErro(null);
    } else {
      setErro(problema);
    }
  };

  return (
    <div className="arq-medidas" role="group" aria-label="Barra de medidas">
      <span className="arq-medidas-dica">{props.dica}</span>
      <div className="arq-medidas-linha">
        <Icone nome="linha" tamanho={14} />
        <input
          ref={entradaRef}
          className="arq-medidas-input"
          value={texto}
          onChange={(evento) => {
            setTexto(evento.target.value);
            setErro(null);
          }}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') {
              evento.preventDefault();
              aplicar();
            }
            if (evento.key === 'Escape') {
              setTexto('');
              setErro(null);
              entradaRef.current?.blur();
            }
          }}
          placeholder="2,8 ou 3x4"
          aria-label="Medida"
          inputMode="decimal"
        />
        <button type="button" className="arq-medidas-ok" onClick={aplicar} title="Aplicar medida">
          Enter
        </button>
      </div>
      {erro !== null ? <span className="arq-medidas-erro">{erro}</span> : null}
    </div>
  );
}
