import React, { useEffect } from 'react';

export interface AccessibilityGateProps {
  granted?: boolean;
  onGrantedChange?: (granted: boolean) => void;
}

export default function AccessibilityGate({
  granted = true,
  onGrantedChange,
}: AccessibilityGateProps) {
  useEffect(() => {
    onGrantedChange?.(true);
  }, [onGrantedChange]);

  return <p className="text-sm text-[var(--asyar-brand)] m-0">✓ Accessibility granted</p>;
}
