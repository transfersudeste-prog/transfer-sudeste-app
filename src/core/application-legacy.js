import {dispatchOffersEnabled} from './features.js';
import {createRealtimeConnection} from './realtime/connection.js';
import {SUPABASE_URL as BASE, SUPABASE_PUBLIC_KEY as KEY, request as req} from './supabase/http.js';
import {createSessionStore, readStoredSession} from './auth/session.js';
import {createAreaResolver} from './permissions/resolve-area.js';
import {initAccountProfile} from '../shared/components/account-profile.js';
import {interfaceIcon} from '../shared/components/interface-icons.js';
import {createAdmin} from '../modules/admin/index.js';
import {initManagementTabs} from '../modules/admin/management-tabs.js';
import {installOwnerNavigation} from '../modules/admin/owner-navigation.js';
import {installOwnerOperations,isBookingId} from '../modules/admin/owner-operations.js';
import {createDriver} from '../modules/driver/index.js';
import {renderDriverEarnings,renderDriverCompany} from '../modules/driver/dashboard.js';
import {createClient} from '../modules/client/index.js';

// Optional administrative features must not prevent account initialization.
const optionalModule = (promise, name) => promise.catch(error => { console.error(name, error); return null; });
const [dispatchModule, offerModule] = await Promise.all([
 optionalModule(import('../modules/admin/owner-dispatch-view.js'), 'Despacho manual'),
 dispatchOffersEnabled ? optionalModule(import('../features/dispatch-offers/index.js'), 'Fila virtual') : null
]);
const offerFactory = offerModule?.createDispatchOffers;

(()=>{'use strict';

const $=id=>document.getElementById(id);
const money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let mode='login',afterLogin=null,authBusy=false,bookingBusy=false;
const realtime=createRealtimeConnection({url:BASE,publicKey:KEY});
let ts312Timer=null,ts312Busy=false,ts312Dirty=false,ts312Last=0;
function ts312Stop(){
 realtime.disconnect('admin');
 clearTimeout(ts312Timer);
 ts312Dirty=false;
}
function ts312Active(){return !!(!document.hidden&&admin.allowed&&auth.session?.user?.id&&document.querySelector('#administracao.active'));}
async function ts312Refresh(){
 if(!ts312Active()||ts312Busy)return;
 // Do not replace a driver's unsaved assignment or an open editing dialog.
 if(document.activeElement?.matches('.ts-assign-select')||Array.from(document.querySelectorAll('.ts-assign-select')).some(el=>el.value!==(admin.rows.find(b=>String(b.id)===el.dataset.booking)?.driver_id||'')))return;
 ts312Busy=true;const uid=auth.session.user.id;ts312Dirty=false;
 try{const se=await current();if(!se||se.user.id!==uid)return;const rows=await req('/rest/v1/bookings?select=*&deleted_at=is.null&order=created_at.desc&limit=150',{headers:{Authorization:'Bearer '+se.access_token}});if(!ts312Active()||auth.session.user.id!==uid)return;if(Array.isArray(rows)&&JSON.stringify(rows)!==JSON.stringify(admin.rows)){admin.rows=rows;await tsLoadDriverLookup(rows);if(ts312Active()&&auth.session.user.id===uid)admin.render();}ts312Last=Date.now();}catch(e){ts312Dirty=true;console.warn('Atualização automática:',e)}finally{ts312Busy=false;}
}
function ts312Connect(activeSession){
 if(!ts312Active()||!activeSession||activeSession.user.id!==auth.session?.user?.id){
  ts312Stop();return;
 }
 realtime.connect({
  owner:'admin',
  token:activeSession.access_token,
  topics:[
   {topic:'realtime:ts_admin_bookings',changes:[{event:'*',schema:'public',table:'bookings'}]},
   ...(admin.isOwner?[{topic:'realtime:ts_owner_finance',changes:[{event:'*',schema:'public',table:'driver_financial_entries'}]}]:[]),
   ...(dispatchOffers?[{topic:'realtime:ts:dispatch:admin',isPrivate:true}]:[])
  ],
  onUpdate(){
   operations.refreshSoon();
   void dispatchOffers?.syncAdmin();
   ts312Dirty=true;
   clearTimeout(ts312Timer);
   ts312Timer=setTimeout(ts312Refresh,250);
  }
 });
}
setInterval(()=>{
 if(!ts312Active()){ts312Stop();return}
 void current().then(ts312Connect);
 if(ts312Dirty||(!realtime.isReady('admin')&&Date.now()-ts312Last>12000))void ts312Refresh();
},4000);
document.addEventListener('visibilitychange',()=>{
 if(ts312Active()){ts312Dirty=true;void current().then(ts312Connect);void ts312Refresh()}
 else if(document.hidden)ts312Stop();
});
const runtime={
 realtime,
 get session(){return auth.session},
 get driver(){return driver},
 get admin(){return admin},
 get client(){return ts315},
 get dispatchOffers(){return dispatchOffers},
 get lastAdminSync(){return ts312Last},
 set lastAdminSync(value){ts312Last=value}
};

function feedback(t){$('authFeedback').textContent=t}
function messageError(err){const t=String(err?.message||err||'Erro desconhecido');if(/Invalid login credentials/i.test(t))return 'E-mail ou senha incorretos.';if(/Email not confirmed/i.test(t))return 'Confirme seu e-mail pelo link recebido antes de entrar.';if(/User already registered/i.test(t))return 'Este e-mail já possui uma conta.';if(/Password should be/i.test(t))return 'Senha rejeitada pelas regras de senha do Supabase. Verifique Authentication → Settings → Password Security.';return t}
const auth=createSessionStore({
 request:req,
 beforeIdentityChange(){
  realtime.disconnect();
  dispatchOffers?.sessionChanged();
  ts312Stop();
  driver.reset();
  admin.allowed=false;
  admGeral.reset();
  operations.reset();
  admin.rows=[];
  admin.drivers=[];
  $('driverPanelBookings').textContent='';
  $('ts318DriverDetail').innerHTML='';
  $('ts318Confirm').classList.add('hidden');
  $('driverChangeModal').classList.add('hidden');
 },
 changed(previous,next){
  ts315.sessionChanged(previous,next);
  renderAuth();
 }
});
const {current,set:setSession}=auth;
function renderAuth(){const logged=!!auth.session?.user;$('accountButton').textContent=logged?'Minha conta':'Entrar';$('authSigned').classList.toggle('hidden',!logged);$('authForms').classList.toggle('hidden',logged);if(logged){$('authUser').textContent='Conectado como '+(auth.session.user.email||'cliente');if(!$('clientEmail').value&&!$('clientEmail').dataset.touched&&!admin.allowed)$('clientEmail').value=auth.session.user.email||''}if(document.querySelector('#reservas.active'))loadBookings()}
function selectMode(m){mode=m;$('tabLogin').classList.toggle('selected',m==='login');$('tabSignup').classList.toggle('selected',m==='signup');$('authSubmit').textContent=m==='login'?'Entrar':'Criar conta';$('authPassword').autocomplete=m==='login'?'current-password':'new-password';feedback('')}
let accountReturnPage=null;
function openAuth(callback=null){
 const active=document.querySelector('.view.active')?.id;
 if(active!=='conta'){
  accountReturnPage=active==='motoristaPainel'?driver.currentPage:active;
 }
 afterLogin=callback;$('ts315PasswordHint').textContent='Defina sua nova senha para recuperar o acesso.';$('authReset').classList.add('hidden');window.tsNavigate('conta');renderAuth()}
$('clientEmail').addEventListener('input',()=>{$('clientEmail').dataset.touched='1'});$('accountButton').onclick=()=>{
 if(auth.session?.user&&$('conta').classList.contains('active')&&!$('authSigned').classList.contains('hidden'))$('accountClose').click();
 else openAuth();
};$('authBack').onclick=()=>window.tsNavigate('home');$('accountClose').onclick=()=>{
 const fallback=admin.allowed?'administracao':'home';
 const back=accountReturnPage;
 afterLogin=null;
 if(back&&back!=='tsRoleAccess'&&$(back)){window.tsNavigate(back);return}
 if(back?.startsWith('motorista')&&driver.role){window.tsNavigate(back);return}
 window.tsNavigate(fallback);
};$('tabLogin').onclick=()=>selectMode('login');$('tabSignup').onclick=()=>selectMode('signup');
$('authSubmit').onclick=async()=>{
 if(authBusy)return;
 const email=$('authEmail').value.trim(), password=$('authPassword').value;
 if(!email||!password){feedback('Informe e-mail e senha.');return}
 const creating=mode==='signup';
 authBusy=true;$('authSubmit').disabled=true;feedback('Aguarde…');
 try{
  const result=await req(creating?'/auth/v1/signup':'/auth/v1/token?grant_type=password',{
   method:'POST',body:JSON.stringify({email,password})
  });
  if(!result.access_token){
   feedback('Cadastro recebido. Confira sua caixa de entrada e confirme o e-mail antes de entrar.');return;
  }
  setSession({...result,expires_at:Math.floor(Date.now()/1000)+result.expires_in});
  const role=await resolveAccountArea();
  if(auth.session?.user?.id!==result.user?.id)return;
  const callback=afterLogin;afterLogin=null;
  if(role==='client'||role==='admin'){
   feedback(creating?'Conta criada.':'Login realizado.');
   openAccountArea(role);
   if(role==='client'&&callback)await callback();
  }else if(role!=='driver')openAccountArea(role);
 }catch(e){feedback(messageError(e))}
 finally{authBusy=false;$('authSubmit').disabled=false}
};
async function signOutAccount(){
 const id=auth.session?.user?.id;
 if(!id)return;
 const s=await current();
 if(auth.session?.user?.id!==id)return;
 accountReturnPage=null;
 if(s)void req('/auth/v1/logout',{method:'POST',headers:{Authorization:'Bearer '+s.access_token}}).catch(()=>{});
 setSession(null);admin.allowed=false;admin.updateNavigation();window.tsNavigate('home');
}
$('authRecover').onclick=async()=>{const email=$('authEmail').value.trim();if(!email){feedback('Digite seu e-mail para receber o link de recuperação.');return}try{await req('/auth/v1/recover?redirect_to='+encodeURIComponent(location.origin+location.pathname),{method:'POST',body:JSON.stringify({email})});feedback('Se o e-mail estiver cadastrado, você receberá instruções de recuperação.')}catch(e){feedback(messageError(e))}};
$('authSavePassword').onclick=async()=>{const pass=$('authNewPassword').value;if(pass.length<6){feedback('A nova senha precisa ter pelo menos 6 caracteres.');return}try{const s=await current();if(!s)throw Error('Link expirado. Solicite outro link de recuperação.');await req('/auth/v1/user',{method:'PUT',headers:{Authorization:'Bearer '+s.access_token},body:JSON.stringify({password:pass})});$('authReset').classList.add('hidden');$('authNewPassword').value='';renderAuth();feedback('Senha atualizada com sucesso.')}catch(e){feedback(messageError(e))}};
async function handleAuthRedirect(){const hash=new URLSearchParams(location.hash.slice(1));const query=new URLSearchParams(location.search);if(hash.get('error_description')){openAuth();feedback(hash.get('error_description'));history.replaceState(null,'',location.pathname);return}if(hash.get('access_token')){const user=await req('/auth/v1/user',{headers:{Authorization:'Bearer '+hash.get('access_token')}}).catch(()=>null);if(user)setSession({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_at:Math.floor(Date.now()/1000)+Number(hash.get('expires_in')||3600),user});const reset=hash.get('type')==='recovery';history.replaceState(null,'',location.pathname);openAuth();if(reset){$('authForms').classList.add('hidden');$('authSigned').classList.add('hidden');$('authReset').classList.remove('hidden')}else feedback('E-mail confirmado. Sua conta está pronta.');return}if(query.get('code')){try{const code=query.get('code');const r=await req('/auth/v1/token?grant_type=pkce',{method:'POST',body:JSON.stringify({auth_code:code,code_verifier:sessionStorage.getItem('ts-code-verifier')||''})});setSession({...r,expires_at:Math.floor(Date.now()/1000)+r.expires_in});history.replaceState(null,'',location.pathname);openAuth()}catch{}}}
// Diagnóstico temporário: usa a sessão local sem exibir ou registrar credenciais.
$('routeTestRun').onclick=async()=>{
 const btn=$('routeTestRun'), output=$('routeTestResult');
 btn.disabled=true;output.textContent='Consultando a função de rotas…';
 try{
  const s=await current();if(!s?.access_token)throw Error('Faça login novamente para testar.');
  const resp=await fetch(BASE+'/functions/v1/calculate-transfer-route',{
   method:'POST',headers:{'Content-Type':'application/json','apikey':KEY,'Authorization':'Bearer '+s.access_token},
   body:JSON.stringify({origin:'Plaza Shopping Niterói, Niterói, RJ, Brasil',destination:'Aeroporto Santos Dumont, Rio de Janeiro, RJ, Brasil',stops:[]})
  });
  const raw=await resp.text();let data;try{data=JSON.parse(raw)}catch{data={error:'Resposta não JSON'}}
  if(!resp.ok){output.textContent='HTTP '+resp.status+' — '+String(data.error||data.message||'Falha na função');return}
  if(data.success!==true)throw Error(String(data.error||'Resposta inesperada'));
  output.textContent='HTTP '+resp.status+' — Rota validada\nDistância: '+data.distance_km+' km\nMesmo município: '+(data.same_municipality?'Sim':'Não')+'\nLimite automático: '+data.maximum_automatic_km+' km\nOrçamento manual: '+(data.requires_quote?'Sim':'Não');
 }catch(err){output.textContent=err instanceof TypeError?'Falha de comunicação (possível bloqueio CORS). Verifique a configuração da Edge Function.':'Falha: '+String(err?.message||err)}
 finally{btn.disabled=false}
};
const prevNavigate=window.tsNavigate;window.tsNavigate=id=>{prevNavigate(id);if(id==='reservas')loadBookings()};
function statusPt(v){const map={pending:'Pendente',in_progress:'Em andamento',confirmed:'Confirmada',approved:'Aprovado',paid:'Pago',completed:'Concluída',cancelled:'Cancelada',canceled:'Cancelada',rejected:'Recusado',failed:'Falhou',refunded:'Reembolsado',processing:'Em análise',awaiting_payment:'Aguardando pagamento',partially_paid:'Parcialmente pago'};return map[String(v||'').toLowerCase()]||String(v||'Não informado')}
window.tsLoadBookings=()=>loadBookings();
const ts307CopyLabels=new Set(['Nome','Telefone','E-mail','Código da reserva','Observações','Número do voo']);
const bookingField=(label,value)=>{const valid=value!=null&&String(value).trim()!=='';const copy=valid&&ts307CopyLabels.has(label);return `<div class="booking-field${copy?' ts307-copyable':''}"><span class="booking-label">${esc(label)}</span><strong>${esc(valid?value:'Não informado')}</strong>${copy?`<button type="button" class="ts307-copy" data-ts307-copy="${esc(String(value))}" title="Copiar ${esc(label)}" aria-label="Copiar ${esc(label)}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></button>`:''}</div>`};

document.addEventListener('click',async e=>{const btn=e.target.closest('.ts307-copy');if(!btn)return;e.preventDefault();e.stopPropagation();const value=btn.getAttribute('data-ts307-copy');if(!value)return;try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value)}else{const area=document.createElement('textarea');area.value=value;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();if(!document.execCommand('copy'))throw Error('Cópia indisponível');area.remove()}btn.classList.add('ts307-copied');btn.setAttribute('aria-label','Copiado');ts308CopiedNotice();setTimeout(()=>{btn.classList.remove('ts307-copied');btn.setAttribute('aria-label','Copiar')},1400)}catch(err){window.prompt('Copie o conteúdo:',value)}});
function ts308CopiedNotice(){let toast=document.getElementById('ts308CopiedToast');if(!toast){toast=document.createElement('div');toast.id='ts308CopiedToast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');toast.textContent='Copiado para a área de transferência';document.body.appendChild(toast)}toast.classList.add('show');clearTimeout(window.ts308ToastTimer);window.ts308ToastTimer=setTimeout(()=>toast.classList.remove('show'),1700)}
const bookingMoney=v=>v==null?'Valor sob consulta':money(Number(v));
const bookingDate=v=>{if(!v)return 'Não informada';const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:String(v)};
const bookingStops=v=>{if(!v)return [];if(Array.isArray(v))return v;if(typeof v==='string'){try{return JSON.parse(v)}catch{return []}}return []};
function bookingDetails(b){const stopList=bookingStops(b.stops);return `<div class="booking-detail" id="booking-detail-${esc(b.id)}"><h3 class="booking-heading">Detalhes do agendamento</h3>${bookingField('Serviço',b.service_type)}${bookingField('Data',bookingDate(b.pickup_date))}${bookingField('Horário',b.pickup_time)}${bookingField('Origem',b.origin)}${bookingField('Destino',b.destination)}${stopList.length?stopList.map((st,i)=>bookingField(`Parada ${i+1}`,`${st.address||'Endereço não informado'}${st.minutes?' — '+st.minutes+' minutos':''}`)).join(''):bookingField('Paradas','Nenhuma')}${bookingField('Passageiros',b.passengers)}${bookingField('Bagagens',b.luggage)}${bookingField('Número do voo',b.flight_number)}${bookingField('Distância',b.distance_km!=null?Number(b.distance_km).toFixed(1).replace('.',',')+' km':null)}${bookingField('Observações',b.notes)}<h3 class="booking-heading">Cliente</h3>${bookingField('Nome',b.client_name)}${bookingField('E-mail',b.client_email)}${bookingField('Telefone',b.client_phone)}${b.booking_for_other_person&&b.passenger_name?'<h3 class="booking-heading">Passageiro do serviço</h3>'+bookingField('Nome',b.passenger_name)+bookingField('Telefone',b.passenger_phone)+(b.passenger_email?bookingField('E-mail',b.passenger_email):''):''}<h3 class="booking-heading">Valores e acompanhamento</h3>${bookingField('Valor total',bookingMoney(b.total_amount))}${bookingField('Valor a cobrar ao final do serviço',b.balance_amount!=null?bookingMoney(b.balance_amount):'A definir')}${tsDriverFull(b)}${bookingField('Status da reserva',statusPt(b.booking_status))}${bookingField('Status do pagamento',statusPt(b.payment_status))}${bookingField('Código da reserva',b.id)}</div>`}
let tsDriverLookup={};
function tsDriverInfo(b){return b.driver_id?(tsDriverLookup[b.driver_id]||null):null}
function tsDriverMini(b){const d=tsDriverInfo(b);if(!b.driver_id)return '<div class="v292-driver"><b>Aguardando designação</b></div>';return `<div class="v292-driver">${d?.profile_photo_url?`<img class="v294-zoom-photo" tabindex="0" role="button" src="${esc(d.profile_photo_url)}" alt="Ampliar foto do motorista" title="Toque para ampliar">`:'<span class="v292-avatar">♙</span>'}<div><b>${esc(d?.full_name||'Motorista designado')}</b></div></div>`}
function tsDriverFull(b){const d=tsDriverInfo(b);return `<h3 class="booking-heading">Motorista e veículo</h3>${tsDriverMini(b)}${d?.vehicle_photo_url?`<img class="v292-car-photo" src="${esc(d.vehicle_photo_url)}" alt="Foto do veículo">`:''}${d?bookingField('Marca e modelo',[d.vehicle_make,d.vehicle_model].filter(Boolean).join(' '))+bookingField('Cor',d.vehicle_color)+bookingField('Placa',d.vehicle_plate):''}`}
async function tsLoadDriverLookup(rows){const s=await current();if(!s)return;const ids=[...new Set(rows.map(b=>b.driver_id).filter(Boolean))];if(!ids.length)return;try{const r=await req('/rest/v1/rpc/booking_driver_public_details',{method:'POST',headers:{Authorization:'Bearer '+s.access_token},body:JSON.stringify({p_booking_ids:rows.filter(b=>b.driver_id).map(b=>b.id)})});for(const d of (Array.isArray(r)?r:[]))if(d.driver_id)tsDriverLookup[d.driver_id]=d}catch(e){console.warn('Dados de motoristas indisponíveis:',e.message)}}
let tsClientMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);
let tsClientSelected='';
let tsClientRows=[];
function tsClientCalendar(){
 const m=tsClientMonth,year=m.getFullYear(),month=m.getMonth();
 const counts={};tsClientRows.forEach(b=>{const d=String(b.pickup_date||'').slice(0,10);if(d)counts[d]=(counts[d]||0)+1});
 const first=(new Date(year,month,1).getDay()+6)%7;
 const days=new Date(year,month+1,0).getDate();
 const monthLabel=m.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
 let cells='';for(let i=0;i<first;i++)cells+='<span class="ts-cal-empty"></span>';
 for(let d=1;d<=days;d++){
 const key=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
 cells+=`<button type="button" class="ts-cal-day ${counts[key]?'has-booking':''} ${tsClientSelected===key?'selected':''}" data-ts-day="${key}" aria-label="${d} de ${monthLabel}${counts[key]?', '+counts[key]+' reservas':''}">${d}${counts[key]?'<i></i>':''}</button>`;
 }
 return `<div class="ts-client-calendar"><div class="ts-cal-header"><strong>Calendário de reservas</strong><div class="ts-cal-actions"><button type="button" data-ts-month="-1" aria-label="Mês anterior">‹</button><span>${esc(monthLabel)}</span><button type="button" data-ts-month="1" aria-label="Próximo mês">›</button></div></div><div class="ts-cal-week">${['S','T','Q','Q','S','S','D'].map(x=>'<span>'+x+'</span>').join('')}</div><div class="ts-cal-grid">${cells}</div><div class="ts-cal-foot"><span><i></i> Datas com reservas</span><button type="button" data-ts-clear ${!tsClientSelected?'disabled':''}>${tsClientSelected?'Ver todas as reservas':'Todas as datas'}</button></div></div>`;
}
function tsClientRender(){
 const list=$('bookingList');if(!list)return;
 const rows=tsClientSelected?tsClientRows.filter(b=>String(b.pickup_date||'').slice(0,10)===tsClientSelected):tsClientRows;
 const cards=rows.map((b,i)=>`<article class="ts-booking-card" data-ts-card="${i}"><button type="button" class="ts-booking-main" aria-expanded="false"><div class="ts-booking-top"><span class="ts-booking-date">${esc(bookingDate(b.pickup_date))} <small>• ${esc(String(b.pickup_time||'A definir').slice(0,5))}</small></span><span class="ts-booking-status">${esc(statusPt(b.booking_status))}</span></div><div class="ts-booking-route"><span>${esc(b.origin||'Origem não informada')}</span><span class="ts-route-arrow">↓</span><span>${esc(b.destination||'Destino não informado')}</span></div><div class="v292-stops">${bookingStops(b.stops).map((st,i)=>`<small>Parada ${i+1}: ${esc(st.address||String(st))}</small>`).join('')}</div>${tsDriverMini(b)}<div class="ts-booking-bottom"><strong>${esc(bookingMoney(b.total_amount))}</strong><span>Pagamento: ${esc(statusPt(b.payment_status))}</span></div><div class="ts-booking-more">Abrir reserva <span>↗</span></div></button></article>`).join('');
 list.innerHTML=tsClientCalendar()+`<div class="ts-client-results"><div class="ts-results-head"><strong>${tsClientSelected?'Reservas de '+bookingDate(tsClientSelected):'Seus agendamentos'}</strong><span>${rows.length} ${rows.length===1?'reserva':'reservas'}</span></div>${cards||'<p class="ts-client-empty">Nenhuma reserva encontrada nesta data. Selecione outro dia ou veja todas as reservas.</p>'}</div>`;
 list.querySelectorAll('[data-ts-month]').forEach(btn=>btn.onclick=()=>{tsClientMonth=new Date(tsClientMonth.getFullYear(),tsClientMonth.getMonth()+Number(btn.dataset.tsMonth),1);tsClientRender()});
 list.querySelectorAll('[data-ts-day]').forEach(btn=>btn.onclick=()=>{tsClientSelected=tsClientSelected===btn.dataset.tsDay?'':btn.dataset.tsDay;tsClientRender()});
 const clear=list.querySelector('[data-ts-clear]');if(clear)clear.onclick=()=>{tsClientSelected='';tsClientRender()};
 list.querySelectorAll('[data-ts-card]').forEach(el=>{el.querySelector('.ts-booking-main').onclick=()=>tsOpenBooking(rows[Number(el.dataset.tsCard)],false)});
}

