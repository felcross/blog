import type { Components } from "react-markdown";
import { strings } from "./strings";

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function isSafeHref(href: string | undefined): boolean {
  if (!href) return false;
  if (
    href.startsWith("#") ||
    href.startsWith("/") ||
    href.startsWith("./") ||
    href.startsWith("../")
  ) {
    return true;
  }
  try {
    const url = new URL(href, window.location.origin);
    return SAFE_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

function isSafeImageSrc(src: string | undefined): boolean {
  if (!src) return false;
  if (src.startsWith("/")) return true;
  try {
    const url = new URL(src, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const markdownComponents: Components = {
  h2: ({ children }) => (
    <h2 className="mb-6 mt-12 font-[family-name:var(--font-inter)] text-2xl font-black lg:text-3xl">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-4 mt-10 font-[family-name:var(--font-inter)] text-xl font-bold lg:text-2xl">
      {children}
    </h3>
  ),
  p: ({ children }) => <p className="mb-6 text-base leading-relaxed">{children}</p>,
  blockquote: ({ children }) => (
    <div className="my-8 rounded-xl border-l-4 border-accent bg-surface-dark p-6 text-text-on-dark [&_p]:mb-0 [&_p]:text-inherit">
      {children}
    </div>
  ),
  img: ({ src, alt, title }) => {
    if (typeof src !== "string" || !isSafeImageSrc(src)) return null;
    const caption = title ?? alt;
    return (
      <figure className="my-8">
        <img
          src={src}
          alt={alt ?? strings.article.figureFallbackAlt}
          title={title}
          className="w-full rounded-xl"
          loading="lazy"
        />
        {caption ? (
          <figcaption className="mt-3 text-sm text-text-on-light-muted">{caption}</figcaption>
        ) : null}
      </figure>
    );
  },
  a: ({ href, children }) => {
    if (!href || !isSafeHref(href)) {
      return <span>{children}</span>;
    }
    const external = href.startsWith("http://") || href.startsWith("https://");
    return (
      <a
        href={href}
        className="min-h-11 inline-flex items-center text-accent underline underline-offset-2"
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  },
  ul: ({ children }) => (
    <ul className="mb-6 list-disc space-y-2 pl-6 text-base leading-relaxed">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-6 list-decimal space-y-2 pl-6 text-base leading-relaxed">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
};
