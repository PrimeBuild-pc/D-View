import type { SVGProps } from 'react';
import type { ChannelKind } from '@dpd/shared';

/**
 * Inline icons. A dependency would be more code than fourteen paths, and channel
 * types were previously emoji in a bare <span> with no accessible name.
 */
const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
});

export const IconHash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /></svg>
);
export const IconSpeaker = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M16 9a4 4 0 0 1 0 6" /><path d="M19 6a8 8 0 0 1 0 12" /></svg>
);
export const IconMegaphone = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m3 11 15-6v14L3 13Z" /><path d="M7 12v6a2 2 0 0 0 4 0v-4" /></svg>
);
export const IconFolder = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
);
export const IconForum = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z" /></svg>
);
export const IconImage = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m4 18 5-5 4 4 3-2 4 4" /></svg>
);
export const IconStage = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="8" r="3" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
);
export const IconQuestion = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.7-.8 1.2v.4" /><path d="M12 17h.01" /></svg>
);
export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m5 13 4 4L19 7" /></svg>
);
export const IconCross = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 6 18 18M18 6 6 18" /></svg>
);
export const IconDash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 12h12" /></svg>
);
export const IconShield = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3l7 3v6c0 4.4-3 8.2-7 9-4-.8-7-4.6-7-9V6Z" /></svg>
);
export const IconAlert = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 4 2.5 20h19Z" /><path d="M12 10v4M12 17h.01" /></svg>
);
export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const IconChevron = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m9 6 6 6-6 6" /></svg>
);
export const IconRefresh = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M20 11A8 8 0 0 0 6 6L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14 5l2-2" /><path d="M20 20v-4h-4" /></svg>
);
export const IconUser = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
);

export function ChannelIcon({ kind, ...props }: { kind: ChannelKind } & SVGProps<SVGSVGElement>) {
  switch (kind) {
    case 'category':
      return <IconFolder {...props} />;
    case 'voice':
      return <IconSpeaker {...props} />;
    case 'stage':
      return <IconStage {...props} />;
    case 'announcement':
      return <IconMegaphone {...props} />;
    case 'forum':
      return <IconForum {...props} />;
    case 'media':
      return <IconImage {...props} />;
    case 'unsupported':
      return <IconQuestion {...props} />;
    default:
      return <IconHash {...props} />;
  }
}
