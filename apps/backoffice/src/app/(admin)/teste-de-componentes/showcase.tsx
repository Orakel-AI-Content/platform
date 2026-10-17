'use client';

import { motion } from 'motion/react';
import { useState } from 'react';
import { HiOutlinePlus } from 'react-icons/hi';

import { Button } from '@/components/ui/Button';
import { FormContainer, FormItem } from '@/components/ui/Form';
import { Input } from '@/components/ui/Input';
import { InputGroup } from '@/components/ui/InputGroup';
import { Spinner } from '@/components/ui/Spinner';

/** Seções da vitrine (#205): cada componente portado nas variantes que as telas vão usar. */
export function Showcase() {
  const [clicks, setClicks] = useState(0);
  const [emailChecked, setEmailChecked] = useState(false);
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

      <section aria-labelledby="vitrine-input" className="space-y-3">
        <h2 id="vitrine-input" className="text-lg font-semibold">
          Input
        </h2>
        <FormContainer className="form-width">
          <FormItem label="Título">
            <Input placeholder="Título do artigo" />
          </FormItem>
          <FormItem label="Resumo">
            <Input textArea placeholder="Duas ou três frases" />
          </FormItem>
          <FormItem label="Preço">
            <Input prefix="R$" suffix=",00" inputMode="numeric" />
          </FormItem>
          <FormItem label="Somente leitura">
            <Input readOnly value="slug-fixo" />
          </FormItem>
          <FormItem label="Desabilitado">
            <Input disabled placeholder="Indisponível" />
          </FormItem>
        </FormContainer>
      </section>

      <section aria-labelledby="vitrine-input-group" className="space-y-3">
        <h2 id="vitrine-input-group" className="text-lg font-semibold">
          InputGroup
        </h2>
        <FormContainer className="form-width">
          <FormItem label="Domínio">
            <InputGroup>
              <InputGroup.Addon>https://</InputGroup.Addon>
              <Input placeholder="exemplo" />
              <InputGroup.Addon>.com.br</InputGroup.Addon>
            </InputGroup>
          </FormItem>
          <FormItem label="Busca">
            <InputGroup size="sm">
              <Input placeholder="Termo" />
              <Button>Buscar</Button>
            </InputGroup>
          </FormItem>
        </FormContainer>
      </section>

      <section aria-labelledby="vitrine-form" className="space-y-3">
        <h2 id="vitrine-form" className="text-lg font-semibold">
          Form
        </h2>
        <FormContainer className="form-width">
          <FormItem label="Slug" asterisk invalid errorMessage="O slug já está em uso">
            <Input required defaultValue="inicio" />
          </FormItem>
          <FormItem label="E-mail" invalid={emailChecked} errorMessage="Informe um e-mail válido">
            <Input type="email" defaultValue="editor@" />
          </FormItem>
          <Button onClick={() => setEmailChecked((checked) => !checked)}>
            {emailChecked ? 'Limpar validação' : 'Validar e-mail'}
          </Button>
        </FormContainer>
        <FormContainer layout="horizontal" labelWidth={120} className="form-width">
          <FormItem label="Autor">
            <Input placeholder="Nome de quem assina" />
          </FormItem>
        </FormContainer>
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
