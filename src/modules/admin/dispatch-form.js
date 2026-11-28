
(()=>{'use strict';
const $=id=>document.getElementById(id), money=n=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fares=[50,90,140,160,230,280,330,390,460,550,620,700];let step=0,quoteToken=0;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const service=()=>document.querySelector('input[name="serviceType"]:checked').value;
const norm=s=>(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const gig=s=>/\b(gig|galeao)\b/.test(norm(s));
const stops=()=>[...document.querySelectorAll('.stop-entry')].map(row=>({address:row.querySelector('.stop-address').value.trim(),minutes:Number(row.querySelector('.stop-time').value)}));
let stopCounter=0;
function addStop(address='',minutes=10){if(document.querySelectorAll('.stop-entry').length>=8)return;const row=document.createElement('div');row.className='stop-entry';row.innerHTML=`<label>Endereço da parada *</label><input class="stop-address" placeholder="Rua, número, bairro, cidade, estado" required><label>Tempo da parada</label><select class="stop-time">${Array.from({length:36},(_,i)=>`<option value="${(i+1)*10}">${(i+1)*10} minutos</option>`).join('')}</select><button type="button" class="remove-stop">Remover parada</button>`;row.querySelector('.stop-address').value=address;row.querySelector('.stop-time').value=String(minutes);row.querySelector('.remove-stop').onclick=()=>{row.remove();if(!document.querySelectorAll('.stop-entry').length){$('addStops').checked=false;renderStops()}};$('stopsContainer').insertBefore(row,$('addAnotherStop'));}
function renderStops(){const on=$('addStops').checked;$('stopsContainer').classList.toggle('hidden',!on);if(on&&!document.querySelector('.stop-entry'))addStop();if(!on)$('stopsContainer').querySelectorAll('.stop-entry').forEach(e=>e.remove())}
$('stopsContainer').innerHTML='<button type="button" id="addAnotherStop" class="add-stop-button">+ Adicionar outra parada</button><p class="stop-note">O tempo de parada é cobrado em blocos de 10 minutos conforme a tarifa configurada.</p>';
$('addStops').addEventListener('change',renderStops);$('addAnotherStop').onclick=()=>addStop();

const fare=(km,dest,maxKm)=>{if(maxKm==null||km>maxKm)return null;let raw=km<=5?50:50+3*km;const p=fares.find(x=>x+1e-8>=raw);return p==null?null:p+(gig(dest)?20:0)};
function updateService(){document.querySelectorAll('.choice').forEach(x=>x.classList.toggle('selected',x.querySelector('input').checked));$('transferFields').classList.toggle('hidden',service()!=='Transfer');$('otherFields').classList.toggle('hidden',service()==='Transfer');}
document.querySelectorAll('input[name="serviceType"]').forEach(x=>x.addEventListener('change',updateService));
function validate(){let required=step===1?(['tripDate','tripTime','passengers',...(service()==='Transfer'?['origin','destination']:['serviceDetails'])]):step===2?['clientName','clientPhone']:step===3&&!window.tsAdminAllowedForWizard?['ack']:[];for(const id of required){let el=$(id);if(id==='ack'?!el.checked:!String(el.value).trim()){ $('wizardError').textContent=id==='ack'?'Confirme a ciência antes de continuar.':'Preencha os campos obrigatórios para continuar.';el.focus();return false}}if(step===1&&service()==='Transfer'&&$('addStops').checked){for(const stop of stops()){if(!stop.address){$('wizardError').textContent='Preencha o endereço de todas as paradas.';document.querySelector('.stop-entry .stop-address:placeholder-shown')?.focus();return false}}}if(step===2&&!/^\+?[\d\s()-]{10,20}$/.test($('clientPhone').value.trim())){$('wizardError').textContent='Confira o número de WhatsApp com DDD.';return false}return true}
function showStep(n){step=n;$('wizardCard').querySelectorAll('.wstep').forEach((x,i)=>x.classList.toggle('active',i===n));document.querySelectorAll('#progress i').forEach((x,i)=>x.classList.toggle('done',i<=n));$('stepLabel').textContent=`Etapa ${n+1} de 4`;$('stepName').textContent=['Serviço','Viagem','Cliente','Orçamento'][n];$('prevStep').classList.toggle('hidden',n===0);$('nextStep').textContent=n===3?'Concluir agendamento':'Continuar';$('wizardError').textContent='';if(n===3)prepareSummary();requestAnimationFrame(()=>{const card=$('wizardCard');const y=card.getBoundingClientRect().top+window.scrollY-12;window.scrollTo({top:Math.max(0,y),behavior:'smooth'})})}
$('prevStep').onclick=()=>showStep(step-1);
$('nextStep').onclick=async()=>{if(!validate())return;if(step<3){showStep(step+1);return}await window.tsSubmitBooking()};
function navigate(id){
 document.querySelectorAll('.view').forEach(view=>view.classList.toggle('active',view.id===id));
 const menuPage=$(id)?.dataset.menuPage||id;
 document.querySelectorAll('[data-page]').forEach(button=>{
  const active=button.dataset.page===menuPage;
  button.classList.toggle('active',active);
  if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
 });
 window.scrollTo({top:0,behavior:'instant'});
}
window.tsNavigate=navigate;window.tsBaseNavigate=navigate;$('openPolicies').addEventListener('click',e=>{e.preventDefault();navigate('politicas')});$('policiesBack').onclick=()=>{navigate('home');showStep(3)};$('paymentBack').onclick=()=>{navigate('home');showStep(3)};$('paymentDone').onclick=()=>{if(!window.tsBookingId){alert('Não foi possível identificar a solicitação registrada. Verifique suas reservas antes de continuar.');return;}quoteToken++;window.tsQuoteAmount=null;window.tsBookingId=null;document.querySelectorAll('#wizardCard input:not([type=radio]),#wizardCard textarea').forEach(el=>{if(el.type==='checkbox')el.checked=false;else if(el.type==='number')el.value=el.id==='passengers'?'1':'0';else el.value=''});document.querySelector('input[name=serviceType][value=Transfer]').checked=true;$('stopsContainer').querySelectorAll('.stop-entry').forEach(el=>el.remove());renderStops();updateService();$('summary').innerHTML='';$('quote').innerHTML='';$('quoteStatus').textContent='';$('pixCopyStatus').textContent='';navigate('reservas');showStep(0);$('bookingSuccess').classList.remove('hidden');if(typeof window.tsLoadBookings==='function')window.tsLoadBookings()} ;$('bookingSuccessClose').onclick=()=>{$('bookingSuccess').classList.add('hidden');window.tsNavigate(window.tsAdminAllowedForWizard?'administracao':'reservas')};$('copyPix').onclick=async()=>{try{await navigator.clipboard.writeText('21997623931');$('pixCopyStatus').textContent=' Chave copiada.'}catch(e){$('pixCopyStatus').textContent=' Selecione e copie a chave acima.'}};
function line(k,v){return `<div class="summary-line"><b>${esc(k)}</b><div>${esc(v)}</div></div>`}
function prepareSummary(){const v=++quoteToken;window.tsQuoteAmount=null;window.tsQuoteDistance=null;window.tsRouteQuote=null;window.tsDispatchEstimate=null;$('nextStep').disabled=!!window.tsAdminAllowedForWizard;const routeStops=$('addStops').checked?stops():[];$('summary').innerHTML=line('Serviço',service())+line('Data e horário',`${$('tripDate').value} às ${$('tripTime').value}`)+(service()==='Transfer'?line('Origem',$('origin').value)+routeStops.map((x,i)=>line(`Parada ${i+1}`,`${x.address} — ${x.minutes} min`)).join('')+line('Destino',$('destination').value):line('Descrição',$('serviceDetails').value))+line('Passageiros / bagagens',`${$('passengers').value} / ${$('luggage').value}`)+line('Cliente',$('clientName').value)+line('WhatsApp',$('clientPhone').value)+($('notes').value?line('Observações',$('notes').value):'');$('quote').classList.add('hidden');$('mapBlock').classList.add('hidden');if(service()!=='Transfer'){$('quoteStatus').textContent='Orçamento sob consulta. A equipe definirá o valor e as condições.';return}$('quoteStatus').textContent='Consultando rota rodoviária para estimar o valor…';calculateQuote(v)}
// Nominatim publico: requisicoes sequenciais, no maximo uma por segundo.
let lastGeocodeAt=0;
let geocodeQueue=Promise.resolve();
const geocodeCache=new Map();
function geocode(q){
 const key=q.trim();
 const cached=geocodeCache.get(key);
 if(cached)return cached;
 const job=geocodeQueue.then(()=>geocodeAddress(key)).catch(err=>{
  if(geocodeCache.get(key)===job)geocodeCache.delete(key);
  throw err;
 });
 geocodeCache.set(key,job);
 if(geocodeCache.size>100)geocodeCache.delete(geocodeCache.keys().next().value);
 geocodeQueue=job.catch(()=>{});
 return job;
}
async function geocodeAddress(q){const wait=Math.max(0,1100-(Date.now()-lastGeocodeAt));if(wait)await new Promise(resolve=>setTimeout(resolve,wait));lastGeocodeAt=Date.now();const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&countrycodes=br&q='+encodeURIComponent(q),{headers:{Accept:'application/json'}});if(!r.ok)throw Error('Geocodificacao indisponivel');const j=await r.json();if(!j.length)throw Error('Endereco nao encontrado');const a=j[0].address||{};const municipality=a.city||a.town||a.village||a.municipality||null;return {lat:+j[0].lat,lon:+j[0].lon,municipality:municipality?norm(municipality).trim():null,state:a['ISO3166-2-lvl4']||null,airport:[j[0].type,j[0].addresstype].some(value=>['aerodrome','airport'].includes(value))||j[0].class==='aeroway'||j[0].category==='aeroway'||!!a.aeroway}}
async function roadDistance(coords){
 const waypoints=coords.map(c=>`${c.lon},${c.lat}`).join(';');
 const r=await fetch(`https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=false`);
 if(!r.ok)throw Error('Rota indisponível');
 const data=await r.json();
 if(data.code!=='Ok'||!data.routes?.length)throw Error('Sem rota rodoviária');
 return data.routes[0].distance/1000;
}
window.tsRouteServices={geocode,roadDistance,gig};
async function calculateQuote(v){try{const routeStops=$('addStops').checked?stops():[];const names=[$('origin').value,...routeStops.map(x=>x.address),$('destination').value];const coords=[];for(const name of names){coords.push(await geocode(name));if(v!==quoteToken)return}const km=await roadDistance(coords);if(v!==quoteToken)return;const originGeo=coords[0],destinationGeo=coords[coords.length-1];const knownMunicipalities=!!(originGeo.municipality&&destinationGeo.municipality&&originGeo.state&&destinationGeo.state);const sameMunicipality=knownMunicipalities&&originGeo.municipality===destinationGeo.municipality&&originGeo.state===destinationGeo.state;const maxKm=knownMunicipalities?(sameMunicipality?170:120):null;const base=fare(km,$('destination').value,maxKm);const stopMinutes=routeStops.reduce((sum,x)=>sum+x.minutes,0);const surcharge=Math.round(stopMinutes/10*666)/100;let p=base===null?null:Math.round((base+surcharge)*100)/100;window.tsQuoteDistance=km;window.tsRouteQuote=knownMunicipalities?{distance_km:km,origin_municipality:originGeo.municipality,destination_municipality:destinationGeo.municipality,origin_state:originGeo.state,destination_state:destinationGeo.state,is_gig:gig($('destination').value),stop_minutes:stopMinutes}:null;
 if(window.tsAdminAllowedForWizard&&window.tsRouteQuote){
  const estimate=await window.ts315DispatchQuote(window.tsRouteQuote,Number($('passengers').value));
  if(v!==quoteToken)return;
  if(estimate){p=estimate.total;window.tsDispatchEstimate=estimate}
 }
 window.tsQuoteAmount=p;
 $('quoteStatus').textContent=`Distância: ${km.toFixed(1).replace('.',',')} km.`;if(p===null){$('quote').innerHTML='<p><strong>Valor a definir.</strong> Em breve entraremos em contato.</p>'}else{$('quote').innerHTML=`<div class="price">${money(p)}</div>${stopMinutes?line(`Tempo total de paradas${window.tsDispatchEstimate?' incluído no valor':''}`,`${stopMinutes} min`):''}${window.tsDispatchEstimate?.amount?line('Acréscimo por passageiros',money(window.tsDispatchEstimate.amount)):''}${line('Valor a cobrar ao final do serviço',money(p))}<p class="soft-note">O valor informado contempla integralmente o serviço contratado. Eventuais cobranças adicionais poderão ocorrer exclusivamente em caso de alterações no itinerário originalmente acordado.</p>`}$('quote').classList.remove('hidden')}catch(e){if(v===quoteToken){window.tsQuoteAmount=null;
 if(window.tsAdminAllowedForWizard&&window.tsRouteQuote){
  $('quoteStatus').textContent='Tarifa indisponível. O valor será consultado novamente ao concluir o despacho.';
 }else{
  window.tsQuoteDistance=null;window.tsRouteQuote=null;
  $('quoteStatus').textContent='Não foi possível calcular automaticamente. Valor a definir. Em breve entraremos em contato.';
 }}}
 finally{if(v===quoteToken)$('nextStep').disabled=false}}
updateService();showStep(0);
})();
