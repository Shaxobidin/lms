/**
 * Maqsad: ilova qobig'i — rolga qarab dinamik yon panel, sarlavha, global qidiruv (§9).
 *
 * Yon paneldagi bandlar foydalanuvchi RUXSATLARIGA qarab ko'rsatiladi.
 * Bu backenddagi bilan bir xil `hasPermission` mantig'idan foydalanadi —
 * ya'ni UI hech qachon foydalanuvchi bajara olmaydigan amalni ko'rsatmaydi.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import {
  Award,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Library,
  Menu,
  MessageSquare,
  Moon,
  Search,
  Plug,
  Settings,
  Shield,
  Sun,
  Users,
  Video,
  X,
  SlidersHorizontal,
  ListChecks,
  RotateCcw,
  Route,
  IdCard,
  MessageSquareText,
  LifeBuoy,
} from 'lucide-react';
import type { PermissionKey } from '@lms/shared';
import {
  Link,
  usePathname,
  useRouter,
  LOCALE_LABELS,
  LOCALES,
  type AppLocale,
} from '@/i18n/routing';
import { useAuthStore } from '@/lib/auth-store';
import { usePublicSettings } from '@/lib/public-settings';
import { cn, initials } from '@/lib/utils';
import { Button, Spinner } from '@/components/ui/primitives';
import { NotificationBell } from './notification-bell';
import { GlobalSearch } from './global-search';

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  /** Shu ruxsatlardan biri bo'lsa band ko'rsatiladi. */
  permissions?: PermissionKey[];
  /** Ruxsat talab qilinmaydi (barcha autentifikatsiyadan o'tganlar uchun). */
  always?: boolean;
  /** Sayt boshqaruvidagi ochiq modul kaliti `false` bo'lsa band yashirinadi (F-17). */
  settingKey?: string;
  /** Faqat shu rollardan biriga ega foydalanuvchiga ko'rsatiladi (HEMIS "Talaba" bo'limi). */
  roles?: string[];
}

