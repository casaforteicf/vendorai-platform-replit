/** Round decimal values half up without binary floating point monetary drift. */
function hundredths(value: number) {
 const text=String(value), match=/^(\d+)(?:\.(\d+))?$/.exec(text);
 if(!match)return NaN;
 const decimals=(match[2]??"")+"000";
 const cents=BigInt(match[1])*100n+BigInt(decimals.slice(0,2))+(Number(decimals[2])>=5?1n:0n);
 return Number(cents);
}
export type OpeningBudgetSource = { id: string; catalogProductId?: string; width?: number; height?: number; sillHeight?: number; type: string };
export type OpeningBudgetProduct = { id: string; nome: string; precoBase: unknown; precoPromocional?: unknown; promocaoAtivaAte?: unknown; unidade?: string | null; fornecedor?: string | null };
export function openingBudgetPlan(conceptId: string, openings: readonly OpeningBudgetSource[], products: readonly OpeningBudgetProduct[], now: number) {
 const issues: string[] = [], items: { id: string; sourceId: string; produtoId: string; descricao: string; categoria: string; quantidade: string; unidade: string; valorUnitario: string; valorTotal: string; fornecedor: string | null }[] = [];
 const ids=new Set<string>();
 const catalog=new Map<string,OpeningBudgetProduct>();
 const duplicateProducts=new Set<string>();
 for(const product of products){
  if(catalog.has(product.id))duplicateProducts.add(product.id);
  else catalog.set(product.id,product);
 }
 for(const opening of openings){
  if(!opening.id||ids.has(opening.id)){issues.push("ID de abertura inválido ou duplicado.");continue;}ids.add(opening.id);
  if(opening.catalogProductId&&duplicateProducts.has(opening.catalogProductId)){issues.push(`${opening.id}: produto duplicado no catálogo; confira o vínculo.`);continue;}
  const product=opening.catalogProductId?catalog.get(opening.catalogProductId):undefined;
  if(!product){issues.push(`${opening.id}: vincule um produto ativo do catálogo.`);continue;}
  if(![opening.width,opening.height,opening.sillHeight].every(v=>typeof v==="number"&&Number.isFinite(v))||Number(opening.width)<=0||Number(opening.height)<=0||Number(opening.sillHeight)<0){issues.push(`${opening.id}: confirme as medidas da esquadria.`);continue;}
  const decimal=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)?v:typeof v==="string"&&/^\d+(\.\d+)?$/.test(v)?Number(v):NaN;
  const expiry=product.promocaoAtivaAte==null?Infinity:new Date(String(product.promocaoAtivaAte)).getTime();
  const promo=decimal(product.precoPromocional), base=decimal(product.precoBase);
  const price=Number.isFinite(promo)&&promo>=0&&expiry>=now?promo:base;
  if(!Number.isFinite(price)||price<0||price>99999999.99){issues.push(`${opening.id}: preço de venda não disponível.`);continue;}
  const unit=(product.unidade??"").trim().toLowerCase();
  const quantity=["m2","m²"].includes(unit)?Number(opening.width)*Number(opening.height):["un","und","unidade","unidades","pc","peça","peca"].includes(unit)?1:NaN;
  if(!Number.isFinite(quantity)||quantity<=0||quantity>999999.99){issues.push(`${opening.id}: unidade de preço incompatível (${unit||"não informada"}).`);continue;}
  const qc=hundredths(quantity),pc=hundredths(price);
  if(!Number.isFinite(qc)||!Number.isFinite(pc)){issues.push(`${opening.id}: precisão decimal inválida.`);continue;}
  const q=qc/100,p=pc/100,total=Number((BigInt(qc)*BigInt(pc)+50n)/100n)/100;
  if(q<=0||!Number.isFinite(total)||total>9999999999.99){issues.push(`${opening.id}: valor fora dos limites do orçamento.`);continue;}
  items.push({id:`arqdor-opening:${encodeURIComponent(conceptId)}:${encodeURIComponent(opening.id)}`,sourceId:opening.id,produtoId:product.id,descricao:`${opening.type==="door"?"Porta":"Janela"} ${opening.id} — ${product.nome}`.slice(0,255),categoria:"esquadrias",quantidade:q.toFixed(2),unidade:unit,valorUnitario:p.toFixed(2),valorTotal:total.toFixed(2),fornecedor:product.fornecedor?.slice(0,255)??null});
 }
 return {items,issues,total:items.reduce((sum,item)=>sum+Math.round(Number(item.valorTotal)*100),0)/100};
}

export function openingBudgetMutations(items: ReturnType<typeof openingBudgetPlan>["items"], existing: readonly { id: string }[], conceptId: string) {
 const prefix=`arqdor-opening:${encodeURIComponent(conceptId)}:`;
 const owned=existing.filter(item=>item.id.startsWith(prefix));
 const desired=new Set(items.map(item=>item.id));
 const ownedIds=new Set(owned.map(item=>item.id));
 const scoped=items.filter(item=>item.id.startsWith(prefix));
 return { remove:owned.filter(item=>!desired.has(item.id)).map(item=>item.id), insert:scoped.filter(item=>!ownedIds.has(item.id)), update:scoped.filter(item=>ownedIds.has(item.id)) };
}


export function openingBudgetGeometryIssues(openings: readonly {id:string;wallId:string;floor:number;offset:number;width?:number;height?:number;sillHeight?:number}[], walls: readonly {id:string;floor:number;x1:number;y1:number;x2:number;y2:number}[]) {
 const issues:string[]=[];
 const records=openings.map(o=>{
  const wall=walls.find(w=>w.id===o.wallId&&w.floor===o.floor);
  const length=wall?Math.hypot(wall.x2-wall.x1,wall.y2-wall.y1):NaN;
  const valid=Number.isInteger(o.floor)&&o.floor>=0&&[length,o.offset,o.width,o.height,o.sillHeight].every(v=>typeof v==="number"&&Number.isFinite(v))&&length>0&&o.offset>=0&&o.offset<=1&&Number(o.width)>0&&Number(o.height)>0&&Number(o.sillHeight)>=0;
  const start=o.offset*length-Number(o.width)/2,end=o.offset*length+Number(o.width)/2,bottom=Number(o.sillHeight),top=bottom+Number(o.height);
  if(!valid||start < -1e-8||end>length+1e-8||top>2.8+1e-8)issues.push(`${o.id}: confira o encaixe na parede.`);
  return {o,valid,start,end,bottom,top};
 });
 for(let i=0;i<records.length;i++)for(let j=i+1;j<records.length;j++){
  const a=records[i],b=records[j];
  if(a.valid&&b.valid&&a.o.wallId===b.o.wallId&&a.o.floor===b.o.floor&&Math.min(a.end,b.end)>Math.max(a.start,b.start)+1e-8&&Math.min(a.top,b.top)>Math.max(a.bottom,b.bottom)+1e-8)issues.push(`${a.o.id} / ${b.o.id}: vãos sobrepostos.`);
 }
 return issues;
}
