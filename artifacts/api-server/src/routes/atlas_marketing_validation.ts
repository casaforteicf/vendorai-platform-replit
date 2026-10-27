export const ATLAS_MARKETING_FIELDS = ["icp","pain","offer","channels","funnel","kpis","positioning","campaign","budgetNotes","goals","owner","planStatus","dueDate","actions","actualResults"] as const;
const statuses = new Set(["","draft","approved","in_progress","paused","completed"]);
export function isValidPlanDate(value: string): boolean {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value;
}
export function isValidMarketingPayload(input: unknown): input is {revision:number;strategies:Record<string,Record<string,string>>} {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const {revision,strategies}=input as Record<string,unknown>;
  if (!Number.isInteger(revision) || (revision as number)<0 || (revision as number)>1000000 || !strategies || typeof strategies !== "object" || Array.isArray(strategies)) return false;
  const entries=Object.entries(strategies);
  if (entries.length>250) return false;
  return entries.every(([id,value])=>{
    if (!/^niche-[0-9]{2,4}$/.test(id) || !value || typeof value!=="object" || Array.isArray(value)) return false;
    return Object.entries(value).every(([field,v])=>ATLAS_MARKETING_FIELDS.includes(field as typeof ATLAS_MARKETING_FIELDS[number]) && typeof v==="string" && v.length<=8000 && (field!=="planStatus" || statuses.has(v)) && (field!=="dueDate" || v==="" || isValidPlanDate(v)));
  });
}
