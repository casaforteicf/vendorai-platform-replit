import { useState } from "react";
import { Link } from "wouter";

export default function MarketingCampanhas() {
  const [campaigns] = useState([
    { id: "1", name: "Black Friday", status: "Ativa", reach: 15000, conversions: 320 },
  ]);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-semibold">Campanhas</h2>
          <p className="text-sm text-gray-500">Visão resumida prevista no pacote de melhorias.</p>
        </div>
        <Link href="/campanhas-nova" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">+ Nova</Link>
      </div>

      <div className="bg-white rounded shadow overflow-hidden border">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-left">Nome</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Alcance</th>
              <th className="p-3 text-left">Conversões</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.id} className="border-t">
                <td className="p-3">{campaign.name}</td>
                <td className="p-3"><span className="px-2 py-1 rounded text-xs bg-green-100 text-green-800">{campaign.status}</span></td>
                <td className="p-3">{campaign.reach.toLocaleString("pt-BR")}</td>
                <td className="p-3">{campaign.conversions.toLocaleString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
