/**
 * Maqsad: Moodle "Sayt boshqaruvi" (Site administration) uslubidagi sozlamalar
 * daraxti (F-17). Chap tomonda toifa → bo'lim daraxti, o'ngda bo'lim formasi.
 *
 * Forma `@lms/shared` dagi deklarativ reestrdan chiziladi — har bir maydon
 * turi (`boolean`, `number`, `select`, `multiselect`, `list`, `json`, ...) o'z
 * boshqaruv elementiga ega. Saqlash `PUT /admin/site/:section` ga boradi;
 * server o'sha reestr sxemasi bilan tekshiradi.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, ChevronRight, ExternalLink, Search, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  LOCALES,
  BADGE_RULE_TYPES,
  siteSectionSchema,
  type LocalizedText,
  type SiteSettingCategory,
  type SiteSettingField,
  type SiteSettingSection,
} from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { cn, localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Skeleton,
  Textarea,
} from '@/components/ui/primitives';
import { Select, SwitchField } from '@/components/ui/form-controls';

interface SiteTreeResponse {
  tree: SiteSettingCategory[];
  values: Record<string, unknown>;
  updatedAt: Record<string, string>;
}

interface SystemStats {
  users: number;
  courses: number;
  submissions: number;
  quizAttempts: number;
  files: { count: number; totalBytes: string };
  auditEntries: number;
}

interface FlagRow {
  key: string;
  enabled: boolean;
  description: string | null;
}

interface BadgeRow {
  id: string;
  code: string;
  name: LocalizedText;
  description: LocalizedText;
  icon: string;
  rule: { type: string; threshold: number };
}

const text = (value: LocalizedText | undefined, locale: AppLocale) =>
  value ? localize(value, locale, '') : '';

export default function SiteAdminPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string>('site-info');
  const [filter, setFilter] = useState('');

  const tree = useQuery({
    queryKey: ['admin-site'],
    queryFn: async () => (await api.get<SiteTreeResponse>('/admin/site')).data,
  });

  const sections = useMemo(() => {
    const rows: Array<{ category: SiteSettingCategory; section: SiteSettingSection }> = [];
    for (const category of tree.data?.tree ?? [])
      for (const section of category.sections) rows.push({ category, section });
    return rows;
  }, [tree.data]);

  const current = sections.find((row) => row.section.id === selected);
  const needle = filter.trim().toLowerCase();
  const matches = (section: SiteSettingSection) =>
    !needle ||
    text(section.label, locale).toLowerCase().includes(needle) ||
    section.fields.some((field) => text(field.label, locale).toLowerCase().includes(needle));

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Settings2 className="size-6" aria-hidden="true" />
          {t('siteAdmin.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('siteAdmin.subtitle')}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        {/* --- Daraxt ------------------------------------------------------ */}
        {/* Daraxt uzun (38 bo'lim): katta ekranda yopishqoq va o'zi aylanadi — sahifa cho'zilmaydi */}
        <nav
          aria-label={t('siteAdmin.tree')}
          className="space-y-2 lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:pr-1"
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="site-admin-search"
              className="pl-8"
              placeholder={t('siteAdmin.searchPlaceholder')}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label={t('siteAdmin.searchPlaceholder')}
            />
          </div>
          {tree.isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <ul className="space-y-1 rounded-md border border-border bg-card p-2 text-sm">
              {(tree.data?.tree ?? []).map((category) => {
                const visible = category.sections.filter(matches);
                if (visible.length === 0) return null;
                return (
                  <li key={category.id}>
                    <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {text(category.label, locale)}
                    </p>
                    <ul>
                      {visible.map((section) => (
                        <li key={section.id}>
                          <button
                            type="button"
                            onClick={() => setSelected(section.id)}
                            aria-current={selected === section.id ? 'page' : undefined}
                            className={cn(
                              'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-accent',
                              selected === section.id && 'bg-primary/10 font-medium text-primary',
                            )}
                          >
                            <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{text(section.label, locale)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {/* --- Bo'lim ------------------------------------------------------ */}
        <main>
          {tree.isLoading || !tree.data ? (
            <Skeleton className="h-96 w-full" />
          ) : current ? (
            <SectionPanel
              key={current.section.id}
              category={current.category}
              section={current.section}
              values={tree.data.values}
              updatedAt={tree.data.updatedAt}
              locale={locale}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ['admin-site'] })}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}

// --- Bo'lim paneli ---------------------------------------------------------------

function SectionPanel({
  category,
  section,
  values,
  updatedAt,
  locale,
  onSaved,
}: {
  category: SiteSettingCategory;
  section: SiteSettingSection;
  values: Record<string, unknown>;
  updatedAt: Record<string, string>;
  locale: AppLocale;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const initial = useMemo(
    () => Object.fromEntries(section.fields.map((field) => [field.key, values[field.key]])),
    [section, values],
  );
  const [draft, setDraft] = useState<Record<string, unknown>>(initial);
  const [issue, setIssue] = useState<string | null>(null);
  useEffect(() => setDraft(initial), [initial]);

  const dirty = section.fields.some(
    (field) => JSON.stringify(draft[field.key]) !== JSON.stringify(initial[field.key]),
  );

  const save = useMutation({
    mutationFn: async () => {
      const changed: Record<string, unknown> = {};
      for (const field of section.fields) {
        if (field.readonly) continue;
        if (JSON.stringify(draft[field.key]) !== JSON.stringify(initial[field.key])) {
          changed[field.key] = draft[field.key];
        }
      }
      const parsed = siteSectionSchema(section).safeParse(changed);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        throw new Error(
          first?.message.startsWith('validation.') ? first.message : 'validation.invalid',
        );
      }
      return api.put(`/admin/site/${section.id}`, parsed.data);
    },
    onSuccess: () => {
      setIssue(null);
      toast.success(t('common.saved'));
      onSaved();
    },
    onError: (error: unknown) => {
      const key =
        error instanceof ApiClientError
          ? error.translationKey
          : error instanceof Error && error.message.startsWith('validation.')
            ? error.message
            : 'errors.internal';
      setIssue(key);
      toast.error(t(key));
    },
  });

  const lastUpdated = section.fields
    .map((field) => updatedAt[field.key])
    .filter(Boolean)
    .sort()
    .pop();

  return (
    <Card>
      <CardHeader>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {text(category.label, locale)}
        </p>
        <CardTitle>{text(section.label, locale)}</CardTitle>
        {section.description ? (
          <CardDescription>{text(section.description, locale)}</CardDescription>
        ) : null}
        {section.note ? (
          <div className="mt-2">
            <Alert variant="default">{text(section.note, locale)}</Alert>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-5">
        {section.widget === 'stats' ? <StatsWidget /> : null}
        {section.widget === 'feature-flags' ? <FeatureFlagsWidget /> : null}
        {section.widget === 'badges' ? <BadgesWidget locale={locale} /> : null}
        {section.widget === 'language-packs' ? <LanguagePacksWidget /> : null}

        {section.fields.length > 0 ? (
          <div className="space-y-4">
            {section.fields.map((field) => (
              <FieldControl
                key={field.key}
                field={field}
                locale={locale}
                value={draft[field.key]}
                onChange={(value) => setDraft((state) => ({ ...state, [field.key]: value }))}
              />
            ))}
          </div>
        ) : null}

        {section.links?.length ? (
          <div className="flex flex-wrap gap-2">
            {section.links.map((link) => (
              <Button key={link.href} asChild size="sm" variant="outline">
                <Link href={link.href as '/'}>
                  <ExternalLink className="size-4" aria-hidden="true" />
                  {text(link.label, locale)}
                </Link>
              </Button>
            ))}
          </div>
        ) : null}

        {issue ? (
          <p role="alert" className="text-sm text-destructive">
            {t(issue)}
          </p>
        ) : null}

        {section.fields.some((field) => !field.readonly) ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">
              {lastUpdated
                ? t('siteAdmin.lastUpdated', { date: new Date(lastUpdated).toLocaleString(locale) })
                : t('siteAdmin.defaultsInUse')}
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                disabled={!dirty || save.isPending}
                onClick={() => setDraft(initial)}
              >
                {t('common.cancel')}
              </Button>
              <Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// --- Maydon boshqaruvi ---------------------------------------------------------

function FieldControl({
  field,
  locale,
  value,
  onChange,
}: {
  field: SiteSettingField;
  locale: AppLocale;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const t = useTranslations();
  const id = `site-${field.key.replace(/\./g, '-')}`;
  const label = text(field.label, locale);
  const hint = field.hint ? text(field.hint, locale) : undefined;

  if (field.type === 'boolean') {
    return (
      <SwitchField
        id={id}
        label={label}
        description={hint}
        checked={Boolean(value)}
        onCheckedChange={(checked) => onChange(checked)}
      />
    );
  }

  const control = (() => {
    switch (field.type) {
      case 'number':
        return (
          <Input
            id={id}
            type="number"
            min={field.min}
            max={field.max}
            step="any"
            className="max-w-48"
            disabled={field.readonly}
            value={typeof value === 'number' ? value : ''}
            onChange={(event) =>
              onChange(event.target.value === '' ? field.default : Number(event.target.value))
            }
          />
        );
      case 'text':
        return (
          <Textarea
            id={id}
            rows={4}
            disabled={field.readonly}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          />
        );
      case 'color':
        return (
          <div className="flex items-center gap-2">
            <input
              id={id}
              type="color"
              className="h-9 w-12 cursor-pointer rounded border border-border bg-background"
              value={typeof value === 'string' ? value : '#000000'}
              onChange={(event) => onChange(event.target.value)}
            />
            <Input
              aria-label={label}
              className="max-w-36 font-mono"
              value={typeof value === 'string' ? value : ''}
              onChange={(event) => onChange(event.target.value)}
            />
          </div>
        );
      case 'select':
        return (
          <Select
            id={id}
            className="max-w-sm"
            disabled={field.readonly}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          >
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {text(option.label, locale)}
              </option>
            ))}
          </Select>
        );
      case 'multiselect': {
        const selected = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div id={id} role="group" aria-label={label} className="grid gap-1.5 sm:grid-cols-2">
            {(field.options ?? []).map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  className="size-4"
                  checked={selected.includes(option.value)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...selected, option.value]
                        : selected.filter((item) => item !== option.value),
                    )
                  }
                />
                {text(option.label, locale)}
              </label>
            ))}
          </div>
        );
      }
      case 'list':
        return (
          <Textarea
            id={id}
            rows={3}
            placeholder={t('siteAdmin.listPlaceholder')}
            value={Array.isArray(value) ? (value as string[]).join('\n') : ''}
            onChange={(event) =>
              onChange(
                event.target.value
                  .split(/[\n,]/)
                  .map((item) => item.trim())
                  .filter(Boolean),
              )
            }
          />
        );
      case 'json':
        return (
          <JsonField
            id={id}
            value={value}
            onChange={onChange}
            invalidLabel={t('siteAdmin.invalidJson')}
          />
        );
      case 'string':
      default:
        return (
          <Input
            id={id}
            disabled={field.readonly}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          />
        );
    }
  })();

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {field.readonly ? (
          <Badge variant="muted" className="ml-2">
            {t('siteAdmin.readonly')}
          </Badge>
        ) : null}
      </Label>
      {control}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** JSON maydoni: matn tahrirlanadi, yaroqli bo'lganda obyekt sifatida yuboriladi. */
function JsonField({
  id,
  value,
  onChange,
  invalidLabel,
}: {
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
  invalidLabel: string;
}) {
  const [raw, setRaw] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [invalid, setInvalid] = useState(false);
  return (
    <div className="space-y-1">
      <Textarea
        id={id}
        rows={8}
        className="font-mono text-xs"
        value={raw}
        aria-invalid={invalid}
        onChange={(event) => {
          setRaw(event.target.value);
          try {
            const parsed = JSON.parse(event.target.value) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              setInvalid(false);
              onChange(parsed);
            } else setInvalid(true);
          } catch {
            setInvalid(true);
          }
        }}
      />
      {invalid ? <p className="text-xs text-destructive">{invalidLabel}</p> : null}
    </div>
  );
}

// --- Vidjetlar -------------------------------------------------------------------

function StatsWidget() {
  const t = useTranslations();
  const stats = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => (await api.get<SystemStats>('/admin/stats')).data,
  });
  if (!stats.data) return <Skeleton className="h-20 w-full" />;
  const rows: Array<[string, number | string]> = [
    [t('nav.users'), stats.data.users],
    [t('nav.courses'), stats.data.courses],
    [t('assignments.submissions'), stats.data.submissions],
    [t('quizzes.attempts'), stats.data.quizAttempts],
    [t('admin.auditLog'), stats.data.auditEntries],
    [
      t('siteAdmin.files'),
      `${stats.data.files.count} · ${(Number(stats.data.files.totalBytes) / 1_048_576).toFixed(1)} MB`,
    ],
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-md border border-border p-3">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-lg font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function FeatureFlagsWidget() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const flags = useQuery({
    queryKey: ['admin-feature-flags'],
    queryFn: async () => (await api.get<FlagRow[]>('/admin/feature-flags')).data,
  });
  const toggle = useMutation({
    mutationFn: async (input: { key: string; enabled: boolean }) =>
      api.patch(`/admin/feature-flags/${input.key}`, { enabled: input.enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-feature-flags'] }),
    onError: (error: unknown) =>
      toast.error(error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal')),
  });
  if (!flags.data) return <Skeleton className="h-20 w-full" />;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t('admin.featureFlags')}</p>
      {flags.data.map((flag) => (
        <SwitchField
          key={flag.key}
          id={`flag-${flag.key}`}
          label={flag.key}
          description={flag.description ?? undefined}
          checked={flag.enabled}
          onCheckedChange={(enabled) => toggle.mutate({ key: flag.key, enabled })}
        />
      ))}
    </div>
  );
}

function BadgesWidget({ locale }: { locale: AppLocale }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const badges = useQuery({
    queryKey: ['admin-badges'],
    queryFn: async () => (await api.get<BadgeRow[]>('/gamification/badges')).data,
  });
  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
    icon: 'award',
    ruleType: BADGE_RULE_TYPES[0] as string,
    threshold: 1,
  });
  const create = useMutation({
    mutationFn: async () =>
      api.post('/gamification/badges', {
        code: form.code.trim().toUpperCase(),
        name: { 'uz-Latn': form.name.trim() },
        description: { 'uz-Latn': form.description.trim() || form.name.trim() },
        icon: form.icon.trim() || 'award',
        rule: { type: form.ruleType, threshold: form.threshold },
      }),
    onSuccess: () => {
      toast.success(t('siteAdmin.badgeCreated'));
      setForm({
        code: '',
        name: '',
        description: '',
        icon: 'award',
        ruleType: BADGE_RULE_TYPES[0],
        threshold: 1,
      });
      void queryClient.invalidateQueries({ queryKey: ['admin-badges'] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal')),
  });

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border rounded-md border border-border">
        {(badges.data ?? []).map((badge) => (
          <li key={badge.id} className="flex items-center gap-3 p-3 text-sm">
            <Award className="size-5 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{localize(badge.name, locale, badge.code)}</p>
              <p className="truncate text-xs text-muted-foreground">
                {badge.code} · {badge.rule.type} ≥ {badge.rule.threshold}
              </p>
            </div>
          </li>
        ))}
        {badges.data && badges.data.length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">{t('siteAdmin.noBadges')}</li>
        ) : null}
      </ul>

      <div className="space-y-3 rounded-md border border-dashed border-border p-3">
        <p className="text-sm font-medium">{t('siteAdmin.addBadge')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="badge-code" required>
              {t('siteAdmin.badgeCode')}
            </Label>
            <Input
              id="badge-code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="badge-name" required>
              {t('common.title')}
            </Label>
            <Input
              id="badge-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="badge-description">{t('common.description')}</Label>
            <Input
              id="badge-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="badge-rule">{t('siteAdmin.badgeRule')}</Label>
            <Select
              id="badge-rule"
              value={form.ruleType}
              onChange={(e) => setForm({ ...form, ruleType: e.target.value })}
            >
              {BADGE_RULE_TYPES.map((rule) => (
                <option key={rule} value={rule}>
                  {rule}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="badge-threshold">{t('siteAdmin.badgeThreshold')}</Label>
            <Input
              id="badge-threshold"
              type="number"
              min={1}
              value={form.threshold}
              onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })}
            />
          </div>
        </div>
        <Button
          size="sm"
          loading={create.isPending}
          disabled={form.code.trim().length < 2 || form.name.trim().length < 2}
          onClick={() => create.mutate()}
        >
          {t('common.add')}
        </Button>
      </div>
    </div>
  );
}

function LanguagePacksWidget() {
  const t = useTranslations();
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {LOCALES.map((code) => (
        <li
          key={code}
          className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
        >
          <span className="font-medium">{code}</span>
          <Badge variant="success">{t('siteAdmin.packComplete')}</Badge>
        </li>
      ))}
    </ul>
  );
}
