'use client';

type Props = {
  avatarFileId: string | null;
  displayName: string;
  initials: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const SIZE_CLASSES = {
  sm: 'h-9 w-9 text-[11px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-16 w-16 text-lg',
} as const;

export default function UserAvatar({
  avatarFileId,
  displayName,
  initials,
  size = 'md',
  className = '',
}: Props) {
  const sizeClass =
    SIZE_CLASSES[size];

  if (!avatarFileId) {
    return (
      <span
        aria-label={`${displayName} profile`}
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 font-black text-white ${sizeClass} ${className}`}
      >
        {initials}
      </span>
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 ${sizeClass} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/account/avatar?v=${encodeURIComponent(
          avatarFileId
        )}`}
        alt={`${displayName} profile`}
        className="h-full w-full object-cover"
      />
    </span>
  );
}