export const metadata = {
  title: "Lumely.ai Prototype",
  description: "Upload + mask + AI edit",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
