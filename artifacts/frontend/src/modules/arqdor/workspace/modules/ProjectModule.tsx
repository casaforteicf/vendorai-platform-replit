import { RealDataUnavailable } from '@/components/RealDataUnavailable'
import { useWorkspaceProject } from '../WorkspaceContext'

/**
 * The previous ProjectModule mounted ArqdorPage, whose initial state was a
 * hard-coded demo project (Apartamento Alpha / Família Oliveira). That could
 * overwrite WorkspaceContext and present simulated project data to a real
 * tenant. Until the intelligent editor accepts the persisted project as its
 * source of truth, keep this surface protected instead of showing fake data.
 */
export function ProjectModule() {
  const { projectCtx, isRealProject, isInitializing, loadError } = useWorkspaceProject()

  if (isInitializing) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando projeto real…</div>
  }

  if (loadError) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          {loadError}
        </div>
      </div>
    )
  }

  return (
    <RealDataUnavailable
      title={isRealProject && projectCtx.name ? `Projeto Inteligente — ${projectCtx.name}` : 'Projeto Inteligente temporariamente protegido'}
      description={
        isRealProject
          ? 'O projeto real foi carregado, mas o editor inteligente antigo ainda inicializa dados simulados. O editor foi protegido até consumir o projeto real como única fonte de verdade.'
          : 'Nenhum projeto real está carregado. A versão anterior desta área abria automaticamente um projeto fictício; esse comportamento foi removido.'
      }
      backHref="/arch"
    />
  )
}
