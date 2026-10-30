function utcDay(value:string):number|null {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const ms=Date.parse(value+"T00:00:00Z");
 if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==value)return null;
 return ms/86400000;
}
export function validStay(arrival:string,departure:string,maxNights=365):boolean {
 const a=utcDay(arrival),d=utcDay(departure);
 return a!==null&&d!==null&&Number.isInteger(d-a)&&d-a>=1&&d-a<=maxNights;
}
export function datesOverlap(aStart:string,aEnd:string,bStart:string,bEnd:string):boolean{
 return aStart<bEnd&&aEnd>bStart;
}
