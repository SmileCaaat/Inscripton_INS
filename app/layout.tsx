import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inscription · 数字人文知识平台",
  description:
    "面向数字人文资产、知识节点、关系图谱与开放归档的本地优先研究工具。",
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
