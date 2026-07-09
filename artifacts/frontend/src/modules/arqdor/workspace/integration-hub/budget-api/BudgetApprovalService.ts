import {BudgetRepository} from "./BudgetRepository";
export class BudgetApprovalService{
 repo=new BudgetRepository();
 async approve(id:string){
   await this.repo.approve(id);
   return {event:"budget.approved",id};
 }
}
