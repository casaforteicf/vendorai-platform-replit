import { BookOpen, Building2, FolderKanban, Images, Users } from "lucide-react";

function go(path: string) {
  window.location.assign(path);
}

export default function MediaLibrarySourceGuide() {
  const sources = [
    {
      title: "Empresa e marca",
      description: "Nome, descrição, posicionamento, diferenciais, público, história e identidade oficial.",
      helper: "Fonte oficial: Configurações da Empresa",
      action: "Editar empresa",
      path: "/configuracoes",
      icon: Building2,
    },
    {
      title: "Produtos e serviços",
      description: "Produtos, serviços, descrições, preços, categorias, características e informações comerciais.",
      helper: "Fonte oficial: Catálogo",
      action: "Abrir catálogo",
      path: "/catalogo",
      icon: BookOpen,
    },
    {
      title: "Equipe",
      description: "Pessoas, funções e acessos. Fotos, vídeos e materiais da equipe ficam vinculados nesta biblioteca.",
      helper: "Fonte oficial: Equipe e Acessos",
      action: "Abrir equipe",
      path: "/usuarios",
      icon: Users,
    },
    {
      title: "Obras, projetos e cases",
      description: "Fotos, vídeos, antes e depois, resultados, ambientes, aplicações e documentos de referência.",
      helper: "Adicione e organize diretamente na Biblioteca",
      action: "Ir para mídias",
      path: "#biblioteca-midias",
      icon: FolderKanban,
    },
  ];

  return (
    <section className="mx-auto w-full max-w-[1500px] px-3 pt-4 sm:px-6 lg:px-8" aria-label="Fontes de informação da empresa">
      <div className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
            <Images className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Base de contexto da empresa</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              A IA consulta os dados oficiais já cadastrados no VendorAI e usa esta biblioteca para complementar com fotos, vídeos, documentos, obras, cases e referências. Não cadastre a mesma informação duas vezes.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {sources.map(({ title, description, helper, action, path, icon: Icon }) => (
            <article key={title} className="rounded-2xl border bg-background p-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-foreground"><Icon className="h-4 w-4" /></div>
                <h3 className="text-sm font-semibold">{title}</h3>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</p>
              <p className="mt-2 text-[11px] font-medium text-foreground/70">{helper}</p>
              <button
                type="button"
                onClick={() => path.startsWith("#") ? document.querySelector(path)?.scrollIntoView({ behavior: "smooth", block: "start" }) : go(path)}
                className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-xl border bg-card px-3 text-xs font-semibold transition hover:border-orange-300 hover:text-orange-700"
              >
                {action}
              </button>
            </article>
          ))}
        </div>

        <div className="mt-3 rounded-2xl bg-muted/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Entram automaticamente:</strong> materiais de campanhas e conteúdos gerados pelo sistema. <strong className="text-foreground">Entram manualmente:</strong> fotos, vídeos, documentos, obras, cases e referências que complementam o contexto da empresa.
        </div>
      </div>
    </section>
  );
}
