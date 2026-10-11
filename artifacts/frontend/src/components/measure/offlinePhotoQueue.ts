const DB = "arqdor-measure-offline-photos";
const STORE = "pending";
export type PendingPhoto = { id: string; key: string; file: Blob; name: string; mime: string; savedAt: string };
function dbOpen(): Promise<IDBDatabase> {
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:"id"});};
  req.onerror=()=>reject(req.error);
  req.onsuccess=()=>resolve(req.result);
 });
}
async function tx<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await dbOpen();
 return new Promise((resolve,reject)=>{
  const transaction=db.transaction(STORE,mode);
  const request=action(transaction.objectStore(STORE));
  transaction.oncomplete=()=>{db.close();resolve(request.result);};
  transaction.onabort=()=>{db.close();reject(transaction.error);};
  transaction.onerror=()=>{db.close();reject(transaction.error);};
 });
}
export async function queuePhoto(key:string,file:File):Promise<void>{
 if(!key||!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size<1||file.size>5*1024*1024)throw Error("Invalid offline photo");
 await tx("readwrite",s=>s.put({id:key,key,file,name:file.name,mime:file.type,savedAt:new Date().toISOString()}));
}
export async function getQueuedPhoto(key:string):Promise<PendingPhoto|undefined>{
 return tx("readonly",s=>s.get(key));
}
export async function removeQueuedPhoto(key:string):Promise<void>{
 await tx("readwrite",s=>s.delete(key));
}
