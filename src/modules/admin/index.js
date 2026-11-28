export function createAdmin({runtime, $, bookingDate, bookingMoney, bookingStops, current, esc, messageError,
 money, req, statusPt, tsDriverMini, tsLoadDriverLookup}) {
let tsAdminAllowed=false,tsAdminRows=[],tsAdminDrivers=[];
let ownerUserId=null;
let tsCalMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1),tsCalSelected='';
const tsAdminNavigate=window.tsNavigate;
window.tsNavigate=id=>{
 if(runtime.session?.access_token&&!runtime.driver.role){
  if(tsAdminAllowed&&['reservas','contato'].includes(id))id='administracao';
  if(!tsAdminAllowed&&id==='administracao')id='reservas';
 }
 if(id==='administracao'&&!tsAdminAllowed)return;
 tsAdminNavigate(id);if(id==='administracao')tsLoadAdmin()
};
function ts299Nav(){
 const logged=!!runtime.session?.access_token;
 if(runtime.driver.role||runtime.client.applyNav())return;
 for(const b of document.querySelectorAll('.nav button[data-page]')){
  const id=b.dataset.page;
  const show=tsAdminAllowed&&logged&&['home','administracao','financeiro'].includes(id);
  b.classList.toggle('hidden',!show);
 }
 const currentView=document.querySelector('.view.active')?.id;
 if(logged&&tsAdminAllowed&&currentView?.startsWith('cliente'))window.tsNavigate('home');
 if(logged&&tsAdminAllowed&&['reservas','contato','motoristaPainel'].includes(currentView))window.tsNavigate('administracao');
 const homeNav=document.querySelector('.nav button[data-page="home"]');
 window.tsAdminAllowedForWizard=!!(tsAdminAllowed&&logged);document.querySelector('#home .checkrow')?.classList.toggle('hidden',window.tsAdminAllowedForWizard);document.getElementById('openPolicies')?.classList.toggle('hidden',window.tsAdminAllowedForWizard);if(homeNav)homeNav.innerHTML=tsAdminAllowed&&logged?'⌂<br>Despacho manual':'⌂<br>Início';
 const heading=document.querySelector('#home .wstep[data-step="0"] .step-title');
 const sub=document.querySelector('#home .wstep[data-step="0"] .step-sub');
 if(heading)heading.textContent=tsAdminAllowed&&logged?'Cadastrar despacho manual':'Como podemos ajudar?';
 if(sub)sub.textContent=tsAdminAllowed&&logged?'Registre uma solicitação recebida pelo WhatsApp ou atendimento direto. Selecione a modalidade e preencha os dados do serviço.':'Escolha o serviço desejado. As modalidades em preparação estão temporariamente indisponíveis.';
 const details=document.querySelector('#home .wstep[data-step="1"] .step-sub');
 if(details)details.textContent=tsAdminAllowed&&logged?'Preencha os dados informados pelo cliente para registrar o despacho.':'Informe os dados para preparar seu orçamento.';
}
async function tsCheckAdmin(){
 const s=await current();const uid=s?.user?.id;if(!s){tsAdminAllowed=false;ownerUserId=null;runtime.driver.role=null;}
 if(!s){ts299Nav();return false;}
 try{
  const headers={Authorization:'Bearer '+s.access_token};
  const [owner,admin]=await Promise.all([
   req('/rest/v1/rpc/is_owner',{method:'POST',headers,body:'{}'}),
   req('/rest/v1/rpc/is_admin',{method:'POST',headers,body:'{}'})
  ]);
  if(runtime.session?.user?.id!==uid)return;
  ownerUserId=owner===true?uid:null;
  tsAdminAllowed=owner===true||admin===true;if(tsAdminAllowed)runtime.driver.role=null;
  $('adminNav').classList.toggle('hidden',!tsAdminAllowed);
  $('ts315OwnerTools').classList.toggle('hidden',owner!==true);
  $('ts315AboutTools').classList.toggle('hidden',!tsAdminAllowed);
  if(tsAdminAllowed)void window.ts315LoadDispatchRules?.().catch(()=>{});
 }catch(e){
  if(runtime.session?.user?.id===uid)ownerUserId=null;
  console.warn('Não foi possível validar perfil administrativo:',e);
 }
 ts299Nav();
 return tsAdminAllowed;
}
async function tsLoadAdmin(){
 if(!tsAdminAllowed)return;
 const target=$('adminBookings');target.textContent='Carregando reservas…';
 try{
  const s=await current();if(!s)throw Error('Sessão expirada. Entre novamente.');
  const headers={Authorization:'Bearer '+s.access_token};
  const [bookings,drivers]=await Promise.all([
   req('/rest/v1/bookings?select=*&deleted_at=is.null&order=created_at.desc&limit=150',{headers}),
   req('/rest/v1/rpc/admin_list_drivers',{method:'POST',headers,body:'{}'})
  ]);
  if(!tsAdminAllowed||runtime.session?.user?.id!==s.user.id)return;tsAdminRows=Array.isArray(bookings)?bookings:[];
  tsAdminDrivers=Array.isArray(drivers)?drivers:[];
  await tsLoadDriverLookup(tsAdminRows);if(!tsAdminAllowed||runtime.session?.user?.id!==s.user.id)return;tsRenderAdmin();runtime.lastAdminSync=Date.now();
 }catch(e){target.textContent='Não foi possível carregar reservas: '+messageError(e)}
}
function tsRenderAdmin(){
 const filter=$('adminFilter').value,term=($('adminSearch').value||'').trim().toLocaleLowerCase('pt-BR');
 const rows=tsAdminRows.filter(b=>(!tsCalSelected||b.pickup_date===tsCalSelected)&&(filter==='all'||b.booking_status===filter)&&(!term||[b.client_name,b.origin,b.destination,b.id,b.client_phone,b.flight_number].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(term))));
 const pending=tsAdminRows.filter(b=>b.booking_status==='pending').length;
 const unassigned=tsAdminRows.filter(b=>!b.driver_id).length;
 const priced=tsAdminRows.filter(b=>b.total_amount!=null);
 const amount=priced.reduce((sum,b)=>sum+Number(b.total_amount||0),0);
 const fmt=val=>money(Number(val||0));
 $('adminKpis').innerHTML=`<div class="ts-kpi"><span>Reservas</span><strong>${tsAdminRows.length}</strong><small>Total consultado</small></div><div class="ts-kpi"><span>Aguardando confirmação</span><strong>${pending}</strong><small>Solicitações pendentes</small></div><div class="ts-kpi"><span>Valor contratado*</span><strong class="ts-money">${esc(fmt(amount))}</strong><small>Reservas com preço definido</small></div><div class="ts-kpi"><span>Sem motorista</span><strong>${unassigned}</strong><small>Aguardando designação</small></div>`;
 tsDrawCalendar();
 $('adminCount').textContent=String(rows.length);
 $('adminSummary').textContent=`${rows.length} de ${tsAdminRows.length} reservas · *Soma de orçamentos, não representa pagamentos recebidos.`;
 $('adminBookings').innerHTML=rows.length?rows.map(b=>{
  const state=String(b.booking_status||'pending').toLowerCase();
  const badgeClass=state==='confirmed'?'ts-ok':state==='cancelled'?'ts-bad':state==='completed'?'ts-done':state==='in_progress'?'ts-running':'ts-wait';
  const id=String(b.id||'');
  const shortId=id.slice(0,8).toUpperCase();
  const date=bookingDate(b.pickup_date),time=String(b.pickup_time||'').slice(0,5)||'—';
  return `<article class="ts-booking"><div class="ts-booking-top"><div class="ts-booking-person"><div class="ts-booking-id">RESERVA #${esc(shortId)}</div><h3>${esc(b.client_name||'Cliente')}</h3></div><span class="ts-status ${badgeClass}">${esc(statusPt(b.booking_status))}</span></div>
  <div class="ts-booking-meta"><span class="ts304-date">◷ ${esc(date)} · ${esc(time)}</span><span class="ts304-payment ${String(b.payment_status||'').toLowerCase()==='paid'?'is-paid':'is-pending'}">Pagamento: ${esc(statusPt(b.payment_status))}</span></div>
  <div class="ts-route"><div class="ts-route-point"><span class="ts-route-dot"></span><div><small>ORIGEM</small><p>${esc(b.origin||'Não informada')}</p></div></div><div class="ts-route-point"><span class="ts-route-dot ts-destination"></span><div><small>DESTINO</small><p>${esc(b.destination||'Não informado')}</p></div></div></div>
  <div class="v292-stops">${bookingStops(b.stops).map((st,i)=>`<small>Parada ${i+1}: ${esc(st.address||String(st))}</small>`).join('')}</div><div class="ts-finance"><div><small>VALOR TOTAL</small><strong>${esc(bookingMoney(b.total_amount))}</strong></div></div>
  ${tsDriverMini(b)}
  ${runtime.dispatchOffers?'<div class="ts-queue-booking" data-queue-booking="'+esc(id)+'" hidden></div>':''}
  <div class="ts-assign"><p class="ts-assign-title">${b.driver_id?'Substituir ou retirar motorista':'Designar motorista'}</p>
   <div class="ts-assign-controls"><select class="ts-assign-select" data-booking="${esc(id)}" aria-label="Motorista da reserva ${esc(shortId)}"><option value="">Sem motorista designado</option>${tsAdminDrivers.map(d=>`<option value="${esc(d.driver_id)}" ${d.driver_id===b.driver_id?'selected':''}>${esc(d.full_name||'Motorista')}</option>`).join('')}</select><button type="button" class="ts-assign-save" data-booking="${esc(id)}">Salvar designação</button></div>
   <p class="ts-assign-feedback" aria-live="polite">${tsAdminDrivers.length?'A designação não depende do pagamento.':'Nenhum motorista ativo cadastrado.'}</p>
  </div>
  <div class="ts-booking-footer"><button type="button" class="ts304-edit-booking" data-v292-edit="${esc(id)}" aria-label="Editar reserva ${esc(shortId)}" title="Editar reserva"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z"/></svg></button><button type="button" class="ts-share-booking" data-share-booking="${esc(id)}" aria-label="Compartilhar reserva ${esc(shortId)}"><svg xmlns="http://www.w3.org/2000/svg" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V2m0 0L7 7m5-5 5 5"/><path d="M5 11H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1"/></svg></button><button type="button" class="ts-delete-booking" data-booking="${esc(id)}">Excluir</button><button type="button" class="v292-open-admin" data-v292-open="${esc(id)}">Detalhes ↗</button></div>
 </article>`;
 }).join(''):'<div class="ts-empty">Nenhuma reserva encontrada. Ajuste a busca ou os filtros.</div>';
 runtime.dispatchOffers?.renderAdminRows();
}

