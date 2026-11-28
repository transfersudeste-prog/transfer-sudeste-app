import {request} from '../../core/supabase/http.js';
import {interfaceIcon as icon} from './interface-icons.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const roleLabels = {
  owner: 'ADM Geral', admin: 'ADM Gestor', client: 'Cliente', driver: 'Motorista', account: 'Minha conta'
};

function photoSource(value) {
  if (typeof value !== 'string') return '';
  if (/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value)) return value;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

const editablePersonalRoles = ['owner', 'admin', 'client'];

function displayPhone(value) {
  const phone = String(value ?? '').trim();
  const national = phone.replace(/^\+55\s*/, '').replace(/[\s()-]/g, '');
  const match = /^(?:55(?=\d{10,11}$))?(\d{2})(\d{4,5})(\d{4})$/.exec(national);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : phone;
}

function displayDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function field(label, value, className='') {
  const display = value === '' || value == null ? 'Não informado' : value;
  return `<div class="account-field ${className}"><dt>${label}</dt><dd>${escapeHtml(display)}</dd></div>`;
}

function editButton(action, label) {
  return `<button type="button" class="account-edit" data-profile-action="${action}" aria-label="${label}">
    ${icon('edit')} Editar</button>`;
}

function profileSection(title, graphic, body, action='') {
  return `<section class="ts-profile-section">
    <div class="account-section-heading"><h2>${icon(graphic)}${title}</h2>${action}</div>
    ${body}
  </section>`;
}

function profileFold(title, graphic, body) {
  return `<details class="ts-profile-section account-fold" name="account-details">
    <summary><span class="account-fold-icon">${icon(graphic)}</span><strong>${title}</strong>${icon('down')}</summary>
    <div class="account-fold-body">${body}</div>
  </details>`;
}

function driverPerformance(completed, rating) {
  const count = Number(rating?.total_ratings ?? 0);
  const average = count > 0 ? Number(rating.average_rating) : NaN;
  const hasRating = count > 0 && Number.isFinite(average);
  const score = hasRating ? average.toLocaleString('pt-BR', {minimumFractionDigits:1, maximumFractionDigits:1}) : '—';
  const caption = rating == null ? 'Avaliação indisponível' : count === 1 ? '1 avaliação recebida' : `${count} avaliações recebidas`;
  const stars = Array.from({length:5}, (_, index) =>
    `<span${hasRating && index < Math.round(average) ? ' class="is-filled"' : ''}>${icon('star')}</span>`
  ).join('');
  return profileSection('Desempenho', 'route', `<div class="account-performance">
    <div>${icon('transfer')}<strong>${escapeHtml(completed ?? '—')}</strong><span>Atendimentos concluídos</span></div>
    <div><div class="account-stars" aria-hidden="true">${stars}</div>
      <strong>${score}${hasRating ? '<small> / 5</small>' : ''}</strong><span>${escapeHtml(caption)}</span></div>
  </div>`);
}

function driverDetails(driver) {
  const photo = photoSource(driver.vehicle_photo_url);
  const vehicle = [driver.vehicle_make, driver.vehicle_model].filter(Boolean).join(' ');
  const plate = String(driver.vehicle_plate || '').trim();
  return profileFold('Contato e endereço', 'contact', `<dl class="account-fields">
    ${field('WhatsApp', displayPhone(driver.whatsapp))}${field('Endereço residencial', driver.residential_address)}</dl>`) +
    profileFold('Dados do veículo', 'transfer', `<dl class="account-vehicle-grid">
      ${field('Marca',driver.vehicle_make)}${field('Modelo',driver.vehicle_model)}
      ${field('Cor',driver.vehicle_color)}${field('Placa',plate,'account-plate')}
      ${field('Ano de fabricação',driver.vehicle_year)}${field('Ano do modelo',driver.vehicle_model_year)}</dl>`) +
    profileFold('Foto do veículo', 'image', `<figure class="account-vehicle-figure">
      ${photo ? `<img class="account-vehicle-photo" src="${escapeHtml(photo)}" alt="Foto cadastrada do veículo" loading="lazy">` : ''}
      <div class="account-vehicle-placeholder${photo ? ' hidden' : ''}">
        <img src="./assets/images/conta-veiculo.svg" alt="" loading="lazy"><span>Imagem ilustrativa</span>
      </div>
      ${vehicle || plate ? `<figcaption>${vehicle ? `<span>${escapeHtml(vehicle)}</span>` : ''}
        ${plate ? `<span>Placa: ${escapeHtml(plate)}</span>` : ''}</figcaption>` : ''}
    </figure>`) +
    profileFold('Dados de pagamento', 'wallet', `<div class="account-payment">
      <dl class="account-fields">${field('Chave PIX',driver.pix_key)}</dl>${editButton('pix','Editar chave PIX')}
    </div>`);
}

