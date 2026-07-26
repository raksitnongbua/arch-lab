import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge conditional class names and de-duplicate conflicting Tailwind
 * utilities (the later class wins). The shadcn/ui `cn` convention.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
