export type BudgetItem={
 id:string;
 projectId:string;
 environmentId:string;
 canonicalProductId:string;
 quantity:number;
 unitPrice:number;
 total:number;
 approvalId?:string;
};