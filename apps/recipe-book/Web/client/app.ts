// Vanilla-TS UI for the recipe book. Talks to the /api/recipes and /api/books
// endpoints. Mirrors the server-side Recipe/Book shapes (kept in sync by hand).

interface Recipe {
  id: string;
  sourceUrl: string | null;
  title: string;
  imageUrl: string | null;
  images: string[];
  ingredients: string[];
  steps: string[];
  servings?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  notes: string[];
  category?: string;
  createdAt: string;
  updatedAt: string;
}

interface Book {
  id: string;
  name: string;
  recipeIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface BookDetail extends Book {
  recipes: Recipe[];
}

interface Category {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

// ---- tiny helpers ---------------------------------------------------------

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function setStatus(el: HTMLElement, msg: string, kind: '' | 'error' | 'ok' | 'info' = ''): void {
  el.textContent = msg;
  el.className = `status ${kind}`.trim();
}

/** JSON API call that throws the server's { error } message on failure. */
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status}).`);
  return data as T;
}

/** URL for one stored image filename. */
function fileSrc(file: string): string {
  return `/images/${file}`;
}

/** Title image (images[0]) of a recipe, or null. */
function imgSrc(recipe: Recipe): string | null {
  return recipe.images.length ? fileSrc(recipe.images[0]) : null;
}

// ---- state ----------------------------------------------------------------

let recipes: Recipe[] = [];
let books: Book[] = [];
let activeBookId: string | null = null;
let activeBook: BookDetail | null = null;
let categories: Category[] = [];
let activeCategoryId: string | null = null;
let editingId: string | null = null; // null => creating a new recipe
let editingImages: string[] = []; // gallery of the recipe currently in the editor

// ---- library --------------------------------------------------------------

async function loadRecipes(): Promise<void> {
  recipes = await api<Recipe[]>('/api/recipes');
  renderLibrary();
}

function renderLibrary(): void {
  $('libCount').textContent = recipes.length ? `(${recipes.length})` : '';
  const grid = $('library');
  if (!recipes.length) {
    grid.innerHTML = `<p class="meta">No recipes yet. Import one or add it manually.</p>`;
    return;
  }
  grid.innerHTML = recipes
    .map((r) => {
      const src = imgSrc(r);
      const img = src ? `<img src="${esc(src)}" alt="${esc(r.title)}" />` : `<div class="no-img">🍽️</div>`;
      return `<div class="recipe-card" data-id="${r.id}">
        ${img}
        <div class="body">
          <div class="name">${esc(r.title)}</div>
          ${r.category ? `<div class="cat">${esc(r.category)}</div>` : ''}
          <div class="actions">
            <button class="icon" data-act="add" title="Add to current book">＋ Book</button>
            <button class="icon" data-act="edit">Edit</button>
            <button class="icon" data-act="delete" title="Delete recipe">🗑</button>
          </div>
        </div>
      </div>`;
    })
    .join('');
}

// ---- books ----------------------------------------------------------------

async function loadBooks(): Promise<void> {
  books = await api<Book[]>('/api/books');
  if (activeBookId && !books.some((b) => b.id === activeBookId)) activeBookId = null;
  if (!activeBookId && books.length) activeBookId = books[0].id;
  renderBookSelect();
  await refreshActiveBook();
}

function renderBookSelect(): void {
  const sel = $<HTMLSelectElement>('bookSelect');
  sel.innerHTML = books.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  if (activeBookId) sel.value = activeBookId;
  const has = books.length > 0;
  $('renameBookBtn').toggleAttribute('disabled', !has);
  $('deleteBookBtn').toggleAttribute('disabled', !has);
}

async function refreshActiveBook(): Promise<void> {
  if (!activeBookId) {
    activeBook = null;
    $('bookView').classList.add('hidden');
    $('noBook').classList.remove('hidden');
    return;
  }
  activeBook = await api<BookDetail>(`/api/books/${activeBookId}`);
  $('noBook').classList.add('hidden');
  $('bookView').classList.remove('hidden');
  renderBookView();
}

function renderBookView(): void {
  if (!activeBook) return;
  $('bookTitle').textContent = activeBook.name;
  const list = $('bookPages');
  if (!activeBook.recipes.length) {
    list.innerHTML = `<li class="meta">Empty — add recipes from the library with “＋ Book”.</li>`;
  } else {
    list.innerHTML = activeBook.recipes
      .map(
        (r, i) => `<li data-id="${r.id}">
          <span class="num">${i + 1}.</span>
          <span class="page-name">${esc(r.title)}</span>
          ${r.category ? `<span class="page-cat">${esc(r.category)}</span>` : ''}
          <span class="page-actions">
            <button class="icon" data-act="up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="icon" data-act="down" ${i === activeBook!.recipes.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="icon" data-act="remove">✕</button>
          </span>
        </li>`
      )
      .join('');
  }
  // A freshly-edited book invalidates any previous download.
  $('downloadLink').classList.add('hidden');
  setStatus($('genStatus'), '');
}

async function saveBookOrder(recipeIds: string[]): Promise<void> {
  if (!activeBookId) return;
  await api(`/api/books/${activeBookId}`, {
    method: 'PATCH',
    body: JSON.stringify({ recipeIds }),
  });
  await refreshActiveBook();
}

// ---- categories -----------------------------------------------------------

async function loadCategories(): Promise<void> {
  categories = await api<Category[]>('/api/categories');
  if (activeCategoryId && !categories.some((c) => c.id === activeCategoryId)) activeCategoryId = null;
  if (!activeCategoryId && categories.length) activeCategoryId = categories[0].id;
  renderCategorySelect();
}

function renderCategorySelect(): void {
  const sel = $<HTMLSelectElement>('categorySelect');
  sel.innerHTML = categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if (activeCategoryId) sel.value = activeCategoryId;
  const has = categories.length > 0;
  $('renameCategoryBtn').toggleAttribute('disabled', !has);
  $('deleteCategoryBtn').toggleAttribute('disabled', !has);
}

function activeCategory(): Category | null {
  return categories.find((c) => c.id === activeCategoryId) ?? null;
}

async function newCategory(): Promise<void> {
  const name = prompt('Name for the new category:');
  if (!name?.trim()) return;
  const category = await api<Category>('/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name: name.trim() }),
  });
  activeCategoryId = category.id;
  await loadCategories();
}

async function renameCategory(): Promise<void> {
  const category = activeCategory();
  if (!category) return;
  const name = prompt('New name:', category.name);
  if (!name?.trim()) return;
  await api(`/api/categories/${category.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: name.trim() }),
  });
  await loadCategories();
  // The rename cascades to recipes on the server, so refresh what shows the name.
  await loadRecipes();
  await refreshActiveBook();
}

