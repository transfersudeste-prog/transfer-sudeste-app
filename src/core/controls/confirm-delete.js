
(function(){
const el=id=>document.getElementById(id);
const pw=el('authPassword'),toggle=el('tsTogglePassword');
if(toggle&&pw)toggle.addEventListener('click',()=>{const visible=pw.type==='password';pw.type=visible?'text':'password';toggle.textContent=visible?'Ocultar':'Mostrar';toggle.setAttribute('aria-pressed',String(visible));toggle.setAttribute('aria-label',visible?'Ocultar senha':'Mostrar senha')});
let deleteId=null;
const modal=el('tsDeleteModal');
el('adminBookings')?.addEventListener('click',event=>{const btn=event.target.closest('.ts-delete-booking');if(!btn)return;deleteId=btn.dataset.booking;el('tsDeleteInfo').textContent='Reserva #'+deleteId.slice(0,8).toUpperCase();el('tsDeleteFeedback').textContent='';modal.classList.remove('hidden')});
const close=()=>{modal.classList.add('hidden');deleteId=null};
el('tsDeleteCancel').onclick=close;
modal.addEventListener('click',e=>{if(e.target===modal)close()});
el('tsDeleteConfirm').onclick=async()=>{if(!deleteId)return;const button=el('tsDeleteConfirm');button.disabled=true;el('tsDeleteFeedback').textContent='Excluindo reserva…';try{await window.tsDeleteBooking(deleteId);close();el('adminRefresh').click()}catch(e){el('tsDeleteFeedback').textContent=e.message}finally{button.disabled=false}};
})();
