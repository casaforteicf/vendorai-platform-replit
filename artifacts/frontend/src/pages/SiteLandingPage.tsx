import { useParams } from "wouter";
import { useGetPublicSite, getGetPublicSiteQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Phone, Mail, MapPin, Package } from "lucide-react";

export default function SiteLandingPage() {
  const params = useParams<{ tenantSlug: string }>();
  const tenantSlug = params.tenantSlug ?? "";

  const { data, isLoading, isError } = useGetPublicSite(tenantSlug, {
    query: { queryKey: getGetPublicSiteQueryKey(tenantSlug), enabled: !!tenantSlug },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-3 text-center px-4">
        <Package className="h-12 w-12 text-gray-300" />
        <h1 className="text-xl font-semibold text-gray-700">Site não encontrado</h1>
        <p className="text-gray-500 text-sm max-w-xs">
          Este link não está disponível ou o site está desativado.
        </p>
      </div>
    );
  }

  const { businessProfile, produtos, siteConfig, tenant } = data;

  const primaryColor = siteConfig.corPrimaria ?? "#1e3a5f";
  const companyName =
    businessProfile?.nomeFantasia ?? tenant.name ?? tenant.slug;
  const tagline = siteConfig.tagline;
  const sobre = siteConfig.sobreEmpresa ?? businessProfile?.sobreEmpresa;
  const whatsapp = siteConfig.whatsappContato;

  const whatsappUrl = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}`
    : null;

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section
        className="text-white py-24 px-6 text-center"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            {companyName}
          </h1>
          {tagline && (
            <p className="mt-4 text-lg sm:text-xl opacity-90 max-w-xl mx-auto leading-relaxed">
              {tagline}
            </p>
          )}
          {businessProfile?.vertical && (
            <Badge
              className="mt-6 text-sm px-3 py-1 border-white/40 text-white bg-white/10"
              variant="outline"
            >
              {businessProfile.vertical}
            </Badge>
          )}
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center gap-2 bg-white text-gray-900 font-semibold py-3 px-7 rounded-full shadow hover:shadow-lg transition-all hover:scale-105"
            >
              <MessageCircle className="h-5 w-5 text-green-600" />
              Falar pelo WhatsApp
            </a>
          )}
        </div>
      </section>

      {/* ── Sobre ───────────────────────────────────────────────────────── */}
      {sobre && (
        <section className="py-16 px-6 bg-gray-50">
          <div className="max-w-3xl mx-auto">
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: primaryColor }}
            >
              Sobre nós
            </h2>
            <p className="text-gray-700 leading-relaxed text-base whitespace-pre-line">
              {sobre}
            </p>
          </div>
        </section>
      )}

      {/* ── Produtos ────────────────────────────────────────────────────── */}
      {produtos.length > 0 && (
        <section className="py-16 px-6 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2
              className="text-2xl font-bold mb-8 text-center"
              style={{ color: primaryColor }}
            >
              Nossos Produtos & Serviços
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {produtos.map((produto) => (
                <div
                  key={produto.id}
                  className="border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow flex flex-col gap-2"
                >
                  <div
                    className="h-1 rounded-full mb-2"
                    style={{ backgroundColor: primaryColor }}
                  />
                  <h3 className="font-semibold text-gray-900 text-base">
                    {produto.nome}
                  </h3>
                  {produto.descricao && (
                    <p className="text-sm text-gray-500 flex-1">
                      {produto.descricao}
                    </p>
                  )}
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-xs text-gray-400">R$</span>
                    <span
                      className="text-xl font-bold"
                      style={{ color: primaryColor }}
                    >
                      {parseFloat(produto.precoBase).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-xs text-gray-400">
                      / {produto.unidade}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Contato ─────────────────────────────────────────────────────── */}
      {(businessProfile?.telefone ||
        businessProfile?.email ||
        whatsapp) && (
        <section className="py-16 px-6 bg-gray-50">
          <div className="max-w-3xl mx-auto text-center">
            <h2
              className="text-2xl font-bold mb-8"
              style={{ color: primaryColor }}
            >
              Entre em contato
            </h2>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              {whatsapp && (
                <a
                  href={whatsappUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-700 hover:text-green-600 transition-colors"
                >
                  <MessageCircle className="h-5 w-5 text-green-600" />
                  <span className="font-medium">{whatsapp}</span>
                </a>
              )}
              {businessProfile?.telefone && (
                <a
                  href={`tel:${businessProfile.telefone}`}
                  className="flex items-center gap-2 text-gray-700 hover:text-blue-600 transition-colors"
                >
                  <Phone className="h-5 w-5" style={{ color: primaryColor }} />
                  <span className="font-medium">{businessProfile.telefone}</span>
                </a>
              )}
              {businessProfile?.email && (
                <a
                  href={`mailto:${businessProfile.email}`}
                  className="flex items-center gap-2 text-gray-700 hover:text-blue-600 transition-colors"
                >
                  <Mail className="h-5 w-5" style={{ color: primaryColor }} />
                  <span className="font-medium">{businessProfile.email}</span>
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer
        className="py-8 px-6 text-center text-white/80 text-sm"
        style={{ backgroundColor: primaryColor }}
      >
        © {new Date().getFullYear()} {companyName}. Todos os direitos reservados.
      </footer>

      {/* ── WhatsApp FAB ────────────────────────────────────────────────── */}
      {whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 bg-green-500 hover:bg-green-600 text-white rounded-full p-4 shadow-xl hover:shadow-2xl transition-all hover:scale-110 z-50"
          aria-label="WhatsApp"
        >
          <MessageCircle className="h-6 w-6" />
        </a>
      )}
    </div>
  );
}
