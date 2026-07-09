export class BudgetRepository {
  base="/arch/orcamento";
  async get(projectId:string){
    const r=await fetch(`${this.base}?projectId=${projectId}`);
    if(!r.ok) throw new Error("Budget API");
    return r.json();
  }
  async approve(id:string){
    return fetch(`${this.base}/${id}/approve`,{method:"POST"});
  }
}
