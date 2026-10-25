import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Формы для шликерного литья",
  description: "Фото профиля → STL мастер-модели тела вращения",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
