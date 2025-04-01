"use client";

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./app.css";
import { AuthProvider } from './contexts/AuthContext';

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
