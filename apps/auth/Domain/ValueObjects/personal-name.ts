import { ValidationError } from '../Exceptions/validation-error.ts';
import { cleanText, codePointLength } from './text.ts';

/** Maximum length of a first or last name (issue #187). */
export const MAX_NAME_LENGTH = 100;

/**
 * The one rule every part of a person's name obeys: cleaned, required and length-capped.
 * Subclasses only supply the field label used in the error message, so `FirstName` and
 * `LastName` stay distinct types that can never be swapped for one another.
 */
export abstract class PersonalName {
  readonly value: string;

  protected constructor(value: unknown, field: string) {
    const cleaned = cleanText(value);
    if (!cleaned) throw new ValidationError(`A ${field.toLowerCase()} is required.`);
    if (codePointLength(cleaned) > MAX_NAME_LENGTH) {
      throw new ValidationError(`${field} must be at most ${MAX_NAME_LENGTH} characters.`);
    }
    this.value = cleaned;
  }

  toString(): string {
    return this.value;
  }
}
