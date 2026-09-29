import { invoke } from '@/bridge';
import { SettingsRow, SectionTitle } from '@/components/settings-row';
import { UpdateSection } from '@/components/update-section';
import type { SettingsState } from '@/types';

/** About page, ported from BuildAboutPage. */
export function AboutPage({ state }: { state: SettingsState }) {
  return (
    <div>
      <SettingsRow
        title="FlowKey"
        description={`Native Windows launcher · version ${state.about.version}`}
      />
      <SettingsRow title="Extensions loaded" description={String(state.about.extensionsLoaded)} />

      <SectionTitle>Updates</SectionTitle>
      <UpdateSection status={state.update} />
    </div>
  );
}
