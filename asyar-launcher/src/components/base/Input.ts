import { cx, type ClassValue } from '../../ui/h';

// Svelte adapters pass clsx's ClassValue (clsx is a transitive Svelte dep, so
// import it directly would be undeclared); mirror its shape structurally.
type ClsxClassObject = Record<string, boolean | number | bigint | null | undefined>;
type ClsxClassValue =
  string | number | bigint | boolean | null | undefined | ClsxClassObject | ClsxClassValue[];

export type InputClassProps = {
  unstyled?: boolean;
  /** Svelte's binding passes clsx's wider ClassValue (includes numbers). */
  class?: ClsxClassValue;
};

/** Shared between the Svelte adapter (bind:value stays native) and TS views. */
export function inputClass({
  unstyled = false,
  class: className = '',
}: InputClassProps = {}): string {
  return cx({ input: !unstyled }, className as ClassValue);
}

// Legacy path — kept for import compatibility after the React migration.
import { Input } from '../react/Inputs';
export { Input };
export default Input;
