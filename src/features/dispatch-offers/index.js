import {interfaceIcon as icon} from '../../shared/components/interface-icons.js';

export function createDispatchOffers({runtime, $, bookingDate, bookingMoney, esc, messageError, notify, rpc}) {
 const styles=document.createElement('link');
 styles.rel='stylesheet';
 styles.href=new URL('./styles.css',import.meta.url).href;
 document.head.append(styles);
 $('ts315TrackingBar').insertAdjacentHTML('afterend',`<dialog class="dialog ts315-dialog ts-queue-dialog" id="tsQueueRoster" aria-labelledby="tsQueueRosterTitle">
 <button type="button" class="back ts306-icon-close" id="tsQueueRosterClose" aria-label="Fechar fila">×</button>
 <h2 id="tsQueueRosterTitle">Fila de despacho</h2>
 <form id="tsQueueRosterForm">
  <label for="tsQueuePick">Motorista</label>
  <div class="ts-queue-pick"><select id="tsQueuePick"></select><button type="button" class="back" id="tsQueueAdd">Adicionar</button></div>
  <ol id="tsQueueOrder"></ol><p id="tsQueueEmpty" class="soft-note">A fila está vazia.</p>
  <p id="tsQueueRosterError" class="field-error" role="alert"></p>
  <button type="submit" class="primary" id="tsQueueSave">Salvar fila</button>
 </form>
</dialog>
<dialog class="dialog ts315-dialog ts-queue-dialog" id="tsQueueOffer" aria-labelledby="tsQueueOfferTitle">
 <button type="button" class="back ts306-icon-close" id="tsQueueMinimize" aria-label="Minimizar oferta">−</button>
 <h2 id="tsQueueOfferTitle">Nova oferta de serviço</h2>
 <p class="ts-queue-clock">Tempo para responder <strong id="tsQueueOfferTime"></strong></p>
 <div id="tsQueueOfferBody"></div>
 <p id="tsQueueOfferError" class="field-error" role="alert"></p>
 <div class="ts-queue-actions">
  <button type="button" class="primary" id="tsQueueAccept">Aceitar</button><button type="button" class="primary" id="tsQueueDecline">Recusar</button>
 </div>
</dialog>
<button type="button" class="primary ts315-banner hidden" id="tsQueueOfferBar"></button>
<dialog class="dialog ts315-dialog ts-queue-dialog" id="tsQueueRelease" aria-labelledby="tsQueueReleaseTitle">
 <h2 id="tsQueueReleaseTitle">Cancelar minha designação?</h2>
 <p id="tsQueueReleaseText"></p><p id="tsQueueReleaseError" class="field-error" role="alert"></p>
 <div class="ts-queue-actions"><button type="button" class="back" id="tsQueueReleaseBack">Voltar</button>
  <button type="button" class="primary" id="tsQueueReleaseConfirm">Cancelar designação</button></div>
</dialog>
`);
 $('adminKpis').insertAdjacentHTML('afterend','<div class="ts-queue-admin"><button type="button" class="back" id="tsQueueAdminOpen">Gerenciar fila de despacho</button><small id="tsQueueAdminHint" role="status">Consultando fila…</small></div>');
 const offerDialog=$('tsQueueOffer'), rosterDialog=$('tsQueueRoster'), releaseDialog=$('tsQueueRelease');
 const offerBody=$('tsQueueOfferBody'), offerBar=$('tsQueueOfferBar'), inlineOffer=$('driverInlineOffer');
 let adminData=null, adminStamp='', editing=null, offered=null, seen=null, cancellable=new Set();
 let adminRefreshPending=false, driverRefreshPending=false;
 let dispatchRequest=null;
 let driverClock=0, adminClock=0, loadingAdmin=false, loadingDriver=false, replying=false, releasing=null, releaseBusy=false, serial=0, driverRead=0, adminIssue='';
 const stateLabel={waiting:'Aguardando motorista disponível na fila',offered:'Aguardando aceite',assigned:'Aceite confirmado',fallback:'Pendente de designação manual',manual:'Designação manual',closed:'Fluxo encerrado'};
 const reasonLabel={exhausted:'A fila de prioridade foi esgotada.',time:'O horário do serviço está próximo.',price:'Defina o valor do serviço na Gestão.'};
 const outcome={open:'Oferta enviada',accepted:'Aceitou',declined:'Recusou',expired:'Prazo vencido',withdrawn:'Oferta retirada'};
 const adminActive=()=>!!(runtime.session?.user?.id&&runtime.admin.allowed&&$('administracao').classList.contains('active'));
 const driverActive=()=>!!(runtime.session?.user?.id&&runtime.driver.role==='approved'&&!runtime.admin.allowed);
 const name=id=>adminData?.drivers.find(d=>d.driver_id===id)?.full_name||
  runtime.admin.drivers.find(d=>d.driver_id===id)?.full_name||'Motorista';
 const short=id=>String(id).slice(0,8).toUpperCase();
 const minLeft=(date,offset)=>{
  const secs=Math.max(0,Math.ceil((Date.parse(date)-Date.now()-offset)/1000));
  return String(Math.floor(secs/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0');
 };
 function tickClocks(){
  if(offered){
   const time=minLeft(offered.expires_at,driverClock);
   $('tsQueueOfferTime').textContent=time;
   offerBar.textContent='Oferta de serviço · '+time;
   $('tsQueueAccept').disabled=$('tsQueueDecline').disabled=replying||time==='00:00';
   const inlineTime=$('tsQueueInlineTime');
   if(inlineTime)inlineTime.textContent=time;
   for(const button of inlineOffer.querySelectorAll('[data-inline-offer-reply]'))button.disabled=replying||time==='00:00';
  }
  for(const node of document.querySelectorAll('[data-queue-deadline]')){
   node.textContent=minLeft(node.dataset.queueDeadline,adminClock);
  }
 }
 function sessionChanged(){
  serial++;
  dispatchRequest=null;
  adminRefreshPending=false;driverRefreshPending=false;
  adminData=null;adminStamp='';adminIssue='';editing=null;offered=null;seen=null;releasing=null;
  cancellable.clear();offerBar.classList.add('hidden');offerBody.replaceChildren();
  refreshOfferSummary();
  for(const dialog of [offerDialog,rosterDialog,releaseDialog])if(dialog.open)dialog.close();
 }
 function bookingState(id){return adminData?.jobs.find(job=>job.booking_id===id)}
 function displayAdmin(){
  for(const node of $('adminBookings').querySelectorAll('[data-queue-booking]')){
   const job=bookingState(node.dataset.queueBooking);
   node.hidden=!job;
   if(!job){node.replaceChildren();continue}
   const live=job.offers.find(a=>a.state==='open');
   const attemptsOpen=node.querySelector('details')?.open;
   const attempts=job.offers.map(a=>'<li>'+esc(name(a.driver_id))+' · '+esc(outcome[a.state]||a.state)+
    (a.released_at?' · Devolveu o serviço':'')+'</li>').join('');
   node.innerHTML='<strong>'+esc(stateLabel[job.state]||job.state)+'</strong>'+
    (live?'<p>'+esc(name(live.driver_id))+' · <span data-queue-deadline="'+esc(live.expires_at)+'"></span> para responder</p>':'')+
    (job.reason?'<p>'+esc(reasonLabel[job.reason]||'')+'</p>':'')+
    (attempts?'<details'+(attemptsOpen?' open':'')+'><summary>Tentativas ('+job.offers.length+')</summary><ul>'+attempts+'</ul></details>':'')+
    (['waiting','offered'].includes(job.state)?'<button type="button" class="back" data-queue-override="'+esc(job.booking_id)+'">Assumir designação manual</button>':'');
   const picker=node.closest('.ts-booking')?.querySelector('.ts-assign-select');
   if(picker){
    const excluded=job.state==='fallback'&&job.reason==='exhausted'?new Set(adminData.queue.map(d=>d.driver_id)):new Set();
    for(const option of picker.options)option.disabled=excluded.has(option.value);
    if(picker.selectedOptions[0]?.disabled)picker.value='';
   }
  }
  tickClocks();
 }
 async function syncAdmin(force=false){
  if(!adminActive()||(!force&&document.hidden))return;
  if(loadingAdmin){adminRefreshPending=true;return}
  const uid=runtime.session.user.id;const cycle=serial;loadingAdmin=true;
  try{
   const result=await rpc('ts_dispatch_queue_admin',{p_booking_ids:runtime.admin.rows.map(row=>row.id)});
   if(uid!==runtime.session?.user?.id||cycle!==serial||!runtime.admin.allowed)return;
   if(!Array.isArray(result?.queue)||!Array.isArray(result?.drivers)||!Array.isArray(result?.jobs))throw Error('O servidor não retornou a fila.');
   adminClock=Date.parse(result.time)-Date.now();
   const nextStamp=JSON.stringify([result.jobs,result.queue,result.drivers]);
   adminData=result;
   adminIssue='';$('tsQueueAdminHint').textContent=result.queue.length+' motorista(s) na fila de prioridade.';
   if(nextStamp!==adminStamp){adminStamp=nextStamp;displayAdmin()}
  }catch(err){
   if(cycle===serial&&uid===runtime.session?.user?.id){
    adminIssue=messageError(err);
    $('tsQueueAdminHint').textContent='Fila indisponível. '+adminIssue;
   }
  }finally{
   loadingAdmin=false;
   if(adminRefreshPending){adminRefreshPending=false;void syncAdmin()}
  }
 }
 function renderAdminRows(){
  displayAdmin();
  if(!adminData&&adminActive())void syncAdmin(true);
 }
 function drawRoster(){
  const selected=new Set(editing.ids);
  const add=$('tsQueuePick');
  add.replaceChildren(new Option('Selecione um motorista',''),...adminData.drivers.filter(d=>!selected.has(d.driver_id))
   .map(d=>new Option(d.full_name||'Motorista',d.driver_id)));
  $('tsQueueAdd').disabled=add.options.length===1||!add.value;
  $('tsQueueOrder').innerHTML=editing.ids.map((id,index)=>{
   const misses=adminData.queue.find(d=>d.driver_id===id)?.misses||0;
   const label=esc(name(id));
   return '<li><span><b>'+label+'</b><small>'+misses+' de 3 recusas ou prazos vencidos</small></span><div class="ts-queue-move">'+
    '<button type="button" class="back" data-queue-move="-1" data-queue-index="'+index+'" aria-label="Subir '+label+'" '+(index===0?'disabled':'')+'>↑</button>'+
    '<button type="button" class="back" data-queue-move="1" data-queue-index="'+index+'" aria-label="Descer '+label+'" '+(index===editing.ids.length-1?'disabled':'')+'>↓</button>'+
    '<button type="button" class="back" data-queue-remove="'+index+'" aria-label="Remover '+label+'">×</button></div></li>';
  }).join('');
  $('tsQueueEmpty').hidden=editing.ids.length>0;
 }
 async function showRoster(){
  await syncAdmin(true);
  if(!adminActive()||!adminData){
   if(adminActive())notify('Fila indisponível',adminIssue||'Aguarde a atualização da fila.');
   return;
  }
  const original=adminData.queue.map(d=>d.driver_id);
  editing={original,ids:[...original],uid:runtime.session.user.id};
  $('tsQueueRosterError').textContent='';
  drawRoster();rosterDialog.showModal();
 }
 $('tsQueueAdminOpen').onclick=()=>void showRoster();
 $('tsQueueRosterClose').onclick=()=>rosterDialog.close();
 $('tsQueuePick').onchange=e=>{$('tsQueueAdd').disabled=!e.target.value};
 $('tsQueueAdd').onclick=()=>{if(!editing||!$('tsQueuePick').value)return;editing.ids.push($('tsQueuePick').value);drawRoster()};
 $('tsQueueOrder').onclick=e=>{
  if(!editing)return;
  const move=e.target.closest('[data-queue-move]'), remove=e.target.closest('[data-queue-remove]');
  if(move){
   const from=Number(move.dataset.queueIndex), to=from+Number(move.dataset.queueMove);
   [editing.ids[from],editing.ids[to]]=[editing.ids[to],editing.ids[from]];
  }else if(remove)editing.ids.splice(Number(remove.dataset.queueRemove),1);else return;
  drawRoster();
 };
 $('tsQueueRosterForm').onsubmit=async e=>{
  e.preventDefault();
  const data=editing, button=$('tsQueueSave');
  if(!data||button.disabled||data.uid!==runtime.session?.user?.id)return;
  button.disabled=true;
  $('tsQueueRosterError').textContent='';
  try{
   await rpc('ts_dispatch_queue_set',{p_driver_ids:data.ids,p_expected:data.original});
   if(editing!==data||runtime.session?.user?.id!==data.uid)return;
   rosterDialog.close();await syncAdmin(true);
  }catch(err){if(editing===data)$('tsQueueRosterError').textContent=messageError(err)}
  finally{button.disabled=false}
 };
 $('adminBookings').addEventListener('click',async event=>{
  const action=event.target.closest('[data-queue-override]');
  if(!action||!adminActive())return;
  action.disabled=true;
  try{
   await rpc('ts_dispatch_queue_manual',{p_booking_id:action.dataset.queueOverride,p_driver_id:null,p_assign:false});
   await syncAdmin(true);
  }catch(err){notify('Não foi possível retirar a oferta',messageError(err))}
  finally{action.disabled=false}
 });
 async function assign(id,driver){
  if(!bookingState(id))return false;
  await rpc('ts_dispatch_queue_manual',{p_booking_id:id,p_driver_id:driver,p_assign:true});
  void syncAdmin(true);
  return true;
 }
 function offerDetails(b){
  const fields=[['Serviço',b.service_type==='transfer'?'Transfer':b.service_type],
   ['Data e horário',bookingDate(b.pickup_date)+' · '+String(b.pickup_time||'').slice(0,5)],
   ['Passageiros',b.passengers],['Bagagens',b.luggage],['Voo',b.flight_number],['Observações',b.notes],
   ['Nome do contratante',b.client_name],['Telefone',b.client_phone],['E-mail',b.client_email],
   ['Valor total',bookingMoney(b.total_amount)],['Saldo a cobrar',b.balance_amount==null?'A definir':bookingMoney(b.balance_amount)]];
  for(const [i,stop] of runtime.driver.stops(b.stops).entries()){
   if(typeof stop==='object'&&stop?.minutes)fields.push(['Permanência na parada '+(i+1),stop.minutes+' min']);
  }
  return '<p class="soft-note">Reserva #'+short(b.id)+'</p>'+runtime.driver.route(b)+
   '<div class="ts-queue-fields">'+fields.map(([label,value])=>runtime.driver.info(label,value)).join('')+'</div>';
 }
 function refreshOfferSummary(){
  $('driverOfferCount').textContent=offered?'01 oferta':'00 ofertas';
  if(!offered){
   inlineOffer.innerHTML='<p class="driver-empty">Nenhuma oferta disponível no momento.</p>';
   return;
  }
  const expanded=inlineOffer.querySelector('details')?.open;
  const time=minLeft(offered.expires_at,driverClock);
  const timer=`<span class="driver-offer-timer">${icon('clock')} <span id="tsQueueInlineTime">${time}</span></span>`;
  const disabled=replying||time==='00:00'?' disabled':'';
  inlineOffer.innerHTML=`<article class="driver-list-card driver-spotlight">${runtime.driver.spotlight(offered.booking,timer)}
   <div class="driver-offer-actions">
    <button type="button" data-inline-offer-reply="decline"${disabled}>Recusar</button>
    <button type="button" data-inline-offer-reply="accept"${disabled}>Aceitar</button>
   </div>
   <p id="tsQueueInlineError" class="field-error" role="alert"></p>
   <details class="driver-inline-offer-details"${expanded?' open':''}>
    <summary class="driver-details-link">Ver detalhes da reserva ${icon('down')}</summary>
    <div>${offerDetails(offered.booking)}</div>
   </details></article>`;
 }
 function updateDriverPresentation(){
  const inline=runtime.driver.isOffersView();
  if(inline&&offerDialog.open)offerDialog.close();
  offerBar.classList.toggle('hidden',!offered||inline||offerDialog.open);
 }
 function driverOfferView(newOffer){
  const previous=offered;
  offered=newOffer||null;
  if(!offered){
   if(offerDialog.open)offerDialog.close();
   offerBar.classList.add('hidden');seen=null;offerBody.replaceChildren();
   if(previous)refreshOfferSummary();
   return;
  }
  if(!previous||previous.id!==offered.id||JSON.stringify(previous.booking)!==JSON.stringify(offered.booking)){
   if(previous?.id!==offered.id)inlineOffer.replaceChildren();
   offerBody.innerHTML=offerDetails(offered.booking);
   $('tsQueueOfferError').textContent='';
   refreshOfferSummary();
  }
  if(seen!==offered.id){
   seen=offered.id;
   if(!runtime.driver.isOffersView())offerDialog.showModal();
  }
  updateDriverPresentation();
  tickClocks();
 }
 function drawRelease(){
  const {booking:b,trip}=runtime.driver.details();
  const holder=$('tsQueueReleaseAction');
  if(!holder)return;
  if(!driverActive()||!b||!cancellable.has(b.id)||b.booking_status!=='confirmed'||trip?.started_at){
   holder.replaceChildren();return;
  }
  if(holder.firstElementChild?.dataset.booking===String(b.id))return;
  const button=document.createElement('button');
  button.dataset.booking=b.id;
  button.type='button';button.className='back ts-queue-release';button.textContent='Cancelar minha designação';
  button.onclick=()=>{
   releasing={id:b.id,uid:runtime.session.user.id};
   $('tsQueueReleaseText').textContent='A reserva #'+short(b.id)+' será oferecida ao próximo motorista elegível. Você irá para o fim da fila.';
   $('tsQueueReleaseError').textContent='';releaseDialog.showModal();
  };
  holder.replaceChildren(button);
 }
 async function syncDriver(){
  if(replying||releaseBusy||!driverActive()||document.hidden)return;
  if(loadingDriver){driverRefreshPending=true;return}
  const uid=runtime.session.user.id, cycle=serial, read=++driverRead;loadingDriver=true;
  try{
   const result=await rpc('ts_dispatch_queue_driver');
   if(cycle!==serial||read!==driverRead||uid!==runtime.session?.user?.id||!driverActive()||!Array.isArray(result?.cancellable))return;
   driverClock=Date.parse(result.time)-Date.now();
   cancellable=new Set(result.cancellable);
   driverOfferView(result.offer);
   drawRelease();
  }catch{}finally{
   loadingDriver=false;
   if(driverRefreshPending){driverRefreshPending=false;void syncDriver()}
  }
 }
 function minimize(){
  if(replying)return;
  offerDialog.close();
  if(offered)offerBar.classList.remove('hidden');
 }
 $('tsQueueMinimize').onclick=minimize;
 offerDialog.addEventListener('cancel',e=>{e.preventDefault();minimize()});
 offerBar.onclick=()=>{if(offered&&!offerDialog.open){offerDialog.showModal();offerBar.classList.add('hidden')}};
 async function reply(accept){
  if(!offered||replying)return;
  const id=offered.id, cycle=serial;
  replying=true;driverRead++;
  for(const id of ['tsQueueOfferError','tsQueueInlineError'])if($(id))$(id).textContent='';
  tickClocks();
  try{
   const result=await rpc('ts_dispatch_queue_reply',{p_offer_id:id,p_accept:accept});
   if(cycle!==serial||!driverActive())return;
   if(offered?.id===id)driverOfferView(null);
   if(result==='accepted')await runtime.driver.refreshBookings();
   notify(result==='accepted'?'Serviço aceito':result==='declined'?'Oferta recusada':'Oferta encerrada',
    result==='accepted'?'O serviço aparece na sua lista de reservas.':result==='declined'?'A fila seguirá para o próximo motorista elegível.':'Esta oferta já foi resolvida ou o prazo venceu.');
  }catch(err){
   if(cycle===serial&&offered?.id===id){
    for(const field of ['tsQueueOfferError','tsQueueInlineError'])if($(field))$(field).textContent=messageError(err);
   }
  }
  finally{replying=false;tickClocks();void syncDriver()}
 }
 inlineOffer.onclick=event=>{
  const button=event.target.closest('[data-inline-offer-reply]');
  if(button&&!button.disabled)void reply(button.dataset.inlineOfferReply==='accept');
 };
 $('tsQueueAccept').onclick=()=>void reply(true);
 $('tsQueueDecline').onclick=()=>void reply(false);
 $('tsQueueReleaseBack').onclick=()=>{if(!releaseBusy)releaseDialog.close()};
 releaseDialog.addEventListener('cancel',e=>{if(releaseBusy)e.preventDefault()});
 $('tsQueueReleaseConfirm').onclick=async()=>{
  const job=releasing;
  if(releaseBusy||!job||job.uid!==runtime.session?.user?.id||!driverActive())return;
  releaseBusy=true;driverRead++;$('tsQueueReleaseConfirm').disabled=true;$('tsQueueReleaseError').textContent='';
  try{
   await rpc('ts_dispatch_queue_release',{p_booking_id:job.id});
   if(job!==releasing||job.uid!==runtime.session?.user?.id)return;
   cancellable.delete(job.id);releaseDialog.close();await runtime.driver.refreshBookings();
   notify('Designação cancelada','O despacho seguirá para outro motorista ou voltará para a Gestão.');
  }catch(err){if(job===releasing)$('tsQueueReleaseError').textContent=messageError(err)}
  finally{releaseBusy=false;$('tsQueueReleaseConfirm').disabled=false;void syncDriver()}
 };
 setInterval(()=>{
  const uid=runtime.session?.user?.id;
  if(driverActive()&&!runtime.realtime.isReady('driver','realtime:ts:driver:'+uid))void syncDriver();
  if(adminActive()&&!runtime.realtime.isReady('admin','realtime:ts:dispatch:admin'))void syncAdmin();
 },5000);
 setInterval(tickClocks,1000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){void syncDriver();void syncAdmin(true)}});
 async function createBooking(payload,route){
  const signature=JSON.stringify([payload,route]);
  if(dispatchRequest?.signature!==signature)dispatchRequest={signature,id:crypto.randomUUID()};
  const result=await rpc('ts_dispatch_queue_create',{p_request_id:dispatchRequest.id,p_booking:payload,p_route:route});
  if(!result?.id)throw Error('O servidor não retornou o código. Confira a Gestão antes de repetir o despacho.');
  dispatchRequest=null;
  return result;
 }
 return {bookingState,renderAdminRows,syncAdmin,assign,sessionChanged,syncDriver,drawRelease,createBooking,updateDriverPresentation,refreshOfferSummary};
}
