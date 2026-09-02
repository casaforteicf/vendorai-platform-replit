import { and, desc, eq } from "drizzle-orm";
import {
  contentAutopilotArticlesTable,
  contentAutopilotConfigTable,
  contentAutopilotKeywordsTable,
  db,
  generatedSitesTable,
} from "@workspace/db";
import router from "./content_autopilot_core.js";

function checkSitePlanAccess(req: any, res: any, tenantId: string): boolean {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (user.platformRole !== "super_admin" && user.tenantId !== tenantId) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

type PlanOpportunity = {
  id: string;
  priority: "alta" | "media" | "baixa";
  area: "site" | "seo" | "conteudo" | "autopilot";
  title: string;
  description: string;
  action: string;
};

/**
 * GET /tenants/:tenantId/content-autopilot/site-plan
 *
 * Plano editorial/comercial do site calculado apenas com dados reais já
 * existentes no tenant. Não cria métricas artificiais: sites, keywords,
 * artigos e estado do Autopilot são a fonte de verdade.
 */
router.get("/tenants/:tenantId/content-autopilot/site-plan", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!checkSitePlanAccess(req, res, tenantId)) return;

  try {
    const [sites, keywords, articles, configs] = await Promise.all([
      db
        .select({
          id: generatedSitesTable.id,
          name: generatedSitesTable.name,
          siteType: generatedSitesTable.siteType,
          published: generatedSitesTable.published,
          updatedAt: generatedSitesTable.updatedAt,
        })
        .from(generatedSitesTable)
        .where(eq(generatedSitesTable.tenantId, tenantId))
        .orderBy(desc(generatedSitesTable.updatedAt)),
      db
        .select({
          id: contentAutopilotKeywordsTable.id,
          termo: contentAutopilotKeywordsTable.termo,
          status: contentAutopilotKeywordsTable.status,
          volumeBusca: contentAutopilotKeywordsTable.volumeBusca,
        })
        .from(contentAutopilotKeywordsTable)
        .where(eq(contentAutopilotKeywordsTable.tenantId, tenantId)),
      db
        .select({
          id: contentAutopilotArticlesTable.id,
          status: contentAutopilotArticlesTable.status,
          seoScore: contentAutopilotArticlesTable.seoScore,
          keywordId: contentAutopilotArticlesTable.keywordId,
          titulo: contentAutopilotArticlesTable.titulo,
        })
        .from(contentAutopilotArticlesTable)
        .where(eq(contentAutopilotArticlesTable.tenantId, tenantId))
        .orderBy(desc(contentAutopilotArticlesTable.createdAt)),
      db
        .select({
          ativo: contentAutopilotConfigTable.ativo,
          siteUrl: contentAutopilotConfigTable.siteUrl,
          brandTone: contentAutopilotConfigTable.brandTone,
        })
        .from(contentAutopilotConfigTable)
        .where(eq(contentAutopilotConfigTable.tenantId, tenantId))
        .limit(1),
    ]);

    const config = configs[0] ?? null;
    const publishedSites = sites.filter((site) => site.published);
    const discoveredKeywords = keywords.filter((keyword) => keyword.status === "descoberta");
    const approvedKeywords = keywords.filter((keyword) => keyword.status === "aprovada");
    const activeKeywordIds = new Set(
      articles.map((article) => article.keywordId).filter((id): id is string => Boolean(id)),
    );
    const approvedWithoutArticle = approvedKeywords.filter((keyword) => !activeKeywordIds.has(keyword.id));
    const reviewArticles = articles.filter((article) => article.status === "pronto_revisao");
    const lowSeoArticles = articles.filter(
      (article) => typeof article.seoScore === "number" && article.seoScore < 70,
    );
    const publishedArticles = articles.filter((article) => article.status === "publicado");

    const opportunities: PlanOpportunity[] = [];

    if (sites.length === 0) {
      opportunities.push({
        id: "create-site",
        priority: "alta",
        area: "site",
        title: "Criar o primeiro ativo digital",
        description: "O tenant ainda não possui site ou landing page no Gerador de Sites.",
        action: "Abrir Gerador de Sites",
      });
    } else if (publishedSites.length === 0) {
      opportunities.push({
        id: "publish-site",
        priority: "alta",
        area: "site",
        title: "Publicar um site ou landing page",
        description: `${sites.length} projeto${sites.length === 1 ? " está" : "s estão"} criado${sites.length === 1 ? "" : "s"}, mas nenhum está publicado.`,
        action: "Revisar e publicar",
      });
    }

    if (!config?.siteUrl) {
      opportunities.push({
        id: "connect-site-url",
        priority: "alta",
        area: "autopilot",
        title: "Conectar o site ao Content Autopilot",
        description: "Defina a URL principal para o Autopilot analisar tom de marca e orientar o conteúdo.",
        action: "Configurar URL do site",
      });
    } else if (!config.brandTone) {
      opportunities.push({
        id: "analyze-brand-tone",
        priority: "media",
        area: "autopilot",
        title: "Analisar o tom de marca",
        description: "A URL já está conectada, mas o tom de marca ainda não foi extraído do site.",
        action: "Analisar site",
      });
    }

    if (keywords.length === 0) {
      opportunities.push({
        id: "discover-keywords",
        priority: "alta",
        area: "seo",
        title: "Mapear oportunidades de busca",
        description: "Ainda não existem keywords no plano editorial deste tenant.",
        action: "Pesquisar keywords",
      });
    } else if (discoveredKeywords.length > 0) {
      opportunities.push({
        id: "review-keywords",
        priority: "media",
        area: "seo",
        title: "Revisar novas oportunidades SEO",
        description: `${discoveredKeywords.length} keyword${discoveredKeywords.length === 1 ? " aguarda" : "s aguardam"} aprovação ou descarte.`,
        action: "Revisar keywords",
      });
    }

    if (approvedWithoutArticle.length > 0) {
      const topTerms = approvedWithoutArticle.slice(0, 3).map((keyword) => keyword.termo).join(", ");
      opportunities.push({
        id: "generate-approved-content",
        priority: "alta",
        area: "conteudo",
        title: "Transformar demanda aprovada em conteúdo",
        description: `${approvedWithoutArticle.length} keyword${approvedWithoutArticle.length === 1 ? " aprovada ainda não possui" : "s aprovadas ainda não possuem"} artigo. Prioridades: ${topTerms}.`,
        action: "Gerar artigos",
      });
    }

    if (reviewArticles.length > 0) {
      opportunities.push({
        id: "review-articles",
        priority: "alta",
        area: "conteudo",
        title: "Conteúdos aguardando revisão",
        description: `${reviewArticles.length} artigo${reviewArticles.length === 1 ? " está" : "s estão"} pronto${reviewArticles.length === 1 ? "" : "s"} para revisão antes da publicação.`,
        action: "Revisar artigos",
      });
    }

    if (lowSeoArticles.length > 0) {
      opportunities.push({
        id: "improve-seo",
        priority: "media",
        area: "seo",
        title: "Melhorar conteúdos com SEO abaixo de 70",
        description: `${lowSeoArticles.length} artigo${lowSeoArticles.length === 1 ? " precisa" : "s precisam"} de otimização antes de ganhar mais distribuição.`,
        action: "Otimizar SEO",
      });
    }

    if (!config?.ativo && keywords.some((keyword) => keyword.status === "aprovada")) {
      opportunities.push({
        id: "activate-autopilot",
        priority: "media",
        area: "autopilot",
        title: "Ativar o ciclo contínuo de conteúdo",
        description: "Há oportunidades aprovadas, mas o Content Autopilot está pausado.",
        action: "Ativar Autopilot",
      });
    }

    const ordered = opportunities.sort((a, b) => {
      const rank = { alta: 0, media: 1, baixa: 2 } as const;
      return rank[a.priority] - rank[b.priority];
    });

    const weeks = [
      {
        week: 1,
        focus: sites.length === 0 ? "Base digital" : "Diagnóstico e intenção",
        action: sites.length === 0 ? "Criar o site/LP inicial" : keywords.length === 0 ? "Pesquisar e selecionar keywords" : "Revisar oportunidades prioritárias",
      },
      {
        week: 2,
        focus: "Produção",
        action: approvedWithoutArticle.length > 0 ? "Criar conteúdo para keywords aprovadas" : "Expandir páginas, FAQ e conteúdos prioritários",
      },
      {
        week: 3,
        focus: "Otimização",
        action: lowSeoArticles.length > 0 ? "Otimizar conteúdos abaixo de 70 SEO" : "Revisar SEO, links internos e clareza das ofertas",
      },
      {
        week: 4,
        focus: "Publicação e aprendizado",
        action: publishedArticles.length === 0 ? "Publicar e iniciar medição" : "Revisar desempenho e alimentar o próximo ciclo",
      },
    ];

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        sites: sites.length,
        publishedSites: publishedSites.length,
        keywords: keywords.length,
        discoveredKeywords: discoveredKeywords.length,
        approvedKeywords: approvedKeywords.length,
        articles: articles.length,
        publishedArticles: publishedArticles.length,
        reviewArticles: reviewArticles.length,
        lowSeoArticles: lowSeoArticles.length,
        autopilotActive: Boolean(config?.ativo),
        siteConnected: Boolean(config?.siteUrl),
      },
      opportunities: ordered,
      weeks,
    });
  } catch (err) {
    req.log?.error({ err, tenantId }, "content-autopilot/site-plan: falhou");
    res.status(500).json({ error: err instanceof Error ? err.message : "Falha ao montar plano de conteúdo do site" });
  }
});

export default router;
