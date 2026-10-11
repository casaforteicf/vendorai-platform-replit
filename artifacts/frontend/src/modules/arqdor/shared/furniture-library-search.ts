/** Lote 13.39: tenant-safe discovery of furniture models.
 * Read-model helper only; DB authorization must enforce the same scopes.
 */
export type FurnitureLibraryRecord={id:string;name:string;category:string;tags:readonly string[];scope:"universal"|"tenant"|"user"|"manufacturer";tenantId?:string;ownerUserId?:string;manufacturer?:string;revision:number};
export function searchFurnitureLibrary(items:readonly FurnitureLibraryRecord[],query:{tenantId:string;userId?:string;text?:string;category?:string;favorites?:ReadonlySet<string>;favoritesOnly?:boolean;limit?:number}):FurnitureLibraryRecord[]{
 if(!query.tenantId.trim())throw Error("Tenant required");
 const limit=query.limit??50;if(!Number.isSafeInteger(limit)||limit<1||limit>500)throw Error("Invalid limit");
 const term=(query.text??"").trim().toLocaleLowerCase("pt-BR");
 return items.filter(x=>{
  if(!(x.scope==="universal"||x.scope==="manufacturer"||(x.scope==="tenant"&&x.tenantId===query.tenantId)||(x.scope==="user"&&x.tenantId===query.tenantId&&!!query.userId&&x.ownerUserId===query.userId)))return false;
  if(query.category&&x.category!==query.category)return false;
  if(query.favoritesOnly&&!query.favorites?.has(x.id))return false;
  return !term||[x.name,x.category,x.manufacturer??"",...x.tags].some(s=>s.toLocaleLowerCase("pt-BR").includes(term));
 }).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")||a.id.localeCompare(b.id)).slice(0,limit);
}
