export type ProductionOrder={
 id?:string;
 projectId:string;
 purchaseOrderId:string;
 environmentId?:string;
 canonicalProductId:string;
 quantity:number;
 unit:string;
 status:"planned"|"scheduled"|"manufacturing"|"finished"|"delivered";
};