let v292Booking=null;
const v292Modal=$('v292Modal'),v292Notice=$('v292Notice');
function v292Notify(title,msg,buttons=[]){$('v292NoticeTitle').textContent=title;$('v292NoticeText').textContent=msg;const a=$('v292NoticeActions');a.innerHTML='';for(const b of buttons){const btn=document.createElement('button');btn.className='primary';btn.textContent=b.label;btn.onclick=b.action;a.appendChild(btn)}v292Notice.classList.remove('hidden')}
$('v292NoticeClose').onclick=()=>v292Notice.classList.add('hidden');
$('v292Close').onclick=()=>v292Modal.classList.add('hidden');
v292Modal.addEventListener('click',e=>{if(e.target===v292Modal)v292Modal.classList.add('hidden')});
let v292Whatsapp='5521968777045';
async function v292LoadWhatsapp(){try{const se=await current();if(!se)return;const number=await req('/rest/v1/rpc/get_company_whatsapp',{method:'POST',headers:{Authorization:'Bearer '+se.access_token},body:'{}'});if(number)v292Whatsapp=String(number)}catch(e){console.warn('WhatsApp:',e.message)}}
let tsEditAttach=null;

// V31.7 — Ações de compartilhamento disponíveis também na área do motorista.
const tsShareIconMarkup='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V3m0 0L7 8m5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';
function tsFullBookingShare(b){
 const lines=['TRANSFER SUDESTE — DADOS DA RESERVA','Reserva: #'+String(b.id||'').slice(0,8).toUpperCase(),
 'Serviço: '+(b.service_type||'Transfer'),'Data: '+bookingDate(b.pickup_date),'Horário: '+String(b.pickup_time||'').slice(0,5),
 'Origem: '+(b.origin||'Não informada'),'Destino: '+(b.destination||'Não informado')];
 bookingStops(b.stops).forEach((st,i)=>lines.push('Parada '+(i+1)+': '+(st.address||'')));
 for(const [label,value] of [['Cliente',b.client_name],['Telefone',b.client_phone],['Passageiros',b.passengers],['Bagagens',b.luggage],['Voo',b.flight_number],['Observações',b.notes]])if(value!=null&&String(value).trim())lines.push(label+': '+value);
 lines.push('Valor total: '+bookingMoney(b.total_amount));return lines.join('\n');
}
async function tsShareText(text){
 try{if(navigator.share){await navigator.share({text});return}}
 catch(e){if(e?.name==='AbortError')return}
 window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener');
}
function tsOpenBooking(b,admin){v292Booking=b;$('v292Body').innerHTML=bookingDetails(b);$('v292Actions').innerHTML='';if(!admin&&!admin.allowed){const share=document.createElement('button');share.type='button';share.className='ts-share-booking ts-share-detail';share.setAttribute('aria-label','Compartilhar dados completos da reserva');share.title='Compartilhar reserva';share.innerHTML=tsShareIconMarkup;share.onclick=()=>tsShareText(tsFullBookingShare(b));$('v292Actions').appendChild(share)}v292Modal.classList.remove('hidden');if(admin&&tsEditAttach)tsEditAttach(b,true);$('v292Body').querySelectorAll('.v294-zoom-photo').forEach(img=>{img.onclick=()=>v294ShowPhoto(img.src);img.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();v294ShowPhoto(img.src)}}})}
$('adminBookings').addEventListener('click',e=>{const btn=e.target.closest('[data-v292-open]');if(!btn)return;const b=admin.rows.find(x=>x.id===btn.dataset.v292Open);if(b)tsOpenBooking(b,true)});
function v292AddSearch(){const list=$('bookingList');if(!list||list.querySelector('.v292-search'))return;const box=document.createElement('div');box.className='v292-search';box.innerHTML='<input id="v292SearchTerm" type="search" placeholder="Buscar origem, destino, reserva ou motorista" aria-label="Buscar reservas"><button type="button" aria-label="Pesquisar reservas"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></button>';list.prepend(box);const input=box.querySelector('input');box.querySelector('button').onclick=()=>{const term=input.value.trim().toLocaleLowerCase('pt-BR');const cards=[...list.querySelectorAll('.ts-booking-card')];let count=0;for(const c of cards){const match=!term||c.textContent.toLocaleLowerCase('pt-BR').includes(term);c.classList.toggle('hidden',!match);if(match)count++}v292Notify('Pesquisa concluída',count?`${count} reserva(s) encontrada(s).`:'Nenhuma reserva encontrada. Tente outros termos.')};input.addEventListener('keydown',e=>{if(e.key==='Enter')box.querySelector('button').click()})}
const v292OriginalClientRender=tsClientRender;tsClientRender=function(){v292OriginalClientRender();v292AddSearch()};
$('adminSearch').parentElement.insertAdjacentHTML('afterend','<button type="button" id="v292AdminSearchBtn" class="v292-open-admin" style="width:auto;margin:0">⌕ Pesquisar</button>');$('v292AdminSearchBtn').onclick=()=>{admin.render();const n=$('adminCount').textContent;v292Notify('Pesquisa concluída',n+' reserva(s) encontrada(s).')};
async function v292Settings(){const se=await current();if(!se)return;await v292LoadWhatsapp();const owner=await req('/rest/v1/rpc/is_owner',{method:'POST',headers:{Authorization:'Bearer '+se.access_token},body:'{}'}).catch(()=>false);$('v292Settings').classList.toggle('hidden',owner!==true);if(owner===true){const field=$('v292Whatsapp');field.value=v292Whatsapp.replace(/^55/,'');field.defaultValue=field.value}}
$('v292SaveWhatsapp').onclick=async()=>{try{const se=await current();const r=await req('/rest/v1/rpc/owner_update_company_whatsapp',{method:'POST',headers:{Authorization:'Bearer '+se.access_token},body:JSON.stringify({p_number:$('v292Whatsapp').value})});v292Whatsapp=r.whatsapp_number;$('v292Whatsapp').defaultValue=$('v292Whatsapp').value;$('v292SettingsStatus').textContent='WhatsApp atualizado com sucesso.';v292Notify('Configuração salva','O novo WhatsApp foi atualizado para os botões de contato.')}catch(e){v292Notify('Não foi possível salvar',messageError(e))}};
const v292OldNavigate=window.tsNavigate;window.tsNavigate=id=>{v292OldNavigate(id);if(id==='administracao')v292Settings();if(id==='contato'){v292LoadWhatsapp().then(()=>{$('contato').innerHTML='<div class="hero"><h1>Atendimento</h1><p class="sub">Fale com a equipe da Transfer Sudeste.</p><button class="primary" id="v292ContactButton">Conversar pelo WhatsApp</button></div>';$('v292ContactButton').onclick=()=>window.open('https://wa.me/'+v292Whatsapp,'_blank','noopener')})}};
async function loadBookings(){const list=$('bookingList');const s=await current();if(!s){list.innerHTML='<p>Entre na sua conta para consultar suas solicitações.</p><button type="button" class="primary" id="bookLogin">Entrar ou criar conta</button>';$('bookLogin').onclick=()=>openAuth(()=>loadBookings());return}list.innerHTML='<p>Carregando reservas…</p>';try{tsClientRows=await req('/rest/v1/bookings?select=*&client_id=eq.'+encodeURIComponent(s.user.id)+'&deleted_at=is.null&order=pickup_date.desc,created_at.desc&limit=500',{headers:{Authorization:'Bearer '+s.access_token}});await tsLoadDriverLookup(tsClientRows);tsClientRender()}catch(e){list.textContent='Não foi possível consultar as reservas: '+messageError(e)}}

