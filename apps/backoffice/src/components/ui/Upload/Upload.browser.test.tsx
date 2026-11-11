import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import {
  audit,
  COLOR_SCHEMES,
  focusRing,
  outline,
  setTheme,
  tabTo,
} from '../../../../test/browser/a11y.ts';
import { renderUi } from '../../../../test/browser/render.tsx';
import { Upload } from './index.tsx';

// Upload em Chromium (#457; da vitrine, #320): com `draggable`, o <input type="file">
// transparente cobre a área e é a parada do Tab, nomeado pelo texto da área, e a área desenha o
// foco de 2px. Sem `draggable`, o botão "Escolher arquivo" é a parada do Tab; cada arquivo da
// lista tem "Remover <arquivo>" (no escuro, com o foco primary-mild: o --ring sobre o gray-700
// do item dá 2,91:1). Os arquivos entram direto no <input> (`userEvent.upload`): abrir o seletor
// nativo pelo teclado dependia do runner e falhava no CI (ADR 0020).

/** Arquivo já escolhido: a lista aparece desde o início. */
const PAUTA = new File(['%PDF-1.7'], 'pauta-da-semana.pdf', { type: 'application/pdf' });

/** PNG de 1 pixel, para a prévia de imagem. */
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const txt = (name: string) => new File(['pauta'], name, { type: 'text/plain' });
const CAPA = new File([Uint8Array.from(atob(PNG_1PX), (char) => char.charCodeAt(0))], 'capa.png', {
  type: 'image/png',
});

function Uploads() {
  const [anexos, setAnexos] = useState(0);
  return (
    <section aria-label="Upload">
      <Upload
        draggable
        multiple
        className="w-full form-width"
        onChange={(files) => setAnexos(files.length)}
        onFileRemove={(files) => setAnexos(files.length)}
      />
      <p role="status">Anexos escolhidos: {anexos}.</p>
      <Upload
        fileList={[PAUTA]}
        fileListClass="form-width"
        tip={<p className="mt-2 text-sm">PDF ou imagem, um por vez.</p>}
        uploadLimit={1}
      />
      <Upload draggable disabled className="w-full form-width">
        <span>Envio bloqueado</span>
      </Upload>
    </section>
  );
}

describe.each(COLOR_SCHEMES)('Upload no navegador (%s)', (scheme) => {
  it('pelo teclado, com foco de 2px e sem violação do axe', async () => {
    await setTheme(scheme);
    const screen = await renderUi(<Uploads />);
    expect(await audit(screen.container)).toEqual([]);

    const status = screen.getByRole('status');
    const drop = screen.getByLabelText('Escolha um arquivo ou arraste e solte aqui');
    const area = () => drop.element().parentElement!;
    await expect.element(status).toHaveTextContent('Anexos escolhidos: 0.');

    // Área de soltar: Tab chega ao input, e a área mostra o foco.
    await tabTo(drop);
    await expect.poll(() => outline(area())).toEqual(focusRing());
    expect((drop.element() as HTMLInputElement).multiple).toBe(true);
    await userEvent.upload(drop, [txt('anexo-Enter.txt'), txt('anexo-Space.txt')]);
    await expect.element(status).toHaveTextContent('Anexos escolhidos: 2.');
    await expect.element(screen.getByText('anexo-Enter.txt')).toBeVisible();

    // Arrastar sobre a área a destaca; sair tira o destaque.
    area().dispatchEvent(new DragEvent('dragover', { bubbles: true }));
    await expect.poll(() => area().classList.contains('border-primary')).toBe(true);
    area().dispatchEvent(new DragEvent('dragleave', { bubbles: true }));
    await expect.poll(() => area().classList.contains('border-primary')).toBe(false);

    // Remover pelo teclado, pelo nome do arquivo.
    const remove = screen.getByRole('button', { name: 'Remover anexo-Enter.txt' });
    await tabTo(remove);
    await expect
      .poll(() => outline(remove))
      .toEqual(focusRing(scheme === 'dark' ? '--primary-mild' : '--ring'));
    await userEvent.keyboard('{Enter}');
    await expect.element(status).toHaveTextContent('Anexos escolhidos: 1.');
    await expect.element(screen.getByText('anexo-Enter.txt')).not.toBeInTheDocument();

    // Sem draggable: o botão é a parada do Tab, e o arquivo novo substitui o da lista (limite 1).
    await expect.element(screen.getByText('pauta-da-semana.pdf')).toBeVisible();
    const choose = screen.getByRole('button', { name: 'Escolher arquivo' });
    await tabTo(choose);
    // O segundo <input> da seção é o do Upload sem `draggable`.
    const input = screen.container.querySelectorAll('input[type="file"]')[1]!;
    await userEvent.upload(input, CAPA);
    await expect.element(screen.getByRole('img', { name: 'Prévia de capa.png' })).toBeVisible();
    await expect.element(screen.getByText('pauta-da-semana.pdf')).not.toBeInTheDocument();

    await expect.element(screen.getByLabelText('Envio bloqueado')).toBeDisabled();

    expect(await audit(screen.container)).toEqual([]);
  });
});
