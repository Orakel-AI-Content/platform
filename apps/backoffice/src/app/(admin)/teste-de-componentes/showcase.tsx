'use client';

import { motion } from 'motion/react';
import { useState } from 'react';
import { HiOutlinePlus } from 'react-icons/hi';
import { PiArrowUp, PiLinkSimple } from 'react-icons/pi';
import AsyncSelect from 'react-select/async';
import CreatableSelect from 'react-select/creatable';

import AdaptiveCard from '@/components/shared/AdaptiveCard';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { IconButton } from '@/components/shared/IconButton';
import Loading from '@/components/shared/Loading';
import MediaSkeleton from '@/components/shared/loaders/MediaSkeleton';
import TextBlockSkeleton from '@/components/shared/loaders/TextBlockSkeleton';
import StickyFooter from '@/components/shared/StickyFooter';
import { Alert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox, type CheckboxGroupValue } from '@/components/ui/Checkbox';
import { Dialog } from '@/components/ui/Dialog';
import { Drawer } from '@/components/ui/Drawer';
import { Dropdown } from '@/components/ui/Dropdown';
import { FormContainer, FormItem } from '@/components/ui/Form';
import { Input } from '@/components/ui/Input';
import { InputGroup } from '@/components/ui/InputGroup';
import { Notification } from '@/components/ui/Notification';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { Table, type ThSort } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { Tag } from '@/components/ui/Tag';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/Tooltip';

import { DataTableShowcase } from './data-table-showcase.tsx';
import { MenuShowcase } from './menu-showcase.tsx';

/** Imagem do Avatar sem rede: um quadrado na cor primária. */
const AVATAR_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23006be3'/%3E%3C/svg%3E";

type Opcao = { value: string; label: string };

const CATEGORIAS: Opcao[] = [
  { value: 'noticias', label: 'Notícias' },
  { value: 'guias', label: 'Guias' },
  { value: 'resenhas', label: 'Resenhas' },
  { value: 'entrevistas', label: 'Entrevistas' },
];

const SITES: Opcao[] = [
  { value: 'exemplo-a', label: 'Exemplo A' },
  { value: 'exemplo-b', label: 'Exemplo B' },
  { value: 'receitas', label: 'Receitas da casa' },
];

/** Busca do Select async sem rede: filtra a lista local. */
function buscarSites(termo: string): Promise<Opcao[]> {
  const normalizado = termo.toLowerCase();
  return Promise.resolve(SITES.filter((site) => site.label.toLowerCase().includes(normalizado)));
}

const ARTIGOS = [
  { titulo: 'Guia de jardinagem', status: 'Publicado' },
  { titulo: 'Análise do mercado', status: 'Rascunho' },
  { titulo: 'Receita de pão', status: 'Em revisão' },
];

/** Próxima ordenação do cabeçalho: sem ordem → ascendente → descendente → ascendente. */
const NEXT_SORT: Record<ThSort, ThSort> = { none: 'asc', asc: 'desc', desc: 'asc' };

