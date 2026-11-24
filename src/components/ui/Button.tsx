import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  isLoading?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-sm hover:brightness-105 focus-visible:ring-blue-500',
  secondary:
    'bg-slate-100 text-slate-900 border border-slate-200 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-700',
  danger:
    'bg-rose-500 text-white hover:bg-rose-600 focus-visible:ring-rose-500',
  ghost:
    'bg-transparent text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800',
};

export function Button({
  variant = 'primary',
  isLoading = false,
  disabled,
  type = 'button',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-base font-bold transition-all focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98] ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {isLoading ? 'Memproses...' : children}
    </button>
  );
}

export default Button;
