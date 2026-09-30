// Sinal de vida dos jobs para o monitor externo (HEARTBEAT_BASE_URL/<nome>). Sem a URL,
// não faz nada. Nunca lança: falha de heartbeat não derruba o job.
export async function pingHeartbeat(
  baseUrl: string | undefined,
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!baseUrl) return false;
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(name)}`, {
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
