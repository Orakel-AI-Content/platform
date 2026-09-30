import { NextResponse, type NextRequest } from 'next/server';

// Proxy (antigo middleware) só redireciona; autenticação e papéis ficam no domínio e em
// cada route handler (CVE-2025-29927).
export function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL('/sites', request.url));
}

export const config = { matcher: ['/'] };
