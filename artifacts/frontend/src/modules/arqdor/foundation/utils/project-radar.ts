import type { ArqdorProject, ArqdorRadarItem } from "../types/arqdor.types";

export function buildProjectRadar(project?: ArqdorProject | null): ArqdorRadarItem[] {
  if (!project) {
    return [
      {
        id: "no-project",
        type: "info",
        title: "Crie ou selecione um projeto.",
        description: "O ARQDOR Studio começa a partir de um projeto ativo.",
        target: "projeto",
      },
    ];
  }

  const items: ArqdorRadarItem[] = [];

  if (!project.totalAmbientes && !project.ambientes?.length) {
    items.push({
      id: "no-environments",
      type: "warning",
      title: "Adicione o primeiro ambiente.",
      description: "Cada projeto precisa de pelo menos um ambiente para iniciar o Studio.",
      target: "projeto",
    });
  }

  if (!project.totalRenders && !project.renders?.length) {
    items.push({
      id: "no-renders",
      type: "warning",
      title: "Gere o primeiro render.",
      description: "O render será a base do storyboard e das próximas decisões.",
      target: "render",
    });
  }

  if (!items.length) {
    items.push({
      id: "continue",
      type: "success",
      title: "Continue o desenvolvimento.",
      description: "O projeto está pronto para a próxima etapa.",
      target: "studio",
    });
  }

  return items;
}
