// Erros explícitos de validação do PostgreSQL permitem corrigir o rascunho.
export function isDispatchRejection(error) {
  return error?.status === 400 && error?.code === "P0001" && error.message !== "Chave já utilizada com outros dados";
}
export function createConfirmationAttempt({send, newId = () => crypto.randomUUID()}) {
  let attempt = null, pending = null, result = null;
  return {
    submit(payload) {
      const serialized = JSON.stringify(payload);
      if (attempt && attempt.serialized !== serialized) throw Error('Resolva a tentativa anterior antes de alterar o despacho.');
      if (pending) return pending;
      if (result) return Promise.resolve(structuredClone(result));
      if (!attempt) attempt = {id: newId(), serialized};
      const request = {p_request_id: attempt.id, p_dispatch: JSON.parse(attempt.serialized)};
      pending = Promise.resolve().then(() => send(request)).then(response => {
        if (!response || typeof response.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(response.id)) throw Error('Confirmação não comprovada. Repita a mesma tentativa.');
        result = structuredClone(response);
        return structuredClone(result);
      }).catch(error => {
        if (isDispatchRejection(error)) attempt = null;
        throw error;
      }).finally(() => {pending = null;});
      return pending;
    },
    reset() {
      if (attempt && !result) throw Error('Tentativa sem confirmação: não descarte a chave.');
      attempt = null; result = null;
    }
  };
}
