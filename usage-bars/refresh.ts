import { mkdir, open, rename, stat, unlink, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { readStatus } from "./lib.ts"
import type { ErrorKind } from "./lib.ts"

export const LOCK_TTL_MS = 60_000
export const DEFAULT_BACKOFF_MS = 3 * 60_000

export type Outcome =
  | { ok: true; write: () => Promise<void> }
  | { ok: false; kind: ErrorKind; httpStatus?: number | null; retryAfterMs?: number | null }

export async function writeAtomic(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, content)
  try {
    await rename(tmp, path)
  } catch {
    await writeFile(path, content)
    await unlink(tmp).catch(() => {})
  }
}

async function acquireLock(path: string): Promise<boolean> {
  await mkdir(dirname(path), { recursive: true })
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, "wx")
      await handle.writeFile(JSON.stringify({ pid: process.pid, at: Date.now() }))
      await handle.close()
      return true
    } catch (error: any) {
      if (error?.code !== "EEXIST") return false
      try {
        const info = await stat(path)
        if (Date.now() - info.mtimeMs > LOCK_TTL_MS) {
          await unlink(path)
          continue
        }
      } catch {}
      return false
    }
  }
  return false
}

async function ageMs(path: string): Promise<number> {
  try {
    return Date.now() - (await stat(path)).mtimeMs
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export async function refreshSource(opts: {
  cache: string
  status: string
  lock: string
  minAgeMs: number
  fetch: () => Promise<Outcome>
}) {
  const skip = async () => {
    if ((await ageMs(opts.cache)) < opts.minAgeMs) return true
    const status = readStatus(opts.status)
    return status !== null && status.retryAt > Date.now()
  }

  if (await skip()) return
  if (!(await acquireLock(opts.lock))) return
  try {
    if (await skip()) return
    const outcome = await opts.fetch()
    if (outcome.ok) {
      await outcome.write()
      await unlink(opts.status).catch(() => {})
      return
    }
    const now = Date.now()
    await writeAtomic(
      opts.status,
      JSON.stringify({
        at: now,
        kind: outcome.kind,
        httpStatus: outcome.httpStatus ?? null,
        retryAt: now + (outcome.retryAfterMs ?? DEFAULT_BACKOFF_MS),
      }),
    )
  } catch {
  } finally {
    await unlink(opts.lock).catch(() => {})
  }
}
