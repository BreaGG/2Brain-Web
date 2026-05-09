import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ParsedPage } from "@/lib/types";
import MetadataBar from "./MetadataBar";
import { buildSlugMap } from "@/lib/parser";
import Link from "next/link";

interface Props {
  page: ParsedPage;
  allPages: ParsedPage[];
}

function resolveWikiLinksInText(text: string, slugMap: Map<string, string>): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const inner = m[1].trim();
    const linkSlug = inner.split("/").pop()!;
    const resolved = slugMap.get(linkSlug) ?? slugMap.get(inner);
    if (resolved) {
      parts.push(
        <Link
          key={m.index}
          href={`/wiki/${resolved}`}
          className="border-b border-[var(--node-concept)] text-[var(--node-concept)] hover:opacity-80 transition-opacity"
        >
          {linkSlug}
        </Link>
      );
    } else {
      parts.push(
        <span
          key={m.index}
          title="Page not yet created"
          className="border-b border-dashed border-[var(--text-muted)] text-[var(--text-muted)]"
        >
          {linkSlug}
        </span>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function processChildren(
  children: React.ReactNode,
  slugMap: Map<string, string>
): React.ReactNode {
  if (typeof children === "string") {
    return resolveWikiLinksInText(children, slugMap);
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === "string") {
        const resolved = resolveWikiLinksInText(child, slugMap);
        return resolved.length === 1 && typeof resolved[0] === "string"
          ? resolved[0]
          : <span key={i}>{resolved}</span>;
      }
      return child;
    });
  }
  return children;
}

export default function PageView({ page, allPages }: Props) {
  const slugMap = buildSlugMap(allPages);
  const slugObj = Object.fromEntries(slugMap.entries());

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-6">{page.title}</h1>
      <MetadataBar page={page} slugMap={slugObj} />
      <div className="prose prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p({ children }) {
              return <p>{processChildren(children, slugMap)}</p>;
            },
            li({ children }) {
              return <li>{processChildren(children, slugMap)}</li>;
            },
            td({ children }) {
              return <td>{processChildren(children, slugMap)}</td>;
            },
            th({ children }) {
              return <th>{processChildren(children, slugMap)}</th>;
            },
            a({ href, children }) {
              return (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              );
            },
            blockquote({ children }) {
              return (
                <blockquote className="border-l-2 border-[var(--node-concept)] pl-4 text-[var(--text-muted)] italic my-4">
                  {children}
                </blockquote>
              );
            },
          }}
        >
          {page.bodyContent}
        </ReactMarkdown>
      </div>
    </article>
  );
}
