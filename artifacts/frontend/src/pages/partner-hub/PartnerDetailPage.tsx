import { RealDataUnavailable } from "@/components/RealDataUnavailable";

export function PartnerDetailPage() {
  return (
    <RealDataUnavailable
      title="Detalhe de parceiro indisponível"
      description="A versão anterior desta página exibia um perfil simulado. O detalhe foi protegido para impedir que informações fictícias sejam apresentadas como cadastro real."
      backHref="/partner-hub"
    />
  );
}
