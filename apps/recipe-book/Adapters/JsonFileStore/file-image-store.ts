import { writeFile, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, extname } from 'node:path'
import type { ImageStore } from '../../Domain/Ports/image-store.ts'
import { DomainError } from '../../Domain/Exceptions/domain-error.ts'
import { BROWSER_UA } from '../browser-user-agent.ts'
import { IMAGES_DIR } from './paths.ts'
import { ensureDir } from './json-file.ts'

// Only these raster formats embed cleanly in LaTeX via \includegraphics.
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
}

/** Map a content-type / url to a LaTeX-safe extension, or null if unsupported (e.g. webp). */
export function imageExt(contentType: string | null, url: string | null): string | null {
  if (contentType) {
    const ct = contentType.split(';')[0].trim().toLowerCase()
    if (EXT_BY_TYPE[ct]) return EXT_BY_TYPE[ct]
  }
  const urlExt = url ? extname(new URL(url, 'https://x').pathname).toLowerCase() : ''
  if (urlExt === '.jpg' || urlExt === '.jpeg') return '.jpg'
  if (urlExt === '.png') return '.png'
  return null
}

/** ImageStore that keeps image bytes as files under IMAGES_DIR on the data volume. */
export class FileImageStore implements ImageStore {
  async saveUpload(recipeId: string, buffer: Buffer, contentType: string | null, originalName: string): Promise<string> {
    const ext = imageExt(contentType, originalName)
    if (!ext) throw new DomainError('Only JPG or PNG images are supported.', 415)
    return this.writeImageFile(recipeId, buffer, ext)
  }

  async downloadFromUrl(recipeId: string, url: string): Promise<string | null> {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } })
      if (!res.ok) return null
      const ext = imageExt(res.headers.get('content-type'), url)
      if (!ext) return null
      const buffer = Buffer.from(await res.arrayBuffer())
      return await this.writeImageFile(recipeId, buffer, ext)
    } catch {
      return null
    }
  }

  async delete(filename: string): Promise<void> {
    await unlink(join(IMAGES_DIR, filename)).catch(() => {})
  }

  private async writeImageFile(recipeId: string, buffer: Buffer, ext: string): Promise<string> {
    await ensureDir(IMAGES_DIR)
    const filename = `${recipeId}-${randomUUID().slice(0, 8)}${ext}`
    await writeFile(join(IMAGES_DIR, filename), buffer)
    return filename
  }
}
