import { useNavigate } from 'react-router-dom'
import { LogOut, Settings, User as UserIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/i18n'
import { useAuthStore } from '@/store/authStore'

export function UserMenu() {
  const t = useT()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const logout = useAuthStore((s) => s.logout)

  if (!token || !user) return null

  const display = user.username || user.email
  const initial = (display?.[0] ?? '?').toUpperCase()
  const roleLabel = user.role.replace(/_/g, ' ')

  const handleLogout = async () => {
    await logout()
    toast.success(t('titlebar.user.loggedOut'))
    navigate('/login', { replace: true })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="no-drag flex h-7 items-center gap-1.5 rounded-[var(--radius)] border border-[var(--neon-1)]/20 bg-white/[0.04] pl-1 pr-2.5 text-xs text-foreground/70 transition-colors hover:border-[var(--neon-1)]/45 hover:bg-white/[0.07] hover:text-foreground data-[state=open]:border-[var(--neon-1)]/55 data-[state=open]:text-foreground">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-[10px] font-bold text-white">
            {initial}
          </span>
          <span className="max-w-[140px] truncate" title={display}>
            {display}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-foreground" title={user.email}>
            <UserIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{user.email}</span>
          </span>
          <Badge variant="muted" className="w-fit capitalize">
            {roleLabel}
          </Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/settings')}>
          <Settings className="text-muted-foreground" />
          {t('titlebar.user.settings')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:!text-destructive">
          <LogOut />
          {t('titlebar.user.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
