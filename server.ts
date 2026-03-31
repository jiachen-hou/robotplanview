import path from "path";
import express from "express";
import app from "./src/server/app";

async function startServer() {
  const PORT = 3000;
  const envMode = (process.env.NODE_ENV || "development").trim();
  const isProduction = envMode === "production";

  console.log(`[Server] Starting in ${envMode} mode...`);

  // Vite middleware for development
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    const indexPath = path.resolve(distPath, "index.html");
    
    app.use(express.static(distPath));
    
    app.get("*", (req, res) => {
      if (req.url.startsWith("/api/")) return res.status(404).end();
      res.sendFile(indexPath);
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
