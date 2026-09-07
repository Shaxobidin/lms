/**
 * Maqsad: forma boshqaruv elementlari — tanlash ro'yxati, kalit (switch),
 * ko'p tilli matn maydoni.
 *
 * Ko'p tilli maydon alohida ajratilgan, chunki u butun konstruktorda
 * takrorlanadi: modul, mavzu, dars va resurs nomlari 4 tilda kiritiladi (F-18).
 */

'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { LOCALES, type LocalizedText } from '@lms/shared';
import { cn } from '@/lib/utils';
import { Input, Label } from './primitives';

/** Oddiy `<select>` — mahalliy stil bilan. Radix Select bu yerda ortiqcha. */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'aria-[invalid=true]:border-destructive',
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

/** Yoqish/o'chirish kaliti — nashr holati kabi ikkilik sozlamalar uchun. */
export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-background shadow transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';

/** Kalit + yorliq juftligi. */
export function SwitchField({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/**
 * Ko'p tilli matn maydoni.
 *
 * Faqat asosiy til (`uz-Latn`) majburiy: qolganlari bo'sh qoldirilsa
 * `resolveLocalized` zaxira tilga tushadi. Shu sababli qo'shimcha tillar
 * yig'iladigan panelda turadi — forma uzun ko'rinmasin.
 */
export function LocalizedField({
  idPrefix,
  label,
  value,
  onChange,
  required = false,
  placeholder,
  moreLabel,
}: {
  idPrefix: string;
  label: string;
  value: LocalizedText;
  onChange: (next: LocalizedText) => void;
  required?: boolean;
  placeholder?: string;
  moreLabel: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [primary, ...rest] = LOCALES;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-${primary}`} required={required}>
        {label}
      </Label>
      <Input
        id={`${idPrefix}-${primary}`}
        value={value[primary] ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange({ ...value, [primary]: event.target.value })}
      />

      <button
        type="button"
        onClick={() => setExpanded((state) => !state)}
        aria-expanded={expanded}
        className="text-xs text-primary hover:underline"
      >
        {moreLabel} ({rest.length})
      </button>

      {expanded ? (
        <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3">
          {rest.map((locale) => (
            <div key={locale} className="flex items-center gap-2">
              <Label htmlFor={`${idPrefix}-${locale}`} className="w-16 shrink-0 text-xs uppercase">
                {locale}
              </Label>
              <Input
                id={`${idPrefix}-${locale}`}
                value={value[locale] ?? ''}
                onChange={(event) => onChange({ ...value, [locale]: event.target.value })}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
