from pathlib import Path

path = Path('artifacts/frontend/src/pages/LeadDetail.tsx')
text = path.read_text()

old_helpers = '''function getBase()  { return (import.meta.env.BASE_URL ?? "/").replace(/\\/$/, ""); }
function getToken() { return localStorage.getItem("vendorai_token") ?? ""; }
'''
new_helpers = '''function getBase()  { return (import.meta.env.BASE_URL ?? "/").replace(/\\/$/, ""); }
function getToken() { return localStorage.getItem("vendorai_token") ?? ""; }

function normalizeWhatsAppNumber(value?: string | null): string {
  let digits = String(value ?? "").replace(/\\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Telefones nacionais salvos com DDD (10/11 dígitos) recebem o DDI Brasil.
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) return `55${digits}`;
  return digits;
}

function normalizeInstagramHandle(value?: string | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    if (/^https?:\\/\\//i.test(raw)) {
      const url = new URL(raw);
      const host = url.hostname.replace(/^www\\./, "").toLowerCase();
      if (host === "instagram.com") return (url.pathname.split("/").filter(Boolean)[0] ?? "").replace(/^@/, "");
    }
  } catch {
    // Continua abaixo e tenta interpretar como @handle puro.
  }
  return raw.replace(/^@/, "").split(/[/?#]/)[0]?.trim() ?? "";
}
'''
assert old_helpers in text, 'helper marker not found'
text = text.replace(old_helpers, new_helpers, 1)

marker = '''  function openWhatsappDialog() {
    void openIniciarConversa("whatsapp");
  }
'''
insert = '''  function openDirectWhatsApp() {
    const number = normalizeWhatsAppNumber(lead?.telefone);
    if (!number) {
      toast({
        title: "WhatsApp não cadastrado",
        description: "Cadastre o telefone do lead para iniciar a conversa.",
        variant: "destructive",
      });
      return;
    }
    window.open(`https://wa.me/${number}`, "_blank", "noopener,noreferrer");
  }

  function openDirectInstagram() {
    const handle = normalizeInstagramHandle((lead as { instagramHandle?: string | null } | undefined)?.instagramHandle);
    if (!handle) {
      toast({
        title: "Instagram não cadastrado",
        description: "Cadastre o @ do Instagram deste lead para iniciar a conversa.",
        variant: "destructive",
      });
      return;
    }
    window.open(`https://ig.me/m/${encodeURIComponent(handle)}`, "_blank", "noopener,noreferrer");
  }

'''
assert marker in text, 'whatsapp dialog marker not found'
text = text.replace(marker, insert + marker, 1)

old_actions = '''          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setLocation(`/trabalho?leadId=${encodeURIComponent(lead.id)}&newDeal=1`)}
            data-testid="btn-new-negotiation"
          >
            <Briefcase className="h-4 w-4" />
            Nova negociação
          </Button>
          {lead.telefone && (
            <Button
              size="sm"
              className="bg-[#25D366] hover:bg-[#1ebe5d] text-white gap-1.5"
              onClick={() => void openIniciarConversa("whatsapp")}
              data-testid="btn-start-whatsapp"
            >
              <MessageSquare className="h-4 w-4" />
              WhatsApp
            </Button>
          )}
          {lead.instagramScopedId && (
            <Button
              size="sm"
              className="gap-1.5 text-white"
              style={{ background: "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)" }}
              onClick={() => void openIniciarConversa("instagram")}
              data-testid="btn-start-instagram"
            >
              <InstagramIcon className="h-4 w-4" />
              Instagram
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setAgendarOpen(true)}
          >
            <CalendarDays className="h-4 w-4" />
            Agendar reunião
          </Button>
          {lead.status !== "convertido" && (leadDeals?.length ?? 0) > 0 && (
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setVendidoOpen(true)}
              data-testid="btn-vendido"
            >
              <CheckCircle2 className="h-4 w-4" />
              Vendido
            </Button>
          )}
'''
new_actions = '''          <Button
            size="sm"
            className="bg-[#25D366] hover:bg-[#1ebe5d] text-white gap-1.5"
            onClick={openDirectWhatsApp}
            disabled={!lead.telefone}
            title={lead.telefone ? `Abrir conversa com ${lead.telefone}` : "WhatsApp não cadastrado"}
            data-testid="btn-start-whatsapp"
          >
            <MessageSquare className="h-4 w-4" />
            WhatsApp
          </Button>
          <Button
            size="sm"
            className="gap-1.5 text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)" }}
            onClick={openDirectInstagram}
            disabled={!normalizeInstagramHandle((lead as { instagramHandle?: string | null }).instagramHandle)}
            title={normalizeInstagramHandle((lead as { instagramHandle?: string | null }).instagramHandle) ? `Abrir conversa com @${normalizeInstagramHandle((lead as { instagramHandle?: string | null }).instagramHandle)}` : "Instagram não cadastrado"}
            data-testid="btn-start-instagram"
          >
            <InstagramIcon className="h-4 w-4" />
            Instagram
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setAgendarOpen(true)}
          >
            <CalendarDays className="h-4 w-4" />
            Agendar reunião
          </Button>
'''
assert old_actions in text, 'action bar marker not found'
text = text.replace(old_actions, new_actions, 1)

path.write_text(text)
