export type DomainEvent={event:string;payload:any;timestamp:string};
type Handler=(e:DomainEvent)=>void|Promise<void>;
export class EventBus{
 private handlers=new Map<string,Handler[]>();
 subscribe(event:string,h:Handler){this.handlers.set(event,[...(this.handlers.get(event)||[]),h]);}
 async publish(e:DomainEvent){for(const h of this.handlers.get(e.event)||[]) await h(e);}
}
export const eventBus=new EventBus();
