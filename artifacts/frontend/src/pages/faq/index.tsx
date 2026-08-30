import { useState } from "react";
import { ChevronDown, ChevronRight, HelpCircle } from "lucide-react";

const SECTIONS = [
  { q: "Como começo a usar o Vendor.ai?", a: "Conclua o onboarding do negócio e, em seguida, a etapa de integrações. Depois cadastre ou importe seus leads e use Negócios para acompanhar o funil." },
  { q: "Como importar leads de outra planilha?", a: "Em Leads, abra Importar CSV. Para arquivos com cabeçalhos diferentes, use Mapeamento avançado para relacionar cada coluna da planilha aos campos do CRM antes de importar." },
  { q: "Onde acompanho oportunidades e etapas de venda?", a: "Use Negócios. O Kanban usa os dados reais do CRM e mantém as regras, SLAs, responsáveis, propostas e ações do processo comercial." },
  { q: "Onde ficam fornecedores, parceiros e outros contatos que não são leads?", a: "Em Leads, acesse Outros contatos. Esses registros ficam separados do pipeline comercial e não disparam automações de venda." },
  { q: "Onde configuro WhatsApp, Google Calendar e Instagram?", a: "As conexões ficam centralizadas no onboarding de integrações e nas opções de perfil pertinentes. Não é necessário usar uma segunda tela de integrações no menu principal." },
  { q: "Como conectar o Google Calendar?", a: "Abra Agenda, crie ou selecione uma agenda e use Conectar Google. Após autorizar sua conta, você retorna para a Agenda e os eventos podem ser sincronizados." },
  { q: "Onde ficam campanhas e criação de conteúdo?", a: "Abra Marketing no menu lateral. O gerador, campanhas e Content Autopilot ficam agrupados nessa área para evitar módulos duplicados." },
  { q: "Como lançar um documento no ERP sem digitar tudo?", a: "Abra Gestão ERP e use Capturar documento. Envie uma foto ou PDF, revise os dados sugeridos pela IA e só então confirme o lançamento." },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><HelpCircle className="h-6 w-6 text-primary" />Ajuda e FAQ</h1>
        <p className="text-sm text-muted-foreground mt-1">Respostas rápidas sobre os principais fluxos da plataforma.</p>
      </div>
      <div className="rounded-xl border bg-card divide-y overflow-hidden">
        {SECTIONS.map((item, index) => (
          <div key={item.q}>
            <button type="button" onClick={() => setOpen(open === index ? null : index)} className="w-full p-4 flex items-center justify-between gap-4 text-left hover:bg-muted/40">
              <span className="font-medium">{item.q}</span>
              {open === index ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            </button>
            {open === index && <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">{item.a}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
