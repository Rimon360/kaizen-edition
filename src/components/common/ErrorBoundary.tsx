import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertOctagon } from 'lucide-react'
import { electronApi, isElectron } from '@/lib/electron'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  /** Optional label so we know which region failed. */
  label?: string
  /**
   * Render the fallback as a FULL-WINDOW screen with its own minimize/close
   * controls + drag strip. Set on the ROOT boundary only — when it catches, the
   * real Titlebar is gone, so the user would otherwise be trapped in a frameless
   * window. The inner (per-route) boundary leaves this off: the Titlebar above it
   * still works, so it just fills the content area.
   */
  withWindowControls?: boolean
}
interface State {
  error: Error | null
}

/**
 * Catches render errors so a single broken feature shows a recoverable message
 * instead of a fully blank window. Wrap the app root (and ideally risky panels).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface it for diagnostics (visible in the devtools console / main log).
    console.error('[ErrorBoundary]', this.props.label ?? '', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      const chrome = this.props.withWindowControls && isElectron
      return (
        // The root fallback fills the whole (frameless) window and carries its OWN
        // minimize/close + drag strip — the Titlebar may be the thing that crashed,
        // so this never depends on React state, the store, or i18n. A crashed app
        // must always be closable/movable. The inner boundary just fills its area.
        <div className={`flex w-full flex-col ${chrome ? 'h-screen' : 'h-full'}`}>
          {chrome && (
            <div
              className="drag flex h-11 shrink-0 items-center justify-end"
              style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            >
              <button
                aria-label="Minimizar"
                onClick={() => electronApi?.window.minimize()}
                className="no-drag grid h-full w-12 place-items-center text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              >
                <span className="block h-px w-4 bg-current" />
              </button>
              <button
                aria-label="Cerrar"
                onClick={() => electronApi?.window.close()}
                className="no-drag grid h-full w-12 place-items-center text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
              >
                <span className="text-base leading-none">×</span>
              </button>
            </div>
          )}
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="glass scanline relative flex max-w-lg flex-col gap-5 rounded-[1rem] p-7">
              {/* Magenta corner brackets — "fault" framing. */}
              <span
                aria-hidden
                className="pointer-events-none absolute left-3 top-3 h-4 w-4 rounded-tl-[3px] border-l-2 border-t-2 border-[var(--neon-3)]/55"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute right-3 top-3 h-4 w-4 rounded-tr-[3px] border-r-2 border-t-2 border-[var(--neon-3)]/55"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 rounded-bl-[3px] border-b-2 border-l-2 border-[var(--neon-3)]/55"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-3 right-3 h-4 w-4 rounded-br-[3px] border-b-2 border-r-2 border-[var(--neon-3)]/55"
              />

              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--neon-3)]/40 bg-[var(--neon-3)]/10 text-[var(--neon-3)]">
                  <AlertOctagon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="numeric text-[10px] uppercase tracking-[0.22em] text-[var(--neon-3)]">
                    System fault
                  </p>
                  <h2 className="display text-xl font-semibold text-foreground">Algo salió mal</h2>
                </div>
              </div>

              <p className="text-[13px] leading-relaxed text-foreground/70">
                Ocurrió un error inesperado en la aplicación. Puedes recargar para continuar.
              </p>

              {/* Terminal block — mono, cyan tint, faint neon hairline. */}
              <pre className="numeric border-grad [--grad:linear-gradient(135deg,color-mix(in_oklab,var(--neon-1)_40%,transparent),transparent)] [--fill:rgba(0,0,0,0.55)] max-h-40 overflow-auto whitespace-pre-wrap rounded-[var(--radius)] p-3.5 text-left text-[11px] leading-relaxed text-[var(--neon-1)]/85">
                {this.state.error.message}
              </pre>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => this.setState({ error: null })}>
                  Reintentar
                </Button>
                <Button variant="gradient" onClick={() => window.location.reload()}>
                  Recargar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
