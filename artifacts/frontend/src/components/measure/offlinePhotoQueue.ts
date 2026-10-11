import type { PhotoMeasure } from "./PhotoMeasureEditor";
const DB = "arqdor-measure-offline-photos";
const STORE = "pending";
export type PendingPhoto = { id: string; key: string; file: Blob; name: string; mime: string; savedAt: string; measures?: PhotoMeasure[]; uploadedPath?: string };
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
export async function queuePhoto(key:string,file:File, measures:PhotoMeasure[]=[]):Promise<void>{
 if(!key||!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size<1||file.size>5*1024*1024)throw Error("Invalid offline photo");
 const existing=await listQueuedPhotos(key);
 if(existing.length>=20) throw Error("Limite de 20 fotos pendentes por item");
 await tx("readwrite",s=>s.put({id:crypto.randomUUID(),key,file,name:file.name,mime:file.type,measures,savedAt:new Date().toISOString()}));
}
export async function listQueuedPhotos(key:string):Promise<PendingPhoto[]>{
 const all=await tx<PendingPhoto[]>("readonly",s=>s.getAll());
 return all.filter(x=>x.key===key).sort((a,b)=>a.savedAt.localeCompare(b.savedAt));
}
export async function getQueuedPhoto(key:string):Promise<PendingPhoto|undefined>{
 return (await listQueuedPhotos(key))[0];
}
export async function removeQueuedPhoto(key:string):Promise<void>{
 await tx("readwrite",s=>s.delete(key));
}

export async function saveQueuedPhotoMeasurements(photo:PendingPhoto,measures:PhotoMeasure[]):Promise<void>{
 await tx("readwrite",s=>s.put({...photo,measures}));
}
export async function markPhotoUploaded(photo:PendingPhoto,uploadedPath:string):Promise<void>{
 await tx("readwrite",s=>s.put({...photo,uploadedPath}));
}
