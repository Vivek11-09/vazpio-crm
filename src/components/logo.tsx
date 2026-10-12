import Image from "next/image";

// Vazpio lockup (icon + wordmark) on a transparent background. Source file is 568x160.
export function Logo({ height = 32, priority = false }: { height?: number; priority?: boolean }) {
  return (
    <Image
      src="/vazpio-logo.png"
      alt="Vazpio"
      width={Math.round((568 / 160) * height)}
      height={height}
      priority={priority}
    />
  );
}
