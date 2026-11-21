import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export default async function E2BGuide() {
  const { locale, t } = await getT();
  const filename = `e2b-setup.${locale}.md`;
  const guide = await readFile(resolve("..", "docs", filename), "utf8")
    .catch(() => readFile(resolve("docs", filename), "utf8"))
    .catch(() => "");
  const sections = guide.replace(/\r\n/g, "\n").trim().split(/^## /m);
  const groups = sections.slice(1).map((section, index) => {
    const newline = section.indexOf("\n");
    return { id: `section-${index + 1}`, title: section.slice(0, newline).trim(), body: section.slice(newline + 1).trim() };
  });
  const intro = sections[0].split("\n\n").slice(1).filter(Boolean);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-5 sm:p-8">
      <Link href="/dashboard/settings/computer-use" className="text-sm text-primary underline underline-offset-4">{t("Back to settings")}</Link>
      <h1 className="text-2xl font-semibold">{t("E2B setup guide")}</h1>
      {!guide && (
        <a href={`https://github.com/jokerhung/aiSocialTeam/blob/main/docs/${filename}`} className="text-primary underline">{t("Open the guide on GitHub")}</a>
      )}
      {intro.map((paragraph) => <p key={paragraph} className="text-sm leading-relaxed">{paragraph}</p>)}
      <nav aria-label={t("Guide sections")}>
        <ul className="space-y-1 text-sm">
          {groups.map(({ id, title }) => <li key={id}><a className="text-primary underline-offset-4 hover:underline" href={`#${id}`}>{title}</a></li>)}
        </ul>
      </nav>
      {groups.map(({ id, title, body }) => (
        <section key={id} id={id} className="space-y-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          {body.split(/```(?:bash)?\r?\n(.*?)```/gs).map((part, index) =>
            index % 2 === 1 ? <pre key={part} className="overflow-x-auto rounded-lg bg-muted p-3 text-xs"><code>{part.trim()}</code></pre>
              : part.trim().split(/\r?\n\r?\n/).filter(Boolean).map((paragraph) => <p key={paragraph} className="text-sm leading-relaxed">{paragraph}</p>))}
        </section>
      ))}
    </main>
  );
}
