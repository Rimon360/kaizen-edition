import { ArrowUp, ArrowDown, ArrowDownAZ, Copy, Trash2, Loader2, Film, AlertCircle, GripVertical } from 'lucide-react'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import type { QueueItem } from '@/types'
import { formatDuration, truncateMiddle } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useQueueStore } from '@/store/queueStore'
import { cn } from '@/utils/cn'
import { useT } from '@/i18n'

interface Props {
  item: QueueItem
  index: number
  total: number
}

/** Icon action with a styled tooltip (replaces native title= popups). */
function RowAction({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
          className={className}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function QueueItemRow({ item, index, total }: Props) {
  const move = useQueueStore((s) => s.move)
  const remove = useQueueStore((s) => s.remove)
  const duplicate = useQueueStore((s) => s.duplicate)
  const sort = useQueueStore((s) => s.sort)
  const clear = useQueueStore((s) => s.clear)
  const t = useT()

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.div
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, x: -12 }}
          className={cn(
            'group glow glow-sm relative flex items-center gap-2.5 overflow-hidden rounded-[var(--radius)] border border-border/60 bg-black/20 p-2 pl-3 transition-[border-color,transform] duration-150 [--glow-opacity:0] hover:-translate-y-px hover:border-[var(--neon-1)]/40 hover:[--glow-opacity:0.18]',
            index === 0
              ? '[--glow:var(--neon-3)] hover:[--glow-opacity:0.22]'
              : '[--glow:var(--neon-1)]',
          )}
        >
      {/* Left accent rail: magenta on the active/first-previewed clip, cyan on hover */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-[2px] rounded-full transition-colors',
          index === 0
            ? 'bg-[var(--neon-3)]'
            : 'bg-transparent group-hover:bg-[var(--neon-1)]',
        )}
      />

      {/* Drag handle — appears on hover */}
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />

      <span className="numeric grid h-6 w-6 shrink-0 place-items-center rounded-[0.4rem] border border-[var(--neon-1)]/25 bg-[var(--neon-1)]/5 text-[11px] text-[var(--neon-1)]">
        {index + 1}
      </span>

      <div className="relative h-12 w-[68px] shrink-0 overflow-hidden rounded-[0.5rem] border border-border/50 bg-black">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center">
            {item.status === 'probing' ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : item.status === 'error' ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : (
              <Film className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground/85" title={item.name}>
          {truncateMiddle(item.name, 30)}
        </p>
        <p className="text-xs">
          {item.status === 'error' ? (
            <span className="text-destructive">{t('queue.row.readError')}</span>
          ) : (
            <span className="numeric text-[var(--neon-1)]/70">{formatDuration(item.duration)}</span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
        <RowAction label={t('queue.row.up')} disabled={index === 0} onClick={() => move(item.id, -1)}>
          <ArrowUp className="h-3.5 w-3.5" />
        </RowAction>
        <RowAction
          label={t('queue.row.down')}
          disabled={index === total - 1}
          onClick={() => move(item.id, 1)}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </RowAction>
        <RowAction label={t('queue.row.duplicate')} onClick={() => duplicate(item.id)}>
          <Copy className="h-3.5 w-3.5" />
        </RowAction>
        <RowAction
          label={t('queue.row.delete')}
          className="hover:text-destructive"
          onClick={() => remove(item.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </RowAction>
      </div>
        </motion.div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem disabled={index === 0} onSelect={() => move(item.id, -1)}>
          <ArrowUp /> {t('queue.row.up')}
        </ContextMenuItem>
        <ContextMenuItem disabled={index === total - 1} onSelect={() => move(item.id, 1)}>
          <ArrowDown /> {t('queue.row.down')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => duplicate(item.id)}>
          <Copy /> {t('queue.row.duplicate')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => sort()}>
          <ArrowDownAZ /> {t('queue.autoSort')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => clear()} className="text-destructive focus:text-destructive">
          <Trash2 /> {t('queue.clearAll')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => remove(item.id)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 /> {t('queue.row.delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
