/**
 * AES-256-GCM encryption for secrets at rest (portal passwords).
 *
 * Format:  enc:v1:<base64(iv)>:<base64(tag)>:<base64(ciphertext)>
 * Values that are null/empty or not in that format are returned untouched, so
 * this is safe to roll out over a table that still holds plaintext rows.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const PREFIX = 'enc:v1:'

function key(): Buffer {
  const hex = process.env.PORTAL_ENC_KEY ?? ''
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    if (process.env.NODE_ENV === 'production') throw new Error('PORTAL_ENC_KEY must be 64 hex chars')
    // Dev fallback — NOT secure, only so `bun run dev` works without setup.
    return Buffer.alloc(32, 7)
  }
  return Buffer.from(hex, 'hex')
}

export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain == null || plain === '') return null
  if (plain.startsWith(PREFIX)) return plain // already encrypted
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

export function decryptSecret(value: string | null | undefined): string | null {
  if (value == null || value === '') return null
  if (!value.startsWith(PREFIX)) return value // legacy plaintext
  try {
    const [ivB64, tagB64, ctB64] = value.slice(PREFIX.length).split(':')
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** Mask a secret for display in admin responses. */
export function maskSecret(value: string | null | undefined): string | null {
  return value ? '••••••••' : null
}
