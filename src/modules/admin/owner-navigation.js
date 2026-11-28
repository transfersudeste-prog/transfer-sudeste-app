import {installOwnerViewport} from './owner-viewport.js';

const routes = {
  admGeralInicio: {view: 'administracao', section: 'inicio', tab: 'overview'},
  admGeralDespacho: {view: 'home', section: 'despacho'},
  admGeralReservas: {view: 'administracao', section: 'reservas', tab: 'reservations'},
  admGeralFinanceiro: {view: 'financeiro', section: 'financeiro'},
  admGeralMais: {view: 'admGeralMais', section: 'mais'},
  admGeralMotoristas: {view: 'administracao', section: 'motoristas', tab: 'drivers', parent: 'admGeralMais'},
  admGeralConfiguracoes: {view: 'administracao', section: 'configuracoes', tab: 'overview', parent: 'admGeralMais'},
  admGeralValores: {view: 'administracao', section: 'valores', tab: 'finance', parent: 'admGeralFinanceiro'}
};

const legacyRoutes = {home: 'admGeralDespacho', administracao: 'admGeralInicio', financeiro: 'admGeralFinanceiro'};
const tabRoutes = {
  overview: 'admGeralInicio', reservations: 'admGeralReservas', drivers: 'admGeralMotoristas', finance: 'admGeralValores'
};

