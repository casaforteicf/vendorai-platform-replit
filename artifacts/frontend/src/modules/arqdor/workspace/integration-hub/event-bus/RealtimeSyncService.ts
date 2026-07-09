import {eventBus} from './EventBus';
export class RealtimeSyncService{
 async emit(event:string,payload:any){
  await eventBus.publish({event,payload,timestamp:new Date().toISOString()});
 }
}
