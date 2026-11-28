// Rascunho local, sem persistência ou efeitos financeiros. A autorização e a
// confirmação de reservas serão responsabilidade do servidor.
export const DISPATCH_STEPS = Object.freeze(['Serviço','Trajeto','Embarque','Identificação do cliente','Valores','Pagamento','Designação','Revisão e confirmação']);
export function createDispatchDraft() {
  let step = 0, editing = false;
  const data = Array.from({length: 7}, () => ({}));
  const snapshot = () => ({step, editing, data: structuredClone(data)});
  return {
    snapshot,
    save(fields) {
      if (step === 7) throw new Error('Edite a etapa correspondente.');
      data[step] = {...data[step], ...structuredClone(fields)};
      return snapshot();
    },
    next(validate) {
      if (step === 7) return snapshot();
      if (typeof validate !== 'function' || !validate(step, structuredClone(data[step]))) return snapshot();
      step = editing ? 7 : step + 1;
      editing = false;
      return snapshot();
    },
    back() { if (editing) { step = 7; editing = false; } else step = Math.max(0, step - 1); return snapshot(); },
    edit(index) {
      if (step !== 7 || !Number.isInteger(index) || index < 0 || index > 6) throw new Error('Etapa de edição inválida.');
      step = index; editing = true; return snapshot();
    },
    reset() { step = 0; editing = false; data.forEach((_, i) => {data[i] = {};}); return snapshot(); }
  };
}
