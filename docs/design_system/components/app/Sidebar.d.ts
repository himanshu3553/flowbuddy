import * as React from 'react';

export interface NavItemDef {
  /** Material Symbols glyph name. */
  icon: string;
  label: string;
  route: string;
  /** Optional count badge (amber pill), e.g. pending approvals. */
  badge?: number;
}

export interface SidebarUser { name: string; role: string; initial: string; }
export interface SidebarWorkspace { name: string; }

export interface SidebarProps {
  /** Nav entries (defaults to the 6-item Studio IA without Settings, which is pinned). */
  items?: NavItemDef[];
  /** Active item, matched by label or route. @default 'Home' */
  active?: string;
  workspace?: SidebarWorkspace;
  user?: SidebarUser;
  onNavigate?: (route: string, label: string) => void;
  style?: React.CSSProperties;
}

/** The default Studio nav (Home · Recordings · Knowledge Base · Copilot · Analytics). */
export declare const defaultNavItems: NavItemDef[];

/**
 * The Studio app-shell sidebar: logo lockup, workspace switcher, nav, pinned
 * Settings, and a user footer. Active item uses the indigo-50 fill + filled glyph.
 *
 * @startingPoint section="App shell" subtitle="Sidebar nav with indigo active state" viewport="240x620"
 */
export declare function Sidebar(props: SidebarProps): React.JSX.Element;
