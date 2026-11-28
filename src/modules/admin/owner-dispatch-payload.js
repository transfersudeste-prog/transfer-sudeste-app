import {reviewIssues} from './owner-dispatch-review.js';
import {validParty} from './owner-dispatch-party.js';
import {quoteRoute,summarizeValues} from './owner-dispatch-values.js';
// Pure adapter for the restricted candidate RPC. No network or persistence.
export function buildDispatchPayload(snapshot,{phoneLibrary,gig}) {
 if(snapshot?.step!==7||snapshot.data?.length!==7) throw Error('Conclua as etapas.');
 const data=snapshot.data;
 const [s,r,b,p,v,pay,a]=data;
 if(reviewIssues(data).length||!validParty(p,phoneLibrary)) throw Error('Revise os dados do despacho.');
 if(s.service!=='Transfer'||!['later','queue','manual'].includes(a.mode)) throw Error('Modalidade ainda não suportada.');
 if(pay.status==='received_driver'&&a.mode!=='manual') throw Error('Selecione o motorista que recebeu o pagamento.');
 const route=quoteRoute(r,gig), totals=summarizeValues(v);
 if(route.distance_km<=0||route.distance_km>2000||route.stop_minutes>1440||(r.stops||[]).length>8||b.luggage>100||totals.original>9999999999||totals.final>9999999999) throw Error('Limites do servidor excedidos.');
 const contact=c=>({name:c.name.trim(),phone:phoneLibrary.parsePhoneNumberFromString(c.phone,{defaultCountry:c.country,extract:false}).number,email:c.email?.trim()||null});
 const c=contact(p.contractor), passenger=p.samePassenger?c:contact(p.passenger);
 if(p.mode==='registered'&&!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(p.clientId)) throw Error('Cliente inválido.');
 const notes=[['Trajeto',r.notes],['Embarque',b.notes],['Necessidades especiais',b.specialNeeds],['Informações compartilhadas',p.sharedNotes]].filter(([,x])=>x?.trim()).map(([k,x])=>`${k}: ${x.trim()}`).join('\n');
 if(notes.length>2000||(b.flight||'').length>50) throw Error('Observações excedem o limite.');
 return {booking:{service_type:'transfer',client_id:p.mode==='registered'?p.clientId:null,client_name:c.name,client_phone:c.phone,client_email:c.email,passenger_name:passenger.name,passenger_phone:passenger.phone,passenger_email:passenger.email,booking_for_other_person:!p.samePassenger,origin:r.origin.trim(),destination:r.destination.trim(),stops:(r.stops||[]).map(x=>({address:x.address.trim(),minutes:x.minutes})),pickup_date:r.date,pickup_time:r.time,passengers:b.passengers,luggage:b.luggage,flight_number:b.flight?.trim()||null,notes,preferred_payment_method:pay.method},route,assignment:a.mode,driver_id:a.driverId||null,payment_status:pay.status,payment_recipient:pay.recipient,party_mode:p.mode,source:p.source,original_amount:(totals.original/100).toFixed(2),final_amount:(totals.final/100).toFixed(2),commission_percentage:String(v.rate),reason:v.reason?.trim()||null,internal_notes:p.internalNotes?.trim()||null};
}
