import {summarizeValues} from './owner-dispatch-values.js';
import {validateRoute} from './owner-dispatch-route.js';
import {validPayment,PAYMENT_METHODS,PAYMENT_STATES,PAYMENT_RECIPIENTS} from './owner-dispatch-payment.js';
import {ASSIGNMENT_MODES} from './owner-dispatch-assignment.js';
const label=(options,value)=>options.find(([v])=>v===value)?.[1];
const money=n=>Number.isSafeInteger(n)?(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):null;
export function reviewIssues(data){
 const [s,r,b,p,v,pay,a]=data;
 const issues=[];
 if(!s.service)issues.push(0);
 if(!validateRoute(r)||!Number.isFinite(r.distance?.km)||r.distance.km<0)issues.push(1);
 if(!Number.isSafeInteger(b.passengers)||b.passengers<1||!Number.isSafeInteger(b.luggage)||b.luggage<0)issues.push(2);
 if(!p.contractor?.name||!p.source||(!p.samePassenger&&!p.passenger?.name))issues.push(3);
 if(!summarizeValues(v)||v.key!==JSON.stringify([s.service,r,b.passengers]))issues.push(4);
 if(!validPayment(pay))issues.push(5);
 if(!label(ASSIGNMENT_MODES,a.mode)||(a.mode==='manual'?!a.driverId:!!a.driverId))issues.push(6);
 return issues;
}
export function reviewCards(data){
 const [s,r,b,p,v,pay,a]=data;const totals=summarizeValues(v)||{};
 const contact=c=>[['Nome',c?.name],['País',c?.country],['Telefone',c?.phone],['E-mail',c?.email]];
 return [
 [0,'Serviço',[['Categoria',s.service]]],
 [1,'Trajeto',[['Data',r.date],['Horário',r.time],['Origem',r.origin],...(r.stops||[]).map((x,i)=>[`Parada ${i+1}`,`${x.address} · ${x.minutes} min`]),['Destino',r.destination],['Distância',Number.isFinite(r.distance?.km)?`${r.distance.km.toFixed(1)} km`:null],['Informações complementares',r.notes]]],
 [2,'Embarque',[['Passageiros',b.passengers],['Bagagens',b.luggage],['Voo',b.flight],['Necessidades especiais',b.specialNeeds],['Observações',b.notes]]],
 [3,'Contratante',[['Tipo',p.mode==='registered'?'Cliente cadastrado':'Externo'],...contact(p.contractor),['Origem da solicitação',p.source]]],
 [3,'Passageiro',contact(p.samePassenger?p.contractor:p.passenger)],
 [4,'Valores',[['Original',money(totals.original)],['Desconto',money(totals.discount)],['Acréscimo',money(totals.addition)],['Final',money(totals.final)],['Comissão',money(totals.commission)],['Motorista',money(totals.driver)],['Justificativa',v.reason]]],
 [5,'Pagamento',[['Forma',label(PAYMENT_METHODS,pay.method)],['Situação declarada',label(PAYMENT_STATES,pay.status)],['Recebedor',label(PAYMENT_RECIPIENTS,pay.recipient)]]],
 [6,'Designação',[['Modalidade',label(ASSIGNMENT_MODES,a.mode)],['Motorista',a.driverId]]],
 [3,'Observações',[['Internas',p.internalNotes],['Compartilhadas',p.sharedNotes]]]
 ];
}
