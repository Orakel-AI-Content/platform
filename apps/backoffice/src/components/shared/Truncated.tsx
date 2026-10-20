import classNames from '@/components/ui/utils/classNames';

// Texto cortado numa célula (#361): a largura máxima vem de quem usa, e o texto inteiro fica
// em `title`.

export function Truncated({ text, className }: { text: string; className: string }) {
  return (
    <span title={text} className={classNames('block truncate', className)}>
      {text}
    </span>
  );
}
