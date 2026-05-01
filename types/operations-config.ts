export interface OperationsAnnouncement {
  enabled: boolean;
  text: string;
  href: string;
}

export interface OperationsQuickEntry {
  id: string;
  enabled: boolean;
  title: string;
  subtitle: string;
  href: string;
}

export interface OperationsNavLink {
  id: string;
  enabled: boolean;
  label: string;
  href: string;
  newTab: boolean;
}

export interface OperationsConfigData {
  announcement: OperationsAnnouncement;
  quickEntries: OperationsQuickEntry[];
  navLinks: OperationsNavLink[];
  showGithubLink: boolean;
  updatedAt?: string;
}
