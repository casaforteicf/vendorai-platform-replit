import { useCallback } from 'react'
import ArqdorPage from '../../../../pages/arch/ArqdorPage'
import type { ArchProject } from '../../../../pages/arch/arqdor-types'
import { useWorkspaceContext } from '../WorkspaceContext'
import { adaptArchProjectToContext } from '../WorkspaceContext'

export function ProjectModule() {
  const { setProjectContext } = useWorkspaceContext()

  const handleProjectChange = useCallback((project: ArchProject) => {
    setProjectContext(adaptArchProjectToContext(project))
  }, [setProjectContext])

  return (
    <div style={{ position:'absolute', inset:0, overflow:'hidden' }}>
      <ArqdorPage standalone={false} onProjectChange={handleProjectChange} />
    </div>
  )
}
