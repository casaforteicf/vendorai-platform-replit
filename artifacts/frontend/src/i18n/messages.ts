export const messages = {
  "pt-BR": {
    "common.save": "Salvar",
    "common.cancel": "Cancelar",
    "common.close": "Fechar",
    "common.confirm": "Confirmar",
    "common.loading": "Carregando...",
    "common.search": "Buscar",
    "common.back": "Voltar",
    "common.next": "Próximo",
    "common.yes": "Sim",
    "common.no": "Não",
  },
  es: {
    "common.save": "Guardar",
    "common.cancel": "Cancelar",
    "common.close": "Cerrar",
    "common.confirm": "Confirmar",
    "common.loading": "Cargando...",
    "common.search": "Buscar",
    "common.back": "Volver",
    "common.next": "Siguiente",
    "common.yes": "Sí",
    "common.no": "No",
  },
} as const;

export type TranslationKey = keyof (typeof messages)["pt-BR"];
