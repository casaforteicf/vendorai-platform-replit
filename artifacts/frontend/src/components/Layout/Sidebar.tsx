export default function PlannedSidebar() {
  return (
    <nav className="w-64 bg-gray-900 text-white p-4 min-h-screen">
      <div className="mb-6 text-xl font-bold">AppVendorAI</div>
      <ul className="space-y-2">
        <li><a href="/dashboard" className="block p-2 hover:bg-gray-700 rounded">📊 Dashboard</a></li>
        <li><a href="/leads" className="block p-2 hover:bg-gray-700 rounded">👤 Leads</a></li>
        <li><a href="/pipeline" className="block p-2 hover:bg-gray-700 rounded">📋 Pipeline</a></li>
        <li><a href="/marketing" className="block p-2 hover:bg-gray-700 rounded">📢 Marketing</a></li>
        <li><a href="/conversations" className="block p-2 hover:bg-gray-700 rounded">💬 Conversas</a></li>
        <li><a href="/configuracoes" className="block p-2 hover:bg-gray-700 rounded">⚙️ Configurações</a></li>
      </ul>
    </nav>
  );
}
