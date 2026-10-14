import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // The web build serves from dist/public; the desktop vite build outputs
  // dist/renderer (vite.renderer.config.ts) while this bundled server runs
  // with __dirname = dist/. Resolve whichever layout was actually built —
  // previously only dist/public was tried, so the production desktop
  // server threw "Could not find the build directory" at startup.
  const candidates = [
    path.resolve(__dirname, "public"),
    path.resolve(__dirname, "renderer"),
  ];
  const distPath = candidates.find((c) => fs.existsSync(c));
  if (!distPath) {
    throw new Error(
      `Could not find the build directory: tried ${candidates.join(", ")}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
