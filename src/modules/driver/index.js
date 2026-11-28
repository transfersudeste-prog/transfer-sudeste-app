import {loadPhoneLibrary} from '../../core/services/phone-library.js';
import {interfaceIcon as icon} from '../../shared/components/interface-icons.js';

export function createDriver({runtime, $, bookingDate, current, esc, messageError, openAuth, req, selectMode}) {
async function driverIsExclusive(token){
 try{
  const opts={method:'POST',headers:{Authorization:'Bearer '+token},body:'{}'};const [owner,admin,driver]=await Promise.all(['is_owner','is_admin','is_exclusive_driver_account'].map(r=>req('/rest/v1/rpc/'+r,opts)));return owner!==true&&admin!==true&&driver===true&&runtime.session?.access_token===token;
 }catch(e){
  console.warn('Não foi possível confirmar perfil exclusivo de motorista',e);
  return false;
 }
}
async function driverNeedsPasswordChange(token){
 if(!(await driverIsExclusive(token)))return false;
 const rows=await req('/rest/v1/profiles?select=must_change_password&limit=1',{
  headers:{Authorization:'Bearer '+token}
 }).catch(()=>[]);
 if(!Array.isArray(rows)||!rows[0]?.must_change_password)return false;
 const user=await req('/auth/v1/user',{headers:{Authorization:'Bearer '+token}});
 return !user.user_metadata?.driver_password_changed;
}
async function driverRouteAfterLogin(status){
 $('driverChangeModal').classList.add('hidden');
 const s=await current();if(!s)return;
 if(!(await driverIsExclusive(s.access_token)))return false;
 const needsPassword=await driverNeedsPasswordChange(s.access_token);
 if(runtime.session?.user?.id!==s.user.id||runtime.admin.allowed)return false;
 if(needsPassword){
  window.tsBaseNavigate('conta');
  $('driverChangeModal').classList.remove('hidden');
 }else driverShowPanel(status);
 return true;
}
let driverRoleState=null;
function driverShowPanel(status){
 driverRoleState=status;
 document.body.classList.toggle('driver-account',status==='approved');
 ts313Mode=status==='approved'?'motoristaInicio':'motoristaPainel';
 document.querySelectorAll('.nav button[data-page]').forEach(button=>{
  const page=button.dataset.page;
  const visible=status==='approved'?driverMenuPages.includes(page):page==='motoristaPainel';
  button.classList.toggle('hidden',!visible);
 });
 const labels={pending:['Cadastro aguardando aprovação','Seus dados foram recebidos. A administração da Transfer Sudeste fará a análise.'],approved:['Cadastro aprovado','Seu acesso como motorista está liberado.'],rejected:['Cadastro não aprovado','Entre em contato com a administração para mais informações.'],disabled:['Acesso desativado','Entre em contato com a administração.']};
 const [title,message]=labels[status]||labels.pending;
 $('driverPanelTitle').textContent=title;$('driverPanelMessage').textContent=message;const approved=status==='approved';$('driverPanelTitle').classList.toggle('hidden',approved);$('driverPanelMessage').classList.toggle('hidden',approved);
 $('driverPanelBookings').classList.toggle('hidden',status!=='approved');
 if(status==='approved'){ $('driverPanelBookings').innerHTML='<p class="soft-note">Carregando reservas designadas…</p>';}
 window.tsNavigate(ts313Mode);
 if(approved){
  void refreshCommission();
  void syncDriver();
  void runtime.dispatchOffers?.syncDriver();
 }
}
async function ts303TripAction(bookingId, action, paymentMethod=null){
 const se=await current();if(!se)throw Error('Faça login novamente.');
 return await req('/rest/v1/rpc/ts_driver_trip_action',{
  method:'POST',headers:{Authorization:'Bearer '+se.access_token},
  body:JSON.stringify({p_booking_id:bookingId,p_action:action,p_payment_method:paymentMethod})
 });
}
const driverMenuPages=['motoristaInicio','motoristaHistorico','motoristaGanhos','motoristaEmpresa'];
const ts313Pages=[...driverMenuPages,'motoristaPainel'];
let ts313Mode='motoristaInicio';
let ts318Rows=[],ts318Trips=new Map(),ts318Selected=null,ts318PendingFinish=false;
function ts318Stops(v){if(!v)return [];try{const a=typeof v==='string'?JSON.parse(v):v;return Array.isArray(a)?a:[]}catch{return []}}
function ts318Money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function ts318Point(kind,label,address){return '<div class="ts318-point"><span class="ts318-dot '+kind+'">'+(kind==='stop'?'•':kind==='end'?'↓':'↑')+'</span><div class="ts318-address"><small>'+esc(label)+'</small>'+esc(address||'Não informado')+'</div></div>'}
function ts318Route(b){const stops=ts318Stops(b.stops);return '<div class="ts318-route">'+ts318Point('','Origem',b.origin)+stops.map((st,i)=>ts318Point('stop','Parada '+(i+1),typeof st==='string'?st:st?.address)).join('')+ts318Point('end','Destino',b.destination)+'</div>'}
function ts318Info(label,value){return '<div class="ts318-info"><small>'+esc(label)+'</small><strong>'+esc(value==null||value===''?'Não informado':String(value))+'</strong></div>'}
function ts319Time(v){return v?new Date(v).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):null}
function ts319Tracking(t){return '<div class="ts318-detail-section ts319-tracking"><h3>Acompanhamento</h3>'+ts318Info('Início',t.started_at?'Iniciado · '+ts319Time(t.started_at):'Não iniciado')+ts318Info('Encerramento',t.finished_at?'Encerrado · '+ts319Time(t.finished_at):'Não encerrado')+'</div>'}
function ts318Service(b){return String(b.service_type||'Transfer')}
function ts318Status(t,b){return t?.finished_at||b?.booking_status==='completed'?'Concluído':t?.started_at||b?.booking_status==='in_progress'?'Em andamento':'Agendado'}
function ts313Today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function ts313Items(){
 return ts318Rows.map((b,i)=>({b,i,t:ts318Trips.get(String(b.id))}))
  .filter(({b})=>!b.deleted_at&&!b.cancelled_at&&!['cancelled','canceled','rejected'].includes(b.booking_status));
}
const bookingClock=b=>String(b.pickup_time||'').slice(0,5);
const bookingKey=b=>String(b.id).slice(0,8).toUpperCase();
const shortMonth=new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'});
const longMonth=new Intl.DateTimeFormat('pt-BR',{month:'long',timeZone:'UTC'});
const monthAndYear=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'});
const readableDay=new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long',timeZone:'UTC'});
const driverHistoryForm=$('driverHistoryFilters');
const driverHistoryExpanded=new Set();
let historyFilter={};
let commission=null, commissionChecked=0, readingCommission=false;

