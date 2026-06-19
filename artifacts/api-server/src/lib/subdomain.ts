import { db, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";


export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim()
    .substring(0, 30);
}

export async function generateSubdomainSlug(name: string): Promise<string> {
  const base = slugify(name);
  if (!base) {
    return `tenant-${Math.random().toString(36).substring(2, 8)}`;
  }

  // Check if base slug exists
  const [existing] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.subdomainSlug, base));

  if (!existing) return base;

  // Try numbered suffixes
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}${i}`;
    const [exists] = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.subdomainSlug, candidate));
    if (!exists) return candidate;
  }

  // Fallback: append random suffix
  return `${base}-${Math.random().toString(36).substring(2, 6)}`;
}
