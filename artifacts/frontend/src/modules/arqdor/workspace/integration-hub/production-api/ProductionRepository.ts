export class ProductionRepository{
 base="/arch/production";
 async list(projectId:string){
  const r=await fetch(`${this.base}?projectId=${projectId}`);
  if(!r.ok) throw new Error("Production API");
  return r.json();
 }
 async createOrder(payload:unknown){
  const r=await fetch(`${this.base}/orders`,{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify(payload)
  });
  if(!r.ok) throw new Error("Production create");
  return r.json();
 }
}
