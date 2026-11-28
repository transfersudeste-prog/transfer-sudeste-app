const localDate = new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit'});

export function canTrackBooking(booking, {rulesReady, releaseMinutes, now = Date.now()}) {
 const status = booking.booking_status;
 if (booking.cancelled_at || booking.finished_at || !['pending','confirmed','approved','assigned','awaiting_pickup','awaiting_boarding','in_progress'].includes(status)) return false;
 if (booking.started_at || status === 'in_progress') return true;
 const date = String(booking.pickup_date || '').slice(0,10);
 const time = String(booking.pickup_time || '').slice(0,8);
 const pickup = Date.parse(`${date}T${time}-03:00`);
 const minutes = Number(releaseMinutes);
 return !!rulesReady && Number.isFinite(pickup) && Number.isFinite(minutes) && minutes >= 0 && date >= localDate.format(new Date(now)) && now >= pickup - minutes * 60000;
}