// V30.1 — Compartilhamento operacional exclusivo da Gestão.
$('adminBookings').addEventListener('click',async event=>{
 const btn=event.target.closest('[data-share-booking]');if(!btn||!tsAdminAllowed)return;
 const b=tsAdminRows.find(row=>row.id===btn.dataset.shareBooking);if(!b)return;
 const lines=['*TRANSFER SUDESTE — OFERTA DE SERVIÇO*','','Reserva: #'+String(b.id).slice(0,8).toUpperCase(),
 'Tipo de serviço: '+(b.service_type||'Transfer'),'Data: '+bookingDate(b.pickup_date),'Horário: '+String(b.pickup_time||'').slice(0,5),
 'Origem: '+(b.origin||'Não informada'),'Destino: '+(b.destination||'Não informado')];
 bookingStops(b.stops).forEach((st,i)=>lines.push('Parada '+(i+1)+': '+(st.address||'')+(st.minutes?' ('+st.minutes+' min)':'')));
 if(b.passengers!=null)lines.push('Passageiros: '+b.passengers);
 if(b.luggage!=null)lines.push('Bagagens: '+b.luggage);
 if(b.flight_number)lines.push('Voo: '+b.flight_number);
 if(b.notes?.trim())lines.push('Observações: '+b.notes.trim());
 lines.push('','Valor total do serviço: '+bookingMoney(b.total_amount),
 '','Você tem disponibilidade para realizar este serviço?');
 const text=lines.join('\n');
 try{if(navigator.share){await navigator.share({text});return}}
 catch(err){if(err?.name==='AbortError')return}
 window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener');
});
$('adminBookings').addEventListener('click',async event=>{
 const button=event.target.closest('.ts-assign-save');if(!button)return;
 const box=button.closest('.ts-assign');const select=box?.querySelector('.ts-assign-select');
 const feedback=box?.querySelector('.ts-assign-feedback');if(!select||!feedback)return;
 const bookingId=button.dataset.booking;
 const row=tsAdminRows.find(b=>b.id===bookingId);if(!row)return;
 const newDriver=select.value||null;
 if((row.driver_id||null)===newDriver){feedback.textContent='Nenhuma alteração a salvar.';return}
 const label=newDriver?(tsAdminDrivers.find(d=>d.driver_id===newDriver)?.full_name||'motorista selecionado'):'nenhum motorista';
 if(!confirm('Confirmar '+(newDriver?'designação de '+label:'retirada do motorista')+' nesta reserva?'))return;
 button.disabled=true;feedback.classList.remove('error');feedback.textContent='Salvando designação…';
 try{
  const s=await current();if(!s)throw Error('Sessão expirada. Entre novamente.');
  if(!await runtime.dispatchOffers?.assign(bookingId,newDriver))await req('/rest/v1/rpc/admin_assign_booking_driver',{method:'POST',headers:{Authorization:'Bearer '+s.access_token},body:JSON.stringify({p_booking_id:bookingId,p_driver_id:newDriver})});
  row.driver_id=newDriver;tsRenderAdmin();
  const refreshed=document.querySelector('.ts-assign-select[data-booking="'+bookingId+'"]')?.closest('.ts-assign')?.querySelector('.ts-assign-feedback');
  if(refreshed)refreshed.textContent='Designação atualizada com sucesso.';
 }catch(e){feedback.textContent='Não foi possível salvar: '+messageError(e);feedback.classList.add('error');button.disabled=false}
});
window.tsDeleteBooking=async id=>{const session=await current();if(!session)throw Error('Sessão expirada. Entre novamente.');return req('/rest/v1/rpc/admin_delete_booking',{method:'POST',headers:{Authorization:'Bearer '+session.access_token},body:JSON.stringify({p_booking_id:id})})};

