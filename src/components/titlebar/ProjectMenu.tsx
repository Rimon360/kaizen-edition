import { FilePlus2, FolderOpen, Save, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useProject } from '@/features/project/useProject'
import { useT } from '@/i18n'
import { useProjectStore } from '@/store/projectStore'
import { cn } from '@/utils/cn'

export function ProjectMenu() {
  const t = useT()
  const { newProject, saveProject, openProject } = useProject()
  const name = useProjectStore((s) => s.name)
  const path = useProjectStore((s) => s.path)
  // A project bound to a file path is persisted on disk; an untitled / in-memory
  // project is not. The dot glows cyan when saved, dims when not yet on disk.
  const saved = !!path

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="no-drag group flex h-7 items-center gap-1.5 rounded-[var(--radius)] border border-[var(--neon-1)]/20 bg-white/[0.04] px-2.5 text-xs text-foreground/70 transition-colors hover:border-[var(--neon-1)]/45 hover:bg-white/[0.07] hover:text-foreground data-[state=open]:border-[var(--neon-1)]/55 data-[state=open]:text-foreground">
          <span
            aria-hidden
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full transition-colors',
              saved
                ? 'glow [--glow:var(--neon-1)] [--glow-opacity:0.7] bg-[var(--neon-1)]'
                : 'bg-foreground/25',
            )}
          />
          <span className="max-w-[160px] truncate" title={name || t('titlebar.untitledProject')}>
            {name || t('titlebar.untitledProject')}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onClick={newProject}>
          <FilePlus2 className="text-muted-foreground" />
          {t('titlebar.project.new')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={openProject}>
          <FolderOpen className="text-muted-foreground" />
          {t('titlebar.project.open')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={saveProject}>
          <Save className="text-muted-foreground" />
          {t('titlebar.project.save')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
