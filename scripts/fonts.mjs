// Downloads Chubbo and Supreme from Fontshare into src/fonts/.
// Their license (ITF Free Font License) doesn't allow redistributing the files in a public repo:
// everyone gets their own copy straight from Fontshare. Without them the app falls back to system fonts.
import { mkdir, writeFile, access } from "node:fs/promises";

const OUT = new URL("../src/fonts/", import.meta.url);
const FONTS = [
  { slug: "chubbo", weight: 700, file: "Chubbo-Bold.woff2" },
  { slug: "supreme", weight: 400, file: "Supreme-Regular.woff2" },
  { slug: "supreme", weight: 500, file: "Supreme-Medium.woff2" },
  { slug: "supreme", weight: 700, file: "Supreme-Bold.woff2" },
];

await mkdir(OUT, { recursive: true });
for (const f of FONTS) {
  const dest = new URL(f.file, OUT);
  if (await access(dest).then(() => true, () => false)) continue;
  const css = await (await fetch(`https://api.fontshare.com/v2/css?f[]=${f.slug}@${f.weight}&display=swap`)).text();
  const src = css.match(/url\('([^']+\.woff2)'\)/)?.[1];
  if (!src) throw new Error(`Fontshare no devolvió ${f.slug}@${f.weight}`);
  const res = await fetch(src.startsWith("//") ? `https:${src}` : src);
  if (!res.ok) throw new Error(`${f.file}: HTTP ${res.status}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`✓ ${f.file}`);
}
console.log("Fuentes de Fontshare listas (licencia: https://www.fontshare.com/licenses/itf-ffl)");