/** Seções da vitrine (#205, #206): cada componente portado nas variantes que as telas vão usar. */
export function Showcase({ linkPage }: { linkPage: number }) {
  const [clicks, setClicks] = useState(0);
  const [emailChecked, setEmailChecked] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastAction, setLastAction] = useState('Nenhuma ação.');
  const [formatos, setFormatos] = useState<CheckboxGroupValue>(['texto']);
  const [acao, setAcao] = useState('Nenhuma ação escolhida.');
  const [pagina, setPagina] = useState(1);
  const [ordem, setOrdem] = useState<ThSort>('none');
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

      <section aria-labelledby="vitrine-checkbox" className="space-y-3">
        <h2 id="vitrine-checkbox" className="text-lg font-semibold">
          Checkbox
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <Checkbox>Destaque na capa</Checkbox>
          <Checkbox defaultChecked>Publicado</Checkbox>
          <Checkbox checked indeterminate>
            Todas as seções
          </Checkbox>
          <Checkbox disabled>Arquivado</Checkbox>
        </div>
        <p id="vitrine-formatos" className="text-sm font-semibold">
          Formatos
        </p>
        <Checkbox.Group
          aria-labelledby="vitrine-formatos"
          value={formatos}
          onChange={(value) => setFormatos(value)}
        >
          <Checkbox value="texto">Texto</Checkbox>
          <Checkbox value="video">Vídeo</Checkbox>
          <Checkbox value="audio">Áudio</Checkbox>
        </Checkbox.Group>
        <p role="status" className="text-sm">
          Formatos escolhidos: {formatos.length === 0 ? 'nenhum' : formatos.join(', ')}.
        </p>
      </section>

      <section aria-labelledby="vitrine-select" className="space-y-3">
        <h2 id="vitrine-select" className="text-lg font-semibold">
          Select
        </h2>
        <FormContainer className="form-width">
          <FormItem label="Categoria">
            <Select<Opcao> options={CATEGORIAS} placeholder="Escolha a categoria" />
          </FormItem>
          <FormItem label="Categorias secundárias">
            <Select<Opcao, true>
              isMulti
              options={CATEGORIAS}
              defaultValue={[CATEGORIAS[1]!, CATEGORIAS[2]!]}
            />
          </FormItem>
          <FormItem label="Seção" invalid errorMessage="Escolha uma seção">
            <Select<Opcao> options={CATEGORIAS} placeholder="Nenhuma seção" />
          </FormItem>
          <FormItem label="Site">
            <Select<Opcao>
              componentAs={AsyncSelect}
              loadOptions={buscarSites}
              defaultOptions
              placeholder="Busque pelo nome"
            />
          </FormItem>
          <FormItem label="Palavra-chave">
            <Select<Opcao>
              componentAs={CreatableSelect}
              options={CATEGORIAS}
              placeholder="Escolha ou crie"
              formatCreateLabel={(valor) => `Criar "${valor}"`}
            />
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
          {/* Toast de dentro do diálogo (#212): continua anunciado com a página inerte. */}
          <Button
            size="sm"
            className="mb-6"
            onClick={() =>
              toast.push(<Notification type="info" title="Aviso de dentro do diálogo" />)
            }
          >
            Mostrar aviso
          </Button>
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

      <section aria-labelledby="vitrine-dropdown" className="space-y-3">
        <h2 id="vitrine-dropdown" className="text-lg font-semibold">
          Dropdown
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <Dropdown title="Ações do artigo" activeKey="editar">
            <Dropdown.Item variant="header">Artigo</Dropdown.Item>
            <Dropdown.Item eventKey="editar" onSelect={() => setAcao('Ação: editar.')}>
              Editar
            </Dropdown.Item>
            <Dropdown.Item eventKey="duplicar" disabled>
              Duplicar
            </Dropdown.Item>
            <Dropdown.Item eventKey="publicar" onSelect={() => setAcao('Ação: publicar.')}>
              Publicar
            </Dropdown.Item>
            <Dropdown.Item variant="divider" />
            <Dropdown.Menu title="Exportar">
              <Dropdown.Item eventKey="pdf" onSelect={() => setAcao('Ação: exportar PDF.')}>
                PDF
              </Dropdown.Item>
              <Dropdown.Item eventKey="csv" onSelect={() => setAcao('Ação: exportar CSV.')}>
                CSV
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
          <Dropdown title="Indisponível" disabled>
            <Dropdown.Item eventKey="nada">Nada</Dropdown.Item>
          </Dropdown>
        </div>
        <p role="status" className="text-sm">
          {acao}
        </p>
      </section>

      <section aria-labelledby="vitrine-tooltip" className="space-y-3">
        <h2 id="vitrine-tooltip" className="text-lg font-semibold">
          Tooltip
        </h2>
        <div className="flex flex-wrap items-center gap-6">
          <Tooltip title="Copia o endereço público do artigo">
            <Button>Copiar link</Button>
          </Tooltip>
          <Tooltip title="Abre o artigo publicado" placement="bottom">
            <Button variant="plain">Ver no site</Button>
          </Tooltip>
          <Tooltip title="Publicado há 2 dias" placement="right">
            Publicado
          </Tooltip>
        </div>
      </section>

      <section aria-labelledby="vitrine-icon-button" className="space-y-3">
        <h2 id="vitrine-icon-button" className="text-lg font-semibold">
          IconButton
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <IconButton label="Inserir link" icon={<PiLinkSimple />} />
          <IconButton label="Mover bloco 1 para cima" icon={<PiArrowUp />} aria-disabled />
        </div>
      </section>

      <section aria-labelledby="vitrine-alert" className="space-y-3">
        <h2 id="vitrine-alert" className="text-lg font-semibold">
          Alert
        </h2>
        <div className="space-y-3">
          <Alert type="info" showIcon duration={0}>
            A revisão do artigo começa amanhã.
          </Alert>
          <Alert type="success" showIcon duration={0} title="Artigo publicado">
            Ele já aparece no site.
          </Alert>
          <Alert type="warning" showIcon duration={0}>
            O site tem alterações pendentes de publicação.
          </Alert>
          <Alert type="danger" showIcon duration={0}>
            A última publicação falhou.
          </Alert>
          <Alert type="info" closable duration={0}>
            Aviso que pode ser fechado.
          </Alert>
        </div>
      </section>

      <section aria-labelledby="vitrine-toast" className="space-y-3">
        <h2 id="vitrine-toast" className="text-lg font-semibold">
          Toast
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() =>
              toast.push(
                <Notification type="success" title="Rascunho salvo" closable duration={2000}>
                  As alterações ficaram guardadas.
                </Notification>,
              )
            }
          >
            Mostrar toast de sucesso
          </Button>
          <Button
            onClick={() =>
              toast.push(
                <Notification type="danger" title="Falha ao publicar" duration={2000}>
                  Tente de novo em instantes.
                </Notification>,
              )
            }
          >
            Mostrar toast de erro
          </Button>
        </div>
      </section>

      <section aria-labelledby="vitrine-table" className="space-y-3">
        <h2 id="vitrine-table" className="text-lg font-semibold">
          Table
        </h2>
        <Card>
          <Table aria-label="Artigos">
            <Table.THead>
              <Table.Tr>
                <Table.Th sort={ordem}>
                  <button
                    type="button"
                    className="inline-flex min-h-6 items-center gap-1 uppercase"
                    onClick={() => setOrdem(NEXT_SORT[ordem])}
                  >
                    Título
                    <Table.Sorter sort={ordem === 'none' ? true : ordem} />
                  </button>
                </Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.THead>
            <Table.TBody>
              {[...ARTIGOS]
                .sort((a, b) =>
                  ordem === 'none'
                    ? 0
                    : (ordem === 'asc' ? 1 : -1) * a.titulo.localeCompare(b.titulo, 'pt-BR'),
                )
                .map((artigo) => (
                  <Table.Tr key={artigo.titulo}>
                    <Table.Td>{artigo.titulo}</Table.Td>
                    <Table.Td>{artigo.status}</Table.Td>
                  </Table.Tr>
                ))}
            </Table.TBody>
            <Table.TFoot>
              <Table.Tr>
                <Table.Td colSpan={2}>3 artigos</Table.Td>
              </Table.Tr>
            </Table.TFoot>
          </Table>
        </Card>
        <Card>
          <Table aria-label="Sites compactos" compact cellBorder hoverable={false}>
            <Table.THead>
              <Table.Tr>
                <Table.Th>Site</Table.Th>
                <Table.Th>Artigos</Table.Th>
              </Table.Tr>
            </Table.THead>
            <Table.TBody>
              <Table.Tr>
                <Table.Th scope="row">Exemplo A</Table.Th>
                <Table.Td>12</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th scope="row">Receitas da casa</Table.Th>
                <Table.Td>48</Table.Td>
              </Table.Tr>
            </Table.TBody>
          </Table>
        </Card>
      </section>

      <section aria-labelledby="vitrine-tabs" className="space-y-3">
        <h2 id="vitrine-tabs" className="text-lg font-semibold">
          Tabs
        </h2>
        <Card>
          <Tabs defaultValue="geral">
            <Tabs.TabList aria-label="Configuração do site">
              <Tabs.TabNav value="geral">Geral</Tabs.TabNav>
              <Tabs.TabNav value="seo" disabled>
                SEO
              </Tabs.TabNav>
              <Tabs.TabNav value="tema">Tema</Tabs.TabNav>
            </Tabs.TabList>
            <Tabs.TabContent value="geral" className="pt-4">
              Nome, domínio e idioma do site.
            </Tabs.TabContent>
            <Tabs.TabContent value="seo" className="pt-4">
              Título e descrição padrão.
            </Tabs.TabContent>
            <Tabs.TabContent value="tema" className="pt-4">
              Cores e fontes do site.
            </Tabs.TabContent>
          </Tabs>
        </Card>
        <Card>
          <Tabs defaultValue="rascunhos" variant="pill">
            <Tabs.TabList aria-label="Filtro de artigos">
              <Tabs.TabNav value="rascunhos">Rascunhos</Tabs.TabNav>
              <Tabs.TabNav value="publicados">Publicados</Tabs.TabNav>
            </Tabs.TabList>
            <Tabs.TabContent value="rascunhos" className="pt-4">
              2 rascunhos.
            </Tabs.TabContent>
            <Tabs.TabContent value="publicados" className="pt-4">
              10 publicados.
            </Tabs.TabContent>
          </Tabs>
        </Card>
      </section>

      <section aria-labelledby="vitrine-pagination" className="space-y-3">
        <h2 id="vitrine-pagination" className="text-lg font-semibold">
          Pagination
        </h2>
        <Card>
          <div className="space-y-4">
            <Pagination total={100} pageSize={10} displayTotal onChange={setPagina} />
            <p role="status" className="text-sm">
              Página escolhida: {pagina}.
            </p>
          </div>
        </Card>
        <Card>
          <div className="space-y-4">
            <Pagination
              total={200}
              pageSize={10}
              currentPage={linkPage}
              getPageHref={(n) => `/teste-de-componentes?pagina-link=${n}`}
            />
            <p className="text-sm">Página na URL: {linkPage}.</p>
          </div>
        </Card>
      </section>

      <DataTableShowcase />

      <MenuShowcase />

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
          className="w-fit rounded-md bg-gray-100 px-3 py-2 text-sm dark:bg-gray-800"
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
        <Avatar.Group chained maxCount={3} omittedAvatarTooltip>
          <Avatar>AS</Avatar>
          <Avatar>MR</Avatar>
          <Avatar>JP</Avatar>
          <Avatar>LC</Avatar>
          <Avatar>TF</Avatar>
        </Avatar.Group>
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
          className="h-[150vh] rounded-md border border-gray-200 p-4 text-sm dark:border-gray-700"
        >
          Área longa para rolar.
        </div>
        <StickyFooter
          stickyClass="bottom-0 border-t border-gray-200 bg-neutral px-4 py-3 dark:border-gray-700 dark:bg-gray-950"
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
