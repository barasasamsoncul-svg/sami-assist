import {
  getSaMiAppIcon,
} from '@/lib/apps/icon-registry';

import {
  getSaMiAppVisual,
} from '@/lib/apps/visual-registry';

type Props = {
  appKey:
    string;
  category?:
    string | null;
  iconKey?:
    string | null;
  size?:
    'sm' |
    'md' |
    'lg' |
    'xl';
  className?:
    string;
};

const SIZE_CLASSES = {
  sm: {
    box: 'h-7 w-7 rounded-lg',
    icon: 'h-3.5 w-3.5',
  },
  md: {
    box: 'h-10 w-10 rounded-xl',
    icon: 'h-[18px] w-[18px]',
  },
  lg: {
    box: 'h-12 w-12 rounded-2xl',
    icon: 'h-5 w-5',
  },
  xl: {
    box: 'h-14 w-14 rounded-[18px]',
    icon: 'h-6 w-6',
  },
} as const;

export default function SamiAppIconTile({
  appKey,
  category,
  iconKey,
  size =
    'md',
  className =
    '',
}: Props) {
  const Icon =
    getSaMiAppIcon(
      iconKey ||
      appKey,
    );

  const visual =
    getSaMiAppVisual(
      appKey,
      category,
    );

  const sizing =
    SIZE_CLASSES[
      size
    ];

  return (
    <div
      className={[
        'relative flex shrink-0 items-center justify-center overflow-hidden text-white shadow-md ring-1 ring-white/25',
        sizing.box,
        visual.tile,
        visual.glow,
        className,
      ].join(
        ' ',
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-1 top-0 h-px bg-white/55"
      />

      <Icon
        className={[
          'relative',
          sizing.icon,
        ].join(
          ' ',
        )}
      />
    </div>
  );
}
