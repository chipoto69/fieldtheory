import type { Metadata } from "next";
import { PortalProviders } from "@/components/portal-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Field Theory Agentic Portal",
  description: "Dry-run hosted control plane for Field Theory agent packets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <PortalProviders>{children}</PortalProviders>
      </body>
    </html>
  );
}
