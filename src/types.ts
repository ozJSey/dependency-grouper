export interface DependencySet {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface DepGroups {
  groups: Record<string, DependencySet>;
}

export interface PackageJson {
  name: string;
  depGroups?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: any;
}