const NAV_GROUPS: Array<{ titleKey: string; items: NavItem[] }> = [
  {
    titleKey: 'nav.dashboard',
    items: [
      { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, always: true },
      {
        href: '/my-courses',
        labelKey: 'nav.myCourses',
        icon: GraduationCap,
        permissions: ['course:read:own'],
      },
      {
        href: '/courses',
        labelKey: 'nav.courses',
        icon: BookOpen,
        permissions: [
          'course:read:own_course',
          'course:read:own_department',
          'course:read:own_faculty',
          'course:read:all',
        ],
      },
      { href: '/schedule', labelKey: 'nav.schedule', icon: CalendarDays, always: true },
    ],
  },
  {
    // HEMIS uslubidagi "Talaba" bo'limi — faqat talabalarga
    titleKey: 'nav.student',
    items: [
      {
        href: '/student/electives',
        labelKey: 'nav.studentElectives',
        icon: ListChecks,
        roles: ['STUDENT'],
      },
      // "Mening fanlarim", "Dars jadvali", "Vazifalar" umumiy guruhlarda bor — takrorlanmaydi
      {
        href: '/student/retakes',
        labelKey: 'nav.studentRetakes',
        icon: RotateCcw,
        roles: ['STUDENT'],
      },
      {
        href: '/student/finals',
        labelKey: 'nav.studentFinals',
        icon: GraduationCap,
        roles: ['STUDENT'],
      },
      { href: '/student/plan', labelKey: 'nav.studentPlan', icon: Route, roles: ['STUDENT'] },
      { href: '/student/info', labelKey: 'nav.studentInfo', icon: IdCard, roles: ['STUDENT'] },
      {
        href: '/student/surveys',
        labelKey: 'nav.studentSurveys',
        icon: MessageSquareText,
        roles: ['STUDENT'],
        settingKey: 'feedback.enabled',
      },
      {
        href: '/student/services',
        labelKey: 'nav.studentServices',
        icon: LifeBuoy,
        roles: ['STUDENT'],
      },
    ],
  },
  {
    titleKey: 'nav.assignments',
    items: [
      {
        href: '/assignments',
        labelKey: 'nav.assignments',
        icon: ClipboardList,
        permissions: ['assignment:read:own', 'assignment:manage:own_course'],
      },
      {
        href: '/grades',
        labelKey: 'nav.grades',
        icon: CheckSquare,
        permissions: ['grade:read:own', 'grade:read:own_course', 'grade:read:own_faculty'],
      },
      {
        href: '/attendance',
        labelKey: 'nav.attendance',
        icon: CalendarDays,
        permissions: [
          'attendance:read:own',
          'attendance:read:own_course',
          'attendance:read:own_group',
        ],
      },
      {
        href: '/classroom',
        labelKey: 'nav.classroom',
        icon: Video,
        permissions: ['classroom:read:own', 'classroom:manage:own_course'],
      },
      {
        href: '/question-banks',
        labelKey: 'nav.questionBanks',
        icon: Library,
        permissions: ['questionbank:manage:own_course', 'questionbank:read:own_department'],
      },
    ],
  },
  {
    titleKey: 'nav.curriculum',
    items: [
      {
        href: '/curriculum',
        labelKey: 'nav.curriculum',
        icon: FileText,
        permissions: [
          'curriculum:read:own_faculty',
          'curriculum:read:own_department',
          'curriculum:read:all',
        ],
      },
      {
        href: '/structure',
        labelKey: 'nav.structure',
        icon: Building2,
        permissions: ['faculty:manage:all', 'department:read:own_faculty', 'group:read:own_group'],
      },
    ],
  },
  {
    titleKey: 'nav.analytics',
    items: [
      {
        href: '/analytics',
        labelKey: 'nav.analytics',
        icon: BarChart3,
        permissions: [
          'analytics:read:own',
          'analytics:read:own_course',
          'analytics:read:own_faculty',
          'analytics:read:all',
        ],
      },
      {
        href: '/documents',
        labelKey: 'nav.documents',
        icon: FileText,
        permissions: [
          'document:export:own_course',
          'document:create:own_faculty',
          'document:create:all',
        ],
      },
      {
        href: '/certificates',
        labelKey: 'nav.certificates',
        icon: Award,
        permissions: [
          'certificate:read:own',
          'certificate:read:own_faculty',
          'certificate:read:all',
        ],
      },
    ],
  },
  {
    titleKey: 'nav.messages',
    items: [
      {
        href: '/messages',
        labelKey: 'nav.messages',
        icon: MessageSquare,
        always: true,
        settingKey: 'messaging.enabled',
      },
      {
        href: '/achievements',
        labelKey: 'nav.achievements',
        icon: Award,
        permissions: ['badge:read:own'],
        settingKey: 'badges.enabled',
      },
    ],
  },
  {
    titleKey: 'nav.settings',
    items: [
      {
        href: '/admin/users',
        labelKey: 'nav.users',
        icon: Users,
        permissions: ['user:read:all', 'user:read:own_faculty', 'user:manage:all'],
      },
      {
        href: '/admin/audit',
        labelKey: 'nav.auditLog',
        icon: Shield,
        permissions: ['auditlog:read:all', 'auditlog:read:own_faculty'],
      },
      {
        href: '/admin/settings',
        labelKey: 'nav.settings',
        icon: Settings,
        permissions: ['system:read:all', 'system:manage:all'],
      },
      {
        href: '/admin/student-requests',
        labelKey: 'nav.studentRequests',
        icon: LifeBuoy,
        permissions: [
          'studentrequest:manage:all',
          'studentrequest:manage:own_faculty',
          'studentrequest:read:own_group',
        ],
      },
      {
        href: '/admin/surveys',
        labelKey: 'nav.surveys',
        icon: MessageSquareText,
        permissions: ['survey:manage:all', 'survey:manage:own_faculty'],
      },
      {
        href: '/admin/site',
        labelKey: 'nav.siteAdmin',
        icon: SlidersHorizontal,
        permissions: ['system:read:all', 'system:manage:all'],
      },
      {
        href: '/admin/lti',
        labelKey: 'nav.lti',
        icon: Plug,
        permissions: ['integration:read:all', 'integration:manage:all'],
      },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const { user, status, can, signOut } = useAuthStore();
  const siteSettings = usePublicSettings();

  // Autentifikatsiyadan o'tmagan foydalanuvchini login sahifasiga yo'naltiramiz
  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  // Global qidiruv: Ctrl+K / Cmd+K (§9)
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Sahifa almashganda mobil menyu yopiladi
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const visibleGroups = useMemo(() => {
    if (!user) return [];
    // Bir manzil bir nechta guruhda bo'lishi mumkin (masalan, "Dars jadvali" umumiy
    // va "Talaba" guruhida) — birinchi uchragani qoladi, takrorlar olib tashlanadi
    const seen = new Set<string>();
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const visible =
          (item.always ||
            (item.permissions ?? []).some((permission) => can(permission)) ||
            (item.roles ?? []).some((role) => user?.roles.includes(role as never))) &&
          (!item.settingKey || siteSettings.enabled(item.settingKey));
        if (!visible || seen.has(item.href)) return false;
        seen.add(item.href);
        return true;
      }),
    })).filter((group) => group.items.length > 0);
  }, [user, can]);

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status">
        <Spinner className="size-6 text-primary" />
        <span className="sr-only">{t('a11y.loading')}</span>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen">
      {/* Mobil menyu ortidagi qoplama */}
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-border bg-card transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label={t('nav.dashboard')}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <GraduationCap className="size-5 text-primary" aria-hidden="true" />
            <span>{siteSettings.get<string>('mobile.appTitle') || t('app.name')}</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label={t('a11y.closeMenu')}
          >
            <X />
          </Button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {visibleGroups.map((group) => (
            <div key={group.titleKey}>
              <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t(group.titleKey)}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                          active
                            ? 'bg-primary/10 font-medium text-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                        )}
                      >
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{t(item.labelKey)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2.5">
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary"
              aria-hidden="true"
            >
              {initials(user.fullName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {user.roles.map((role) => t(`roles.${role}`)).join(', ')}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start text-muted-foreground"
            onClick={() => {
              void signOut().then(() => router.replace('/login'));
            }}
          >
            {t('nav.logout')}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label={t('a11y.openMenu')}
          >
            <Menu />
          </Button>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-8 flex-1 max-w-sm items-center gap-2 rounded-md border border-input px-3 text-sm text-muted-foreground transition-colors hover:bg-accent"
          >
            <Search className="size-3.5" aria-hidden="true" />
            <span className="truncate">{t('common.searchPlaceholder')}</span>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

/** Til almashtirgich — joriy sahifada qoladi, faqat prefiks o'zgaradi. */
function LocaleSwitcher() {
  const t = useTranslations('a11y');
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('changeLanguage')}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="text-xs font-medium uppercase">UZ</span>
      </Button>

      {open ? (
        <ul
          role="menu"
          className="absolute right-0 top-10 z-30 w-40 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md"
        >
          {LOCALES.map((locale) => (
            <li key={locale} role="none">
              <button
                type="button"
                role="menuitem"
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  setOpen(false);
                  router.replace(pathname, { locale: locale as AppLocale });
                }}
              >
                {LOCALE_LABELS[locale]}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Mavzu almashtirgich (yorug' / qorong'i / tizim). */
function ThemeToggle() {
  const t = useTranslations('a11y');
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Gidratatsiya nomuvofiqligini oldini olish uchun
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="size-9" />;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={t('toggleTheme')}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
}

export { NAV_GROUPS };
