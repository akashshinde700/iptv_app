import { describe, it, expect } from 'vitest'
import {
  ADMIN_PASSWORD_MIN,
  CUSTOMER_PASSWORD_MIN,
  isLegacyDefaultPassword,
  passwordProblem,
} from '@/lib/server/password-rules'

/*
 * SEC-01/SEC-02: the seeded owner password used to be a hardcoded, publicly printed string with
 * no way to change it. These tests pin the rules that make "change your password" meaningful.
 */

describe('passwordProblem', () => {
  it('accepts a reasonable admin password', () => {
    expect(passwordProblem('Mango-Harbour-42')).toBeNull()
    expect(passwordProblem('tR7#pLq2vw')).toBeNull()
  })

  it('enforces the admin minimum length', () => {
    expect(ADMIN_PASSWORD_MIN).toBeGreaterThanOrEqual(8)
    expect(passwordProblem('Ab3$x')).toMatch(/at least 8/)
  })

  it('rejects the historically shipped default and other common passwords', () => {
    expect(passwordProblem('StreamKaro@2024')).toMatch(/too common/i)
    expect(passwordProblem('password')).toMatch(/too common/i)
    expect(passwordProblem('admin123')).toMatch(/too common/i)
  })

  it('requires two character classes', () => {
    expect(passwordProblem('abcdefghij')).toMatch(/two of/i)
    expect(passwordProblem('1234567890')).toMatch(/two of/i)
    expect(passwordProblem('abcdefgh1')).toBeNull()
  })

  it('rejects padding, repeats and empty input', () => {
    expect(passwordProblem('')).toMatch(/enter/i)
    expect(passwordProblem(' goodpass1 ')).toMatch(/space/i)
    expect(passwordProblem('aaaaaaaaaa')).toMatch(/repeated/i)
    expect(passwordProblem('a'.repeat(201))).toMatch(/too long/i)
  })

  it('uses a lower bar for end customers (operators hand these out)', () => {
    expect(CUSTOMER_PASSWORD_MIN).toBeLessThan(ADMIN_PASSWORD_MIN)
    // The caller passes the minimum explicitly; the default is the strict admin rule.
    expect(passwordProblem('test1234', CUSTOMER_PASSWORD_MIN)).toBeNull()
  })
})

describe('isLegacyDefaultPassword', () => {
  it('recognises the old seed password in any case', () => {
    expect(isLegacyDefaultPassword('StreamKaro@2024')).toBe(true)
    expect(isLegacyDefaultPassword('streamkaro@2024')).toBe(true)
    expect(isLegacyDefaultPassword('Mango-Harbour-42')).toBe(false)
  })
})
