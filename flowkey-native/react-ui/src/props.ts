import type { ReactNode } from 'react';

export interface IconSpec {
  emoji?: string;
  lucide?: string;
  color?: string;
  uri?: string;
}

export interface FilterOptionSpec {
  label: string;
  value: string;
}

export interface ListProps {
  layout?: 'side-pane';
  filter?: FilterOptionSpec[];
  children?: ReactNode;
}

export interface ListSectionProps {
  title?: string;
  children?: ReactNode;
}

export interface ListItemProps {
  id: string;
  title: string;
  subtitle?: string;
  kind?: string;
  icon?: string | IconSpec;
  actions?: ReactNode;
  detail?: ReactNode;
}

export interface ListItemDetailProps {
  preview?: string;
  previewImageUri?: string;
  children?: ReactNode;
}

export interface MetadataProps {
  children?: ReactNode;
}

export interface MetadataFieldProps {
  label: string;
  value: string;
  valueIconUri?: string;
}

export interface EmptyViewProps {
  title: string;
  description?: string;
}

export interface DetailProps {
  title: string;
  subtitle?: string;
  imageUri?: string;
  markdown?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export interface GridProps {
  columns: number;
  title?: string;
  children?: ReactNode;
}

export interface GridItemProps {
  id: string;
  title: string;
  subtitle?: string;
  kind?: string;
  icon?: string | IconSpec;
  actions?: ReactNode;
}

export interface ActionPanelProps {
  children?: ReactNode;
}

export interface ActionProps {
  title: string;
  primary?: boolean;
  push?: string;
  onAction: () => void | Promise<void>;
  id?: string;
}
