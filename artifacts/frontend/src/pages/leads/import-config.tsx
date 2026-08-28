import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "vendorai_leads_import_mapping";

interface ImportMapping {
  name: string;
  email: string;
  phone: string;
  company: string;
}

const DEFAULT_MAPPING: ImportMapping = {
  name: "Nome",
  email: "E-mail",
  phone: "Telefone",
  company: "Empresa",
};

const LABELS: Record<keyof ImportMapping, string> = {
  name: "Nome",
  email: "E-mail",
  phone: "Telefone",
  company: "Empresa",
};

export default function ImportConfig() {
  const { toast } = useToast();
  const [mapping, setMapping] = useState<ImportMapping>(DEFAULT_MAPPING);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setMapping({ ...DEFAULT_MAPPING, ...JSON.parse(saved) });
    } catch {
      // Mantém os padrões se houver valor antigo inválido no navegador.
    }
  }, []);

  function updateMapping(key: keyof ImportMapping, value: string) {
    setMapping((current) => ({ ...current, [key]: value }));
  }

  function saveMapping() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));
    toast({ title: "Mapeamento salvo", description: "A configuração de importação foi salva neste navegador." });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">⚙️ Configurar Importação de Leads</h1>
      <p className="text-gray-600 mb-6">Mapeie os campos do seu CSV para os campos do sistema.</p>

      <div className="bg-white rounded shadow overflow-hidden border">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-left">Campo do Sistema</th>
              <th className="p-3 text-left">Coluna do CSV</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(mapping) as Array<keyof ImportMapping>).map((key) => (
              <tr key={key} className="border-t">
                <td className="p-3 font-medium">{LABELS[key]}</td>
                <td className="p-3">
                  <input
                    type="text"
                    value={mapping[key]}
                    onChange={(event) => updateMapping(key, event.target.value)}
                    className="border rounded p-1.5 w-full"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="p-4 border-t flex justify-end">
          <button type="button" onClick={saveMapping} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            Salvar Mapeamento
          </button>
        </div>
      </div>
    </div>
  );
}
