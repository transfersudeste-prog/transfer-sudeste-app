
export function initManagementTabs(routeTab) {
  const heading = document.querySelector('#administracao .ts-dash-head h1');
  const sections = document.querySelectorAll('[data-admin-section]');
  const tabs = document.querySelectorAll('[data-admin-tab]');
  const titles = {overview:'Visão geral',reservations:'Reservas',drivers:'Motoristas',finance:'Financeiro'};

  function select(tab) {
    for (const section of sections) section.classList.toggle('hidden', section.dataset.adminSection !== tab);
    for (const button of tabs) {
      const active = button.dataset.adminTab === tab;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
    heading.textContent = titles[tab];
    if (tab === 'finance') {
      const summary = document.getElementById('adminFinanceSummary');
      const cards = [...document.querySelectorAll('#adminKpis .ts-kpi')]
        .filter(card => /valor|recebid|pagament|financeir|saldo/i.test(card.textContent));
      summary.replaceChildren(...cards.map(card => card.cloneNode(true)));
      if (!cards.length) {
        const notice = document.createElement('p');
        notice.className = 'soft-note';
        notice.textContent = 'Os indicadores financeiros estarão disponíveis após carregar as reservas.';
        summary.append(notice);
      }
    }
  }

  for (const button of document.querySelectorAll('[data-admin-tab],[data-admin-jump]')) {
    button.addEventListener('click', () => {
      const tab = button.dataset.adminTab || button.dataset.adminJump;
      if (!routeTab(tab)) select(tab);
    });
  }
  select('overview');
  return select;
}
