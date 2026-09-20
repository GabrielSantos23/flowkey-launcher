import React from 'react';
import AppChrome from '../../react-bridge/AppChrome';
import PreferencesPromptHost from '../settings/PreferencesPromptHost';

export interface AppShellProps {
  children?: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  return (
    <AppChrome>
      {children}
      <PreferencesPromptHost />
    </AppChrome>
  );
}
