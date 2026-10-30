import { VendorBackButton } from "@/components/ui/back-button";
import { Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ContactSales() {
  return (
    <div className="min-h-screen bg-background px-4 py-12 flex items-center justify-center">
      <Card className="w-full max-w-xl">
        <CardContent className="p-6 md:p-8 space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Falar com Vendas</h1>
            <p className="text-muted-foreground mt-2">Escolha um canal para conversar com o time comercial sobre a continuidade do Vendor.ai.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Button asChild className="h-12">
              <a href="mailto:vendas@appvendorai.com"><Mail className="h-4 w-4 mr-2" />E-mail comercial</a>
            </Button>
            <Button asChild variant="outline" className="h-12">
              <a href="https://wa.me/5549988165795" target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 mr-2" />WhatsApp</a>
            </Button>
          </div>
          <VendorBackButton to="/dashboard" label="Voltar ao Vendor.ai" className="px-0" />
        </CardContent>
      </Card>
    </div>
  );
}
