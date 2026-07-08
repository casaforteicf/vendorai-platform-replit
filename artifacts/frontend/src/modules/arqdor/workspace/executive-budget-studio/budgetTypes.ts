export type BudgetView = 'dashboard' | 'items' | 'disciplines' | 'suppliers' | 'abc' | 'versions' | 'proposal' | 'ai';
export type BudgetStatus = 'estimado' | 'cotado' | 'aprovado' | 'comprado' | 'revisao';
export type BudgetDiscipline = 'marcenaria' | 'marmoraria' | 'iluminacao' | 'eletrica' | 'hidraulica' | 'gesso' | 'pintura' | 'mobiliario' | 'decoracao' | 'frete' | 'mao_de_obra';
export type BudgetItem = { id:string; code:string; environment:string; discipline:BudgetDiscipline; title:string; supplier:string; unit:string; quantity:number; materialCost:number; laborCost:number; marginPercent:number; taxPercent:number; status:BudgetStatus; version:string; aiNote:string; };
export type SupplierBudget = { id:string; name:string; discipline:string; total:number; leadTime:string; score:number; status:'melhor_opcao'|'apto'|'revisar'; };
export type BudgetVersion = { id:string; name:string; date:string; total:number; margin:number; status:'rascunho'|'enviada'|'aprovada'|'revisao'; };
