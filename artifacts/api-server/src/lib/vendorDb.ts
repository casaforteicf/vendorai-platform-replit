// Compatibilidade para os módulos Praça.ai que ainda importam `vendorPool`.
// O banco oficial e o gerenciamento do pool pertencem a @workspace/db;
// reutilizar a mesma instância evita abrir conexões duplicadas no Railway.
export { pool as vendorPool } from "@workspace/db";
