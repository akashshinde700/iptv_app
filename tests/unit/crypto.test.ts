import { describe, it, expect } from 'vitest'
import { encryptSecret, decryptSecret, maskSecret } from '@/lib/server/crypto'

describe('crypto (portal secret encryption)', () => {
  it('round-trips a secret', () => {
    const enc = encryptSecret('super-secret-pass')
    expect(enc).toMatch(/^enc:v1:/)
    expect(decryptSecret(enc)).toBe('super-secret-pass')
  })

  it('produces a different ciphertext each call (random IV)', () => {
    expect(encryptSecret('x')).not.toBe(encryptSecret('x'))
  })

  it('passes through null / empty', () => {
    expect(encryptSecret(null)).toBeNull()
    expect(encryptSecret('')).toBeNull()
    expect(decryptSecret(null)).toBeNull()
  })

  it('treats non-prefixed values as legacy plaintext', () => {
    expect(decryptSecret('legacy-plain-pass')).toBe('legacy-plain-pass')
  })

  it('does not double-encrypt', () => {
    const once = encryptSecret('abc')!
    expect(encryptSecret(once)).toBe(once)
  })

  it('returns null on a corrupted ciphertext', () => {
    const enc = encryptSecret('abc')!
    const corrupted = enc.slice(0, -4) + 'AAAA'
    expect(decryptSecret(corrupted)).toBeNull()
  })

  it('masks a secret for display', () => {
    expect(maskSecret('anything')).toBe('••••••••')
    expect(maskSecret(null)).toBeNull()
  })
})
