import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './Button.css';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';
type Size = 'md' | 'sm';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  children: ReactNode;
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  full = false,
  type = 'button',
  className,
  children,
  ...rest
}: Props) {
  const cls = [
    'btn',
    `btn--${variant}`,
    variant !== 'ghost' ? `btn--${size}` : '',
    full ? 'btn--full' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}
