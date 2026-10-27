export const ATLAS_MARKETING_FIELDS = ["icp","pain","offer","channels","funnel","kpis","positioning","campaign","budgetNotes","goals","owner","planStatus","dueDate","actions","actualResults","tasksJson"] as const;
const statuses = new Set(["","draft","approved","in_progress","paused","completed"]);
export function isValidPlanDate(value: string): boolean {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value;
}
export function validTasksJson(raw:string):boolean {
 if(raw.length>8000)return false;
 try{
  const tasks=JSON.parse(raw);
  return Array.isArray(tasks)&&tasks.length<=40&&tasks.every(t=>t&&typeof t==="object"&&!Array.isArray(t)&&Object.keys(t).every(k=>["id","title","owner","priority","dueDate","done"].includes(k))&&typeof t.id==="string"&&/^[a-zA-Z0-9_-]{1,80}$/.test(t.id)&&typeof t.title==="string"&&t.title.trim().length>0&&t.title.length<=180&&typeof t.owner==="string"&&t.owner.length<=120&&["low","medium","high"].includes(t.priority)&&typeof t.dueDate==="string"&&(t.dueDate===""||isValidPlanDate(t.dueDate))&&typeof t.done==="boolean"&&new Set(tasks.map(t=>t.id)).size===tasks.length);
 }catch{return false}
}
export function isValidMarketingPayload(input: unknown): input is {revision:number;strategies:Record<string,Record<string,string>>} {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const {revision,strategies}=input as Record<string,unknown>;
  if (!Number.isInteger(revision) || (revision as number)<0 || (revision as number)>1000000 || !strategies || typeof strategies !== "object" || Array.isArray(strategies)) return false;
  const entries=Object.entries(strategies);
  if (entries.length>250) return false;
  return entries.every(([id,value])=>{
    if (!/^niche-[0-9]{2,4}$/.test(id) || !value || typeof value!=="object" || Array.isArray(value)) return false;
    return Object.entries(value).every(([field,v])=>ATLAS_MARKETING_FIELDS.includes(field as typeof ATLAS_MARKETING_FIELDS[number]) && typeof v==="string" && v.length<=8000 && (field!=="planStatus" || statuses.has(v)) && (field!=="dueDate" || v==="" || isValidPlanDate(v)) && (field!=="tasksJson" || validTasksJson(v)));
  });
}
