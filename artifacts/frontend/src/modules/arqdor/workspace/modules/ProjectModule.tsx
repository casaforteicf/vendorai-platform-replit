import ArqdorPage from '../../../../pages/arch/ArqdorPage'
import { useWorkspaceProject } from '../WorkspaceContext'
import { archProjectToContext } from '../../engines/aie/arch-project-to-context'
import type { ArchProject } from '../../../../pages/arch/arqdor-types'

// ProjectModule embeds the full ArqdorPage (Modelagem + Projeto Inteligente)
// inside the workspace content area. It bridges real project state into the
// shared WorkspaceContext so AIE scores stay live.
export function ProjectModule() {
  const { setProjectCtx } = useWorkspaceProject()

  function handleProjectChange(project: ArchProject) {
    setProjectCtx(archProjectToContext(project))
  }

  return (
    <div style={{ position:'absolute', inset:0, overflow:'hidden' }}>
      <ArqdorPage standalone={false} onProjectChange={handleProjectChange} />
    </div>
  )
}