window.tsSubmitBooking=async()=>{
 if(bookingBusy)return;
 if(!admin.allowed){if(!auth.session)openAuth(()=>window.tsNavigate('clienteInicio'));else window.tsNavigate('clienteInicio');return}
 const s=await current();
 if(!s){openAuth(()=>window.tsSubmitBooking());feedback('Entre ou crie uma conta para registrar sua solicitação.');return}
 bookingBusy=true;$('nextStep').disabled=true;$('wizardError').textContent='Registrando sua solicitação…';
 try{
  const selected=document.querySelector('input[name="serviceType"]:checked');
  const serviceCodes={'Transfer':'transfer','City Tour':'city_tour','Motorista à disposição':'hourly_driver','Casamento':'wedding'};
  const service=serviceCodes[selected?.value];
  if(!service||selected.disabled||service!=='transfer')throw Error('Esta modalidade ainda não está disponível para reservas.');
  const stops=$('addStops').checked?[...document.querySelectorAll('.stop-entry')].map(e=>({address:e.querySelector('.stop-address').value.trim(),minutes:Number(e.querySelector('.stop-time').value)})):[];
   const payload={client_id:s.user.id,service_type:service,client_name:$('clientName').value.trim(),client_email:$('clientEmail').value.trim()||null,client_phone:$('clientPhone').value.trim(),origin:$('origin').value.trim(),destination:$('destination').value.trim(),stops,pickup_date:$('tripDate').value,pickup_time:$('tripTime').value,passengers:Number($('passengers').value)||1,luggage:Number($('luggage').value)||0,flight_number:$('flight').value.trim()||null,notes:$('notes').value.trim()||null};
  let id, queued;
  if(dispatchOffers){
   const rules=dispatchRulesUid===s.user.id&&dispatchRules?dispatchRules:await window.ts315LoadDispatchRules();
   if(!Number.isInteger(payload.passengers)||payload.passengers<1||payload.passengers>Number(rules?.booking_max_passengers??7)){
    throw Error('Informe uma quantidade válida de passageiros.');
   }
   await ts315.rpc('ts_validate_booking_rules',{
    p_pickup_date:payload.pickup_date,p_pickup_time:payload.pickup_time,
    p_passengers:payload.passengers,p_stops_count:stops.length
   });
   if(auth.session?.user?.id!==s.user.id||!admin.allowed)return;
   queued=await dispatchOffers.createBooking(payload,window.tsRouteQuote||null);
   if(auth.session?.user?.id!==s.user.id||!admin.allowed)return;
   id=queued.id;
  }else{
   if(dispatchPricePending&&dispatchPricePending.uid!==s.user.id)dispatchPricePending=null;
   id=dispatchPricePending?.id;
   if(!id){
    const rules=dispatchRulesUid===s.user.id&&dispatchRules?dispatchRules:await window.ts315LoadDispatchRules();
    if(!Number.isInteger(payload.passengers)||payload.passengers<1||payload.passengers>Number(rules?.booking_max_passengers??7)){
     throw Error('Informe uma quantidade válida de passageiros.');
    }
    await ts315.rpc('ts_validate_booking_rules',{
     p_pickup_date:payload.pickup_date,p_pickup_time:payload.pickup_time,
     p_passengers:payload.passengers,p_stops_count:stops.length
    });
    const route=window.tsRouteQuote||null;
    const quote=route?await window.ts315DispatchQuote(route,payload.passengers):null;
    if(auth.session?.user?.id!==s.user.id||!admin.allowed)return;
    const response=await ts315.rpc('create_transfer_booking',{p_booking:payload,p_route:route});
    const created=Array.isArray(response)?response[0]:response;
    id=created?.id;
    if(!id)throw Error('O servidor não retornou o código. Confira a Gestão antes de repetir o despacho.');
    if(quote?.amount>0)dispatchPricePending={uid:s.user.id,id,passengers:payload.passengers,quote};
   }
   if(dispatchPricePending){
    try{await finishDispatchPricing(dispatchPricePending)}
    catch(err){throw Error('Despacho #'+String(id).slice(0,8).toUpperCase()+' cadastrado. O acréscimo ainda não foi confirmado. Clique novamente para confirmar o mesmo despacho ou confira a Gestão. '+messageError(err))}
    dispatchPricePending=null;
   }
  }
  window.tsBookingId=id;
  $('wizardError').textContent='';
  const manual=!!admin.allowed;document.getElementById('bookingSuccessTitle').textContent=manual?'Despacho registrado com sucesso!':'Solicitação enviada com sucesso!';const paragraphs=document.querySelectorAll('#bookingSuccess .install-intro');if(paragraphs[0])paragraphs[0].textContent=manual?(queued?.queue_state==='offered'?'A oferta foi enviada pela fila. Acompanhe o aceite na Gestão.':queued?.queue_state==='waiting'?'A reserva aguarda um motorista disponível na fila.':'A reserva foi cadastrada e está disponível na Gestão para acompanhamento, edição e designação de motorista.'):'Recebemos sua solicitação. A equipe verificará a disponibilidade e confirmará o agendamento.';if(paragraphs[1])paragraphs[1].textContent=manual?'':'Acompanhe o andamento na aba Reservas.';document.getElementById('bookingSuccessClose').textContent=manual?'Ver reserva na Gestão':'Ver minhas reservas';
  admGeral.markDispatchSaved();
  window.tsNavigate(admin.isOwner?'admGeralReservas':manual?'administracao':'reservas');
  $('bookingSuccess').classList.remove('hidden');
  await loadBookings();
 }catch(e){$('wizardError').textContent='Não foi possível registrar a solicitação: '+messageError(e)}
 finally{bookingBusy=false;$('nextStep').disabled=false}
};

// V20: consulta administrativa, acessível somente após validação de papel no servidor.
const admin=createAdmin({runtime, $, bookingDate, bookingMoney, bookingStops, current, esc, messageError,
 money, req, statusPt, tsDriverMini, tsLoadDriverLookup});

