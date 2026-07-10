import { Router } from 'express';
import { optStr } from '../../../Common/http-utils/index.ts';
import { CategoryService } from '../Services/category-service.ts';
import type { UpdateCategoryRequest } from '../../Models/Requests/category-requests.ts';

// HTTP surface for the managed category list: plain CRUD. Thin handlers over the
// category service (rename cascades to recipes inside the service).
export class CategoryController {
  readonly router: Router;
  private categories: CategoryService;

  constructor(categories: CategoryService) {
    this.categories = categories;
    const router = Router();

    router.get('/', async (_req, res) => {
      res.json(await this.categories.list());
    });

    router.post('/', async (req, res) => {
      res.status(201).json(await this.categories.create(optStr(req.body?.name) ?? ''));
    });

    router.patch('/:id', async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: UpdateCategoryRequest = {};
      if ('name' in body) patch.name = optStr(body.name);
      res.json(await this.categories.update(req.params.id, patch));
    });

    router.delete('/:id', async (req, res) => {
      await this.categories.delete(req.params.id);
      res.status(204).end();
    });

    this.router = router;
  }
}
