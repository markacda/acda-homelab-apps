import { join } from 'node:path';

// JSON-file persistence on a Docker volume (no database). Layout under DATA_DIR:
//   recipes/<id>.json   images/<id>-<short>.<ext>   books/<id>.json
//   categories/<id>.json   output/<id>.{tex,pdf}
export const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
export const RECIPES_DIR = join(DATA_DIR, 'recipes');
export const IMAGES_DIR = join(DATA_DIR, 'images');
export const BOOKS_DIR = join(DATA_DIR, 'books');
export const CATEGORIES_DIR = join(DATA_DIR, 'categories');
export const OUTPUT_DIR = join(DATA_DIR, 'output');
