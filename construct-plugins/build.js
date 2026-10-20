import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = new URL("./", import.meta.url);
const sharedClient = new URL("shared/bridge-client.js", root);
const construct2Dir = new URL("construct2/", root);
const construct3SharedDir = new URL("construct3/shared/", root);

await mkdir(construct3SharedDir, { recursive: true });
await copyFile(sharedClient, new URL("bridge-client.js", construct3SharedDir));

await build({
	entryPoints: [fileURLToPath(new URL("runtime.entry.js", construct2Dir))],
	bundle: true,
	format: "iife",
	target: "es2015",
	outfile: fileURLToPath(new URL("runtime.js", construct2Dir))
});

console.log("Built Construct 2 runtime and copied shared Construct 3 bridge module.");
