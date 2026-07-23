export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4
  label: string
  color: string
}

export function passwordStrength(password: string): PasswordStrength {
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  // `label` is an i18n key — render with t(strength.label) at the call site.
  const map: Record<number, PasswordStrength> = {
    0: { score: 0, label: 'auth.pwd.veryWeak', color: 'var(--destructive)' },
    1: { score: 1, label: 'auth.pwd.weak', color: 'var(--destructive)' },
    2: { score: 2, label: 'auth.pwd.medium', color: 'var(--warning)' },
    3: { score: 3, label: 'auth.pwd.strong', color: 'var(--success)' },
    4: { score: 4, label: 'auth.pwd.veryStrong', color: 'var(--success)' },
  }
  return map[score]
}
