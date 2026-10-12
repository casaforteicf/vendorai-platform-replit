export type OpeningBudgetSource = { id: string; catalogProductId?: string; width?: number; height?: number; sillHeight?: number; type: string };
export type OpeningBudgetProduct = { id: string; nome: string; precoBase: unknown; precoPromocional?: unknown; promocaoAtivaAte?: unknown; unidade?: string | null; fornecedor?: string | null };
export function openingBudgetPlan(conceptId: string, openings: readonly OpeningBudgetSource[], products: readonly OpeningBudgetProduct[], now: number) {
 const issues: string[] = [], items: { id: string; sourceId: string; produtoId: string; descricao: string; categoria: string; quantidade: string; unidade: string; valorUnitario: string; valorTotal: string; fornecedor: string | null }[] = [];
 const ids=new Set<string>();
 for(const opening of openings){
  if(!opening.id||ids.has(opening.id)){issues.push("ID de abertura inválido ou duplicado.");continue;}ids.add(opening.id);
  const product=products.find(p=>p.id===opening.catalogProductId);
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
  const q=Math.round(quantity*100)/100,p=Math.round(price*100)/100,total=Math.round(q*p*100)/100;
  if(q<=0||!Number.isFinite(total)||total>9999999999.99){issues.push(`${opening.id}: valor fora dos limites do orçamento.`);continue;}
  items.push({id:`arqdor-opening:${encodeURIComponent(conceptId)}:${encodeURIComponent(opening.id)}`,sourceId:opening.id,produtoId:product.id,descricao:`${opening.type==="door"?"Porta":"Janela"} ${opening.id} — ${product.nome}`.slice(0,255),categoria:"esquadrias",quantidade:q.toFixed(2),unidade:unit,valorUnitario:p.toFixed(2),valorTotal:total.toFixed(2),fornecedor:product.fornecedor?.slice(0,255)??null});
 }
 return {items,issues,total:items.reduce((sum,item)=>sum+Math.round(Number(item.valorTotal)*100),0)/100};
}

export function openingBudgetMutations(items: ReturnType<typeof openingBudgetPlan>["items"], existing: readonly { id: string }[], conceptId: string) {
 const prefix=`arqdor-opening:${encodeURIComponent(conceptId)}:`;
 const owned=existing.filter(item=>item.id.startsWith(prefix));
 const desired=new Set(items.map(item=>item.id));
 return { remove:owned.filter(item=>!desired.has(item.id)).map(item=>item.id), insert:items.filter(item=>!owned.some(old=>old.id===item.id)), update:items.filter(item=>owned.some(old=>old.id===item.id)) };
}
