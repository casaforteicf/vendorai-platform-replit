/**
 * Cmd 23 — Prospecção Multicanal B2B
 * Cria tabela cnae_vertical_map e seeds de CNAEs
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

async function main() {
  console.log("Cmd 23 migrate: creating cnae_vertical_map...");

  // 1. Create table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cnae_vertical_map (
      cnae        text PRIMARY KEY,
      label       text NOT NULL,
      vertical    text NOT NULL,
      prioridade  integer NOT NULL DEFAULT 5
    );
  `);
  console.log("  ✓ cnae_vertical_map criada");

  // 2. Add cnae_alvo column to prospector_config (CNAE targets for weekly new-company cron)
  await db.execute(sql`
    ALTER TABLE prospector_config
      ADD COLUMN IF NOT EXISTS cnae_alvo text[] DEFAULT '{}';
  `);
  console.log("  ✓ prospector_config.cnae_alvo adicionada");

  // 3. Seeds — principais CNAEs mapeados para verticais
  const seeds = [
    // Construção
    { cnae: "4120-4/00", label: "Construção de edifícios", vertical: "construcao", prioridade: 1 },
    { cnae: "4744-0/99", label: "Materiais de construção em geral", vertical: "construcao", prioridade: 1 },
    { cnae: "4744-0/01", label: "Ferragens e ferramentas", vertical: "construcao", prioridade: 2 },
    { cnae: "4742-5/00", label: "Vidros e espelhos", vertical: "construcao", prioridade: 3 },
    { cnae: "4741-5/00", label: "Tintas, vernizes e similares", vertical: "construcao", prioridade: 3 },

    // Imobiliário
    { cnae: "6822-6/00", label: "Gestão e administração de imóveis", vertical: "imobiliaria", prioridade: 1 },
    { cnae: "6821-8/01", label: "Corretagem de imóveis", vertical: "imobiliaria", prioridade: 1 },
    { cnae: "6821-8/02", label: "Imobiliárias", vertical: "imobiliaria", prioridade: 1 },

    // Saúde / Clínicas
    { cnae: "8630-5/01", label: "Atividades de médicos", vertical: "saude", prioridade: 1 },
    { cnae: "8630-5/02", label: "Atividade de odontólogos", vertical: "saude", prioridade: 1 },
    { cnae: "8630-5/03", label: "Atividade de psicólogos e psicanalistas", vertical: "saude", prioridade: 2 },
    { cnae: "8650-0/01", label: "Fisioterapia", vertical: "saude", prioridade: 2 },
    { cnae: "8650-0/04", label: "Nutricionistas", vertical: "saude", prioridade: 3 },
    { cnae: "8621-6/01", label: "Pronto-socorro e ambulatórios", vertical: "saude", prioridade: 1 },

    // Salão / Estética
    { cnae: "9602-5/01", label: "Cabeleireiros, manicure e pedicure", vertical: "salao_beleza", prioridade: 1 },
    { cnae: "9602-5/02", label: "Atividades de estética", vertical: "salao_beleza", prioridade: 1 },
    { cnae: "9606-8/00", label: "Atividades de micro-pigmentação", vertical: "salao_beleza", prioridade: 2 },

    // Alimentação
    { cnae: "5611-2/01", label: "Restaurantes e similares", vertical: "alimentacao", prioridade: 1 },
    { cnae: "5611-2/03", label: "Lanchonetes e similares", vertical: "alimentacao", prioridade: 1 },
    { cnae: "5612-1/00", label: "Serviços ambulantes de alimentação", vertical: "alimentacao", prioridade: 2 },
    { cnae: "5620-1/01", label: "Fornecimento de comida preparada (catering)", vertical: "alimentacao", prioridade: 2 },

    // Mercado / Varejo Alimentar
    { cnae: "4711-3/01", label: "Supermercados", vertical: "mercado", prioridade: 1 },
    { cnae: "4711-3/02", label: "Hipermercados", vertical: "mercado", prioridade: 1 },
    { cnae: "4712-1/00", label: "Mercearias e armazéns", vertical: "mercado", prioridade: 1 },

    // Farmácia
    { cnae: "4771-7/01", label: "Farmácias sem manipulação", vertical: "farmacia", prioridade: 1 },
    { cnae: "4771-7/02", label: "Farmácias com manipulação", vertical: "farmacia", prioridade: 1 },

    // Fitness / Academia
    { cnae: "9313-1/00", label: "Academias de ginástica", vertical: "fitness", prioridade: 1 },
    { cnae: "9312-3/00", label: "Clubes sociais, esportivos e similares", vertical: "fitness", prioridade: 2 },

    // Pet
    { cnae: "7500-1/00", label: "Atividades veterinárias", vertical: "pet", prioridade: 1 },
    { cnae: "4789-0/04", label: "Pet shops", vertical: "pet", prioridade: 1 },

    // Educação
    { cnae: "8511-2/00", label: "Educação infantil — creches", vertical: "educacao", prioridade: 2 },
    { cnae: "8512-1/00", label: "Educação infantil — pré-escola", vertical: "educacao", prioridade: 2 },
    { cnae: "8550-3/01", label: "Cursos livres", vertical: "educacao", prioridade: 1 },
    { cnae: "8599-6/04", label: "Cursos de idiomas", vertical: "educacao", prioridade: 1 },

    // Outros serviços
    { cnae: "4520-0/01", label: "Serviços de manutenção e reparação de automóveis", vertical: "outros", prioridade: 3 },
    { cnae: "9609-2/99", label: "Outros serviços pessoais não especificados", vertical: "outros", prioridade: 5 },
  ] as const;

  for (const seed of seeds) {
    await db.execute(sql`
      INSERT INTO cnae_vertical_map (cnae, label, vertical, prioridade)
      VALUES (${seed.cnae}, ${seed.label}, ${seed.vertical}, ${seed.prioridade})
      ON CONFLICT (cnae) DO UPDATE
        SET label = EXCLUDED.label,
            vertical = EXCLUDED.vertical,
            prioridade = EXCLUDED.prioridade;
    `);
  }
  console.log(`  ✓ ${seeds.length} CNAEs inseridos/atualizados`);

  console.log("Cmd 23 migrate: done ✓");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