function dayLabel(value){
 const date=new Date(value+'T12:00:00Z');
 if(!Number.isFinite(date.valueOf()))return 'Data a definir';
 return (value===ts313Today()?'Hoje, ':'')+readableDay.format(date);
}
function serviceLabel(b){
 return ({transfer:'Transfer',hourly_driver:'Motorista à disposição',city_tour:'City Tour',wedding:'Casamento'})[b.service_type]||ts318Service(b);
}
async function refreshCommission(){
 const uid=runtime.session?.user?.id;
 if(!uid||driverRoleState!=='approved'||readingCommission||Date.now()-commissionChecked<60000)return;
 readingCommission=true;
 try{
  const session=await current();
  if(session?.user.id!==uid||driverRoleState!=='approved')return;
  const data=await req('/rest/v1/rpc/ts_get_company_settings',{
   method:'POST',headers:{Authorization:'Bearer '+session.access_token},body:'{}'
  });
  if(runtime.session?.user?.id!==uid||driverRoleState!=='approved')return;
  const info=Array.isArray(data)?data[0]:data;
  const rate=info?.commission_percentage;
  const next=rate!=null&&Number.isFinite(Number(rate))&&Number(rate)>=0&&Number(rate)<=100?Number(rate):null;
  const changed=next!==commission;
  commission=next;commissionChecked=Date.now();
  if(changed&&$('driverPanelBookings').isConnected&&ts318Selected===null&&ts313Mode==='motoristaPainel')ts318List();
  if(changed)runtime.dispatchOffers?.refreshOfferSummary();
 }catch{
  if(runtime.session?.user?.id===uid)commissionChecked=Date.now();
 }finally{readingCommission=false}
}
function driverValue(b){
 const supplied=b.driver_net_amount;
 if(supplied!=null&&Number.isFinite(Number(supplied)))return {label:'Valor do motorista',value:ts318Money(supplied)};
 if(b.total_amount==null||!Number.isFinite(Number(b.total_amount)))return {label:'Valor do serviço',value:'A definir'};
 if(commission===null)return {label:'Valor do serviço',value:ts318Money(b.total_amount)};
 const cents=Math.round(Number(b.total_amount)*100);
 const fee=Math.floor((cents*Math.round(commission*100)+5000)/10000);
 return {label:'Valor do motorista',value:ts318Money((cents-fee)/100),estimated:true};
}
function cardFacts(b,history=false){
 const facts=[];
 if(b.passengers!=null)facts.push(`<span>${icon('user')} ${esc(b.passengers)} pax</span>`);
 if(b.luggage!=null)facts.push(`<span>${icon('luggage')} ${esc(b.luggage)} ${Number(b.luggage)===1?'mala':'malas'}</span>`);
 if(history&&(b.flight_number||/aeroporto/i.test((b.origin||'')+' '+(b.destination||'')))){
  facts.push(`<span title="Voo" aria-label="Voo${b.flight_number?' '+esc(b.flight_number):''}">${icon('plane')}${esc(b.flight_number||'')}</span>`);
 }else if(!history&&b.distance_km!=null&&Number.isFinite(Number(b.distance_km))){
  const distance=Number(b.distance_km).toLocaleString('pt-BR',{maximumFractionDigits:1});
  facts.push(`<span>${icon('road')} ${esc(distance)} km</span>`);
 }
 return `<div class="driver-card-facts${history?' history-facts':''}">${facts.join('')}</div>`;
}
function driverSpotlight(b,badge){
 const {label,value,estimated}=driverValue(b);
 const service=b.service_type==='transfer'?'Transfer executivo':serviceLabel(b);
 return `<div class="driver-spotlight-heading"><strong>${esc(service)}</strong>${badge}</div>
  <div class="driver-spotlight-time">
   <div><span>${esc(dayLabel(b.pickup_date))}</span><strong>${esc(bookingClock(b)||'A definir')}</strong></div>
   <div${estimated?' title="Estimativa pela comissão vigente"':''}><span>${label}</span><strong>${esc(value)}</strong></div>
  </div>
  <ol class="driver-spotlight-route">
   <li class="origin"><span>Origem</span><strong>${esc(b.origin||'Não informada')}</strong></li>
   <li class="destination"><span>Destino</span><strong>${esc(b.destination||'Não informado')}</strong></li>
  </ol>${cardFacts(b)}`;
}
function driverStatus(b,t){
 const status=ts318Status(t,b);
 return status==='Agendado'&&b.booking_status==='confirmed'?'Confirmada':status;
}
function reservationCard({b,i,t},featured){
 const status=driverStatus(b,t);
 if(featured){
  return `<article class="driver-list-card driver-spotlight">${driverSpotlight(b,`<span class="driver-reservation-status">${esc(status)}</span>`)}
   <button type="button" class="driver-details-link" data-ts318-open="${i}">Ver detalhes da reserva ${icon('down')}</button></article>`;
 }
 return `<button type="button" class="driver-list-card driver-compact-booking" data-ts318-open="${i}">
  <span><small>${esc(bookingClock(b))} · ${esc(serviceLabel(b))}</small><strong>${esc(b.origin||'Origem a definir')}</strong>
   <span>→ ${esc(b.destination||'Destino a definir')}</span></span>
  <span class="driver-compact-price"><strong>${esc(driverValue(b).value)}</strong><span>${esc(status)}</span></span>${icon('down')}
 </button>`;
}
function driverHistoryDate({b,t}){
 return b.pickup_date||String(t?.finished_at||'').slice(0,10);
}
function historyCard(item){
 const {b,i}=item;
 const date=new Date(driverHistoryDate(item)+'T12:00:00Z');
 const valid=Number.isFinite(date.valueOf());
 const value=b.total_amount==null?'A definir':ts318Money(b.total_amount);
 return `<details class="driver-list-card driver-history-card" data-driver-history-id="${esc(b.id)}"${driverHistoryExpanded.has(b.id)?' open':''}>
  <summary>
   <span class="driver-history-day"><strong>${valid?date.getUTCDate():'—'}</strong><small>${valid?esc(shortMonth.format(date).replace(/\.$/,'')):''}</small></span>
   <span class="driver-history-identity"><strong>${esc(serviceLabel(b))}</strong><small>${esc(bookingClock(b))}</small><small>#${esc(bookingKey(b))}</small></span>
   <span class="driver-history-value"><strong>${esc(value)}</strong><small>${icon('check')} Concluído</small></span>
   ${icon('down')}
  </summary>
  <div class="driver-history-expanded">${cardFacts(b,true)}${ts318Route(b)}
   <dl class="driver-history-information">
    <div><dt>Reserva</dt><dd>#${esc(bookingKey(b))}</dd></div>
    <div><dt>Data e horário</dt><dd>${esc(bookingDate(b.pickup_date)+' · '+bookingClock(b))}</dd></div>
    <div><dt>Serviço</dt><dd>${esc(b.service_type==='transfer'?'Transfer executivo':serviceLabel(b))}</dd></div>
    <div><dt>Valor do atendimento</dt><dd class="driver-history-amount">${esc(value)}</dd></div>
    <div><dt>Status</dt><dd class="driver-history-status">${icon('check')} Concluído</dd></div>
   </dl>
   <button type="button" class="driver-details-link" data-ts318-open="${i}">Ver detalhes da reserva ${icon('right')}</button>
  </div>
 </details>`;
}
function updateHistorySelect(name,options){
 const select=driverHistoryForm.elements.namedItem(name);
 if(options.length===select.length-1&&options.every(([value],index)=>select.options[index+1].value===value))return;
 const selection=select.value;
 while(select.length>1)select.remove(1);
 for(const [value,label] of options)select.add(new Option(label,value));
 select.value=options.some(([value])=>value===selection)?selection:'';
}
function renderDriverHistory(items){
 const completed=items.filter(({b,t})=>ts318Status(t,b)==='Concluído').sort((a,b)=>
  driverHistoryDate(b).localeCompare(driverHistoryDate(a))||bookingClock(b.b).localeCompare(bookingClock(a.b)));
 const years=[...new Set(completed.map(item=>driverHistoryDate(item).slice(0,4)).filter(Boolean))];
 updateHistorySelect('year',years.map(year=>[year,year]));
 updateHistorySelect('booking',completed.map(({b})=>[String(b.id),'#'+bookingKey(b)]));
 const {month,year,booking}=historyFilter;
 const selected=completed.filter(item=>{
  const date=driverHistoryDate(item);
  return (!month||date.slice(5,7)===month)&&(!year||date.startsWith(year+'-'))&&(!booking||item.b.id===booking);
 });
 if(!selected.length)return `<p class="driver-empty">${completed.length?'Nenhuma reserva encontrada para estes filtros.':'Você ainda não concluiu nenhum atendimento.'}</p>`;
 const grouped=new Map();
 for(const item of selected){
  const date=driverHistoryDate(item).slice(0,7);
  if(!grouped.has(date))grouped.set(date,[]);
  grouped.get(date).push(item);
 }
 return [...grouped.entries()].map(([key,rows])=>{
  const date=new Date(key+'-01T12:00:00Z');
  const title=Number.isFinite(date.valueOf())?monthAndYear.format(date):'Data indisponível';
  return `<section class="driver-history-month">
   <div class="driver-list-label"><strong>${esc(title)}</strong><span>${rows.length} ${rows.length===1?'reserva':'reservas'}</span></div>
   ${rows.map(historyCard).join('')}</section>`;
 }).join('');
}
function renderDriverReservations(items){
 const current=ts313Today();
 const open=items.filter(({b,t})=>ts318Status(t,b)!=='Concluído').sort((a,b)=>
  Number(ts318Status(b.t,b.b)==='Em andamento')-Number(ts318Status(a.t,a.b)==='Em andamento')||
  (String(a.b.pickup_date||'9999')+bookingClock(a.b)).localeCompare(String(b.b.pickup_date||'9999')+bookingClock(b.b)));
 const today=open.filter(({b,t})=>b.pickup_date===current||ts318Status(t,b)==='Em andamento');
 const later=open.filter(item=>!today.includes(item));
 const count=String(today.length).padStart(2,'0')+' '+(today.length===1?'reserva':'reservas');
 return `<div class="driver-list-label"><span>Reservas de hoje</span><strong>${count}</strong></div>
  ${today.length?`<h2 class="driver-next-label">Próximo atendimento</h2>${reservationCard(today[0],true)}`:'<p class="driver-empty">Nenhuma reserva para hoje.</p>'}
  ${today.length>1?`<h2 class="driver-other-label">Demais reservas do dia</h2>${today.slice(1).map(item=>reservationCard(item,false)).join('')}`:''}
  ${later.length?`<h2 class="driver-other-label">Outros agendamentos</h2>${later.map(item=>reservationCard(item,false)).join('')}`:''}`;
}
function isOffersView(){
 return driverRoleState==='approved'&&ts313Mode==='motoristaInicio'&&$('motoristaPainel').classList.contains('active')&&
  !$('ts318DriverList').classList.contains('hidden');
}
function ts318List(){
 const panel=$('driverPanelBookings'), approved=driverRoleState==='approved';
 const home=approved&&ts313Mode!=='motoristaHistorico', offers=home&&ts313Mode==='motoristaInicio';
 $('ts318DriverList').classList.remove('hidden');
 $('ts318DriverDetail').classList.add('hidden');
 $('ts319DriverTitle').textContent='Reservas';
 $('ts319DriverTitle').parentElement.classList.toggle('hidden',approved);
 $('ts319DetailClose').classList.add('hidden');
 $('driverHomeTabs').classList.toggle('hidden',!home);
 $('driverOffersPanel').classList.toggle('hidden',!offers);
 $('driverHistoryControls').classList.toggle('hidden',!approved||home);
 panel.classList.toggle('hidden',!approved||offers);
 panel.classList.toggle('driver-tab-panel',home);
 for(const button of $('driverHomeTabs').querySelectorAll('[data-driver-tab]')){
  button.setAttribute('aria-pressed',String(button.dataset.driverTab===(offers?'offers':'reservations')));
 }
 ts318Selected=null;ts318PendingFinish=false;
 if(approved&&!offers){
  const items=ts313Items();
  const html=home?renderDriverReservations(items):renderDriverHistory(items);
  if(panel.dataset.rendered!==html){panel.innerHTML=html;panel.dataset.rendered=html}
 }
 runtime.dispatchOffers?.updateDriverPresentation();
}
$('driverHomeTabs').onclick=event=>{
 const tab=event.target.closest('[data-driver-tab]');
 if(tab)window.tsNavigate(tab.dataset.driverTab==='offers'?'motoristaInicio':'motoristaPainel');
};
const toggleHistoryFilters=open=>{
 if(open===undefined)open=driverHistoryForm.classList.contains('hidden');
 driverHistoryForm.classList.toggle('hidden',!open);
 $('driverHistoryToggle').setAttribute('aria-expanded',String(open));
};
updateHistorySelect('month',Array.from({length:12},(_,index)=>[
 String(index+1).padStart(2,'0'),longMonth.format(new Date(Date.UTC(2000,index,1)))
]));
$('driverHistoryToggle').onclick=()=>toggleHistoryFilters();
driverHistoryForm.onsubmit=event=>{event.preventDefault();historyFilter=Object.fromEntries(new FormData(driverHistoryForm));ts318List()};
driverHistoryForm.onreset=()=>{historyFilter={};ts318List()};
$('driverPanelBookings').addEventListener('toggle',event=>{
 const item=event.target, id=item.dataset.driverHistoryId;
 if(!id||!item.isConnected)return;
 if(item.open)driverHistoryExpanded.add(id);else driverHistoryExpanded.delete(id);
},true);
$('driverPanelBookings').onclick=event=>{
 const open=event.target.closest('[data-ts318-open]');
 if(open)ts318Open(Number(open.dataset.ts318Open));
};
function ts318Open(i, keepScroll=false){
 const expanded=keepScroll?[...$('ts318DriverDetail').querySelectorAll('details')].map(section=>section.open):[];
 const b=ts318Rows[i];if(!b)return;ts318Selected=i;ts318PendingFinish=false;$('ts318DriverList').classList.add('hidden');$('ts319DriverTitle').textContent='Reserva #'+String(b.id).slice(0,8).toUpperCase();$('ts319DetailClose').classList.remove('hidden');$('ts319DriverTitle').parentElement.classList.remove('hidden');const host=$('ts318DriverDetail');host.classList.remove('hidden');const t=ts318Trips.get(String(b.id))||{};
 const amount=Number(b.total_amount||0),pct=Number(b.company_commission_percentage??b.commission_percentage??commission??15),fee=amount*(Number.isFinite(pct)?pct:15)/100;
 const realPassenger=!!b.passenger_name;
 const passengerPhone=realPassenger?b.passenger_phone:b.client_phone;
 const profilePhoto=b.booking_for_other_person?null:(b.client_photo_url||b.customer_photo_url||null);
 const items=[['Número da reserva',String(b.id).slice(0,8).toUpperCase()],['Data',bookingDate(b.pickup_date)],['Horário',String(b.pickup_time||'').slice(0,5)],['Observações',b.notes]];
  host.innerHTML='<div class="ts318-detail-amount"><small>Valor total a cobrar do passageiro</small><strong>'+ts318Money(amount)+'</strong><div class="ts318-detail-fee"><span>Taxa da empresa ('+esc(String(Number.isFinite(pct)?pct:15).replace('.',','))+'%)</span><b>'+ts318Money(fee)+'</b></div></div><div class="ts318-detail-section"><h3>Itinerário</h3>'+ts318Route(b)+'</div><div id="ts318Action"></div>'+(runtime.dispatchOffers?'<div id="tsQueueReleaseAction"></div>':'')+'<div id="ts319TrackingHost">'+ts319Tracking(t)+'</div><details class="ts318-detail-section ts319-fold"><summary>'+ (realPassenger?'Dados do passageiro':'Dados do cliente') +' <span class="ts319-chevron" aria-hidden="true">⌄</span></summary><div class="ts319-fold-body">'+(profilePhoto?'<img class="ts318-client-photo" src="'+esc(profilePhoto)+'" alt="Foto do cliente" loading="lazy">':'')+ts318Info('Nome',b.passenger_name||b.client_name)+ts318Info('Telefone',passengerPhone)+ts318Info('E-mail',realPassenger?b.passenger_email:b.client_email)+'</div></details><details class="ts318-detail-section ts319-fold"><summary>Dados da reserva <span class="ts319-chevron" aria-hidden="true">⌄</span></summary><div class="ts319-fold-body">'+items.map(([k,v])=>ts318Info(k,v)).join('')+'</div></details>';
 const passengerDetails=host.querySelector('.ts319-fold-body');
 if(passengerPhone)void loadPhoneLibrary().then(library=>{
  const parsed=library.parsePhoneNumberFromString(String(passengerPhone),'BR');
  if(!parsed?.isValid()||!passengerDetails.isConnected)return;
  const link=document.createElement('a');
  link.className='back ts315-passenger-whatsapp';
  link.href='https://wa.me/'+parsed.number.slice(1);
  link.target='_blank';
  link.rel='noopener noreferrer';
  link.textContent='Abrir WhatsApp do passageiro';
  passengerDetails.append(link);
 }).catch(error=>console.warn('Validação do telefone do passageiro:',error));
 ts318RenderAction();
 runtime.dispatchOffers?.drawRelease();
 if(keepScroll)host.querySelectorAll('details').forEach((section,j)=>{section.open=expanded[j]||false});
 else host.scrollIntoView({block:'start',behavior:'instant'});
}
function ts318RenderAction(){const b=ts318Rows[ts318Selected],t=ts318Trips.get(String(b.id))||{},host=$('ts318Action');if(t.finished_at||b.booking_status==='completed'){host.innerHTML='<div class="ts318-finished">✓ Atendimento concluído</div>';return}
 if(!t.started_at){host.innerHTML='<button type="button" class="ts318-action-btn" id="ts318Start">Iniciar atendimento</button><p class="ts318-stage-hint">O início será registrado com data e horário no sistema.</p>';$('ts318Start').onclick=async()=>{const btn=$('ts318Start');btn.disabled=true;try{const result=await ts303TripAction(b.id,'start');ts318Trips.set(String(b.id),{...t,started_at:result.started_at||new Date().toISOString()});b.booking_status='in_progress';ts318Open(ts318Selected)}catch(e){alert('Não foi possível iniciar: '+messageError(e));btn.disabled=false}};return}
 if(!ts318PendingFinish){host.innerHTML='<button type="button" class="ts318-action-btn ts319-end-btn" id="ts318End">Encerrar atendimento</button><p class="ts318-stage-hint">Após encerrar, selecione a forma de pagamento e confirme a conclusão.</p>';$('ts318End').onclick=()=>{ts318PendingFinish=true;ts318RenderAction()};return}
 host.innerHTML='<label for="ts318Payment">Forma de pagamento do passageiro</label><select class="ts318-pay-select" id="ts318Payment"><option value="pix">PIX</option><option value="cash">Dinheiro</option><option value="debit">Cartão de débito</option><option value="credit">Cartão de crédito</option></select><button type="button" class="ts318-action-btn" id="ts318PaymentNext">Confirmar forma de pagamento</button><p class="ts318-stage-hint">O registro final será feito somente após sua confirmação.</p>';
 $('ts318PaymentNext').onclick=()=>{const method=$('ts318Payment').value;const names={pix:'PIX',cash:'Dinheiro',debit:'Cartão de débito',credit:'Cartão de crédito'};$('ts318ConfirmSummary').textContent='Reserva #'+String(b.id).slice(0,8).toUpperCase()+' · '+names[method]+' · '+ts318Money(b.total_amount);$('ts318ConfirmError').textContent='';$('ts318Confirm').classList.remove('hidden');$('ts318ConfirmYes').onclick=async()=>{const btn=$('ts318ConfirmYes');btn.disabled=true;try{const result=await ts303TripAction(b.id,'finish',method==='debit'||method==='credit'?'card':method);ts318Trips.set(String(b.id),{...t,...result});b.booking_status='completed';$('ts318Confirm').classList.add('hidden');await ts303LoadDriverBookings();const finishedIndex=ts318Rows.findIndex(row=>String(row.id)===String(b.id));if(finishedIndex>=0)ts318Open(finishedIndex);else ts318List();if(typeof tsProfileNotice==='function')tsProfileNotice('Atendimento concluído');else{const el=document.createElement('div');el.id='ts318Success';el.textContent='✓ Atendimento concluído';el.style.cssText='position:fixed;bottom:115px;left:50%;transform:translateX(-50%);z-index:99999;background:#d8b773;color:#18130d;border-radius:12px;padding:13px 20px;font-weight:800;white-space:nowrap';document.body.appendChild(el);setTimeout(()=>el.remove(),2300)}}catch(e){$('ts318ConfirmError').textContent=messageError(e)}finally{btn.disabled=false}}};
}
let ts313LoadSeq=0, lastBookingsSync=0, realtimeTimer=null, liveRefresh=null, realtimeDirty=false;
async function ts303LoadDriverBookings({live=false}={}){
 const seq=++ts313LoadSeq;
 const uid=runtime.session?.user?.id;
 const isCurrent=()=>uid===runtime.session?.user?.id&&driverRoleState==='approved'&&!runtime.admin.allowed&&seq===ts313LoadSeq;
 try{
  const se=await current();
  if(!se||se.user.id!==uid||!isCurrent())return;
  const headers={Authorization:'Bearer '+se.access_token};
  const rows=await req('/rest/v1/rpc/ts_driver_bookings_mine',{method:'POST',headers,body:'{}'});
  if(!isCurrent())return;
  let trips;
  try{
   trips=await req('/rest/v1/driver_trip_events?select=booking_id,started_at,finished_at,payment_method&driver_id=eq.'+encodeURIComponent(uid),{headers});
  }catch(error){
   console.warn('Consulta de etapas do motorista:',error);
  }
  if(!isCurrent())return;
  const previous=ts318Rows[ts318Selected];
  const previousTrip=previous&&ts318Trips.get(String(previous.id));
  ts318Rows=Array.isArray(rows)?rows:[];
  if(Array.isArray(trips))ts318Trips=new Map(trips.map(t=>[String(t.booking_id),t]));
  lastBookingsSync=Date.now();
  const index=previous?ts318Rows.findIndex(b=>b.id===previous.id&&!b.deleted_at&&!b.cancelled_at&&!['cancelled','canceled','rejected'].includes(b.booking_status)):-1;
  if(index<0){
   if(previous&&live)$('ts318Confirm').classList.add('hidden');
   ts318List();
   return;
  }
  ts318Selected=index;
  const changed=JSON.stringify([previous,previousTrip])!==JSON.stringify([ts318Rows[index],ts318Trips.get(String(previous.id))]);
  if(live&&changed&&!ts318PendingFinish&&!$('ts318Start')?.disabled)ts318Open(index,true);
 }catch(error){
  if(isCurrent()&&!live)$('driverPanelBookings').textContent='Não foi possível carregar as reservas designadas: '+messageError(error);
 }
}