const inviteToken=new URLSearchParams(location.search).get('driver_invite');
let driverStep=0,driverInviteValid=false,driverSubmitting=false,driverInvitedEmail="";
const dval=k=>($('d_'+k)?.value||'').trim();
$('d_vehicle_plate').addEventListener('input',e=>{let raw=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');let result='';for(let i=0;i<raw.length&&result.length<7;i++){const pos=result.length;const letter=[0,1,2,4].includes(pos);if(letter?/^[A-Z]$/.test(raw[i]):/^[0-9]$/.test(raw[i]))result+=raw[i]}e.target.value=result});
const driverFields=['full_name','date_of_birth','whatsapp','residential_address','vehicle_make','vehicle_model','vehicle_color','vehicle_year','vehicle_model_year','vehicle_plate','pix_key'];
const driverFeedback=t=>$('driverInviteFeedback').textContent=t;
const driverLabels={full_name:'Nome e sobrenome',date_of_birth:'Data de nascimento',whatsapp:'WhatsApp',residential_address:'Endereço residencial',vehicle_make:'Marca do veículo',vehicle_model:'Modelo do veículo',vehicle_color:'Cor do veículo',vehicle_year:'Ano de fabricação',vehicle_model_year:'Ano do modelo',vehicle_plate:'Placa do veículo',pix_key:'Chave PIX'};
function driverStepShow(n){driverStep=n;document.querySelectorAll('#motoristaConvite .driver-page').forEach((e,i)=>e.classList.toggle('active',i===n));document.querySelectorAll('#driverProgress i').forEach((e,i)=>e.classList.toggle('on',i<=n));$('driverBack').style.visibility=n?'visible':'hidden';$('driverNext').textContent=n===3?'Enviar para aprovação':'Continuar';driverFeedback('');if(n===3){$('driverReview').innerHTML=driverFields.map(k=>`<div class="summary-line"><strong>${esc(driverLabels[k])}:</strong> ${esc(k==='pix_key'?'••••••'+dval(k).slice(-4):k==='date_of_birth'&&dval(k)?dval(k).split('-').reverse().join('/'):dval(k)||'Não informado')}</div>`).join('')+`<div class="summary-line"><strong>E-mail de acesso:</strong> ${esc(driverInvitedEmail)}</div>`}window.scrollTo({top:0,behavior:'smooth'})}
function driverValidate(n){if(n===0){if(dval('full_name').split(/\s+/).length<2||!dval('date_of_birth'))return 'Informe nome, sobrenome e data de nascimento.';if(dval('whatsapp').replace(/\D/g,'').length<10)return 'Informe um WhatsApp válido.';}if(n===1){for(const k of ['vehicle_make','vehicle_model','vehicle_color','vehicle_year','vehicle_model_year','vehicle_plate'])if(!dval(k))return 'Preencha todos os dados obrigatórios do veículo.';}if(n===2){if(!dval('pix_key'))return 'Informe a chave PIX.';}if(n===1&&!/^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(dval('vehicle_plate')))return 'Placa inválida. Use ABC1D23.';return ''}
$('driverBack').onclick=()=>{if(driverStep)driverStepShow(driverStep-1);else window.tsNavigate('home')};
$('driverNext').onclick=async()=>{if(!driverInviteValid||driverSubmitting)return;const err=driverValidate(driverStep);if(err){driverFeedback(err);return}if(driverStep<3){driverStepShow(driverStep+1);return}driverSubmitting=true;$('driverNext').disabled=true;driverFeedback('Enviando cadastro…');try{
 let s=await current();if(s){driverFeedback('Há uma conta conectada neste navegador. Saia dela para criar o cadastro de outro motorista.');$('driverInviteSignOut').classList.remove('hidden');return}const generatedPassword=String(crypto.getRandomValues(new Uint32Array(1))[0]%900000+100000);const signup=await req('/auth/v1/signup',{method:'POST',body:JSON.stringify({email:driverInvitedEmail,password:generatedPassword})});if(!signup.access_token)throw Error('O cadastro não iniciou uma sessão. Verifique se a confirmação de e-mail está desativada no Supabase.');setSession({...signup,expires_at:Math.floor(Date.now()/1000)+signup.expires_in});s=await current();
 const data=Object.fromEntries(driverFields.map(k=>[k,dval(k)]));
 for(const [input,key] of [['d_profile_photo','profile_photo_url'],['d_vehicle_photo','vehicle_photo_url']]){const file=$(input).files?.[0];if(!file)continue;if(file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('As fotos devem ser JPG, PNG ou WebP com até 5 MB.');const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';const path=s.user.id+'/'+key+'-'+crypto.randomUUID()+'.'+ext;const r=await fetch(BASE+'/storage/v1/object/driver-media/'+path,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+s.access_token,'Content-Type':file.type,'x-upsert':'false'},body:file});if(!r.ok)throw Error('Não foi possível enviar a foto: '+(await r.text()).slice(0,180));data[key]=BASE+'/storage/v1/object/public/driver-media/'+path}
 await req('/rest/v1/rpc/complete_driver_invitation',{method:'POST',headers:{Authorization:'Bearer '+s.access_token},body:JSON.stringify({p_token:inviteToken,p_data:data})});
 driverInviteValid=false;setSession(null);history.replaceState(null,'',location.pathname);$('driverCredentialEmail').textContent=driverInvitedEmail;$('driverCredentialPassword').textContent=generatedPassword;$('driverCredentialsModal').classList.remove('hidden');driverFeedback('Cadastro enviado com sucesso. Guarde suas credenciais.');
 }catch(e){driverFeedback(messageError(e))}finally{driverSubmitting=false;$('driverNext').disabled=false}};
$('driverInviteSignOut').onclick=async()=>{const s=await current();if(s)await req('/auth/v1/logout',{method:'POST',headers:{Authorization:'Bearer '+s.access_token}}).catch(()=>{});setSession(null);$('driverInviteSignOut').classList.add('hidden');driverFeedback('Sessão anterior encerrada. Agora você pode criar a conta do motorista.');};
async function driverOpenInvite(){if(!inviteToken)return;window.tsNavigate('motoristaConvite');driverStepShow(0);$('driverNext').disabled=true;try{const result=await req('/rest/v1/rpc/validate_driver_invitation',{method:'POST',body:JSON.stringify({p_token:inviteToken})});if(!result.valid)throw Error(result.message||'Convite inválido');driverInviteValid=true;$('driverNext').disabled=false;const logged=await current();if(logged){$('driverInviteSignOut').classList.remove('hidden');driverFeedback('Você está conectado a outra conta. Para cadastrar um novo motorista, encerre essa sessão pelo botão abaixo.');}$('driverInviteIntro').textContent='Convite válido · Cadastro em quatro etapas';driverInvitedEmail=result.invited_email||'';if(!driverInvitedEmail)throw Error('Este convite antigo não contém e-mail. Solicite um novo convite ao administrador.');}catch(e){driverFeedback(messageError(e));$('driverInviteIntro').textContent='Não foi possível validar este convite.'}}
let driverAdminRows=[],driverAdminFilter='pending',driverSelected=null,driverReviewPending=null;
const driverStatusLabel=s=>({pending:'Pendente de aprovação',approved:'Aprovado',rejected:'Rejeitado',disabled:'Desativado'}[s]||s||'Não informado');
function driverAdminRender(){
 const rows=driverAdminRows.filter(d=>driverAdminFilter==='all'||d.approval_status===driverAdminFilter);
 $('driverPendingCount').textContent=driverAdminRows.filter(d=>d.approval_status==='pending').length;
 $('driverApprovedCount').textContent=driverAdminRows.filter(d=>d.approval_status==='approved').length;
 document.querySelectorAll('[data-driver-filter]').forEach(b=>{const on=b.dataset.driverFilter===driverAdminFilter;b.classList.toggle('selected',on);b.setAttribute('aria-selected',String(on))});
 $('driverAdminApps').innerHTML=rows.length?rows.map(d=>`<article class="driver-application"><button type="button" class="driver-open" data-driver-open="${esc(d.user_id)}">${esc(d.full_name||'Motorista')} <span aria-hidden="true">›</span></button><p class="driver-meta">${esc([d.vehicle_make,d.vehicle_model,d.vehicle_plate].filter(Boolean).join(' · ')||'Veículo não informado')}<br>${esc(d.whatsapp||'WhatsApp não informado')}</p><div class="driver-state">${esc(driverStatusLabel(d.approval_status))}</div><div class="driver-card-actions"><button type="button" class="back" data-driver-open="${esc(d.user_id)}">Ver ficha completa</button>${d.approval_status==='pending'?`<button type="button" class="primary" data-driver-review="${esc(d.user_id)}" data-approve="true">Aprovar</button>`:''}</div></article>`).join(''):'<p class="soft-note">Nenhum motorista nesta categoria.</p>';
}
async function driverAdminLoad(){if(!admin.allowed)return;const target=$('driverAdminApps');target.textContent='Carregando motoristas…';try{const s=await current();driverAdminRows=await req('/rest/v1/rpc/admin_list_driver_applications',{method:'POST',headers:{Authorization:'Bearer '+s.access_token},body:'{}'});driverAdminRender()}catch(e){target.textContent='Não foi possível consultar cadastros: '+messageError(e)}}
function driverField(label,value){return `<div class="driver-detail-field"><b>${esc(label)}</b><span>${esc(value===null||value===undefined||value===''?'Não informado':value)}</span></div>`}
async function driverOpenDetail(id){
 const d=driverAdminRows.find(x=>x.user_id===id);if(!d)return;driverSelected=id;
 $('driverDetailTitle').textContent=d.full_name||'Ficha do motorista';$('driverDetailContent').textContent='Carregando informações…';$('driverDetailActions').innerHTML='';$('driverDetailModal').classList.remove('hidden');
 try{const s=await current();const v=await req('/rest/v1/rpc/admin_get_driver_application',{method:'POST',headers:{Authorization:'Bearer '+s.access_token},body:JSON.stringify({p_user_id:id})});
 const sections=[['Dados pessoais',[['Nome completo',v.full_name],['E-mail',v.email],['Nascimento',v.date_of_birth?new Date(v.date_of_birth+'T12:00:00').toLocaleDateString('pt-BR'):''],['WhatsApp',v.whatsapp],['Endereço residencial',v.residential_address]]],['Veículo',[['Marca',v.vehicle_make],['Modelo',v.vehicle_model],['Cor',v.vehicle_color],['Ano de fabricação',v.vehicle_year],['Ano do modelo',v.vehicle_model_year],['Placa',v.vehicle_plate]]],['Pagamento e cadastro',[['Chave PIX',v.pix_key],['Situação',driverStatusLabel(v.approval_status)],['Cadastro concluído',v.registration_completed?'Sim':'Não']]]];
 $('driverDetailContent').innerHTML=sections.map(([title,fields])=>`<section class="driver-detail-section"><h3>${esc(title)}</h3>${fields.map(([k,val])=>driverField(k,val)).join('')}</section>`).join('')+`<section class="driver-detail-section"><h3>Fotografias</h3><div class="driver-detail-media">${[['Foto do motorista',v.profile_photo_url],['Foto do veículo',v.vehicle_photo_url]].map(([label,url])=>`<div><small>${esc(label)}</small>${url&&/^https:\/\//.test(url)?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"><img src="${esc(url)}" alt="${esc(label)}" loading="lazy"></a>`:'<p class="soft-note">Não enviada</p>'}</div>`).join('')}</div></section>`;
 $('driverDetailActions').innerHTML=v.approval_status==='pending'?`<div class="driver-detail-actions"><button type="button" class="back" data-driver-review="${esc(id)}" data-approve="false">Rejeitar</button><button type="button" class="primary" data-driver-review="${esc(id)}" data-approve="true">Aprovar cadastro</button></div>`:'';
 }catch(e){$('driverDetailContent').textContent='Não foi possível carregar a ficha: '+messageError(e)}
}
function driverConfirmClose(){$('driverConfirmModal').classList.add('hidden');driverReviewPending=null;$('driverConfirmFeedback').textContent=''}
function driverConfirmOpen(id,approve){const d=driverAdminRows.find(x=>x.user_id===id);if(!d)return;driverReviewPending={id,approve};$('driverConfirmTitle').textContent=approve?'Aprovar motorista':'Rejeitar cadastro';$('driverConfirmMessage').textContent=(approve?'Confirmar a aprovação de ':'Confirmar a rejeição do cadastro de ')+(d.full_name||'este motorista')+'?';$('driverConfirmAccept').textContent=approve?'Sim, aprovar':'Sim, rejeitar';$('driverConfirmFeedback').textContent='';$('driverConfirmModal').classList.remove('hidden')}
$('driverDetailClose').onclick=()=>{$('driverDetailModal').classList.add('hidden')};
$('driverConfirmCancel').onclick=driverConfirmClose;
$('driverConfirmAccept').onclick=async()=>{if(!driverReviewPending)return;const {id,approve}=driverReviewPending,b=$('driverConfirmAccept');b.disabled=true;try{const s=await current();await req('/rest/v1/rpc/admin_review_driver_application',{method:'POST',headers:{Authorization:'Bearer '+s.access_token},body:JSON.stringify({p_user_id:id,p_approve:approve})});driverConfirmClose();$('driverDetailModal').classList.add('hidden');await driverAdminLoad();await admin.refresh()}catch(e){$('driverConfirmFeedback').textContent=messageError(e)}finally{b.disabled=false}};
document.querySelectorAll('[data-driver-filter]').forEach(b=>b.onclick=()=>{driverAdminFilter=b.dataset.driverFilter;driverAdminRender()});
$('driverAdminRefresh').onclick=driverAdminLoad;
$('driverAdminCreate').onclick=async()=>{const target=$('driverAdminInviteResult');target.textContent='Gerando convite…';try{if(!/^\S+@\S+\.\S+$/.test($('driverAdminPhone').value.trim()))throw Error('Informe um e-mail válido.');const s=await current();const data=await req('/rest/v1/rpc/admin_create_driver_invitation',{method:'POST',headers:{Authorization:'Bearer '+s.access_token},body:JSON.stringify({p_whatsapp:$('driverAdminPhone').value})});target.innerHTML='Convite válido por 24 horas:<p class="invite-link">'+esc(data.registration_url)+'</p><button type="button" class="back" id="driverCopyInvite">Copiar link</button>';$('driverCopyInvite').onclick=()=>navigator.clipboard.writeText(data.registration_url).then(()=>{target.querySelector('button').textContent='Copiado!'}).catch(()=>{target.querySelector('button').textContent='Selecione o link acima para copiar'})}catch(e){target.textContent=messageError(e)}};
$('driverAdminApps').onclick=e=>{const review=e.target.closest('[data-driver-review]');if(review){driverConfirmOpen(review.dataset.driverReview,review.dataset.approve==='true');return}const open=e.target.closest('[data-driver-open]');if(open)driverOpenDetail(open.dataset.driverOpen)};
$('driverDetailActions').onclick=e=>{const b=e.target.closest('[data-driver-review]');if(b)driverConfirmOpen(b.dataset.driverReview,b.dataset.approve==='true')};
const oldAdminNav=window.tsNavigate;window.tsNavigate=id=>{oldAdminNav(id);if(id==='administracao')driverAdminLoad()};
// V26: credenciais, troca inicial de senha e área exclusiva.
const driver=createDriver({runtime, $, bookingDate, current, esc, messageError, openAuth, req, selectMode});

const ts315=createClient({runtime, $, BASE, KEY, bookingDate, bookingMoney, bookingStops, current, esc,
 inviteToken, messageError, money, openAccountArea, openAuth, req, statusPt});
let dispatchOffers=null;
try { dispatchOffers=offerFactory?.({runtime,$,bookingDate,bookingMoney,esc,messageError,notify:v292Notify,rpc:ts315.rpc})||null; } catch(error) { console.error('Fila virtual',error); }
const selectManagementTab=initManagementTabs(tab=>admGeral.openManagementTab(tab));
const operations=installOwnerOperations({
 current, request:req, isOwner:()=>admin.isOwner, statusLabel:statusPt,
 async startBookingDetail(id, signal){
  if(!admin.isOwner||!isBookingId(id))throw Error('Reserva indisponível.');
  const session=await current();
  if(!session||!admin.isOwner||signal.aborted)return;
  const rows=await req('/rest/v1/bookings?select=*&deleted_at=is.null&id=eq.'+encodeURIComponent(id),{
   headers:{Authorization:'Bearer '+session.access_token},signal
  });
  if(!Array.isArray(rows)||rows.length!==1||rows[0].id!==id)throw Error('Reserva indisponível.');
  await tsLoadDriverLookup(rows);
  if(admin.isOwner&&!signal.aborted&&auth.session?.user?.id===session.user.id)tsOpenBooking(rows[0],true);
 }
});
let ownerDispatch;
try { ownerDispatch=dispatchModule?.installOwnerDispatch({isOwner:()=>admin.isOwner,confirmDispatch:async payload=>{const session=await current();if(!session||!admin.isOwner)throw Error("Sessão indisponível");const result=await req("/rest/v1/rpc/ts_owner_confirm_dispatch",{method:"POST",headers:{Authorization:"Bearer "+session.access_token},body:JSON.stringify(payload)});operations.refreshSoon();return result;},loadAssignmentDrivers:async()=>{const session=await current();if(!session||!admin.isOwner)throw Error('Sessão indisponível.');const headers={Authorization:'Bearer '+session.access_token};const drivers=await req('/rest/v1/rpc/admin_list_drivers',{method:'POST',headers,body:'{}'});if(!admin.isOwner||auth.session?.user?.id!==session.user.id)throw Error('Sessão indisponível.');return drivers.map(d=>({...d,approval_status:'approved',active:true}));},loadCommission:async()=>{const session=await current();if(!session||!admin.isOwner)throw Error("Sessão indisponível.");const rows=await req("/rest/v1/company_settings?select=commission_percentage&id=eq.1",{headers:{Authorization:"Bearer "+session.access_token}});if(!admin.isOwner||auth.session?.user?.id!==session.user.id)throw Error("Sessão indisponível.");return rows[0]?.commission_percentage;},searchClients:async(path,signal)=>{
 const session=await current();if(!session||!admin.isOwner||signal.aborted)throw Error('Sessão indisponível.');
 const headers={Authorization:'Bearer '+session.access_token};
 const rows=await req(path,{headers,signal});
 const ids=rows.map(r=>r.id).filter(id=>/^[0-9a-f-]{36}$/i.test(id));
 if(!ids.length)return [];
 const roles=await req('/rest/v1/user_roles?select=user_id&role=eq.client&user_id=in.('+ids.join(',')+')',{headers,signal});
 if(!admin.isOwner||auth.session?.user?.id!==session.user.id||signal.aborted)throw Error('Sessão indisponível.');
 const allowed=new Set(roles.map(r=>r.user_id));return rows.filter(r=>allowed.has(r.id));
}}); } catch(error) { console.error('Despacho manual',error); }
if(!ownerDispatch){
 const notice=document.createElement('p'); notice.id='ownerDispatchUnavailable'; notice.className='card'; notice.hidden=true; notice.textContent='Despacho manual indisponível. Atualize o aplicativo e tente novamente.'; $('wizardCard').before(notice);
 ownerDispatch={setRoute(section){notice.hidden=section!=='despacho'||!admin.isOwner;},reset(){notice.hidden=true;},snapshot(){return null;}};
}
const admGeral=installOwnerNavigation({
 isOwner:()=>admin.isOwner,
 selectManagementTab,
 onRouteChange:section=>{operations.setRoute(section);ownerDispatch.setRoute(section);},
 onReset:ownerDispatch.reset,
 ownerDispatchSnapshot:ownerDispatch.snapshot,
 hasPendingAssignment:()=>[...document.querySelectorAll('.ts-assign-select')].some(select=>
  select.value!==(admin.rows.find(row=>String(row.id)===select.dataset.booking)?.driver_id||''))
});
ts315.init();
initAccountProfile(auth,ts315,signOutAccount);

// V31.15 — Despacho mantém o cadastro e a edição administrativos existentes.
let dispatchRules=null, dispatchRulesUid=null, dispatchRulesRequest=null;
let dispatchPricePending=null;
window.ts315LoadDispatchRules=async()=>{
 const uid=auth.session?.user?.id;
 if(!uid||!admin.allowed)return null;
 if(dispatchRulesRequest?.uid===uid)return dispatchRulesRequest.promise;
 const promise=(async()=>{
  try{
   const result=await ts315.rpc('ts_get_booking_settings');
   if(uid!==auth.session?.user?.id||!admin.allowed)return null;
   dispatchRules=Array.isArray(result)?result[0]:result;
   dispatchRulesUid=uid;
   if(Number(dispatchRules?.booking_max_passengers)>0)$('passengers').max=dispatchRules.booking_max_passengers;
   return dispatchRules;
  }finally{if(dispatchRulesRequest?.promise===promise)dispatchRulesRequest=null}
 })();
 dispatchRulesRequest={uid,promise};
 return promise;
};
window.ts315DispatchQuote=async(route,passengers)=>{
 if(!admin.allowed||!route)return null;
 const params=Object.fromEntries(Object.entries(route).map(([key,val])=>['p_'+key,val]));
 const calculate=async count=>{
  const result=await ts315.rpc('ts_calculate_transfer_quote',{...params,p_passengers:count});
  return Array.isArray(result)?result[0]:result;
 };
 const quote=await calculate(passengers);
 const total=Number(quote?.total_amount);
 if(quote?.requires_quote||quote?.requires_custom_quote||!Number.isFinite(total)||total<=0)return {total:null,amount:0};
 const reportedSurcharge=quote.surcharge_amount??quote.passenger_surcharge_amount;
 if(reportedSurcharge!=null&&Number.isFinite(Number(reportedSurcharge)))return {total,amount:Number(reportedSurcharge)};
 // Some quote responses include the final amount without a separate surcharge.
 const baseline=await calculate(1);
 const base=Number(baseline?.total_amount);
 if(!Number.isFinite(base)||base<=0)throw Error('O Supabase não retornou o valor-base do despacho.');
 const result=await ts315.rpc('ts_calculate_passenger_surcharge',{p_base_amount:base,p_passengers:passengers});
 const surcharge=Array.isArray(result)?result[0]:result;
 if(Math.round(Number(surcharge?.total_amount)*100)!==Math.round(total*100))throw Error('A tarifa mudou durante a consulta. Recalcule o valor do despacho.');
 return {total,amount:Number(surcharge.surcharge_amount)};
};
async function getDispatchBooking(id){
 const s=await current();
 if(!s||!admin.allowed)throw Error('Entre novamente na conta administrativa.');
 const rows=await req('/rest/v1/bookings?select=*&id=eq.'+encodeURIComponent(id)+'&limit=1',{
  headers:{Authorization:'Bearer '+s.access_token}
 });
 if(!rows[0])throw Error('Não foi possível consultar o despacho cadastrado.');
 return rows[0];
}
async function finishDispatchPricing(pending){
 const {uid,id,passengers,quote}=pending;
 if(auth.session?.user?.id!==uid||!admin.allowed)throw Error('Entre na conta que registrou o despacho.');
 const row=await getDispatchBooking(id);
 const cents=value=>Math.round(Number(value)*100);
 const expected=cents(quote.total);
 if(row.total_amount!=null&&cents(row.total_amount)===expected)return;
 const recorded=cents(row.total_amount);
 const base=expected-cents(quote.amount);
 if(row.driver_id||row.passengers!=passengers||row.total_amount==null||recorded!==base||
    !['pending','confirmed'].includes(row.booking_status)||row.payment_status!=='pending'){
  throw Error('Confira o valor diretamente na Gestão. A reserva permanece cadastrada.');
 }
 const balance=Number(row.balance_amount??row.total_amount)-Number(row.total_amount)+quote.total;
 await ts315.rpc('admin_edit_booking',{
  p_booking_id:id,p_changes:{total_amount:quote.total,balance_amount:Math.round(balance*100)/100}
 });
 const saved=await getDispatchBooking(id);
 if(saved.total_amount==null||cents(saved.total_amount)!==expected)throw Error('O valor atualizado ainda não foi confirmado pelo servidor.');
}

// Resolve exactly one profile before exposing any signed-in navigation.
function showAccountCheck(){
 admin.updateNavigation();
 window.tsBaseNavigate('tsRoleAccess');
 $('tsRoleStatus').textContent='Verificando o perfil da sua conta…';
 $('tsRoleRetry').classList.add('hidden');
}
const resolveAccountArea=createAreaResolver({
 getUserId:()=>auth.session?.user?.id,
 invited:()=>Boolean(inviteToken),
 updateNavigation:admin.updateNavigation,
 checkAdmin:admin.check,
 current,
 request:req,
 openDriver:driver.openAfterLogin,
 checkClient:ts315.checkRole,
 errorMessage:messageError
});
function openAccountArea(role){
 if(!auth.session){window.tsNavigate('home');return}
 if(role==='driver')return;
 if(role==='client'||role==='admin'){
  window.tsNavigate(role==='client'?'clienteInicio':admin.isOwner?'admGeralInicio':'administracao');
  return;
 }
 showAccountCheck();
 $('tsRoleStatus').textContent='O perfil desta conta não foi confirmado. Tente novamente ou entre com outra conta.';
 $('tsRoleRetry').classList.remove('hidden');
}
$('tsRoleRetry').onclick=async()=>{
 showAccountCheck();
 openAccountArea(await resolveAccountArea());
};

if(inviteToken)setTimeout(driverOpenInvite,0);

try{
 const saved=readStoredSession();
 if(saved?.access_token)setSession(saved);
}catch{}
renderAuth();
if(auth.session&&!inviteToken)showAccountCheck();
void (async()=>{
 await handleAuthRedirect();
 if(!auth.session||inviteToken)return;
 const role=await resolveAccountArea();
 if(document.querySelector('#tsRoleAccess.active'))openAccountArea(role);
})();

function tsInitEditing(){

const fields=[['service_type','Tipo de serviço'],['client_name','Nome do cliente'],['client_email','E-mail'],['client_phone','Telefone'],['origin','Origem'],['destination','Destino'],['pickup_date','Data','date'],['pickup_time','Horário','time'],['passengers','Passageiros','number'],['luggage','Bagagens','number'],['flight_number','Voo'],['notes','Observações'],['driver_id','Motorista'],['total_amount','Valor total','number'],['balance_amount','Saldo para pagamento ao final da prestação do serviço','number'],['booking_status','Status da reserva'],['payment_status','Status do pagamento']];
const editor=document.getElementById('ts295Edit'), form=document.getElementById('ts295Form'), holder=document.getElementById('ts295Fields');
let editing=null,owner=false,manager=false;
async function roles(){const s=await current();if(!s)return;const h={Authorization:'Bearer '+s.access_token};const [o,a]=await Promise.all([req('/rest/v1/rpc/is_owner',{method:'POST',headers:h,body:'{}'}).catch(()=>false),req('/rest/v1/rpc/is_admin',{method:'POST',headers:h,body:'{}'}).catch(()=>false)]);owner=o===true;manager=a===true;}
function closeEditor(){editor.classList.add('hidden');editing=null}
document.getElementById('ts295Close').onclick=closeEditor;
function showEditor(b){editing=b;holder.innerHTML='';const allowed=fields.filter(([k])=>(owner||k!=='payment_status')&&(k!=='driver_id'||!dispatchOffers?.bookingState(b.id)));for(const [key,label,type] of allowed){const wrap=document.createElement('div');const lab=document.createElement('label');lab.textContent=label;const inp=document.createElement(['payment_status','booking_status','driver_id','service_type'].includes(key)?'select':key==='notes'?'textarea':'input');inp.dataset.field=key;if(inp.tagName==='INPUT')inp.type=type||'text';if(type==='number')inp.step='any';if(key==='service_type'){const modalities=[['transfer','Transfer'],['city_tour','City Tour'],['driver_at_disposal','Motorista à disposição'],['wedding','Casamento']];for(const [v,t] of modalities){const opt=new Option(t,v);if(v!=='transfer'&&String(b[key]||'').toLowerCase()!==v){opt.disabled=true;opt.text=t+' (em preparação)'}inp.add(opt)}if(b[key]&&!Array.from(inp.options).some(o=>o.value===String(b[key])))inp.add(new Option('Atual: '+b[key],b[key]));}else if(key==='payment_status'){for(const [v,t] of [['pending','Pendente'],['paid','Pago']])inp.add(new Option(t,v));if(!['pending','paid'].includes(String(b[key])))inp.add(new Option('Atual: '+b[key],b[key]));}else if(key==='booking_status'){for(const [v,t] of [['pending','Pendente'],['confirmed','Confirmada'],['completed','Concluída'],['cancelled','Cancelada']])inp.add(new Option(t,v));if(!['pending','confirmed','completed','cancelled'].includes(String(b[key])))inp.add(new Option('Atual: '+b[key],b[key]));}else if(key==='driver_id'){inp.add(new Option('Sem motorista',''));for(const d of admin.drivers){const uid=d.driver_id||d.user_id||d.id;const name=d.full_name||d.name||uid;if(uid)inp.add(new Option(name,uid))}if(b[key]&&!Array.from(inp.options).some(o=>o.value===b[key]))inp.add(new Option('Motorista atual',b[key]));}inp.value=b[key]==null?'':String(b[key]).slice(0,type==='date'?10:type==='time'?5:undefined);if(['notes','origin','destination','client_name','client_email','driver_id'].includes(key))wrap.className='ts298-wide';wrap.appendChild(lab);if(['total_amount','balance_amount'].includes(key)){const moneyBox=document.createElement('div');moneyBox.className='ts303-currency';const prefix=document.createElement('span');prefix.textContent='R$';moneyBox.append(prefix,inp);wrap.appendChild(moneyBox)}else wrap.appendChild(inp);holder.appendChild(wrap)}editor.classList.remove('hidden')}
form.onsubmit=async e=>{e.preventDefault();if(!editing)return;const changes={};for(const inp of holder.querySelectorAll('[data-field]')){const k=inp.dataset.field,v=inp.value.trim(),old=editing[k]==null?'':String(editing[k]).slice(0,inp.type==='date'?10:inp.type==='time'?5:undefined);if(v===old)continue;if(['passengers','luggage','total_amount','deposit_amount','balance_amount','deposit_percentage'].includes(k)){if(!v||!Number.isFinite(Number(v))){v292Notify('Campo inválido','Confira o campo '+k);return}changes[k]=Number(v)}else if(k==='driver_id'){changes[k]=v||null}else changes[k]=v}
if(!Object.keys(changes).length){v292Notify('Nenhuma alteração','Modifique pelo menos um campo para salvar.');return}
try{const s=await current();await req('/rest/v1/rpc/admin_edit_booking',{method:'POST',headers:{Authorization:'Bearer '+s.access_token},body:JSON.stringify({p_booking_id:editing.id,p_changes:changes})});closeEditor();document.getElementById('v292Modal').classList.add('hidden');v292Notify('Reserva atualizada','As alterações foram salvas e registradas no histórico.');if(typeof loadAdminBookings==='function')await loadAdminBookings();else if(typeof window.tsLoadAdminBookings==='function')await window.tsLoadAdminBookings();else document.getElementById('adminRefresh')?.click()}catch(err){v292Notify('Não foi possível salvar',messageError(err))}};
// Vinculação direta aos cliques existentes; não depende de sobrescrever funções globais.
async function startEdit(b,admin){try{await roles();if(!owner&&!manager)return v292Notify('Acesso restrito','A edição administrativa é reservada à Gestão.');if(['waiting','offered'].includes(dispatchOffers?.bookingState(b.id)?.state))return v292Notify('Despacho na fila','Assuma a designação manual antes de editar os dados da oferta.');if(!owner&&String(b.payment_status||'pending').toLowerCase()!=='pending')return v292Notify('Edição restrita','Existe pagamento registrado. Somente o administrador geral pode editar esta reserva.');showEditor(b)}catch(err){v292Notify('Falha de autorização',messageError(err))}}
function attachEdit(b,admin){const actions=document.getElementById('v292Actions');if(!actions||!b)return;actions.querySelector('.ts295-edit-btn')?.remove();const btn=document.createElement('button');btn.type='button';btn.className='ts295-edit-btn';btn.textContent='Editar reserva';btn.onclick=()=>startEdit(b,admin);actions.prepend(btn)}
document.addEventListener('click',event=>{
 const adminOpen=event.target.closest('[data-v292-open]');
 if(adminOpen){const b=admin.rows.find(x=>x.id===adminOpen.dataset.v292Open);if(b)attachEdit(b,true);return}
 const adminEdit=event.target.closest('[data-ts296-edit], [data-v292-edit]');
 if(adminEdit){const b=admin.rows.find(x=>x.id===(adminEdit.dataset.ts296Edit||adminEdit.dataset.v292Edit));if(b){tsOpenBooking(b,true);attachEdit(b,true);startEdit(b,true)}return}
});
// Edição administrativa acessível pelo botão compacto no cartão.
 tsEditAttach=attachEdit;

}
window.addEventListener('DOMContentLoaded',tsInitEditing);
(()=>{
const navigationIcons={
 home:'home',reservas:'calendar',administracao:'grid',contato:'chat',financeiro:'wallet',
 motoristaInicio:'home',motoristaPainel:'calendar',motoristaHistorico:'history',motoristaGanhos:'wallet',motoristaEmpresa:'building',
 clienteInicio:'home',clienteHistorico:'history',clienteSobre:'building',clienteContato:'chat'
};
const nav=document.querySelector('.nav');
function icons(){nav.querySelectorAll('button[data-page]').forEach(b=>{if(b.querySelector('svg'))return;let label=b.textContent.replace(/^[⌂▦▣☏↶]/,'').trim();b.innerHTML=interfaceIcon(navigationIcons[b.dataset.page])+'<span>'+esc(label)+'</span>'})}icons();new MutationObserver(icons).observe(nav,{childList:true,subtree:true});
let period='Hoje',entries=[],settings=null,owner=false,seq=0,lastView='',warned=new Set();const money=driver.money, sum=(a,k)=>a.reduce((n,r)=>n+Number(r[k]||0),0), today=driver.today;const rpc=async(n,p={})=>{const s=await current();if(!s)throw Error('Entre novamente');return req('/rest/v1/rpc/'+n,{method:'POST',headers:{Authorization:'Bearer '+s.access_token},body:JSON.stringify(p)})};const row=(k,v)=>'<div class="f314row"><span>'+esc(k)+'</span><strong>'+esc(String(v??'—'))+'</strong></div>';const card=(h,b)=>'<div class="f314card"><h3>'+esc(h)+'</h3>'+b+'</div>';const btn=(label,act,ids='')=>'<button type="button" class="back" data-f314="'+act+'" data-ids="'+esc(ids)+'">'+esc(label)+'</button>';function groups(a){const m=new Map();a.forEach(r=>{const k=r.transfer_direction==='driver_to_company'?[r.driver_id,r.service_date,r.due_date,r.transfer_status].join('|'):r.id;if(!m.has(k))m.set(k,[]);m.get(k).push(r)});return [...m.values()]}
function transfers(a,admin){return groups(a).map(g=>{const r=g[0],cash=r.transfer_direction==='driver_to_company',status=r.transfer_status,ids=g.map(x=>x.id).join(',');let b=row('Valor',money(sum(g,'transfer_amount')))+row('Situação',({pending:'Pendente',reported:'Pagamento informado',confirmed:'Confirmado'})[status]||status)+(r.due_date?row('Vencimento',bookingDate(r.due_date)):'')+(admin?row('Motorista',r.driver_id):'');if(status!=='confirmed'){if(cash&&!admin){b+=btn('Efetuar pagamento','copy');if(status==='pending')b+=btn('Informar pagamento','report',ids)}if(cash&&admin)b+=btn('Confirmar recebimento','confirm',ids);if(!cash&&admin&&status==='pending')b+=btn('Informar pagamento','report',ids);if(!cash&&!admin&&status==='reported')b+=btn('Confirmar recebimento','confirm',ids)}if(admin&&owner)b+=g.map(x=>btn('Corrigir / revisar #'+x.booking_id.slice(0,8),'correct',x.id)).join('');return card((cash?'Repasse à empresa':'Repasse ao motorista')+' · '+bookingDate(r.service_date),b)}).join('')||'<p class="soft-note">Nenhum registro.</p>'}
function companyEdit(edit){if(!settings)return '<p>Configurações indisponíveis.</p>';const fields=[['whatsapp_number','WhatsApp'],['email','E-mail'],['instagram_url','Instagram'],['website_url','Site'],['pix_key','Chave PIX'],['pix_holder_name','Titular'],['pix_bank_name','Banco'],['commission_percentage','Comissão (%)'],['driver_payment_deadline_days','Prazo (dias)'],['driver_payment_warning_days','Aviso (dias)']];return card('Dados da empresa',fields.map(([k,l])=>edit?'<label>'+l+'<input data-f314-field="'+k+'" value="'+esc(String(settings[k]??''))+'"></label>':row(l,settings[k])).join('')+(edit?btn('Salvar configurações','save'):btn('Copiar PIX','copy')))}
const QRLocal=(()=>{const modules={"./QR8bitByte":function(module,exports,require){
var QRMode = require('./QRMode');

function QR8bitByte(data) {
	this.mode = QRMode.MODE_8BIT_BYTE;
	this.data = data;
}

QR8bitByte.prototype = {

	getLength : function() {
		return this.data.length;
	},
	
	write : function(buffer) {
		for (var i = 0; i < this.data.length; i++) {
			// not JIS ...
			buffer.put(this.data.charCodeAt(i), 8);
		}
	}
};

module.exports = QR8bitByte;

},"./QRBitBuffer":function(module,exports,require){
function QRBitBuffer() {
	this.buffer = [];
	this.length = 0;
}

QRBitBuffer.prototype = {

	get : function(index) {
		var bufIndex = Math.floor(index / 8);
		return ( (this.buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
	},
	
	put : function(num, length) {
		for (var i = 0; i < length; i++) {
			this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
		}
	},
	
	getLengthInBits : function() {
		return this.length;
	},
	
	putBit : function(bit) {
	
		var bufIndex = Math.floor(this.length / 8);
		if (this.buffer.length <= bufIndex) {
			this.buffer.push(0);
		}
	
		if (bit) {
			this.buffer[bufIndex] |= (0x80 >>> (this.length % 8) );
		}
	
		this.length++;
	}
};

module.exports = QRBitBuffer;

},"./QRErrorCorrectLevel":function(module,exports,require){
module.exports = {
	L : 1,
	M : 0,
	Q : 3,
	H : 2
};


},"./QRMaskPattern":function(module,exports,require){
module.exports = {
	PATTERN000 : 0,
	PATTERN001 : 1,
	PATTERN010 : 2,
	PATTERN011 : 3,
	PATTERN100 : 4,
	PATTERN101 : 5,
	PATTERN110 : 6,
	PATTERN111 : 7
};

},"./QRMath":function(module,exports,require){
var QRMath = {

	glog : function(n) {
	
		if (n < 1) {
			throw new Error("glog(" + n + ")");
		}
		
		return QRMath.LOG_TABLE[n];
	},
	
	gexp : function(n) {
	
		while (n < 0) {
			n += 255;
		}
	
		while (n >= 256) {
			n -= 255;
		}
	
		return QRMath.EXP_TABLE[n];
	},
	
	EXP_TABLE : new Array(256),
	
	LOG_TABLE : new Array(256)

};
	
for (var i = 0; i < 8; i++) {
	QRMath.EXP_TABLE[i] = 1 << i;
}
for (var i = 8; i < 256; i++) {
	QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4]
		^ QRMath.EXP_TABLE[i - 5]
		^ QRMath.EXP_TABLE[i - 6]
		^ QRMath.EXP_TABLE[i - 8];
}
for (var i = 0; i < 255; i++) {
	QRMath.LOG_TABLE[QRMath.EXP_TABLE[i] ] = i;
}

module.exports = QRMath;

},"./QRMode":function(module,exports,require){
module.exports = {
    MODE_NUMBER :       1 << 0,
    MODE_ALPHA_NUM :    1 << 1,
    MODE_8BIT_BYTE :    1 << 2,
    MODE_KANJI :        1 << 3
};

},"./QRPolynomial":function(module,exports,require){
var QRMath = require('./QRMath');

function QRPolynomial(num, shift) {
	if (num.length === undefined) {
		throw new Error(num.length + "/" + shift);
	}

	var offset = 0;

	while (offset < num.length && num[offset] === 0) {
		offset++;
	}

	this.num = new Array(num.length - offset + shift);
	for (var i = 0; i < num.length - offset; i++) {
		this.num[i] = num[i + offset];
	}
}

QRPolynomial.prototype = {

	get : function(index) {
		return this.num[index];
	},
	
	getLength : function() {
		return this.num.length;
	},
	
	multiply : function(e) {
	
		var num = new Array(this.getLength() + e.getLength() - 1);
	
		for (var i = 0; i < this.getLength(); i++) {
			for (var j = 0; j < e.getLength(); j++) {
				num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i) ) + QRMath.glog(e.get(j) ) );
			}
		}
	
		return new QRPolynomial(num, 0);
	},
	
	mod : function(e) {
	
		if (this.getLength() - e.getLength() < 0) {
			return this;
		}
	
		var ratio = QRMath.glog(this.get(0) ) - QRMath.glog(e.get(0) );
	
		var num = new Array(this.getLength() );
		
		for (var i = 0; i < this.getLength(); i++) {
			num[i] = this.get(i);
		}
		
		for (var x = 0; x < e.getLength(); x++) {
			num[x] ^= QRMath.gexp(QRMath.glog(e.get(x) ) + ratio);
		}
	
		// recursive call
		return new QRPolynomial(num, 0).mod(e);
	}
};

module.exports = QRPolynomial;

},"./QRRSBlock":function(module,exports,require){
var QRErrorCorrectLevel = require('./QRErrorCorrectLevel');

function QRRSBlock(totalCount, dataCount) {
	this.totalCount = totalCount;
	this.dataCount  = dataCount;
}

QRRSBlock.RS_BLOCK_TABLE = [

	// L
	// M
	// Q
	// H

	// 1
	[1, 26, 19],
	[1, 26, 16],
	[1, 26, 13],
	[1, 26, 9],
	
	// 2
	[1, 44, 34],
	[1, 44, 28],
	[1, 44, 22],
	[1, 44, 16],

	// 3
	[1, 70, 55],
	[1, 70, 44],
	[2, 35, 17],
	[2, 35, 13],

	// 4		
	[1, 100, 80],
	[2, 50, 32],
	[2, 50, 24],
	[4, 25, 9],
	
	// 5
	[1, 134, 108],
	[2, 67, 43],
	[2, 33, 15, 2, 34, 16],
	[2, 33, 11, 2, 34, 12],
	
	// 6
	[2, 86, 68],
	[4, 43, 27],
	[4, 43, 19],
	[4, 43, 15],
	
	// 7		
	[2, 98, 78],
	[4, 49, 31],
	[2, 32, 14, 4, 33, 15],
	[4, 39, 13, 1, 40, 14],
	
	// 8
	[2, 121, 97],
	[2, 60, 38, 2, 61, 39],
	[4, 40, 18, 2, 41, 19],
	[4, 40, 14, 2, 41, 15],
	
	// 9
	[2, 146, 116],
	[3, 58, 36, 2, 59, 37],
	[4, 36, 16, 4, 37, 17],
	[4, 36, 12, 4, 37, 13],
	
	// 10		
	[2, 86, 68, 2, 87, 69],
	[4, 69, 43, 1, 70, 44],
	[6, 43, 19, 2, 44, 20],
	[6, 43, 15, 2, 44, 16],

	// 11
	[4, 101, 81],
	[1, 80, 50, 4, 81, 51],
	[4, 50, 22, 4, 51, 23],
	[3, 36, 12, 8, 37, 13],

	// 12
	[2, 116, 92, 2, 117, 93],
	[6, 58, 36, 2, 59, 37],
	[4, 46, 20, 6, 47, 21],
	[7, 42, 14, 4, 43, 15],

	// 13
	[4, 133, 107],
	[8, 59, 37, 1, 60, 38],
	[8, 44, 20, 4, 45, 21],
	[12, 33, 11, 4, 34, 12],

	// 14
	[3, 145, 115, 1, 146, 116],
	[4, 64, 40, 5, 65, 41],
	[11, 36, 16, 5, 37, 17],
	[11, 36, 12, 5, 37, 13],

	// 15
	[5, 109, 87, 1, 110, 88],
	[5, 65, 41, 5, 66, 42],
	[5, 54, 24, 7, 55, 25],
	[11, 36, 12],

	// 16
	[5, 122, 98, 1, 123, 99],
	[7, 73, 45, 3, 74, 46],
	[15, 43, 19, 2, 44, 20],
	[3, 45, 15, 13, 46, 16],

	// 17
	[1, 135, 107, 5, 136, 108],
	[10, 74, 46, 1, 75, 47],
	[1, 50, 22, 15, 51, 23],
	[2, 42, 14, 17, 43, 15],

	// 18
	[5, 150, 120, 1, 151, 121],
	[9, 69, 43, 4, 70, 44],
	[17, 50, 22, 1, 51, 23],
	[2, 42, 14, 19, 43, 15],

	// 19
	[3, 141, 113, 4, 142, 114],
	[3, 70, 44, 11, 71, 45],
	[17, 47, 21, 4, 48, 22],
	[9, 39, 13, 16, 40, 14],

	// 20
	[3, 135, 107, 5, 136, 108],
	[3, 67, 41, 13, 68, 42],
	[15, 54, 24, 5, 55, 25],
	[15, 43, 15, 10, 44, 16],

	// 21
	[4, 144, 116, 4, 145, 117],
	[17, 68, 42],
	[17, 50, 22, 6, 51, 23],
	[19, 46, 16, 6, 47, 17],

	// 22
	[2, 139, 111, 7, 140, 112],
	[17, 74, 46],
	[7, 54, 24, 16, 55, 25],
	[34, 37, 13],

	// 23
	[4, 151, 121, 5, 152, 122],
	[4, 75, 47, 14, 76, 48],
	[11, 54, 24, 14, 55, 25],
	[16, 45, 15, 14, 46, 16],

	// 24
	[6, 147, 117, 4, 148, 118],
	[6, 73, 45, 14, 74, 46],
	[11, 54, 24, 16, 55, 25],
	[30, 46, 16, 2, 47, 17],

	// 25
	[8, 132, 106, 4, 133, 107],
	[8, 75, 47, 13, 76, 48],
	[7, 54, 24, 22, 55, 25],
	[22, 45, 15, 13, 46, 16],

	// 26
	[10, 142, 114, 2, 143, 115],
	[19, 74, 46, 4, 75, 47],
	[28, 50, 22, 6, 51, 23],
	[33, 46, 16, 4, 47, 17],

	// 27
	[8, 152, 122, 4, 153, 123],
	[22, 73, 45, 3, 74, 46],
	[8, 53, 23, 26, 54, 24],
	[12, 45, 15, 28, 46, 16],

	// 28
	[3, 147, 117, 10, 148, 118],
	[3, 73, 45, 23, 74, 46],
	[4, 54, 24, 31, 55, 25],
	[11, 45, 15, 31, 46, 16],

	// 29
	[7, 146, 116, 7, 147, 117],
	[21, 73, 45, 7, 74, 46],
	[1, 53, 23, 37, 54, 24],
	[19, 45, 15, 26, 46, 16],

	// 30
	[5, 145, 115, 10, 146, 116],
	[19, 75, 47, 10, 76, 48],
	[15, 54, 24, 25, 55, 25],
	[23, 45, 15, 25, 46, 16],

	// 31
	[13, 145, 115, 3, 146, 116],
	[2, 74, 46, 29, 75, 47],
	[42, 54, 24, 1, 55, 25],
	[23, 45, 15, 28, 46, 16],

	// 32
	[17, 145, 115],
	[10, 74, 46, 23, 75, 47],
	[10, 54, 24, 35, 55, 25],
	[19, 45, 15, 35, 46, 16],

	// 33
	[17, 145, 115, 1, 146, 116],
	[14, 74, 46, 21, 75, 47],
	[29, 54, 24, 19, 55, 25],
	[11, 45, 15, 46, 46, 16],

	// 34
	[13, 145, 115, 6, 146, 116],
	[14, 74, 46, 23, 75, 47],
	[44, 54, 24, 7, 55, 25],
	[59, 46, 16, 1, 47, 17],

	// 35
	[12, 151, 121, 7, 152, 122],
	[12, 75, 47, 26, 76, 48],
	[39, 54, 24, 14, 55, 25],
	[22, 45, 15, 41, 46, 16],

	// 36
	[6, 151, 121, 14, 152, 122],
	[6, 75, 47, 34, 76, 48],
	[46, 54, 24, 10, 55, 25],
	[2, 45, 15, 64, 46, 16],

	// 37
	[17, 152, 122, 4, 153, 123],
	[29, 74, 46, 14, 75, 47],
	[49, 54, 24, 10, 55, 25],
	[24, 45, 15, 46, 46, 16],

	// 38
	[4, 152, 122, 18, 153, 123],
	[13, 74, 46, 32, 75, 47],
	[48, 54, 24, 14, 55, 25],
	[42, 45, 15, 32, 46, 16],

	// 39
	[20, 147, 117, 4, 148, 118],
	[40, 75, 47, 7, 76, 48],
	[43, 54, 24, 22, 55, 25],
	[10, 45, 15, 67, 46, 16],

	// 40
	[19, 148, 118, 6, 149, 119],
	[18, 75, 47, 31, 76, 48],
	[34, 54, 24, 34, 55, 25],
	[20, 45, 15, 61, 46, 16]
];

QRRSBlock.getRSBlocks = function(typeNumber, errorCorrectLevel) {
	
	var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
	
	if (rsBlock === undefined) {
		throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
	}

	var length = rsBlock.length / 3;
	
	var list = [];
	
	for (var i = 0; i < length; i++) {

		var count = rsBlock[i * 3 + 0];
		var totalCount = rsBlock[i * 3 + 1];
		var dataCount  = rsBlock[i * 3 + 2];

		for (var j = 0; j < count; j++) {
			list.push(new QRRSBlock(totalCount, dataCount) );	
		}
	}
	
	return list;
};

QRRSBlock.getRsBlockTable = function(typeNumber, errorCorrectLevel) {

	switch(errorCorrectLevel) {
	case QRErrorCorrectLevel.L :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
	case QRErrorCorrectLevel.M :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
	case QRErrorCorrectLevel.Q :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
	case QRErrorCorrectLevel.H :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
	default :
		return undefined;
	}
};

module.exports = QRRSBlock;

},"./QRUtil":function(module,exports,require){
var QRMode = require('./QRMode');
var QRPolynomial = require('./QRPolynomial');
var QRMath = require('./QRMath');
var QRMaskPattern = require('./QRMaskPattern');

var QRUtil = {

    PATTERN_POSITION_TABLE : [
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],        
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
        [6, 26, 50, 74],
        [6, 30, 54, 78],
        [6, 30, 56, 82],
        [6, 30, 58, 86],
        [6, 34, 62, 90],
        [6, 28, 50, 72, 94],
        [6, 26, 50, 74, 98],
        [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106],
        [6, 32, 58, 84, 110],
        [6, 30, 58, 86, 114],
        [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122],
        [6, 30, 54, 78, 102, 126],
        [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134],
        [6, 34, 60, 86, 112, 138],
        [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146],
        [6, 30, 54, 78, 102, 126, 150],
        [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158],
        [6, 32, 58, 84, 110, 136, 162],
        [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]
    ],

    G15 : (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
    G18 : (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
    G15_MASK : (1 << 14) | (1 << 12) | (1 << 10)    | (1 << 4) | (1 << 1),

    getBCHTypeInfo : function(data) {
        var d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
            d ^= (QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) ) );    
        }
        return ( (data << 10) | d) ^ QRUtil.G15_MASK;
    },

    getBCHTypeNumber : function(data) {
        var d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
            d ^= (QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) ) );    
        }
        return (data << 12) | d;
    },

    getBCHDigit : function(data) {

        var digit = 0;

        while (data !== 0) {
            digit++;
            data >>>= 1;
        }

        return digit;
    },

    getPatternPosition : function(typeNumber) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
    },

    getMask : function(maskPattern, i, j) {
        
        switch (maskPattern) {
            
        case QRMaskPattern.PATTERN000 : return (i + j) % 2 === 0;
        case QRMaskPattern.PATTERN001 : return i % 2 === 0;
        case QRMaskPattern.PATTERN010 : return j % 3 === 0;
        case QRMaskPattern.PATTERN011 : return (i + j) % 3 === 0;
        case QRMaskPattern.PATTERN100 : return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 === 0;
        case QRMaskPattern.PATTERN101 : return (i * j) % 2 + (i * j) % 3 === 0;
        case QRMaskPattern.PATTERN110 : return ( (i * j) % 2 + (i * j) % 3) % 2 === 0;
        case QRMaskPattern.PATTERN111 : return ( (i * j) % 3 + (i + j) % 2) % 2 === 0;

        default :
            throw new Error("bad maskPattern:" + maskPattern);
        }
    },

    getErrorCorrectPolynomial : function(errorCorrectLength) {

        var a = new QRPolynomial([1], 0);

        for (var i = 0; i < errorCorrectLength; i++) {
            a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0) );
        }

        return a;
    },

    getLengthInBits : function(mode, type) {

        if (1 <= type && type < 10) {

            // 1 - 9

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 10;
            case QRMode.MODE_ALPHA_NUM  : return 9;
            case QRMode.MODE_8BIT_BYTE  : return 8;
            case QRMode.MODE_KANJI      : return 8;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 27) {

            // 10 - 26

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 12;
            case QRMode.MODE_ALPHA_NUM  : return 11;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 10;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 41) {

            // 27 - 40

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 14;
            case QRMode.MODE_ALPHA_NUM  : return 13;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 12;
            default :
                throw new Error("mode:" + mode);
            }

        } else {
            throw new Error("type:" + type);
        }
    },

    getLostPoint : function(qrCode) {
        
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        var row = 0; 
        var col = 0;

        
        // LEVEL1
        
        for (row = 0; row < moduleCount; row++) {

            for (col = 0; col < moduleCount; col++) {

                var sameCount = 0;
                var dark = qrCode.isDark(row, col);

                for (var r = -1; r <= 1; r++) {

                    if (row + r < 0 || moduleCount <= row + r) {
                        continue;
                    }

                    for (var c = -1; c <= 1; c++) {

                        if (col + c < 0 || moduleCount <= col + c) {
                            continue;
                        }

                        if (r === 0 && c === 0) {
                            continue;
                        }

                        if (dark === qrCode.isDark(row + r, col + c) ) {
                            sameCount++;
                        }
                    }
                }

                if (sameCount > 5) {
                    lostPoint += (3 + sameCount - 5);
                }
            }
        }

        // LEVEL2

        for (row = 0; row < moduleCount - 1; row++) {
            for (col = 0; col < moduleCount - 1; col++) {
                var count = 0;
                if (qrCode.isDark(row,     col    ) ) count++;
                if (qrCode.isDark(row + 1, col    ) ) count++;
                if (qrCode.isDark(row,     col + 1) ) count++;
                if (qrCode.isDark(row + 1, col + 1) ) count++;
                if (count === 0 || count === 4) {
                    lostPoint += 3;
                }
            }
        }

        // LEVEL3

        for (row = 0; row < moduleCount; row++) {
            for (col = 0; col < moduleCount - 6; col++) {
                if (qrCode.isDark(row, col) && 
                        !qrCode.isDark(row, col + 1) && 
                         qrCode.isDark(row, col + 2) && 
                         qrCode.isDark(row, col + 3) && 
                         qrCode.isDark(row, col + 4) && 
                        !qrCode.isDark(row, col + 5) && 
                         qrCode.isDark(row, col + 6) ) {
                    lostPoint += 40;
                }
            }
        }

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount - 6; row++) {
                if (qrCode.isDark(row, col) &&
                        !qrCode.isDark(row + 1, col) &&
                         qrCode.isDark(row + 2, col) &&
                         qrCode.isDark(row + 3, col) &&
                         qrCode.isDark(row + 4, col) &&
                        !qrCode.isDark(row + 5, col) &&
                         qrCode.isDark(row + 6, col) ) {
                    lostPoint += 40;
                }
            }
        }

        // LEVEL4
        
        var darkCount = 0;

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount; row++) {
                if (qrCode.isDark(row, col) ) {
                    darkCount++;
                }
            }
        }
        
        var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;

        return lostPoint;       
    }

};

