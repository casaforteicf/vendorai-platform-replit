import { describe, expect, it } from 'vitest';
import { buildTargetedRefinementInstruction, resolveSectionRefinement } from './site-section-refinement';

const sections = [
  { index: 0, key: '0:inicio', title: 'Transforme sua operação comercial' },
  { index: 1, key: '1:beneficios', title: 'Benefícios para sua equipe' },
  { index: 2, key: '2:depoimentos', title: 'O que nossos clientes dizem' },
  { index: 3, key: '3:faq', title: 'Perguntas frequentes' },
  { index: 4, key: '4:contato', title: 'Fale com um especialista' },
];

describe('resolveSectionRefinement', () => {
  it('targets FAQ and preserves all other sections', () => {
    const result = resolveSectionRefinement('deixe o FAQ mais curto e objetivo', sections);
    expect(result.mode).toBe('targeted');
    expect(result.targetSectionKey).toBe('3:faq');
    expect(result.preserveSectionKeys).toEqual(['0:inicio', '1:beneficios', '2:depoimentos', '4:contato']);
  });

  it('targets benefits by semantic alias', () => {
    const result = resolveSectionRefinement('melhore a seção de vantagens, está muito genérica', sections);
    expect(result.mode).toBe('targeted');
    expect(result.targetSectionKey).toBe('1:beneficios');
  });

  it('keeps explicitly global requests global', () => {
    const result = resolveSectionRefinement('troque a fonte do site inteiro', sections);
    expect(result.mode).toBe('global');
    expect(result.preserveSectionKeys).toEqual([]);
  });

  it('does not guess when no target is clear', () => {
    const result = resolveSectionRefinement('deixe mais premium', sections);
    expect(result.mode).toBe('global');
  });

  it('builds a strict localized editing instruction', () => {
    const result = resolveSectionRefinement('altere as perguntas frequentes', sections);
    const instruction = buildTargetedRefinementInstruction(result);
    expect(instruction).toContain('EDIÇÃO LOCALIZADA OBRIGATÓRIA');
    expect(instruction).toContain('Perguntas frequentes');
    expect(instruction).toContain('Altere somente essa seção');
  });
});
