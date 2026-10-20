'use client';

import { useId, useState } from 'react';

import UploadMedia from '@/assets/svg/UploadMedia';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import Upload from '@/components/ui/Upload';

// Envio de imagens da biblioteca (#376), no `UploadFile` do FileManager do Ecme: o botão
// "Enviar imagens" abre o Dialog com o Upload arrastável. Sem o segundo botão do Ecme: escolher
// ou soltar na área entrega os arquivos à fila de quem usa e fecha o diálogo, para a fila ficar
// à vista; o react-modal devolve o foco ao botão. O Upload acumula o que já foi escolhido no
// estado interno, então só os arquivos novos do `onChange` seguem adiante. Recusa e limite ficam
// na fila (sem `beforeUpload` nem `uploadLimit`). O título fica no corpo em `h4`, como no Ecme,
// ligado por `aria-labelledby`; o texto da área nomeia o campo de arquivo. Cores: o azul fixo
// do Ecme, fora da paleta, vira `text-primary dark:text-primary-mild`, e a
// segunda linha usa `text-gray-600 dark:text-gray-300` no lugar do `opacity-60`, que não chega
// ao contraste AA (pares em globals-contrast.test.ts).

export function MediaUpload({
  accept,
  onAdd,
}: {
  /** Tipos aceitos pelo campo de arquivo. */
  accept: string;
  /** Recebe os arquivos escolhidos ou soltos. */
  onAdd: (files: File[]) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);

  function add(files: File[], previous: File[]) {
    onAdd(files.slice(previous.length));
    setOpen(false);
  }

  return (
    <>
      <Button variant="solid" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Enviar imagens
      </Button>
      <Dialog isOpen={open} onClose={() => setOpen(false)} aria={{ labelledby: `${id}-title` }}>
        <h4 id={`${id}-title`}>Enviar imagens</h4>
        <Upload
          draggable
          multiple
          accept={accept}
          showList={false}
          className="mt-6 bg-gray-100 dark:bg-transparent"
          onChange={add}
        >
          <div className="my-4 text-center">
            <div className="mb-4 flex justify-center text-6xl">
              <UploadMedia height={150} width={200} />
            </div>
            <p className="font-semibold">
              <span className="text-gray-800 dark:text-white">Solte as imagens aqui ou </span>
              <span className="text-primary dark:text-primary-mild">escolha no computador</span>
            </p>
            <p className="mt-1 font-semibold text-gray-600 dark:text-gray-300">
              JPEG, PNG, WebP ou AVIF, até 25 MB cada
            </p>
          </div>
        </Upload>
      </Dialog>
    </>
  );
}
