import { ValidationError } from '../Exceptions/validation-error.ts';
import { cleanText, codePointLength } from './text.ts';

/** Practical maximum for an address, per RFC 5321's 254-character path limit. */
export const MAX_EMAIL_LENGTH = 254;

/**
 * A person's email address, which doubles as their username. Cleaned, capped, lowercased
 * and shaped like `local@domain` (exactly one `@`, both sides non-empty, no whitespace) —
 * this is the app's single email rule.
 */
export class EmailAddress {
  readonly value: string;

  constructor(value: unknown) {
    const email = EmailAddress.normalize(value);
    if (!email) throw new ValidationError('An email address is required.');
    if (codePointLength(email) > MAX_EMAIL_LENGTH) {
      throw new ValidationError(`Email address must be at most ${MAX_EMAIL_LENGTH} characters.`);
    }
    const [local, domain, ...rest] = email.split('@');
    if (rest.length > 0 || !local || !domain || /\s/.test(email)) {
      throw new ValidationError('A valid email address is required.');
    }
    this.value = email;
  }

  /**
   * Clean and lowercase without enforcing the shape. Login needs this: a malformed address
   * must fail as "invalid email or password" (401) rather than leak a 400 that distinguishes
   * it from a wrong password. Sharing the normalization with the constructor is what makes a
   * lookup by this value match what registration stored.
   */
  static normalize(value: unknown): string {
    return cleanText(value).toLowerCase();
  }

  toString(): string {
    return this.value;
  }
}
