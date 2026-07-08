import type { BudgetItem, BudgetVersion, SupplierBudget } from './budgetTypes';
export const budgetItems: BudgetItem[] = [
 {id:'bi-001',code:'BUD-MAR-001',environment:'Sala de Estar',discipline:'marcenaria',title:'Painel TV em MDF Carvalho Claro',supplier:'Marceneiro Local',unit:'vb',quantity:1,materialCost:4200,laborCost:2800,marginPercent:18,taxPercent:6,status:'estimado',version:'V01',aiNote:'Confirmar paginação e rasgo de LED antes da cotação final.'},
 {id:'bi-002',code:'BUD-MAR-002',environment:'Cozinha',discipline:'marmoraria',title:'Bancada Gourmet em Quartzo Branco',supplier:'Marmoraria Local',unit:'m²',quantity:5.1,materialCost:1350,laborCost:380,marginPercent:18,taxPercent:6,status:'cotado',version:'V01',aiNote:'Custo dentro do esperado, validar cuba e cooktop antes da produção.'},
 {id:'bi-003',code:'BUD-ILU-001',environment:'Sala de Estar',discipline:'iluminacao',title:'Perfil LED Linear',supplier:'Luminárias Pro',unit:'un',quantity:3,materialCost:890,laborCost:160,marginPercent:15,taxPercent:6,status:'aprovado',version:'V01',aiNote:'Boa compatibilidade com cena noturna.'},
 {id:'bi-004',code:'BUD-MOB-001',environment:'Sala de Estar',discipline:'mobiliario',title:'Poltrona Lisboa',supplier:'Estofados Casa',unit:'un',quantity:2,materialCost:3850,laborCost:0,marginPercent:12,taxPercent:6,status:'revisao',version:'V02',aiNote:'Substituir tecido pode gerar economia estimada de R$ 420 por unidade.'},
 {id:'bi-005',code:'BUD-GES-001',environment:'Sala de Estar',discipline:'gesso',title:'Forro com cortineiro e rasgo linear',supplier:'Gesso Premium',unit:'m²',quantity:42,materialCost:68,laborCost:77,marginPercent:15,taxPercent:6,status:'estimado',version:'V01',aiNote:'Compatibilizar rasgos com iluminação antes da execução.'},
];
export const supplierBudgets: SupplierBudget[] = [
 {id:'sb-001',name:'Marceneiro Local',discipline:'Marcenaria',total:8260,leadTime:'25 dias',score:88,status:'apto'},
 {id:'sb-002',name:'Marmoraria Local',discipline:'Marmoraria',total:10488,leadTime:'20 dias',score:91,status:'melhor_opcao'},
 {id:'sb-003',name:'Luminárias Pro',discipline:'Iluminação',total:3925,leadTime:'7 dias',score:94,status:'melhor_opcao'},
 {id:'sb-004',name:'Estofados Casa',discipline:'Mobiliário',total:9130,leadTime:'18 dias',score:82,status:'revisar'},
];
export const budgetVersions: BudgetVersion[] = [
 {id:'bv-001',name:'V01 — Base',date:'2026-07-08',total:36500,margin:17,status:'rascunho'},
 {id:'bv-002',name:'V02 — Alternativas',date:'2026-07-10',total:34820,margin:16,status:'revisao'},
 {id:'bv-003',name:'V03 — Cliente',date:'2026-07-12',total:35290,margin:18,status:'enviada'},
];
export const aiBudgetInsights = [
 {title:'Economia em mobiliário',description:'Trocar tecido da Poltrona Lisboa reduz custo sem comprometer o conceito.',impact:'Economia R$ 840',action:'Aplicar alternativa'},
 {title:'Marmoraria dentro do padrão',description:'Fornecedor está com bom score e prazo compatível com cronograma.',impact:'Manter fornecedor',action:'Aprovar cotação'},
 {title:'Marcenaria precisa detalhamento',description:'Painel TV ainda depende de paginação e passagem de cabos.',impact:'Risco de retrabalho',action:'Gerar checklist'},
];
