// Estimativa local: não autoriza cobrança nem substitui o cálculo do servidor.
export function cents(value){
 const s=String(value??'').trim(); if(!/^\d{1,10}(\.\d{1,2})?$/.test(s))return null;
 const [whole,fraction='']=s.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}
export function quoteRoute(r,gig){
 const {km,originGeo:a,destinationGeo:b}=r.distance||{};
 if(!Number.isFinite(km)||km<0||!a?.municipality||!b?.municipality||!a.state||!b.state)throw Error('Dados de rota incompletos.');
 return {distance_km:km,origin_municipality:a.municipality,destination_municipality:b.municipality,origin_state:a.state,destination_state:b.state,is_gig:gig(r.destination),stop_minutes:(r.stops||[]).reduce((n,s)=>n+s.minutes,0)};
}
export function summarizeValues(v){
 const original=v.original,final=cents(v.final),rate=cents(v.rate);
 if(!Number.isSafeInteger(original)||original<=0||final===null||final<=0||rate===null||rate>10000)return null;
 if(final!==original&&!v.reason?.trim())return null;
 const commission=Number((BigInt(final)*BigInt(rate)+5000n)/10000n);
 return {original,final,discount:Math.max(0,original-final),addition:Math.max(0,final-original),commission,driver:final-commission};
}
