import { PersonalName } from './personal-name.ts';

/** A person's first name — valid by construction. */
export class FirstName extends PersonalName {
  constructor(value: unknown) {
    super(value, 'First name');
  }
}
