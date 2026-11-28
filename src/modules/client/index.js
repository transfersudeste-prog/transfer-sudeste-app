import {loadPhoneLibrary} from '../../core/services/phone-library.js';
import {interfaceIcon as icon} from '../../shared/components/interface-icons.js';

export function createClient({runtime, $, BASE, KEY, bookingDate, bookingMoney, bookingStops, current, esc,
 inviteToken, messageError, money, openAccountArea, openAuth, req, statusPt}) {
 const pages=['clienteInicio','clienteReservas','clienteHistorico','clienteSobre','clienteContato'];
 const bookingConfirmationPage='clienteAgendamentoConfirmado';
 const bookingReceiptPage='clienteReservaRecente';
 const bookingResultPages=[bookingConfirmationPage,bookingReceiptPage];
 const defaultRules={
  booking_min_advance_hours:24,booking_cancel_min_hours:48,tracking_release_minutes:60,
  booking_max_passengers:7,booking_max_stops:3,passenger_surcharge_threshold:4,
  passenger_surcharge_percentage:30,booking_max_advance_days:null
 };
 const payments={undefined:'Indefinido',cash:'Dinheiro',pix:'PIX',debit_card:'Cartão de débito',credit_card:'Cartão de crédito'};
 const compliments=['Ótimo motorista!','Pontual!','Atendimento excelente!','Prestativo!','Simpático!','Educado!'];
 const form=$('ts315Form'), dialog=$('ts315Dialog'), dialogBody=$('ts315DialogBody');
 const tracking=$('ts315Tracking'), bar=$('ts315TrackingBar');
 let step=0, rules=defaultRules, routeEstimate=null, formVersion=0, formBusy=false;
 let lastCreatedBooking=null;
 let rulesReady=false, rulesRequest=null;
 let exclusive=false, checkedUid=null, checking=null, profile=null, profileRequest=null;
 let contact=null, contactRequest=null, identityVersion=0, confirmInProgress=false;
 const value=id=>$(id).value.trim();
 const write=(id,text)=>$(id).textContent=text;
 const activePage=()=>document.querySelector('.view.active')?.id;
 const statusError=(id,err)=>write(id,missingRoutine(err)?'Esta função ainda não está disponível no ambiente de teste.':messageError(err));
 const firstRow=result=>Array.isArray(result)?result[0]:result;
 const shortId=b=>String(b.id).slice(0,8).toUpperCase();
 const pickup=b=>Date.parse(String(b.pickup_date||'').slice(0,10)+'T'+String(b.pickup_time||'').slice(0,8)+'-03:00');
 const isClient=()=>exclusive&&checkedUid===runtime.session?.user?.id&&!runtime.admin.allowed&&!runtime.driver.role;
 const accessible=()=>!inviteToken&&!runtime.admin.allowed&&!runtime.driver.role&&(!runtime.session||isClient());
 const missingRoutine=err=>/Could not find the function .*schema cache/i.test(messageError(err));
 const paymentOptions=(selected='undefined')=>Object.entries(payments).map(([key,label])=>
  `<option value="${key}"${key===selected?' selected':''}>${label}</option>`).join('');
 const field=(label,text)=>`<div class="summary-line"><b>${esc(label)}</b><div>${esc(text)}</div></div>`;
 const link=(label,href)=>href?`<a class="back" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:'';
 function webUrl(text){
  try{const url=new URL(text);return ['https:','http:'].includes(url.protocol)?url.href:''}catch{return ''}
 }
 async function rpc(name,params={}){
  const uid=runtime.session?.user?.id;
  const s=await current();
  if(!uid||uid!==s?.user?.id)throw Error('Entre na sua conta para continuar.');
  return req('/rest/v1/rpc/'+name,{method:'POST',headers:{Authorization:'Bearer '+s.access_token},body:JSON.stringify(params)});
 }
 function openDialog(title,html,kind){
  dialog.classList.toggle('client-booking-terms',kind==='booking-terms');
  write('ts315DialogTitle',title);
  dialogBody.innerHTML=html;
  if(!dialog.open)dialog.showModal();
  return dialogBody;
 }
 const closeDialog=()=>dialog.close();
 $('ts315Close').onclick=closeDialog;
 function actions(buttons){
  const row=document.createElement('div');
  row.className='ts315-actions';
  for(const [title,callback,style] of buttons){
   const btn=document.createElement('button');btn.type='button';btn.className=style||'back';
   btn.textContent=title;btn.onclick=()=>callback(btn);row.append(btn);
  }
  dialogBody.append(row);
 }
 function applyNav(){
  if(!accessible())return false;
  for(const button of document.querySelectorAll('.nav button[data-page]')){
   const page=button.dataset.page;
   button.classList.toggle('hidden',!pages.includes(page)||(page===pages[3]&&!isClient()));
  }
  if(['home','reservas','contato'].includes(activePage())){
   window.tsNavigate(({home:pages[0],reservas:pages[1],contato:pages[4]})[activePage()]);
  }
  return true;
 }
 async function checkRole(){
  const uid=runtime.session?.user?.id;
  if(!uid||inviteToken||runtime.admin.allowed||runtime.driver.role)return false;
  if(checkedUid===uid)return exclusive;
  if(checking?.uid===uid)return checking.promise;
  const version=identityVersion;
  const promise=(async()=>{
   try{
    const eligible=await rpc('ts_is_exclusive_client_account');
    if(identityVersion!==version||uid!==runtime.session?.user?.id||runtime.admin.allowed||runtime.driver.role)return false;
    exclusive=eligible===true;checkedUid=exclusive?uid:null;
    if(exclusive){
     applyNav();
     if(step===4&&value('ts315For')==='self')renderPassenger();
     void loadRules().catch(()=>{});
     scheduleLivePrice();
     void refreshBookings();
     void current().then(connectBookings);
    }
    return exclusive;
   }catch(e){console.warn('Consulta do perfil Cliente:',messageError(e));return false}
   finally{if(checking?.promise===promise)checking=null}
  })();
  checking={uid,promise};
  return promise;
 }
 function sessionChanged(previous,next){
  if(previous===next)return;
  ++identityVersion;
  resetLivePrice();
  checkedUid=null;exclusive=false;checking=null;profile=null;profileRequest=null;
  contact=null;contactRequest=null;rules=defaultRules;rulesReady=false;rulesRequest=null;
  resetReservations();
  lastCreatedBooking=null;
  for(const id of ['clientBookingConfirmation','clientRecentReservation'])$(id).replaceChildren();
  $('ts315OwnerTools').classList.add('hidden');
  $('ts315AboutTools').classList.add('hidden');
  closeDialog();
  for(const id of ['ts315About','ts315Contact','ts315ContactPix','clientContactShare'])write(id,'');
  // A pessoa pode entrar para continuar o formulário iniciado como visitante.
  if(previous)resetForm();
 }
 function loadRules(){
  if(rulesRequest)return rulesRequest;
  const seq=identityVersion;
  const request=rpc('ts_get_booking_settings').then(result=>{
   const data=firstRow(result);
   if(seq!==identityVersion||!isClient())return null;
   if(!data||!Object.keys(defaultRules).every(key=>key==='booking_max_advance_days'||Object.hasOwn(data,key))){
    throw Error('Não foi possível consultar os parâmetros de agendamento.');
   }
   rules={booking_max_advance_days:null,...data};rulesReady=true;
   $('ts315Passengers').max=rules.booking_max_passengers;
   refreshStopButtons();
   renderTracking();
   scheduleLivePrice();
   return rules;
  }).finally(()=>{if(rulesRequest===request)rulesRequest=null});
  rulesRequest=request;
  return request;
 }
 async function loadProfile(force=false){
  if(profile&&!force)return profile;
  if(profileRequest)return profileRequest;
  const seq=identityVersion;
  const request=rpc('ts_profile_read_mine').then(result=>{
   if(seq===identityVersion)profile=firstRow(result)||{};
   return seq===identityVersion?profile:null;
  }).finally(()=>{if(profileRequest===request)profileRequest=null});
  profileRequest=request;
  return request;
 }
 const oldNavigate=window.tsNavigate;
 window.tsNavigate=id=>{
  if(!runtime.admin.allowed&&['administracao','financeiro'].includes(id))return;
  if(id===pages[3]&&!isClient())return;
  if(accessible())id=({home:pages[0],reservas:pages[1],contato:pages[4]})[id]||id;
  else if(runtime.session&&!runtime.admin.allowed&&!runtime.driver.role&&['home','reservas','contato'].includes(id)){
   openAccountArea(null);return;
  }
  if(bookingResultPages.includes(id)){
   if(!isClient())return;
   if(!lastCreatedBooking){window.tsNavigate(pages[0]);return}
  }else if(!pages.includes(id)){
   oldNavigate(id);return;
  }
  if(!accessible()){
   if(id===pages[0]&&runtime.session&&!runtime.admin.allowed&&!runtime.driver.role&&!inviteToken)void checkRole().then(ok=>{if(ok)window.tsNavigate(id)});
   return;
  }
  window.tsBaseNavigate(id);
  if(id===pages[0]){
   if(step===4&&value('ts315For')==='self')renderPassenger();
   scheduleLivePrice();
  }
  if(id===pages[1]||id===pages[2]){
   renderBookings();
   if(isClient())void refreshBookings();
  }
  if(id===bookingConfirmationPage||id===bookingReceiptPage){
   if(id===bookingReceiptPage){
    renderRecentReservation(bookings.find(row=>row.id===lastCreatedBooking.id)||lastCreatedBooking);
    void refreshBookings();
   }
   $(id).querySelector('h1')?.focus({preventScroll:true});
  }
  if(id===pages[3])void renderAbout();
  if(id===pages[4]){void renderContact();void renderContactPix()}
 };
 function withClient(action){
  if(isClient())return action();
  if(runtime.session){
   return checkRole().then(ok=>{
    if(ok&&isClient())return action();
    openDialog('Acesso ao perfil Cliente','<p>Esta função está disponível para contas ativas do perfil Cliente.</p>');
   });
  }
  closeDialog();
  openAuth(async()=>{if(await checkRole()){window.tsNavigate(pages[0]);return action()}});
 }
 function init(){
  for(const el of document.querySelectorAll('[data-interface-icon]'))el.innerHTML=icon(el.dataset.interfaceIcon);
  for(const button of document.querySelectorAll('[data-client-page]'))button.onclick=()=>window.tsNavigate(button.dataset.clientPage);
  $('clientOpenRecentReservation').onclick=()=>{
   if(!isClient()||!lastCreatedBooking)return;
   reservationPeriod=scheduledDate(lastCreatedBooking)>today()?'future':'today';
   window.tsNavigate(bookingReceiptPage);
  };
  $('ts315PreferredPayment').innerHTML=paymentOptions('pix');
  initWizardViewport();
  showStep(0);
  if(!runtime.session&&!inviteToken){applyNav();window.tsNavigate(pages[0])}
  initReservations();
  initCompany();
 }

 // Funções de agendamento, reservas e empresa definidas abaixo.

 let phoneLibrary, regions;
 const flag=code=>String.fromCodePoint(...[...code].map(c=>127397+c.charCodeAt(0)));
 async function preparePhone(){
  if(phoneLibrary)return phoneLibrary;
  const library=await loadPhoneLibrary();
  if(!phoneLibrary){
   const names=new Intl.DisplayNames(['pt-BR'],{type:'region'});
   const otherTerritories=['AQ','TF','BV','HM','PN','GS','UM'];
   regions=[...library.getCountries(),...otherTerritories].map(code=>({
    code,ddi:library.isSupportedCountry(code)?library.getCountryCallingCode(code):null,name:names.of(code)
   })).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
   phoneLibrary=library;
  }
  return phoneLibrary;
 }
 function phoneField(id,stored=''){
  const host=document.createElement('div');
  host.className='ts315-phone';
  host.innerHTML=`<label for="${id}">Telefone *</label>
   <div class="client-phone-controls">
    <button type="button" class="back client-ddi-button" aria-haspopup="dialog"></button>
    <input type="hidden" id="${id}Country">
    <input id="${id}" type="tel" autocomplete="tel-national" inputmode="tel" maxlength="30" required>
   </div>
   <dialog class="client-ddi-dialog" aria-labelledby="${id}DdiTitle">
    <h2 id="${id}DdiTitle">País ou território (DDI)</h2>
    <input type="search" aria-label="Buscar país ou território" placeholder="Buscar nome ou código" autocomplete="off">
    <div class="client-ddi-list"></div>
    <button type="button" class="back client-ddi-close">Fechar</button>
   </dialog>`;
  const search=host.querySelector('[type=search]'),country=host.querySelector('[type=hidden]'),input=host.querySelector('[type=tel]');
  const button=host.querySelector('.client-ddi-button'),picker=host.querySelector('dialog'),list=host.querySelector('.client-ddi-list');
  const parsed=phoneLibrary.parsePhoneNumberFromString(String(stored||''),'BR');
  const normalize=text=>text.normalize('NFD').replace(/\p{Diacritic}/gu,'').trim().toLowerCase();
  const preferred=['BR','US','GB','PT','AR'];
  const ordered=[...preferred.map(code=>regions.find(r=>r.code===code)),...regions.filter(r=>!preferred.includes(r.code))].filter(Boolean);
  function setCountry(code){
   const region=regions.find(r=>r.code===code&&r.ddi);
   if(!region)return;
   country.value=region.code;
   button.innerHTML='+'+region.ddi+' '+icon('down');
   button.setAttribute('aria-label','País ou território (DDI): '+region.name+' (+'+region.ddi+')');
   input.placeholder=code==='BR'?'(21) 99999-9999':'Número com código de área';
  }
  function options(){
   const query=normalize(search.value);
   const matches=ordered.filter(r=>[r.name,r.code,r.ddi?'+'+r.ddi:''].some(text=>normalize(text).includes(query)));
   list.innerHTML=matches.map(r=>`<button type="button" data-ddi="${r.code}"${r.ddi?'':' disabled'}>
    <span aria-hidden="true">${flag(r.code)}</span> ${esc(r.name)} (${r.ddi?'+'+r.ddi:'use a região do número'})
   </button>`).join('')||'<p class="soft-note" role="status">Nenhum país ou território encontrado.</p>';
   list.scrollTop=0;
  }
  function format(){
   input.value=new phoneLibrary.AsYouType(country.value).input(input.value);
  }
  button.onclick=()=>{search.value='';options();picker.showModal()};
  host.querySelector('.client-ddi-close').onclick=()=>picker.close();
  search.oninput=options;
  search.onkeydown=event=>{if(event.key==='Enter')event.preventDefault()};
  list.onclick=event=>{
   const choice=event.target.closest('[data-ddi]');
   if(!choice)return;
   setCountry(choice.dataset.ddi);format();picker.close();input.focus();
  };
  input.oninput=()=>{
   if(input.value.startsWith('+')){
    const international=phoneLibrary.parsePhoneNumberFromString(input.value);
    if(international?.country&&international.isValid()){
     setCountry(international.country);input.value=international.nationalNumber;
    }
   }
   format();
  };
  setCountry(parsed?.country||'BR');input.value=parsed?.nationalNumber||stored||'';format();
  return host;
 }
 function readPhone(id){
  const input=$(id),country=$(id+'Country').value;
  const number=phoneLibrary.parsePhoneNumberFromString(input.value,{defaultCountry:country,extract:false});
  if(!number?.isValid()||number.country!==country){
   input.focus();
   throw Error(country==='BR'?'Informe um telefone válido com DDD.':'Informe um telefone válido para o país ou território selecionado.');
  }
  return number.number;
 }
 const wizardScreens=[
  [1,'Serviço','Agendar serviço','Avançar'],
  [2,'Trajeto · 1/4','Seu trajeto','Avançar'],
  [2,'Embarque · 2/4','Detalhes do embarque','Avançar'],
  [2,'Pagamento · 3/4','Pagamento','Avançar'],
  [2,'Passageiro · 4/4','Dados do passageiro','Revisar'],
  [3,'Revisão · 1/2','Revise seu agendamento','Continuar'],
  [3,'Revisão · 2/2','Confirme sua reserva','Confirmar reserva']
 ];
 let reviewReturn=null;
 const detailsActive=()=>step>=1&&step<=4;
 function syncTripDateTime(){
  const date=$('ts315Date'), time=$('ts315Time');
  date.parentElement.firstElementChild.textContent=date.value?date.value.split('-').reverse().join('/'):'DD/MM/AAAA';
  time.parentElement.firstElementChild.textContent=time.value?time.value.slice(0,5):'HH:MM';
 }
 function initWizardViewport(){
  const viewport=window.visualViewport;
  if(!viewport)return;
  const root=document.documentElement;
  let frame=0;
  function keepFieldVisible(){
   frame=0;
   const field=document.activeElement;
   const editing=field?.matches('input:not([type=hidden],[type=radio],[type=checkbox]),textarea,select')&&
    (form.contains(field)||dialog.contains(field));
   const inset=Math.max(0,root.clientHeight-viewport.height);
   const keyboard=editing&&inset>90;
   root.classList.toggle('client-keyboard-open',keyboard);
   if(!keyboard)return;
   root.style.setProperty('--client-keyboard-inset',inset+'px');
   root.style.setProperty('--client-viewport-height',viewport.height+'px');
   root.style.setProperty('--client-viewport-top',viewport.offsetTop+'px');
   if(field.closest('dialog'))return;
   const rect=field.getBoundingClientRect();
   const top=Math.min(field.labels?.[0]?.getBoundingClientRect().top ?? rect.top,rect.top);
   const bottom=viewport.offsetTop+viewport.height-66;
   const visualTop=viewport.offsetTop+12;
   const delta=rect.bottom>bottom?rect.bottom-bottom:top<visualTop?top-visualTop:0;
   if(Math.abs(delta)>1)window.scrollBy({top:delta,behavior:'instant'});
  }
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(keepFieldVisible)};
  viewport.addEventListener('resize',schedule);
  viewport.addEventListener('scroll',schedule);
  document.addEventListener('focusin',schedule);
  document.addEventListener('focusout',schedule);
 }
 function syncWizardButtons(){
  $('ts315Next').disabled=formBusy||(step===6&&!$('ts315Accept').checked);
  $('ts315Back').disabled=formBusy;
 }
 function showStep(next){
  const changed=step!==next;
  if(changed)++formVersion;
  step=next;
  form.dataset.screen=String(next);
  const [stage,context,title,action]=wizardScreens[next];
  form.querySelectorAll('[data-client-step]').forEach(el=>el.classList.toggle('active',Number(el.dataset.clientStep)===next));
  $('ts315Progress').querySelectorAll('i').forEach((el,i)=>el.classList.toggle('done',i<stage));
  write('ts315StepCount',`Etapa ${stage} de 3`);
  write('ts315StepContext',context);
  write('ts315StepName',title);
  write('ts315Next',action);
  $('ts315Back').classList.toggle('hidden',next===0);
  write('ts315FormError','');
  if(next===1)$('ts315Date').min=today();
  if(next===1)syncTripDateTime();
  if(next===4&&(!$('ts315Passenger').hasChildNodes()||value('ts315For')==='self'))renderPassenger();
  if(next===2||next===3)scheduleLivePrice();
  syncWizardButtons();
  if(changed&&activePage()===pages[0]){
   $('ts315StepName').focus({preventScroll:true});
   window.scrollTo({top:0,behavior:'instant'});
  }
 }
 function resetForm(){
  form.reset();
  ++formVersion;routeEstimate=null;reviewReturn=null;
  resetLivePrice();
  $('ts315Stops').replaceChildren();
  $('ts315Passenger').replaceChildren();
  $('ts315Summary').replaceChildren();
  $('ts315Confirmation').replaceChildren();
  $('ts315Passengers').max=rules.booking_max_passengers;
  refreshStopButtons();
  showStep(0);
 }
 function refreshStopButtons(){
  $('ts315AddStop').hidden=$('ts315Stops').childElementCount>=Number(rules.booking_max_stops);
  $('ts315Stops').querySelectorAll('.ts315-stop').forEach((el,i)=>{el.querySelector('[data-stop-label]').textContent='Parada '+(i+1)});
 }
 let nextStopId=0;
 function addStop(address='',minutes=''){
  if($('ts315Stops').childElementCount>=Number(rules.booking_max_stops))return;
  const num=++nextStopId, row=document.createElement('div');
  row.className='ts315-stop';
  row.innerHTML=`<label data-stop-label for="ts315StopAddress${num}"></label>
   <div class="client-wizard-stop-line">
    <input id="ts315StopAddress${num}" data-stop-address placeholder="Endereço da parada" required>
    <button type="button" class="client-text-button" aria-label="Remover parada">${icon('close')}</button>
   </div>
   <div data-stop-duration${address?'':' class="hidden"'}>
    <label for="ts315StopMinutes${num}">Minutos de parada *</label>
    <input id="ts315StopMinutes${num}" data-stop-minutes type="number" min="1" step="1" required>
   </div>`;
  const addressField=row.querySelector('[data-stop-address]');
  addressField.value=address;
  addressField.addEventListener('input',()=>row.querySelector('[data-stop-duration]').classList.toggle('hidden',!addressField.value.trim()));
  row.querySelector('[data-stop-minutes]').value=minutes;
  row.querySelector('button').onclick=()=>{row.remove();++formVersion;refreshStopButtons();scheduleLivePrice()};
  $('ts315Stops').append(row);
  ++formVersion;
  refreshStopButtons();scheduleLivePrice();
 }
 function renderPassenger(storedPhone=''){
  const host=$('ts315Passenger');
  if(value('ts315For')==='other'){
   host.innerHTML='<label for="ts315PassengerName">Nome do passageiro *</label><input id="ts315PassengerName" autocomplete="off" required><div id="ts315PhoneHost"></div><label for="ts315PassengerEmail">E-mail do passageiro (opcional)</label><input id="ts315PassengerEmail" type="email" autocomplete="off">';
   const phoneHost=$('ts315PhoneHost');
   phoneHost.textContent='Carregando países e territórios…';
   void preparePhone().then(()=>{
    if(phoneHost.isConnected)phoneHost.replaceChildren(phoneField('ts315PassengerPhone',storedPhone));
   }).catch(()=>{
    if(phoneHost.isConnected)phoneHost.textContent='Não foi possível carregar o telefone. Selecione o tipo de passageiro novamente.';
   });
   return;
  }
  if(!isClient()){host.innerHTML='<p class="soft-note">Entre para usar os dados da sua conta.</p>';return}
  host.innerHTML='<p class="soft-note">Carregando seus dados…</p>';
  const seq=identityVersion;
  loadProfile(true).then(p=>{
   if(seq!==identityVersion||!p||value('ts315For')!=='self')return;
   const missing=!p.full_name||!p.phone;
   host.innerHTML=`<section class="client-wizard-box client-passenger-summary"><h2>Passageiro</h2>
    ${wizardRow('Nome',p.full_name||'Nome pendente')}${wizardRow('Telefone',p.phone||'Telefone pendente')}
    ${missing?'<button class="back" type="button" id="ts315OpenAccount">Editar dados em Minha conta</button>':''}</section>`;
   if(missing)$('ts315OpenAccount').onclick=()=>openAuth();
  }).catch(err=>{if(seq===identityVersion&&value('ts315For')==='self')host.textContent=messageError(err)});
 }
 function readItinerary(){
  return {
   origin:value('ts315Origin'),destination:value('ts315Destination'),
   stops:[...$('ts315Stops').children].map(row=>({
    address:row.querySelector('[data-stop-address]').value.trim(),
    minutes:Number(row.querySelector('[data-stop-minutes]').value)
   })),
   passengers:Number(value('ts315Passengers'))
  };
 }
 function validateFields(screen){
  const fields=form.querySelectorAll(`[data-client-step="${screen}"] input:required,[data-client-step="${screen}"] input[type=email]`);
  const invalid=[...fields].find(field=>!field.validity.valid);
  if(invalid){
   if(step!==screen)showStep(screen);
   invalid.reportValidity();
   throw Error('Confira os campos destacados para continuar.');
  }
 }
 function readDetails(){
  for(const screen of [1,2,4])validateFields(screen);
  const data={
   ...readItinerary(),
   service_type:'transfer',pickup_date:value('ts315Date'),pickup_time:value('ts315Time'),
   luggage:Number(value('ts315Luggage')),
   flight_number:value('ts315Flight')||null,notes:value('ts315Notes')||null,
   preferred_payment_method:value('ts315PreferredPayment'),booking_for_other_person:value('ts315For')==='other'
  };
  if(!data.origin||!data.destination||data.stops.some(st=>!st.address))throw Error('Preencha o endereço de origem, o destino e os endereços das paradas.');
  if(data.stops.length>Number(rules.booking_max_stops))throw Error(`Informe até ${rules.booking_max_stops} paradas.`);
  if(!Number.isFinite(pickup(data)))throw Error('Informe data e horário válidos.');
  return data;
 }
 async function passenger(data){
  const [p]=await Promise.all([loadProfile(true),preparePhone()]);
  const ownName=String(p?.full_name||'').trim();
  const ownPhone=phoneLibrary.parsePhoneNumberFromString(String(p?.phone||''),{defaultCountry:'BR',extract:false});
  if(!ownName||!ownPhone?.isValid()){
   openDialog('Complete seu perfil','<p>Preencha seu nome e telefone em Minha conta para agendar.</p>');
   actions([['Minha conta',()=>{closeDialog();openAuth()},'primary']]);
   return null;
  }
  if(!data.booking_for_other_person)return {passenger_name:ownName,passenger_phone:ownPhone.number,passenger_email:p.email||runtime.session?.user?.email||null};
  const name=value('ts315PassengerName');
  if(!name){$('ts315PassengerName').focus();throw Error('Informe o nome do passageiro.')}
  if(!$('ts315PassengerPhone'))throw Error('Aguarde o carregamento do telefone.');
  return {passenger_name:name,passenger_phone:readPhone('ts315PassengerPhone'),passenger_email:value('ts315PassengerEmail')||null};
 }
 function looksLikeAirport(address){
  const norm=address.normalize('NFD').replace(/\p{Diacritic}/gu,'');
  return /\b(aeroporto|airport|aerodromo|GIG|SDU|GRU|CGH|VCP|CNF|BSB|RRJ)\b/i.test(norm);
 }
 let priceTimer, priceVersion=0, quoted=null, routed=null;
 function resetLivePrice(){
  clearTimeout(priceTimer);++priceVersion;
  quoted=null;routed=null;
  for(const id of ['ts315LivePrice','ts315PaymentPrice'])write(id,'');
 }
 function routeForItinerary(addresses){
  const key=JSON.stringify(addresses), generation=identityVersion;
  if(routed?.key===key)return routed.promise;
  const promise=(async()=>{
   const {geocode,roadDistance,gig}=window.tsRouteServices;
   const coords=[];
   for(const address of addresses){
    coords.push(await geocode(address));
    if(generation!==identityVersion||routed?.key!==key)return null;
   }
   const start=coords[0],end=coords.at(-1);
   if(!start.municipality||!start.state||!end.municipality||!end.state)throw Error('Informe cidade e estado nos endereços de origem e destino.');
   const distance=await roadDistance(coords);
   if(!Number.isFinite(distance)||distance<=0||distance>2000)throw Error('Não foi possível calcular a rota para esses endereços.');
   return {
    originAirport:start.airport||looksLikeAirport(addresses[0]),
    route:{
     distance_km:distance,origin_municipality:start.municipality,destination_municipality:end.municipality,
     origin_state:start.state,destination_state:end.state,is_gig:gig(addresses.at(-1))
    }
   };
  })().catch(err=>{if(routed?.promise===promise)routed=null;throw err});
  routed={key,promise};
  return promise;
 }
 function routeAndQuote(data){
  const addresses=[data.origin,...data.stops.map(st=>st.address),data.destination];
  const minutes=data.stops.reduce((m,st)=>m+st.minutes,0);
  const key=JSON.stringify([addresses,minutes,data.passengers]), generation=identityVersion;
  if(quoted?.key===key&&Date.now()-quoted.createdAt<60000)return quoted.promise;
  const promise=(async()=>{
   const itinerary=await routeForItinerary(addresses);
   if(!itinerary||generation!==identityVersion||quoted?.key!==key)return null;
   const quote=firstRow(await rpc('ts_calculate_transfer_quote',{
    ...Object.fromEntries(Object.entries(itinerary.route).map(([k,v])=>['p_'+k,v])),
    p_stop_minutes:minutes,p_passengers:data.passengers
   }));
   const total=Number(quote?.total_amount);
   if(quote?.requires_quote||quote?.requires_custom_quote||!Number.isFinite(total)||total<=0)throw Error('Não foi possível calcular um valor para este trajeto. Fale com a equipe pelo menu Contato.');
   return {...itinerary,total};
  })().catch(err=>{if(quoted?.promise===promise)quoted=null;throw err});
  quoted={key,promise,createdAt:Date.now()};
  return promise;
 }
 function wizardPrice(label,total){
  return `<div class="client-wizard-price"><span>${label}</span><strong>${esc(bookingMoney(total))}</strong></div>`;
 }
 function scheduleLivePrice(){
  clearTimeout(priceTimer);
  const seq=++priceVersion;
  if(!detailsActive()||activePage()!==pages[0])return;
  const data=readItinerary();
  const render=html=>{
   for(const id of ['ts315LivePrice','ts315PaymentPrice'])$(id).innerHTML=html;
  };
  if(!data.origin||!data.destination||!Number.isInteger(data.passengers)||data.passengers<1||
    data.passengers>Number(rules.booking_max_passengers)||
    data.stops.some(st=>!st.address||!Number.isInteger(st.minutes)||st.minutes<=0)){
   render('');return;
  }
  if(!isClient()){
   render('<p class="soft-note">Entre na sua conta para consultar o valor do serviço.</p>');
   return;
  }
  render('<p class="soft-note">Calculando valor do serviço…</p>');
  priceTimer=setTimeout(async()=>{
   try{
    const estimate=await routeAndQuote(data);
    if(seq!==priceVersion||!estimate||!detailsActive())return;
    render(wizardPrice('Valor do serviço',estimate.total));
   }catch(err){
    if(seq===priceVersion&&detailsActive())render(`<p class="soft-note">${esc(messageError(err))}</p>`);
   }
  },900);
 }
 function wizardRow(label,value){
  return `<div class="client-wizard-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
 }
 function reviewSection(title,screen,content){
  return `<section class="client-wizard-box client-review-box">
   <div class="client-review-heading"><h2>${title}</h2>
    <button type="button" class="client-text-button" data-wizard-edit="${screen}" aria-label="Editar ${title}">Editar ${icon('edit')}</button>
   </div>${content}</section>`;
 }
 function showReview(data,estimate){
  const target=reviewReturn||5;
  reviewReturn=null;routeEstimate={...estimate,data};
  $('ts315Accept').checked=false;
  const route=[
   ['Origem',data.origin,'origin'],
   ...data.stops.map((st,i)=>['Parada '+(i+1),st.address+' · '+st.minutes+' min','']),
   ['Destino',data.destination,'destination']
  ];
  const itinerary=wizardRow('Data',bookingDate(data.pickup_date))+wizardRow('Horário',data.pickup_time)+
   `<div class="client-review-route">${route.map(([label,text,kind])=>
    `<div><span class="client-point-label ${kind}">${label}</span><strong>${esc(text)}</strong></div>`).join('')}</div>`+
    wizardRow('Distância',estimate.route.distance_km.toLocaleString('pt-BR',{maximumFractionDigits:1})+' km');
  $('ts315Summary').innerHTML=reviewSection('Transfer',1,itinerary)+reviewSection('Embarque',2,
   wizardRow('Passageiros',data.passengers)+wizardRow('Bagagens',data.luggage)+wizardRow('Voo',data.flight_number||'Não informado')+
   wizardRow('Observações',data.notes||'Nenhuma'));
  $('ts315Confirmation').innerHTML=reviewSection('Passageiro',4,
   wizardRow('Nome',data.passenger_name)+wizardRow('Telefone',data.passenger_phone)+
   (data.booking_for_other_person&&data.passenger_email?wizardRow('E-mail',data.passenger_email):''))+
   reviewSection('Pagamento',3,wizardRow('Forma de pagamento',payments[data.preferred_payment_method]))+
   wizardPrice('Valor total',estimate.total);
  showStep(target);
 }
 async function detailsNext(){
  if(!rulesReady&&!await loadRules())return;
  const data=readDetails();
  if(pickup(data)-Date.now()<Number(rules.booking_min_advance_hours)*3600000){
   return supportDialog('Agendamento com pouca antecedência',
    `Para serviços com menos de ${rules.booking_min_advance_hours} horas de antecedência, fale com nossa equipe ou altere a data e o horário.`,
    null,[['Alterar data',()=>{closeDialog();showStep(1);$('ts315Date').focus()}]]);
  }
  if(rules.booking_max_advance_days!=null&&pickup(data)-Date.now()>Number(rules.booking_max_advance_days)*86400000)throw Error(`Agende com até ${rules.booking_max_advance_days} dias de antecedência.`);
  const seq=formVersion;
  write('ts315FormError','Calculando rota e valor…');
  try{
   const person=await passenger(data);
   if(!person||seq!==formVersion){if(seq===formVersion)write('ts315FormError','');return}
   Object.assign(data,person);
   const estimate=await routeAndQuote(data);
   if(!estimate||!detailsActive()||seq!==formVersion)return;
   if(estimate.originAirport&&!data.flight_number){
    write('ts315FormError','');
    openDialog('Número do voo','<p>Deseja avançar sem informar o número do voo?</p>');
    actions([['Não',()=>{closeDialog();showStep(2);$('ts315Flight').focus()}],['Sim',()=>{closeDialog();if(seq===formVersion)showReview(data,estimate)},'primary']]);
   }else showReview(data,estimate);
  }catch(err){if(seq===formVersion)throw err}
 }
 async function confirmBooking(){
  if(!routeEstimate||!isClient())throw Error('Volte aos detalhes para atualizar o agendamento.');
  if(!$('ts315Accept').reportValidity())throw Error('Aceite os termos de agendamento para continuar.');
  const uid=runtime.session.user.id, seq=identityVersion;
  const {data,route}=routeEstimate;
  confirmInProgress=true;
  write('ts315FormError','Registrando reserva…');
  try{
   const b=firstRow(await rpc('ts_client_create_booking',{
    p_booking:{...data,terms_accepted:true,terms_version:'31.15'},p_route:route
   }));
   if(seq!==identityVersion||runtime.session?.user?.id!==uid)return;
   if(!b?.id)throw Error('O servidor não retornou o código da reserva. Confira Minhas reservas antes de tentar novamente.');
   const booking={...data,...route,...b};
   storeBooking(booking);
   resetForm();
   lastCreatedBooking=booking;
   renderBookingConfirmation(booking);
   window.tsNavigate(bookingConfirmationPage);
   void refreshBookings();
  }catch(err){
   if(missingRoutine(err))throw Error('O servidor de teste ainda não está habilitado para confirmar reservas.');
   throw err;
  }finally{confirmInProgress=false}
 }
 async function advanceForm(){
  if(formBusy)return;
  if(step===0){showStep(1);return}
  if(step===5){showStep(6);return}
  const generation=identityVersion;
  try{
   if(detailsActive())validateFields(step);
   if(step<4&&!reviewReturn){showStep(step+1);return}
   if(step===3&&reviewReturn&&value('ts315For')==='other'&&!$('ts315PassengerPhone')){showStep(4);return}
   if(detailsActive()&&!isClient())return withClient(()=>advanceForm());
   formBusy=true;
   syncWizardButtons();
   if(detailsActive())await detailsNext();else await confirmBooking();
  }catch(err){
   if(generation===identityVersion)statusError('ts315FormError',err);
  }finally{
   formBusy=false;
   syncWizardButtons();
  }
 }
 form.addEventListener('submit',e=>{e.preventDefault();void advanceForm()});
 form.addEventListener('input',e=>{
  if(e.target.matches('#ts315Date,#ts315Time'))syncTripDateTime();
  if(detailsActive()){
   ++formVersion;routeEstimate=null;
   if(e.target.matches('#ts315Origin,#ts315Destination,#ts315Passengers,[data-stop-address],[data-stop-minutes]'))scheduleLivePrice();
  }
  if(e.target===$('ts315Accept'))syncWizardButtons();
  if(!confirmInProgress)write('ts315FormError','');
 });
 form.addEventListener('change',e=>{
  if(e.target.matches('#ts315Date,#ts315Time'))syncTripDateTime();
 });
 form.addEventListener('click',event=>{
  const counter=event.target.closest('[data-count]');
  if(counter){
   const input=$(counter.dataset.count);
   if(counter.dataset.delta==='1')input.stepUp();else input.stepDown();
   input.dispatchEvent(new Event('input',{bubbles:true}));
  }
  const edit=event.target.closest('[data-wizard-edit]');
  if(edit){
   reviewReturn=step;showStep(Number(edit.dataset.wizardEdit));
  }
 });
 $('ts315Back').onclick=()=>showStep(step-1);
 $('ts315AddStop').onclick=()=>{addStop();$('ts315Stops').lastElementChild?.querySelector('input').focus()};
 function syncPassengerFor(source,target){
  $(target).value=$(source).value;
  renderPassenger();
 }
 $('ts315For').onchange=()=>syncPassengerFor('ts315For','ts315ForPayment');
 $('ts315ForPayment').onchange=()=>syncPassengerFor('ts315ForPayment','ts315For');
 $('ts315TermsLink').onclick=e=>{
  e.preventDefault();
  const terms=openDialog('Termos de agendamento',`
   <p>O agendamento é confirmado ao ser registrado. A equipe designará o motorista após a confirmação.</p>
   <p>O valor é calculado para o itinerário informado e pago ao final do serviço. Alterações no itinerário podem gerar cobranças adicionais, mediante informação ao cliente.</p>
   <p>Cancelamentos pelo aplicativo exigem pelo menos ${esc(rules.booking_cancel_min_hours)} horas de antecedência e estão disponíveis para reservas sem pagamento registrado. Em outros casos, fale com a equipe.</p>
   <p>Até o início do atendimento, você pode editar o voo e a forma de pagamento. Para mudar data, horário ou endereços, cancele e faça uma nova reserva dentro do prazo ou fale com a equipe.</p>
   <p>Em caso de não comparecimento, entre em contato com a Transfer Sudeste.</p>`, 'booking-terms');
  actions([['Fechar',closeDialog]]);
  terms.querySelector('button').focus({preventScroll:true});
 };

 let bookings=[], ratings=new Map(), ratingsReady=false, driverDetails=new Map();
 let bookingVersion=0, loaded=false, bookingError='', refreshing=null, dirty=false, lastSync=0;
 let realtimeTimer=null;
 let followedId=null, trackingSignature='', detailsId=null, detailsSignature='', modalBusy=false;
 const autoOpened=new Set(), finishedPrompts=new Set(), finishQueue=[];
 const ended=b=>['completed','cancelled','canceled','rejected'].includes(b.booking_status)||!!b.cancelled_at;
 const confirmed=b=>['pending','confirmed','approved','assigned','awaiting_pickup','awaiting_boarding','in_progress'].includes(b.booking_status);
 const started=b=>!!b.started_at||b.booking_status==='in_progress';
 const editable=b=>['pending','confirmed'].includes(b.booking_status)&&!ended(b)&&!started(b);
 const availableForTracking=b=>!ended(b)&&confirmed(b)&&(started(b)||(rulesReady&&Date.now()>=pickup(b)-Number(rules.tracking_release_minutes)*60000));
 const bookingStatus=b=>{
  if(b.cancelled_at)return 'Cancelada';
  if(ended(b))return statusPt(b.booking_status);
  if(started(b))return 'Em andamento';
  if(b.booking_status==='awaiting_pickup'||b.booking_status==='awaiting_boarding')return 'Aguardando embarque';
  if(b.driver_id&&b.booking_status!=='pending')return 'Designada';
  return statusPt(b.booking_status);
 };
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const formatPeriod=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'});
 const shortMonth=new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'});
 const longMonth=new Intl.DateTimeFormat('pt-BR',{month:'long',timeZone:'UTC'});
 const completed=b=>b.booking_status==='completed'&&!b.cancelled_at;
 const scheduledDate=b=>String(b.pickup_date||'').slice(0,10);
 const serviceDate=b=>completed(b)&&b.finished_at&&Number.isFinite(Date.parse(b.finished_at))?
  new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(b.finished_at)):scheduledDate(b);
 const displayDate=b=>new Date(serviceDate(b)+'T12:00:00Z');
 const scheduledTime=b=>String(b.pickup_time||'').slice(0,5);
 const titleCase=text=>text.charAt(0).toLocaleUpperCase('pt-BR')+text.slice(1);
 const historyFilters=$('clientHistoryFilters');
 const expandedTrips=new Set();
 let reservationPeriod='today', appliedFilters={};
 const realPayment=b=>({card:'Cartão',debit:'Cartão de débito',credit:'Cartão de crédito',...payments})[b.payment_method];
 function resetReservations(){
  stopBookingsSocket();
  ++bookingVersion;
  bookings=[];ratings=new Map();ratingsReady=false;driverDetails=new Map();
  loaded=false;bookingError='';refreshing=null;dirty=false;lastSync=0;
  followedId=null;trackingSignature='';detailsId=null;detailsSignature='';modalBusy=false;
  autoOpened.clear();finishedPrompts.clear();finishQueue.length=0;
  tracking.close();bar.classList.add('hidden');
  expandedTrips.clear();
  reservationPeriod='today';
  $('clientReservationPeriod').classList.add('hidden');
  historyFilters.reset();appliedFilters={};
  updateFilterSelect('year',[]);updateFilterSelect('booking',[]);
  setHistoryFilterVisibility(false);
  for(const id of ['ts315Reservations','ts315History','ts315TrackingBody']){
   write(id,'');delete $(id).dataset.rendered;
  }
 }
 function storeBooking(b){
  ++bookingVersion;
  const idx=bookings.findIndex(row=>row.id===b.id);
  if(idx<0)bookings.push(b);else bookings[idx]={...bookings[idx],...b};
  renderBookings();
 }
 async function refreshBookings(){
  if(!isClient())return;
  if(refreshing){dirty=true;return refreshing}
  const seq=identityVersion, readVersion=bookingVersion;
  const job=(async()=>{
   try{
    const s=await current();
    if(seq!==identityVersion||!s||!isClient())return;
    const headers={Authorization:'Bearer '+s.access_token};
    const rows=[];
    for(let offset=0;;offset+=500){
     const batch=await req('/rest/v1/bookings?select=*&client_id=eq.'+encodeURIComponent(s.user.id)+
      '&deleted_at=is.null&order=pickup_date.desc,pickup_time.desc,id.asc&limit=500&offset='+offset,{headers});
     if(seq!==identityVersion||!isClient())return;
     rows.push(...batch);
     if(batch.length<500)break;
    }
    const newDriverDetails=new Map();
    const assigned=rows.filter(b=>b.driver_id).map(b=>b.id);
    const missing=[];
    for(let i=0;i<assigned.length;i+=150)missing.push(
     rpc('booking_driver_public_details',{p_booking_ids:assigned.slice(i,i+150)}).then(result=>{
      for(const d of Array.isArray(result)?result:[])if(d.driver_id)newDriverDetails.set(d.driver_id,d);
     })
    );
    const [r,lookup]=await Promise.allSettled([rpc('ts_client_ratings_mine'),Promise.all(missing)]);
    if(seq!==identityVersion||!isClient())return;
    if(bookingVersion!==readVersion){dirty=true;return}
    if(r.status==='fulfilled'){
     const data=r.value?.ratings??r.value;
     const ownRatings=Array.isArray(data)?data:(data?.booking_id?[data]:[]);
     ratings=new Map(ownRatings.map(entry=>[entry.booking_id,entry]));ratingsReady=true;
    }
    if(lookup.status==='fulfilled')driverDetails=newDriverDetails;
    const completed=new Set(rows.filter(b=>b.booking_status==='completed').map(b=>b.id));
    const previous=bookings.filter(b=>!ended(b)&&completed.has(b.id)).map(b=>b.id);
    for(const id of previous){
     if(!finishedPrompts.has(id)){finishedPrompts.add(id);finishQueue.push(id)}
    }
    bookings=rows;loaded=true;bookingError='';lastSync=Date.now();
    renderBookings();renderTracking();promptFinished();
   }catch(err){
    if(seq===identityVersion){bookingError=messageError(err);lastSync=Date.now();renderBookings()}
   }finally{
    if(refreshing===job){
     refreshing=null;
     if(dirty){dirty=false;scheduleBookingRefresh()}
    }
   }
  })();
  refreshing=job;
  return job;
 }
 function scheduleBookingRefresh(){
  clearTimeout(realtimeTimer);
  realtimeTimer=setTimeout(()=>{if(!document.hidden)void refreshBookings()},250);
 }
 function stopBookingsSocket(){
  runtime.realtime.disconnect('client');
  clearTimeout(realtimeTimer);
 }
 function connectBookings(activeSession){
  if(!isClient()||document.hidden||!activeSession||activeSession.user.id!==runtime.session?.user?.id){
   stopBookingsSocket();return;
  }
  runtime.realtime.connect({
   owner:'client',
   token:activeSession.access_token,
   topics:[{topic:'realtime:ts_client_bookings',changes:[
    {event:'*',schema:'public',table:'bookings',filter:'client_id=eq.'+activeSession.user.id}
   ]}],
   onUpdate:scheduleBookingRefresh
  });
 }
 function sorted(items,history){
  if(history)return items.sort((a,b)=>String(b.finished_at||b.cancelled_at||b.updated_at||b.pickup_date||'').localeCompare(String(a.finished_at||a.cancelled_at||a.updated_at||a.pickup_date||'')));
  return items.sort((a,b)=>pickup(a)-pickup(b));
 }
 function driverCard(b,full=false){
  if(!b.driver_id)return '<p class="soft-note">Aguardando designação do motorista</p>';
  const d=driverDetails.get(b.driver_id);
  return `<div class="v292-driver">${webUrl(d?.profile_photo_url)?`<img src="${esc(webUrl(d.profile_photo_url))}" alt="Foto do motorista" loading="lazy">`:'<span class="v292-avatar">♙</span>'}
   <div><b>${esc(d?.full_name||'Motorista designado')}</b>
   ${d?[d.vehicle_make,d.vehicle_model,d.vehicle_color,d.vehicle_plate].filter(Boolean).map(esc).join(' · '):''}</div></div>`+
   (full&&webUrl(d?.vehicle_photo_url)?`<img class="v292-car-photo" src="${esc(webUrl(d.vehicle_photo_url))}" alt="Foto do veículo" loading="lazy">`:'');
 }
 function setHistoryFilterVisibility(visible){
  historyFilters.classList.toggle('hidden',!visible);
  $('clientHistoryToggle').setAttribute('aria-expanded',String(visible));
 }
 function updateFilterSelect(name,options){
  const select=historyFilters.elements.namedItem(name);
  if(select.options.length===options.length+1&&options.every(([value,label],i)=>select.options[i+1].value===value&&select.options[i+1].text===label))return;
  const current=select.value;
  while(select.length>1)select.remove(1);
  for(const [value,label] of options)select.add(new Option(label,value));
  select.value=options.some(([value])=>value===current)?current:'';
 }
 const bookingServices={
  transfer:{label:'Transfer',icon:'transfer'},
  city_tour:{label:'City Tour',icon:'city-tour'},
  hourly_driver:{label:'Motorista à disposição',icon:'chauffeur'},
  wedding:{label:'Casamento',icon:'wedding'}
 };
 const bookingService=b=>bookingServices[b.service_type]||{label:runtime.driver.service(b),icon:'transfer'};
 function bookingBadge(b){
  return completed(b)?`<span class="client-trip-status is-completed">${icon('check')} Concluída</span>`:
   `<span class="client-trip-status">${esc(bookingStatus(b))}</span>`;
 }
 function bookingSchedule(b){
  const time=scheduledTime(b);
  return bookingDate(scheduledDate(b))+(time?' · '+time:'');
 }
 function renderBookingConfirmation(b){
  const title=b.booking_status==='confirmed'?'Agendamento confirmado':'Agendamento registrado';
  $('clientBookingConfirmation').innerHTML=`<div class="client-success-heading">
   <span class="client-success-symbol">${icon('check')}</span>
   <h1 tabindex="-1">${title}</h1>
   <p>Reserva #${esc(shortId(b))}</p>
  </div>
  <div class="client-wizard-box client-result-summary">${wizardRow('Serviço',bookingService(b).label)}
   ${wizardRow('Data e horário',bookingSchedule(b))}
   ${wizardRow('Passageiro',b.passenger_name||b.client_name||'Não informado')}
   ${wizardRow('Pagamento',payments[b.preferred_payment_method]||payments.undefined)}
  </div>${wizardPrice('Valor total',b.total_amount)}`;
 }
 function renderRecentReservation(b){
  const confirmed=!b.cancelled_at&&b.booking_status==='confirmed';
  const status=confirmed?'Confirmada':bookingStatus(b);
  const host=$('clientRecentReservation');
  const html=`<article class="client-wizard-box client-result-summary">
   <div class="client-receipt-heading"><h2>${esc(bookingService(b).label)}</h2>
    <span class="${confirmed?'is-confirmed':''}">${esc(status)} ${confirmed?icon('check'):''}</span>
   </div>
   ${wizardRow('Reserva','#'+shortId(b))}
   ${wizardRow('Data e horário',bookingSchedule(b))}
   ${wizardRow('Origem',b.origin)}
   ${wizardRow('Destino',b.destination)}
   ${wizardPrice('Valor total',b.total_amount)}
  </article>`;
  if(host.innerHTML!==html)host.innerHTML=html;
 }
 function bookingFacts(b){
  return `<div class="client-trip-facts">
   ${b.passengers!=null?`<span aria-label="${esc(b.passengers)} passageiros">${icon('user')} ${esc(b.passengers)}</span>`:''}
   ${b.luggage!=null?`<span aria-label="${esc(b.luggage)} bagagens">${icon('luggage')} ${esc(b.luggage)}</span>`:''}
   ${b.flight_number?`<span aria-label="Voo ${esc(b.flight_number)}">${icon('plane')} ${esc(b.flight_number)}</span>`:
    /aeroporto/i.test((b.origin||'')+' '+(b.destination||''))?`<span aria-label="Trajeto com aeroporto">${icon('plane')}</span>`:''}
  </div>`;
 }
 function bookingItinerary(b){
  const stops=bookingStops(b.stops);
  const points=[['Origem',b.origin,'origin'],
   ...(Array.isArray(stops)?stops.map((item,i)=>['Parada '+(i+1),typeof item==='string'?item:item?.address,'stop']):[]),
   ['Destino',b.destination,'destination']];
  return `<ol class="client-trip-route">${points.filter(([,address])=>address).map(([label,address,kind])=>
   `<li class="client-trip-point ${kind}"><span>${label}</span><strong>${esc(address)}</strong></li>`).join('')}</ol>`;
 }
 function bookingDriver(b){
  if(!b.driver_id)return completed(b)?'':'<p class="client-trip-unassigned">Aguardando designação do motorista</p>';
  const driver=driverDetails.get(b.driver_id);
  const photo=webUrl(driver?.profile_photo_url);
  const car=[driver?.vehicle_make,driver?.vehicle_model].filter(Boolean).join(' ');
  const vehicle=[car,driver?.vehicle_color].filter(Boolean).join(' · ');
  return `<div class="client-trip-driver">
    <span class="client-trip-avatar">${photo?`<img src="${esc(photo)}" alt="" loading="lazy">`:icon('user')}</span>
    <div><strong>${esc(driver?.full_name||'Motorista designado')}</strong>
     ${vehicle?`<span>${esc(vehicle)}</span>`:''}${driver?.vehicle_plate?`<span>${esc(driver.vehicle_plate)}</span>`:''}</div>
   </div>`;
 }
 function bookingDetailsButton(b){
  return `<button type="button" class="client-secondary-button" data-client-open="${esc(b.id)}">Detalhes da reserva ${icon('right')}</button>`;
 }
 function reservationCard(b){
  return `<article class="client-panel client-trip-card">
   <div class="client-trip-heading"><span>${esc(bookingService(b).label)}</span>${bookingBadge(b)}</div>
   <div class="client-trip-total">${esc(bookingMoney(b.total_amount))}</div>
   <p class="client-trip-reference">${esc(bookingDate(scheduledDate(b)))}${scheduledTime(b)?' · '+esc(scheduledTime(b)):''}<br>Reserva #${esc(shortId(b))}</p>
   ${bookingFacts(b)}${bookingItinerary(b)}${bookingDriver(b)}${bookingDetailsButton(b)}
  </article>`;
 }
 function collapsedTripCard(b){
  const date=displayDate(b), validDate=Number.isFinite(date.valueOf());
  return `<article class="client-history-entry">
   <div class="client-history-date">${validDate?`<span>${esc(shortMonth.format(date))}</span><strong>${date.getUTCDate()}</strong>`:'<span>Data</span><strong>—</strong>'}</div>
   <details class="client-panel client-history-card" data-expandable-trip="${esc(b.id)}"${expandedTrips.has(b.id)?' open':''}>
    <summary>
     <span class="client-feature-icon">${icon(bookingService(b).icon)}</span>
     <span class="client-history-service"><strong>${esc(bookingService(b).label)}${scheduledTime(b)?' · '+esc(scheduledTime(b)):''}</strong><small>#${esc(shortId(b))}</small></span>
     <span class="client-history-amount"><strong>${esc(bookingMoney(b.total_amount))}</strong>${bookingBadge(b)}</span>
     <span class="client-history-chevron">${icon('down')}</span>
    </summary>
    <div class="client-history-details">
     ${bookingFacts(b)}${bookingItinerary(b)}${bookingDriver(b)}
     ${bookingDetailsButton(b)}
     <button type="button" class="client-secondary-button" data-trip-collapse>Recolher detalhes ${icon('down')}</button>
    </div>
   </details>
  </article>`;
 }
 function renderHistory(){
  const history=bookings.filter(completed).sort((a,b)=>serviceDate(b).localeCompare(serviceDate(a))||scheduledTime(b).localeCompare(scheduledTime(a)));
  const years=[...new Set(history.map(b=>serviceDate(b).slice(0,4)).filter(year=>/^\d{4}$/.test(year)))];
  updateFilterSelect('year',years.map(year=>[year,year]));
  updateFilterSelect('booking',history.map(b=>[String(b.id),'#'+shortId(b)]));
  const {month,year,booking}=appliedFilters;
  const matches=history.filter(b=>(!month||serviceDate(b).slice(5,7)===month)&&
   (!year||serviceDate(b).startsWith(year+'-'))&&(!booking||b.id===booking));
  if(!matches.length)return `<p class="client-panel client-empty">${history.length?'Nenhuma viagem encontrada com estes filtros.':'Você ainda não concluiu nenhuma viagem.'}</p>`;
  return groupedTrips(matches);
 }
 function groupedTrips(trips){
  const grouped=new Map();
  for(const b of trips){
   const period=serviceDate(b).slice(0,7);
   if(!grouped.has(period))grouped.set(period,[]);
   grouped.get(period).push(b);
  }
  return [...grouped.values()].map(rows=>{
   const date=displayDate(rows[0]);
   const period=Number.isFinite(date.valueOf())?titleCase(formatPeriod.format(date)):'Data indisponível';
   return `<section class="client-history-period-group"><h2>${esc(period)}</h2>${rows.map(collapsedTripCard).join('')}</section>`;
  }).join('');
 }
 function renderBookings(){
  const page=activePage();
  if(page===bookingReceiptPage&&isClient()&&lastCreatedBooking){
   renderRecentReservation(bookings.find(row=>row.id===lastCreatedBooking.id)||lastCreatedBooking);
  }
  if(page===pages[1]||page===pages[2]){
   const reservations=page===pages[1], host=$(reservations?'ts315Reservations':'ts315History');
   $('clientHistoryToggle').classList.toggle('hidden',!isClient());
   $('clientReservationPeriod').classList.toggle('hidden',!isClient());
   for(const button of $('clientReservationPeriod').querySelectorAll('[data-reservation-period]')){
    button.setAttribute('aria-pressed',String(button.dataset.reservationPeriod===reservationPeriod));
   }
   let html;
   if(!isClient()){
    html='<div class="client-panel client-empty"><p>Entre na sua conta para consultar seus agendamentos.</p><button type="button" class="primary" data-client-login>Entrar ou criar conta</button></div>';
   }else if(!loaded){
    html=bookingError?`<div class="client-panel client-empty"><p role="alert">${esc(bookingError)}</p><button type="button" class="back" data-client-reload>Tentar novamente</button></div>`:'<p class="client-panel client-empty" role="status">Carregando agendamentos…</p>';
   }else if(!reservations){
    html=renderHistory();
   }else{
    const currentDay=today();
    if(reservationPeriod==='today'){
     const sameDay=bookings.filter(b=>serviceDate(b)===currentDay);
     const rows=[...sorted(sameDay.filter(b=>!ended(b)),false),...sorted(sameDay.filter(completed),true)];
     html=rows.length?rows.map(reservationCard).join(''):
      '<p class="client-panel client-empty">Você não tem reservas para hoje.</p>';
    }else{
     const rows=sorted(bookings.filter(b=>!ended(b)&&scheduledDate(b)>currentDay),false);
     html=rows.length?groupedTrips(rows):'<p class="client-panel client-empty">Você não tem reservas futuras.</p>';
    }
   }
   if(host.dataset.rendered!==html){host.innerHTML=html;host.dataset.rendered=html}
  }
  if(detailsId&&dialog.open&&!modalBusy){
   const b=bookings.find(row=>row.id===detailsId);
   if(b&&JSON.stringify([b,driverDetails.get(b.driver_id),ratings.get(b.id),editable(b),bookingStatus(b)])!==detailsSignature)showBooking(b);
  }
 }
 function showBooking(b){
  detailsId=b.id;
  detailsSignature=JSON.stringify([b,driverDetails.get(b.driver_id),ratings.get(b.id),editable(b),bookingStatus(b)]);
  const stops=bookingStops(b.stops);
  const rating=ratings.get(b.id);
  const route=runtime.driver.route(b);
  const info=runtime.driver.info('Situação',bookingStatus(b))+runtime.driver.info('Serviço',runtime.driver.service(b))+
   runtime.driver.info('Data e horário',bookingDate(b.pickup_date)+' às '+String(b.pickup_time||'').slice(0,5))+
   runtime.driver.info('Passageiros',b.passengers)+runtime.driver.info('Bagagens',b.luggage)+
   (b.distance_km!=null?runtime.driver.info('Distância',Number(b.distance_km).toLocaleString('pt-BR',{maximumFractionDigits:1})+' km'):'')+
   (b.flight_number?runtime.driver.info('Voo',b.flight_number):'')+runtime.driver.info('Passageiro',b.passenger_name||b.client_name||'Não informado')+
   (b.passenger_phone||b.client_phone?runtime.driver.info('Telefone',b.passenger_phone||b.client_phone):'')+
   (b.notes?runtime.driver.info('Observações',b.notes):'')+
   runtime.driver.info('Forma de pagamento',realPayment(b)||payments[b.preferred_payment_method]||payments.undefined)+
   runtime.driver.info('Situação do pagamento',statusPt(b.payment_status))+
   (rating?runtime.driver.info('Sua avaliação',String(rating.rating)+' de 5 estrelas')+
    (Array.isArray(rating.compliments)&&rating.compliments.length?runtime.driver.info('Elogios',rating.compliments.join(' · ')):'')+
    (rating.comment?runtime.driver.info('Seu comentário',rating.comment):''):'');
  const stopTimes=(Array.isArray(stops)?stops:[]).map((st,i)=>st?.minutes?runtime.driver.info('Tempo da parada '+(i+1),st.minutes+' min'):'').join('');
  openDialog('Reserva #'+shortId(b),`
   <div class="ts318-detail-amount"><small>Valor total</small><strong>${esc(bookingMoney(b.total_amount))}</strong></div>
   <section class="ts318-detail-section"><h3>Itinerário</h3>${route}${stopTimes}</section>
   ${b.driver_id||!ended(b)?`<section class="ts318-detail-section"><h3>Motorista e veículo</h3>${driverCard(b,true)}</section>`:''}
   <section class="ts318-detail-section"><h3>Dados da reserva</h3>${info}</section>`);
  const controls=[];
  if(availableForTracking(b))controls.push(['Acompanhar',()=>{closeDialog();showTracking(b)}]);
  if(editable(b))controls.push(['Editar reserva',()=>editBooking(b)]);
  if(confirmed(b)&&!ended(b)&&!b.started_at&&b.booking_status!=='in_progress'){
   controls.push(['Cancelar reserva',()=>cancelBooking(b)]);
   if(editable(b))controls.push(['Alterar data, horário ou endereços',()=>cancelBooking(b,true)]);
  }
  if(ended(b)&&String(b.service_type||'transfer').toLowerCase()==='transfer')controls.push(['Repetir serviço',()=>repeatBooking(b),'primary']);
  if(b.booking_status==='completed'&&ratingsReady&&!rating)controls.push(['Avaliar motorista',()=>showRating(b),'primary']);
  actions(controls);
 }
 async function supportDialog(title,message,reference,alternative=[]){
  detailsId=null;
  const host=openDialog(title,`<p>${esc(message)}</p><div class="ts315-actions" id="ts315Support" role="status">Consultando WhatsApp…</div>`);
  const target=host.querySelector('#ts315Support'), seq=identityVersion;
  if(alternative.length)actions(alternative);
  const data=await getContact().catch(()=>null);
  if(seq!==identityVersion||!dialog.open||!target.isConnected)return;
  const note=reference?'Olá! Preciso de ajuda com a reserva #'+shortId(reference)+' ('+reference.id+').':'Olá! Preciso de ajuda com um agendamento.';
  const wa=whatsapp(data?.whatsapp_number,note);
  if(wa)target.innerHTML=link('Falar pelo WhatsApp',wa);
  else {
   target.textContent='O WhatsApp está indisponível neste momento.';
   actions([['Ver canais de contato',()=>{closeDialog();window.tsNavigate(pages[4])},'primary']]);
  }
 }
 async function cancelBooking(b,rebook=false){
  if(!rulesReady){
   try{if(!await loadRules())return}
   catch(err){return supportDialog('Cancelamento indisponível',messageError(err),b)}
  }
  detailsId=null;
  const hours=Number(rules.booking_cancel_min_hours);
  if(!(pickup(b)-Date.now()>=hours*3600000)||String(b.payment_status||'pending')!=='pending'){
   return supportDialog('Entre em contato com a equipe',rebook?
    `Para alterar a data, o horário ou os endereços da reserva #${shortId(b)}, fale com a Transfer Sudeste.`:
    `Para cancelar a reserva #${shortId(b)} com menos de ${hours} horas de antecedência ou com pagamento registrado, fale com a Transfer Sudeste.`,b);
  }
  openDialog(rebook?'Alterar data, horário ou endereços':'Cancelar reserva?',
   `<p>${rebook?'A reserva atual será cancelada. Você poderá ajustar o trajeto, a data ou o horário e confirmar uma nova reserva.':'Confirme o cancelamento da reserva #'+esc(shortId(b))+'.'}</p><p class="field-error" id="ts315CancelError" role="alert"></p>`);
  actions([['Voltar',()=>showBooking(b)], [rebook?'Cancelar e agendar novamente':'Confirmar cancelamento',async btn=>{
   if(modalBusy)return;
   const seq=identityVersion;
   modalBusy=true;btn.disabled=true;
   try{
    const result=firstRow(await rpc('ts_client_cancel_booking',{p_booking_id:b.id}));
    if(seq!==identityVersion)return;
    if(result?.id)storeBooking({...b,...result});
    closeDialog();void refreshBookings();
    if(rebook)repeatBooking(b);
    else{
     openDialog('Reserva cancelada',`<p>Reserva #${esc(shortId(b))} cancelada.</p>`);
     actions([['Ver histórico',()=>{closeDialog();window.tsNavigate(pages[2])},'primary']]);
    }
   }catch(err){if(seq===identityVersion&&$('ts315CancelError'))statusError('ts315CancelError',err)}
   finally{modalBusy=false;btn.disabled=false}
  },'primary']]);
 }
 function editBooking(b){
  detailsId=null;
  if(!editable(b))return supportDialog('Edição indisponível','Fale com a equipe para solicitar alterações nesta reserva.',b);
  const host=openDialog('Editar reserva #'+shortId(b),`<form id="ts315EditForm">
   <label for="ts315EditFlight">Número do voo</label><input id="ts315EditFlight" value="${esc(b.flight_number||'')}">
   <label for="ts315EditPayment">Forma de pagamento</label><select id="ts315EditPayment">${paymentOptions()}</select>
   <p class="field-error" id="ts315EditError" role="alert"></p>
   <div class="ts315-actions"><button type="button" class="back" id="ts315EditBack">Voltar</button><button type="submit" class="primary">Salvar alterações</button></div>
  </form>`);
  $('ts315EditPayment').value=Object.hasOwn(payments,b.preferred_payment_method)?b.preferred_payment_method:'undefined';
  $('ts315EditBack').onclick=()=>showBooking(bookings.find(row=>row.id===b.id)||b);
  host.querySelector('form').onsubmit=async e=>{
   e.preventDefault();if(modalBusy)return;
   const seq=identityVersion;
   const button=e.currentTarget.querySelector('button[type=submit]');
   modalBusy=true;button.disabled=true;
   try{
    const result=firstRow(await rpc('ts_client_update_booking',{
     p_booking_id:b.id,p_flight_number:value('ts315EditFlight')||null,
     p_payment_method:value('ts315EditPayment')
    }));
    if(seq!==identityVersion)return;
    if(result?.id)storeBooking({...b,...result});
    closeDialog();openDialog('Reserva atualizada','<p>As alterações foram salvas.</p>');
    void refreshBookings();
   }catch(err){if(seq===identityVersion&&$('ts315EditError'))statusError('ts315EditError',err)}
   finally{modalBusy=false;button.disabled=false}
  };
 }
 function repeatBooking(b){
  if(formBusy)return;
  closeDialog();resetForm();
  $('ts315Origin').value=b.origin||'';$('ts315Destination').value=b.destination||'';
  $('ts315Passengers').value=b.passengers??1;$('ts315Luggage').value=b.luggage??'';
  $('ts315Notes').value=b.notes||'';
  $('ts315PreferredPayment').value=Object.hasOwn(payments,b.preferred_payment_method)?b.preferred_payment_method:'pix';
  const stops=bookingStops(b.stops);
  if(Array.isArray(stops))for(const st of stops)if(st)addStop(typeof st==='string'?st:st.address,st.minutes??'');
  if(b.booking_for_other_person){
   $('ts315For').value='other';$('ts315ForPayment').value='other';renderPassenger(b.passenger_phone);
   $('ts315PassengerName').value=b.passenger_name||'';
   $('ts315PassengerEmail').value=b.passenger_email||'';
  }
  window.tsNavigate(pages[0]);showStep(1);
  $('ts315Date').focus();
  if(Array.isArray(stops)&&stops.length>Number(rules.booking_max_stops))write('ts315FormError','O limite de paradas mudou. Confira o itinerário antes de agendar.');
 }

 function showTracking(b){
  if(!availableForTracking(b))return;
  followedId=b.id;autoOpened.add(b.id);trackingSignature='';
  renderTracking(false);
  if(!tracking.open)tracking.showModal();
  bar.classList.add('hidden');
 }
 function renderTracking(allowOpen=true){
  if(!isClient())return;
  const candidates=sorted(bookings.filter(availableForTracking),false);
  const selected=candidates.find(b=>b.id===followedId)||candidates.find(b=>b.booking_status==='in_progress')||candidates[0];
  if(!selected){
   if(tracking.open)tracking.close();
   followedId=null;bar.classList.add('hidden');
   return;
  }
  if(tracking.open&&followedId!==selected.id)tracking.close();
  followedId=selected.id;
  const status=bookingStatus(selected);
  const signature=JSON.stringify([selected,driverDetails.get(selected.driver_id),status]);
  if(trackingSignature!==signature){
   trackingSignature=signature;
   $('ts315TrackingBody').innerHTML=`
    <section class="ts318-detail-section">${runtime.driver.info('Reserva','#'+shortId(selected))}
     ${runtime.driver.info('Situação',status)}${runtime.driver.info('Horário',bookingDate(selected.pickup_date)+' às '+String(selected.pickup_time||'').slice(0,5))}</section>
    <section class="ts318-detail-section"><h3>Itinerário</h3>${runtime.driver.route(selected)}</section>
    <section class="ts318-detail-section"><h3>Motorista e veículo</h3>${driverCard(selected,true)}</section>`;
  }
  write('ts315TrackingBar','Acompanhar #'+shortId(selected)+' · '+status);
  bar.classList.toggle('hidden',tracking.open);
  if(allowOpen&&!tracking.open&&!autoOpened.has(selected.id)&&!dialog.open&&!formBusy&&!finishQueue.length&&
   !document.hidden&&activePage()!=='conta'&&activePage()!=='politicas'){
   showTracking(selected);
  }
 }
 function promptFinished(){
  if(!isClient()||!finishQueue.length||dialog.open||formBusy||document.hidden||activePage()==='conta')return;
  const id=finishQueue[0], b=bookings.find(row=>row.id===id&&row.booking_status==='completed');
  if(b&&!ratingsReady)return;
  finishQueue.shift();
  if(!b)return;
  if(tracking.open)tracking.close();
  window.tsNavigate(pages[2]);
  if(!ratings.has(id))showRating(b);
 }
 function showRating(b){
  if(b.booking_status!=='completed'||ratings.has(b.id)||!ratingsReady)return;
  detailsId=null;
  const host=openDialog('Avalie seu motorista',`<p>Reserva #${esc(shortId(b))}</p>
   <form id="ts315RatingForm">
    <div class="ts315-stars" role="group" aria-label="Nota de 1 a 5 estrelas">
     ${[1,2,3,4,5].map(n=>`<button type="button" class="back" data-stars="${n}" aria-label="${n} ${n===1?'estrela':'estrelas'}">★</button>`).join('')}
    </div>
    <p id="ts315RatingScore" role="status"></p>
    <div class="ts315-compliments" id="ts315Compliments"><p>Elogios (opcional)</p>
     ${compliments.map((label,i)=>`<label><input type="checkbox" value="${i}"> ${esc(label)}</label>`).join('')}
    </div>
    <div id="ts315Comment">
     <label for="ts315RatingComment" id="ts315RatingCommentLabel"></label><textarea id="ts315RatingComment"></textarea>
    </div>
    <p class="field-error" id="ts315RatingError" role="alert"></p>
    <div class="ts315-actions"><button type="button" class="back" id="ts315RateLater">Avaliar depois</button><button type="submit" class="primary">Enviar avaliação</button></div>
   </form>`);
  let score=5;
  const stars=[...host.querySelectorAll('[data-stars]')];
  function setScore(n){
   score=n;
   for(const btn of stars){
    const v=Number(btn.dataset.stars);
    btn.textContent=v<=n?'★':'☆';btn.setAttribute('aria-pressed',String(v===n));
   }
   write('ts315RatingScore',n===1?'1 estrela':n+' estrelas');
   $('ts315Compliments').classList.toggle('hidden',n<4);
   $('ts315Comment').classList.toggle('hidden',n>=4);
   $('ts315RatingComment').required=n===1;
   write('ts315RatingCommentLabel',n===1?'Motivo da avaliação *':'Comentário (opcional)');
  }
  stars.forEach(btn=>btn.onclick=()=>setScore(Number(btn.dataset.stars)));
  setScore(5);
  $('ts315RateLater').onclick=closeDialog;
  host.querySelector('form').onsubmit=async e=>{
   e.preventDefault();if(modalBusy)return;
   const comment=score<4?value('ts315RatingComment'):null;
   if(score===1&&!comment){write('ts315RatingError','Informe o motivo da avaliação.');$('ts315RatingComment').focus();return}
   const selected=score>=4?[...$('ts315Compliments').querySelectorAll('input:checked')].map(el=>compliments[Number(el.value)]):[];
   const seq=identityVersion;
   const button=e.currentTarget.querySelector('button[type=submit]');
   modalBusy=true;button.disabled=true;
   try{
    await rpc('ts_client_rate_driver',{p_booking_id:b.id,p_rating:score,p_compliments:selected,p_comment:comment||null});
    if(seq!==identityVersion)return;
    ++bookingVersion;ratings.set(b.id,{booking_id:b.id,rating:score,compliments:selected,comment:comment||null});renderBookings();
    openDialog('Avaliação enviada','<p>Obrigado por avaliar o atendimento.</p>');
    void refreshBookings();
   }catch(err){
    if(seq===identityVersion&&$('ts315RatingError'))statusError('ts315RatingError',err);
    void refreshBookings();
   }finally{modalBusy=false;button.disabled=false}
  };
 }
 function initReservations(){
  $('ts315Minimize').onclick=()=>tracking.close();
  tracking.addEventListener('close',()=>renderTracking(false));
  bar.onclick=()=>{
   const b=bookings.find(row=>row.id===followedId);
   if(b)showTracking(b);
  };
  dialog.addEventListener('cancel',event=>{if(modalBusy)event.preventDefault()});
  $('ts315Close').addEventListener('click',e=>{if(modalBusy)e.stopImmediatePropagation()},true);
  dialog.addEventListener('close',()=>{
   if(!dialog.open){detailsId=null;detailsSignature='';promptFinished();renderTracking()}
  });
  updateFilterSelect('month',Array.from({length:12},(_,index)=>[
   String(index+1).padStart(2,'0'),titleCase(longMonth.format(new Date(Date.UTC(2000,index,1))))
  ]));
  $('clientHistoryToggle').onclick=()=>setHistoryFilterVisibility(historyFilters.classList.contains('hidden'));
  historyFilters.onsubmit=e=>{
   e.preventDefault();appliedFilters=Object.fromEntries(new FormData(historyFilters));renderBookings();
  };
  historyFilters.onreset=()=>{appliedFilters={};renderBookings()};
  for(const button of $('clientReservationPeriod').querySelectorAll('[data-reservation-period]')){
   button.onclick=()=>{reservationPeriod=button.dataset.reservationPeriod;renderBookings()};
  }
  for(const id of ['ts315Reservations','ts315History']){
   $(id).addEventListener('toggle',event=>{
    const tripId=event.target.dataset.expandableTrip;
    if(!tripId||!event.target.isConnected)return;
    if(event.target.open)expandedTrips.add(tripId);else expandedTrips.delete(tripId);
   },true);
   $(id).onclick=e=>{
    const collapse=e.target.closest('[data-trip-collapse]');
    if(collapse){
     const entry=collapse.closest('details');
     entry.open=false;expandedTrips.delete(entry.dataset.expandableTrip);entry.querySelector('summary').focus();
     return;
    }
    if(e.target.closest('[data-client-login]')){
     const page=activePage();
     openAuth(async()=>{if(await checkRole())window.tsNavigate(page)});
     return;
    }
    if(e.target.closest('[data-client-reload]')){void refreshBookings();return}
    const btn=e.target.closest('[data-client-open],[data-client-rate]');
    if(!btn||!isClient())return;
    const b=bookings.find(row=>row.id===(btn.dataset.clientOpen||btn.dataset.clientRate));
    if(!b)return;
    if(btn.dataset.clientOpen)showBooking(b);
    if(btn.dataset.clientRate)showRating(b);
   };
  }
  setInterval(()=>{
   if(!isClient()||document.hidden)return;
   void current().then(connectBookings);
   if(!runtime.realtime.isReady('client')&&Date.now()-lastSync>12000)void refreshBookings();
   if(activePage()===pages[1])renderBookings();
   renderTracking();promptFinished();
  },3000);
  document.addEventListener('visibilitychange',()=>{
   if(document.hidden){stopBookingsSocket();return}
   if(isClient()){void current().then(connectBookings);void refreshBookings();renderTracking()}
  });
 }

 function whatsapp(number,message=''){
  const digits=String(number||'').replace(/\D/g,'');
  return digits?`https://wa.me/${digits}`+(message?'?text='+encodeURIComponent(message):''):'';
 }
 function getContact(){
  if(contactRequest)return contactRequest;
  const seq=identityVersion;
  const request=rpc('ts_client_get_company_contact').then(result=>{
   if(seq===identityVersion)contact=firstRow(result);
   return seq===identityVersion?contact:null;
  }).catch(err=>{if(seq===identityVersion&&contact)return contact;throw err})
   .finally(()=>{if(contactRequest===request)contactRequest=null});
  contactRequest=request;
  return request;
 }
 function featureIcon(name){
  return `<span class="client-feature-icon">${icon(name)}</span>`;
 }
 async function shareApp(){
  const sequence=identityVersion;
  const url=new URL(location.href);
  url.search='';url.hash='';
  try{
   if(navigator.share){await navigator.share({title:'Transfer Sudeste',url:url.href});return}
   await navigator.clipboard.writeText(url.href);
   if(sequence===identityVersion&&$('clientShareStatus'))$('clientShareStatus').textContent='Link do aplicativo copiado.';
  }catch(error){
   if(error.name!=='AbortError'&&sequence===identityVersion&&isClient()){
    openDialog('Compartilhar aplicativo',`<p>Copie o endereço do aplicativo ou abra o link para compartilhar.</p>${link(url.href,url.href)}`);
   }
  }
 }
 async function renderContact(){
  const seq=identityVersion;
  const host=$('ts315Contact'), share=$('clientContactShare');
  if(!isClient()){
   share.replaceChildren();
   host.innerHTML='<div class="client-panel client-empty"><p>Entre na sua conta para consultar os canais oficiais.</p><button type="button" class="primary">Entrar ou criar conta</button></div>';
   host.querySelector('button').onclick=()=>openAuth(async()=>{if(await checkRole())window.tsNavigate(pages[4])});
   return;
  }
  share.innerHTML=`<section class="client-company-section"><h2>Compartilhe nossa experiência</h2>
   <div class="client-panel client-company-list"><button type="button" class="client-company-row" id="clientShareApp">
    ${featureIcon('share')}<span><strong>Compartilhar aplicativo</strong><small>Indique a Transfer Sudeste.</small></span>${icon('right')}
   </button></div><p class="client-inline-status" id="clientShareStatus" role="status"></p>
  </section><div class="client-company-signature"><strong>Transfer Sudeste</strong><span>Transporte Exclusivo</span></div>`;
  $('clientShareApp').onclick=shareApp;
  host.innerHTML='<p class="client-panel client-empty" role="status">Carregando canais de atendimento…</p>';
  try{
   const c=await getContact().catch(()=>null);
   if(seq!==identityVersion||!isClient())return;
   const data=c||{};
   const wa=whatsapp(data.whatsapp_number);
   const phone=String(data.whatsapp_number||'').replace(/\D/g,'');
   const formatted=phone.length===13?`+${phone.slice(0,2)} (${phone.slice(2,4)}) ${phone.slice(4,9)}-${phone.slice(9)}`:phone;
   const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email||'')?data.email:'';
   const instagram=webUrl(data.instagram_url), site=webUrl(data.website_url);
   const handle=instagram?new URL(instagram).pathname.split('/').filter(Boolean)[0]:'';
   const row=(name,label,text,url,instagramQr=false)=>url?`<div class="client-company-link">
    <a class="client-company-row" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
     ${featureIcon(name)}<span><strong>${label}</strong><small>${esc(text)}</small></span>${instagramQr?'':icon('right')}
    </a>${instagramQr?`<button id="ts315InstagramQr" class="client-icon-button" type="button" aria-label="Exibir QR Code do Instagram">${icon('qr')}</button>`:''}
   </div>`:'';
   const fields=row('whatsapp','WhatsApp',formatted,wa)+row('mail','E-mail',email,email?'mailto:'+email:'')+
    row('instagram','Instagram',handle?'@'+handle:'Instagram',instagram,true)+row('globe','Site oficial',data.website_url,site);
   host.innerHTML=`<section class="client-panel client-company-hero">
    ${icon('headset')}<h2>Como podemos ajudar?</h2><p>Estamos à disposição para cuidar de cada detalhe da sua viagem.</p>
    ${wa?`<a class="primary client-company-cta" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">${icon('whatsapp')} Conversar pelo WhatsApp ${icon('external')}</a>`:''}
   </section>
   <section class="client-company-section"><h2>Canais de atendimento</h2>
    ${fields?`<div class="client-panel client-company-list">${fields}</div>`:'<p class="client-panel client-empty">'+(c?'Nenhum canal de atendimento configurado.':'Canais de atendimento indisponíveis no momento.')+'</p>'}
   </section>`;
   if(instagram)$('ts315InstagramQr').onclick=()=>{
    const body=openDialog('QR Code do Instagram','<p>Escaneie com a câmera para acessar o Instagram da Transfer Sudeste.</p>');
    try{
     const image=document.createElement('img');image.className='ts315-contact-qr';
     image.alt='QR Code do Instagram';image.src=window.tsCompanyContactQr(instagram);
     body.append(image);
    }catch{body.textContent='O QR Code está indisponível neste momento.'}
    actions([['Fechar QR Code',closeDialog,'primary']]);
   };
  }catch{
   if(seq===identityVersion&&isClient())host.innerHTML='<p class="client-panel client-empty" role="alert">Não foi possível exibir os canais de atendimento.</p>';
  }
 }
 let contactPixLoad=0;
 async function renderContactPix(){
  const host=$('ts315ContactPix'), seq=identityVersion, load=++contactPixLoad;
  const canRender=()=>seq===identityVersion&&load===contactPixLoad&&isClient()&&activePage()===pages[4];
  host.replaceChildren();
  if(!isClient())return;
  const heading='<h2>Dados bancários</h2>';
  host.className='client-company-section';
  host.innerHTML=heading+'<p class="client-panel client-empty" role="status">Carregando dados do PIX…</p>';
  try{
   let pix=firstRow(await rpc('ts_client_get_company_pix'));
   if(!canRender())return;
   if(!pix?.pix_key){
    host.innerHTML=heading+'<p class="client-panel client-empty">PIX indisponível no momento.</p>';
    return;
   }
   host.innerHTML=heading+`<section class="client-panel client-pix-card" aria-label="Pagamento via PIX">
    <div class="client-pix-heading">${featureIcon('pix')}<div><h3>Pagamento via PIX</h3><p>Transfer Sudeste</p></div></div>
    <dl><div><dt>Titular</dt><dd>${esc(pix.pix_holder_name||'—')}</dd></div><div><dt>Banco</dt><dd>${esc(pix.pix_bank_name||'—')}</dd></div></dl>
    <div class="client-pix-actions"><button type="button" class="client-secondary-button" data-client-pix="copy">${icon('copy')} Copiar chave PIX</button>
     <button type="button" class="client-icon-button" data-client-pix="qr" aria-label="Exibir QR Code PIX">${icon('qr')}</button></div>
    <p class="client-pix-note">${icon('shield')} Confira os dados do beneficiário antes de confirmar o pagamento.</p>
   </section>`;
   for(const button of host.querySelectorAll('[data-client-pix]')){
    button.onclick=async()=>{
     if(!canRender())return;
     button.disabled=true;
     try{
      if(button.dataset.clientPix==='copy'){
       await window.tsCompanyPix.copy(pix);
      }else{
       const fresh=firstRow(await rpc('ts_client_get_company_pix'));
       if(!canRender())return;
       pix=fresh;
       await window.tsCompanyPix.showCode(pix);
      }
     }catch(err){
      if(canRender()){
       openDialog('PIX indisponível',`<p>${esc(messageError(err))}</p>`);
      }
     }finally{button.disabled=false}
    };
   }
  }catch(err){
   if(canRender()){
    host.innerHTML=heading+'<p class="client-panel client-empty" role="alert">Não foi possível consultar os dados do PIX.</p>';
   }
  }
 }
 async function ownerForm(){
  if(!runtime.admin.allowed||await rpc('is_owner')!==true)return;
  const uid=runtime.session?.user?.id;
  const currentData=firstRow(await rpc('ts_get_booking_settings'));
  if(uid!==runtime.session?.user?.id||!runtime.admin.allowed||!currentData)return;
  const title='Configurar agendamentos';
  const fields=[
   ['booking_min_advance_hours','Antecedência mínima (horas)','number',0,1],
   ['booking_cancel_min_hours','Antecedência para cancelar (horas)','number',0,1],
   ['tracking_release_minutes','Antecedência do acompanhamento (minutos)','number',0,1],
   ['booking_max_passengers','Máximo de passageiros','number',1,1],
   ['booking_max_stops','Máximo de paradas','number',0,1],
   ['passenger_surcharge_threshold','Aplicar acréscimo acima de quantos passageiros?','number',1,1],
   ['passenger_surcharge_percentage','Acréscimo por quantidade de passageiros (%)','number',0,0.01],
   ['booking_max_advance_days','Antecedência máxima (dias). Deixe vazio para ilimitada.','number',1,1]
  ];
  const host=openDialog(title,`<form id="ts315OwnerForm">${fields.map(([key,label,type,min,step,max],i)=>{
   const val=currentData[key],shown=Array.isArray(val)?val.join('\n'):val??'';
   const attr=`id="ts315Owner${i}" name="${key}"`;
   return `<label for="ts315Owner${i}">${esc(label)}</label>`+(type==='textarea'?
    `<textarea ${attr}>${esc(shown)}</textarea>`:
    `<input ${attr} type="${type}" value="${esc(shown)}"${type==='number'?` min="${min}" step="${step}"${max!=null?` max="${max}"`:''}${key==='booking_max_advance_days'?'':' required'}`:''}>`);
  }).join('')}<p id="ts315OwnerError" class="field-error" role="alert"></p><button class="primary" type="submit">Salvar alterações</button></form>`);
  host.querySelector('form').onsubmit=async e=>{
   e.preventDefault();if(modalBusy||uid!==runtime.session?.user?.id)return;
   const values=Object.fromEntries(new FormData(e.currentTarget).entries());
   const button=e.currentTarget.querySelector('button[type=submit]');
   modalBusy=true;button.disabled=true;
   try{
    const params=Object.fromEntries(Object.entries(values).map(([key,val])=>['p_'+key.replace(/^booking_|^passenger_/,''),val===''?null:Number(val)]));
    await rpc('ts_owner_update_booking_settings',params);
    if(uid===runtime.session?.user?.id){
     void loadDispatchRules(true);
     openDialog('Configuração atualizada','<p>Alterações salvas.</p>');
    }
   }catch(err){if(uid===runtime.session?.user?.id&&$('ts315OwnerError'))statusError('ts315OwnerError',err)}
   finally{modalBusy=false;button.disabled=false}
  };
 }
 async function adminRatings(driverId=null){
  if(!runtime.admin.allowed)return;
  const uid=runtime.session?.user?.id;
  const host=openDialog('Avaliações de motoristas',`<label for="ts315RatingsDriver">Motorista</label>
   <select id="ts315RatingsDriver"><option value="">Todos os motoristas</option>
    ${runtime.admin.drivers.map(d=>`<option value="${esc(d.driver_id)}">${esc(d.full_name||d.driver_id)}</option>`).join('')}</select>
   <div id="ts315AdminRatings" aria-live="polite"></div>`);
  const select=host.querySelector('select');
  if(driverId)select.value=driverId;
  let loadSequence=0;
  async function load(){
   const sequence=++loadSequence;
   const target=$('ts315AdminRatings');
   target.textContent='Consultando avaliações…';
   try{
    const result=await rpc('ts_admin_list_driver_ratings',{p_driver_id:select.value||null});
    if(uid!==runtime.session?.user?.id||sequence!==loadSequence||!runtime.admin.allowed)return;
    const rows=result?.ratings??result;
    target.innerHTML=(Array.isArray(rows)?rows:[]).map(r=>`<div class="f314card">
     <h3>${esc(r.driver_name||r.driver_full_name||runtime.admin.drivers.find(d=>d.driver_id===r.driver_id)?.full_name||'Motorista')} · ${esc(r.rating)} de 5</h3>
     ${r.booking_id?field('Reserva','#'+shortId({id:r.booking_id})):''}
     ${r.created_at?field('Data',new Date(r.created_at).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})):''}
     ${Array.isArray(r.compliments)&&r.compliments.length?field('Elogios',r.compliments.join(' · ')):''}
     ${r.comment?field('Comentário',r.comment):''}</div>`).join('')||'<p class="soft-note">Nenhuma avaliação encontrada.</p>';
   }catch(err){if(sequence===loadSequence)target.textContent=messageError(err)}
  }
  select.onchange=()=>void load();
  await load();
 }
 function initCompany(){
  $('ts315OwnerRules').onclick=()=>ownerForm().catch(err=>openDialog('Configuração indisponível',`<p>${esc(messageError(err))}</p>`));
  $('ts315AdminAbout').onclick=()=>editAboutPage().catch(err=>openDialog('Configuração indisponível',`<p>${esc(messageError(err))}</p>`));
  $('ts315AdminRoster').onclick=()=>editDriverPhotos().catch(err=>openDialog('Fotos indisponíveis',`<p>${esc(messageError(err))}</p>`));
  $('ts315AdminRatingButton').onclick=()=>void adminRatings();

 }
 async function loadDispatchRules(){return window.ts315LoadDispatchRules?.()}

 const aboutIcons={
  transfer:'Carro','city-tour':'Câmera',chauffeur:'Motorista',wedding:'Alianças'
 };
 const aboutDefaults=[
  {title:'Transfer',description:'Aeroportos, hotéis e destinos.',icon:'transfer'},
  {title:'City Tour',description:'Experiências e roteiros personalizados.',icon:'city-tour'},
  {title:'Motorista à disposição',description:'Mobilidade com flexibilidade.',icon:'chauffeur'},
  {title:'Casamento',description:'Transporte para momentos especiais.',icon:'wedding'}
 ];
 function aboutServices(value){
  const rows=Array.isArray(value)?value:String(value||'').split(/\r?\n/);
  return rows.map((item,i)=>{
   const fallback=Object.keys(aboutIcons)[i]||'transfer';
   if(typeof item==='string')return {title:item.trim(),description:'',icon:fallback,image_url:''};
   return {
    title:String(item?.title||'').trim(),description:String(item?.description||'').trim(),
    icon:Object.hasOwn(aboutIcons,item?.icon)?item.icon:fallback,image_url:webUrl(item?.image_url)
   };
  }).filter(item=>item.title);
 }
 async function readAboutPage(){
  for(const name of ['ts_get_company_about_page','ts_get_company_about']){
   try{return firstRow(await rpc(name))}
   catch(err){if(!missingRoutine(err))throw err}
  }
  return null;
 }
 async function renderAbout(){
  if(!isClient())return;
  const seq=identityVersion, host=$('ts315About');
  host.innerHTML='<p class="client-panel client-empty" role="status">Carregando dados da empresa…</p>';
  try{
   const data=await readAboutPage();
   if(seq!==identityVersion||!isClient())return;
   const title=String(data?.title||'').trim();
   const description=String(data?.description||'').trim()||
    'A Transfer Sudeste atua no transporte executivo e receptivo, proporcionando uma experiência de alto padrão, com atenção a cada detalhe da sua viagem.';
   const hero=webUrl(data?.hero_photo_url), team=webUrl(data?.photo_url);
   const configured=aboutServices(data?.services);
   const services=configured.length?configured:aboutDefaults;
   host.innerHTML=`<section class="client-panel client-company-hero client-about-hero${hero?' has-photo':''}">
    ${hero?`<img class="ts315-about-background" src="${esc(hero)}" alt="">`:''}
    <h2>${esc(title&&title.toLocaleLowerCase('pt-BR')!=='sobre nós'?title:'Excelência em cada trajeto.')}</h2><p>${esc(description)}</p>
    <ul class="client-about-values">${[['shield','Segurança'],['seat','Conforto'],['clock','Pontualidade']].map(([name,label])=>`<li>${icon(name)}<span>${label}</span></li>`).join('')}</ul>
   </section>
   <section class="client-company-section"><h2>${esc(data?.services_title||'Nossos serviços')}</h2>
    <div class="client-panel client-company-list">${services.map((service,index)=>`<button type="button" class="client-company-row" data-about-service-index="${index}">
     ${service.image_url?`<span class="client-feature-icon"><img src="${esc(service.image_url)}" alt="" loading="lazy"></span>`:featureIcon(service.icon)}
     <span><strong>${esc(service.title)}</strong>${service.description?`<small>${esc(service.description)}</small>`:''}</span>${icon('right')}
    </button>`).join('')}</div>
   </section>
   <section class="client-company-section"><h2>${esc(data?.team_title||'Nossa equipe')}</h2>
    <p class="client-about-team-intro">Profissionais comprometidos com a qualidade do seu atendimento.</p>
    ${team?`<img class="ts315-about-team" src="${esc(team)}" alt="${esc(data?.team_title||'Equipe da Transfer Sudeste')}" loading="lazy">`:''}
    <div id="ts315AboutRoster" class="ts315-roster"><p class="soft-note" role="status">Carregando fotos da equipe…</p></div>
   </section>
   <section class="client-panel client-about-cta">
    ${icon('pin')}<h2>Seu próximo destino começa aqui.</h2>
    <button type="button" class="primary" data-about-destination="agenda">Agendar serviço ${icon('arrow')}</button>
    <button type="button" class="client-secondary-button" data-about-destination="contact">Entre em contato</button>
   </section>`;
   for(const button of host.querySelectorAll('[data-about-destination]')){
    button.onclick=()=>window.tsNavigate(button.dataset.aboutDestination==='agenda'?pages[0]:pages[4]);
   }
   for(const button of host.querySelectorAll('[data-about-service-index]')){
    const service=services[Number(button.dataset.aboutServiceIndex)];
    button.onclick=()=>{
     openDialog(service.title,service.description?`<p>${esc(service.description)}</p>`:'');
     const bookable=service.icon==='transfer';
     actions([[bookable?'Agendar serviço':'Entre em contato',()=>{closeDialog();window.tsNavigate(bookable?pages[0]:pages[4])},'primary']]);
    };
   }
   void renderCompanyRoster($('ts315AboutRoster'),seq);
  }catch{
   if(seq===identityVersion&&isClient())host.innerHTML='<p class="client-panel client-empty" role="alert">Não foi possível carregar Sobre nós. Tente novamente em instantes.</p>';
  }
 }
 function aboutEditField(name,label,value='',type='text',required=false){
  const attribute=`name="${name}"${required?' required':''}`;
  const input=type==='textarea'?`<textarea ${attribute} rows="3">${esc(value||'')}</textarea>`:
   `<input ${attribute} type="${type}" value="${esc(value||'')}">`;
  return `<label class="ts315-about-field"><span>${label}</span>${input}</label>`;
 }
 function aboutServiceFields(service={}){
  const options=Object.entries(aboutIcons).map(([key,label])=>
   `<option value="${key}"${service.icon===key?' selected':''}>${label}</option>`).join('');
  return `<fieldset class="f314card ts315-about-edit-service" data-about-service>
   <legend>Serviço</legend>
   ${aboutEditField('title','Nome do serviço',service.title,'text',true)}
   ${aboutEditField('description','Descrição do serviço',service.description,'textarea')}
   <label class="ts315-about-field"><span>Ícone do serviço</span><select name="icon">${options}</select></label>
   ${aboutEditField('image_url','URL da imagem do serviço (opcional)',service.image_url,'url')}
   <button type="button" class="back" data-about-remove>Remover serviço</button>
  </fieldset>`;
 }
 async function editAboutPage(){
  if(!runtime.admin.allowed)return;
  const uid=runtime.session?.user?.id, source=activePage();
  const data=firstRow(await rpc('ts_get_company_about_page'));
  if(uid!==runtime.session?.user?.id||!runtime.admin.allowed||source!==activePage())return;
  if(!data)throw Error('Configuração da empresa indisponível.');
  const host=openDialog('Editar Sobre nós',`<form id="ts315AboutEdit">
   ${aboutEditField('title','Título da página',data.title,'text',true)}
   ${aboutEditField('description','Texto institucional',data.description,'textarea')}
   ${aboutEditField('hero_photo_url','URL da imagem de fundo',data.hero_photo_url,'url')}
   ${aboutEditField('team_title','Título da seção da equipe',data.team_title||'Nossa equipe','text',true)}
   ${aboutEditField('photo_url','URL da foto da equipe',data.photo_url,'url')}
   ${aboutEditField('services_title','Título da seção de serviços',data.services_title||'Nossos serviços','text',true)}
   <div id="ts315AboutServicesEdit">${aboutServices(data.services).map(aboutServiceFields).join('')}</div>
   <button type="button" class="back ts315-about-add" id="ts315AboutAddService">Adicionar serviço</button>
   <p class="field-error" id="ts315AboutError" role="alert"></p>
   <button type="submit" class="primary">Salvar alterações</button>
  </form>`);
  const form=host.querySelector('form'), services=$('ts315AboutServicesEdit');
  $('ts315AboutAddService').onclick=()=>{
   services.insertAdjacentHTML('beforeend',aboutServiceFields());
   services.lastElementChild.querySelector('input').focus();
  };
  services.onclick=e=>{
   const button=e.target.closest('[data-about-remove]');
   if(button)button.closest('[data-about-service]').remove();
  };
  form.onsubmit=async e=>{
   e.preventDefault();
   if(modalBusy||uid!==runtime.session?.user?.id||!runtime.admin.allowed)return;
   const values=(scope,keys)=>Object.fromEntries(keys.map(key=>[key,scope.querySelector(`[name="${key}"]`).value.trim()]));
   const page=values(form,['title','description','hero_photo_url','team_title','photo_url','services_title']);
   page.services=[...services.children].map(item=>values(item,['title','description','icon','image_url']));
   const photos=[page.hero_photo_url,page.photo_url,...page.services.map(item=>item.image_url)];
   if(photos.some(url=>url&&!webUrl(url))){
    write('ts315AboutError','Use endereços HTTP ou HTTPS para as imagens.');return;
   }
   const save=form.querySelector('button[type=submit]');
   modalBusy=true;save.disabled=true;
   write('ts315AboutError','');
   try{
    await rpc('ts_admin_update_company_about_page',{p_page:page});
    if(uid===runtime.session?.user?.id&&runtime.admin.allowed){
     openDialog('Sobre nós atualizado','<p>Alterações salvas.</p>');
    }
   }catch(err){
    if(uid===runtime.session?.user?.id&&$('ts315AboutError'))statusError('ts315AboutError',err);
   }finally{modalBusy=false;save.disabled=false}
  };
 }

 const driverExamplePhotos=Array.from({length:20},(_,index)=>{
  const file='motorista-'+String(index+1).padStart(2,'0')+'.webp';
  return new URL('../../../assets/images/equipe/'+file,import.meta.url).href;
 });
 const driverPhotoBucket='ts-about-driver-photos';
 async function driverPhotoList(){
  const result=await rpc('ts_get_company_about_driver_photos').catch(err=>{
   if(missingRoutine(err))return {photos:null};
   throw err;
  });
  const photos=result?.photos;
  if(photos===null)return driverExamplePhotos.map((_,i)=>({example:i+1}));
  if(!Array.isArray(photos))throw Error('A lista de fotos da equipe está indisponível.');
  return photos;
 }
 async function driverPhotoStorage(path,options={}){
  const uid=runtime.session?.user?.id, s=await current();
  if(!uid||s?.user?.id!==uid)throw Error('Entre na sua conta para continuar.');
  return req('/storage/v1/object/'+path,{...options,headers:{
   Authorization:'Bearer '+s.access_token,...(options.headers||{})
  }});
 }
 async function driverPhotoSources(photos){
  const paths=[...new Set(photos.map(photo=>photo.path).filter(Boolean))];
  if(!paths.length)return new Map();
  const result=await driverPhotoStorage('sign/'+driverPhotoBucket,{
   method:'POST',body:JSON.stringify({paths,expiresIn:3600})
  });
  if(!Array.isArray(result))throw Error('Não foi possível carregar as fotos da equipe.');
  const sources=new Map();
  for(const item of result){
   const path=item?.path, url=item?.signedURL||item?.signedUrl;
   if(item?.error||!paths.includes(path)||typeof url!=='string')continue;
   if(url.startsWith('/object/sign/'+driverPhotoBucket+'/'))sources.set(path,BASE+'/storage/v1'+url);
   else if(url.startsWith(BASE+'/storage/v1/object/sign/'+driverPhotoBucket+'/'))sources.set(path,url);
   else if(url.startsWith('/storage/v1/object/sign/'+driverPhotoBucket+'/'))sources.set(path,BASE+url);
  }
  return sources;
 }
 function driverPhotoSource(photo,sources){
  return photo?.path?sources.get(photo.path):driverExamplePhotos[photo?.example-1];
 }
 async function renderCompanyRoster(host,seq){
  const section=host.closest('section');
  const ready=()=>seq===identityVersion&&isClient()&&host.isConnected;
  try{
   const photos=await driverPhotoList();
   const sources=await driverPhotoSources(photos);
   if(!ready())return;
   const tiles=photos.flatMap((photo,i)=>{
    const src=driverPhotoSource(photo,sources);
    return src?[{src,example:!!photo.example,index:i+1}]:[];
   });
   if(!tiles.length&&!section.querySelector('.ts315-about-team')){
    if(!photos.length){section.remove();return}
    host.textContent='As fotos da equipe estão indisponíveis.';
    return;
   }
   const allExamples=tiles.length>0&&tiles.every(tile=>tile.example);
   host.innerHTML=`<div class="ts315-roster-grid">${tiles.map(tile=>`<figure class="ts315-roster-photo">
     <img src="${esc(tile.src)}" alt="${tile.example?'Retrato ilustrativo':'Foto da equipe'} ${tile.index}" loading="lazy" decoding="async" width="216" height="288">
     ${tile.example&&!allExamples?'<span class="ts315-roster-badge">Ilustrativa</span>':''}
    </figure>`).join('')}</div>`+
    (tiles.length<photos.length?'<p class="soft-note">Algumas fotos da equipe estão indisponíveis.</p>':'');
  }catch{
   if(ready())host.textContent='Não foi possível carregar as fotos da equipe.';
  }
 }
 async function resizeDriverPhoto(file){
  const objectUrl=URL.createObjectURL(file);
  try{
   const img=new Image();
   await new Promise((resolve,reject)=>{
    img.onload=resolve;
    img.onerror=()=>reject(Error('Não foi possível abrir a imagem. Escolha um arquivo JPG, PNG ou WebP.'));
    img.src=objectUrl;
   });
   const canvas=document.createElement('canvas');
   canvas.width=480;canvas.height=640;
   const ctx=canvas.getContext('2d');
   if(!ctx)throw Error('Não foi possível preparar a imagem.');
   ctx.fillStyle='#151515';ctx.fillRect(0,0,canvas.width,canvas.height);
   const ratio=canvas.width/canvas.height;
   const width=Math.min(img.naturalWidth,img.naturalHeight*ratio);
   const height=width/ratio;
   ctx.drawImage(img,(img.naturalWidth-width)/2,(img.naturalHeight-height)/2,width,height,0,0,canvas.width,canvas.height);
   return await new Promise((resolve,reject)=>canvas.toBlob(blob=>{
    if(blob)resolve(blob);
    else reject(Error('Não foi possível salvar a imagem.'));
   },'image/jpeg',.88));
  }finally{URL.revokeObjectURL(objectUrl)}
 }
 async function uploadDriverPhoto(file,uid){
  const data=await resizeDriverPhoto(file);
  if(uid!==runtime.session?.user?.id||!runtime.admin.allowed)throw Error('Sessão encerrada.');
  const path='motoristas/'+crypto.randomUUID()+'.jpg';
  await driverPhotoStorage(driverPhotoBucket+'/'+path,{
   method:'POST',body:data,headers:{'Content-Type':'image/jpeg','x-upsert':'false'}
  });
  return path;
 }
 async function editDriverPhotos(){
  if(!runtime.admin.allowed)return;
  const uid=runtime.session?.user?.id, source=activePage();
  const photos=await driverPhotoList(), sources=await driverPhotoSources(photos);
  if(uid!==runtime.session?.user?.id||!runtime.admin.allowed||source!==activePage())return;
  const entries=photos.map(photo=>({photo}));
  const host=openDialog('Editar fotos da equipe',`<form id="ts315RosterEdit">
   <fieldset class="ts315-roster-controls">
    <div class="ts315-roster-editor" id="ts315RosterEditor"></div>
    <button class="back ts315-roster-add" type="button" id="ts315RosterAdd">Adicionar foto</button>
    <p id="ts315RosterStatus" role="status"></p>
    <button class="primary" type="submit">Salvar fotos</button>
   </fieldset>
  </form>`);
  const form=host.querySelector('form'), editor=$('ts315RosterEditor'), controls=form.querySelector('fieldset');
  const cleanup=()=>entries.forEach(entry=>{if(entry.preview)URL.revokeObjectURL(entry.preview)});
  dialog.addEventListener('close',cleanup,{once:true});

  function draw(){
   editor.innerHTML=entries.map((entry,i)=>{
    const src=entry.preview||driverPhotoSource(entry.photo,sources);
    return `<div class="f314card ts315-roster-edit-card" data-roster-index="${i}">
     ${src?`<img class="ts315-roster-photo" src="${esc(src)}" alt="Prévia da foto ${i+1}" loading="lazy">`:''}
     <button class="back" type="button" data-roster-select aria-label="Selecionar foto ${i+1}">${src?'Trocar foto':'Selecionar foto'}</button>
     <input type="file" accept="image/*" hidden data-roster-file aria-label="Arquivo da foto ${i+1}">
     <button class="back" type="button" data-roster-remove aria-label="Remover foto ${i+1}">Remover</button>
    </div>`;
   }).join('');
  }
  $('ts315RosterAdd').onclick=()=>{
   entries.push({});draw();
   editor.lastElementChild.querySelector('[data-roster-file]').click();
  };
  editor.onclick=e=>{
   const tile=e.target.closest('[data-roster-index]');
   if(!tile||modalBusy)return;
   if(e.target.closest('[data-roster-select]'))tile.querySelector('[data-roster-file]').click();
   if(e.target.closest('[data-roster-remove]')){
    const [removed]=entries.splice(Number(tile.dataset.rosterIndex),1);
    if(removed.preview)URL.revokeObjectURL(removed.preview);
    draw();
   }
  };
  editor.onchange=e=>{
   if(!e.target.matches('[data-roster-file]')||!e.target.files[0])return;
   const entry=entries[Number(e.target.closest('[data-roster-index]').dataset.rosterIndex)];
   if(entry.preview)URL.revokeObjectURL(entry.preview);
   entry.file=e.target.files[0];entry.preview=URL.createObjectURL(entry.file);entry.uploadedPath=null;
   draw();
  };
  form.onsubmit=async e=>{
   e.preventDefault();
   if(modalBusy||uid!==runtime.session?.user?.id||!runtime.admin.allowed)return;
   if(entries.some(entry=>!entry.photo&&!entry.file)){
    write('ts315RosterStatus','Selecione os arquivos das novas fotos ou remova as posições vazias.');
    return;
   }
   modalBusy=true;controls.disabled=true;
   try{
    for(const [i,entry] of entries.entries()){
     if(entry.file&&!entry.uploadedPath){
      write('ts315RosterStatus','Enviando foto '+(i+1)+' de '+entries.length+'…');
      entry.uploadedPath=await uploadDriverPhoto(entry.file,uid);
     }
    }
    if(uid!==runtime.session?.user?.id||!runtime.admin.allowed)return;
    write('ts315RosterStatus','Salvando fotos…');
    await rpc('ts_admin_update_company_driver_photos',{
     p_photos:entries.map(entry=>entry.uploadedPath?{path:entry.uploadedPath}:entry.photo)
    });
    if(uid!==runtime.session?.user?.id||!runtime.admin.allowed)return;
    cleanup();dialog.removeEventListener('close',cleanup);
    openDialog('Fotos da equipe atualizadas','<p>Alterações salvas.</p>');
   }catch(err){
    if(uid===runtime.session?.user?.id&&$('ts315RosterStatus'))statusError('ts315RosterStatus',err);
   }finally{modalBusy=false;controls.disabled=false}
  };
  draw();
 }
 return {init,sessionChanged,applyNav,checkRole,isClient,rpc,preparePhone,phoneField,readPhone,loadProfile};
}
