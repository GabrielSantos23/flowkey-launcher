const SVG_NS = 'http://www.w3.org/2000/svg';

export type ClassValue =
  string | false | null | undefined | Record<string, boolean | null | undefined> | ClassValue[];

export type Child = Node | string | number | false | null | undefined | Child[];

export type HProps = {
  class?: ClassValue | ClassValue[];
  className?: ClassValue | ClassValue[];
  style?: string | Record<string, string | number | undefined>;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  on?: Record<string, EventListener>;
  dataset?: Record<string, string | undefined>;
  children?: Child;
  html?: string;
};

export function cx(...parts: ClassValue[]): string {
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (typeof part === 'string') {
      if (part) out.push(part);
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

function flatten(children: Child[], into: (Node | string)[]) {
  for (const child of children) {
    if (child === false || child == null) continue;
    if (Array.isArray(child)) {
      flatten(child, into);
      continue;
    }
    into.push(typeof child === 'number' ? String(child) : child);
  }
}

function applyStyle(el: Element, style: HProps['style']) {
  if (!style) return;
  if (typeof style === 'string') {
    el.setAttribute('style', style);
    return;
  }
  const css = Object.entries(style)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
  if (css) el.setAttribute('style', css);
}

function applyProps(el: Element, props?: HProps | null) {
  if (!props) return;

  const className = cx(
    ...(Array.isArray(props.class) ? props.class : [props.class]),
    ...(Array.isArray(props.className) ? props.className : [props.className]),
  );
  if (className) el.setAttribute('class', className);

  applyStyle(el, props.style);

  if (props.attrs) {
    const booleanHtml = new Set([
      'disabled',
      'checked',
      'selected',
      'hidden',
      'readonly',
      'required',
      'multiple',
      'autofocus',
    ]);
    for (const [name, value] of Object.entries(props.attrs)) {
      if (value === false || value == null) continue;
      if (value === true) {
        el.setAttribute(name, booleanHtml.has(name) ? '' : 'true');
      } else {
        el.setAttribute(name, String(value));
      }
    }
  }

  if (props.dataset && el instanceof HTMLElement) {
    for (const [name, value] of Object.entries(props.dataset)) {
      if (value != null) el.dataset[name] = value;
    }
  }

  if (props.on) {
    for (const [event, listener] of Object.entries(props.on)) {
      el.addEventListener(event, listener);
    }
  }

  if (props.html != null) {
    el.innerHTML = props.html;
  }
}

function appendChildren(el: Element, props: HProps | null | undefined, extra: Child[]) {
  const all: Child[] = [];
  if (props?.children != null) all.push(props.children);
  all.push(...extra);
  const flat: (Node | string)[] = [];
  flatten(all, flat);
  for (const child of flat) {
    el.append(child);
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: HProps | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applyProps(el, props);
  appendChildren(el, props, children);
  return el;
}

export function svg(tag: string, props?: HProps | null, ...children: Child[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  appendChildren(el, props, children);
  return el;
}

export function mount(host: ParentNode | null | undefined, node: Node | null) {
  if (!host) return () => {};
  if (node) host.replaceChildren(node);
  else host.replaceChildren();
  return () => host.replaceChildren();
}
