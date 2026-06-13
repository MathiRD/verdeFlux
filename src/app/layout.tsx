import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VerdeFlux | Controle financeiro",
  description:
    "Controle financeiro minimalista com metricas, importacao, exportacao e relatorios.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
