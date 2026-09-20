import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export default function Card({ children, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
