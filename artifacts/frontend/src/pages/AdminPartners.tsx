import { PartnerCommercialManager } from "@/components/PartnerCommercialManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BadgePercent, Network } from "lucide-react";
import AdminPartnersLegacy from "./AdminPartnersLegacy";

export default function AdminPartners() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Parceiros & Afiliados</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie influenciadores, afiliados, revendedores, cupons, comissões,
          splits, tenants e prospecção da rede.
        </p>
      </div>

      <Tabs defaultValue="comercial">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="comercial" className="gap-1.5">
            <BadgePercent className="h-4 w-4" />
            Gestão comercial
          </TabsTrigger>
          <TabsTrigger value="operacao" className="gap-1.5">
            <Network className="h-4 w-4" />
            Operação & rede
          </TabsTrigger>
        </TabsList>

        <TabsContent value="comercial" className="pt-4">
          <PartnerCommercialManager />
        </TabsContent>

        <TabsContent value="operacao" className="pt-4">
          <AdminPartnersLegacy />
        </TabsContent>
      </Tabs>
    </div>
  );
}
