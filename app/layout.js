import './globals.css';
import { Open_Sans } from 'next/font/google';

const openSans = Open_Sans({ subsets: ['latin'], weight: ['400', '600', '700', '800'], variable: '--font-sans', display: 'swap' });

export const metadata = {
  title: 'Pared',
  description: 'Simulador de pared de cuadros.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={openSans.variable}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
