import * as React from 'react';

export interface PageHeaderProps {
  /** Screen title (omit when using `breadcrumb`). */
  title?: React.ReactNode;
  /** Small helper line under the title. */
  subtitle?: React.ReactNode;
  /** Breadcrumb node, e.g. "Knowledge Base / Reset a password" (replaces title). */
  breadcrumb?: React.ReactNode;
  /** Inline tab labels (e.g. Install / Settings / Appearance). */
  tabs?: string[];
  activeTab?: string;
  onTab?: (tab: string) => void;
  /** Right-aligned live status text (renders a green dot + label). */
  status?: React.ReactNode;
  /** Right-aligned actions (Buttons, search, date-range, etc). */
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * The per-screen header: title/subtitle (or breadcrumb) + optional inline tabs
 * on the left; status + action buttons on the right. 62px tall, hairline bottom.
 */
export declare function PageHeader(props: PageHeaderProps): React.JSX.Element;
