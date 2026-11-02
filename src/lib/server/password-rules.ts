/**
 * Password rules in one place.
 *
 * The product has two principals with different risk profiles:
 *
 *  - **Admins** (an operator's owner/staff) can read every customer, change plans and delete
 *    channels — they get the strict rule.
 *  - **Customers** are end users who were often handed a password over WhatsApp by the operator;
 *    the minimum stays low (6) so onboarding does not become the support queue's biggest topic.
 *
 * Pure functions only, so they can be unit-tested without a database.
 */

export const ADMIN_PASSWORD_MIN = 8
export const CUSTOMER_PASSWORD_MIN = 6

/** Well-known strings that must never be accepted for a privileged account. */
const BLOCKED_ADMIN_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'admin',
  'admin123',
  'streamkaro',
  'streamkaro2024',
  'streamkaro@2024',
  '12345678',
  'qwertyui',
  'letmein1',
  'welcome1',
  'iloveyou',
])

/**
 * Returns a human-readable problem with the password, or `null` when it is acceptable.
 * Messages are plain language on purpose — they are shown directly in the admin form.
 */
export function passwordProblem(password: string, min = ADMIN_PASSWORD_MIN): string | null {
  if (!password) return 'Enter a new password'
  if (password.length < min) return `Password must be at least ${min} characters`
  if (password.length > 200) return 'Password is too long (max 200 characters)'
  if (password.trim().length !== password.length) return 'Password cannot start or end with a space'
  const normalised = password.toLowerCase()
  if (BLOCKED_ADMIN_PASSWORDS.has(normalised)) return 'That password is too common — choose something unique'
  if (/^(.)\1+$/.test(password)) return 'Password cannot be a single repeated character'

  // Two character classes is enough for a 8+ char password; do not over-restrict (NIST 800-63B).
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length
  if (classes < 2) return 'Use at least two of: lowercase, uppercase, numbers, symbols'
  return null
}

/** True when this looks like the historically shipped seed password (used for a UI warning). */
export function isLegacyDefaultPassword(password: string): boolean {
  return password.toLowerCase() === 'streamkaro@2024'
}
