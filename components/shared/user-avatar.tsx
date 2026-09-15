import Image from "next/image";
import { cn } from "cn";

function getInitial(fullName: string | null, email: string | null): string {
  const source = fullName?.trim() || email?.trim() || "";
  return source ? source.charAt(0).toUpperCase() : "?";
}

interface UserAvatarProps {
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  size?: number;
  className?: string;
}

/** Avatar circular con fallback a la inicial del nombre (o del email si no hay nombre). */
export function UserAvatar({ fullName, email, avatarUrl, size = 28, className }: UserAvatarProps) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-muted-foreground",
        className
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.42) }}
    >
      {avatarUrl ? (
        <Image src={avatarUrl} alt="" fill sizes={`${size}px`} className="object-cover" />
      ) : (
        getInitial(fullName, email)
      )}
    </span>
  );
}
