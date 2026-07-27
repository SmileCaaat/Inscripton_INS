import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inscription · 数字人文知识平台",
  description:
    "以知识节点、关系与数字叙事为核心的本地优先数字人文研究与展示工具。",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/ins-logo.png", type: "image/png" }],
    shortcut: "/ins-logo.png",
    apple: "/ins-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
