import type {
  ActionPanelProps,
  ActionProps,
  DetailProps,
  EmptyViewProps,
  GridItemProps,
  GridProps,
  GridSectionProps,
  ListItemDetailProps,
  ListItemProps,
  ListProps,
  ListSectionProps,
  MetadataFieldProps,
  MetadataProps,
} from './props';
import { intrinsic } from './intrinsic';

export const List = Object.assign(intrinsic<ListProps>('list'), {
  Section: intrinsic<ListSectionProps>('list-section'),
  Item: Object.assign(intrinsic<ListItemProps>('list-item'), {
    Detail: Object.assign(intrinsic<ListItemDetailProps>('list-item-detail'), {
      Metadata: Object.assign(intrinsic<MetadataProps>('detail-metadata'), {
        Field: intrinsic<MetadataFieldProps>('detail-field'),
      }),
    }),
  }),
  EmptyView: intrinsic<EmptyViewProps>('empty-view'),
});

export const Detail = Object.assign(intrinsic<DetailProps>('detail'), {
  Metadata: Object.assign(intrinsic<MetadataProps>('detail-metadata'), {
    Field: intrinsic<MetadataFieldProps>('detail-field'),
  }),
});

export const Grid = Object.assign(intrinsic<GridProps>('grid'), {
  Section: intrinsic<GridSectionProps>('grid-section'),
  Item: intrinsic<GridItemProps>('grid-item'),
  EmptyView: intrinsic<EmptyViewProps>('empty-view'),
});

export const ActionPanel = intrinsic<ActionPanelProps>('action-panel');
export const Action = intrinsic<ActionProps>('action');
