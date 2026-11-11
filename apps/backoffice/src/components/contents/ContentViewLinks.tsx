import { Button } from '@/components/ui/Button';

// "Ver prévia" e "Ver no site" no cabeçalho do detalhe do conteúdo (#597): o mesmo `Button` em
// link e `size="sm"` do "Abrir prévia" da revisão, em nova aba com o aviso só para leitor de tela.
// Sem estado próprio: a página monta os endereços (`content-urls.ts`) e decide o que aparece.

function NewTabLink({ href, children }: { href: string; children: string }) {
  return (
    <Button asElement="a" href={href} target="_blank" rel="noopener noreferrer" size="sm">
      {children}
      <span className="sr-only"> (abre em nova aba)</span>
    </Button>
  );
}

/** A prévia da versão mais recente e, com o conteúdo no ar, o endereço público. */
export function ContentViewLinks({
  previewUrl,
  publicUrl,
}: {
  previewUrl: string;
  /** Só com uma versão publicada e o domínio do site; sem ele, "Ver no site" não aparece. */
  publicUrl?: string;
}) {
  return (
    <>
      <NewTabLink href={previewUrl}>Ver prévia</NewTabLink>
      {publicUrl !== undefined && <NewTabLink href={publicUrl}>Ver no site</NewTabLink>}
    </>
  );
}
