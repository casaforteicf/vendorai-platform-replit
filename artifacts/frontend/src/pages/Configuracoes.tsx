import ConfiguracoesNormalized from "./ConfiguracoesNormalized";
import { ConfigurationHistoryPanel } from "@/components/ConfigurationHistoryPanel";

export default function Configuracoes() {
  return (
    <>
      <ConfigurationHistoryPanel />
      <ConfiguracoesNormalized />
    </>
  );
}
