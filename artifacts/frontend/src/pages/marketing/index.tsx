import { Link, useLocation } from "wouter";

const tabs = [
  { href: "/marketing", label: "Dashboard" },
  { href: "/marketing/campanhas", label: "Campanhas" },
  { href: "/marketing/conteudo", label: "Conteúdo" },
] as const;

export default function Marketing() {
  const [location] = useLocation();

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">📢 Marketing</h1>
      <div className="flex gap-4 mb-6 border-b">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`pb-2 px-2 ${location === tab.href ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-600"}`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/campanhas-nova" className="bg-white border rounded-lg p-5 hover:shadow-sm">
          <div className="font-semibold">Campanhas</div>
          <p className="text-sm text-gray-500 mt-1">Acesse o módulo real de campanhas do VendorAI.</p>
        </Link>
        <Link href="/content-autopilot" className="bg-white border rounded-lg p-5 hover:shadow-sm">
          <div className="font-semibold">Content Autopilot</div>
          <p className="text-sm text-gray-500 mt-1">Planejamento e publicação automática de conteúdo.</p>
        </Link>
        <Link href="/content-studio" className="bg-white border rounded-lg p-5 hover:shadow-sm">
          <div className="font-semibold">Content Studio</div>
          <p className="text-sm text-gray-500 mt-1">Criação assistida de conteúdo e mídia.</p>
        </Link>
      </div>
    </div>
  );
}
