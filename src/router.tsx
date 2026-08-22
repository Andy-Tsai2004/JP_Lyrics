import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  // GitHub Pages serves the app from `/<repo>/`, so the router must match
  // paths relative to the Vite base URL (a no-op `/` locally).
  const basepath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return createRouter({
    routeTree,
    basepath,
    defaultErrorComponent: AppErrorComponent,
  });
}
