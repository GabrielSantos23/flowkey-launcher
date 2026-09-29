import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Shadcn-style sonner toaster, themed from the shell's --fk-* tokens. Always
 * dark (the settings page has no light mode); toasts render top-right like
 * the reference design.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="top-right"
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--foreground)',
          '--normal-border': 'var(--keycap-border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        style: {
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