module.exports = QRUtil;

},"./index":function(module,exports,require){
//---------------------------------------------------------------------
// QRCode for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//   http://www.opensource.org/licenses/mit-license.php
//
// The word "QR Code" is registered trademark of 
// DENSO WAVE INCORPORATED
//   http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------
// Modified to work in node for this project (and some refactoring)
//---------------------------------------------------------------------

var QR8bitByte = require('./QR8bitByte');
var QRUtil = require('./QRUtil');
var QRPolynomial = require('./QRPolynomial');
var QRRSBlock = require('./QRRSBlock');
var QRBitBuffer = require('./QRBitBuffer');

function QRCode(typeNumber, errorCorrectLevel) {
	this.typeNumber = typeNumber;
	this.errorCorrectLevel = errorCorrectLevel;
	this.modules = null;
	this.moduleCount = 0;
	this.dataCache = null;
	this.dataList = [];
}

QRCode.prototype = {
	
	addData : function(data) {
		var newData = new QR8bitByte(data);
		this.dataList.push(newData);
		this.dataCache = null;
	},
	
	isDark : function(row, col) {
		if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
			throw new Error(row + "," + col);
		}
		return this.modules[row][col];
	},

	getModuleCount : function() {
		return this.moduleCount;
	},
	
	make : function() {
		// Calculate automatically typeNumber if provided is < 1
		if (this.typeNumber < 1 ){
			var typeNumber = 1;
			for (typeNumber = 1; typeNumber < 40; typeNumber++) {
				var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);

				var buffer = new QRBitBuffer();
				var totalDataCount = 0;
				for (var i = 0; i < rsBlocks.length; i++) {
					totalDataCount += rsBlocks[i].dataCount;
				}

				for (var x = 0; x < this.dataList.length; x++) {
					var data = this.dataList[x];
					buffer.put(data.mode, 4);
					buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
					data.write(buffer);
				}
				if (buffer.getLengthInBits() <= totalDataCount * 8)
					break;
			}
			this.typeNumber = typeNumber;
		}
		this.makeImpl(false, this.getBestMaskPattern() );
	},
	
	makeImpl : function(test, maskPattern) {
		
		this.moduleCount = this.typeNumber * 4 + 17;
		this.modules = new Array(this.moduleCount);
		
		for (var row = 0; row < this.moduleCount; row++) {
			
			this.modules[row] = new Array(this.moduleCount);
			
			for (var col = 0; col < this.moduleCount; col++) {
				this.modules[row][col] = null;//(col + row) % 3;
			}
		}
	
		this.setupPositionProbePattern(0, 0);
		this.setupPositionProbePattern(this.moduleCount - 7, 0);
		this.setupPositionProbePattern(0, this.moduleCount - 7);
		this.setupPositionAdjustPattern();
		this.setupTimingPattern();
		this.setupTypeInfo(test, maskPattern);
		
		if (this.typeNumber >= 7) {
			this.setupTypeNumber(test);
		}
	
		if (this.dataCache === null) {
			this.dataCache = QRCode.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
		}
	
		this.mapData(this.dataCache, maskPattern);
	},

	setupPositionProbePattern : function(row, col)  {
		
		for (var r = -1; r <= 7; r++) {
			
			if (row + r <= -1 || this.moduleCount <= row + r) continue;
			
			for (var c = -1; c <= 7; c++) {
				
				if (col + c <= -1 || this.moduleCount <= col + c) continue;
				
				if ( (0 <= r && r <= 6 && (c === 0 || c === 6) ) || 
                     (0 <= c && c <= 6 && (r === 0 || r === 6) ) || 
                     (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
					this.modules[row + r][col + c] = true;
				} else {
					this.modules[row + r][col + c] = false;
				}
			}		
		}		
	},
	
	getBestMaskPattern : function() {
	
		var minLostPoint = 0;
		var pattern = 0;
	
		for (var i = 0; i < 8; i++) {
			
			this.makeImpl(true, i);
	
			var lostPoint = QRUtil.getLostPoint(this);
	
			if (i === 0 || minLostPoint >  lostPoint) {
				minLostPoint = lostPoint;
				pattern = i;
			}
		}
	
		return pattern;
	},
	
	createMovieClip : function(target_mc, instance_name, depth) {
	
		var qr_mc = target_mc.createEmptyMovieClip(instance_name, depth);
		var cs = 1;
	
		this.make();

		for (var row = 0; row < this.modules.length; row++) {
			
			var y = row * cs;
			
			for (var col = 0; col < this.modules[row].length; col++) {
	
				var x = col * cs;
				var dark = this.modules[row][col];
			
				if (dark) {
					qr_mc.beginFill(0, 100);
					qr_mc.moveTo(x, y);
					qr_mc.lineTo(x + cs, y);
					qr_mc.lineTo(x + cs, y + cs);
					qr_mc.lineTo(x, y + cs);
					qr_mc.endFill();
				}
			}
		}
		
		return qr_mc;
	},

	setupTimingPattern : function() {
		
		for (var r = 8; r < this.moduleCount - 8; r++) {
			if (this.modules[r][6] !== null) {
				continue;
			}
			this.modules[r][6] = (r % 2 === 0);
		}
	
		for (var c = 8; c < this.moduleCount - 8; c++) {
			if (this.modules[6][c] !== null) {
				continue;
			}
			this.modules[6][c] = (c % 2 === 0);
		}
	},
	
	setupPositionAdjustPattern : function() {
	
		var pos = QRUtil.getPatternPosition(this.typeNumber);
		
		for (var i = 0; i < pos.length; i++) {
		
			for (var j = 0; j < pos.length; j++) {
			
				var row = pos[i];
				var col = pos[j];
				
				if (this.modules[row][col] !== null) {
					continue;
				}
				
				for (var r = -2; r <= 2; r++) {
				
					for (var c = -2; c <= 2; c++) {
					
						if (Math.abs(r) === 2 || 
                            Math.abs(c) === 2 ||
                            (r === 0 && c === 0) ) {
							this.modules[row + r][col + c] = true;
						} else {
							this.modules[row + r][col + c] = false;
						}
					}
				}
			}
		}
	},
	
	setupTypeNumber : function(test) {
	
		var bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        var mod;
	
		for (var i = 0; i < 18; i++) {
			mod = (!test && ( (bits >> i) & 1) === 1);
			this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
		}
	
		for (var x = 0; x < 18; x++) {
			mod = (!test && ( (bits >> x) & 1) === 1);
			this.modules[x % 3 + this.moduleCount - 8 - 3][Math.floor(x / 3)] = mod;
		}
	},
	
	setupTypeInfo : function(test, maskPattern) {
	
		var data = (this.errorCorrectLevel << 3) | maskPattern;
		var bits = QRUtil.getBCHTypeInfo(data);
        var mod;
	
		// vertical		
		for (var v = 0; v < 15; v++) {
	
			mod = (!test && ( (bits >> v) & 1) === 1);
	
			if (v < 6) {
				this.modules[v][8] = mod;
			} else if (v < 8) {
				this.modules[v + 1][8] = mod;
			} else {
				this.modules[this.moduleCount - 15 + v][8] = mod;
			}
		}
	
		// horizontal
		for (var h = 0; h < 15; h++) {
	
			mod = (!test && ( (bits >> h) & 1) === 1);
			
			if (h < 8) {
				this.modules[8][this.moduleCount - h - 1] = mod;
			} else if (h < 9) {
				this.modules[8][15 - h - 1 + 1] = mod;
			} else {
				this.modules[8][15 - h - 1] = mod;
			}
		}
	
		// fixed module
		this.modules[this.moduleCount - 8][8] = (!test);
	
	},
	
	mapData : function(data, maskPattern) {
		
		var inc = -1;
		var row = this.moduleCount - 1;
		var bitIndex = 7;
		var byteIndex = 0;
		
		for (var col = this.moduleCount - 1; col > 0; col -= 2) {
	
			if (col === 6) col--;
	
			while (true) {
	
				for (var c = 0; c < 2; c++) {
					
					if (this.modules[row][col - c] === null) {
						
						var dark = false;
	
						if (byteIndex < data.length) {
							dark = ( ( (data[byteIndex] >>> bitIndex) & 1) === 1);
						}
	
						var mask = QRUtil.getMask(maskPattern, row, col - c);
	
						if (mask) {
							dark = !dark;
						}
						
						this.modules[row][col - c] = dark;
						bitIndex--;
	
						if (bitIndex === -1) {
							byteIndex++;
							bitIndex = 7;
						}
					}
				}
								
				row += inc;
	
				if (row < 0 || this.moduleCount <= row) {
					row -= inc;
					inc = -inc;
					break;
				}
			}
		}
		
	}

};

