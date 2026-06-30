import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

type Origem =
  | "cta_final"
  | "formulario_contato"
  | "plano_growth"
  | "plano_pme"
  | "plano_enterprise"
  | "parceiro_interesse"
  | (string & {});

interface ContactModalProps {
  open: boolean;
  onClose: () => void;
  origem: Origem;
  mensagemPreenchida?: string;
  titulo?: string;
}

interface FormData {
  nome: string;
  email: string;
  whatsapp?: string;
  empresa?: string;
  mensagem: string;
}

type ModalState = "form" | "loading" | "success" | "error";

export function ContactModal({
  open,
  onClose,
  origem,
  mensagemPreenchida = "",
  titulo = "Falar com a Vendor.ai",
}: ContactModalProps) {
  const [state, setState] = useState<ModalState>("form");
  const [errorMsg, setErrorMsg] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: { mensagem: mensagemPreenchida },
  });

  function handleOpenChange(val: boolean) {
    if (!val) {
      handleClose();
    }
  }

  function handleClose() {
    onClose();
    // Reset after animation
    setTimeout(() => {
      setState("form");
      setErrorMsg("");
      reset({ mensagem: mensagemPreenchida });
    }, 200);
  }

  async function onSubmit(data: FormData) {
    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch(`${API_BASE}/site/contato`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: data.nome,
          email: data.email,
          telefone: data.whatsapp || undefined,
          empresa: data.empresa || undefined,
          mensagem: data.mensagem,
          origem: origem as string,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          (body.details as string[] | undefined)?.join(", ") ||
          body.error ||
          "Erro ao enviar mensagem.";
        throw new Error(msg);
      }

      setState("success");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Tente novamente.");
      setState("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px] bg-[#0f1229] border border-white/10 text-[#f0eeff]">
        {state === "success" ? (
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-xl text-[#f0eeff]">
                Mensagem enviada!
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-[#8880a8] leading-relaxed max-w-xs">
              Recebemos seu contato. Nossa equipe retornará em breve pelo e-mail
              informado.
            </p>
            <Button
              onClick={handleClose}
              className="mt-2 rounded-full bg-gradient-to-r from-violet-600 to-cyan-500 text-white border-0 hover:opacity-90"
            >
              Fechar
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg text-[#f0eeff]">
                {titulo}
              </DialogTitle>
              <p className="text-sm text-[#8880a8] mt-1">
                Preencha abaixo e retornamos em breve.
              </p>
            </DialogHeader>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
              {state === "error" && (
                <Alert variant="destructive" className="border-red-500/30 bg-red-500/10">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-red-400">
                    {errorMsg}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cm-nome" className="text-xs font-semibold text-[#8880a8] uppercase tracking-wide">
                    Nome <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="cm-nome"
                    placeholder="João Silva"
                    className="bg-white/5 border-white/10 text-[#f0eeff] placeholder:text-[#4e4870] focus-visible:ring-violet-500/50 focus-visible:border-violet-500/50"
                    {...register("nome", { required: "Nome obrigatório" })}
                  />
                  {errors.nome && (
                    <p className="text-xs text-red-400">{errors.nome.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cm-email" className="text-xs font-semibold text-[#8880a8] uppercase tracking-wide">
                    E-mail <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="cm-email"
                    type="email"
                    placeholder="joao@empresa.com"
                    className="bg-white/5 border-white/10 text-[#f0eeff] placeholder:text-[#4e4870] focus-visible:ring-violet-500/50 focus-visible:border-violet-500/50"
                    {...register("email", {
                      required: "E-mail obrigatório",
                      pattern: { value: /^\S+@\S+\.\S+$/, message: "E-mail inválido" },
                    })}
                  />
                  {errors.email && (
                    <p className="text-xs text-red-400">{errors.email.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cm-wpp" className="text-xs font-semibold text-[#8880a8] uppercase tracking-wide">
                    WhatsApp
                  </Label>
                  <Input
                    id="cm-wpp"
                    placeholder="(11) 99999-9999"
                    className="bg-white/5 border-white/10 text-[#f0eeff] placeholder:text-[#4e4870] focus-visible:ring-violet-500/50 focus-visible:border-violet-500/50"
                    {...register("whatsapp")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cm-empresa" className="text-xs font-semibold text-[#8880a8] uppercase tracking-wide">
                    Empresa
                  </Label>
                  <Input
                    id="cm-empresa"
                    placeholder="Sua Empresa"
                    className="bg-white/5 border-white/10 text-[#f0eeff] placeholder:text-[#4e4870] focus-visible:ring-violet-500/50 focus-visible:border-violet-500/50"
                    {...register("empresa")}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cm-msg" className="text-xs font-semibold text-[#8880a8] uppercase tracking-wide">
                  Mensagem <span className="text-red-400">*</span>
                </Label>
                <Textarea
                  id="cm-msg"
                  rows={3}
                  className="bg-white/5 border-white/10 text-[#f0eeff] placeholder:text-[#4e4870] focus-visible:ring-violet-500/50 focus-visible:border-violet-500/50 resize-none"
                  {...register("mensagem", { required: "Mensagem obrigatória", minLength: { value: 5, message: "Mensagem muito curta" } })}
                />
                {errors.mensagem && (
                  <p className="text-xs text-red-400">{errors.mensagem.message}</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={state === "loading"}
                className="w-full rounded-full bg-gradient-to-r from-violet-600 via-blue-600 to-cyan-500 text-white border-0 font-semibold hover:opacity-90 disabled:opacity-60"
              >
                {state === "loading" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar mensagem"
                )}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ContactModal;