function accountStatus(profile, driver) {
  if (profile.is_active === false || driver?.approval_status === 'disabled') return 'Inativa';
  if (driver?.approval_status === 'pending') return 'Aguardando aprovação';
  if (driver?.approval_status === 'rejected') return 'Cadastro não aprovado';
  return profile.is_active === true || driver?.approval_status === 'approved' ? 'Ativa' : 'Indisponível';
}

export function initAccountProfile(auth, client, signOut) {
  const root = document.getElementById('tsProfileRoot');
  const page = document.getElementById('conta');
  const signed = document.getElementById('authSigned');
  const password = document.getElementById('authReset');
  const accountButton = document.getElementById('accountButton');
  const dialog = document.createElement('dialog');
  dialog.className = 'account-dialog';
  dialog.setAttribute('aria-labelledby', 'tsProfileDialogTitle');
  document.body.append(dialog);
  const visible = () => page.classList.contains('active') && !signed.classList.contains('hidden');
  let model = null;
  let pending = null;
  let writing = false;
  let toastTimer;

  const currentIdentity = id => Boolean(id) && auth.session?.user?.id === id;

  function notice(message) {
    let status = document.getElementById('tsProfileToast');
    if (!status) {
      status = document.createElement('div');
      status.id = 'tsProfileToast';
      status.setAttribute('role', 'status');
      document.body.append(status);
    }
    status.textContent = message;
    status.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => status.classList.remove('show'), 2000);
  }

  async function call(id, path, options = {}) {
    const session = await auth.current();
    if (!session || session.user.id !== id) throw Error('Sessão expirada. Entre novamente.');
    return request(path, {
      ...options,
      headers: {Authorization: 'Bearer ' + session.access_token, ...options.headers}
    }, 'profile');
  }

  const rpc = (id, name, body = {}) => call(id, '/rest/v1/rpc/' + name, {
    method: 'POST', body: JSON.stringify(body), cache: 'no-store'
  });

  async function getRow(id, driver) {
    const table = driver ? 'driver_profiles' : 'profiles';
    const routine = driver ? 'ts_driver_profile_mine' : 'ts_profile_read_mine';
    const row = await rpc(id, routine).catch(() => null);
    if (row && typeof row === 'object' && !Array.isArray(row)) return row;
    const rows = await call(id, '/rest/v1/' + table + '?' + (driver ? 'user_id' : 'id') +
      '=eq.' + encodeURIComponent(id) + '&select=*', {cache: 'no-store'}).catch(() => []);
    return rows?.[0] || {};
  }

  function render() {
    if (!model || !currentIdentity(model.user.id)) return;
    const openFold = root.querySelector('.account-fold[open] summary')?.textContent;
    const {user, profile, driver, role, completed, rating, clientAccess} = model;
    const isDriver = role === 'driver';
    const canEditPersonal = editablePersonalRoles.includes(role);
    const metadata = user.user_metadata || {};
    const name = profile.full_name || driver.full_name || metadata.ts_profile_name || user.email?.split('@')[0] || 'Usuário';
    const phone = profile.phone || (isDriver ? driver.whatsapp : metadata.ts_profile_phone);
    const photo = photoSource(isDriver ? driver.profile_photo_url : metadata.ts_profile_photo);
    const title = roleLabels[role];
    const status = accountStatus(profile, isDriver ? driver : null);

    root.innerHTML = `<div class="ts-profile-head">
      <div class="ts-profile-avatar-wrap">
        <div class="ts-profile-avatar ts-profile-avatar-placeholder">${icon('user')}
          ${photo ? `<img src="${escapeHtml(photo)}" alt="Foto do perfil">` : ''}
        </div>
        ${canEditPersonal ? `<button type="button" class="ts-profile-photo-pencil" data-profile-action="photo"
          aria-label="Editar foto do perfil">${icon('city-tour')}</button>` : ''}
      </div>
      <div class="account-identity"><h1 class="ts-profile-name">${escapeHtml(name)}</h1>
        <div class="ts-profile-role">${isDriver ? 'Motorista parceiro' : title}</div>
      </div>
    </div>` +
      profileSection('Dados pessoais', 'user', `<dl class="account-fields">
        ${field('Nome completo',name)}${field('E-mail',user.email)}
        ${field('Telefone',displayPhone(phone))}${isDriver ? field('Nascimento',displayDate(driver.date_of_birth)) : ''}
      </dl>`, canEditPersonal ? editButton('personal', 'Editar dados pessoais') : '') +
      (isDriver ? driverPerformance(completed, rating) : '') +
      profileSection('Situação da conta', 'shield', `<dl class="account-status">
        ${field('Perfil',title)}<div class="account-field"><dt>Situação</dt>
          <dd><span class="account-badge${status === 'Ativa' ? ' is-active' : ''}">${status}</span></dd></div>
      </dl>`) +
      (isDriver ? driverDetails(driver) : '') +
      (clientAccess ? `<section class="ts-profile-section account-security">
        <button type="button" data-profile-action="password" aria-controls="authReset"
          aria-expanded="${!password.classList.contains('hidden')}"><span class="account-fold-icon">${icon('lock')}</span>
          <strong>Alterar senha</strong>${icon('right')}</button>
      </section>` : '');
    root.querySelector('.ts-profile-avatar img')?.addEventListener('error', event => event.currentTarget.remove());
    const vehiclePhoto = root.querySelector('.account-vehicle-photo');
    vehiclePhoto?.addEventListener('error', () => {
      vehiclePhoto.nextElementSibling.classList.remove('hidden');
      vehiclePhoto.remove();
    });
    if (openFold) {
      const fold = [...root.querySelectorAll('.account-fold')].find(item => item.querySelector('summary').textContent === openFold);
      if (fold) fold.open = true;
    }
  }

  function openDialog(title, description, content) {
    dialog.innerHTML = `<h2 id="tsProfileDialogTitle">${title}</h2><p>${description}</p>${content}`;
    dialog.setAttribute('aria-describedby', 'tsProfileDialogDescription');
    dialog.querySelector('p').id = 'tsProfileDialogDescription';
    dialog.querySelector('[data-account-cancel]').onclick = () => dialog.close();
    dialog.showModal();
  }

  function openEditor(action) {
    const {profile, driver, user, clientAccess} = model;
    const id = user.id;
    const personal = action === 'personal';
    const metadata = user.user_metadata || {};
    const name = profile.full_name || metadata.ts_profile_name || root.querySelector('.ts-profile-name').textContent;
    const phone = profile.phone || metadata.ts_profile_phone || '';
    const input = (key, label, value, type='text') => `<label for="tspe_${key}">${label}</label>
      <input id="tspe_${key}" name="${key}" type="${type}" value="${escapeHtml(value)}" maxlength="180" required>`;
    const fields = personal
      ? input('full_name','Nome completo',name) + (clientAccess ? '' : input('phone','Telefone',phone,'tel'))
      : input('pix_key','Chave PIX',driver.pix_key) + '<p class="account-dialog-note">A chave será salva no seu cadastro.</p>';
    openDialog(personal ? 'Dados pessoais' : 'Dados de pagamento',
      personal ? 'Atualize seu nome e telefone.' : 'Atualize a chave PIX utilizada para receber seus pagamentos.',
      `<form id="tsProfileEdit">${fields}<p class="field-error" role="alert"></p>
        <div class="account-dialog-actions">
          <button type="submit" class="primary">${personal ? 'Salvar alterações' : 'Salvar alteração'}</button>
          <button type="button" class="back" data-account-cancel>Cancelar</button>
        </div>
      </form>`);
    const form = dialog.querySelector('form');
    const errorBox = form.querySelector('[role=alert]');
    if (personal && clientAccess) form.insertBefore(client.phoneField('tspeClientPhone',phone),errorBox);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (writing || !currentIdentity(id)) return;
      const submit = form.querySelector('button[type=submit]');
      const cancel = form.querySelector('[data-account-cancel]');
      writing = true;
      submit.disabled = true;
      cancel.disabled = true;
      errorBox.textContent = '';
      try {
        const data = new FormData(form);
        if (personal) {
          const fullName = String(data.get('full_name') || '').trim();
          const number = clientAccess ? client.readPhone('tspeClientPhone') : String(data.get('phone') || '').trim();
          await rpc(id, 'ts_profile_update_personal', {p_full_name: fullName, p_phone: number});
          Object.assign(profile, {full_name: fullName, phone: number});
        } else {
          const key = String(data.get('pix_key') || '').trim();
          await rpc(id, 'ts_profile_update_pix', {p_pix_key: key});
          driver.pix_key = key;
        }
        if (!currentIdentity(id) || !visible()) return;
        dialog.close();
        if (model?.profile === profile) render();
        root.querySelector(`[data-profile-action="${action}"]`)?.focus();
        notice('Alterações salvas com sucesso.');
      } catch (error) {
        if (currentIdentity(id) && form.isConnected) errorBox.textContent = error.message;
      } finally {
        writing = false;
        submit.disabled = false;
        cancel.disabled = false;
      }
    });
  }

  async function uploadPhoto(file) {
    const id = model?.user.id;
    if (!file || !id || !currentIdentity(id) || writing || !editablePersonalRoles.includes(model.role)) return;
    if (!file.type.startsWith('image/')) return notice('Selecione uma imagem válida.');
    if (file.size > 8 * 1024 * 1024) return notice('Selecione uma imagem de até 8 MB.');
    writing = true;
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 240 / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      if (!currentIdentity(id)) return;
      const updated = await call(id, '/auth/v1/user', {
        method: 'PUT',
        body: JSON.stringify({data: {ts_profile_photo: canvas.toDataURL('image/jpeg',.72)}})
      });
      if (!currentIdentity(id)) return;
      auth.updateUser(updated);
      if (model?.user.id === id) {
        model.user = updated;
        render();
      }
      if (visible()) notice('Foto atualizada.');
    } catch {
      if (currentIdentity(id) && visible()) notice('Não foi possível atualizar a foto.');
    } finally {
      URL.revokeObjectURL(url);
      writing = false;
    }
  }

  async function readDriverStats(id) {
    const [trips, bookings, result] = await Promise.all([
      call(id, '/rest/v1/driver_trip_events?select=booking_id,finished_at&driver_id=eq.' + encodeURIComponent(id)).catch(() => null),
      rpc(id, 'ts_driver_bookings_mine').catch(() => null),
      rpc(id, 'ts_driver_rating_summary').catch(() => null)
    ]);
    const done = new Set((trips || []).filter(trip => trip.finished_at).map(trip => String(trip.booking_id)));
    const completed = bookings?.filter(booking => !booking.deleted_at && !booking.cancelled_at &&
      !['cancelled','canceled','rejected'].includes(booking.booking_status) &&
      (booking.booking_status === 'completed' || done.has(String(booking.id)))).length ?? null;
    return {completed, rating: Array.isArray(result) ? result[0] : result};
  }

  async function load() {
    const user = auth.session?.user;
    const id = user?.id;
    if (!id || !visible() || pending?.id === id || (model?.user.id === id && (writing || dialog.open))) return;
    const attempt = {id};
    pending = attempt;
    root.innerHTML = '<p class="client-panel client-empty" role="status">Carregando perfil…</p>';
    try {
      const [profile, driver, owner, admin, driverRole, clientAccess] = await Promise.all([
        getRow(id, false), getRow(id, true), rpc(id, 'is_owner').catch(() => false),
        rpc(id, 'is_admin').catch(() => false), rpc(id, 'is_exclusive_driver_account').catch(() => false),
        client.checkRole()
      ]);
      const role = owner === true ? 'owner' : admin === true ? 'admin' :
        driverRole === true || Object.keys(driver).length ? 'driver' : clientAccess ? 'client' : 'account';
      const stats = role === 'driver' ? await readDriverStats(id) : {};
      if (pending !== attempt || !currentIdentity(id) || !visible()) return;
      model = {user: auth.session.user, profile, driver, role, clientAccess: role === 'client' && clientAccess, ...stats};
      render();
    } catch {
      if (pending === attempt && currentIdentity(id) && visible()) {
        root.innerHTML = '<p class="client-panel client-empty" role="alert">Não foi possível carregar o perfil.</p>';
      }
    } finally {
      if (pending === attempt) pending = null;
    }
  }

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.hidden = true;
  file.addEventListener('change', () => {
    const selected = file.files?.[0];
    file.value = '';
    void uploadPhoto(selected);
  });
  document.body.append(file);

  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-profile-action]');
    if (!button || !model || !currentIdentity(model.user.id)) return;
    const action = button.dataset.profileAction;
    if (action === 'password' && model.clientAccess) {
      const open = password.classList.toggle('hidden') === false;
      button.setAttribute('aria-expanded', String(open));
      document.getElementById('ts315PasswordHint').textContent = 'Defina a nova senha da sua conta.';
      const input = document.getElementById('authNewPassword');
      input.value = '';
      if (open) input.focus();
      return;
    }
    if (writing || dialog.open) return;
    if (action === 'photo' && editablePersonalRoles.includes(model.role)) {
      file.click();
      return;
    }
    const allowed = action === 'personal' && editablePersonalRoles.includes(model.role) ||
      action === 'pix' && model.role === 'driver';
    if (!allowed) return;
    const id = model.user.id;
    try {
      if (action === 'personal' && model.clientAccess) await client.preparePhone();
      if (currentIdentity(id) && visible() && button.isConnected && !writing && !dialog.open) openEditor(action);
    } catch {
      if (currentIdentity(id)) notice('Não foi possível carregar a validação do telefone.');
    }
  });

  document.getElementById('signOut').onclick = () => {
    const id = auth.session?.user?.id;
    if (!currentIdentity(id) || !visible() || dialog.open) return;
    openDialog('Sair da conta?', 'Deseja encerrar sua sessão na Transfer Sudeste?',
      `<div class="account-dialog-actions">
        <button type="button" class="account-confirm-exit">Sim, sair da conta</button>
        <button type="button" class="back" data-account-cancel autofocus>Permanecer conectado</button>
      </div>`);
    dialog.querySelector('.account-confirm-exit').onclick = () => {
      dialog.close();
      if (currentIdentity(id)) void signOut();
    };
  };
  dialog.addEventListener('cancel', event => {
    if (writing && dialog.querySelector('form')) event.preventDefault();
  });

  const observer = new MutationObserver(() => {
    accountButton.setAttribute('aria-expanded', String(page.classList.contains('active')));
    if (visible()) {
      void load();
    } else {
      pending = null;
      model = null;
      if (dialog.open) dialog.close();
      root.replaceChildren();
    }
  });
  observer.observe(page, {attributes: true, attributeFilter: ['class']});
  observer.observe(signed, {attributes: true, attributeFilter: ['class']});
  new MutationObserver(() => {
    root.querySelector('[data-profile-action=password]')?.setAttribute(
      'aria-expanded', String(!password.classList.contains('hidden'))
    );
  }).observe(password, {attributes:true, attributeFilter:['class']});
  if (visible()) void load();
}
