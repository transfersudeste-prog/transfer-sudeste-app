const SESSION_KEY = 'ts-supabase-session';
const REFRESH_MARGIN_SECONDS = 60;

export function readStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

export function createSessionStore({request, beforeIdentityChange, changed}) {
  let session = null;
  let refresh = null;

  function save() {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }

  function set(value) {
    const previous = session?.user?.id;
    const next = value?.user?.id;
    if (!next || previous !== next) beforeIdentityChange();
    session = value?.access_token ? value : null;
    save();
    changed(previous, next);
  }

  function updateUser(user) {
    if (!session?.user?.id || user?.id !== session.user.id) return;
    session = {...session, user};
    save();
  }

  async function current() {
    if (!session) return null;
    if (!session.expires_at || Date.now() / 1000 <= session.expires_at - REFRESH_MARGIN_SECONDS) return session;

    const original = session;
    if (refresh?.original !== original) {
      const promise = (async () => {
        try {
          const data = await request('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            body: JSON.stringify({refresh_token: original.refresh_token})
          });
          if (session === original) {
            set({...data, expires_at: Math.floor(Date.now() / 1000) + data.expires_in});
          }
        } catch {
          if (session === original) set(null);
        } finally {
          if (refresh?.original === original) refresh = null;
        }
        return session?.user?.id === original.user?.id ? session : null;
      })();
      refresh = {original, promise};
    }
    return refresh.promise;
  }

  return {
    get session() {
      return session;
    },
    set,
    current,
    updateUser
  };
}
