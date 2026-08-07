'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    empresa: {
      nome: 'Piscinas & Spas Premium',
      setor: 'piscinas',
      porte: 'medio',
      canais: ['whatsapp'],
      regiao: 'brasil'
    },
    produtos: [],
    politicas: {
      orcamentos_parados: { ativo: true, prazos_por_produto: {} }
    },
    comunicacao: { tom: 'amigavel', usar_emojis: true },
    spam_controls: { max_executions_per_day: 100 }
  });

  const [novoProduto, setNovoProduto] = useState({
    id: '',
    nome: '',
    categoria: 'piscina',
    prazo_instalacao_dias: 15,
    garantia_anos: 5
  });

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      const response = await fetch('/api/rules');
      const data = await response.json();
      setRules(data.rules || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const adicionarProduto = () => {
    if (!novoProduto.nome) return;
    
    setFormData({
      ...formData,
      produtos: [
        ...formData.produtos,
        {
          ...novoProduto,
          id: novoProduto.id || `prod_${Date.now()}`
        }
      ]
    });
    
    setNovoProduto({
      id: '',
      nome: '',
      categoria: 'piscina',
      prazo_instalacao_dias: 15,
      garantia_anos: 5
    });
  };

  const removerProduto = (id: string) => {
    setFormData({
      ...formData,
      produtos: formData.produtos.filter((p: any) => p.id !== id)
    });
  };

  const generateRules = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/rules/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 'tenant_001',
          ...formData
        })
      });
      const data = await response.json();
      if (data.success) {
        alert(`✅ ${data.total_rules} regras geradas!`);
        fetchRules();
      }
    } catch (error) {
      alert('❌ Erro ao gerar regras');
    } finally {
      setLoading(false);
    }
  };

  if (loading && rules.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">📊 Revenue Scout</h1>
              <p className="text-gray-600">Gerencie suas regras de negócio automaticamente</p>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
              ✅ Ativo
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-sm text-gray-500">Total de Regras</h3>
            <p className="text-2xl font-bold">{rules.length}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-sm text-gray-500">Produtos</h3>
            <p className="text-2xl font-bold">{formData.produtos.length}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-sm text-gray-500">Status</h3>
            <p className="text-2xl font-bold text-green-600">✅ Ativo</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-4">⚙️ Configurar Regras</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nome da Empresa</label>
              <input
                type="text"
                value={formData.empresa.nome}
                onChange={(e) => setFormData({
                  ...formData,
                  empresa: { ...formData.empresa, nome: e.target.value }
                })}
                className="mt-1 w-full px-3 py-2 border rounded-lg"
                placeholder="Minha Empresa"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Setor</label>
              <select
                value={formData.empresa.setor}
                onChange={(e) => setFormData({
                  ...formData,
                  empresa: { ...formData.empresa, setor: e.target.value }
                })}
                className="mt-1 w-full px-3 py-2 border rounded-lg"
              >
                <option value="piscinas">Piscinas</option>
                <option value="seguros">Seguros</option>
                <option value="imobiliario">Imobiliário</option>
                <option value="outro">Outro</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Canais</label>
            <div className="flex gap-4">
              {['whatsapp', 'email', 'sms'].map((canal) => (
                <label key={canal} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.empresa.canais.includes(canal)}
                    onChange={(e) => {
                      const novosCanais = e.target.checked
                        ? [...formData.empresa.canais, canal]
                        : formData.empresa.canais.filter((c: string) => c !== canal);
                      setFormData({
                        ...formData,
                        empresa: { ...formData.empresa, canais: novosCanais }
                      });
                    }}
                    className="mr-2"
                  />
                  {canal.charAt(0).toUpperCase() + canal.slice(1)}
                </label>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Produtos</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="Nome do produto"
                value={novoProduto.nome}
                onChange={(e) => setNovoProduto({ ...novoProduto, nome: e.target.value })}
                className="flex-1 px-3 py-2 border rounded-lg"
              />
              <input
                type="number"
                placeholder="Dias"
                value={novoProduto.prazo_instalacao_dias}
                onChange={(e) => setNovoProduto({ ...novoProduto, prazo_instalacao_dias: parseInt(e.target.value) })}
                className="w-20 px-3 py-2 border rounded-lg"
              />
              <button
                onClick={adicionarProduto}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                ➕
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.produtos.map((p: any) => (
                <span key={p.id} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm flex items-center">
                  {p.nome} ({p.prazo_instalacao_dias}d)
                  <button
                    onClick={() => removerProduto(p.id)}
                    className="ml-2 text-red-500 hover:text-red-700"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={generateRules}
            disabled={loading || formData.produtos.length === 0}
            className="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
          >
            {loading ? '⏳ Gerando...' : '🚀 Gerar Regras Automáticas'}
          </button>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">📋 Regras Ativas</h2>
          {rules.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-2xl mb-2">📭</p>
              <p>Nenhuma regra configurada.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="p-3 text-left text-sm font-medium text-gray-500">Nome</th>
                    <th className="p-3 text-left text-sm font-medium text-gray-500">Tipo</th>
                    <th className="p-3 text-left text-sm font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule: any) => (
                    <tr key={rule.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">{rule.nome}</td>
                      <td className="p-3">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                          {rule.tipo}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-green-600">✅ Ativo</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
