import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

export default defineConfig({
  server: {
    port: 8080,
    strictPort: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tanstackStart({ server: { entry: "server" } }), react(), tailwindcss(), nitro()],
});
