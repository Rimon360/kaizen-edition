import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { verifyToken } from '@/services/auth.service'
import { SOFTWARE_ROLES } from '@/types'
import { BootSplash } from '@/components/common/BootSplash'
import { StatusCard } from '@/components/common/StatusCard'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'

type Phase = 'checking' | 'allowed' | 'denied'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const t = useT()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const logout = useAuthStore((s) => s.logout)
  // If a freshly-validated user is already in memory (e.g. just signed in),
  // trust it and render immediately — no BootSplash flash, no second round-trip.
  const [phase, setPhase] = useState<Phase>(() =>
    user && SOFTWARE_ROLES.includes(user.role) ? 'allowed' : 'checking',
  )
  const [deniedMsg, setDeniedMsg] = useState('')

  // Validate the session ONCE per app launch (at login + on startup with a
  // stored token). There is no recurring heartbeat — after this single check the
  // app runs fully local; only authentication ever contacts the server.
  useEffect(() => {
    if (!token) return
    // Already validated in this session (sign-in path) — skip the extra verify.
    if (user && SOFTWARE_ROLES.includes(user.role)) {
      setPhase('allowed')
      return
    }
    let cancelled = false

    const verify = async () => {
      try {
        const user = await verifyToken()
        if (cancelled) return
        setUser(user)
        if (SOFTWARE_ROLES.includes(user.role)) {
          setPhase('allowed')
        } else {
          setPhase('denied')
          setDeniedMsg(t('auth.protected.roleDenied'))
        }
      } catch (err) {
        if (cancelled) return
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 401 || status === 403) {
          await logout()
          navigate('/login', { replace: true })
        } else {
          // Opening the app requires connectivity to validate the stored token.
          setPhase('denied')
          setDeniedMsg((err as Error).message || t('auth.protected.connectFailed'))
        }
      }
    }

    verify()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (!token) return <Navigate to="/login" replace />
  if (phase === 'checking') return <BootSplash />

  if (phase === 'denied') {
    return (
      <StatusCard
        icon={ShieldAlert}
        tone="danger"
        title={t('auth.protected.restricted')}
        description={deniedMsg}
        ghostGlyph={<ShieldAlert className="h-[26rem] w-[26rem] text-[var(--neon-3)]" strokeWidth={1} />}
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.reload()}>
            {t('common.retry')}
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              await logout()
              navigate('/login', { replace: true })
            }}
          >
            {t('auth.protected.logout')}
          </Button>
        </div>
      </StatusCard>
    )
  }

  return <>{children}</>
}
