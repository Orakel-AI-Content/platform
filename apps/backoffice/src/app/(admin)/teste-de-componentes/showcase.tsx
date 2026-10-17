'use client';

import { motion } from 'motion/react';
import { useState } from 'react';
import { HiOutlinePlus } from 'react-icons/hi';

import AdaptiveCard from '@/components/shared/AdaptiveCard';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import Loading from '@/components/shared/Loading';
import MediaSkeleton from '@/components/shared/loaders/MediaSkeleton';
import TextBlockSkeleton from '@/components/shared/loaders/TextBlockSkeleton';
import StickyFooter from '@/components/shared/StickyFooter';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Drawer } from '@/components/ui/Drawer';
import { FormContainer, FormItem } from '@/components/ui/Form';
import { Input } from '@/components/ui/Input';
import { InputGroup } from '@/components/ui/InputGroup';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { Tag } from '@/components/ui/Tag';

/** Imagem do Avatar sem rede: um quadrado na cor primária. */
const AVATAR_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23006be3'/%3E%3C/svg%3E";

/** Seções da vitrine (#205, #206): cada componente portado nas variantes que as telas vão usar. */
export function Showcase() {
  const [clicks, setClicks] = useState(0);
  const [emailChecked, setEmailChecked] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastAction, setLastAction] = useState('Nenhuma ação.');
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

      <section aria-labelledby="vitrine-dialog" className="space-y-3">
        <h2 id="vitrine-dialog" className="text-lg font-semibold">
          Dialog
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setDialogOpen(true)}>Abrir Dialog</Button>
          <Button onClick={() => setDrawerOpen(true)}>Abrir Drawer</Button>
          <Button onClick={() => setConfirmOpen(true)}>Abrir ConfirmDialog</Button>
        </div>
        <p role="status" className="text-sm">
          {lastAction}
        </p>
        <Dialog isOpen={dialogOpen} title="Editar autor" onClose={() => setDialogOpen(false)}>
          <p className="mb-6">O nome aparece na assinatura dos artigos.</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="solid"
              onClick={() => {
                setLastAction('Autor salvo.');
                setDialogOpen(false);
              }}
            >
              Salvar
            </Button>
          </div>
        </Dialog>
        <Drawer
          isOpen={drawerOpen}
          title="Filtros"
          onClose={() => setDrawerOpen(false)}
          footer={
            <Button size="sm" variant="solid" onClick={() => setConfirmOpen(true)}>
              Limpar filtros
            </Button>
          }
        >
          <p>Os filtros valem para a lista de artigos.</p>
        </Drawer>
        <ConfirmDialog
          isOpen={confirmOpen}
          type="danger"
          title="Limpar os filtros?"
          confirmText="Limpar"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setLastAction('Filtros limpos.');
            setConfirmOpen(false);
          }}
        >
          <p>A lista volta a mostrar todos os artigos.</p>
        </ConfirmDialog>
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

      <section aria-labelledby="vitrine-card" className="space-y-3">
        <h2 id="vitrine-card" className="text-lg font-semibold">
          Card
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card header={{ content: 'Com cabeçalho' }} footer={{ content: 'Rodapé do cartão' }}>
            Texto no corpo do cartão.
          </Card>
          <Card bordered={false}>Cartão com sombra, sem borda.</Card>
          <AdaptiveCard>Cartão adaptável (layout único).</AdaptiveCard>
        </div>
      </section>

      <section aria-labelledby="vitrine-badge-tag" className="space-y-3">
        <h2 id="vitrine-badge-tag" className="text-lg font-semibold">
          Badge e Tag
        </h2>
        <div className="flex flex-wrap items-center gap-6">
          <Badge content={7} />
          <Badge content={120}>
            <span className="text-sm">Pendências</span>
          </Badge>
          <Badge>
            <span className="text-sm">Novidades</span>
          </Badge>
          <Tag>Rascunho</Tag>
          <Tag prefix>Publicado</Tag>
        </div>
      </section>

      <section aria-labelledby="vitrine-avatar" className="space-y-3">
        <h2 id="vitrine-avatar" className="text-lg font-semibold">
          Avatar
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar size="sm">AS</Avatar>
          <Avatar>MR</Avatar>
          <Avatar size="lg" shape="round">
            JP
          </Avatar>
          <Avatar src={AVATAR_IMAGE} alt="Foto de Ana Souza" />
        </div>
      </section>

      <section aria-labelledby="vitrine-carregamento" className="space-y-3">
        <h2 id="vitrine-carregamento" className="text-lg font-semibold">
          Carregamento
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div data-vitrine-skeletons="" className="space-y-4">
            <Skeleton width="60%" />
            <MediaSkeleton />
            <TextBlockSkeleton rowCount={2} />
          </div>
          <Loading loading className="h-24">
            Conteúdo carregado
          </Loading>
          <Loading type="cover" loading>
            <p className="p-4 text-sm">Lista por baixo da sobreposição.</p>
          </Loading>
        </div>
      </section>

      {/* Conteúdo alto o bastante para rolar: o rodapé fixo fica visível durante a rolagem. */}
      <section aria-labelledby="vitrine-rodape" className="space-y-3">
        <h2 id="vitrine-rodape" className="text-lg font-semibold">
          Rodapé fixo
        </h2>
        <div
          data-vitrine-rolagem=""
          className="h-[150vh] rounded-md border border-border p-4 text-sm"
        >
          Área longa para rolar.
        </div>
        <StickyFooter
          stickyClass="bottom-0 border-t border-border bg-background px-4 py-3"
          defaultClass="px-4 py-3"
        >
          <div className="flex justify-end gap-3">
            <Button>Cancelar</Button>
            <Button variant="solid">Salvar</Button>
          </div>
        </StickyFooter>
      </section>
    </>
  );
}