export function installOwnerNavigation({isOwner, selectManagementTab, hasPendingAssignment, onRouteChange, onReset = ()=>{}, ownerDispatchSnapshot = ()=>null}) {
  const previousNavigate = window.tsNavigate;
  const root = document.documentElement;
  const navigation = document.getElementById('admGeralNav');
  const actions = document.getElementById('admGeralLeaveDialog');
  const leaveText = document.getElementById('admGeralLeaveText');
  const back = document.getElementById('admGeralBack');
  const dashboard = document.getElementById('administracao');
  const dispatch = document.getElementById('wizardCard');
  const settingsTitle = document.getElementById('admGeralSettingsTitle');
  const financeLinks = document.getElementById('admGeralFinanceLinks');
  installOwnerViewport(navigation);
  const routeButtons = navigation.querySelectorAll('[data-adm-geral-route]');
  let currentRoute = null;
  let dispatchBaseline = null;
  let pendingNavigation = null;

  function dispatchDraft() {
    return JSON.stringify([ownerDispatchSnapshot(), ...[...dispatch.querySelectorAll('input, textarea, select')].map(field =>
      field.type === 'radio' || field.type === 'checkbox' ? field.checked : field.value)]);
  }

  function updateSelection(routeId) {
    const route = routes[routeId];
    const selected = route?.parent || routeId;
    for (const button of routeButtons) {
      if (button.dataset.admGeralRoute === selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    back.hidden = !route?.parent;
  }

  function clearLayout() {
    delete root.dataset.admGeralLayout;
    delete dashboard.dataset.admGeralSection;
    settingsTitle.hidden = true;
    financeLinks.hidden = true;
    onRouteChange(null);
  }

  function reset() {
    const hadOwnerView = Boolean(root.dataset.admGeralLayout);
    if (currentRoute) selectManagementTab('overview');
    currentRoute = null;
    dispatchBaseline = null;
    pendingNavigation = null;
    if (actions.open) actions.close();
    clearLayout();
    onReset();
    if (hadOwnerView) window.tsBaseNavigate('conta');
    delete root.dataset.admGeralSession;
    navigation.hidden = true;
    updateSelection(null);
  }

  function show(routeId) {
    const route = routes[routeId];
    const currentView = document.querySelector('.view.active')?.id;
    const previousRoute = currentRoute;
    currentRoute = routeId;
    root.dataset.admGeralSession = '';
    root.dataset.admGeralLayout = route.section;
    navigation.hidden = false;
    settingsTitle.hidden = route.section !== 'configuracoes';
    financeLinks.hidden = route.section !== 'financeiro';
    if (route.tab) {
      dashboard.dataset.admGeralSection = route.section;
      selectManagementTab(route.tab);
    } else delete dashboard.dataset.admGeralSection;
    if (currentView !== route.view) previousNavigate(route.view);
    else if (previousRoute !== routeId) window.scrollTo(0, 0);
    updateSelection(routeId);
    onRouteChange(route.section);
    if (routeId === 'admGeralDespacho' && dispatchBaseline === null) dispatchBaseline = dispatchDraft();
    if (previousRoute !== routeId || currentView !== route.view) {
      const heading = route.section === 'inicio' ? document.getElementById('admOpsTitle') :
        route.section === 'configuracoes' ? settingsTitle :
        document.getElementById(route.view).querySelector('h1:not([hidden]), .wstep.active .step-title');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({preventScroll: true});
      }
    }
  }

  function navigate(id) {
    if (!isOwner()) {
      if (!navigation.hidden) reset();
      if (Object.hasOwn(routes, id)) return;
      return previousNavigate(id);
    }

    const from = document.querySelector('.view.active')?.id;
    const current = routes[currentRoute];
    const reuseCurrentRoute = current?.view === id && (from === 'conta' || from === id);
    const destination = reuseCurrentRoute ? currentRoute : (legacyRoutes[id] || id);
    const route = Object.hasOwn(routes, destination) ? routes[destination] : null;
    const proceed = () => {
      if (route) show(destination);
      else {
        clearLayout();
        previousNavigate(id);
      }
    };
    const leavingDispatchWithDraft = from === 'home' && route?.view !== 'home' &&
      dispatchBaseline !== null && dispatchDraft() !== dispatchBaseline;
    const leavingUnsavedAssignment = from === 'administracao' && current?.section === 'reservas' &&
      route?.section !== 'reservas' && hasPendingAssignment();
    const leavingUnsavedSettings = (current?.section === 'configuracoes' || current?.section === 'financeiro') &&
      root.hasAttribute('data-adm-geral-layout') && destination !== currentRoute &&
      [...document.getElementById(from).querySelectorAll('#v292Whatsapp, [data-f314-field]')]
        .some(field => field.value !== field.defaultValue);
    if (!leavingDispatchWithDraft && !leavingUnsavedAssignment && !leavingUnsavedSettings) return proceed();
    if (actions.open) return;
    leaveText.textContent = leavingDispatchWithDraft
      ? 'O despacho ainda não foi confirmado. Você poderá retomar o preenchimento nesta sessão.'
      : leavingUnsavedAssignment
        ? 'A designação selecionada ainda não foi salva. Ela poderá ser descartada ao sair.'
        : 'As configurações editadas ainda não foram salvas. As alterações poderão ser descartadas ao sair.';
    pendingNavigation = proceed;
    actions.showModal();
  }

  document.getElementById('admGeralLeaveCancel').addEventListener('click', () => actions.close());
  document.getElementById('admGeralLeaveConfirm').addEventListener('click', () => {
    const proceed = pendingNavigation;
    pendingNavigation = null;
    actions.close();
    if (isOwner()) proceed?.();
  });
  actions.addEventListener('close', () => {
    if (!actions.open) pendingNavigation = null;
  });
  back.addEventListener('click', () => {
    const parent = routes[currentRoute]?.parent;
    if (parent) navigate(parent);
  });
  for (const container of [navigation, document.getElementById('admGeralMais'), financeLinks]) {
    container.addEventListener('click', event => {
      const target = event.target.closest('[data-adm-geral-route]');
      if (target) navigate(target.dataset.admGeralRoute);
    });
  }
  window.tsNavigate = navigate;
  return {
    reset,
    markDispatchSaved() { if (isOwner()) dispatchBaseline = dispatchDraft(); },
    openManagementTab(tab) {
      if (!isOwner() || !Object.hasOwn(tabRoutes, tab)) return false;
      navigate(tabRoutes[tab]);
      return true;
    }
  };
}
