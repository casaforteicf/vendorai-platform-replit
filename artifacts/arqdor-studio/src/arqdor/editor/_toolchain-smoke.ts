/**
 * Gate de toolchain — NÃO é código de produto.
 *
 * Importa os tipos das dependências pesadas (three, zustand) para provar que o
 * `pnpm install` + `tsc --noEmit` resolvem os módulos antes de alguém escrever
 * código de verdade. Apagar quando o primeiro módulo real existir.
 */
import type { Vector3 } from "three";
import type { StoreApi } from "zustand";

export type VerificacaoToolchain = {
  vetor: Vector3 | null;
  store: StoreApi<unknown> | null;
};

export const verificacaoToolchain: VerificacaoToolchain = {
  vetor: null,
  store: null,
};