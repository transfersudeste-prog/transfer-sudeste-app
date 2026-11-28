export const SOURCES=Object.freeze(['Aplicativo','WhatsApp','Telefone','Atendimento direto','Site','Instagram','Empresa conveniada','Parceiro','Outro']);
export function validParty(p,lib){
 const validContact=c=>{try{const n=lib.parsePhoneNumberFromString(c.phone,{defaultCountry:c.country,extract:false});return !!c.name?.trim()&&!!n?.isValid()&&n.country===c.country&&(!c.email||/^\S+@\S+\.\S+$/.test(c.email));}catch{return false;}};
 return ['external','registered'].includes(p.mode)&&(p.mode!=='registered'||!!p.clientId)&&SOURCES.includes(p.source)&&validContact(p.contractor)&&(p.samePassenger===true||(p.samePassenger===false&&validContact(p.passenger)));
}
export function clientSearchPath(query){
 const q=String(query).trim();if(q.length<2||q.length>100)throw Error('Informe de 2 a 100 caracteres.');
 // Escape LIKE metacharacters and avoid PostgREST logical filter syntax.
 const params=new URLSearchParams({select:'id,full_name,phone',is_active:'eq.true',full_name:'ilike.*'+q.replace(/[\\%_*]/g,'\\$&')+'*',order:'full_name.asc',limit:'30'});
 return '/rest/v1/profiles?'+params;
}