async function deleteCategory(): Promise<void> {
  const category = activeCategory();
  if (!category) return;
  if (!confirm(`Delete category “${category.name}”? Recipes keep their current category text.`)) return;
  await api(`/api/categories/${category.id}`, { method: 'DELETE' });
  activeCategoryId = null;
  await loadCategories();
}

// ---- recipe editor --------------------------------------------------------

/** Fill the editor's category <select> with the managed list, keeping `selected` choosable. */
function renderEditorCategoryOptions(selected: string): void {
  const sel = $<HTMLSelectElement>('edCategory');
  const names = categories.map((c) => c.name);
  // An existing/imported category may not be in the managed list yet; keep it
  // as an option so it still displays and is preserved on save.
  const extra = selected && !names.includes(selected) ? [selected] : [];
  sel.innerHTML = ['<option value="">— none —</option>']
    .concat([...extra, ...names].map((n) => `<option value="${esc(n)}">${esc(n)}</option>`))
    .join('');
  sel.value = selected;
}

function openEditor(recipe: Recipe | null): void {
  editingId = recipe?.id ?? null;
  editingImages = recipe ? [...recipe.images] : [];
  $('editorTitle').textContent = recipe ? 'Edit recipe' : 'New recipe';
  $<HTMLInputElement>('edTitle').value = recipe?.title ?? '';
  renderEditorCategoryOptions(recipe?.category ?? '');
  $<HTMLInputElement>('edServings').value = recipe?.servings ?? '';
  $<HTMLInputElement>('edPrepTime').value = recipe?.prepTime ?? '';
  $<HTMLInputElement>('edCookTime').value = recipe?.cookTime ?? '';
  $<HTMLInputElement>('edTotalTime').value = recipe?.totalTime ?? '';
  $<HTMLTextAreaElement>('edIngredients').value = (recipe?.ingredients ?? []).join('\n');
  $<HTMLTextAreaElement>('edSteps').value = (recipe?.steps ?? []).join('\n');
  $<HTMLTextAreaElement>('edNotes').value = (recipe?.notes ?? []).join('\n');
  $<HTMLInputElement>('edImageUrl').value = '';
  $<HTMLInputElement>('edImageFile').value = '';
  setStatus($('edImageStatus'), '');

  // Image management needs an id (upload/gallery ops hit /recipes/:id). For a new
  // recipe the URL field is the create-time title image; upload is hidden until saved.
  const existing = recipe !== null;
  $('edUploadRow').classList.toggle('hidden', !existing);
  $('edImageHint').classList.toggle('hidden', existing);
  $<HTMLInputElement>('edImageUrl').placeholder = existing ? 'Add image URL…' : 'Title image URL…';
  renderGallery();
  $('editorOverlay').classList.remove('hidden');
}

