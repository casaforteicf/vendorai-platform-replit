import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const statements = [
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS enrichment_status text DEFAULT 'pending'`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS propensity_score integer`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS roi_estimate jsonb`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS enrichment_data jsonb`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority_reason text`,
  `ALTER TABLE prospector_config ADD COLUMN IF NOT EXISTS auto_dispatch_threshold integer NOT NULL DEFAULT 80`,
  `CREATE TABLE IF NOT EXISTS segment_benchmarks (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    segmento text NOT NULL UNIQUE,
    ticket_medio numeric(10,2),
    taxa_resposta_padrao numeric(5,2),
    volume_medio_atendimentos integer,
    perda_estimada_por_lead_perdido numeric(10,2),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS sdr_vertical_profiles (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    vertical text NOT NULL UNIQUE,
    tom text NOT NULL,
    vocabulario jsonb DEFAULT '[]',
    dores_tipicas jsonb DEFAULT '[]',
    abertura_padrao text NOT NULL,
    exemplos jsonb DEFAULT '[]',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS prospecting_objections (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    segmento text,
    objecao text NOT NULL,
    frequencia integer NOT NULL DEFAULT 1,
    respostas jsonb DEFAULT '[]',
    taxa_conversao numeric(5,2),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS lead_events (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    tipo text NOT NULL,
    descricao text NOT NULL,
    score_boost integer DEFAULT 0,
    expires_at timestamptz,
    notified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `INSERT INTO segment_benchmarks (segmento,ticket_medio,taxa_resposta_padrao,volume_medio_atendimentos,perda_estimada_por_lead_perdido)
   VALUES ('imobiliaria',8500,0.25,80,2125),('construcao',12000,0.20,50,2400),
          ('saude_clinica',350,0.35,400,122.50),('varejo',180,0.40,600,72),
          ('salao_beleza',120,0.50,300,60),('materiais_construcao',900,0.22,150,198),
          ('alimentacao',85,0.45,800,38.25) ON CONFLICT (segmento) DO NOTHING`,
  `INSERT INTO sdr_vertical_profiles (vertical,tom,vocabulario,dores_tipicas,abertura_padrao,exemplos) VALUES
   ('imobiliaria','profissional_consultivo','["captação","avaliação","pipeline"]','["Perda de leads por demora","Gestão manual de carteira"]','Olá, {nome}! Acompanhamos sua imobiliária e percebemos uma oportunidade de crescimento.','["Clientes de alto padrão exigem resposta em minutos."]'),
   ('construcao','tecnico_direto','["obra","cronograma","proposta técnica"]','["Orçamentos perdidos por demora","Comunicação descentralizada"]','Olá, {nome}! Construtoras que fazem follow-up de proposta em até 1h fecham 2x mais.','["Automatizar o pós-obra dobra as indicações."]'),
   ('saude_clinica','acolhedor_profissional','["consulta","agendamento","retorno"]','["Pacientes sem retorno","Alto no-show"]','Olá, {nome}! Clínicas com lembrete automático reduzem no-show em até 60%.','["Pacientes satisfeitos que somem sem retorno é a maior perda no setor."]'),
   ('varejo','descontraido_direto','["promoção","fidelidade","recompra"]','["Clientes compram e somem","Sem comunicação pós-venda"]','Oi, {nome}! Varejo que manda mensagem personalizada após a compra tem 3x mais recompra.','["Clientes que já compraram são os mais fáceis de reativar."]'),
   ('salao_beleza','amigavel_entusiasmado','["agendamento","retorno","fidelidade"]','["Clientes sem retorno após 45 dias","Agenda com buracos"]','Oi, {nome}! Salões com lembrete automático têm 50% menos buracos na agenda.','["Relembrar clientes no momento certo é o segredo da agenda cheia."]'),
   ('materiais_construcao','consultivo_regional','["pedido","orçamento","volume"]','["Orçamentos sem follow-up","Perda para concorrência"]','Olá, {nome}! Um orçamento sem follow-up em 2h tem 70% menos chance de fechar.','["Distribuidoras que fazem follow-up imediato fecham 2x mais."]'),
   ('alimentacao','leve_direto','["delivery","fidelidade","avaliação"]','["Clientes pedem uma vez e não voltam","Sem programa de fidelidade"]','Oi, {nome}! Restaurantes que mantêm contato têm 4x mais pedidos recorrentes.','["Um cupom enviado 7 dias após o pedido traz 30% dos clientes de volta."]')
   ON CONFLICT (vertical) DO NOTHING`,
];

for (const stmt of statements) {
  try {
    await db.execute(sql.raw(stmt));
    console.log("OK:", stmt.slice(0, 60).replace(/\n/g, " "));
  } catch (e: unknown) {
    console.error("ERR:", (e as Error).message?.slice(0, 120), "|", stmt.slice(0, 50).replace(/\n/g, " "));
  }
}

console.log("Migration complete");
process.exit(0);
