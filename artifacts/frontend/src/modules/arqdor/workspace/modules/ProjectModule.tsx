import ArqdorPage from '../../../../pages/arch/ArqdorPage'

// ProjectModule embeds the full ArqdorPage (Modelagem + Projeto Inteligente)
// inside the workspace content area. ArqdorPage receives standalone={false}
// so it uses height:100% instead of height:100vh, filling this container.
export function ProjectModule() {
  return (
    <div style={{ position:'absolute', inset:0, overflow:'hidden' }}>
      <ArqdorPage standalone={false} />
    </div>
  )
}
