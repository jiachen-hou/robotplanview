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
    console.log("[Server] Loading Vite middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    console.log(`[Server] Serving static files from: ${distPath}`);
    
    app.use(express.static(distPath));
    
    // SPA fallback
    app.get("*", (req, res) => {
      const indexPath = path.resolve(distPath, "index.html");
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error(`[Server] Error sending index.html: ${err.message}`);
          res.status(500).send("Error loading page, please ensure 'npm run build' was successful.");
        }
      });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Success! Dashboard available at http://localhost:${PORT}`);
  });
}

startServer();
