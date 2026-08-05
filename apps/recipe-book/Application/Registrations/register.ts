import { join } from 'node:path';
import express from 'express';
import type { Express } from 'express';
import type { Pool } from 'pg';
import { createPool, runMigrations } from '../../../Common/db/index.ts';
import { PostgresRecipeRepository } from '../../Adapters/Postgres/postgres-recipe-repository.ts';
import { PostgresBookRepository } from '../../Adapters/Postgres/postgres-book-repository.ts';
import { PostgresCategoryRepository } from '../../Adapters/Postgres/postgres-category-repository.ts';
import { FileImageStore } from '../../Adapters/FileStore/file-image-store.ts';
import { IMAGES_DIR } from '../../Adapters/FileStore/paths.ts';
import { WebRecipeSource } from '../../Adapters/RecipeSource/web-recipe-source.ts';
import { TectonicPdfRenderer } from '../../Adapters/Tectonic/tectonic-pdf-renderer.ts';
import { RecipeService } from '../Services/recipe-service.ts';
import { BookService } from '../Services/book-service.ts';
import { CategoryService } from '../Services/category-service.ts';
import { RecipeImportService } from '../Services/recipe-import-service.ts';
import { BookGenerationService } from '../Services/book-generation-service.ts';
import { RecipeController } from '../Controllers/recipe-controller.ts';
import { BookController } from '../Controllers/book-controller.ts';
import { CategoryController } from '../Controllers/category-controller.ts';
import { errorMapping } from '../Filters/error-mapping.ts';
import { createRecipeBookGuards } from './auth-guards.ts';

/**
 * Composition root: connect the shared Postgres pool, run migrations, then
 * build the adapters, inject them into the application services, wire the
 * controllers, and mount everything on the Express app. Structured
 * recipe/book/category data lives in Postgres; image bytes and generated PDFs
 * still live on the data volume (FileImageStore + /images static). Returns the
 * pool so the server can close it on shutdown and ping it for /healthz. Call it
 * after createApp() and before startServer().
 */
export async function register(app: Express): Promise<Pool> {
  const pool = await createPool('recipe-book');
  await runMigrations(pool, {
    schema: 'recipe_book',
    dir: join(import.meta.dirname, '../../Adapters/Postgres/migrations'),
  });

  // Adapters (infrastructure implementations of the domain/ports interfaces).
  const recipeRepository = new PostgresRecipeRepository(pool);
  const bookRepository = new PostgresBookRepository(pool);
  const categoryRepository = new PostgresCategoryRepository(pool);
  const imageStore = new FileImageStore();
  const recipeSource = new WebRecipeSource();
  const documentGenerator = new TectonicPdfRenderer();

  const recipeService = new RecipeService(recipeRepository, imageStore);
  const bookService = new BookService(bookRepository, recipeRepository);
  const categoryService = new CategoryService(categoryRepository);
  const importService = new RecipeImportService(recipeSource, recipeService);
  const generationService = new BookGenerationService(bookService, documentGenerator);

  const recipeController = new RecipeController(recipeService, importService);
  const bookController = new BookController(bookService, generationService);
  const categoryController = new CategoryController(categoryService);

  app.use(express.json({ limit: '1mb' }));

  // User-role gate (issue #154): /api and the /images sub-resources answer JSON
  // 401/403; the served SPA shell (mounted next by startServer) bounces logged-out
  // browsers to the auth login. /healthz stays public (both guards skip it).
  const { requireApiUser, requireUserPage } = createRecipeBookGuards();
  app.use('/api', requireApiUser);
  app.use('/images', requireApiUser);

  app.use('/api/recipes', recipeController.router);
  app.use('/api/books', bookController.router);
  app.use('/api/categories', categoryController.router);
  // Serve downloaded recipe images from the data volume at /images/<file>.
  // (Web/public is served by startServer.)
  app.use('/images', express.static(IMAGES_DIR));
  // Map domain errors to HTTP; unknown errors fall through to server-kit's handler.
  app.use(errorMapping());

  // Gate the static SPA shell (served next by startServer) behind the same role.
  app.use(requireUserPage);

  return pool;
}