function renderGallery(): void {
  const gallery = $('edGallery');
  gallery.innerHTML = editingImages
    .map((file, i) => {
      const isTitle = i === 0;
      return `<div class="gitem ${isTitle ? 'title-img' : ''}" data-file="${esc(file)}">
        <img src="${esc(fileSrc(file))}" alt="" />
        ${isTitle ? `<div class="tag">Title</div>` : ''}
        <div class="gactions">
          <button data-act="up" ${i === 0 ? 'disabled' : ''} title="Move earlier">↑</button>
          <button data-act="down" ${i === editingImages.length - 1 ? 'disabled' : ''} title="Move later">↓</button>
          <button data-act="remove" title="Remove">✕</button>
        </div>
      </div>`;
    })
    .join('');
}

function closeEditor(): void {
  $('editorOverlay').classList.add('hidden');
  editingId = null;
  editingImages = [];
}

function collectEditorFields() {
  return {
    title: $<HTMLInputElement>('edTitle').value.trim(),
    category: $<HTMLSelectElement>('edCategory').value,
    servings: $<HTMLInputElement>('edServings').value.trim(),
    prepTime: $<HTMLInputElement>('edPrepTime').value.trim(),
    cookTime: $<HTMLInputElement>('edCookTime').value.trim(),
    totalTime: $<HTMLInputElement>('edTotalTime').value.trim(),
    ingredients: $<HTMLTextAreaElement>('edIngredients').value,
    steps: $<HTMLTextAreaElement>('edSteps').value,
    notes: $<HTMLTextAreaElement>('edNotes').value,
  };
}

async function saveEditor(): Promise<void> {
  const fields = collectEditorFields();
  if (!fields.title) {
    setStatus($('edImageStatus'), 'A title is required.', 'error');
    return;
  }
  try {
    if (editingId) {
      await api(`/api/recipes/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(fields),
      });
    } else {
      const imageUrl = $<HTMLInputElement>('edImageUrl').value.trim();
      await api('/api/recipes', {
        method: 'POST',
        body: JSON.stringify({ ...fields, imageUrl }),
      });
    }
    closeEditor();
    await loadRecipes();
    await refreshActiveBook(); // titles/categories shown in the book may have changed
  } catch (err) {
    setStatus($('edImageStatus'), err instanceof Error ? err.message : 'Save failed.', 'error');
  }
}

/** Apply an image mutation's result to the editor + library without closing. */
function afterImageUpdate(updated: Recipe): void {
  editingImages = [...updated.images];
  renderGallery();
  void loadRecipes();
}

async function addImageFromUrl(): Promise<void> {
  if (!editingId) return;
  const imageUrl = $<HTMLInputElement>('edImageUrl').value.trim();
  if (!imageUrl) return;
  setStatus($('edImageStatus'), 'Downloading image…', 'info');
  try {
    const updated = await api<Recipe>(`/api/recipes/${editingId}/images`, {
      method: 'POST',
      body: JSON.stringify({ imageUrl }),
    });
    $<HTMLInputElement>('edImageUrl').value = '';
    afterImageUpdate(updated);
    setStatus($('edImageStatus'), 'Image added.', 'ok');
  } catch (err) {
    setStatus($('edImageStatus'), err instanceof Error ? err.message : 'Failed.', 'error');
  }
}

async function uploadImage(): Promise<void> {
  if (!editingId) return;
  const file = $<HTMLInputElement>('edImageFile').files?.[0];
  if (!file) {
    setStatus($('edImageStatus'), 'Choose a JPG or PNG file first.', 'error');
    return;
  }
  setStatus($('edImageStatus'), 'Uploading…', 'info');
  try {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch(`/api/recipes/${editingId}/images`, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || 'Upload failed.');
    $<HTMLInputElement>('edImageFile').value = '';
    afterImageUpdate(data as Recipe);
    setStatus($('edImageStatus'), 'Image added.', 'ok');
  } catch (err) {
    setStatus($('edImageStatus'), err instanceof Error ? err.message : 'Failed.', 'error');
  }
}

/** Persist the current gallery order/removal via PATCH { images }. */
async function saveGallery(): Promise<void> {
  if (!editingId) return;
  try {
    const updated = await api<Recipe>(`/api/recipes/${editingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ images: editingImages }),
    });
    afterImageUpdate(updated);
  } catch (err) {
    setStatus($('edImageStatus'), err instanceof Error ? err.message : 'Failed.', 'error');
  }
}

