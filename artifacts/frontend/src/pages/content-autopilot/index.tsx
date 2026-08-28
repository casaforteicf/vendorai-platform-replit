import { useEffect, useState } from "react";
import { Edit, Plus, Trash2 } from "lucide-react";

interface PlannedPost {
  id: string;
  title: string;
  status: "draft" | "scheduled" | "published";
  platform: string;
}

export default function PlannedContentAutopilot() {
  const [posts, setPosts] = useState<PlannedPost[]>([
    { id: "1", title: "Post de boas-vindas", status: "published", platform: "Instagram" },
    { id: "2", title: "Oferta especial", status: "scheduled", platform: "Facebook" },
  ]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 1000);
    return () => window.clearTimeout(timer);
  }, []);

  const handleDelete = (id: string) => {
    setPosts((current) => current.filter((post) => post.id !== id));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Content Autopilot</h1>
            <p className="text-gray-600">Gerencie seus conteúdos com IA</p>
          </div>
          <button type="button" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
            <Plus size={20} /> Novo Post
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded shadow">
            <p className="text-sm text-gray-600">Total</p>
            <p className="text-2xl font-bold">{posts.length}</p>
          </div>
          <div className="bg-white p-4 rounded shadow">
            <p className="text-sm text-gray-600">Agendados</p>
            <p className="text-2xl font-bold">{posts.filter((post) => post.status === "scheduled").length}</p>
          </div>
          <div className="bg-white p-4 rounded shadow">
            <p className="text-sm text-gray-600">Publicados</p>
            <p className="text-2xl font-bold">{posts.filter((post) => post.status === "published").length}</p>
          </div>
        </div>

        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left">Título</th>
                <th className="p-3 text-left">Plataforma</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id} className="border-t">
                  <td className="p-3">{post.title}</td>
                  <td className="p-3">{post.platform}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs ${post.status === "published" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
                      {post.status}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button type="button" className="text-blue-600" aria-label={`Editar ${post.title}`}>
                        <Edit size={18} />
                      </button>
                      <button type="button" onClick={() => handleDelete(post.id)} className="text-red-600" aria-label={`Excluir ${post.title}`}>
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
