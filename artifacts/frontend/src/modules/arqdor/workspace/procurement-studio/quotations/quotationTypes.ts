export type QuoteStatus = "draft" | "sent" | "received" | "negotiation" | "approved" | "rejected";
export type QuoteCriteria = "price" | "deadline" | "score" | "balanced";

export type Quotation = {
  id: string;
  requestCode: string;
  itemName: string;
  supplier: string;
  category: string;
  price: number;
  originalPrice: number;
  leadTimeDays: number;
  paymentTerms: string;
  warranty: string;
  score: number;
  status: QuoteStatus;
  observations: string;
};

export type PriceHistoryPoint = {
  month: string;
  value: number;
};

export type QuoteInsight = {
  title: string;
  description: string;
  impact: string;
  action: string;
};
