import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Check, Eye, EyeOff, Loader2, UserPlus, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { AuthLayout } from '@/layouts/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthActions } from '@/features/auth/useAuthActions'
import { useAuthStore } from '@/store/authStore'
import { passwordStrength, validateEmail } from '@/utils/validation'
import { useT } from '@/i18n'

export function RegisterPage() {
  const t = useT()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const { signUp, loading } = useAuthActions()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)

  if (token) return <Navigate to="/" replace />

  const strength = passwordStrength(password)
  // Neon triad ramp for the strength segments: magenta (weak) → purple (mid) →
  // cyan (strong). Independent of strength.color (semantic palette) by design —
  // the meter speaks the cyberpunk accent language. The textual label keeps its
  // semantic color so meaning stays legible.
  const rampColor = (i: number): string =>
    i >= 3 ? 'var(--neon-1)' : i === 2 ? 'var(--neon-2)' : 'var(--neon-3)'
  const confirmMatch = confirm.length > 0 && password === confirm

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const cleanName = name.trim()
    const cleanEmail = email.trim()
    if (cleanName.length < 2) return toast.error(t('auth.register.enterName'))
    if (!validateEmail(cleanEmail)) return toast.error(t('auth.register.invalidEmail'))
    if (password.length < 8) return toast.error(t('auth.register.passwordTooShort'))
    if (password !== confirm) return toast.error(t('auth.register.passwordMismatch'))
    try {
      await signUp(cleanName, cleanEmail, password)
      toast.success(t('auth.register.created'))
      navigate('/', { replace: true })
    } catch (err) {
      toast.error((err as Error).message || t('auth.register.failed'))
    }
  }

  return (
    <AuthLayout>
      <div className="mb-8 space-y-1.5">
        <h2 className="display text-2xl font-bold">{t('auth.register.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('auth.register.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t('auth.register.name')}</Label>
          <Input
            id="name"
            autoFocus
            autoComplete="name"
            disabled={loading}
            placeholder={t('auth.register.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t('auth.register.email')}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            disabled={loading}
            placeholder={t('auth.register.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t('auth.register.password')}</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              disabled={loading}
              placeholder={t('auth.register.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
              aria-describedby={password ? 'pw-strength' : undefined}
            />
            <button
              type="button"
              aria-label={showPw ? t('auth.login.hidePassword') : t('auth.login.showPassword')}
              aria-pressed={showPw}
              disabled={loading}
              onClick={() => setShowPw((v) => !v)}
              className="no-drag absolute right-3 top-1/2 -translate-y-1/2 rounded text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {/* Reserve the meter row's height so it never shifts the card on first keypress. */}
          <div className="min-h-[18px]">
            {password && (
              <div
                id="pw-strength"
                className="flex items-center gap-2"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={4}
                aria-valuenow={strength.score}
                aria-label={t(strength.label)}
              >
                <div className="flex h-1.5 flex-1 gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-full flex-1 rounded-full bg-white/10 transition-colors duration-300"
                      style={i < strength.score ? { background: rampColor(i) } : undefined}
                    />
                  ))}
                </div>
                <span
                  className="numeric text-[10px] font-medium uppercase tracking-[0.12em]"
                  style={{ color: strength.color }}
                >
                  {t(strength.label)}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">{t('auth.register.confirm')}</Label>
          <Input
            id="confirm"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            disabled={loading}
            placeholder={t('auth.register.confirmPlaceholder')}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-describedby={confirm ? 'pw-confirm' : undefined}
          />
          {/* Live match feedback — felt before submit. Height reserved to hold layout. */}
          <div id="pw-confirm" className="flex min-h-[18px] items-center gap-1.5" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              {confirm.length > 0 && (
                <motion.span
                  key={confirmMatch ? 'match' : 'mismatch'}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className={[
                    'inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em]',
                    confirmMatch ? 'text-[var(--neon-1)]' : 'text-[var(--neon-3)]',
                  ].join(' ')}
                >
                  {confirmMatch ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                  {confirmMatch ? t('auth.register.passwordMatch') : t('auth.register.passwordMismatch')}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {t('auth.register.submit')}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t('auth.register.haveAccount')}{' '}
        <Link to="/login" className="font-medium text-primary hover:text-primary/80">
          {t('auth.register.signInLink')}
        </Link>
      </p>
    </AuthLayout>
  )
}
