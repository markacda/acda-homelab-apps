// Wire shapes accepted by the book endpoints.

/** Body of POST /api/books. */
export interface CreateBookRequest {
  name: string
}

/** Body of PATCH /api/books/:id (rename and/or set the ordered recipe list). */
export interface UpdateBookRequest {
  name?: string
  recipeIds?: string[]
}

export type GenerateFormat = 'tex' | 'pdf'

/** Body of POST /api/books/:id/generate. */
export interface GenerateBookRequest {
  format?: GenerateFormat
}
