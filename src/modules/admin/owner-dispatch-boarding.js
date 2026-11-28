// Sem exceções locais: regras administrativas devem ser autorizadas no servidor.
export function validateBoarding(fields, maxPassengers, maxLuggage) {
  return Number.isSafeInteger(maxPassengers) && maxPassengers >= 1 &&
    Number.isSafeInteger(maxLuggage) && maxLuggage >= 0 &&
    Number.isSafeInteger(fields.passengers) && fields.passengers >= 1 && fields.passengers <= maxPassengers &&
    Number.isSafeInteger(fields.luggage) && fields.luggage >= 0 && fields.luggage <= maxLuggage;
}
