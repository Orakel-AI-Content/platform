// Ecme v1.3.10 (e5f9a1d): src/components/ui/Upload/FileItem.tsx
// Adaptado (#320):
// - ícones `VscFile*` do `react-icons/vsc` viraram `PiFile*` do `react-icons/pi`, `aria-hidden`
//   (o nome do arquivo já está no texto ao lado);
// - o ícone de PDF casa com `application/pdf` (no Ecme, `type === 'pdf'` nunca casava);
// - a prévia da imagem cria a URL num efeito e a revoga ao desmontar (no Ecme, um
//   `URL.createObjectURL` a cada renderização, nunca liberado); `alt` em pt-BR;
// - o nome do arquivo é um <p> (no Ecme, <h6>): um título por arquivo poluía a navegação por
//   títulos da tela; a cor de título do template (`heading-text`) é `text-gray-900`/`gray-100`.
'use client';

import { useEffect, useRef } from 'react';
import { PiFile, PiFilePdf, PiFileZip } from 'react-icons/pi';
import classNames from '../utils/classNames';
import type { CommonProps } from '../@types/common';

const BYTE = 1000;
const getKB = (bytes: number) => Math.round(bytes / BYTE);

const FileIcon = ({ children }: CommonProps) => {
  return <span className="text-3xl text-gray-900 dark:text-gray-100">{children}</span>;
};

const ImagePreview = ({ file }: { file: File }) => {
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (imageRef.current) imageRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // eslint-disable-next-line @next/next/no-img-element -- prévia de `blob:` local, que o next/image não otimiza
  return <img ref={imageRef} className="upload-file-image" alt={`Prévia de ${file.name}`} />;
};

export interface FileItemProps extends CommonProps {
  file: File;
}

const FileItem = (props: FileItemProps) => {
  const { file, children, className } = props;
  const { type, name, size } = file;

  const renderThumbnail = () => {
    const isImageFile = type.split('/')[0] === 'image';

    if (isImageFile) {
      return <ImagePreview file={file} />;
    }

    if (type === 'application/zip') {
      return (
        <FileIcon>
          <PiFileZip aria-hidden />
        </FileIcon>
      );
    }

    if (type === 'application/pdf') {
      return (
        <FileIcon>
          <PiFilePdf aria-hidden />
        </FileIcon>
      );
    }

    return (
      <FileIcon>
        <PiFile aria-hidden />
      </FileIcon>
    );
  };

  return (
    <div className={classNames('upload-file', className)}>
      <div className="flex items-center">
        <div className="upload-file-thumbnail">{renderThumbnail()}</div>
        <div className="upload-file-info">
          <p className="upload-file-name text-sm font-bold text-gray-900 dark:text-gray-100">
            {name}
          </p>
          <span className="upload-file-size">{getKB(size)} kb</span>
        </div>
      </div>
      {children}
    </div>
  );
};

FileItem.displayName = 'UploadFileItem';

export default FileItem;
