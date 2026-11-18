import { useState } from "react";
import type { Profile } from "@/lib/types";
import { PORTAL_THEMES, portalForRole } from "@/lib/portalTheme";

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function ProfileAvatar({
  profile,
  size = 36,
  className = "",
}: {
  profile: Profile;
  size?: number;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const portal = portalForRole(profile.role);
  const theme = PORTAL_THEMES[portal];

  if (profile.avatar_url && !imgError) {
    return (
      <img
        src={profile.avatar_url}
        alt={profile.full_name}
        width={size}
        height={size}
        onError={() => setImgError(true)}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`rounded-full ${theme.avatar} flex items-center justify-center font-semibold shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.4) }}
    >
      {getInitials(profile.full_name)}
    </div>
  );
}
