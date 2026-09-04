import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { usePublicCountry } from "@/lib/publicCountry";

const PT = {
  title: "Página não encontrada",
  description: "O endereço que você tentou acessar não existe ou foi movido.",
  back: "Voltar para o início",
} as const;

const ES = {
  title: "Página no encontrada",
  description: "La dirección que intentaste abrir no existe o fue movida.",
  back: "Volver al inicio",
} as const;

export default function NotFound() {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-3 items-center">
            <AlertCircle className="h-8 w-8 text-red-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-400">404</p>
              <h1 className="text-2xl font-bold text-gray-900">{copy.title}</h1>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-gray-600">{copy.description}</p>
          <Link href="/" className="mt-6 inline-flex text-sm font-semibold text-primary hover:underline">{copy.back}</Link>
        </CardContent>
      </Card>
    </div>
  );
}
