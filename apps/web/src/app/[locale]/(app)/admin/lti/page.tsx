/**
 * Maqsad: LTI 1.3 platformalarini ro'yxatga olish va tool manzillarini ko'rsatish (§10).
 *
 * Bizning LMS "tool" — tashqi platforma (Moodle, Canvas, ...) administratori
 * shu sahifadagi manzillarni o'z tizimiga kiritadi, bizning administrator esa
 * platformaning `issuer`, `client_id`, `deployment_id`, auth va JWKS manzillarini
 * bu yerga yozadi. Kalit manbasi: JWKS URL yoki qo'lda kiritilgan JWKS JSON.
 */

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  createLtiPlatformSchema,
  jwksSchema,
  updateLtiPlatformSchema,
  type CreateLtiPlatformInput,
} from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  FieldError,
  Input,
  Label,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui/primitives';
import { SwitchField } from '@/components/ui/form-controls';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface PlatformRow {
  id: string;
  name: string;
  issuer: string;
  clientId: string;
  deploymentId: string;
  authLoginUrl: string;
  authTokenUrl: string;
  jwksUrl: string | null;
  publicJwks: unknown;
  isActive: boolean;
  createdAt: string;
  _count: { userLinks: number };
}

interface PlatformsResponse {
  tool: {
    loginUrl: string;
    launchUrl: string;
    jwksUrl: string;
    keyId: string;
    customParameters: Record<string, string>;
  };
  platforms: PlatformRow[];
}

export default function LtiPlatformsPage() {
  const t = useTranslations();
  const can = useAuthStore((state) => state.can);
  const canManage = can('integration:manage:all');
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<PlatformRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<PlatformRow | null>(null);

  const platforms = useQuery({
    queryKey: ['lti-platforms'],
    queryFn: async () => (await api.get<PlatformsResponse>('/lti/platforms')).data,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/lti/platforms/${id}`),
    onSuccess: () => {
      toast.success(t('common.deleted'));
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['lti-platforms'] });
    },
    onError: () => toast.error(t('common.somethingWentWrong')),
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('lti.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('lti.subtitle')}</p>
        </div>
        {canManage ? (
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            {t('lti.addPlatform')}
          </Button>
        ) : null}
      </header>

      {platforms.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-32" />
        </div>
      ) : platforms.isError ? (
        <ErrorState
          title={t('common.somethingWentWrong')}
          onRetry={() => void platforms.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : platforms.data ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-4 text-primary" aria-hidden="true" />
                {t('lti.toolEndpoints')}
              </CardTitle>
              <CardDescription>{t('lti.toolEndpointsHint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <EndpointRow label={t('lti.loginUrl')} value={platforms.data.tool.loginUrl} />
              <EndpointRow label={t('lti.launchUrl')} value={platforms.data.tool.launchUrl} />
              <EndpointRow label={t('lti.jwksUrl')} value={platforms.data.tool.jwksUrl} />
              <EndpointRow label={t('lti.keyId')} value={platforms.data.tool.keyId} />
              <p className="pt-1 text-xs text-muted-foreground">{t('lti.customParamHint')}</p>
            </CardContent>
          </Card>

          {platforms.data.platforms.length === 0 ? (
            <EmptyState
              icon={<KeyRound className="size-8" />}
              title={t('lti.noPlatforms')}
              description={t('lti.noPlatformsHint')}
              action={
                canManage ? (
                  <Button onClick={() => setEditing('new')}>{t('lti.addPlatform')}</Button>
                ) : undefined
              }
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{t('lti.platforms')}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.name')}</TableHead>
                      <TableHead>{t('lti.issuer')}</TableHead>
                      <TableHead>{t('lti.clientId')}</TableHead>
                      <TableHead>{t('lti.deploymentId')}</TableHead>
                      <TableHead>{t('lti.keySource')}</TableHead>
                      <TableHead>{t('lti.linkedUsers')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      {canManage ? <TableHead /> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {platforms.data.platforms.map((platform) => (
                      <TableRow key={platform.id}>
                        <TableCell className="font-medium">{platform.name}</TableCell>
                        <TableCell className="max-w-56 truncate" title={platform.issuer}>
                          {platform.issuer}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{platform.clientId}</TableCell>
                        <TableCell className="font-mono text-xs">{platform.deploymentId}</TableCell>
                        <TableCell>
                          {platform.jwksUrl ? (
                            <Badge variant="outline">JWKS URL</Badge>
                          ) : (
                            <Badge variant="muted">{t('lti.manualKeys')}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">{platform._count.userLinks}</TableCell>
                        <TableCell>
                          <Badge variant={platform.isActive ? 'success' : 'muted'}>
                            {platform.isActive ? t('common.active') : t('common.inactive')}
                          </Badge>
                        </TableCell>
                        {canManage ? (
                          <TableCell className="whitespace-nowrap text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              aria-label={`${t('common.edit')}: ${platform.name}`}
                              onClick={() => setEditing(platform)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              aria-label={`${t('common.delete')}: ${platform.name}`}
                              onClick={() => setDeleting(platform)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}

      {editing ? (
        <PlatformDialog
          platform={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: ['lti-platforms'] })}
        />
      ) : null}

      {deleting ? (
        <Dialog open onOpenChange={(open) => !open && setDeleting(null)}>
          <DialogContent closeLabel={t('common.close')}>
            <DialogHeader>
              <DialogTitle>{t('lti.deletePlatform')}</DialogTitle>
              <DialogDescription>
                {t('lti.deletePlatformWarning', {
                  name: deleting.name,
                  users: deleting._count.userLinks,
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleting(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                loading={remove.isPending}
                onClick={() => remove.mutate(deleting.id)}
              >
                {t('lti.deletePlatformConfirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function EndpointRow({ label, value }: { label: string; value: string }) {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{value}</code>
      <Button
        size="icon"
        variant="ghost"
        className="size-8"
        aria-label={`${t('common.copy')}: ${label}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(
            () => toast.success(t('common.copied')),
            () => toast.error(t('common.somethingWentWrong')),
          );
        }}
      >
        <Copy className="size-4" />
      </Button>
    </div>
  );
}

