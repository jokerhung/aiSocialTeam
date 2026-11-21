"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Monitor, Plug } from "lucide-react";
import { useT } from "@/lib/i18n/client";

const sections = [
  { href: "/dashboard/settings/integrations", label: "Integrations", icon: Plug },
  { href: "/dashboard/settings/computer-use", label: "Computer Use", icon: Monitor },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav aria-label={t("Settings")} className="flex gap-2 overflow-x-auto border-b">
      {sections.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-[current=page]:border-primary aria-[current=page]:text-primary"
        >
          <Icon aria-hidden="true" className="size-4" />
          {t(label)}
        </Link>
      ))}
    </nav>
  );
}
