import path from "path";
import express from "express";
import app from "./src/server/app";

async function startServer() {
  const PORT = 3000;
  const envMode = (process.env.NODE_ENV || "development").trim();
  const isProduction = envMode === "production";

  console.log(`[Server] Starting in ${envMode} mode...`);

  // Global Logger to see every request
  app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.url}`);
    next();
  });

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
    
    // Catch-all route for SPA - MUST be last
    app.get("*", (req, res) => {
      // Skip API routes
      if (req.url.startsWith("/api/")) {
        return res.status(404).json({ error: "API route not found" });
      }
      
      console.log(`[Server] Serving index.html for: ${req.url}`);
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error(`[Server] Error sending index.html: ${err.message}`);
          res.status(500).send("Error loading index.html. Please ensure 'npm run build' was successful.");
        }
      });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Success! Dashboard available at http://localhost:${PORT}`);
  });
}

startServer();
