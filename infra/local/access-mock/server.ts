// access-mock: substituto local do Cloudflare Access, com o mesmo contrato (ADR 0004 do
// backoffice). Sem dependências: rodado pelo Node 24 direto do .ts (remoção de tipos).
//
//   GET /cdn-cgi/access/certs      JWKS (a chave RSA nasce a cada partida)
//   GET /cdn-cgi/access/login      escolha de um usuário de teste
//   GET /cdn-cgi/access/callback   grava o cookie CF_Authorization com o JWT e redireciona
//   GET /cdn-cgi/access/logout     apaga o cookie
//   GET /cdn-cgi/access/authorize  forward_auth do Caddy: 200 + Cf-Access-Jwt-Assertion, ou
//                                  302 para o login
//   GET /cdn-cgi/access/token      só para o E2E: o JWT de um usuário de teste (?email=), sem
//                                  passar pelo login (fixture asRole do backoffice)
//
// Só para desenvolvimento: nunca suba em produção.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8788);
const TEAM_DOMAIN = required('ACCESS_TEAM_DOMAIN');
const AUD = required('ACCESS_AUD');
const ISSUER = `https://${TEAM_DOMAIN}`;
const COOKIE = 'CF_Authorization';
const TTL_SECONDS = 8 * 60 * 60;

/** Os mesmos e-mails do seed do backoffice (um por papel). */
const USERS = [
  { email: 'admin@orakel.local', role: 'admin' },
  { email: 'editor@orakel.local', role: 'editor' },
  { email: 'revisor@orakel.local', role: 'revisor' },
  { email: 'operacao@orakel.local', role: 'operação' },
];

const KID = randomUUID();
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWKS = {
  keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' }],
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`access-mock: defina ${name}`);
  return value;
}

const b64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

function issueToken(email: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', kid: KID, typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      aud: [AUD],
      email,
      sub: randomUUID(),
      iss: ISSUER,
      iat: now,
      nbf: now,
      exp: now + TTL_SECONDS,
      type: 'app',
    }),
  );
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey);
  return `${header}.${payload}.${b64url(signature)}`;
}

/** Confere só o que este mock emitiu: assinatura e validade. Quem valida de verdade é o backoffice. */
function isValid(token: string): boolean {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return false;
  const ok = verify(
    'RSA-SHA256',
    Buffer.from(`${header}.${payload}`),
    publicKey,
    Buffer.from(signature, 'base64url'),
  );
  if (!ok) return false;
  const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp: number };
  return exp > Date.now() / 1000;
}

function cookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

/** Só redireciona para caminhos do próprio host. */
function safeRedirect(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function send(
  res: ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, { 'cache-control': 'no-store', ...headers });
  res.end(body);
}

function loginPage(redirect: string): string {
  const items = USERS.map(
    (user) =>
      `<li><a href="/cdn-cgi/access/callback?email=${encodeURIComponent(user.email)}&redirect_url=${encodeURIComponent(redirect)}">${user.email}</a> — ${user.role}</li>`,
  ).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Login de teste</title></head>
<body><main><h1>Login de teste (access-mock)</h1><p>Escolha um usuário:</p><ul>${items}</ul></main></body></html>`;
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://access-mock');
  switch (url.pathname) {
    case '/cdn-cgi/access/certs':
      return send(res, 200, JSON.stringify(JWKS), { 'content-type': 'application/json' });

    case '/cdn-cgi/access/login':
      return send(res, 200, loginPage(safeRedirect(url.searchParams.get('redirect_url'))), {
        'content-type': 'text/html; charset=utf-8',
      });

    case '/cdn-cgi/access/callback': {
      const email = url.searchParams.get('email');
      if (!USERS.some((user) => user.email === email) || email === null) {
        return send(res, 400, 'Usuário de teste desconhecido');
      }
      return send(res, 302, '', {
        location: safeRedirect(url.searchParams.get('redirect_url')),
        'set-cookie': `${COOKIE}=${issueToken(email)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_SECONDS}`,
      });
    }

    case '/cdn-cgi/access/token': {
      const email = url.searchParams.get('email');
      if (!USERS.some((user) => user.email === email) || email === null) {
        return send(res, 400, 'Usuário de teste desconhecido');
      }
      return send(res, 200, issueToken(email), { 'content-type': 'text/plain; charset=utf-8' });
    }

    case '/cdn-cgi/access/logout':
      return send(res, 302, '', {
        location: '/cdn-cgi/access/login',
        'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      });

    case '/cdn-cgi/access/authorize': {
      const token = cookie(req, COOKIE);
      if (token !== undefined && isValid(token)) {
        return send(res, 200, '', { 'cf-access-jwt-assertion': token });
      }
      const original = String(req.headers['x-forwarded-uri'] ?? '/');
      return send(res, 302, '', {
        location: `/cdn-cgi/access/login?redirect_url=${encodeURIComponent(safeRedirect(original))}`,
      });
    }

    default:
      return send(res, 404, 'Não encontrado');
  }
}

createServer((req, res) => {
  try {
    handle(req, res);
  } catch (error) {
    console.error(JSON.stringify({ msg: 'access-mock: erro', error: String(error) }));
    send(res, 500, 'Erro no access-mock');
  }
}).listen(PORT, () => {
  console.log(JSON.stringify({ msg: 'access-mock no ar', port: PORT, issuer: ISSUER, aud: AUD }));
});
