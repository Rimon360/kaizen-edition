import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { AuthLayout } from '@/layouts/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useAuthActions } from '@/features/auth/useAuthActions'
import { useAuthStore } from '@/store/authStore'
import { validateEmail } from '@/utils/validation'
import { useT } from '@/i18n'

export function LoginPage() {
  const t = useT()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const { signIn, loading } = useAuthActions()
  const [email, setEmail] = useState(localStorage.getItem('kaizen_remember_email') ?? '')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(!!localStorage.getItem('kaizen_remember_email'))
  const [showPw, setShowPw] = useState(false)

  if (token) return <Navigate to="/" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const cleanEmail = email.trim()
    if (!validateEmail(cleanEmail)) return toast.error(t('auth.login.invalidEmail'))
    if (password.length < 1) return toast.error(t('auth.login.enterPassword'))
    try {
      if (remember) localStorage.setItem('kaizen_remember_email', cleanEmail)
      else localStorage.removeItem('kaizen_remember_email')
      await signIn(cleanEmail, password)
      toast.success(t('auth.login.welcomeBack'))
      navigate('/', { replace: true })
    } catch (err) {
      toast.error((err as Error).message || t('auth.login.failed'))
    }
  }

  return (
    <AuthLayout>
      <div className="mb-8 space-y-2">
        <h2 className="display text-2xl font-bold">{t('auth.login.title')}</h2>
        <div className="hairline w-10" />
        <p className="text-sm text-muted-foreground">{t('auth.login.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">{t('auth.login.email')}</Label>
          <Input
            id="email"
            type="email"
            autoFocus
            autoComplete="email"
            disabled={loading}
            placeholder={t('auth.login.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t('auth.login.password')}</Label>
            <Link
              to="/forgot-password"
              className="no-drag -mr-1 rounded-full px-1.5 py-0.5 text-xs text-primary transition-colors hover:bg-primary/10 hover:text-primary"
            >
              {t('auth.login.forgot')}
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              disabled={loading}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              aria-label={showPw ? t('auth.login.hidePassword') : t('auth.login.showPassword')}
              aria-pressed={showPw}
              disabled={loading}
              onClick={() => setShowPw((v) => !v)}
              className="no-drag absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground disabled:opacity-50"
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <label className="-mx-2 flex w-fit cursor-pointer items-center gap-2.5 rounded-full px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} />
          {t('auth.login.remember')}
        </label>

        <Button
          type="submit"
          variant="gradient"
          size="lg"
          className="mt-1 w-full"
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {t('auth.login.submit')}
        </Button>
      </form>

      <div className="hairline my-6" />

      <p className="text-center text-sm text-muted-foreground">
        {t('auth.login.noAccount')}{' '}
        <Link
          to="/register"
          className="no-drag rounded-full px-1.5 py-0.5 font-medium text-primary transition-colors hover:bg-primary/10 hover:text-primary"
        >
          {t('auth.login.signUpLink')}
        </Link>
      </p>
    </AuthLayout>
  )
}
