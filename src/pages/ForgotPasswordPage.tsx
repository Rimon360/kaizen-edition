import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Loader2, Mail, ShieldCheck, KeyRound } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { AuthLayout } from '@/layouts/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { checkEmail, changePassword, sendOtp, verifyOtp } from '@/services/auth.service'
import { useAuthStore } from '@/store/authStore'
import { validateEmail } from '@/utils/validation'
import { useT } from '@/i18n'

type Step = 'email' | 'otp' | 'reset'

export function ForgotPasswordPage() {
  const t = useT()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const setToken = useAuthStore((s) => s.setToken)
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // Don't let an already-authenticated user run the reset flow (it would swap the
  // active session token mid-way). Mirrors the guard on Login/Register.
  if (token) return <Navigate to="/" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (step === 'email') {
        if (!validateEmail(email)) throw new Error(t('auth.forgot.invalidEmail'))
        await checkEmail(email)
        await sendOtp(email)
        toast.success(t('auth.forgot.codeSent'))
        setStep('otp')
      } else if (step === 'otp') {
        if (otp.trim().length < 4) throw new Error(t('auth.forgot.enterCode'))
        const tok = await verifyOtp(email, otp)
        if (tok) await setToken(tok)
        toast.success(t('auth.forgot.codeVerified'))
        setStep('reset')
      } else {
        if (password.length < 8) throw new Error(t('auth.forgot.passwordTooShort'))
        await changePassword(email, password)
        toast.success(t('auth.forgot.passwordUpdated'))
        navigate('/login', { replace: true })
      }
    } catch (err) {
      toast.error((err as Error).message || t('auth.forgot.somethingWrong'))
    } finally {
      setLoading(false)
    }
  }

  const meta = {
    email: { icon: Mail, title: t('auth.forgot.emailTitle'), desc: t('auth.forgot.emailDesc') },
    otp: { icon: ShieldCheck, title: t('auth.forgot.otpTitle'), desc: t('auth.forgot.otpDesc', { email }) },
    reset: { icon: KeyRound, title: t('auth.forgot.resetTitle'), desc: t('auth.forgot.resetDesc') },
  }[step]

  // 3-segment progress stepper. Drives node fill/glow + connector fill off the
  // current step index so completed nodes read "done" and the active one glows.
  const steps: { key: Step; icon: typeof Mail }[] = [
    { key: 'email', icon: Mail },
    { key: 'otp', icon: ShieldCheck },
    { key: 'reset', icon: KeyRound },
  ]
  const stepIndex = steps.findIndex((s) => s.key === step)

  return (
    <AuthLayout>
      <Link
        to="/login"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('auth.forgot.back')}
      </Link>

      {/* 3-segment progress stepper: completed = filled cyan, active = glowing,
          upcoming = quiet outline. Connectors fill as steps complete. */}
      <div className="mb-8 flex items-center" aria-hidden="true">
        {steps.map((s, i) => {
          const StepIcon = s.icon
          const done = i < stepIndex
          const active = i === stepIndex
          return (
            <div key={s.key} className="flex flex-1 items-center last:flex-none">
              <div
                className={[
                  'no-drag relative grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors duration-300',
                  done
                    ? 'border-[var(--neon-1)]/60 bg-[var(--neon-1)]/15 text-[var(--neon-1)]'
                    : active
                      ? 'glow glow-sm [--glow:var(--neon-1)] border-[var(--neon-1)] bg-[var(--neon-1)]/10 text-[var(--neon-1)]'
                      : 'border-white/10 bg-white/[0.03] text-muted-foreground',
                ].join(' ')}
              >
                {done ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
              </div>
              {i < steps.length - 1 && (
                <div className="mx-2 h-px flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-[var(--neon-1)] transition-[width] duration-500 ease-out"
                    style={{ width: done ? '100%' : '0%' }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mb-8 space-y-1.5">
        <h2 className="display flex items-center gap-2 text-2xl font-bold">
          <meta.icon className="h-6 w-6 text-primary" />
          {meta.title}
        </h2>
        <p className="text-sm text-muted-foreground">{meta.desc}</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {/* min-h reserves the field row so x-slide swaps never jump card height. */}
        <div className="relative min-h-[68px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              {step === 'email' && (
                <div className="space-y-2">
                  <Label htmlFor="email">{t('auth.forgot.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoFocus
                    autoComplete="email"
                    disabled={loading}
                    placeholder={t('auth.forgot.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              )}
              {step === 'otp' && (
                <div className="space-y-2">
                  <Label htmlFor="otp">{t('auth.forgot.otp')}</Label>
                  <Input
                    id="otp"
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    disabled={loading}
                    placeholder={t('auth.forgot.otpPlaceholder')}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="numeric text-center text-lg tracking-[0.3em]"
                  />
                </div>
              )}
              {step === 'reset' && (
                <div className="space-y-2">
                  <Label htmlFor="newpw">{t('auth.forgot.newPassword')}</Label>
                  <Input
                    id="newpw"
                    type="password"
                    autoFocus
                    autoComplete="new-password"
                    disabled={loading}
                    placeholder={t('auth.forgot.newPasswordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <meta.icon className="h-4 w-4" />}
          {step === 'email'
            ? t('auth.forgot.sendCode')
            : step === 'otp'
              ? t('auth.forgot.verify')
              : t('auth.forgot.savePassword')}
        </Button>
      </form>
    </AuthLayout>
  )
}
