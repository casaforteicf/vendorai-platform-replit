import type {CabinetParameters} from "./parametric-cabinet-core";
export type CabinetTemplate={
 id:string;scope:"universal"|"tenant"|"manufacturer";tenantId?:string;
 name:string;revision:number;category:"base"|"wall"|"tall"|"custom";parameters:Pick<CabinetParameters,"widthMm"|"heightMm"|"depthMm"|"panelThicknessMm"|"shelfCount"|"doorCount"|"backThicknessMm">;
 defaultMaterialId:string;defaultBackMaterialId:string;manufacturerSku?:string;
};
export function instantiateCabinetTemplate(template:CabinetTemplate,ctx:{
 tenantId:string;projectId:string;roomId:string;furnitureId:string;materialId?:string;backMaterialId?:string;
 overrides?:Partial<CabinetTemplate["parameters"]>;
}):CabinetParameters{
 if(!template.id||!Number.isSafeInteger(template.revision)||template.revision<1)throw Error("Template id or revision invalid");
 if(template.scope==="tenant"&&template.tenantId!==ctx.tenantId)throw Error("Cross-tenant template");
 if(!ctx.projectId||!ctx.roomId||!ctx.furnitureId||!ctx.tenantId)throw Error("Missing project scope");
 return {...template.parameters,...ctx.overrides,
  tenantId:ctx.tenantId,projectId:ctx.projectId,roomId:ctx.roomId,furnitureId:ctx.furnitureId,
  materialId:ctx.materialId??template.defaultMaterialId,
  backMaterialId:ctx.backMaterialId??template.defaultBackMaterialId};
}
