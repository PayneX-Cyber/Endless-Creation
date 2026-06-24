import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';
import './Button.css';

type ButtonVariant = 'primary' | 'ghost' | 'soft';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ children, variant = 'soft', className = '', ...props }: PropsWithChildren<ButtonProps>) {
  return (
    <button className={`button button--${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
