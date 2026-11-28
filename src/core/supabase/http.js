// Browser configuration. Database grants and RLS control access for this public key.
export const SUPABASE_URL = 'https://qmmjzqrihzzwzemobzzj.supabase.co';
export const SUPABASE_PUBLIC_KEY = 'sb_publishable_h-YY9D1ZVGf5-M6-NcvgVA_Wolr-D_5';

export async function request(path, options = {}, responseMode = 'app') {
  const response = await fetch(SUPABASE_URL + path, {
    ...options,
    headers: {
      apikey: SUPABASE_PUBLIC_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.text();
  const isProfile = responseMode === 'profile';
  let data;
  try {
    data = body ? JSON.parse(body) : isProfile ? null : {};
  } catch {
    data = isProfile ? body : {message: body};
  }
  if (!response.ok) {
    const message = isProfile
      ? data?.message || data?.error || data?.msg || 'Falha ao salvar.'
      : data?.msg || data?.error_description || data?.message || data?.error || ('Erro HTTP ' + response.status);
    throw Object.assign(new Error(message), {status: response.status, code: data?.code});
  }
  return data;
}
