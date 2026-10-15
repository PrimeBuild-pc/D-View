import { LinkButton, EmptyState } from '@/components/ui';
import { t } from '@/lib/i18n';
import { resolveLang } from '@/lib/i18n/server';

export default async function NotFound() {
  const copy = t(await resolveLang());
  return (
    <EmptyState
      title={copy.common.notFound}
      description={copy.common.pageNotFound}
      action={<LinkButton href="/guilds" tone="primary">{copy.nav.servers}</LinkButton>}
    />
  );
}
