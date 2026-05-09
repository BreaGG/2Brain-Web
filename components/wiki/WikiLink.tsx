import Link from "next/link";

interface Props {
  slug: string;
  label: string;
  resolved: boolean;
}

export default function WikiLink({ slug, label, resolved }: Props) {
  if (!resolved) {
    return (
      <span
        title="Page not yet created"
        className="border-b border-dashed border-[var(--text-muted)] text-[var(--text-muted)] cursor-default"
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      href={`/wiki/${slug}`}
      className="border-b border-[var(--node-concept)] text-[var(--node-concept)] hover:opacity-80 transition-opacity"
    >
      {label}
    </Link>
  );
}
