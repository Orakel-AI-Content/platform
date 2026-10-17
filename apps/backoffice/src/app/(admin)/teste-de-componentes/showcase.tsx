'use client';

import { motion } from 'motion/react';
import { useState } from 'react';
import { HiOutlinePlus } from 'react-icons/hi';

import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

/** Seções da vitrine (#205): cada componente portado nas variantes que as telas vão usar. */
export function Showcase() {
  const [clicks, setClicks] = useState(0);
  return (
    <>
      <section aria-labelledby="vitrine-button" className="space-y-3">
        <h2 id="vitrine-button" className="text-lg font-semibold">
          Button
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="solid" onClick={() => setClicks((count) => count + 1)}>
            Solid
          </Button>
          <Button variant="plain">Plain</Button>
          <Button>Default</Button>
          <Button variant="solid" icon={<HiOutlinePlus aria-hidden />}>
            Com ícone
          </Button>
          <Button icon={<HiOutlinePlus aria-hidden />} aria-label="Só ícone" />
          <Button variant="solid" loading>
            Carregando
          </Button>
          <Button disabled>Desabilitado</Button>
          <Button size="xs">Extra pequeno</Button>
        </div>
        <p role="status" className="text-sm">
          {clicks === 0 ? 'Nenhum clique no Solid.' : `Solid acionado ${clicks} vez(es).`}
        </p>
      </section>

      <section aria-labelledby="vitrine-spinner" className="space-y-3">
        <h2 id="vitrine-spinner" className="text-lg font-semibold">
          Spinner
        </h2>
        <div role="status" className="flex items-center gap-2 text-sm">
          <Spinner size={24} />
          Carregando exemplo
        </div>
      </section>

      <section aria-labelledby="vitrine-movimento" className="space-y-3">
        <h2 id="vitrine-movimento" className="text-lg font-semibold">
          Movimento
        </h2>
        {/* Desliza em x (transform), que o MotionConfig do layout desliga com movimento
            reduzido; o E2E confere que o transform já começa no valor final. */}
        <motion.div
          data-vitrine-movimento=""
          initial={{ x: -120 }}
          animate={{ x: 0 }}
          transition={{ duration: 3 }}
          className="w-fit rounded-md bg-muted px-3 py-2 text-sm"
        >
          Painel animado
        </motion.div>
      </section>
    </>
  );
}
