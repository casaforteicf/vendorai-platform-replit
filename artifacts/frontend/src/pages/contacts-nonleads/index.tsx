import { useState } from "react";

type ContactStage = "prospecting" | "active" | "inactive";
type ContactType = "supplier" | "partner" | "family" | "collaborator";

interface NonLeadContact {
  id: string;
  name: string;
  type: ContactType;
  stage: ContactStage;
}

const stages: ContactStage[] = ["prospecting", "active", "inactive"];
const labels: Record<ContactStage, string> = {
  prospecting: "Prospecção",
  active: "Ativo",
  inactive: "Inativo",
};
const typeLabels: Record<ContactType, string> = {
  supplier: "Fornecedor",
  partner: "Parceiro",
  family: "Família",
  collaborator: "Colaborador",
};

export default function NonLeadsKanban() {
  const [contacts] = useState<NonLeadContact[]>([
    { id: "1", name: "Fornecedor XYZ", type: "supplier", stage: "active" },
    { id: "2", name: "Parceiro ABC", type: "partner", stage: "prospecting" },
  ]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">👥 Contatos (Não-Leads)</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stages.map((stage) => (
          <div key={stage} className="bg-gray-50 rounded-lg p-4 min-h-[300px] border">
            <h2 className="font-semibold text-center mb-4">{labels[stage]}</h2>
            {contacts.filter((contact) => contact.stage === stage).map((contact) => (
              <div key={contact.id} className="bg-white p-3 rounded shadow mb-2 border-l-4 border-purple-500">
                <div className="font-semibold">{contact.name}</div>
                <div className="text-sm text-gray-600">{typeLabels[contact.type]}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
