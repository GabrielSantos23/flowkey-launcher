import { inputClass, type InputClassProps } from './Input';

export { inputClass };

export type TextareaClassProps = InputClassProps;

export function textareaClass(props: TextareaClassProps = {}): string {
  return inputClass(props);
}

export function numericRows(rows: number | string | undefined): number | undefined {
  return rows !== undefined ? Number(rows) : undefined;
}
