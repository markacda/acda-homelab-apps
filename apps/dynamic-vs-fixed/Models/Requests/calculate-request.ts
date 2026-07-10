import type { CalcParams } from '../../Domain/ValueObjects/tariff-params.ts';

// POST /api/calculate is a multipart/form-data request with:
//   - `csv`:    the HomeWizard CSV export file
//   - `params`: a JSON string of the tariff/tax inputs (this shape)
export type CalculateParams = CalcParams;