// ---- top-level actions ----------------------------------------------------

// Pending auto-hide timer for the import status line (so a new import/error
// cancels the previous one instead of clearing the wrong message).
let importStatusTimer: ReturnType<typeof setTimeout> | null = null;

async function importRecipe(): Promise<void> {
  const input = $<HTMLInputElement>('importUrl');
  const url = input.value.trim();
  if (!url) return;
  if (importStatusTimer !== null) clearTimeout(importStatusTimer);
  const btn = $<HTMLButtonElement>('importBtn');
  btn.disabled = true;
  setStatus($('addStatus'), 'Fetching and parsing recipe…', 'info');
  try {
    const recipe = await api<Recipe>('/api/recipes/import', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
    input.value = '';
    setStatus($('addStatus'), `Imported “${recipe.title}”.`, 'ok');
    // Fade out the success confirmation after a few seconds.
    importStatusTimer = setTimeout(() => {
      setStatus($('addStatus'), '');
      importStatusTimer = null;
    }, 5000);
    await loadRecipes();
  } catch (err) {
    setStatus($('addStatus'), err instanceof Error ? err.message : 'Import failed.', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function newBook(): Promise<void> {
  const name = prompt('Name for the new recipe book:');
  if (!name?.trim()) return;
  const book = await api<Book>('/api/books', {
    method: 'POST',
    body: JSON.stringify({ name: name.trim() }),
  });
  activeBookId = book.id;
  await loadBooks();
}

async function renameBook(): Promise<void> {
  if (!activeBook) return;
  const name = prompt('New name:', activeBook.name);
  if (!name?.trim()) return;
  await api(`/api/books/${activeBook.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: name.trim() }),
  });
  await loadBooks();
}

async function deleteBook(): Promise<void> {
  if (!activeBook) return;
  if (!confirm(`Delete book “${activeBook.name}”? Recipes in the library are kept.`)) return;
  await api(`/api/books/${activeBook.id}`, { method: 'DELETE' });
  activeBookId = null;
  await loadBooks();
}

async function addToBook(recipeId: string): Promise<void> {
  if (!activeBook) {
    setStatus($('addStatus'), 'Create or select a book first.', 'error');
    return;
  }
  if (activeBook.recipeIds.includes(recipeId)) {
    setStatus($('genStatus'), 'That recipe is already in this book.', 'info');
    return;
  }
  await saveBookOrder([...activeBook.recipeIds, recipeId]);
}

async function movePage(recipeId: string, dir: -1 | 1): Promise<void> {
  if (!activeBook) return;
  const ids = [...activeBook.recipeIds];
  const i = ids.indexOf(recipeId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await saveBookOrder(ids);
}

async function removePage(recipeId: string): Promise<void> {
  if (!activeBook) return;
  await saveBookOrder(activeBook.recipeIds.filter((id) => id !== recipeId));
}

async function generate(format: 'tex' | 'pdf'): Promise<void> {
  if (!activeBookId) return;
  const btns = [$<HTMLButtonElement>('genTexBtn'), $<HTMLButtonElement>('genPdfBtn')];
  btns.forEach((b) => (b.disabled = true));
  setStatus($('genStatus'), format === 'pdf' ? 'Compiling PDF (first run downloads LaTeX packages)…' : 'Generating .tex…', 'info');
  try {
    const out = await api<{ url: string; format: string; recipeCount: number }>(`/api/books/${activeBookId}/generate`, {
      method: 'POST',
      body: JSON.stringify({ format }),
    });
    setStatus($('genStatus'), `Generated ${format.toUpperCase()} (${out.recipeCount} recipes).`, 'ok');
    const link = $<HTMLAnchorElement>('downloadLink');
    link.href = `${out.url}?t=${Date.now()}`;
    link.textContent = `Download ${format.toUpperCase()}`;
    link.classList.remove('hidden');
  } catch (err) {
    setStatus($('genStatus'), err instanceof Error ? err.message : 'Generation failed.', 'error');
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}

// ---- event wiring ---------------------------------------------------------

$('importBtn').addEventListener('click', () => void importRecipe());
$('importUrl').addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Enter') void importRecipe();
});
$('newRecipeBtn').addEventListener('click', () => openEditor(null));

$('library').addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const act = target.dataset.act;
  const id = target.closest<HTMLElement>('.recipe-card')?.dataset.id;
  if (!act || !id) return;
  const recipe = recipes.find((r) => r.id === id);
  if (act === 'add') void addToBook(id);
  else if (act === 'edit' && recipe) openEditor(recipe);
  else if (act === 'delete') {
    if (confirm('Delete this recipe from the library?')) {
      void api(`/api/recipes/${id}`, { method: 'DELETE' }).then(() => {
        void loadRecipes();
        void refreshActiveBook();
      });
    }
  }
});

$('bookPages').addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const act = target.dataset.act;
  const id = target.closest<HTMLElement>('li')?.dataset.id;
  if (!act || !id) return;
  if (act === 'up') void movePage(id, -1);
  else if (act === 'down') void movePage(id, 1);
  else if (act === 'remove') void removePage(id);
});

$<HTMLSelectElement>('bookSelect').addEventListener('change', (e) => {
  activeBookId = (e.target as HTMLSelectElement).value;
  void refreshActiveBook();
});
$('newBookBtn').addEventListener('click', () => void newBook());
$('renameBookBtn').addEventListener('click', () => void renameBook());
$('deleteBookBtn').addEventListener('click', () => void deleteBook());

$<HTMLSelectElement>('categorySelect').addEventListener('change', (e) => {
  activeCategoryId = (e.target as HTMLSelectElement).value;
});
$('newCategoryBtn').addEventListener('click', () => void newCategory());
$('renameCategoryBtn').addEventListener('click', () => void renameCategory());
$('deleteCategoryBtn').addEventListener('click', () => void deleteCategory());

$('genTexBtn').addEventListener('click', () => void generate('tex'));
$('genPdfBtn').addEventListener('click', () => void generate('pdf'));

$('edSaveBtn').addEventListener('click', () => void saveEditor());
$('edCancelBtn').addEventListener('click', closeEditor);
$('edAddImageUrlBtn').addEventListener('click', () => void addImageFromUrl());
$('edUploadBtn').addEventListener('click', () => void uploadImage());
$('editorOverlay').addEventListener('click', (e) => {
  if (e.target === $('editorOverlay')) closeEditor();
});

// Gallery: reorder / remove act on the local list, then persist via PATCH.
$('edGallery').addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const act = target.dataset.act;
  const file = target.closest<HTMLElement>('.gitem')?.dataset.file;
  if (!act || !file) return;
  const i = editingImages.indexOf(file);
  if (i < 0) return;
  if (act === 'remove') {
    editingImages.splice(i, 1);
  } else {
    const j = act === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= editingImages.length) return;
    [editingImages[i], editingImages[j]] = [editingImages[j], editingImages[i]];
  }
  renderGallery();
  void saveGallery();
});

// ---- init -----------------------------------------------------------------

void (async () => {
  try {
    await loadRecipes();
    await loadBooks();
    await loadCategories();
  } catch (err) {
    setStatus($('addStatus'), err instanceof Error ? err.message : 'Failed to load.', 'error');
  }
})();
