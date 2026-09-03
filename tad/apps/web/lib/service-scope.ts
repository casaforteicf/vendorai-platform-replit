import { AsyncLocalStorage } from 'node:async_hooks';

const serviceUserScope = new AsyncLocalStorage<string>();

export function serviceRoleKey(){
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

export function isServiceRoleToken(token:string){
  const key=serviceRoleKey();
  return Boolean(key)&&token===key;
}

export function getServiceUserId(){
  return serviceUserScope.getStore() || null;
}

export async function runWithServiceUser<T>(userId:string,fn:()=>Promise<T>):Promise<T>{
  return await serviceUserScope.run(userId,fn);
}

export function serviceScopedApiKey(token:string,publishableKey:string){
  return isServiceRoleToken(token)?token:publishableKey;
}

export function serviceScopeQuery(token:string){
  const userId=getServiceUserId();
  return isServiceRoleToken(token)&&userId?`&user_id=eq.${encodeURIComponent(userId)}`:'';
}

export function serviceScopePayload<T extends Record<string,unknown>>(token:string,payload:T):T & {user_id?:string}{
  const userId=getServiceUserId();
  return isServiceRoleToken(token)&&userId?{...payload,user_id:userId}:payload;
}
