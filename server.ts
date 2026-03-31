import path from "path";
import express from "express";
import apiApp from "./src/server/app";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const envMode = (process.env.NODE_ENV || "development").trim();
  const isProduction = envMode === "production";

  console.log(`[Server] Initializing in ${envMode} mode...`);

  // 1. Global Logger
  app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
  });

  // 2. API Routes (Mount the existing app logic)
  app.use(apiApp);

  // 3. Static Files & SPA Logic
  if (!isProduction) {
    console.log("[Server] Development: Loading Vite...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    const indexPath = path.join(distPath, "index.html");
    
    console.log(`[Server] Production: Serving static files from ${distPath}`);
    
    // Serve static assets
    app.use(express.static(distPath));
    
    // Catch-all for React Router / SPA
    app.get("*", (req, res) => {
      // Don't catch API requests that reached here (they should have been handled by apiApp)
      if (req.url.startsWith("/api/")) {
        return res.status(404).json({ error: "API endpoint not found" });
      }
      
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error(`[Server] Error sending index.html: ${err.message}`);
          res.status(500).send("Frontend build not found. Please run 'npm run build' first.");
        }
      });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 Success! Dashboard is live at: http://localhost:${PORT}\n`);
  });
}

startServer().catch(err => {
  console.error("[Server] Critical startup error:", err);
});
