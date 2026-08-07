import { PersonalName } from './personal-name.ts';

/** A person's last name — valid by construction. */
export class LastName extends PersonalName {
  constructor(value: unknown) {
    super(value, 'Last name');
  }
}
