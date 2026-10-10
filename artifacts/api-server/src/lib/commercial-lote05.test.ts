import {describe,it,expect} from "vitest";
import {calculateBudget,compositionPackages,marginReport} from "./commercial-budget-core";
import {parseBrazilianMoney,reviewImport,confirmImport,likelySameImport} from "./commercial-import-review";
import {validatePartialExecution,rankSupplierOffers,calculateCommission} from "./commercial-execution-supplier";
describe("LOTE 05 — núcleo comercial",()=>{
 it("não mistura opcionais e não inclusos no preço base",()=>{
  expect(calculateBudget([
   {id:"a",kind:"product",description:"janela",quantity:2000,unit:"un",unitPriceCents:10000},
   {id:"b",kind:"service",description:"instalação",quantity:1000,unit:"serv",unitPriceCents:5000,inclusion:"optional"},
   {id:"c",kind:"service",description:"frete",quantity:1000,unit:"serv",unitPriceCents:2000,inclusion:"excluded"}
  ])).toEqual({includedCents:20000,optionalCents:5000,totalWithOptionalCents:25000});
 });
 it("arredonda embalagem sempre para cima e considera perdas",()=>{
  expect(compositionPackages({id:"tinta",quantity:101,packageQuantity:20,packagePriceCents:3000,lossPercent:10}).packages).toBe(6);
 });
 it("calcula margem de forma explícita",()=>expect(marginReport(10000,7500).marginPercent).toBe(25));
 it("preserva divergência original e exige confirmação",()=>{
  const origin={tenantId:"A",sourceFileName:"x.pdf",sourceSha256:"hash",originalTotalText:"1.001,00",lines:[{description:"x",unit:"un",quantityText:"1",unitPriceText:"1.000,00",totalText:"1.000,00"}],unrecognizedFields:{nota:"valor"}};
  expect(parseBrazilianMoney("R$ 1.001,00")).toBe(100100);
  expect(reviewImport(origin).divergenceCents).toBe(100);
  expect(()=>confirmImport({original:origin,confirmedBy:"u",confirmedAt:"2026-10-10",divergenceAcknowledged:false})).toThrow();
  expect(confirmImport({original:origin,confirmedBy:"u",confirmedAt:"2026-10-10",divergenceAcknowledged:true}).preserveOriginal).toBe(true);
  expect(likelySameImport(origin,{...origin,tenantId:"B"})).toBe(false);
 });
 it("bloqueia sobre-execução parcial",()=>{
  expect(()=>validatePartialExecution([{itemId:"1",approvedMilliQuantity:1000,previouslyReleasedMilliQuantity:900,requestedMilliQuantity:200}])).toThrow();
  expect(validatePartialExecution([{itemId:"1",approvedMilliQuantity:1000,previouslyReleasedMilliQuantity:300,requestedMilliQuantity:400}]).items[0].remainingMilliQuantity).toBe(300);
 });
 it("compara fornecedores e calcula comissão",()=>{
  expect(rankSupplierOffers([{supplierId:"a",itemId:"x",priceCents:1000,freightCents:300,deliveryDays:1},{supplierId:"b",itemId:"x",priceCents:1100,freightCents:0,deliveryDays:3}])[0].supplierId).toBe("b");
  expect(calculateCommission(10000,1000)).toBe(1000);
 });
});