const canSync=()=>!document.hidden&&driverRoleState==='approved'&&!runtime.admin.allowed&&runtime.session?.user?.id;
function scheduleDriverRefresh(){
 if(!canSync())return;
 realtimeDirty=true;
 clearTimeout(realtimeTimer);
 realtimeTimer=setTimeout(()=>{
  if(liveRefresh||!canSync())return;
  realtimeDirty=false;
  liveRefresh=ts303LoadDriverBookings({live:true}).finally(()=>{
   liveRefresh=null;
   if(realtimeDirty)scheduleDriverRefresh();
  });
 },200);
}
async function syncDriver(){
 const uid=canSync();
 if(uid)void refreshCommission();
 if(!uid){runtime.realtime.disconnect('driver');return}
 const activeSession=await current();
 if(!activeSession||canSync()!==uid||activeSession.user.id!==uid)return;
 const privateTopic='realtime:ts:driver:'+uid;
 runtime.realtime.connect({
  owner:'driver',
  token:activeSession.access_token,
  topics:[
   {topic:'realtime:ts_driver_bookings',changes:[{event:'*',schema:'public',table:'bookings',filter:'driver_id=eq.'+uid}]},
   {topic:privateTopic,isPrivate:true}
  ],
  onUpdate(){scheduleDriverRefresh();void runtime.dispatchOffers?.syncDriver()}
 });
 if(!runtime.realtime.isReady('driver',privateTopic)&&Date.now()-lastBookingsSync>30000)scheduleDriverRefresh();
}
setInterval(()=>void syncDriver(),4000);
document.addEventListener('visibilitychange',()=>{
 if(canSync()){void syncDriver();scheduleDriverRefresh()}
 else runtime.realtime.disconnect('driver');
});
$('ts318ConfirmBack').onclick=()=>$('ts318Confirm').classList.add('hidden');
 $('ts319DetailClose').onclick=()=>ts318List();

