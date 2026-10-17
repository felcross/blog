import { Link } from "react-router-dom";
import { strings } from "@/shared/strings";
import { formatDate } from "@/shared/format";
import type { PostSummary } from "./types";

const PLACEHOLDER_STYLES = [
  "bg-gradient-to-br from-accent/30 to-surface-dark/60",
  "bg-gradient-to-br from-text-on-light/15 to-accent/40",
  "bg-gradient-to-br from-surface-dark/70 to-accent/25",
  "bg-gradient-to-br from-accent/20 to-text-on-light-ghost",
] as const;

function hashSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

interface BlogCardProps {
  post: PostSummary;
  isHovered?: boolean;
  isDimmed?: boolean;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
}

export function BlogCard({ post, isHovered, isDimmed, onHoverStart, onHoverEnd }: BlogCardProps) {
  const placeholderStyle = PLACEHOLDER_STYLES[hashSlug(post.slug) % PLACEHOLDER_STYLES.length];
  const dateLabel = formatDate(post.publishedAt ?? post.updatedAt);

  return (
    <Link
      to={`/blog/${post.slug}`}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onFocus={onHoverStart}
      onBlur={onHoverEnd}
      className="group block rounded-2xl"
      style={{
        opacity: isDimmed ? 0.4 : 1,
        transform: isHovered ? "scale(1.03)" : "scale(1)",
        transition: "opacity 350ms cubic-bezier(0.16, 1, 0.3, 1), transform 400ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div className="overflow-hidden rounded-2xl border border-border-light bg-light-bg">
        <div
          className={`aspect-[4/3] w-full overflow-hidden ${placeholderStyle} transition-transform duration-500 group-hover:scale-105`}
          aria-hidden="true"
        />
        <div className="p-5">
          <h2 className="mb-2 font-[family-name:var(--font-inter)] text-lg font-bold leading-snug transition-colors duration-300 group-hover:text-accent">
            {post.title}
          </h2>
          {post.excerpt ? (
            <p className="mb-4 text-sm leading-relaxed text-text-on-light-muted">{post.excerpt}</p>
          ) : null}
          <div className="flex items-center gap-3 text-xs text-text-on-light-faint">
            <time dateTime={post.publishedAt ?? post.updatedAt}>{dateLabel}</time>
            <span aria-hidden="true">{strings.article.separator}</span>
            <span>{strings.blog.readMore}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
