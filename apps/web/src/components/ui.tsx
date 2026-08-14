import type { ComponentProps, ReactNode } from 'react';

/**
 * Local UI primitives.
 *
 * The docs deferred extracting these "until duplication appears". It appeared:
 * the card shell was repeated eighteen times, the badge reimplemented inline in
 * four files, the primary button five times with inconsistent padding. They live
 * in the app rather than a `packages/ui` because there is exactly one consumer.
 */

export const cx = (...parts: unknown[]) => parts.filter((part) => typeof part === 'string' && part).join(' ');

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cx('rounded-xl border border-line bg-surface-raised', className)} {...props} />;
}

export function CardBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cx('p-4 sm:p-5', className)} {...props} />;
}

export function SectionTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cx('text-sm font-semibold tracking-wide text-ink-muted uppercase', className)} {...props} />;
}

type ButtonTone = 'primary' | 'default' | 'ghost' | 'danger';

const buttonTones: Record<ButtonTone, string> = {
  primary: 'bg-brand text-white hover:bg-brand-strong',
  default: 'border border-line-strong bg-surface-overlay text-ink hover:border-ink-faint',
  ghost: 'text-ink-muted hover:text-ink hover:bg-surface-overlay',
  danger: 'bg-critical text-[#3a1618] font-semibold hover:brightness-110',
};

export function Button({
  tone = 'default',
  className,
  ...props
}: ComponentProps<'button'> & { tone?: ButtonTone }) {
  return (
    <button
      className={cx(
        'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50',
        buttonTones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function LinkButton({
  tone = 'default',
  className,
  ...props
}: ComponentProps<'a'> & { tone?: ButtonTone }) {
  return (
    <a
      className={cx(
        'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition',
        buttonTones[tone],
        className,
      )}
      {...props}
    />
  );
}

export type Tone = 'allow' | 'deny' | 'inherit' | 'critical' | 'warning' | 'info' | 'neutral' | 'brand';

const badgeTones: Record<Tone, string> = {
  allow: 'bg-allow-dim text-allow',
  deny: 'bg-deny-dim text-deny',
  inherit: 'bg-inherit-dim text-inherit',
  critical: 'bg-critical-dim text-critical',
  warning: 'bg-warning-dim text-warning',
  info: 'bg-info-dim text-info',
  neutral: 'bg-surface-overlay text-ink-muted',
  brand: 'bg-brand/20 text-[#aab2ff]',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap',
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cx(
        'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cx('rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink', className)}
      {...props}
    />
  );
}

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
}) {
  const border: Record<string, string> = {
    critical: 'border-critical/40 bg-critical-dim',
    warning: 'border-warning/40 bg-warning-dim',
    info: 'border-info/40 bg-info-dim',
    allow: 'border-allow/40 bg-allow-dim',
    deny: 'border-deny/40 bg-deny-dim',
    neutral: 'border-line bg-surface-overlay',
    inherit: 'border-line bg-surface-overlay',
    brand: 'border-brand/40 bg-brand/10',
  };
  return (
    <div className={cx('rounded-lg border p-3 text-sm', border[tone])}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cx('text-ink-muted', title && 'mt-1')}>{children}</div> : null}
    </div>
  );
}

/** Every dead end in the old app was a bare <p>. An empty state always offers a way out. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardBody className="flex flex-col items-start gap-3 py-10 text-center sm:items-center">
        <p className="text-lg font-semibold text-ink">{title}</p>
        {description ? <p className="max-w-prose text-sm text-ink-muted">{description}</p> : null}
        {action}
      </CardBody>
    </Card>
  );
}

export function Stat({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: Tone }) {
  const accent = tone === 'critical' ? 'text-critical' : tone === 'warning' ? 'text-warning' : 'text-ink';
  return (
    <Card>
      <CardBody className="py-4">
        <p className="text-xs tracking-wide text-ink-faint uppercase">{label}</p>
        <p className={cx('mt-1 text-2xl font-semibold tabular-nums', accent)}>{value}</p>
      </CardBody>
    </Card>
  );
}