$('ts315FinishCancel').onclick=()=>$('ts315FinishModal').classList.add('hidden');
$('driverCredentialLogin').onclick=()=>{$('driverCredentialsModal').classList.add('hidden');selectMode('login');$('authEmail').value=$('driverCredentialEmail').textContent;$('authPassword').value=$('driverCredentialPassword').textContent;openAuth();};
$('driverChangeSubmit').onclick=async()=>{const pass=$('driverChangePassword').value,confirmPass=$('driverChangeConfirm').value,btn=$('driverChangeSubmit');if(pass.length<6||pass!==confirmPass){$('driverChangeFeedback').textContent='Informe uma senha de pelo menos 6 caracteres e confirme corretamente.';return}btn.disabled=true;try{const s=await current();if(!s)throw Error('Sessão expirada. Faça login novamente.');await req('/auth/v1/user',{method:'PUT',headers:{Authorization:'Bearer '+s.access_token},body:JSON.stringify({password:pass,data:{driver_password_changed:true}})});$('driverChangeModal').classList.add('hidden');const status=await req('/rest/v1/rpc/driver_access_status',{method:'POST',headers:{Authorization:'Bearer '+s.access_token},body:'{}'});driverShowPanel(status)}catch(e){$('driverChangeFeedback').textContent=messageError(e)}finally{btn.disabled=false}};
$('driverPanelSignOut').onclick=()=>{driverRoleState=null;$('ts316DriverNav').classList.add('hidden');document.querySelectorAll('.nav button[data-page]').forEach(b=>{b.classList.toggle('hidden',ts313Pages.includes(b.dataset.page))});$('signOut').click()};
const driverBaseNavigate=window.tsNavigate;
window.tsNavigate=id=>{
 if(['motoristaGanhos','motoristaEmpresa','financeiro'].includes(id)){
  if(id==='financeiro'?runtime.admin.allowed:driverRoleState==='approved'){
   driverBaseNavigate(id);
   runtime.dispatchOffers?.updateDriverPresentation();
   window.ts314Load?.(id);
  }
  return;
 }
 if(runtime.admin.allowed&&ts313Pages.includes(id))id='administracao';
 else if(driverRoleState&&['home','reservas','contato','administracao'].includes(id))id=driverRoleState==='approved'?'motoristaInicio':'motoristaPainel';
 if(!ts313Pages.includes(id)){
  driverBaseNavigate(id);
  runtime.dispatchOffers?.updateDriverPresentation();
  return;
 }
 if(!driverRoleState)return;
 if(driverRoleState!=='approved')id='motoristaPainel';
 ts313Mode=id;
 driverBaseNavigate('motoristaPainel');
 const menuPage=id==='motoristaPainel'&&driverRoleState==='approved'?'motoristaInicio':id;
 document.querySelectorAll('.nav button[data-page]').forEach(button=>{
  const active=button.dataset.page===menuPage;
  button.classList.toggle('active',active);
  if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
 });
 ts318List();
 if(driverRoleState==='approved'){
  if(ts313Mode==='motoristaInicio')void runtime.dispatchOffers?.syncDriver();
  else void ts303LoadDriverBookings();
 }
};
// V31.15 — Cliente. A navegação, o formulário e as mutações não usam o Despacho.

