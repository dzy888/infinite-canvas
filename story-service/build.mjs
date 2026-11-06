import { build } from "esbuild";
import { resolve } from "node:path";
await build({
  entryPoints: ["src/worker.ts"],
  outfile: "dist/worker.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  plugins: [
    {
      name: "inkos-runtime",
      setup(builder) {
        const replacements = {
          "episode-store": "episode-store.ts",
          "play-db": "play-db.ts",
          "local-search": "local-search.ts",
          "atomic-file-set": "atomic-file-set.ts",
        };
        builder.onResolve(
          {
            filter:
              /(?:episode-store|play-db|local-search|atomic-file-set)\.js$/,
          },
          (args) => {
            if (
              !args.importer.includes("/vendor/") &&
              !args.importer.includes("\\vendor\\")
            )
              return;
            const name = args.path.split("/").at(-1).replace(".js", "");
            return { path: resolve("src/storage", replacements[name]) };
          },
        );
        builder.onResolve({ filter: /^[^./]|^@/ }, (args) => {
          if (args.path === "@actalk/inkos-core")
            return { path: resolve("vendor/core/src/index.ts") };
          if (args.path.startsWith("@actalk/inkos-core/"))
            return {
              path: resolve(
                "vendor/core/src",
                args.path.slice("@actalk/inkos-core/".length) + ".ts",
              ),
            };
          if (
            (args.path === "node:fs/promises" || args.path === "node:fs") &&
            (args.importer.includes("/vendor/") ||
              args.importer.includes("\\vendor\\"))
          )
            return {
              path: resolve(
                "src/storage",
                args.path.endsWith("promises") ? "fs-promises.ts" : "fs.ts",
              ),
            };
          return { path: args.path, external: true };
        });
      },
    },
  ],
});

await build({
  entryPoints: ["src/storage/sync-transport.ts"],
  outfile: "dist/storage-sync.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
});
