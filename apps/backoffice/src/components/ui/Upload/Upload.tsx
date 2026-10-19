// Ecme v1.3.10 (e5f9a1d): src/components/ui/Upload/Upload.tsx
// Adaptado (#320):
// - o `cloneDeep` do `es-toolkit/compat` virou cópia do array (`File` é imutável) e o
//   `filesToArray` saiu (só copiava de novo);
// - o `{...rest}` ia para o <div> e para o <input> (o `id` saía duplicado); fica só no <div>;
// - o <input type="file"> tem nome acessível: `aria-label` repassado, ou, com `draggable`, o
//   texto da área (`aria-labelledby`), ou "Escolher arquivo". Com `draggable` ele cobre a área
//   (transparente, como no Ecme) e é o alvo do clique, do Tab, de Enter/Espaço e de soltar —
//   comportamento nativo do navegador; a folha desenha o foco na área;
// - o clique que o próprio <input> dispara ao abrir o seletor sobe até a área e não chama
//   `click()` de novo (no Ecme, só a trava de reentrada do navegador evitava o laço);
// - o botão de remover tem o nome "Remover <arquivo>" (no Ecme, "Fechar" para todos);
// - `hover:border-primary` literal: montada por template, o Tailwind 4 não gerava a classe;
// - textos padrão em pt-BR.
'use client';

import { useRef, useState, useCallback } from 'react';
import classNames from '../utils/classNames';
import FileItem from './FileItem';
import Button from '../Button/Button';
import CloseButton from '../CloseButton';
import Notification from '../Notification/Notification';
import toast from '../toast/toast';
import useUniqueId from '../hooks/useUniqueId';
import type { CommonProps } from '../@types/common';
import type { ReactNode, ChangeEvent, MouseEvent, Ref } from 'react';

export interface UploadProps extends CommonProps {
  accept?: string;
  'aria-label'?: string;
  beforeUpload?: (file: FileList | null, fileList: File[]) => boolean | string;
  disabled?: boolean;
  draggable?: boolean;
  fileList?: File[];
  fileListClass?: string;
  fileItemClass?: string;
  multiple?: boolean;
  onChange?: (file: File[], fileList: File[]) => void;
  onFileRemove?: (file: File[]) => void;
  ref?: Ref<HTMLDivElement>;
  showList?: boolean;
  tip?: string | ReactNode;
  uploadLimit?: number;
}

const Upload = (props: UploadProps) => {
  const {
    accept,
    'aria-label': ariaLabel,
    beforeUpload,
    disabled = false,
    draggable = false,
    fileList = [],
    fileListClass,
    fileItemClass,
    multiple,
    onChange,
    onFileRemove,
    ref,
    showList = true,
    tip,
    uploadLimit,
    children,
    className,
    ...rest
  } = props;

  const fileInputField = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState(fileList);
  const [dragOver, setDragOver] = useState(false);
  const labelId = useUniqueId('upload-label-');

  // Sincroniza com a prop durante o render (sem efeito em cascata)
  const fileListKey = JSON.stringify(fileList);
  const [prevFileListKey, setPrevFileListKey] = useState(fileListKey);
  if (fileListKey !== prevFileListKey) {
    setPrevFileListKey(fileListKey);
    if (JSON.stringify(files) !== fileListKey) {
      setFiles(fileList);
    }
  }

  const triggerMessage = (msg: string | ReactNode = '') => {
    toast.push(
      <Notification type="danger" duration={2000}>
        {msg || 'Não foi possível adicionar o arquivo.'}
      </Notification>,
      {
        placement: 'top-center',
      },
    );
  };

  const pushFile = (newFiles: FileList | null, file: File[]) => {
    if (newFiles) {
      for (const f of newFiles) {
        file.push(f);
      }
    }

    return file;
  };

  const addNewFiles = (newFiles: FileList | null) => {
    let file = [...files];
    if (typeof uploadLimit === 'number' && uploadLimit !== 0) {
      if (file.length >= uploadLimit) {
        if (uploadLimit === 1) {
          file.shift();
          file = pushFile(newFiles, file);
        }

        return file;
      }
    }
    return pushFile(newFiles, file);
  };

  const onNewFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const { files: newFiles } = e.target;
    let result: boolean | string = true;

    if (beforeUpload) {
      result = beforeUpload(newFiles, files);

      if (result === false) {
        triggerMessage();
        return;
      }

      if (typeof result === 'string' && result.length > 0) {
        triggerMessage(result);
        return;
      }
    }

    if (result) {
      const updatedFiles = addNewFiles(newFiles);
      setFiles(updatedFiles);
      onChange?.(updatedFiles, files);
    }
  };

  const removeFile = (fileIndex: number) => {
    const deletedFileList = files.filter((_, index) => index !== fileIndex);
    setFiles(deletedFileList);
    onFileRemove?.(deletedFileList);
  };

  const triggerUpload = (e: MouseEvent<HTMLDivElement>) => {
    if (!disabled && e.target !== fileInputField.current) {
      fileInputField.current?.click();
    }
    e.stopPropagation();
  };

  const renderChildren = () => {
    if (!draggable && !children) {
      return (
        <Button disabled={disabled} onClick={(e) => e.preventDefault()}>
          Escolher arquivo
        </Button>
      );
    }

    if (draggable && !children) {
      return <span>Escolha um arquivo ou arraste e solte aqui</span>;
    }

    return children;
  };

  const handleDragLeave = useCallback(() => {
    if (draggable) {
      setDragOver(false);
    }
  }, [draggable]);

  const handleDragOver = useCallback(() => {
    if (draggable && !disabled) {
      setDragOver(true);
    }
  }, [draggable, disabled]);

  const handleDrop = useCallback(() => {
    if (draggable) {
      setDragOver(false);
    }
  }, [draggable]);

  const draggableProp = {
    onDragLeave: handleDragLeave,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
  };

  const uploadClass = classNames(
    'upload',
    draggable && `upload-draggable`,
    draggable && !disabled && 'hover:border-primary',
    draggable && disabled && 'disabled',
    dragOver && 'border-primary',
    className,
  );

  const uploadInputClass = classNames('upload-input', draggable && `draggable`);

  const inputName =
    ariaLabel !== undefined
      ? { 'aria-label': ariaLabel }
      : draggable
        ? { 'aria-labelledby': labelId }
        : { 'aria-label': 'Escolher arquivo' };

  return (
    <>
      <div
        ref={ref}
        className={uploadClass}
        {...(draggable ? draggableProp : { onClick: triggerUpload })}
        {...rest}
      >
        <input
          ref={fileInputField}
          className={uploadInputClass}
          type="file"
          disabled={disabled}
          multiple={multiple}
          accept={accept}
          title=""
          value=""
          onChange={onNewFileUpload}
          {...inputName}
        ></input>
        {draggable ? (
          <div id={labelId} className="contents">
            {renderChildren()}
          </div>
        ) : (
          renderChildren()
        )}
      </div>
      {tip}
      {showList && (
        <div className={classNames('upload-file-list', fileListClass)}>
          {files.map((file, index) => (
            <FileItem key={file.name + index} file={file} className={fileItemClass}>
              <CloseButton
                className="upload-file-remove"
                aria-label={`Remover ${file.name}`}
                onClick={() => removeFile(index)}
              />
            </FileItem>
          ))}
        </div>
      )}
    </>
  );
};

export default Upload;
