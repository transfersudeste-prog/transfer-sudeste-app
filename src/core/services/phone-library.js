let loading;

export function loadPhoneLibrary() {
  if (globalThis.libphonenumber) return Promise.resolve(globalThis.libphonenumber);
  if (!loading) {
    loading = import('../../../assets/vendor/libphonenumber.js').then(() => {
      if (!globalThis.libphonenumber) throw new Error('Validação de telefone indisponível.');
      return globalThis.libphonenumber;
    }).catch(error => {
      loading = undefined;
      throw error;
    });
  }
  return loading;
}
