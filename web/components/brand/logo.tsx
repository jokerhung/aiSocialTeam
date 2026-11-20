import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

import { T } from "@/lib/i18n/client";
type Props = { className?: string; wordmarkClassName?: string; href?: string };

export function Logo({ className, wordmarkClassName, href = "/" }: Props) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <Image src="/socialteam.svg" alt="" width={32} height={32} className="shrink-0" unoptimized />
      <span className={cn("text-[17px]", wordmarkClassName)}><T>SocialTeam</T></span>
    </Link>
  );
}
