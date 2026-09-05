/**
 * Maqsad: til aniqlash va marshrutlash oraliq qatlami (F-18).
 */

import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Statik fayllar, API proxy va service worker chetlab o'tiladi
  matcher: ['/((?!api|_next|_vercel|sw.js|manifest.webmanifest|icons|.*[.].*).*)'],
};
