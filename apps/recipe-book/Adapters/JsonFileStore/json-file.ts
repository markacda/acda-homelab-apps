import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'

// Small, shared filesystem helpers for the JSON-file repositories. All are
// tolerant of a missing directory/file so a fresh data volume just reads empty.

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2), 'utf8')
}

/** List the json files in a dir (basenames without extension), tolerant of a missing dir. */
export async function listIds(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir)
    return files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -'.json'.length))
  } catch {
    return []
  }
}
