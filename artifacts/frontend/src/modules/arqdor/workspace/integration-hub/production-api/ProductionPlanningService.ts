import {ProductionRepository} from "./ProductionRepository";
export class ProductionPlanningService{
 repo=new ProductionRepository();
 async generate(projectId:string){
  const data=await this.repo.list(projectId);
  return {projectId,steps:data};
 }
}
