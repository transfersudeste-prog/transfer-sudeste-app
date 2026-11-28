import {interfaceIcon as icon} from '../../shared/components/interface-icons.js';

const periodNames = ['Hoje', 'Semana', 'Mês'];
const dayInMs = 86400000;
const longDate = new Intl.DateTimeFormat('pt-BR', {dateStyle:'long', timeZone:'UTC'});
const shortDate = new Intl.DateTimeFormat('pt-BR', {day:'numeric', month:'long', timeZone:'UTC'});
const monthName = new Intl.DateTimeFormat('pt-BR', {month:'long', year:'numeric', timeZone:'UTC'});
const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const dateKey = date => date.toISOString().slice(0,10);
const sum = (records, field) => records.reduce((total, record) => total + Number(record[field] || 0), 0);

function earningsRange(period, today) {
  const base = new Date(today + 'T12:00:00Z');
  const start = new Date(base);
  if (period === 'Semana') start.setUTCDate(base.getUTCDate() - (base.getUTCDay()+6)%7);
  if (period === 'Mês') start.setUTCDate(1);
  const end = period === 'Semana' ? new Date(start.valueOf()+6*dayInMs) : base;
  let label = longDate.format(base);
  if (period === 'Semana') {
    label = start.getUTCMonth() === end.getUTCMonth()
      ? start.getUTCDate() + ' a ' + shortDate.format(end)
      : shortDate.format(start) + ' a ' + shortDate.format(end);
  }
  if (period === 'Mês') label = monthName.format(base);
  return {start, end, label};
}

function dailyEarnings({start, end, entries, today, money, esc}) {
  const totals = new Map();
  for (const entry of entries) totals.set(entry.service_date, (totals.get(entry.service_date)||0)+Number(entry.driver_net_amount||0));
  const maximum = Math.max(1, ...totals.values());
  const lines = [];
  for (let date = start.valueOf(); date <= end.valueOf(); date += dayInMs) {
    const day = new Date(date);
    const key = dateKey(day);
    const future = key > today;
    const net = totals.get(key) || 0;
    const percentage = Math.min(100, Math.max(0, Math.round(net / maximum * 100)));
    lines.push(`<div class="driver-chart-row${future?' is-future':''}">
      <span>${weekdayLabels[day.getUTCDay()]}</span>
      <div class="driver-chart-track" aria-hidden="true"><span style="width:${percentage}%"></span></div>
      <strong>${future?'—':esc(money(net))}</strong>
    </div>`);
  }
  return `<section class="driver-daily-chart">
    <div class="driver-list-label"><strong>Ganhos diários</strong><span>Valor líquido</span></div>${lines.join('')}
  </section>`;
}

function section(key, heading, graphic, html, expanded, group='') {
  return `<details class="driver-list-card driver-fold" data-driver-fold="${key}"${group?` name="${group}"`:''}${expanded.has(key)?' open':''}>
    <summary><span class="driver-square-icon">${icon(graphic)}</span><strong>${heading}</strong>${icon('down')}</summary>
    <div class="driver-fold-body">${html}</div></details>`;
}

export function renderDriverEarnings({period, today, entries, settings, expanded, money, esc, row, transfers}) {
  const {start, end, label} = earningsRange(period,today);
  const startKey = dateKey(start);
  const current = entries.filter(entry => entry.service_date >= startKey && entry.service_date <= today);
  const open = entries.filter(entry => entry.transfer_status !== 'confirmed');
  const incoming = open.filter(entry => entry.transfer_direction === 'company_to_driver');
  const outgoing = open.filter(entry => entry.transfer_direction === 'driver_to_company');
  const rate = settings?.commission_percentage;
  const formattedRate = rate==null?'': ' ('+Number(rate).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%)';
  const tabs = periodNames.map(name => `<button type="button" data-f314="period" data-ids="${name}" aria-pressed="${period===name}">${name}</button>`).join('');
  const pending = row('A receber',money(sum(incoming,'transfer_amount')))+row('A repassar',money(sum(outgoing,'transfer_amount')))+
    (outgoing.length ? '<div class="driver-transfer-records">'+transfers(outgoing,false)+'</div>' : '');
  const confirmations = row('Valor pendente de recebimento',money(sum(incoming,'transfer_amount')))+
    row('Valor pendente para repasse',money(sum(outgoing,'transfer_amount')))+
    '<button type="button" class="primary" data-f314="choose">Confirmar</button>';
  return `<div class="driver-tabs" role="group" aria-label="Período dos ganhos">${tabs}</div>
    <div class="driver-tab-panel driver-earnings-panel">
     <section class="driver-list-card driver-earnings-summary">
      <div class="driver-list-label"><strong>Ganhos</strong><span>${esc(label)}</span></div>
      <strong class="driver-net-total">${esc(money(sum(current,'driver_net_amount')))}</strong>
      <p>Ganhos líquidos</p>
      <div class="driver-earnings-totals">${row('Bruto',money(sum(current,'gross_amount')))}
       ${row('Taxa da empresa'+formattedRate,money(sum(current,'commission_amount')))}</div>
      ${period==='Semana'?dailyEarnings({start,end,entries:current,today,money,esc}):''}
     </section>
     ${section('earnings-pending','Pendências','clock',pending,expanded)}
     ${section('earnings-confirmation','Confirmações','check',confirmations,expanded)}
    </div>`;
}

