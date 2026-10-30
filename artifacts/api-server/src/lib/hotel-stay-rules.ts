export function validStay(arrival:string,departure:string,maxNights=365):boolean {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(arrival)||!/^\d{4}-\d{2}-\d{2}$/.test(departure))return false;
 const a=Date.parse(arrival+"T00:00:00Z"),d=Date.parse(departure+"T00:00:00Z");
 const nights=(d-a)/86400000;
 return Number.isInteger(nights)&&nights>=1&&nights<=maxNights;
}
export function datesOverlap(aStart:string,aEnd:string,bStart:string,bEnd:string):boolean{
 return aStart<bEnd&&aEnd>bStart;
}
