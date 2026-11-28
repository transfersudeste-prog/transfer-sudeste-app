// Intenção local de pagamento: não representa confirmação financeira.
export const PAYMENT_METHODS=Object.freeze([['undefined','Indefinido'],['cash','Dinheiro'],['pix','PIX'],['debit_card','Cartão de débito'],['credit_card','Cartão de crédito']]);
export const PAYMENT_STATES=Object.freeze([['pending','Pendente'],['received_company','Recebido pela empresa'],['received_driver','Recebido pelo motorista']]);
export const PAYMENT_RECIPIENTS=Object.freeze([['undefined','A definir'],['company','Empresa'],['driver','Motorista']]);
export function validPayment(p){
 if(!p||!PAYMENT_METHODS.some(([v])=>v===p.method)||!PAYMENT_STATES.some(([v])=>v===p.status)||!PAYMENT_RECIPIENTS.some(([v])=>v===p.recipient))return false;
 if(p.status==='pending')return true;
 return p.method!=='undefined'&&p.recipient===(p.status==='received_company'?'company':'driver');
}