QRCode.PAD0 = 0xEC;
QRCode.PAD1 = 0x11;

QRCode.createData = function(typeNumber, errorCorrectLevel, dataList) {
	
	var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
	
	var buffer = new QRBitBuffer();
	
	for (var i = 0; i < dataList.length; i++) {
		var data = dataList[i];
		buffer.put(data.mode, 4);
		buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
		data.write(buffer);
	}

	// calc num max data.
	var totalDataCount = 0;
	for (var x = 0; x < rsBlocks.length; x++) {
		totalDataCount += rsBlocks[x].dataCount;
	}

	if (buffer.getLengthInBits() > totalDataCount * 8) {
		throw new Error("code length overflow. (" + 
            buffer.getLengthInBits() + 
            ">" +  
            totalDataCount * 8 + 
            ")");
	}

	// end code
	if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
		buffer.put(0, 4);
	}

	// padding
	while (buffer.getLengthInBits() % 8 !== 0) {
		buffer.putBit(false);
	}

	// padding
	while (true) {
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCode.PAD0, 8);
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCode.PAD1, 8);
	}

	return QRCode.createBytes(buffer, rsBlocks);
};

QRCode.createBytes = function(buffer, rsBlocks) {

	var offset = 0;
	
	var maxDcCount = 0;
	var maxEcCount = 0;
	
	var dcdata = new Array(rsBlocks.length);
	var ecdata = new Array(rsBlocks.length);
	
	for (var r = 0; r < rsBlocks.length; r++) {

		var dcCount = rsBlocks[r].dataCount;
		var ecCount = rsBlocks[r].totalCount - dcCount;

		maxDcCount = Math.max(maxDcCount, dcCount);
		maxEcCount = Math.max(maxEcCount, ecCount);
		
		dcdata[r] = new Array(dcCount);
		
		for (var i = 0; i < dcdata[r].length; i++) {
			dcdata[r][i] = 0xff & buffer.buffer[i + offset];
		}
		offset += dcCount;
		
		var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
		var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);

		var modPoly = rawPoly.mod(rsPoly);
		ecdata[r] = new Array(rsPoly.getLength() - 1);
		for (var x = 0; x < ecdata[r].length; x++) {
            var modIndex = x + modPoly.getLength() - ecdata[r].length;
			ecdata[r][x] = (modIndex >= 0)? modPoly.get(modIndex) : 0;
		}

	}
	
	var totalCodeCount = 0;
	for (var y = 0; y < rsBlocks.length; y++) {
		totalCodeCount += rsBlocks[y].totalCount;
	}

	var data = new Array(totalCodeCount);
	var index = 0;

	for (var z = 0; z < maxDcCount; z++) {
		for (var s = 0; s < rsBlocks.length; s++) {
			if (z < dcdata[s].length) {
				data[index++] = dcdata[s][z];
			}
		}
	}

	for (var xx = 0; xx < maxEcCount; xx++) {
		for (var t = 0; t < rsBlocks.length; t++) {
			if (xx < ecdata[t].length) {
				data[index++] = ecdata[t][xx];
			}
		}
	}

	return data;

};

