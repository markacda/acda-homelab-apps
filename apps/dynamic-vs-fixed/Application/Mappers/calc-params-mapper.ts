import type { CalcParams } from '../../Domain/ValueObjects/tariff-params.ts';
import { ValidationError } from '../../Domain/Exceptions/validation-error.ts';

/** Parse the multipart `params` JSON string into CalcParams (the calculator coerces values). */
export function parseCalcParams(raw: unknown): CalcParams {
  try {
    return JSON.parse(typeof raw === 'string' && raw ? raw : '{}') as CalcParams;
  } catch {
    throw new ValidationError('Invalid params JSON.');
  }
}
