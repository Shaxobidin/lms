/**
 * Maqsad: Moodle sozlamalar formasi uslubidagi yig'iladigan bo'limlar
 * ("Umumiy", "Vaqt", "Baho", ...) — bitta "Hammasini ochish/yopish" bilan.
 *
 * Uzun formani bo'limlarga ajratish o'qituvchiga kerakli sozlamani tez topish
 * imkonini beradi; birinchi bo'lim ochiq keladi, qolganlari yig'ilgan.
 */

'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SettingsSection {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function SettingsSections({
  sections,
  expandAllLabel,
  collapseAllLabel,
  defaultOpen = [sections[0]?.id ?? ''],
}: {
  sections: SettingsSection[];
  expandAllLabel: string;
  collapseAllLabel: string;
  defaultOpen?: string[];
}) {
  const [open, setOpen] = useState<Set<string>>(new Set(defaultOpen));
  const allOpen = sections.every((section) => open.has(section.id));

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() =>
            setOpen(allOpen ? new Set() : new Set(sections.map((section) => section.id)))
          }
        >
          {allOpen ? collapseAllLabel : expandAllLabel}
        </button>
      </div>
      {sections.map((section) => {
        const isOpen = open.has(section.id);
        return (
          <section key={section.id} className="rounded-md border border-border">
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`settings-${section.id}`}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
              onClick={() =>
                setOpen((state) => {
                  const next = new Set(state);
                  if (next.has(section.id)) next.delete(section.id);
                  else next.add(section.id);
                  return next;
                })
              }
            >
              <span>
                <span className="font-medium">{section.title}</span>
                {section.description ? (
                  <span className="block text-xs text-muted-foreground">{section.description}</span>
                ) : null}
              </span>
              <ChevronDown
                className={cn('size-4 shrink-0 transition-transform', isOpen && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
            {isOpen ? (
              <div id={`settings-${section.id}`} className="space-y-4 border-t border-border p-4">
                {section.children}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
