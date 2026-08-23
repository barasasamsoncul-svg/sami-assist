'use client';

export default function SaMiLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sizes = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
    xl: 'text-5xl',
  };

  return (
    <span className={`${sizes[size]} font-black italic tracking-tighter`}>
      <span className="text-blue-800 dark:text-blue-500 drop-shadow-[2px_2px_0_rgba(0,0,0,0.2)]">Sa</span>
      <span className="text-gray-900 dark:text-gray-100 drop-shadow-[2px_2px_0_rgba(0,0,0,0.2)]">Mi</span>
    </span>
  );
}