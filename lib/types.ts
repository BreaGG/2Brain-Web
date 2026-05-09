export interface PageMetadata {
  title: string;
  type: string;
  domain: string[];
  sources: string[];
  lastUpdated: string;
  slug: string; // e.g. "research/concept-double-threshold"
  path: string; // e.g. "wiki/research/concept-double-threshold.md"
}

export interface WikiLink {
  raw: string;
  slug: string;
  folder?: string;
}

export interface ParsedPage extends PageMetadata {
  rawContent: string;
  bodyContent: string; // rawContent with metadata block stripped
  links: WikiLink[];
  excerpt: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  domain: string[];
  degree: number;
  broken?: boolean; // referenced but no page exists
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  broken: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
