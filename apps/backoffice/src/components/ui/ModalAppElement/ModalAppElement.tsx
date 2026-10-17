'use client';

import { useEffect } from 'react';
import Modal from 'react-modal';
import { APP_ELEMENT_ID } from '../utils/modalApp';

// Registra uma vez o contêiner da app como `appElement` do react-modal (#209): o Dialog e o
// Drawer deixam o `ariaHideApp` padrão (o Ecme o desligava), e o react-modal põe `aria-hidden`
// nele enquanto há diálogo aberto. Em efeito: no servidor não há `document`, e nenhum diálogo
// abre antes da hidratação.
export default function ModalAppElement() {
  useEffect(() => {
    Modal.setAppElement(`#${APP_ELEMENT_ID}`);
  }, []);
  return null;
}
