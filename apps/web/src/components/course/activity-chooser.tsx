/**
 * Maqsad: "Faoliyat yoki resurs qo'shish" oynasi — Moodle dagi activity
 * chooser ga o'xshash (F-04, F-05).
 *
 * Ro'yxatda FAQAT tizimda haqiqatan ishlaydigan turlar bor. Ishlamaydigan
 * elementni ko'rsatib, bosilganda "tez orada" deyish — foydalanuvchini
 * chalg'itish; §16 shuni taqiqlaydi.
 *
 * Ikki toifa Moodle dagidek ajratilgan:
 *  - FAOLIYAT — talaba biror ish bajaradi va u baholanadi yoki qayd etiladi;
 *  - RESURS — talaba faqat o'qiydi/ko'radi.
 */

'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Braces,
  ClipboardList,
  FileText,
  FileType2,
  Film,
  FolderOpen,
  Link2,
  ListChecks,
  type LucideIcon,
  MessageSquare,
  Music,
  Package,
  Paperclip,
  Search,
  Type,
  Video,
} from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui/primitives';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** Tanlangan element qanday harakatni boshlashini bildiradi. */
export type ChooserAction =
  | { type: 'lesson' }
  | { type: 'assignment' }
  | { type: 'quiz' }
  | { type: 'forum' }
  | { type: 'meeting' }
  | { type: 'resource'; kind: string; source: 'file' | 'files' | 'url' | 'text' };

interface ChooserItem {
  id: string;
  icon: LucideIcon;
  /** i18n kaliti — `activities.<id>` va `activities.<id>Hint`. */
  category: 'activity' | 'resource';
  action: ChooserAction;
  /** Moodle dagi mos element nomi — o'qituvchiga tanish bo'lsin. */
  moodle: string;
}

const ITEMS: ChooserItem[] = [
  // --- Faoliyatlar ---------------------------------------------------------
  {
    id: 'assignment',
    icon: ClipboardList,
    category: 'activity',
    action: { type: 'assignment' },
    moodle: 'Assignment',
  },
  { id: 'quiz', icon: ListChecks, category: 'activity', action: { type: 'quiz' }, moodle: 'Quiz' },
  {
    id: 'forum',
    icon: MessageSquare,
    category: 'activity',
    action: { type: 'forum' },
    moodle: 'Forum',
  },
  {
    id: 'meeting',
    icon: Video,
    category: 'activity',
    action: { type: 'meeting' },
    moodle: 'BigBlueButton',
  },
  {
    id: 'scorm',
    icon: Package,
    category: 'activity',
    action: { type: 'resource', kind: 'SCORM', source: 'file' },
    moodle: 'SCORM package',
  },
  {
    id: 'h5p',
    icon: Braces,
    category: 'activity',
    action: { type: 'resource', kind: 'H5P', source: 'url' },
    moodle: 'H5P',
  },

  // --- Resurslar -----------------------------------------------------------
  { id: 'page', icon: FileText, category: 'resource', action: { type: 'lesson' }, moodle: 'Page' },
  {
    id: 'file',
    icon: Paperclip,
    category: 'resource',
    action: { type: 'resource', kind: 'FILE', source: 'file' },
    moodle: 'File',
  },
  {
    id: 'folder',
    icon: FolderOpen,
    category: 'resource',
    action: { type: 'resource', kind: 'FOLDER', source: 'files' },
    moodle: 'Folder',
  },
  {
    id: 'url',
    icon: Link2,
    category: 'resource',
    action: { type: 'resource', kind: 'LINK', source: 'url' },
    moodle: 'URL',
  },
  {
    id: 'label',
    icon: Type,
    category: 'resource',
    action: { type: 'resource', kind: 'TEXT', source: 'text' },
    moodle: 'Label',
  },
  {
    id: 'embed',
    icon: Braces,
    category: 'resource',
    action: { type: 'resource', kind: 'EMBED', source: 'url' },
    moodle: 'Embedded content',
  },
  {
    id: 'video',
    icon: Film,
    category: 'resource',
    action: { type: 'resource', kind: 'VIDEO', source: 'file' },
    moodle: 'File (video)',
  },
  {
    id: 'audio',
    icon: Music,
    category: 'resource',
    action: { type: 'resource', kind: 'AUDIO', source: 'file' },
    moodle: 'File (audio)',
  },
  {
    id: 'pdf',
    icon: FileType2,
    category: 'resource',
    action: { type: 'resource', kind: 'PDF', source: 'file' },
    moodle: 'File (PDF)',
  },
];

export function ActivityChooser({
  open,
  onOpenChange,
  onSelect,
  /** Dars ichida ochilganda faqat resurslar ko'rsatiladi. */
  scope = 'topic',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (action: ChooserAction) => void;
  scope?: 'topic' | 'lesson';
}) {
  const t = useTranslations();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | 'activity' | 'resource'>('all');

  const available = useMemo(
    () =>
      // Dars ichida faoliyat yaratilmaydi: topshiriq va test MAVZUGA biriktiriladi
      scope === 'lesson' ? ITEMS.filter((item) => item.category === 'resource') : ITEMS,
    [scope],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return available.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!needle) return true;

      const name = t(`activities.${item.id}`).toLowerCase();
      const hint = t(`activities.${item.id}Hint`).toLowerCase();
      return (
        name.includes(needle) || hint.includes(needle) || item.moodle.toLowerCase().includes(needle)
      );
    });
  }, [available, category, query, t]);

  const tabs = [
    { id: 'all' as const, label: t('activities.all') },
    { id: 'activity' as const, label: t('activities.activities') },
    { id: 'resource' as const, label: t('activities.resources') },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('activities.chooserTitle')}</DialogTitle>
          <DialogDescription>{t('activities.chooserHint')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('activities.search')}
                aria-label={t('activities.search')}
                className="pl-9"
              />
            </div>

            {scope === 'topic' ? (
              <div role="tablist" className="flex gap-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={category === tab.id}
                    onClick={() => setCategory(tab.id)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm transition-colors',
                      category === tab.id
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('activities.nothingFound')}
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {visible.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(item.action);
                        onOpenChange(false);
                        setQuery('');
                      }}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-md border border-border p-3 text-left transition-colors',
                        'hover:border-primary/40 hover:bg-accent',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-md',
                          item.category === 'activity'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        <Icon className="size-5" aria-hidden="true" />
                      </span>

                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{t(`activities.${item.id}`)}</span>
                          <Badge variant={item.category === 'activity' ? 'default' : 'muted'}>
                            {item.category === 'activity'
                              ? t('activities.activity')
                              : t('activities.resource')}
                          </Badge>
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {t(`activities.${item.id}Hint`)}
                        </span>
                        <span // Shaffoflik ISHLATILMAYDI: u kichik matn kontrastini AA dan pastga tushiradi
                          className="mt-1 block font-mono text-[11px] uppercase tracking-wide text-muted-foreground"
                        >
                          Moodle: {item.moodle}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            {t('activities.coverageNote')}
          </p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/** Konstruktordagi "qo'shish" tugmasi — oynani ochadi. */
export function AddActivityButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button size="sm" variant="outline" onClick={onClick}>
      <Paperclip className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