// --- Platforma oynasi -----------------------------------------------------------

interface PlatformForm {
  name: string;
  issuer: string;
  clientId: string;
  deploymentId: string;
  authLoginUrl: string;
  authTokenUrl: string;
  jwksUrl: string;
  publicJwks: string;
  isActive: boolean;
}

function PlatformDialog({
  platform,
  onClose,
  onSaved,
}: {
  platform: PlatformRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const [form, setForm] = useState<PlatformForm>({
    name: platform?.name ?? '',
    issuer: platform?.issuer ?? '',
    clientId: platform?.clientId ?? '',
    deploymentId: platform?.deploymentId ?? '',
    authLoginUrl: platform?.authLoginUrl ?? '',
    authTokenUrl: platform?.authTokenUrl ?? '',
    jwksUrl: platform?.jwksUrl ?? '',
    publicJwks: platform?.publicJwks ? JSON.stringify(platform.publicJwks, null, 2) : '',
    isActive: platform?.isActive ?? true,
  });
  const [serverError, setServerError] = useState<string | null>(null);

  const update = (patch: Partial<PlatformForm>) => setForm((current) => ({ ...current, ...patch }));

  /** JWKS JSON bo'sh, yaroqli yoki xato — xato bo'lsa saqlash bloklanadi. */
  const jwksState = (() => {
    if (!form.publicJwks.trim()) return { value: null, error: null };
    try {
      const parsed = jwksSchema.safeParse(JSON.parse(form.publicJwks));
      return parsed.success
        ? { value: parsed.data, error: null }
        : { value: null, error: 'invalid' };
    } catch {
      return { value: null, error: 'invalid' };
    }
  })();

  const candidate = {
    name: form.name,
    issuer: form.issuer,
    clientId: form.clientId,
    deploymentId: form.deploymentId,
    authLoginUrl: form.authLoginUrl,
    authTokenUrl: form.authTokenUrl,
    jwksUrl: form.jwksUrl.trim() ? form.jwksUrl.trim() : null,
    publicJwks: jwksState.value,
    isActive: form.isActive,
  };
  const validation = (platform ? updateLtiPlatformSchema : createLtiPlatformSchema).safeParse(
    candidate,
  );
  const needsKeySource = !candidate.jwksUrl && !candidate.publicJwks;
  const canSubmit = validation.success && !jwksState.error && !needsKeySource;

  const save = useMutation({
    mutationFn: async () => {
      const body = candidate as CreateLtiPlatformInput;
      return platform
        ? api.patch(`/lti/platforms/${platform.id}`, body)
        : api.post('/lti/platforms', body);
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      onSaved();
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.messageKey === 'errors.lti_platform_exists') {
        setServerError(t('errors.lti_platform_exists'));
        return;
      }
      setServerError(t('common.somethingWentWrong'));
    },
  });

  const field = (
    key: keyof Omit<PlatformForm, 'isActive' | 'publicJwks'>,
    label: string,
    placeholder?: string,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`lti-${key}`} required>
        {label}
      </Label>
      <Input
        id={`lti-${key}`}
        value={form[key]}
        placeholder={placeholder}
        onChange={(event) => update({ [key]: event.target.value } as Partial<PlatformForm>)}
      />
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{platform ? t('lti.editPlatform') : t('lti.addPlatform')}</DialogTitle>
          <DialogDescription>{t('lti.platformHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {serverError ? <Alert variant="destructive">{serverError}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {field('name', t('common.name'), 'Moodle QDU')}
            {field('issuer', t('lti.issuer'), 'https://moodle.example.uz')}
            {field('clientId', t('lti.clientId'))}
            {field('deploymentId', t('lti.deploymentId'), '1')}
            {field(
              'authLoginUrl',
              t('lti.authLoginUrl'),
              'https://moodle.example.uz/mod/lti/auth.php',
            )}
            {field(
              'authTokenUrl',
              t('lti.authTokenUrl'),
              'https://moodle.example.uz/mod/lti/token.php',
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lti-jwksUrl">{t('lti.jwksUrl')}</Label>
            <Input
              id="lti-jwksUrl"
              value={form.jwksUrl}
              placeholder="https://moodle.example.uz/mod/lti/certs.php"
              onChange={(event) => update({ jwksUrl: event.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lti-publicJwks">{t('lti.publicJwks')}</Label>
            <Textarea
              id="lti-publicJwks"
              rows={4}
              value={form.publicJwks}
              placeholder='{"keys":[{"kty":"RSA","kid":"...","n":"...","e":"AQAB"}]}'
              className="font-mono text-xs"
              onChange={(event) => update({ publicJwks: event.target.value })}
            />
            <FieldError
              id="lti-publicJwks-error"
              message={
                jwksState.error
                  ? t('lti.jwksInvalid')
                  : needsKeySource
                    ? t('validation.lti_key_source_required')
                    : undefined
              }
            />
          </div>

          <SwitchField
            id="lti-active"
            label={t('common.active')}
            description={t('lti.activeHint')}
            checked={form.isActive}
            onCheckedChange={(checked) => update({ isActive: checked })}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={!canSubmit} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
