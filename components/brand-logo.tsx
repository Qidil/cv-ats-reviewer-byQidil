import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * The product name always sits next to the mark as real text, so the image itself is decorative.
 * Eager: two of its three places are above the fold, and the file is under 1 KB and cached across them.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/doctorcv-logo.svg"
      alt=""
      width={84}
      height={64}
      loading="eager"
      className={cn("h-7 w-auto shrink-0", className)}
    />
  );
}
