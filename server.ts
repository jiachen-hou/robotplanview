import path from "path";
import express from "express";
import app from "./src/server/app";

async function startServer() {
  const PORT = 3000;
  const envMode = (process.env.NODE_ENV || "development").trim();
  const isProduction = envMode === "production";

  console.log(`[Server] Starting in ${envMode} mode...`);

  // API routes are already in 'app'
  
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
    const indexPath = path.resolve(distPath, "index.html");
    
    console.log(`[Server] Production Mode: Serving from ${distPath}`);
    
    // Serve static files
    app.use(express.static(distPath));
    
    // Catch-all route for SPA
    app.get("*", (req, res) => {
      console.log(`[Server] Catch-all hit for: ${req.url}`);
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error(`[Server] Error sending index.html: ${err.message}`);
          res.status(500).send("Error loading index.html. Make sure 'npm run build' was run.");
        }
      });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Success! Dashboard available at http://localhost:${PORT}`);
  });
}

startServer();
