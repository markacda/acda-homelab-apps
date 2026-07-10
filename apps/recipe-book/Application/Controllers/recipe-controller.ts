import { Router } from 'express';
import { optStr } from '../../../Common/http-utils/index.ts';
import { memoryUpload } from '../../../Common/http-utils/upload.ts';
import { toRecipeContent, toRecipeEdits } from '../Mappers/recipe-mapper.ts';
import { RecipeService } from '../Services/recipe-service.ts';
import { RecipeImportService } from '../Services/recipe-import-service.ts';
import { ValidationError } from '../../Domain/Exceptions/validation-error.ts';

// HTTP surface for recipes: import, CRUD, and the image gallery. Handlers are
// thin — parse via the mapper, delegate to the services, and let thrown
// DomainErrors flow to the error-mapping filter. Express 5 forwards async
// rejections automatically, so no try/catch is needed here.
export class RecipeController {
  readonly router: Router;
  private recipes: RecipeService;
  private importer: RecipeImportService;

  constructor(recipes: RecipeService, importer: RecipeImportService) {
    this.recipes = recipes;
    this.importer = importer;
    const upload = memoryUpload({ fileSizeMB: 10 }); // recipe photos are small
    const router = Router();

    // Import from an Allerhande URL: fetch, parse the JSON-LD, download the image.
    router.post('/import', async (req, res) => {
      const url = optStr(req.body?.url);
      if (!url) throw new ValidationError('A recipe URL is required.');
      res.status(201).json(await this.importer.import(url));
    });

    // Create a recipe manually from a full field set.
    router.post('/', async (req, res) => {
      const recipe = await this.recipes.create(toRecipeContent(req.body ?? {}));
      res.status(201).json(recipe);
    });

    router.get('/', async (_req, res) => {
      res.json(await this.recipes.list());
    });

    router.get('/:id', async (req, res) => {
      res.json(await this.recipes.getOrThrow(req.params.id));
    });

    // Edit text fields and/or reorder-trim the gallery (images must exist).
    router.patch('/:id', async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      let images: string[] | undefined;
      if ('images' in body) {
        if (!Array.isArray(body.images) || body.images.some((x) => typeof x !== 'string')) {
          throw new ValidationError('images must be an array of filenames.');
        }
        images = body.images as string[];
      }
      res.json(await this.recipes.update(req.params.id, toRecipeEdits(body), images));
    });

    router.delete('/:id', async (req, res) => {
      await this.recipes.delete(req.params.id);
      res.status(204).end();
    });

    // Append an image to a recipe's gallery — an uploaded file or a URL to download.
    router.post('/:id/images', upload.single('image'), async (req, res) => {
      // The extra multer middleware defeats Express's path param inference, so
      // req.params.id widens to string | string[]; it is always a string here.
      const id = req.params.id as string;
      const recipe = await this.recipes.getOrThrow(id);
      if (req.file) {
        return res.json(await this.recipes.attachUpload(recipe, req.file.buffer, req.file.mimetype, req.file.originalname));
      }
      const imageUrl = optStr(req.body?.imageUrl);
      if (!imageUrl) throw new ValidationError('Provide an image file or an imageUrl.');
      return res.json(await this.recipes.attachFromUrl(recipe, imageUrl));
    });

    this.router = router;
  }
}
