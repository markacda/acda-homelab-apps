import { Router } from 'express';
import { optStr } from '../../../Common/http-utils/index.ts';
import { BookService } from '../Services/book-service.ts';
import { BookGenerationService } from '../Services/book-generation-service.ts';
import { ValidationError } from '../../Domain/Exceptions/validation-error.ts';
import type { UpdateBookRequest } from '../../Models/Requests/book-requests.ts';

const CONTENT_TYPE: Record<string, string> = {
  tex: 'application/x-tex',
  pdf: 'application/pdf',
};

// HTTP surface for books: CRUD, resolving recipes, generating and downloading
// the .tex/.pdf output. Thin handlers over the book + generation services.
export class BookController {
  readonly router: Router;
  private books: BookService;
  private generation: BookGenerationService;

  constructor(books: BookService, generation: BookGenerationService) {
    this.books = books;
    this.generation = generation;
    const router = Router();

    router.get('/', async (_req, res) => {
      res.json(await this.books.list());
    });

    router.post('/', async (req, res) => {
      res.status(201).json(await this.books.createBook(optStr(req.body?.name) ?? ''));
    });

    router.get('/:id', async (req, res) => {
      const book = await this.books.getOrThrow(req.params.id);
      const recipes = await this.books.resolveRecipes(book);
      res.json({ ...book.toJSON(), recipes });
    });

    // Rename and/or set the ordered recipe list (used for reorder / add / remove).
    router.patch('/:id', async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: UpdateBookRequest = {};
      if ('name' in body) patch.name = optStr(body.name);
      if ('recipeIds' in body) {
        if (!Array.isArray(body.recipeIds) || body.recipeIds.some((x) => typeof x !== 'string')) {
          throw new ValidationError('recipeIds must be an array of strings.');
        }
        patch.recipeIds = body.recipeIds as string[];
      }
      res.json(await this.books.update(req.params.id, patch));
    });

    router.delete('/:id', async (req, res) => {
      await this.books.delete(req.params.id);
      res.status(204).end();
    });

    // Generate the book output (.tex or .pdf) and return a download link.
    router.post('/:id/generate', async (req, res) => {
      const format = req.body?.format === 'pdf' ? 'pdf' : 'tex';
      const result = await this.generation.generate(req.params.id, format);
      res.json({
        format: result.format,
        url: `/api/books/${req.params.id}/download/${result.format}`,
        recipeCount: result.recipeCount,
      });
    });

    router.get('/:id/download/:format', async (req, res) => {
      const format = req.params.format;
      if (format !== 'tex' && format !== 'pdf') throw new ValidationError('Unknown format.');
      const book = await this.books.getOrThrow(req.params.id);
      const path = this.generation.outputPath(book, format);
      const safeName = book.name.replace(/[^\w.-]+/g, '_') || 'recipe-book';
      res.type(CONTENT_TYPE[format]);
      res.download(path, `${safeName}.${format}`, (err) => {
        if (err && !res.headersSent) {
          res.status(404).json({ error: 'Output not found — generate it first.' });
        }
      });
    });

    this.router = router;
  }
}
