const DRIVER_STATUSES = ['pending', 'approved', 'rejected', 'disabled'];

export function createAreaResolver({
  getUserId, invited, updateNavigation, checkAdmin, current, request, openDriver, checkClient, errorMessage
}) {
  let pending = null;

  return function resolveAccountArea() {
    const uid = getUserId();
    if (!uid || invited()) return Promise.resolve(null);
    if (pending?.uid === uid) return pending.promise;

    updateNavigation();
    const promise = (async () => {
      try {
        if (await checkAdmin()) return getUserId() === uid ? 'admin' : null;
        const session = await current();
        if (session?.user?.id !== uid) return null;

        const status = await request('/rest/v1/rpc/driver_access_status', {
          method: 'POST',
          headers: {Authorization: 'Bearer ' + session.access_token},
          body: '{}'
        }).catch(() => null);
        if (getUserId() !== uid) return null;
        if (DRIVER_STATUSES.includes(status) && await openDriver(status)) return 'driver';
        if (getUserId() !== uid) return null;
        return await checkClient() ? 'client' : null;
      } catch (error) {
        console.warn('Não foi possível verificar o perfil:', errorMessage(error));
        return null;
      } finally {
        if (pending?.promise === promise) pending = null;
      }
    })();
    pending = {uid, promise};
    return promise;
  };
}
