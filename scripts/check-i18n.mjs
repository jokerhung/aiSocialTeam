// Checks the Vietnamese dictionary against the web source: node scripts/check-i18n.mjs
//
// The key of every translation is the English text. This finds each text the code asks for (<T>text</T>, t("text"),
// tn(n, "one", "other")) and reports the ones the Vietnamese dictionary lacks (an error: the interface would show
// English there), HTML entities inside <T> (their key would never match), and dictionary entries nothing asks for
// by a literal (information only: some texts are looked up through a variable, such as the status label tables).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const web = join(root, "web");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

const normalize = (text) => text.replace(/\s+/g, " ").trim();
const unescape = (text) => text.replace(/\\(["'`\\])/g, "$1");

// The dictionary: lines of the form  "English": "Tiếng Việt",
const dictionary = new Map();
for (const match of readFileSync(join(web, "lib/i18n/messages/vi.ts"), "utf8").matchAll(/^\s*("(?:[^"\\]|\\.)*"):\s*("(?:[^"\\]|\\.)*"),?\s*$/gm)) {
  dictionary.set(JSON.parse(match[1]), JSON.parse(match[2]));
}

const used = new Map(); // text -> first file
const problems = [];
const note = (text, file) => text && !used.has(text) && used.set(text, file);

for (const dir of ["app", "components", "lib"]) {
  for (const file of walk(join(web, dir))) {
    const rel = relative(root, file).split(sep).join("/");
    if (rel.startsWith("web/components/ui/") || rel.startsWith("web/lib/i18n/")) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?<![\w])<T>([^<]*?)<\/T>/g)) {
      if (/&[a-z#0-9]+;/i.test(match[1])) problems.push(`${rel}: <T> text has an HTML entity (write the character itself): ${match[1].trim().slice(0, 60)}`);
      note(normalize(match[1]), rel);
    }
    for (const match of source.matchAll(/(?<![\w.])tr?\(\s*(?:"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\$]|\\.)*)`)/g)) note(normalize(unescape(match[1] ?? match[2] ?? match[3])), rel);
    for (const match of source.matchAll(/(?<![\w.])tn\(\s*[^,]+,\s*"(?:[^"\\\n]|\\.)*"\s*,\s*"((?:[^"\\\n]|\\.)*)"/g)) note(normalize(unescape(match[1])), rel);
  }
}

// Texts that are looked up through a variable (tables of labels such as NAV_ITEMS or the status names): the code shows
// them with t(label), so they are found here by their property names. scripts/i18n-tables.json lists what is not
// translated on purpose (names of platforms) and the properties that are not shown to people.
const { ignore, extra } = JSON.parse(readFileSync(join(root, "scripts/i18n-tables.json"), "utf8"));
const SKIP = new Set(ignore);
for (const dir of ["components", "lib"]) {
  for (const file of walk(join(web, dir))) {
    const rel = relative(root, file).split(sep).join("/");
    if (rel.startsWith("web/components/ui/") || rel.startsWith("web/lib/i18n/") || rel.startsWith("web/lib/imagekit/")) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\b(?:label|description|tips|text|name)\s*:\s*"((?:[^"\\\n]|\\.)*)"/g)) {
      if (!/^[A-Z]/.test(match[1])) continue;
      const text = normalize(unescape(match[1]));
      if (!SKIP.has(text) && /[a-z]/.test(text)) note(text, rel);
    }
  }
}
for (const text of extra) note(text, "scripts/i18n-tables.json");

const missing = [...used].filter(([text]) => !dictionary.has(text));
const unused = [...dictionary.keys()].filter((text) => !used.has(text));

for (const [text, file] of missing) problems.push(`${file}: no Vietnamese text for: ${text.slice(0, 90)}`);
for (const text of dictionary.keys()) if (text !== normalize(text)) problems.push(`vi.ts: key has stray whitespace: ${JSON.stringify(text)}`);
for (const [text, vi] of dictionary) {
  const names = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  if (names(text) !== names(vi)) problems.push(`vi.ts: {placeholders} differ in: ${text.slice(0, 80)}`);
  if (!vi.trim()) problems.push(`vi.ts: empty text for: ${text.slice(0, 80)}`);
}

console.log(`${used.size} texts in the code, ${dictionary.size} in the Vietnamese dictionary, ${unused.length} not asked for by a literal.`);
if (process.argv.includes("--unused") && unused.length) console.log("Not asked for by a literal:\n  " + unused.join("\n  "));
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("i18n ok");
