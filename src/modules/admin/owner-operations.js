import {interfaceIcon} from '../../shared/components/interface-icons.js';
import {ownerPeriod} from './owner-period.js';

const money = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'});
const count = new Intl.NumberFormat('pt-BR');
const time = new Intl.DateTimeFormat('pt-BR', {timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'});
const date = value => value ? value.split('-').reverse().join('/') : 'Data indisponível';
const shortId = value => value?.slice(0, 8).toUpperCase();
const range = ({start, end}) => start === end ? date(start) : `${date(start)} a ${date(end)}`;

const sections = {
  financial: {
    gross: ['Faturamento bruto realizado', 'Valor dos serviços encerrados'],
    forecast: ['Faturamento previsto', 'Reservas futuras confirmadas'],
    revenue: ['Receita da empresa', 'Comissão por competência'],
    receivables: ['Valores pendentes de recebimento', 'Saldo em aberto dos clientes'],
    transfers: ['Valores pendentes de repasse', 'Da empresa para os motoristas']
  },
  current: {
    today: ['Reservas de hoje', 'Data operacional de São Paulo'],
    ongoing: ['Serviços em andamento', 'Atendimentos iniciados'],
    available: ['Motoristas disponíveis', 'Na fila, sem atendimento ou oferta ativa'],
    busy: ['Motoristas em atendimento', 'Com serviço em andamento'],
    unavailable: ['Motoristas indisponíveis', 'Conta inativa ou oferta em curso']
  },
  operational: {
    future: ['Reservas futuras', 'Confirmadas ou por confirmar'],
    pending: ['Reservas aguardando confirmação', 'Solicitações pendentes'],
    unassigned: ['Reservas aguardando designação', 'Confirmadas sem motorista nem oferta ativa'],
    acceptance: ['Reservas aguardando aceite', 'Com oferta ativa na fila'],
    completed: ['Serviços concluídos', 'Por data do embarque'],
    cancelled: ['Serviços cancelados', 'Por data do embarque']
  }
};
const drivers = ['available', 'busy', 'unavailable'];
const periods = {today: 'Hoje', week: 'Semana', month: 'Mês', custom: 'Personalizado'};
const heroKeys = ['gross', 'forecast'];
const quickKeys = ['today', 'unassigned', 'available', 'ongoing'];
const quickLabels = {
  today: ['Reservas de hoje', 'Serviços agendados'], unassigned: ['Sem motorista', 'Aguardando designação no período'],
  available: ['Disponíveis', 'Motoristas · agora'], ongoing: ['Em atendimento', 'Serviços ativos · agora']
};
export function isBookingId(id) {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function displayMetric(value, currency = false) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return 'Indisponível';
  return (currency ? money : count).format(value);
}

const contextualDestinations = {
  motoristas: 'admGeralMotoristas', financeiro: 'admGeralFinanceiro', reservas: 'admGeralReservas'
};

export function metricDestination(key) {
  if (Object.hasOwn(sections.financial, key)) return contextualDestinations.financeiro;
  if (drivers.includes(key)) return contextualDestinations.motoristas;
  if (Object.hasOwn(sections.current, key) || Object.hasOwn(sections.operational, key)) return contextualDestinations.reservas;
  return null;
}

const listNames = {alerts: 'Alertas operacionais', upcoming: 'Próximos embarques'};
const alerts = {
  no_driver: 'Embarque próximo sem motorista',
  driver_disabled: 'Motorista desativado em reserva futura',
  schedule_conflict: 'Conflito de horários',
  queue_failed: 'Falha na distribuição da fila',
  offer_unanswered: 'Oferta sem resposta do motorista',
  payment_pending: 'Reserva com pagamento pendente',
  commission_overdue: 'Comissão vencida',
  transfer_overdue: 'Repasse vencido',
  notification_failed: 'Falha de notificação'
};

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function icon(name) {
  const node = element('span', undefined, 'adm-ops-icon');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = interfaceIcon(name);
  return node;
}

function button(text, className) {
  const node = element('button', text, className);
  node.type = 'button';
  return node;
}

function detailButton(row, text) {
  const node = button(text, 'adm-geral-button adm-ops-detail-link');
  node.dataset.admBooking = row.id;
  node.append(icon('right'));
  node.setAttribute('aria-label', `Detalhes da reserva ${shortId(row.id)}`);
  return node;
}

function bookingCard(row, statusLabel, showAmount) {
  const card = element('article', undefined, 'adm-ops-item');
  const head = element('div', undefined, 'adm-ops-item-head');
  const state = row.status === 'confirmed' ? (row.driver ? 'Designada' : 'Sem motorista') : statusLabel(row.status);
  head.append(element('strong', `${row.category || 'Serviço'} · ${row.time || 'Sem horário'}`),
    element('span', state, 'adm-ops-tag'));
  const meta = element('p', `#${shortId(row.id)} · ${row.basisDate ? 'Competência ' + date(row.basisDate) : date(row.date)}`, 'adm-ops-booking-meta');
  const trip = element('p', `${row.origin || 'Origem indisponível'} → ${row.destination || 'Destino indisponível'}`, 'adm-ops-trip');
  const cost = showAmount ? row.amount : row.total;
  const footer = element('div', undefined, 'adm-ops-item-head');
  footer.append(element('span', row.driver || 'Aguardando designação', 'adm-ops-booking-meta'),
    element('strong', cost == null ? 'Valor indisponível' : money.format(cost), 'adm-ops-money'));
  card.append(head, meta, trip, footer, detailButton(row, 'Gerenciar reserva'));
  return card;
}

function alertCard(row) {
  const card = element('article', undefined, 'adm-ops-item adm-ops-alert');
  card.dataset.severity = row.severity;
  const content = row.id ? button(undefined, 'adm-ops-alert-action') : element('div', undefined, 'adm-ops-alert-action');
  if (row.id) content.dataset.admBooking = row.id;
  const head = element('div', undefined, 'adm-ops-item-head');
  head.append(element('strong', alerts[row.code] || 'Alerta operacional'),
    element('span', row.severity === 1 ? 'Crítico' : row.severity === 2 ? 'Atenção' : 'Pendência', 'adm-ops-tag'));
  const text = element('span', undefined, 'adm-ops-alert-text');
  text.append(head);
  const context = [row.id && '#' + shortId(row.id), row.date && date(row.date), row.time, row.driver].filter(Boolean);
  if (context.length) text.append(element('small', context.join(' · ')));
  content.append(icon(row.code?.includes('overdue') ? 'wallet' : 'bell'), text);
  if (row.id) content.append(icon('right'));
  card.append(content);
  return card;
}

export function installOwnerOperations({current, request, isOwner, startBookingDetail, statusLabel}) {
  const root = document.documentElement;
  const byId = id => document.getElementById(id);
  const overview = byId('admGeralOperations');
  const refreshButton = byId('admOpsRefresh');
  const periodButtons = overview.querySelectorAll('[data-adm-period]');
  const dates = byId('admOpsDates');
  const detailStatus = byId('admOpsDetailStatus');
  const captions = {financial: byId('admOpsFinancial'), current: byId('admOpsCurrent'), operational: byId('admOpsOperational')};
  const results = byId('admOpsResultsTemplate').content.firstElementChild.cloneNode(true);
  const resultTitle = results.querySelector('h2');
  const resultStatus = results.querySelector('[data-adm-results-status]');
  const resultList = results.querySelector('[data-adm-results-list]');
  const resultAction = key => results.querySelector(`[data-adm-results-action="${key}"]`);
  const metrics = new Map();
  const dayPeriod = () => ({p_period: 'today'});
  let period = dayPeriod();
  let appliedRange = null;
  let route = null;
  let drill = null;
  let snapshot = null;
  let loading = null;
  let detailRequest = null;
  let detailTimer = null;
  let updateTimer = null;

  for (const [group, items] of Object.entries(sections)) {
    for (const [key, [label, hint]] of Object.entries(items)) {
      const card = button(undefined, 'adm-geral-card adm-ops-kpi');
      card.dataset.admDrill = key;
      card.disabled = true;
      const value = element('strong', '—');
      const [visibleLabel, visibleHint] = quickLabels[key] || [label, hint];
      const text = element('small', visibleHint);
      const name = element('span', visibleLabel);
      card.append(name, value, text, icon('right'));
      metrics.set(key, {card, name, value, text, label, hint: visibleHint, financial: group === 'financial'});
      if (!heroKeys.includes(key) && !quickKeys.includes(key)) captions[group].append(card);
    }
  }

  for (const key of heroKeys) byId('admOpsHero').append(metrics.get(key).card);
  for (const key of quickKeys) byId('admOpsQuick').append(metrics.get(key).card);

  function dashboardStatus(text) { byId('admOpsStatus').textContent = text; }

  function failureText(error) {
    if (!navigator.onLine) return 'Sem conexão. Tente novamente ao voltar à internet.';
    if (/ts_owner_operations_dashboard|schema cache/i.test(error?.message || '')) {
      return 'A consulta da Central de operações ainda precisa ser instalada neste ambiente.';
    }
    if (/restrito ao ADM Geral|Sessão expirada/i.test(error?.message || '')) return 'Acesso restrito ao ADM Geral. Entre novamente.';
    return 'A Central de operações está indisponível. Tente novamente.';
  }

  function selectPeriodButtons() {
    for (const control of periodButtons) {
      control.setAttribute('aria-pressed', String(control.dataset.admPeriod === period.p_period));
    }
  }

  function showDateForm(show) {
    const trigger = overview.querySelector('[data-adm-period=custom]');
    trigger.setAttribute('aria-expanded', String(show));
    dates.hidden = !show;
  }

  function updateDateCaption() {
    byId('admOpsPeriodCaption').textContent = appliedRange ? `${range(appliedRange)} · horário de São Paulo` : '';
  }

  function renderMetrics(data) {
    for (const [key, tile] of metrics) {
      const metric = data?.metrics[key];
      if (key === 'gross') tile.name.textContent = `Faturamento bruto realizado · ${periods[period.p_period]}`;
      tile.value.textContent = metric ? displayMetric(metric.value, tile.financial) : '—';
      tile.value.toggleAttribute('data-unavailable', metric?.value === null);
      tile.card.disabled = !metric;
      const missing = tile.financial && metric?.missing;
      const partialDrivers = drivers.includes(key) && metric?.value === null && Number.isFinite(metric?.observed)
        ? ` · ${count.format(metric.observed)} identificados` : '';
      const suffix = missing ? ` · ${count.format(missing)} ${missing === 1 ? 'registro sem valor' : 'registros sem valor'}` : '';
      tile.text.textContent = tile.hint + suffix + partialDrivers;
    }
  }

  function renderList(container, rows, renderItem, empty) {
    container.replaceChildren(...(rows?.length ? rows.map(renderItem) :
      empty ? [element('p', empty, 'adm-ops-note')] : []));
  }

  function renderSnapshot(data) {
    renderMetrics(data);
    renderList(byId('admOpsAlerts'), data?.alerts, alertCard, data ? (data.coverage?.notificationFailures === false ? 'Nenhum alerta nas fontes disponíveis.' : 'Nenhum alerta identificado.') : '');
    renderList(byId('admOpsUpcoming'), data?.upcoming, row => bookingCard(row, statusLabel, false),
      data ? 'Nenhum embarque futuro.' : '');
    overview.querySelector('[data-adm-drill=alerts]').hidden = !(data?.alertCount > 5);
    overview.querySelector('[data-adm-drill=upcoming]').hidden = !(data?.upcomingCount > 0);
    const alertCount = byId('admOpsAlertCount');
    alertCount.hidden = !data;
    alertCount.textContent = data ? count.format(data.alertCount) : '';
    byId('admOpsAvailability').textContent = data?.coverage?.unknownDrivers
      ? `${count.format(data.coverage.unknownDrivers)} sem sinal de disponibilidade fora da fila.` : '';
    byId('admOpsAlertWindow').textContent = Number.isFinite(data?.coverage?.departureMinutes)
      ? ` Embarque próximo usa como referência os próximos ${count.format(data.coverage.departureMinutes)} minutos.` : '';
    byId('admOpsNotificationCoverage').textContent = data?.coverage?.notificationFailures === false
      ? ' O registro de falhas de notificação ainda está indisponível neste ambiente.' : '';
  }

  async function query(params, signal) {
    const session = await current();
    if (!session || !isOwner()) throw Error('Sessão expirada');
    return request('/rest/v1/rpc/ts_owner_operations_dashboard', {
      method: 'POST', body: JSON.stringify(params), signal,
      headers: {Authorization: 'Bearer ' + session.access_token}
    });
  }

  function stopLoading() {
    loading?.abort();
    loading = null;
    refreshButton.disabled = false;
    overview.removeAttribute('aria-busy');
  }

  async function loadSnapshot(quiet = false) {
    if (!isOwner() || route !== 'inicio' || drill || loading) return;
    const controller = new AbortController();
    loading = controller;
    refreshButton.disabled = true;
    if (!quiet || !snapshot) {
      overview.setAttribute('aria-busy', 'true');
      dashboardStatus('Carregando indicadores…');
    }
    try {
      const data = await query(period, controller.signal);
      if (loading !== controller || !isOwner()) return;
      if (!data?.metrics) throw Error('Resposta inválida');
      const displayKey = data => JSON.stringify([data?.metrics, data?.alerts, data?.upcoming, data?.coverage,
        data?.alertCount, data?.upcomingCount]);
      if (displayKey(snapshot) !== displayKey(data)) renderSnapshot(data);
      snapshot = data;
      appliedRange = {start: data.start, end: data.end};
      updateDateCaption();
      dashboardStatus('Atualizado às ' + time.format(new Date(data.asOf)));
    } catch (error) {
      if (loading === controller) dashboardStatus(failureText(error) + (snapshot ? ' Exibindo a última consulta.' : ''));
    } finally {
      if (loading === controller) stopLoading();
    }
  }

  function usePeriod(next) {
    stopLoading();
    period = next;
    appliedRange = null;
    snapshot = null;
    renderSnapshot(null);
    selectPeriodButtons();
    updateDateCaption();
    void loadSnapshot();
  }

  function removeResults() {
    delete root.dataset.admGeralResults;
    results.remove();
  }

  function mountResults() {
    const local = route === 'inicio';
    const slot = byId(local ? 'admOpsLocalResults' : route === 'financeiro' ? 'admOpsFinanceResults' : 'admOpsManagementResults');
    slot.append(results);
    root.dataset.admGeralResults = route;
    resultAction('clear').hidden = local;
  }

  async function loadResults(quiet = false) {
    if (!drill || drill.section !== route || (quiet && loading)) return;
    stopLoading();
    const controller = new AbortController();
    loading = controller;
    const selected = drill;
    if (!quiet) {
      resultAction('previous').disabled = true;
      resultAction('next').disabled = true;
      resultAction('retry').hidden = true;
      resultStatus.textContent = 'Carregando registros…';
      resultList.replaceChildren();
      selected.lastPage = null;
    }
    try {
      const data = await query({
        p_period: 'custom', p_start: selected.range.start, p_end: selected.range.end,
        p_indicator: selected.key, p_offset: selected.offset
      }, controller.signal);
      if (loading !== controller || !isOwner()) return;
      if (!Array.isArray(data?.items)) throw Error('Resposta inválida');
      const isDriver = drivers.includes(selected.key);
      const makeItem = isDriver ? row => element('p', row.name || 'Motorista', 'adm-ops-item') :
        selected.key === 'alerts' ? alertCard : row => bookingCard(row, statusLabel, metrics.get(selected.key)?.financial);
      const pageKey = JSON.stringify(data.items);
      if (selected.lastPage !== pageKey) renderList(resultList, data.items, makeItem, 'Nenhum registro corresponde ao filtro.');
      selected.lastPage = pageKey;
      resultAction('retry').hidden = true;
      const partial = data.unavailable ? 'Disponibilidade geral sem cobertura completa. Exibindo os registros identificados. ' : '';
      resultStatus.textContent = partial + (data.items.length
        ? `${count.format(selected.offset + 1)} a ${count.format(selected.offset + data.items.length)} de ${count.format(data.total)}`
        : data.total > 0 ? `${count.format(data.total)} registro(s). Volte à página anterior.` : '');
      selected.pageSize = data.pageSize;
      resultAction('previous').disabled = selected.offset === 0;
      resultAction('next').disabled = selected.offset + data.pageSize >= data.total;
    } catch (error) {
      if (loading === controller) {
        resultStatus.textContent = failureText(error) + (selected.lastPage ? ' Exibindo a última consulta.' : '');
        resultAction('retry').hidden = false;
      }
    } finally {
      if (loading === controller) stopLoading();
    }
  }

  function openResults(key) {
    if (!appliedRange || !isOwner()) return;
    const metric = metrics.get(key);
    const destination = metricDestination(key);
    if (!destination && !Object.hasOwn(listNames, key)) return;
    const section = Object.keys(contextualDestinations).find(item => contextualDestinations[item] === destination) || 'inicio';
    if (destination) window.tsNavigate(destination);
    if (route !== section) return;
    drill = {key, section, range: {...appliedRange}, offset: 0, pageSize: 0};
    resultTitle.textContent = listNames[key] || metric.label;
    results.querySelector('[data-adm-results-period]').textContent =
      ['available','busy','unavailable','ongoing','today','upcoming'].includes(key) ? 'Operação atual' : range(drill.range);
    mountResults();
    resultTitle.focus({preventScroll: true});
    window.scrollTo(0, 0);
    void loadResults();
  }

  function setRoute(next) {
    if (route === next) return;
    stopLoading();
    detailRequest?.abort();
    detailStatus.hidden = true;
    clearTimeout(detailTimer);
    route = next;
    removeResults();
    if (!route) return;
    if (drill?.section === route) {
      mountResults();
      void loadResults();
    } else {
      drill = null;
      if (route === 'inicio') void loadSnapshot(true);
    }
  }

  function closeResults(action) {
    drill = null;
    stopLoading();
    removeResults();
    if (action === 'clear') {
      document.querySelector('.view.active h1:not([hidden])')?.focus({preventScroll: true});
      return;
    }
    if (route !== 'inicio') window.tsNavigate('admGeralInicio');
    else {
      byId('admOpsTitle').focus({preventScroll: true});
      void loadSnapshot(true);
    }
  }

  async function openDetails(id) {
    detailRequest?.abort();
    const controller = new AbortController();
    detailRequest = controller;
    clearTimeout(detailTimer);
    detailStatus.hidden = false;
    detailStatus.textContent = 'Carregando detalhes da reserva…';
    try {
      await startBookingDetail(id, controller.signal);
      if (detailRequest === controller) detailStatus.hidden = true;
    } catch (error) {
      if (detailRequest === controller && !controller.signal.aborted) {
        detailStatus.textContent = navigator.onLine
          ? error.message === 'Reserva indisponível.' ? error.message : 'Não foi possível carregar a reserva. Tente novamente.'
          : 'Sem conexão. Tente novamente quando estiver online.';
        detailTimer = setTimeout(() => { detailStatus.hidden = true; }, 5000);
      }
    }
  }

  function refreshSoon() {
    if (document.hidden || !isOwner() || (route !== 'inicio' && (!drill || drill.section !== route))) return;
    clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      if (drill) void loadResults(true);
      else void loadSnapshot(true);
    }, 250);
  }

  for (const control of periodButtons) control.addEventListener('click', () => {
    if (control.dataset.admPeriod === 'custom') {
      if (dates.hidden && appliedRange && !dates.elements.start.value && !dates.elements.end.value) {
        dates.elements.start.value = appliedRange.start;
        dates.elements.end.value = appliedRange.end;
      }
      showDateForm(dates.hidden);
    } else {
      showDateForm(false);
      if (period.p_period !== control.dataset.admPeriod) usePeriod({p_period: control.dataset.admPeriod});
    }
  });
  dates.addEventListener('input', () => dates.elements.end.setCustomValidity(''));
  dates.addEventListener('submit', event => {
    event.preventDefault();
    const end = dates.elements.end;
    let custom;
    try {
      custom = ownerPeriod('custom', {start: dates.elements.start.value, end: end.value});
    } catch (error) {
      end.setCustomValidity(error.message);
      end.reportValidity();
      return;
    }
    showDateForm(false);
    usePeriod({p_period: 'custom', p_start: custom.start, p_end: custom.end});
    overview.querySelector('[data-adm-period=custom]').focus();
  });
  refreshButton.addEventListener('click', () => { void loadSnapshot(); });
  overview.addEventListener('click', event => {
    const control = event.target.closest('[data-adm-drill]');
    if (control) openResults(control.dataset.admDrill);
  });
  document.addEventListener('click', event => {
    const control = event.target.closest('[data-adm-booking]');
    if (control && isOwner() && isBookingId(control.dataset.admBooking)) void openDetails(control.dataset.admBooking);
  });
  results.addEventListener('click', event => {
    const action = event.target.closest('[data-adm-results-action]')?.dataset.admResultsAction;
    if (!action || !drill) return;
    if (action === 'back' || action === 'clear') return closeResults(action);
    if (action === 'previous' || action === 'next') {
      drill.offset = Math.max(0, drill.offset + (action === 'next' ? drill.pageSize : -drill.pageSize));
      resultTitle.focus({preventScroll: true});
      results.scrollIntoView({block: 'start'});
    }
    void loadResults();
  });
  document.addEventListener('visibilitychange', refreshSoon);
  window.addEventListener('online', refreshSoon);
  setInterval(refreshSoon, 30_000);
  return {
    setRoute,
    refreshSoon,
    reset() {
      setRoute(null);
      drill = null;
      snapshot = null;
      appliedRange = null;
      period = dayPeriod();
      resultList.replaceChildren();
      detailStatus.hidden = true;
      dashboardStatus('');
      renderSnapshot(null);
      dates.reset();
      showDateForm(false);
      selectPeriodButtons();
      updateDateCaption();
    }
  };
}
