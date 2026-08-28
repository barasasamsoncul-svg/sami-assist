'use client';

export default function SaMiLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sizes = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
    xl: 'text-5xl',
  };

  return (
    <span className={`${sizes[size]} font-black italic tracking-[-0.08em] select-none`}>
      <span className="text-blue-700 dark:text-blue-500">Sa</span>
      <span className="text-gray-900 dark:text-white">Mi</span>
    </span>
  );
}