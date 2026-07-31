import { join } from 'node:path';

// On-disk file storage on the Docker volume for the artifacts that stay out of
// the database: downloaded recipe images and the generated LaTeX/PDF output.
// (Structured recipe/book/category data lives in Postgres.) Layout under DATA_DIR:
//   images/<id>-<short>.<ext>   output/<id>.{tex,pdf}
export const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
export const IMAGES_DIR = join(DATA_DIR, 'images');
export const OUTPUT_DIR = join(DATA_DIR, 'output');
