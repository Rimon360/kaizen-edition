import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusCard } from '@/components/common/StatusCard'
import { useT } from '@/i18n'

export function NotFoundPage() {
  const t = useT()
  return (
    <StatusCard
      icon={Compass}
      tone="info"
      title="404"
      description={t('common.notFoundDesc')}
      ghostGlyph={
        <span className="numeric select-none text-[26rem] font-bold leading-none tracking-tighter text-[var(--neon-1)]">
          404
        </span>
      }
    >
      <Button
        asChild
        variant="outline"
        className="hover:-translate-y-0.5 hover:bg-white/[0.06] hover:text-foreground"
      >
        <Link to="/">{t('common.backHome')}</Link>
      </Button>
    </StatusCard>
  )
}
