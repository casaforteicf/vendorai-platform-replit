import * as React from "react";

type VisualSource = Record<string, unknown> | null | undefined;

const MEDIA_KEYS = [
  "profilePicture",
  "profile_picture",
  "avatarUrl",
  "avatar_url",
  "photoUrl",
  "photo_url",
  "fotoUrl",
  "foto_url",
  "logoUrl",
  "logo_url",
  "imagemUrl",
  "imagem_url",
  "imageUrl",
  "image_url",
  "thumbnailUrl",
  "thumbnail_url",
  "coverUrl",
  "cover_url",
  "creativeUrl",
  "creative_url",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function resolveVisualUrl(source: VisualSource): string | null {
  if (!source) return null;

  for (const key of MEDIA_KEYS) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  for (const nestedKey of ["metadata", "discoveryData", "dadosPj", "brand", "creative", "media"]) {
    const nested = asRecord(source[nestedKey]);
    if (!nested) continue;
    for (const key of MEDIA_KEYS) {
      const value = nested[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }

  return null;
}

export function visualInitials(label?: string | null) {
  const parts = (label ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "V";
}

export function VisualIdentity({
  source,
  label,
  size = "md",
  shape = "circle",
  className = "",
  alt,
}: {
  source?: VisualSource;
  label?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  shape?: "circle" | "rounded";
  className?: string;
  alt?: string;
}) {
  const url = resolveVisualUrl(source);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => setFailed(false), [url]);

  const sizeClass = {
    xs: "h-7 w-7 text-[10px]",
    sm: "h-9 w-9 text-xs",
    md: "h-11 w-11 text-sm",
    lg: "h-14 w-14 text-base",
    xl: "h-20 w-20 text-lg",
  }[size];
  const radiusClass = shape === "circle" ? "rounded-full" : "rounded-xl";

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={alt ?? label ?? ""}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`${sizeClass} ${radiusClass} shrink-0 border border-border/70 bg-muted object-cover shadow-sm ${className}`}
      />
    );
  }

  return (
    <span
      aria-label={alt ?? label ?? "Identidade visual"}
      className={`${sizeClass} ${radiusClass} inline-flex shrink-0 items-center justify-center border border-border/70 bg-gradient-to-br from-muted to-background font-semibold text-foreground/75 shadow-sm ${className}`}
    >
      {visualInitials(label)}
    </span>
  );
}
