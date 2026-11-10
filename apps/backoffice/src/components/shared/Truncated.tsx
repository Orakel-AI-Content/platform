import classNames from '@/components/ui/utils/classNames';

// Texto cortado numa célula (#361) com o inteiro em `title`. Sem `className`, corta na largura
// da célula: a da coluna fluida do DataTable (`meta: { fluid: true }`, #585); com ele, numa
// largura máxima de quem usa.

export function Truncated({ text, className }: { text: string; className?: string }) {
  return (
    <span title={text} className={classNames('block truncate', className)}>
      {text}
    </span>
  );
}
