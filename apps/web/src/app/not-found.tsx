import { LinkButton, EmptyState } from '@/components/ui';

export default function NotFound() {
  return (
    <EmptyState
      title="Not found"
      description="That page does not exist."
      action={<LinkButton href="/guilds" tone="primary">Servers</LinkButton>}
    />
  );
}
