import {interfaceIcon as icon} from '../../shared/components/interface-icons.js';
import {buildDispatchPayload} from './owner-dispatch-payload.js';
import {createConfirmationAttempt,isDispatchRejection} from './owner-dispatch-confirmation.js';
import {reviewCards,reviewIssues} from './owner-dispatch-review.js';
import {ASSIGNMENT_MODES,eligibleDriver,validAssignment} from './owner-dispatch-assignment.js';
import {PAYMENT_METHODS,PAYMENT_STATES,PAYMENT_RECIPIENTS,validPayment} from './owner-dispatch-payment.js';
import {cents,quoteRoute,summarizeValues} from './owner-dispatch-values.js';
import {loadPhoneLibrary} from '../../core/services/phone-library.js';
import {validParty,SOURCES,clientSearchPath} from './owner-dispatch-party.js';
import {validateBoarding} from './owner-dispatch-boarding.js';
import {validateRoute, calculateRoute} from './owner-dispatch-route.js';
import {createDispatchDraft, DISPATCH_STEPS} from './owner-dispatch-draft.js';

// Confirmação administrativa pela RPC homologada.
export function installOwnerDispatch({isOwner,searchClients,loadCommission,loadAssignmentDrivers,confirmDispatch}) {
  const legacy = document.getElementById('wizardCard');
  const root = document.createElement('section');
  root.id = 'ownerDispatch';
  root.hidden = true;
  legacy.before(root);
  const draft = createDispatchDraft();
  function categories() {
    return [...legacy.querySelectorAll('input[name="serviceType"]')].map(input => ({name:input.value, enabled:!input.disabled}));
  }
  let revision=0, searchAbort;
  let attempt=createConfirmationAttempt({send:confirmDispatch}), submitted=null, receipt=null, rejection=null;
  function render() {
    searchAbort?.abort();
    const renderId=++revision;
    if (!isOwner()) return;
    const {step,data} = draft.snapshot();
    root.replaceChildren();
    root.dataset.screen=String(step);
    
    const card = document.createElement('div'); card.className = 'owner-dispatch-body';
    const line = document.createElement('div'); line.className = 'client-wizard-heading';
    const count = document.createElement('strong'); count.textContent = `Etapa ${step+1} de 8`;
    const name = document.createElement('span'); name.textContent = DISPATCH_STEPS[step]; line.append(count,name);
    const progress = document.createElement('div'); progress.className = 'wizard-progress owner-dispatch-progress'; progress.setAttribute('role','progressbar'); progress.setAttribute('aria-label','Etapas do despacho'); progress.setAttribute('aria-valuemin','0'); progress.setAttribute('aria-valuemax','8'); progress.setAttribute('aria-valuenow',String(step+1));
    DISPATCH_STEPS.forEach((_,i)=>{const bar=document.createElement('i'); if(i<=step)bar.className='done';progress.append(bar);});
    const title=document.createElement('h1');title.textContent=step===0?'Agendar serviço':DISPATCH_STEPS[step];
    root.append(line,progress,title); card.classList.add('wstep','active');
    const actions=document.createElement('div');actions.className='wizard-actions';
    const back=document.createElement('button');back.type='button';back.textContent='Voltar';back.className='back owner-dispatch-back';back.classList.toggle('hidden',step===0);back.disabled=step===0;back.onclick=()=>{if(isOwner()){draft.back();render();}};
    const next=document.createElement('button');next.type='button';next.textContent=draft.snapshot().editing?'Salvar e revisar':'Avançar';next.className='primary owner-dispatch-primary';next.disabled=true;
    if(step===0){
      const options=categories();
      const selected=options.find(c=>c.enabled&&c.name===data[0].service)||options.find(c=>c.enabled);
      if(selected)draft.save({service:selected.name});
      const group=document.createElement('fieldset');const legend=document.createElement('legend');legend.textContent='Selecione o serviço';group.append(legend);
      for(const category of options){
        const label=document.createElement('label');label.className='choice'+(category.name===selected?.name?' selected':'');
        const input=document.createElement('input');input.type='radio';input.name='ownerDispatchService';input.value=category.name;input.disabled=!category.enabled;input.checked=category.name===selected?.name;
        const text=document.createElement('span');text.textContent=category.name;
        input.onchange=()=>{if(isOwner()&&category.enabled){draft.save({service:category.name});render();}};
        label.append(input,text);group.append(label);
      }
      card.append(group);next.disabled=!selected;next.onclick=()=>{if(isOwner()){draft.next((_,fields)=>categories().some(c=>c.enabled&&c.name===fields.service));render();}};
    }else if(step===1){
      const r={stops:[],...data[1]};
      const status=document.createElement('p');status.setAttribute('role','status');
      let request=0;
      const current=()=>isOwner()&&renderId===revision;
      const save=()=>{if(current())draft.save(r);};
      const change=(route=true)=>{request++;if(route)r.distance=null;save();next.disabled=!validateRoute(r);status.textContent='';};
      const field=(parent,label,value,placeholder,update)=>{const l=document.createElement('label');const input=document.createElement('input');input.id='ownerRoute'+(++fieldId);l.htmlFor=input.id;l.textContent=label;input.value=value||'';input.placeholder=placeholder;input.oninput=()=>update(input.value);parent.append(l,input);return l;};
      let fieldId=0;
      const service=document.createElement('p');service.className='client-wizard-service';service.textContent=data[0].service;card.append(service);
      const dates=document.createElement('div');dates.className='ts315-grid';card.append(dates);
      for(const [key,label,type,glyph,placeholder] of [['date','Data *','date','calendar','DD/MM/AAAA'],['time','Horário *','time','clock','HH:MM']]){
        const group=document.createElement('div');const l=document.createElement('label');l.textContent=label;l.htmlFor='ownerRoute'+key;const wrap=document.createElement('div');wrap.className='client-datetime';const text=document.createElement('span');const glyphEl=document.createElement('i');glyphEl.innerHTML=icon(glyph);const input=document.createElement('input');input.id=l.htmlFor;input.type=type;input.value=r[key]||'';const draw=()=>text.textContent=input.value?(key==='date'?input.value.split('-').reverse().join('/'):input.value):placeholder;draw();input.oninput=()=>{r[key]=input.value;draw();change(false);};wrap.append(text,glyphEl,input);group.append(l,wrap);dates.append(group);
      }
      const itinerary=document.createElement('div');itinerary.className='client-wizard-box client-itinerary';card.append(itinerary);
      field(itinerary,'Origem *',r.origin,'Endereço da origem',v=>{r.origin=v;change();}).className='client-point-label origin';
      r.stops.forEach((stop,i)=>{const group=document.createElement('div');group.className='ts315-stop';const l=document.createElement('label');l.textContent=`Parada ${i+1}`;const line=document.createElement('div');line.className='client-wizard-stop-line';const input=document.createElement('input');input.value=stop.address;input.placeholder='Endereço da parada';const remove=document.createElement('button');remove.type='button';remove.className='client-text-button';remove.setAttribute('aria-label','Remover parada');remove.innerHTML=icon('close');remove.onclick=()=>{r.stops.splice(i,1);change();render();};line.append(input,remove);const duration=document.createElement('div');duration.hidden=!stop.address.trim();const dl=document.createElement('label');dl.textContent='Tempo de parada *';const select=document.createElement('select');for(let n=10;n<=360;n+=10){const o=document.createElement('option');o.value=n;o.textContent=n+' min';select.append(o);}select.value=stop.minutes;select.onchange=()=>{stop.minutes=Number(select.value);change();};input.oninput=()=>{stop.address=input.value;duration.hidden=!input.value.trim();change();};duration.append(dl,select);group.append(l,line,duration);itinerary.append(group);});
      const add=document.createElement('button');add.type='button';add.className='back owner-dispatch-add-stop';add.textContent='+ Adicionar parada';add.hidden=r.stops.length>=8;add.onclick=()=>{r.stops.push({address:'',minutes:10});change();render();};itinerary.append(add);
      field(itinerary,'Destino *',r.destination,'Endereço do destino',v=>{r.destination=v;change();}).className='client-point-label destination';
      card.append(status);next.disabled=!validateRoute(r);next.onclick=async()=>{if(!current()||!validateRoute(r))return;const token=++request;next.disabled=true;status.textContent='Calculando trajeto…';try{const distance=r.distance||await calculateRoute(structuredClone(r),window.tsRouteServices);if(token!==request||!current())return;r.distance=distance;save();draft.next((_,v)=>validateRoute(v)&&!!v.distance);render();}catch{if(token===request&&current()){status.textContent='Não foi possível calcular o trajeto. Confira os endereços e avance novamente.';next.disabled=false;}}};
    }else if(step===2){
      const boarding={passengers:1,luggage:0,flight:'',notes:'',specialNeeds:'',...data[2]};
      const fields=document.createElement('div');fields.className='owner-dispatch-fields';
      const status=document.createElement('p');status.setAttribute('role','status');
      let maxPassengers=null;
      const maxLuggage=Number(legacy.querySelector('#luggage')?.max||100);
      const current=()=>isOwner()&&renderId===revision;
      const refresh=()=>{next.disabled=!validateBoarding(boarding,maxPassengers,maxLuggage);};
      const inputs={};const counters=document.createElement('div');counters.className='ts315-grid';fields.append(counters);
      for(const [key,label,type] of [['passengers','Passageiros *','number'],['luggage','Bagagens *','number'],['flight','Número do voo (opcional)','text'],['notes','Observações (opcional)','textarea']]){
        const wrap=document.createElement('label');wrap.textContent=label;
        const el=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')el.type=type;
        el.value=boarding[key]??'';inputs[key]=el;if(key==='flight'){el.maxLength=10;el.placeholder='Ex.: G3 1234';el.style.maxWidth='12ch';}
        if(type==='number'){el.min=key==='passengers'?1:0;el.step=1;if(key==='luggage')el.max=maxLuggage;}
        el.oninput=()=>{if(!current())return;boarding[key]=type==='number'?(el.value===''?null:Number(el.value)):el.value;draft.save(boarding);refresh();};
        if(type==='number'){const counter=document.createElement('div');counter.className='client-counter';for(const delta of [-1,1]){const b=document.createElement('button');b.type='button';b.textContent=delta<0?'−':'+';b.setAttribute('aria-label',(delta<0?'Diminuir ':'Aumentar ')+label);b.onclick=()=>{const n=Number(el.value)+delta;if(n>=Number(el.min)&&(!el.max||n<=Number(el.max))){el.value=n;el.oninput();}};if(delta<0)counter.append(b,el);else counter.append(b);}wrap.append(counter);counters.append(wrap);}else{wrap.append(el);fields.append(wrap);}
      }
      const retry=document.createElement('button');retry.type='button';retry.textContent='Consultar regras de embarque';
      const load=async()=>{if(!current())return;maxPassengers=null;refresh();retry.disabled=true;status.textContent='';try{
        const rules=await window.ts315LoadDispatchRules();if(!current())return;
        const limit=Number(rules?.booking_max_passengers);if(!Number.isSafeInteger(limit)||limit<1)throw new Error('Limite indisponível');
        maxPassengers=limit;inputs.passengers.max=limit;status.textContent='';
      }catch{if(current())status.textContent='Não foi possível carregar os limites. Volte e tente novamente.';}finally{if(current()){retry.disabled=false;refresh();}}};
      retry.onclick=load;fields.append(status);card.append(fields);draft.save(boarding);refresh();load();
      next.onclick=()=>{if(current()){draft.next((_,v)=>validateBoarding(v,maxPassengers,maxLuggage));render();}};
    }else if(step===3){
      const p={mode:'external',clientId:null,contractor:{country:'BR'},passenger:{country:'BR'},samePassenger:true,source:'',...data[3]};
      const current=()=>isOwner()&&renderId===revision;
      const fields=document.createElement('div');fields.className='owner-dispatch-fields';
      const status=document.createElement('p');status.setAttribute('role','status');
      let lib;
      const refresh=()=>{next.disabled=!lib||!validParty(p,lib);};
      const save=()=>{if(current()){draft.save(p);refresh();}};
      const field=(label,type,value,change,options)=>{const wrap=document.createElement('label');wrap.textContent=label;const el=document.createElement(options?'select':type==='textarea'?'textarea':'input');if(options){for(const [v,t] of options){const o=document.createElement('option');o.value=v;o.textContent=t;el.append(o);}}else if(type!=='textarea')el.type=type;el.value=value??'';el.oninput=()=>{if(current())change(el.value);};wrap.append(el);fields.append(wrap);return el;};
      field('Cliente','',p.mode,v=>{p.mode=v;p.clientId=null;p.contractor={country:'BR'};save();render();},[['external','Novo cliente'],['registered','Cliente cadastrado']]);
      if(p.mode==='registered'){
        const query=field('Buscar cliente por nome','search','',()=>{});
        const results=document.createElement('div');const search=document.createElement('button');search.type='button';search.textContent='Buscar cliente';
        search.onclick=async()=>{if(!current())return;searchAbort?.abort();const controller=new AbortController();searchAbort=controller;results.replaceChildren();status.textContent='Buscando…';try{const rows=await searchClients(clientSearchPath(query.value),controller.signal);if(!current()||controller.signal.aborted)return;status.textContent=rows.length?'Selecione o cliente.':'Nenhum cliente encontrado nesta busca.';for(const row of rows){const b=document.createElement('button');b.type='button';b.textContent=row.full_name||'Cliente sem nome';b.onclick=()=>{if(!current())return;const n=lib?.parsePhoneNumberFromString(row.phone||'','BR');p.clientId=row.id;p.contractor={name:row.full_name||'',country:n?.country||'BR',phone:n?.nationalNumber||row.phone||'',email:''};save();render();};results.append(b);}}catch{if(current()&&!controller.signal.aborted)status.textContent='Não foi possível buscar. Confira o nome e tente novamente.';}};
        fields.append(search,results);if(p.clientId){const selected=document.createElement('p');selected.textContent='Cliente selecionado: '+p.contractor.name;fields.append(selected);}
      }
      fields.append(status);card.append(fields);
      loadPhoneLibrary().then(library=>{if(!current())return;lib=library;const names=new Intl.DisplayNames(['pt-BR'],{type:'region'});const countries=lib.getCountries().map(c=>[c,`${names.of(c)} (+${lib.getCountryCallingCode(c)})`]).sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
        const c=p.contractor;p.samePassenger=true;
        field('Nome do cliente *','text',c.name,v=>{c.name=v;save();});field('País e DDI','',c.country,v=>{c.country=v;save();},countries);field('Telefone *','tel',c.phone,v=>{c.phone=v;save();});
        field('Origem da solicitação','',p.source,v=>{p.source=v;save();},[['','Selecione'],...SOURCES.map(v=>[v,v])]);save();
      }).catch(()=>{if(current())status.textContent='Validação de telefone indisponível. Volte e tente novamente.';});
      next.onclick=()=>{if(current()&&lib){draft.next((_,v)=>validParty(v,lib));render();}};
    }else if(step===4){
      const current=()=>isOwner()&&renderId===revision;
      const key=JSON.stringify([data[0].service,data[1],data[2].passengers]);
      const v=data[4].key===key?{...data[4]}:{key,original:null,final:'',reason:'',rate:null};
      const fields=document.createElement('div');fields.className='owner-dispatch-fields';
      const status=document.createElement('p');status.setAttribute('role','status');
      const summary=document.createElement('div');summary.setAttribute('aria-live','polite');
      const money=n=>(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
      const field=(label,type,value,change)=>{const wrap=document.createElement('label');wrap.textContent=label;const el=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')el.type=type;el.value=value??'';if(type==='number'){el.min='0.01';el.step='0.01';}el.oninput=()=>{if(current()){change(el.value);save();}};wrap.append(el);fields.append(wrap);return el;};
      const refresh=()=>{const result=summarizeValues(v);next.disabled=!result;summary.replaceChildren();const row=(label,value)=>{const p=document.createElement('p');p.textContent=label+': '+value;summary.append(p);};row('Valor calculado',v.original?money(v.original):'Indisponível');if(v.original&&Number.isSafeInteger(v.passengerSurcharge)){row('Base com paradas',money(v.original-v.passengerSurcharge));row('Acréscimo por passageiros',money(v.passengerSurcharge));}row('Comissão aplicável',v.rate==null?'Indisponível':v.rate+'%');if(result){for(const [label,k] of [['Desconto','discount'],['Acréscimo administrativo','addition'],['Valor final','final'],['Receita prevista da empresa','commission'],['Valor destinado ao motorista','driver']])row(label,money(result[k]));}};
      const save=()=>{if(current()){draft.save(v);refresh();}};
      const final=field('Valor final (R$)','number',v.final,x=>v.final=x);
      field('Justificativa da alteração manual','textarea',v.reason,x=>v.reason=x);
      const retry=document.createElement('button');retry.type='button';retry.textContent='Consultar tarifa e comissão';
      retry.onclick=async()=>{if(!current())return;retry.disabled=true;const previous=v.original;v.original=null;v.rate=null;save();status.textContent='Consultando…';try{if(data[0].service!=='Transfer')throw Error('Serviço sem cálculo automático disponível.');const route=quoteRoute(data[1],window.tsRouteServices.gig);const [quote,rate]=await Promise.all([window.ts315DispatchQuote(route,data[2].passengers),loadCommission()]);if(!current())return;const original=cents(quote?.total);if(!original||cents(rate)===null||cents(rate)>10000)throw Error('Tarifa ou comissão indisponível.');v.original=original;v.rate=String(rate);v.passengerSurcharge=cents(quote.amount);if(!v.final||cents(v.final)===previous){v.final=(original/100).toFixed(2);final.value=v.final;}status.textContent='Estimativa consultada. A confirmação será validada no servidor.';save();}catch{if(current())status.textContent='Tarifa ou comissão indisponível. Consulte novamente.';}finally{if(current())retry.disabled=false;}};
      fields.append(retry,status,summary);card.append(fields);save();retry.onclick();
      next.onclick=()=>{if(current()){draft.next((_,value)=>!!summarizeValues(value));render();}};
    }else if(step===5){
      const current=()=>isOwner()&&renderId===revision;
      const p={method:'undefined',status:'pending',recipient:'undefined',...data[5]};
      const fields=document.createElement('div');fields.className='owner-dispatch-fields';
      const status=document.createElement('p');status.setAttribute('role','status');
      const refresh=()=>{next.disabled=!validPayment(p);status.textContent=next.disabled?'Confira a forma e o responsável pelo recebimento.':'Informação declarada no rascunho. Nenhum pagamento foi confirmado ou lançado.';};
      const save=()=>{if(current()){draft.save(p);refresh();}};
      const select=(label,key,options)=>{const wrap=document.createElement('label');wrap.textContent=label;const el=document.createElement('select');for(const [v,t] of options){const o=document.createElement('option');o.value=v;o.textContent=t;el.append(o);}el.value=p[key];el.onchange=()=>{if(current()){p[key]=el.value;save();}};wrap.append(el);fields.append(wrap);};
      select('Forma de pagamento','method',PAYMENT_METHODS);
      select('Situação financeira declarada','status',PAYMENT_STATES);
      select('Responsável pelo recebimento','recipient',PAYMENT_RECIPIENTS);
      fields.append(status);card.append(fields);save();
      next.onclick=()=>{if(current()){draft.next((_,value)=>validPayment(value));render();}};
    }else if(step===6){
      const current=()=>isOwner()&&renderId===revision;
      const a={mode:'later',driverId:null,...data[6]};
      let drivers=[];
      const fields=document.createElement('div');fields.className='owner-dispatch-fields';
      const status=document.createElement('p');status.setAttribute('role','status');
      const refresh=()=>{next.disabled=!validAssignment(a,drivers,data[2].passengers,data[0].service);};
      const save=()=>{if(current()){draft.save(a);refresh();}};
      const label=document.createElement('label');label.textContent='Modalidade de designação';const select=document.createElement('select');
      for(const [v,t] of ASSIGNMENT_MODES){const o=document.createElement('option');o.value=v;o.textContent=t;select.append(o);}select.value=a.mode;select.onchange=()=>{if(current()){a.mode=select.value;a.driverId=null;save();render();}};label.append(select);fields.append(label);
      if(a.mode==='manual'){
        const query=document.createElement('input');query.type='search';query.placeholder='Buscar motorista';query.setAttribute('aria-label','Buscar motorista');
        const results=document.createElement('div');
        const draw=()=>{results.replaceChildren();for(const d of drivers.filter(d=>(d.full_name||'').toLocaleLowerCase('pt-BR').includes(query.value.toLocaleLowerCase('pt-BR')))){const b=document.createElement('button');b.type='button';b.textContent=[d.full_name,d.vehicle,d.plate,eligibleDriver(d,data[2].passengers,data[0].service)?'Elegível':'Elegibilidade não confirmada'].filter(Boolean).join(' · ');b.disabled=!eligibleDriver(d,data[2].passengers,data[0].service);b.setAttribute('aria-pressed',String(a.driverId===d.driver_id));b.onclick=()=>{if(current()&&!b.disabled){a.driverId=d.driver_id;save();draw();}};results.append(b);}};
        query.oninput=draw;const retry=document.createElement('button');retry.type='button';retry.textContent='Consultar motoristas';retry.onclick=async()=>{if(!current())return;retry.disabled=true;drivers=[];refresh();draw();status.textContent='Consultando…';try{drivers=await loadAssignmentDrivers();if(!current())return;status.textContent='Motoristas ativos e aprovados. Confira capacidade e disponibilidade antes de designar.';draw();refresh();}catch{if(current())status.textContent='Consulta indisponível.';}finally{if(current())retry.disabled=false;}};fields.append(query,retry,results);retry.onclick();
      }else if(a.mode==='queue'){status.textContent='Regra atual do piloto: ordem da fila, prazo de aceite de 10 minutos, nova tentativa após expiração e encaminhamento à gestão quando esgotada. A distribuição real depende de validação de elegibilidade no servidor.';}
      else{status.textContent='Reserva sem motorista inicialmente definido. Nenhuma reserva será criada nesta etapa.';}
      fields.append(status);card.append(fields);save();next.onclick=()=>{if(current()){draft.next((_,v)=>validAssignment(v,drivers,data[2].passengers,data[0].service));render();}};
    }else{
      const issues=reviewIssues(data);
      back.disabled=!!submitted;
      for(const [index,heading,rows] of reviewCards(data)){
        const section=document.createElement('section');section.className='client-wizard-box client-review-box';
        const header=document.createElement('div');header.className='client-review-heading';
        const h=document.createElement('h2');h.textContent=heading;
        const edit=document.createElement('button');edit.type='button';edit.textContent='Editar';edit.setAttribute('aria-label','Editar '+heading);edit.disabled=!!submitted;edit.onclick=()=>{if(!submitted&&isOwner()&&renderId===revision){draft.edit(index);render();}};header.append(h,edit);section.append(header);
        for(const [label,value] of rows){const p=document.createElement('div');p.className='client-wizard-row';const k=document.createElement('span');k.textContent=label;const v=document.createElement('strong');v.textContent=value??'Não informado';p.append(k,v);section.append(p);}
        if(issues.includes(index)){const warning=document.createElement('p');warning.textContent='Requer nova conferência.';section.append(warning);}
        card.append(section);
      }
      const note=document.createElement('p');note.setAttribute('role','status');card.append(note);
      const current=()=>isOwner()&&renderId===revision;
      next.textContent='Confirmar despacho';
      if(receipt){note.textContent='Reserva confirmada: '+receipt.id+(receipt.queue_state?' · Fila: '+({waiting:'Aguardando',offered:'Oferta enviada',assigned:'Motorista designado',fallback:'Encaminhada à gestão'}[receipt.queue_state]||receipt.queue_state):'');next.textContent='Novo despacho';next.disabled=false;next.onclick=()=>{attempt.reset();submitted=null;receipt=null;rejection=null;draft.reset();render();};}
      else {
        note.textContent=rejection||'Confira os dados antes de confirmar o despacho.';
        loadPhoneLibrary().then(phoneLibrary=>{
          if(!current())return;
          let payload;
          try{payload=submitted||buildDispatchPayload(draft.snapshot(),{phoneLibrary,gig:window.tsRouteServices.gig});}catch(e){note.textContent=e.message;return;}
          next.disabled=false;
          if(submitted){next.textContent='Repetir confirmação';note.textContent='Tentativa anterior sem resposta confirmada. Repita a mesma solicitação.';}
          next.onclick=async()=>{
            if(!current()||next.disabled)return;
            next.disabled=true;back.disabled=true;card.querySelectorAll('button').forEach(b=>b.disabled=true);
            submitted=payload;rejection=null;note.textContent='Confirmando reserva…';
            const activeAttempt=attempt;
            try{const response=await activeAttempt.submit(payload);if(attempt!==activeAttempt)return;receipt=response;if(current())render();}
            catch(e){if(attempt!==activeAttempt)return;if(isDispatchRejection(e)){submitted=null;rejection='Despacho recusado: '+e.message+'. Corrija os dados e confirme novamente.';if(current())render();}else if(current()){note.textContent='Confirmação não concluída: '+e.message+'. Repita a mesma solicitação.';next.textContent='Repetir confirmação';next.disabled=false;}}
          };
        }).catch(()=>{if(current())note.textContent='Validação de telefone indisponível.';});
      }
    }
    actions.append(back,next);root.append(card,actions);
  }
  return {
    setRoute(section){searchAbort?.abort();revision++;root.hidden=section!=='despacho'||!isOwner();if(!root.hidden)render();},
    reset(){searchAbort?.abort();revision++;draft.reset();attempt=createConfirmationAttempt({send:confirmDispatch});submitted=null;receipt=null;rejection=null;root.hidden=true;root.replaceChildren();},
    snapshot:()=>draft.snapshot()
  };
}