module.exports = QRCode;

}};const cache={};function require(k){if(!cache[k]){const m={exports:{}};cache[k]=m;modules[k](m,m.exports,require)}return cache[k].exports}return require("./index")})();
function pixPayload(c){const key=String(c?.pix_key||'').trim();if(!key||key.length>77||!/^[\x21-\x7e]+$/.test(key))throw Error('Chave PIX inválida ou indisponível.');const clean=(v,n)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 $%*+\-./:]/g,'').trim().slice(0,n);const name=clean(c.pix_holder_name,25);if(!name)throw Error('Titular PIX indisponível.');const tlv=(id,v)=>id+String(v.length).padStart(2,'0')+v;const base=tlv('00','01')+tlv('26',tlv('00','br.gov.bcb.pix')+tlv('01',key))+tlv('52','0000')+tlv('53','986')+tlv('58','BR')+tlv('59',name)+tlv('60','NITEROI')+tlv('62',tlv('05','***'))+'6304';let crc=65535;for(const ch of base){crc^=ch.charCodeAt(0)<<8;for(let i=0;i<8;i++)crc=((crc<<1)^((crc&32768)?4129:0))&65535}return base+crc.toString(16).toUpperCase().padStart(4,'0')}
function qrData(value){const qr=new QRLocal(-1,0);qr.addData(Array.from(new TextEncoder().encode(value),b=>String.fromCharCode(b)).join(''));qr.make();const n=qr.getModuleCount(),size=n+8;let d='';for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))d+=`M${x+4} ${y+4}h1v1h-1z`;return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size*8}" height="${size*8}" shape-rendering="crispEdges"><path fill="white" d="M0 0h${size}v${size}H0z"/><path fill="black" d="${d}"/></svg>`)}
window.tsCompanyContactQr=qrData;
function validWeb(v){try{const u=new URL(v);return u.protocol==='https:'||u.protocol==='http:'?u.href:''}catch{return ''}}
const companyQrIcon='<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h4v4h-7v-4m7-3v1"/></svg>'; 
function companyField(label,value){
 return '<div class="f315field"><span>'+esc(label)+'</span><strong>'+esc(String(value??'—'))+'</strong></div>';
}
function companyPixContent(data,actionAttr='data-f314'){
 return companyField('Titular',data.pix_holder_name)+companyField('Banco',data.pix_bank_name)+
  '<div class="f315pix"><span>Chave PIX</span><button type="button" '+actionAttr+'="copy">Copiar chave PIX</button>'+
  '<button type="button" '+actionAttr+'="qr" aria-label="Exibir QR Code PIX">'+companyQrIcon+'</button></div>';
}
window.tsCompanyPix={
 async copy(data){
  if(!data?.pix_key)throw Error('Chave PIX indisponível.');
  await navigator.clipboard.writeText(data.pix_key);
  toast('Copiado para a área de transferência',1500);
 },
 showCode:data=>financeDialog('Escaneie no aplicativo do seu banco e informe o valor.',false,true,data)
};
function financeDialog(message,yesNo=false,qr=false,companyData=settings){return new Promise(resolve=>{const overlay=document.createElement('div');overlay.className='f314confirm f315dialog';const panel=document.createElement('div');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');const heading=document.createElement('h3');heading.textContent=qr==='instagram'?'QR Code Instagram':qr?'QR Code PIX':'Transfer Sudeste';panel.append(heading);const text=document.createElement('p');text.textContent=message;panel.append(text);if(qr){const image=document.createElement('img');image.alt=qr==='instagram'?'QR Code Instagram':'QR Code PIX estático';image.src=qrData(qr==='instagram'?validWeb(companyData.instagram_url):pixPayload(companyData));panel.append(image)}const actions=document.createElement('div');(yesNo?['Não','Sim']:['OK']).forEach((label,i)=>{const b=document.createElement('button');b.type='button';b.className=yesNo&&i===0?'back':'primary';b.textContent=label;b.onclick=()=>{overlay.remove();resolve(!yesNo||i===1)};actions.append(b)});panel.append(actions);overlay.append(panel);document.body.append(overlay);actions.querySelector('button').focus()})}

function openDriverFolds(host){
 return new Set([...host.querySelectorAll('details[open][data-driver-fold]')].map(details=>details.dataset.driverFold));
}
function render(view){
 if(view==='motoristaEmpresa'){
  const host=$('ts314Empresa');
  host.innerHTML=renderDriverCompany({settings,esc,row,validWeb,expanded:openDriverFolds(host),
   banking:settings?companyPixContent(settings):''});
  return;
 }
 if(view==='financeiro'){
  $('ts314Admin').innerHTML=card('Resumo',
   row('A receber',money(sum(entries.filter(r=>r.transfer_direction==='driver_to_company'&&r.transfer_status!=='confirmed'),'transfer_amount')))+
   row('A pagar',money(sum(entries.filter(r=>r.transfer_direction==='company_to_driver'&&r.transfer_status!=='confirmed'),'transfer_amount'))))+
   (owner?companyEdit(true):'')+transfers(entries,true);
  return;
 }
 const host=$('ts314Ganhos');
 host.innerHTML=renderDriverEarnings({period,today:today(),entries,settings,
  expanded:openDriverFolds(host),money,esc,row,transfers});
}

window.ts314Load=async(view)=>{const n=++seq;lastView=view;const host=$(view==='financeiro'?'ts314Admin':view==='motoristaEmpresa'?'ts314Empresa':'ts314Ganhos');host.textContent='Carregando…';try{const se=await current();if(!se)throw Error('Sessão expirada. Entre novamente.');const [rows,c,o]=await Promise.all([req('/rest/v1/driver_financial_entries?select=*&order=service_date.desc',{headers:{Authorization:'Bearer '+se.access_token}}),rpc('ts_get_company_settings'),view==='financeiro'?rpc('is_owner'):false]);if(n!==seq||auth.session?.user?.id!==se.user.id)return;entries=rows;settings=c;owner=o===true;render(view)}catch(e){if(n===seq)host.textContent='Não foi possível carregar: '+messageError(e)}};
function chooseTransfer(){return new Promise(resolve=>{const overlay=document.createElement('div');overlay.className='f314confirm';overlay.innerHTML='<div role="dialog" aria-modal="true" aria-label="O que deseja confirmar?"><h3>O que deseja confirmar?</h3><div><button type="button" class="primary">Recebimento</button><button type="button" class="primary">Repasse</button></div><button type="button" class="back f314cancel">Cancelar</button></div>';document.body.append(overlay);const finish=v=>{overlay.remove();resolve(v)};overlay.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>finish(['confirm','report',null][i]));overlay.onclick=e=>{if(e.target===overlay)finish(null)};overlay.querySelector('button').focus()})}
function askReceipt(){return new Promise(resolve=>{const overlay=document.createElement('div');overlay.className='f314confirm';overlay.innerHTML='<div role="dialog" aria-modal="true" aria-label="Confirmar recebimento?"><h3>Confirmar recebimento?</h3><div><button type="button" class="back">Não</button><button type="button" class="primary">Sim</button></div></div>';document.body.append(overlay);const buttons=overlay.querySelectorAll('button');buttons.forEach((b,i)=>b.onclick=()=>{overlay.remove();resolve(i===1)});buttons[0].focus()})}function toast(t,duration=2000){document.querySelectorAll('.f314toast').forEach(n=>n.remove());const el=document.createElement('div');el.className='f314toast';el.setAttribute('role','status');el.setAttribute('aria-live','polite');const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');icon.setAttribute('stroke-width','2');icon.setAttribute('aria-hidden','true');const circle=document.createElementNS(icon.namespaceURI,'circle');circle.setAttribute('cx','12');circle.setAttribute('cy','12');circle.setAttribute('r','9');const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d','m8 12 3 3 5-6');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');icon.append(circle,path);const label=document.createElement('span');label.textContent=t;el.append(icon,label);document.body.append(el);setTimeout(()=>el.remove(),duration)}document.addEventListener('click',async e=>{const b=e.target.closest('[data-f314]');if(!b)return;const a=b.dataset.f314,ids=b.dataset.ids;try{if(a==='period'){period=ids;render(lastView);return}if(a==='copy'){if(!settings?.pix_key)throw Error('Chave PIX indisponível');await navigator.clipboard.writeText(settings.pix_key);toast(lastView==='motoristaEmpresa'?'Copiado para a área de transferência':'PIX copiado',lastView==='motoristaEmpresa'?1500:2000);return}if(a==='qr'||a==='instagramqr'){const user=auth.session?.user?.id;const fresh=await rpc('ts_get_company_settings');if(!user||auth.session?.user?.id!==user)return;settings=fresh;render(lastView);if(a==='instagramqr'){if(!validWeb(settings.instagram_url))throw Error('Instagram indisponível.');await financeDialog('Escaneie com a câmera para acessar o Instagram da empresa.',false,'instagram')}else{pixPayload(settings);await financeDialog('Escaneie no aplicativo do seu banco e informe o valor.',false,true)}return}b.disabled=true;if(a==='choose'){const user=auth.session?.user?.id;const choice=await chooseTransfer();if(!choice||!user||auth.session?.user?.id!==user)return;const eligible=entries.filter(r=>choice==='confirm'?r.transfer_direction==='company_to_driver'&&r.transfer_status==='reported':r.transfer_direction==='driver_to_company'&&r.transfer_status==='pending');if(!eligible.length){await financeDialog(choice==='confirm'?'Nenhum recebimento disponível para confirmação. Aguarde a empresa informar o pagamento.':'Nenhum repasse disponível para informar.');return}const total=money(sum(eligible,'transfer_amount'));if(!await financeDialog((choice==='confirm'?'Confirmar recebimento de ':'Confirmar que efetuou o repasse de ')+total+'?',true))return;if(auth.session?.user?.id!==user)return;await rpc('ts_financial_transfer_action',{p_entry_ids:eligible.map(r=>r.id),p_action:choice})}else if(a==='report'||a==='confirm'){if(!(a==='confirm'&&lastView==='motoristaGanhos'?await askReceipt():confirm(a==='report'?'Confirma que efetuou o pagamento?':'Confirma o recebimento?')))return;await rpc('ts_financial_transfer_action',{p_entry_ids:ids.split(','),p_action:a})}else if(a==='save'){const v={};document.querySelectorAll('[data-f314-field]').forEach(x=>v[x.dataset.f314Field]=x.value);await rpc('ts_owner_update_company_settings',{p_whatsapp_number:v.whatsapp_number,p_email:v.email,p_instagram_url:v.instagram_url,p_website_url:v.website_url,p_pix_key:v.pix_key,p_pix_holder_name:v.pix_holder_name,p_pix_bank_name:v.pix_bank_name,p_commission_percentage:Number(v.commission_percentage),p_deadline_days:Number(v.driver_payment_deadline_days),p_warning_days:Number(v.driver_payment_warning_days)})}else if(a==='correct'){const r=entries.find(x=>x.id===ids),reason=prompt('Motivo da correção');if(!reason?.trim())return;const reset=r.transfer_status==='confirmed'&&confirm('Reverter confirmação?');let gross=null,pct=null,due=null;if(r.transfer_status==='pending'){gross=prompt('Valor bruto',r.gross_amount);if(gross===null)return;pct=prompt('Comissão (%)',r.commission_percentage);if(pct===null)return;if(r.due_date){due=prompt('Vencimento AAAA-MM-DD',r.due_date);if(due===null)return}}await rpc('ts_owner_correct_financial_entry',{p_entry_id:ids,p_reason:reason,p_gross_amount:gross===null?null:Number(gross),p_commission_percentage:pct===null?null:Number(pct),p_due_date:due,p_reset_confirmation:reset})}await window.ts314Load(lastView);toast('Registro atualizado')}catch(err){await financeDialog(messageError(err))}finally{b.disabled=false}});
let refresh3144=false;async function refreshGanhos3144(){if(refresh3144||document.hidden||driver.role!=='approved'||!['motoristaGanhos','motoristaEmpresa'].some(v=>$(v)?.classList.contains('active'))||document.querySelector('.f314confirm')||document.querySelector('#ts314Ganhos button:disabled'))return;refresh3144=true;const n=seq;try{const se=await current();if(!se)return;const [rows,c]=await Promise.all([req('/rest/v1/driver_financial_entries?select=*&order=service_date.desc',{headers:{Authorization:'Bearer '+se.access_token}}),rpc('ts_get_company_settings')]);if(n!==seq||auth.session?.user?.id!==se.user.id||!['motoristaGanhos','motoristaEmpresa'].some(v=>$(v)?.classList.contains('active'))||document.querySelector('.f314confirm')||document.querySelector('#ts314Ganhos button:disabled'))return;if(JSON.stringify(rows)!==JSON.stringify(entries)||JSON.stringify(c)!==JSON.stringify(settings)){entries=rows;settings=c;render(lastView)}}catch{}finally{refresh3144=false}}setInterval(refreshGanhos3144,10000);document.addEventListener('visibilitychange',refreshGanhos3144);
setInterval(async()=>{if(driver.role!=='approved'||!auth.session?.user?.id)return;try{const se=await current();if(!se)return;const [rows,c]=await Promise.all([req('/rest/v1/driver_financial_entries?select=id,due_date,transfer_amount,transfer_status&transfer_direction=eq.driver_to_company&transfer_status=neq.confirmed',{headers:{Authorization:'Bearer '+se.access_token}}),rpc('ts_get_company_settings')]);if(auth.session?.user?.id!==se.user.id)return;const limit=new Date(today()+'T12:00:00Z');limit.setUTCDate(limit.getUTCDate()+Number(c.driver_payment_warning_days));const due=rows.filter(r=>r.due_date<=limit.toISOString().slice(0,10)&&!warned.has(se.user.id+r.id+today()));if(due.length){due.forEach(r=>warned.add(se.user.id+r.id+today()));if(confirm('Atenção: '+money(sum(due,'transfer_amount'))+' em repasses vencidos ou próximos do vencimento. Consultar Ganhos?'))window.tsNavigate('motoristaGanhos')}}catch{}},30000);
})();
})();
