import type { Tone } from '@/components/ui';
import type { Dict } from './i18n';

/** Status vocabulary shared by the plan list, the plan page and the results table. */
export function planStatusTone(status: string): Tone {
  switch (status) {
    case 'applied':
      return 'allow';
    case 'partial':
      return 'warning';
    case 'failed':
      return 'critical';
    case 'executing':
      return 'info';
    case 'rolled-back':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function planStatusLabel(status: string, copy: Dict): string {
  switch (status) {
    case 'applied':
      return copy.changes.statusApplied;
    case 'partial':
      return copy.changes.statusPartial;
    case 'failed':
      return copy.changes.statusFailed;
    case 'executing':
      return copy.changes.statusExecuting;
    case 'rolled-back':
      return copy.changes.statusRolledBack;
    default:
      return copy.changes.statusDraft;
  }
}

export function opStatusTone(status: string): Tone {
  switch (status) {
    case 'applied':
      return 'allow';
    case 'skipped-noop':
      return 'neutral';
    case 'skipped-conflict':
      return 'warning';
    case 'failed':
      return 'critical';
    default:
      return 'warning';
  }
}

export function opStatusLabel(status: string, copy: Dict): string {
  switch (status) {
    case 'applied':
      return copy.changes.opApplied;
    case 'skipped-noop':
      return copy.changes.opSkippedNoop;
    case 'skipped-conflict':
      return copy.changes.opSkippedConflict;
    case 'failed':
      return copy.changes.opFailed;
    default:
      return copy.changes.opUnknown;
  }
}
