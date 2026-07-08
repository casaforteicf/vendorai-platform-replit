export type ReceivingView = "receiving" | "inventory" | "warehouse" | "logistics" | "tracking" | "ai";

export type ReceivingStatus = "scheduled" | "in_transit" | "received" | "inspection" | "approved" | "rejected";
export type InventoryStatus = "available" | "reserved" | "low_stock" | "damaged" | "returned";
export type DeliveryStatus = "pending" | "scheduled" | "in_route" | "delivered" | "delayed";

export type ReceivingItem = {
  id: string;
  code: string;
  purchaseOrder: string;
  supplier: string;
  itemName: string;
  environment: string;
  quantity: number;
  unit: string;
  expectedDate: string;
  receivedDate?: string;
  status: ReceivingStatus;
  responsible: string;
  aiNote: string;
};

export type InventoryItem = {
  id: string;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  location: string;
  reservedFor: string;
  status: InventoryStatus;
  value: number;
};

export type DeliveryRoute = {
  id: string;
  code: string;
  destination: string;
  supplier: string;
  items: number;
  scheduledDate: string;
  status: DeliveryStatus;
  driver: string;
  aiNote: string;
};
