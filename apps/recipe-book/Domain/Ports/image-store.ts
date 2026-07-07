// Persistence port for recipe images. The gallery on the Recipe aggregate holds
// filenames; this port owns the bytes behind them. Implemented in the Adapters
// layer (FileImageStore writes under the data volume).
export interface ImageStore {
  /**
   * Persist an uploaded image buffer under a unique filename derived from the
   * recipe id; returns the stored filename. Throws a DomainError (415) if the
   * content type / name is not a LaTeX-embeddable raster format (JPG/PNG).
   */
  saveUpload(
    recipeId: string,
    buffer: Buffer,
    contentType: string | null,
    originalName: string,
  ): Promise<string>;
  /**
   * Download a remote image and store it; returns the stored filename, or null
   * if the URL is unreachable or the format is unsupported (webp/svg/etc.).
   */
  downloadFromUrl(recipeId: string, url: string): Promise<string | null>;
  /** Remove a stored image file (tolerant of a missing file). */
  delete(filename: string): Promise<void>;
}
