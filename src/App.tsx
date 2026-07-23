import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Titlebar } from '@/components/titlebar/Titlebar'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { BootSplash } from '@/components/common/BootSplash'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { useAuthStore } from '@/store/authStore'
import { useSettingsStore } from '@/store/settingsStore'
import { loadPrefs, startPrefsAutosave } from '@/store/editorPrefs'
import { useCloneStore } from '@/store/cloneStore'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { StudioPage } from '@/pages/StudioPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
})

export function App() {
  const [ready, setReady] = useState(false)
  const hydrate = useAuthStore((s) => s.hydrate)
  const loadSettings = useSettingsStore((s) => s.load)

  useEffect(() => {
    // Block routes until secure token + settings are loaded, so the axios
    // interceptor never fires a request before the token is in memory. Editor
    // preferences are restored here too, then we begin mirroring changes to disk
    // (started after the restore so the restore itself doesn't trigger a save).
    Promise.all([hydrate(), loadSettings(), loadPrefs()]).finally(() => {
      startPrefsAutosave()
      setReady(true)
    })
    // Cloned-voice library loads in the background (doesn't gate the UI).
    void useCloneStore.getState().load()
  }, [hydrate, loadSettings])

  return (
    <ErrorBoundary label="root" withWindowControls>
      <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={200}>
          <HashRouter>
          <div className="flex h-screen flex-col overflow-hidden">
            <Titlebar />
            <div className="relative flex-1 overflow-hidden">
              {!ready ? (
                <BootSplash />
              ) : (
                <ErrorBoundary label="app">
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <StudioPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute>
                        <SettingsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/404" element={<NotFoundPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                </ErrorBoundary>
              )}
            </div>
          </div>
        </HashRouter>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'color-mix(in oklab, var(--popover) 92%, transparent)',
              border: '1px solid color-mix(in oklab, var(--neon-1) 22%, var(--border))',
              color: 'var(--popover-foreground)',
              borderRadius: 'var(--radius)',
              backdropFilter: 'blur(12px)',
            },
          }}
        />
        </TooltipProvider>
      </MotionConfig>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
