/**
 * Maqsad: ildiz layout — `[locale]` segmentidan tashqarida qoladigan minimal qobiq.
 *
 * Til bo'yicha `<html lang>` atributi `[locale]/layout.tsx` da o'rnatiladi.
 */

import type { ReactNode } from 'react';
import './globals.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
