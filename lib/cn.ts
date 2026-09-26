import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The StyleGuide font sizes are custom; without them tailwind-merge would read "text-body" as a
// color and drop it next to "text-primary".
const merge = extendTailwindMerge({
  extend: { theme: { text: ["display", "h2", "h3", "body", "small", "code"] } },
});

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
