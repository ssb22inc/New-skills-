import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

export function Avatar({ src, alt, fallback, size = 'md', className, ...props }: AvatarProps) {
  const [error, setError] = React.useState(false);

  const initials = fallback || alt?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';

  return (
    <div
      className={cn(
        'relative flex shrink-0 overflow-hidden rounded-full bg-gray-100',
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {src && !error ? (
        <img
          src={src}
          alt={alt || 'Avatar'}
          className="aspect-square h-full w-full object-cover"
          onError={() => setError(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-gray-200 font-medium text-gray-600">
          {initials}
        </span>
      )}
    </div>
  );
}
