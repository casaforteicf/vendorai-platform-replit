import ErpCaptureContent from "./ErpCaptureContent";
import { ErpEntitlementGate } from "@/components/erp/ErpEntitlementGate";

export default function ErpCapture() {
  return (
    <ErpEntitlementGate>
      <ErpCaptureContent />
    </ErpEntitlementGate>
  );
}
