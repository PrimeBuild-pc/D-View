'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui';
import { IconRefresh } from '@/components/icons';

export function SyncButton({ idle, pending }: { idle: string; pending: string }) {
  const { pending: isPending } = useFormStatus();
  return (
    <Button type="submit" tone="primary" disabled={isPending} className="w-full justify-center">
      <IconRefresh />
      {isPending ? pending : idle}
    </Button>
  );
}
