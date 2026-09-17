import { RealDataUnavailable } from "@/components/RealDataUnavailable";

export function VCNCompanyDetailPage() {
  return (
    <RealDataUnavailable
      title="Detalhe da Rede Certificada indisponível"
      description="A versão anterior desta página utilizava um cadastro simulado fixo. O detalhe foi protegido até que seja conectado a uma empresa real da rede certificada."
      backHref="/vendor-certified-network"
    />
  );
}