function tsDrawCalendar(){
 const grid=$('tsCalGrid'),title=$('tsCalTitle');if(!grid||!title)return;
 title.textContent=tsCalMonth.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
 const y=tsCalMonth.getFullYear(),m=tsCalMonth.getMonth();
 const first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate();
 const counts=Object.create(null);
 for(const b of tsAdminRows){const date=String(b.pickup_date||'').slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(date))counts[date]=(counts[date]||0)+1}
 let html=['D','S','T','Q','Q','S','S'].map(x=>'<span class="weekday">'+x+'</span>').join('');
 for(let i=0;i<first;i++)html+='<span class="ts307-empty" aria-hidden="true"></span>';
 for(let d=1;d<=days;d++){
  const date=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  const count=counts[date]||0;
  const volume=count===0?'':count===1?'ts307-one':count<=3?'ts307-mid':'ts307-high';
  html+='<button type="button" data-ts-date="'+date+'" class="ts307-date '+volume+(tsCalSelected===date?' active':'')+'" aria-label="'+d+' de '+title.textContent+(count?', '+count+' reservas':'')+'">'+d+'</button>';
 }
 grid.innerHTML=html;
}
$('tsCalPrev').onclick=()=>{tsCalMonth=new Date(tsCalMonth.getFullYear(),tsCalMonth.getMonth()-1,1);tsDrawCalendar()};
$('tsCalNext').onclick=()=>{tsCalMonth=new Date(tsCalMonth.getFullYear(),tsCalMonth.getMonth()+1,1);tsDrawCalendar()};
$('tsCalClear').onclick=()=>{tsCalSelected='';tsRenderAdmin()};
$('tsCalGrid').onclick=e=>{const b=e.target.closest('[data-ts-date]');if(!b)return;tsCalSelected=tsCalSelected===b.dataset.tsDate?'':b.dataset.tsDate;tsRenderAdmin()};
$('adminRefresh').onclick=tsLoadAdmin;
$('adminFilter').onchange=tsRenderAdmin;
$('adminSearch').oninput=tsRenderAdmin;

// Etapa 144: convite, cadastro, revisão e aprovação.

return {
 get allowed(){return tsAdminAllowed},
 set allowed(value){tsAdminAllowed=value;if(!value)ownerUserId=null},
 get isOwner(){return tsAdminAllowed&&ownerUserId!==null&&ownerUserId===runtime.session?.user?.id},
 get rows(){return tsAdminRows},
 set rows(value){tsAdminRows=value},
 get drivers(){return tsAdminDrivers},
 set drivers(value){tsAdminDrivers=value},
 render:tsRenderAdmin,
 updateNavigation:ts299Nav,
 refresh:tsLoadAdmin,
 check:tsCheckAdmin
};
}
