import express from "express";
import type { Express } from "express";
import { JsonRecipeRepository } from "../../Adapters/JsonFileStore/json-recipe-repository.ts";
import { JsonBookRepository } from "../../Adapters/JsonFileStore/json-book-repository.ts";
import { FileImageStore } from "../../Adapters/JsonFileStore/file-image-store.ts";
import { IMAGES_DIR } from "../../Adapters/JsonFileStore/paths.ts";
import { AllerhandeRecipeSource } from "../../Adapters/Allerhande/allerhande-recipe-source.ts";
import { TectonicPdfRenderer } from "../../Adapters/Tectonic/tectonic-pdf-renderer.ts";
import { RecipeService } from "../Services/recipe-service.ts";
import { BookService } from "../Services/book-service.ts";
import { RecipeImportService } from "../Services/recipe-import-service.ts";
import { BookGenerationService } from "../Services/book-generation-service.ts";
import { RecipeController } from "../Controllers/recipe-controller.ts";
import { BookController } from "../Controllers/book-controller.ts";
import { errorMapping } from "../Filters/error-mapping.ts";

/**
 * Composition root: build the adapters, inject them into the application
 * services, wire the controllers, and mount everything on the Express app. This
 * is the manual stand-in for a DI container's registrations. Call it after
 * createApp() and before startServer() (which adds /healthz, static and the
 * shared error handlers last).
 */
export function register(app: Express): void {
  // Adapters (infrastructure implementations of the domain/ports interfaces).
  const recipeRepository = new JsonRecipeRepository();
  const bookRepository = new JsonBookRepository();
  const imageStore = new FileImageStore();
  const recipeSource = new AllerhandeRecipeSource();
  const documentGenerator = new TectonicPdfRenderer();

  // Application services.
  const recipeService = new RecipeService(recipeRepository, imageStore);
  const bookService = new BookService(bookRepository, recipeRepository);
  const importService = new RecipeImportService(recipeSource, recipeService);
  const generationService = new BookGenerationService(bookService, documentGenerator);

  // Controllers.
  const recipeController = new RecipeController(recipeService, importService);
  const bookController = new BookController(bookService, generationService);

  app.use(express.json({ limit: "1mb" }));
  app.use("/api/recipes", recipeController.router);
  app.use("/api/books", bookController.router);
  // Serve downloaded recipe images from the data volume at /images/<file>.
  // (Web/public is served by startServer.)
  app.use("/images", express.static(IMAGES_DIR));
  // Map domain errors to HTTP; unknown errors fall through to server-kit's handler.
  app.use(errorMapping());
}