const standards = [
  ['personal','Apresentação pessoal','shirt',[
    'Utilizar vestimenta social ou executiva, limpa, discreta e em bom estado.',
    'Manter higiene pessoal adequada e aparência profissional.',
    'Evitar perfumes intensos, acessórios excessivos e vestimentas esportivas.'
  ]],
  ['vehicle','Apresentação do veículo','transfer',[
    'Manter o veículo limpo interna e externamente, organizado e livre de odores desagradáveis.',
    'Verificar combustível, pneus, climatização e condições de segurança antes do atendimento.',
    'Manter o porta-malas disponível para as bagagens dos passageiros.'
  ]],
  ['punctuality','Pontualidade e preparação','clock',[
    'Planejar o deslocamento até o embarque considerando possíveis imprevistos.',
    'Conferir os dados da reserva e chegar preferencialmente com 15 minutos de antecedência.',
    'Informar imediatamente à empresa qualquer possibilidade de atraso.'
  ]],
  ['passenger','Atendimento ao passageiro','user',[
    'Recepcionar o passageiro com cordialidade e tratamento profissional.',
    'Auxiliar no embarque, desembarque e acomodação das bagagens, respeitando as preferências do cliente.',
    'Confirmar o destino e as paradas previstas antes de iniciar o trajeto.',
    'Manter climatização e ambiente sonoro de acordo com a preferência do passageiro.'
  ]],
  ['safety','Conduta e segurança','shield',[
    'Praticar direção defensiva e respeitar integralmente a legislação de trânsito.',
    'Não manusear o celular durante a condução.',
    'Preservar a privacidade dos passageiros e a confidencialidade das informações da reserva.',
    'Evitar conversas inconvenientes, discussões e abordagens comerciais particulares.'
  ]],
  ['operations','Diretrizes operacionais','book',[
    'Conferir todas as informações antes de aceitar uma oferta.',
    'Assumir o compromisso de realizar os atendimentos confirmados.',
    'Manter as etapas do atendimento atualizadas no aplicativo.',
    'Não alterar valores, itinerários ou condições comerciais sem a devida autorização.'
  ]],
  ['support','Imprevistos e suporte','warning',[
    'Comunicar imediatamente à empresa atrasos, panes, acidentes e dificuldades de localização.',
    'Solicitar orientação ao suporte em situações de ausência do passageiro ou necessidade de cancelamento.',
    'Priorizar a segurança dos ocupantes e acionar os serviços de emergência quando necessário.'
  ]]
];

export function renderDriverCompany({settings, esc, expanded, row, banking, validWeb}) {
  if (!settings) return '<p class="soft-note">Configurações indisponíveis.</p>';
  const phone = String(settings.whatsapp_number||'').replace(/\D/g,'');
  const whatsapp = phone ? 'https://wa.me/'+phone : '';
  const formatted = phone.length===13 ? `+${phone.slice(0,2)} (${phone.slice(2,4)}) ${phone.slice(4,9)}-${phone.slice(9)}` : phone;
  const instagram = validWeb(settings.instagram_url);
  const handle = instagram ? new URL(instagram).pathname.split('/').filter(Boolean)[0] : '';
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email||'') ? settings.email : '';
  const channel = (graphic,title,text,url,isInstagram=false) => `<div class="driver-company-channel">
    <span class="driver-square-icon">${icon(graphic)}</span>
    <div><span>${title}</span>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`:'<strong>Não informado</strong>'}</div>
    ${isInstagram&&url?`<button type="button" class="driver-square-icon" data-f314="instagramqr" aria-label="Exibir QR Code do Instagram">${icon('qr')}</button>`:
      url? `<a class="driver-channel-external" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${title}">${icon('external')}</a>`:''}
  </div>`;
  const conditions = row('Taxa da empresa',settings.commission_percentage==null?'Não informada':
    Number(settings.commission_percentage).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%') +
    row('Prazo para repasse',settings.driver_payment_deadline_days==null?'Não informado':settings.driver_payment_deadline_days+' dias corridos') +
    row('Aviso de vencimento',settings.driver_payment_warning_days==null?'Não informado':settings.driver_payment_warning_days+' dias antes');
  const supportLink = whatsapp ? `<a class="driver-support-link" href="${esc(whatsapp)}" target="_blank" rel="noopener noreferrer">
    ${icon('whatsapp')} Contatar suporte</a>` : '';
  const guidance = '<p class="driver-company-intro">Diretrizes e orientações para a excelência dos serviços prestados pelos motoristas parceiros da Transfer Sudeste.</p>'+
    standards.map(([key,heading,graphic,items])=>{
      const list = `<ul class="driver-standard-list" role="list">
        ${items.map(item=>`<li>${icon('check')}<span>${esc(item)}</span></li>`).join('')}
      </ul>`;
      return section('standard-'+key,heading,graphic,list+(key==='support'?supportLink:''),expanded,'driver-standards');
    }).join('');
  return `<section class="driver-list-card driver-company-contacts">
    <h2>Contato</h2>
    ${channel('whatsapp','WhatsApp',formatted,whatsapp)}
    ${channel('mail','E-mail',email,email?'mailto:'+email:'')}
    ${channel('instagram','Instagram',handle?'@'+handle:'Instagram',instagram,true)}
    ${channel('globe','Site',settings.website_url,validWeb(settings.website_url))}
   </section>
   ${section('company-banking','Dados bancários','bank',banking,expanded)}
   ${section('company-finance','Condições financeiras','percent',conditions,expanded)}
   ${section('company-standards','Padrões de atendimento','book',guidance,expanded)}`;
}
