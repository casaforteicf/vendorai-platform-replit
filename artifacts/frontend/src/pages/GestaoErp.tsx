import GestaoErpContent from "./GestaoErpContent";
import { ErpEntitlementGate } from "@/components/erp/ErpEntitlementGate";

export default function GestaoErp() {
  return (
    <ErpEntitlementGate>
      <GestaoErpContent />
    </ErpEntitlementGate>
  );
}
