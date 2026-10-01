export type WebExecutionStrategy = "fetch" | "browser";

const INTERACTIVE_INTENT =
  /(login|entrar|autenticar|preencher|formul[aá]rio|clicar|selecionar|enviar|salvar|editar|alterar|criar|cadastrar|comprar|checkout|baixar|download|upload|anexar|reservar|agendar|confirmar|publicar|excluir|remover|pagar)/i;

export function chooseWebExecutionStrategy(input: {
  goal: string;
  connectionId?: string;
  allowWrite?: boolean;
  forceBrowser?: boolean;
}): WebExecutionStrategy {
  if (input.forceBrowser) return "browser";
  if (input.connectionId) return "browser";
  if (input.allowWrite) return "browser";
  if (INTERACTIVE_INTENT.test(input.goal)) return "browser";
  return "fetch";
}
