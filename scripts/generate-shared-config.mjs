import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TRIP } from "../trip-config.js";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(process.cwd(), "dist");
const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

if (/service[_-]?role/i.test(publishableKey)) {
  throw new Error("Refusing to expose a Supabase service-role credential in browser configuration.");
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

for (const path of [
  "index.html",
  "styles.css",
  "app.js",
  "trip-config.js",
  "shared-store.js",
  "photo-utils.js",
  // Species photos. Licensing for each file is recorded in assets/species/CREDITS.md.
  "assets",
]) {
  await cp(join(sourceRoot, path), join(outputRoot, path), { recursive: true });
}

const config = {
  url: publicUrl,
  publishableKey,
  tripSlug: TRIP.slug,
};

await writeFile(
  join(outputRoot, "shared-config.js"),
  `window.PATTY_ANN_SHARED_CONFIG = ${JSON.stringify(config)};\n`,
  "utf8",
);
