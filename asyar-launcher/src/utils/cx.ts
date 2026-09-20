export type ClassValue =
  | string
  | number
  | false
  | null
  | undefined
  | Record<string, boolean | number | null | undefined>
  | ClassValue[];

export function cx(...parts: ClassValue[]): string {
  const out: string[] = [];
  for (const part of parts) {
    if (!part && part !== 0) continue;
    if (typeof part === 'string' || typeof part === 'number') {
      out.push(String(part));
      continue;
    }
    if (Array.isArray(part)) {
      const flat = cx(...part);
      if (flat) out.push(flat);
      continue;
    }
    for (const [key, on] of Object.entries(part)) {
      if (on) out.push(key);
    }
  }
  return out.join(' ');
}
