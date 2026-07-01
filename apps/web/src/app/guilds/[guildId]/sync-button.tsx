'use client';

import { useFormStatus } from 'react-dom';

export function SyncButton({ idle, pending }: { idle: string; pending: string }) {
  const { pending: isPending } = useFormStatus();
  return (
    <button disabled={isPending} className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-70">
      {isPending ? pending : idle}
    </button>
  );
}
