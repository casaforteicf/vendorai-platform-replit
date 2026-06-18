import { createRequire } from 'module';
const require = createRequire('/home/runner/workspace/lib/db/package.json');
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.SUPABASE_DATABASE_URL });
await client.connect();

const checkResult = await client.query(`
  SELECT enumlabel FROM pg_enum WHERE enumtypid = 'proposta_status'::regtype;
`);
const labels = checkResult.rows.map(r => r.enumlabel);
console.log('Existing enum values:', labels);

if (labels.includes('pendente')) {
  console.log('pendente already exists');
} else {
  await client.query(`ALTER TYPE proposta_status ADD VALUE 'pendente' BEFORE 'aceita';`);
  console.log('Added pendente to proposta_status enum');
}

await client.end();
