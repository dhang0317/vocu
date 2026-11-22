import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vocu — 個人英文單字與 AI 動態出題學習網站",
  description:
    "現代極簡深色模式英文單字學習 Web App：單字集管理、作答記錄驅動的動態防重複出題、文意選填與首尾字母提示填空、MCP AI 助理題庫串接。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#000000] text-zinc-100">
        {children}
      </body>
    </html>
  );
}
