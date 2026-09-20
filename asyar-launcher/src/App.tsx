import { lazy, Suspense } from 'react';
import AppChrome from './react-bridge/AppChrome';
import { AppErrorBoundary } from './react-bridge/AppErrorBoundary';

// Every Tauri window renders through this component, so each route is
// lazy-loaded: auxiliary windows (island, sticky, snap-guides) must not
// parse the full launcher bundle in their own renderer.
const LauncherPage = lazy(() => import('./routes-react/LauncherPage'));
const SettingsPage = lazy(() => import('./routes-react/SettingsPage'));
const OnboardingPage = lazy(() => import('./routes-react/OnboardingPage'));
const IslandPage = lazy(() => import('./routes-react/IslandPage'));
const StickyPage = lazy(() => import('./routes-react/StickyPage'));
const SnapGuidesPage = lazy(() => import('./routes-react/SnapGuidesPage'));

function Page({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

// Route by pathname — every Tauri window loads a plain path ("/", "/island",
// "/sticky?id=…", "/settings", "/onboarding", "/snap-guides") that maps to a
// prerendered HTML entry. Bare routes render their own chrome; everything
// else is wrapped in the AppChrome boot sequence.
const BARE_ROUTES: Record<string, React.ReactNode> = {
  '/island': (
    <Page>
      <IslandPage />
    </Page>
  ),
  '/sticky': (
    <Page>
      <StickyPage />
    </Page>
  ),
  '/snap-guides': (
    <Page>
      <SnapGuidesPage />
    </Page>
  ),
};

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';

  const bare = BARE_ROUTES[path];
  if (bare) return <AppErrorBoundary>{bare}</AppErrorBoundary>;

  const page =
    path === '/settings' ? (
      <Page>
        <SettingsPage />
      </Page>
    ) : path === '/onboarding' ? (
      <Page>
        <OnboardingPage />
      </Page>
    ) : (
      <Page>
        <LauncherPage />
      </Page>
    );

  return (
    <AppErrorBoundary>
      <AppChrome page={page} />
    </AppErrorBoundary>
  );
}
