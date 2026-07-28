import * as React from 'react';
import { cn } from '../../lib/utils';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-xl border-[1.5px] border-input bg-card px-4 py-3 text-base leading-relaxed ring-offset-background transition-all',
        'placeholder:text-muted-foreground',
        'hover:border-muted-foreground',
        'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
