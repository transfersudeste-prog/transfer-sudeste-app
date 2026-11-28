export const ASSIGNMENT_MODES=Object.freeze([['manual','Designação manual'],['queue','Fila virtual'],['later','Designação posterior']]);
// Manual assignment uses approved active drivers; known operational conflicts still block selection.
export function eligibleDriver(d, passengers, service){
 return !!d?.driver_id && d.approval_status==='approved' && d.active===true && d.available!==false && d.conflict!==true && Number.isSafeInteger(passengers) && passengers>0 && (d.capacity==null||d.capacity>=passengers) && (!Array.isArray(d.categories)||d.categories.includes(service));
}
export function validAssignment(a,drivers,passengers,service){
 if(a?.mode==='later'||a?.mode==='queue')return !a.driverId;
 return a?.mode==='manual' && Array.isArray(drivers) && drivers.some(d=>d.driver_id===a.driverId&&eligibleDriver(d,passengers,service));
}