function reset() {
 runtime.realtime.disconnect('driver');
 clearTimeout(realtimeTimer);
 lastBookingsSync=0;
 realtimeDirty=false;
 ts313LoadSeq++;
 driverRoleState=null;
 document.body.classList.remove('driver-account');
 commission=null;commissionChecked=0;
 driverHistoryExpanded.clear();historyFilter={};
 for(const select of driverHistoryForm.querySelectorAll('select'))select.selectedIndex=0;
 toggleHistoryFilters(false);
 updateHistorySelect('year',[]);updateHistorySelect('booking',[]);
 for(const id of ['driverPanelBookings','ts318DriverDetail']){
  $(id).replaceChildren();delete $(id).dataset.rendered;
 }
 ts318Rows=[];
 ts318Trips.clear();
 ts318Selected=null;
 ts318PendingFinish=false;
}

return {
 get role(){return driverRoleState},
 set role(value){driverRoleState=value;if(value!=='approved')document.body.classList.remove('driver-account')},
 get currentPage(){return ts313Mode},
 isOffersView,
 spotlight:driverSpotlight,
 reset,
 openAfterLogin:driverRouteAfterLogin,
 refreshBookings:ts303LoadDriverBookings,
 stops:ts318Stops,
 details(){
  const booking=ts318Rows[ts318Selected];
  return {booking,trip:booking&&ts318Trips.get(String(booking.id))};
 },
 route:ts318Route,
 info:ts318Info,
 service:ts318Service,
 money:ts318Money,
 today:ts313Today
};
}
