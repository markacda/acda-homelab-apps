import multer from 'multer';

// Multer-backed file-upload factory. Kept separate from index.ts so apps that
// only need the pure helpers don't pull multer into their runtime graph.

/** Multer configured for in-memory storage with a size cap (in MB). */
export function memoryUpload(opts: { fileSizeMB: number }): multer.Multer {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: opts.fileSizeMB * 1024 * 1024 },
  });
}
