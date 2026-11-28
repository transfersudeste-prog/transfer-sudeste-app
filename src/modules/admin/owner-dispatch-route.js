export function validateRoute(r) {
  return Boolean(/^\d{4}-\d{2}-\d{2}$/.test(r.date||'') && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time||'') && r.origin?.trim() && r.destination?.trim() && (r.stops||[]).every(s=>s.address?.trim() && Number.isInteger(s.minutes) && s.minutes>=10 && s.minutes<=360 && s.minutes%10===0));
}
export async function calculateRoute(r, services) {
  if (!validateRoute(r)) throw Error('Preencha os dados do trajeto.');
  const coords=[];
  for(const address of [r.origin,...(r.stops||[]).map(s=>s.address),r.destination]) coords.push(await services.geocode(address));
  const km=await services.roadDistance(coords);
  if(!Number.isFinite(km)||km<0) throw Error('Distância inválida.');
  return {km,originGeo:coords[0],destinationGeo:coords.at(-1)};
}
