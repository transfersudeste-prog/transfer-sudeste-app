
(function(){
function setup(){
 const configs=[
 ['ts295Edit','ts295Close','.ts295-panel'],
 ['v292Modal','v292Close','.v292-dialog'],
 ['v292Notice','v292NoticeClose','.dialog'],
 ['driverDetailModal','driverDetailClose','.driver-detail-dialog'],
 ['driverConfirmModal','driverConfirmCancel','.dialog'],
 ['tsDeleteModal','tsDeleteCancel','.ts-delete-dialog'],
 ['v294PhotoOverlay','v294PhotoClose','#v294PhotoOverlay']
 ];
 for(const [modalId,btnId,hostSelector] of configs){
  const modal=document.getElementById(modalId),btn=document.getElementById(btnId);
  if(!modal||!btn)continue;
  const host=(modal.matches(hostSelector)?modal:modal.querySelector(hostSelector))||modal.firstElementChild;
  if(!host)continue;
  host.classList.add('ts306-close-host');
  btn.classList.add('ts306-icon-close');
  btn.textContent='×';btn.setAttribute('aria-label','Fechar');btn.setAttribute('title','Fechar');
  host.appendChild(btn);
 }
 // Botões de cancelamento em caixas de confirmação não são fechamentos:
 // sua semântica permanece cancelar, mas o X funciona como dispensa.
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
