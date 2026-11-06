import { defineConfig, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import { handleProxy } from "./server/proxy";

const proxyMiddleware: Connect.NextHandleFunction = (req, res, next) => {
  if (req.url?.startsWith("/proxy")) handleProxy(req, res).catch(() => res.end());
  else next();
};

export default defineConfig({
  // Electron = Chromium: without this the CSS minifier keeps only -webkit-backdrop-filter (Safari) and drops the standard one.
  build: { target: "chrome130", cssTarget: "chrome130" },
  plugins: [
    react(),
    {
      name: "stream-proxy",
      configureServer: (s) => void s.middlewares.use(proxyMiddleware),
      configurePreviewServer: (s) => void s.middlewares.use(proxyMiddleware),
    },
  ],
  // localhost only: the proxy is an open relay, don't expose it to the LAN
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: 5173 },
});
