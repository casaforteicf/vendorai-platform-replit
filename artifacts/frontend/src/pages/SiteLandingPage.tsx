import { useParams } from "wouter";
import { useGetPublicSite, getGetPublicSiteQueryKey } from "@workspace/api-client-react";
import { MessageCircle, Phone, Mail, Star, ChevronDown, ShoppingCart } from "lucide-react";
import { useState, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface GenContent {
  hero?: { headline?: string; subheadline?: string; cta?: string; cta2?: string };
  sobre?: { titulo?: string; texto?: string };
  servicos?: Array<{ titulo: string; descricao: string; emoji: string }>;
  diferenciais?: Array<{ titulo: string; texto: string; icone: string }>;
  depoimentos?: Array<{ nome: string; cargo: string; empresa: string; texto: string; estrelas: number }>;
  faq?: Array<{ pergunta: string; resposta: string }>;
  cta_final?: { titulo?: string; texto?: string; botao?: string };
  cores?: { primaria?: string; secundaria?: string; acento?: string };
  ecommerce?: { titulo?: string; descricao?: string; frete?: string; pagamento?: string; garantia?: string };
  slogan?: string;
}

function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < n ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
      ))}
    </div>
  );
}

function FaqItem({ pergunta, resposta, color }: { pergunta: string; resposta: string; color: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left py-4 flex items-start justify-between gap-3 font-medium text-gray-800 hover:text-gray-900 transition-colors"
      >
        <span>{pergunta}</span>
        <ChevronDown
          className={`h-5 w-5 flex-shrink-0 transition-transform text-gray-400 ${open ? "rotate-180" : ""}`}
          style={{ color: open ? color : undefined }}
        />
      </button>
      {open && (
        <p className="pb-4 text-gray-600 text-sm leading-relaxed">{resposta}</p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SiteLandingPage() {
  const params = useParams<{ tenantSlug: string }>();
  const tenantSlug = params.tenantSlug ?? "";

  // Try HTML-first: check if a Claude-generated site exists for this tenant
  const [htmlSiteStatus, setHtmlSiteStatus] = useState<"checking" | "available" | "unavailable">("checking");

  useEffect(() => {
    if (!tenantSlug) return;
    fetch(`/api/public/${tenantSlug}/site-html`, { method: "HEAD" })
      .then((r) => setHtmlSiteStatus(r.ok ? "available" : "unavailable"))
      .catch(() => setHtmlSiteStatus("unavailable"));
  }, [tenantSlug]);

  // JSON fallback — always call hooks unconditionally
  const { data, isLoading, isError } = useGetPublicSite(tenantSlug, {
    query: {
      queryKey: getGetPublicSiteQueryKey(tenantSlug),
      enabled: !!tenantSlug && htmlSiteStatus === "unavailable",
    },
  });

  // If the HTML site exists, show it in a full-screen iframe (self-contained HTML/CSS/JS)
  if (htmlSiteStatus === "available") {
    return (
      <iframe
        src={`/api/public/${tenantSlug}/site-html`}
        title="Site"
        style={{ width: "100%", height: "100vh", border: "none", display: "block" }}
        allow="fullscreen"
      />
    );
  }

  if (htmlSiteStatus === "checking" || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-3xl">🌐</div>
        <h1 className="text-xl font-semibold text-gray-700">Site não encontrado</h1>
        <p className="text-gray-500 text-sm max-w-xs">Este link não está disponível ou o site está desativado.</p>
      </div>
    );
  }

  const { businessProfile, produtos, siteConfig: sc, tenant } = data;
  const siteConfig = sc as typeof sc & {
    generatedContent?: GenContent;
    heroImageUrl?: string | null;
    tipo?: string;
  };
  const bp = businessProfile as (typeof businessProfile & { diferenciais?: string | null }) | null;
  const gen = (siteConfig.generatedContent ?? {}) as GenContent;

  const primaryColor = gen.cores?.primaria ?? siteConfig.corPrimaria ?? "#1e3a5f";
  const secondaryColor = gen.cores?.secundaria ?? "#f8fafc";
  const accentColor = gen.cores?.acento ?? "#3b82f6";

  const companyName = bp?.nomeFantasia ?? tenant.name ?? tenant.slug;
  const heroImageUrl = siteConfig.heroImageUrl;
  const isEcommerce = siteConfig.tipo === "ecommerce";

  const whatsapp = siteConfig.whatsappContato ?? businessProfile?.telefone ?? null;
  const whatsappUrl = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, "")}` : null;

  // Fallback values when no generated content
  const heroHeadline = gen.hero?.headline ?? companyName;
  const heroSub = gen.hero?.subheadline ?? siteConfig.tagline ?? businessProfile?.vertical ?? "";
  const heroCta = gen.hero?.cta ?? (whatsappUrl ? "Falar pelo WhatsApp" : "Saiba mais");
  const heroCta2 = gen.hero?.cta2;

  const servicos = gen.servicos ?? [];
  const diferenciais = gen.diferenciais ?? [];
  const depoimentos = gen.depoimentos ?? [];
  const faq = gen.faq ?? [];
  const sobre = gen.sobre;
  const ctaFinal = gen.cta_final;
  const slogan = gen.slogan ?? companyName;

  return (
    <div className="min-h-screen bg-white font-sans antialiased">

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[520px] flex items-center justify-center overflow-hidden">
        {/* Background */}
        {heroImageUrl ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${heroImageUrl})` }}
            />
            <div className="absolute inset-0" style={{ backgroundColor: primaryColor, opacity: 0.72 }} />
          </>
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)` }}
          />
        )}

        {/* Content */}
        <div className="relative z-10 text-center px-6 py-24 max-w-3xl mx-auto">
          <p className="text-white/70 text-sm font-medium tracking-widest uppercase mb-4">{companyName}</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight mb-6">
            {heroHeadline}
          </h1>
          {heroSub && (
            <p className="text-white/90 text-lg sm:text-xl max-w-xl mx-auto mb-8 leading-relaxed">{heroSub}</p>
          )}
          <div className="flex flex-wrap gap-3 justify-center">
            {whatsappUrl ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white font-semibold py-3.5 px-7 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 text-sm"
                style={{ color: primaryColor }}
              >
                <MessageCircle className="h-4 w-4 text-green-500" />
                {heroCta}
              </a>
            ) : (
              <button
                className="inline-flex items-center gap-2 bg-white font-semibold py-3.5 px-7 rounded-full shadow-lg text-sm"
                style={{ color: primaryColor }}
              >
                {heroCta}
              </button>
            )}
            {heroCta2 && (
              <button className="inline-flex items-center gap-2 border-2 border-white/60 text-white font-medium py-3.5 px-7 rounded-full hover:bg-white/10 transition-all text-sm">
                {heroCta2}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── DIFERENCIAIS (stats strip) ────────────────────────────────────── */}
      {diferenciais.length > 0 && (
        <section className="py-10 px-6" style={{ backgroundColor: secondaryColor }}>
          <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6">
            {diferenciais.map((d, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl mb-2">{d.icone}</div>
                <p className="font-bold text-sm text-gray-900">{d.titulo}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{d.texto}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── SOBRE ─────────────────────────────────────────────────────────── */}
      {(sobre || bp?.diferenciais) && (
        <section className="py-20 px-6 bg-white">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
              {sobre?.titulo ?? `Sobre a ${companyName}`}
            </h2>
            <div className="w-12 h-1 rounded-full mx-auto mb-6" style={{ backgroundColor: accentColor }} />
            <p className="text-gray-600 leading-relaxed text-base whitespace-pre-line">
              {sobre?.texto ?? bp?.diferenciais ?? ""}
            </p>
          </div>
        </section>
      )}

      {/* ── SERVIÇOS ──────────────────────────────────────────────────────── */}
      {servicos.length > 0 && (
        <section className="py-20 px-6" style={{ backgroundColor: secondaryColor }}>
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                {isEcommerce ? "Nossos Produtos" : "O que oferecemos"}
              </h2>
              <div className="w-12 h-1 rounded-full mx-auto" style={{ backgroundColor: accentColor }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {servicos.map((s, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow border border-gray-100 flex flex-col gap-3"
                >
                  <div className="text-3xl">{s.emoji}</div>
                  <h3 className="font-bold text-gray-900">{s.titulo}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed flex-1">{s.descricao}</p>
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold mt-2 hover:underline"
                      style={{ color: accentColor }}
                    >
                      Saiba mais →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── PRODUTOS CATÁLOGO (e-commerce) ────────────────────────────────── */}
      {isEcommerce && produtos.length > 0 && (
        <section className="py-20 px-6 bg-white">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-4">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                {gen.ecommerce?.titulo ?? "Nossa Loja"}
              </h2>
              <div className="w-12 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: accentColor }} />
              {gen.ecommerce?.descricao && (
                <p className="text-gray-500 text-sm max-w-lg mx-auto">{gen.ecommerce.descricao}</p>
              )}
            </div>

            {/* E-commerce benefits strip */}
            {(gen.ecommerce?.frete || gen.ecommerce?.pagamento || gen.ecommerce?.garantia) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-8 text-center text-sm">
                {gen.ecommerce?.frete && (
                  <div className="bg-green-50 rounded-xl p-4">
                    <p className="text-2xl mb-1">🚚</p>
                    <p className="font-medium text-green-800">{gen.ecommerce.frete}</p>
                  </div>
                )}
                {gen.ecommerce?.pagamento && (
                  <div className="bg-blue-50 rounded-xl p-4">
                    <p className="text-2xl mb-1">💳</p>
                    <p className="font-medium text-blue-800">{gen.ecommerce.pagamento}</p>
                  </div>
                )}
                {gen.ecommerce?.garantia && (
                  <div className="bg-purple-50 rounded-xl p-4">
                    <p className="text-2xl mb-1">🛡️</p>
                    <p className="font-medium text-purple-800">{gen.ecommerce.garantia}</p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {produtos.map((produto) => (
                <div
                  key={produto.id}
                  className="border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md transition-shadow flex flex-col"
                >
                  <div
                    className="h-44 flex items-center justify-center text-5xl"
                    style={{ background: `linear-gradient(135deg, ${primaryColor}15 0%, ${accentColor}15 100%)` }}
                  >
                    🛍️
                  </div>
                  <div className="p-5 flex flex-col gap-2 flex-1">
                    <h3 className="font-bold text-gray-900">{produto.nome}</h3>
                    {produto.descricao && (
                      <p className="text-sm text-gray-500 flex-1 leading-relaxed">{produto.descricao}</p>
                    )}
                    <div className="flex items-center justify-between mt-3">
                      <div>
                        <span className="text-xs text-gray-400">R$ </span>
                        <span className="text-xl font-extrabold" style={{ color: primaryColor }}>
                          {parseFloat(produto.precoBase).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">/ {produto.unidade}</span>
                      </div>
                      {whatsappUrl && (
                        <a
                          href={`${whatsappUrl}?text=${encodeURIComponent(`Olá! Tenho interesse no produto: ${produto.nome}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-white text-xs font-semibold px-4 py-2 rounded-full transition-opacity hover:opacity-90"
                          style={{ backgroundColor: primaryColor }}
                        >
                          <ShoppingCart className="h-3 w-3" /> Comprar
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── DEPOIMENTOS ───────────────────────────────────────────────────── */}
      {depoimentos.length > 0 && (
        <section className="py-20 px-6" style={{ backgroundColor: secondaryColor }}>
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">O que dizem os clientes</h2>
              <div className="w-12 h-1 rounded-full mx-auto" style={{ backgroundColor: accentColor }} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {depoimentos.map((d, i) => (
                <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-3">
                  <Stars n={d.estrelas} />
                  <p className="text-gray-700 text-sm leading-relaxed flex-1">"{d.texto}"</p>
                  <div className="pt-2 border-t">
                    <p className="font-semibold text-gray-900 text-sm">{d.nome}</p>
                    <p className="text-xs text-gray-400">{d.cargo} — {d.empresa}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      {faq.length > 0 && (
        <section className="py-20 px-6 bg-white">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Perguntas Frequentes</h2>
              <div className="w-12 h-1 rounded-full mx-auto" style={{ backgroundColor: accentColor }} />
            </div>
            <div className="divide-y rounded-2xl border bg-white overflow-hidden px-6">
              {faq.map((f, i) => (
                <FaqItem key={i} pergunta={f.pergunta} resposta={f.resposta} color={accentColor} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA FINAL ─────────────────────────────────────────────────────── */}
      {(ctaFinal || whatsappUrl) && (
        <section
          className="py-20 px-6 text-white text-center"
          style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)` }}
        >
          <div className="max-w-xl mx-auto">
            <h2 className="text-3xl font-extrabold mb-4">
              {ctaFinal?.titulo ?? "Pronto para começar?"}
            </h2>
            {ctaFinal?.texto && (
              <p className="text-white/80 mb-8 leading-relaxed">{ctaFinal.texto}</p>
            )}
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white font-bold py-4 px-8 rounded-full shadow-xl hover:shadow-2xl transition-all hover:scale-105"
                style={{ color: primaryColor }}
              >
                <MessageCircle className="h-5 w-5 text-green-500" />
                {ctaFinal?.botao ?? "Falar pelo WhatsApp"}
              </a>
            )}
          </div>
        </section>
      )}

      {/* ── CONTATO ───────────────────────────────────────────────────────── */}
      {(businessProfile?.telefone || businessProfile?.email) && (
        <section className="py-16 px-6 bg-gray-50">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-xl font-bold text-gray-800 mb-6">Entre em contato</h2>
            <div className="flex flex-wrap items-center justify-center gap-6">
              {whatsapp && whatsappUrl && (
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-700 hover:text-green-600 transition-colors">
                  <MessageCircle className="h-5 w-5 text-green-500" />
                  <span className="font-medium text-sm">{whatsapp}</span>
                </a>
              )}
              {businessProfile?.telefone && (
                <a href={`tel:${businessProfile.telefone}`} className="flex items-center gap-2 text-gray-700 hover:text-blue-600 transition-colors">
                  <Phone className="h-4 w-4" style={{ color: primaryColor }} />
                  <span className="font-medium text-sm">{businessProfile.telefone}</span>
                </a>
              )}
              {businessProfile?.email && (
                <a href={`mailto:${businessProfile.email}`} className="flex items-center gap-2 text-gray-700 hover:text-blue-600 transition-colors">
                  <Mail className="h-4 w-4" style={{ color: primaryColor }} />
                  <span className="font-medium text-sm">{businessProfile.email}</span>
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="py-10 px-6 text-center text-white/70 text-sm" style={{ backgroundColor: primaryColor }}>
        <p className="font-semibold text-white mb-1">{slogan}</p>
        <p>© {new Date().getFullYear()} {companyName}. Todos os direitos reservados.</p>
        <p className="mt-3 opacity-40 text-xs">Criado com VendorAI</p>
      </footer>

      {/* ── WhatsApp FAB ──────────────────────────────────────────────────── */}
      {whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 bg-green-500 hover:bg-green-600 text-white rounded-full p-4 shadow-2xl hover:shadow-3xl transition-all hover:scale-110 z-50"
          aria-label="WhatsApp"
        >
          <MessageCircle className="h-6 w-6" />
        </a>
      )}
    </div>
  );
}
