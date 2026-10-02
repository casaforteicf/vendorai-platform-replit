function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} not configured`);
  return value;
}

function baseUrl(): string {
  return env("SUPABASE_URL").replace(/\/$/, "");
}

function authHeaders(): Record<string,string> {
  const serviceRole = process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();
  const publishable = process.env["SUPABASE_PUBLISHABLE_KEY"]?.trim();
  const allowFallback = process.env["SKETCHFAB_STORAGE_ALLOW_PUBLISHABLE"] === "true";
  const key = serviceRole || (allowFallback ? publishable : undefined);
  if (!key) throw new Error("sketchfab_storage_credentials_missing");
  return { apikey:key, Authorization:`Bearer ${key}` };
}

export async function saveExternalAsset(objectName:string, data:Buffer, contentType:string): Promise<string> {
  const bucket = process.env["SKETCHFAB_STORAGE_BUCKET"]?.trim() || "app-uploads";
  const path = objectName.replace(/^\/+/, "");
  const url = `${baseUrl()}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(url, {
    method:"POST",
    headers:{ ...authHeaders(), "Content-Type":contentType, "x-upsert":"true" },
    body:data,
  });
  if (!response.ok) {
    const detail = await response.text().catch(()=> "");
    throw new Error(`sketchfab_storage_upload_failed:${response.status}:${detail.slice(0,160)}`);
  }
  return `${baseUrl()}/storage/v1/object/public/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export const saveSketchfabAsset = saveExternalAsset;
