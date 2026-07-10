// Wire shapes accepted by the category endpoints.

/** Body of POST /api/categories. */
export interface CreateCategoryRequest {
  name: string
}

/** Body of PATCH /api/categories/:id (rename). */
export interface UpdateCategoryRequest {
  name?: string
}
