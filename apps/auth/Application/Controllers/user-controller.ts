import { Router } from 'express';
import { UserAdminService } from '../Services/user-admin-service.ts';
import { ValidationError } from '../../Domain/Exceptions/validation-error.ts';
import { firstStr, optStr } from '../../../Common/http-utils/index.ts';

// Administrator-only user administration HTTP surface (issue #152), mounted under
// /api/users behind requireRole(Administrator) in register.ts. Handlers are thin:
// parse, delegate to UserAdminService, and return the (updated) PersonView. Thrown
// DomainErrors (ValidationError 400, NotFoundError 404) flow to the error-mapping
// filter; Express 5 forwards async rejections, so no try/catch is needed here.
export class UserController {
  readonly router: Router;
  private users: UserAdminService;

  constructor(users: UserAdminService) {
    this.users = users;
    const router = Router();

    router.get('/', async (req, res) => {
      res.json(await this.users.listUsers(firstStr(req.query.search)));
    });

    router.post('/:id/roles', async (req, res) => {
      const role = optStr((req.body as Record<string, unknown> | undefined)?.role);
      if (!role) throw new ValidationError('A role is required.');
      res.json(await this.users.addRole(req.params.id, role));
    });

    router.delete('/:id/roles/:role', async (req, res) => {
      res.json(await this.users.removeRole(req.params.id, req.params.role));
    });

    this.router = router;
  }
}
