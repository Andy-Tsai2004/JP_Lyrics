import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { I18nProvider } from "@/lib/i18n";

export const Route = createRootRoute({
  component: () => (
    <>
      <PreviewHostBridge />
      <I18nProvider>
        <AuthProvider>
          <Outlet />
        </AuthProvider>
      </I18nProvider>
    </>
  ),
});
