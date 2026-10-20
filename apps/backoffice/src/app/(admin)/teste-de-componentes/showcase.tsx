'use client';

import { motion } from 'motion/react';
import { useState } from 'react';
import { PiArrowUp, PiLinkSimple, PiPlus } from 'react-icons/pi';
import AsyncSelect from 'react-select/async';
import CreatableSelect from 'react-select/creatable';

import AdaptiveCard from '@/components/shared/AdaptiveCard';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import Container from '@/components/shared/Container';
import EllipsisButton from '@/components/shared/EllipsisButton';
import { IconButton } from '@/components/shared/IconButton';
import { InfoField, InfoList } from '@/components/shared/InfoList';
import Loading from '@/components/shared/Loading';
import MediaSkeleton from '@/components/shared/loaders/MediaSkeleton';
import { PageMeta } from '@/components/shared/PageMeta';
import TextBlockSkeleton from '@/components/shared/loaders/TextBlockSkeleton';
import StickyFooter from '@/components/shared/StickyFooter';
import BottomStickyBar from '@/components/template/BottomStickyBar';
import { StateTag } from '@/components/sites/SiteStatus';
import { PAGE_CONTAINER_GUTTER_X } from '@/components/template/constants';
import { Alert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox, type CheckboxGroupValue } from '@/components/ui/Checkbox';
import { DateTimepicker } from '@/components/ui/DatePicker';
import { toZonedDate } from '@/components/ui/DatePicker/utils';
import { Dialog } from '@/components/ui/Dialog';
import { Drawer } from '@/components/ui/Drawer';
import { Dropdown } from '@/components/ui/Dropdown';
import { FormContainer, FormItem } from '@/components/ui/Form';
import { Input } from '@/components/ui/Input';
import { InputGroup } from '@/components/ui/InputGroup';
import { Notification } from '@/components/ui/Notification';
import { Pagination } from '@/components/ui/Pagination';
import { Progress } from '@/components/ui/Progress';
import { Radio, type RadioValue } from '@/components/ui/Radio';
import { Segment, type SegmentValue } from '@/components/ui/Segment';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { Steps } from '@/components/ui/Steps';
import { Switcher } from '@/components/ui/Switcher';
import { Table, type ThSort } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { Tag } from '@/components/ui/Tag';
import { TimeInput } from '@/components/ui/TimeInput';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/Tooltip';
import { Upload } from '@/components/ui/Upload';

import { DataTableShowcase } from './data-table-showcase.tsx';
import { FormsShowcase } from './forms-showcase.tsx';
import { MediaShowcase } from './media-showcase.tsx';
import { MenuShowcase } from './menu-showcase.tsx';
import { StatesShowcase } from './states-showcase.tsx';

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
/** Horário fixo da vitrine (hora local dos dois lados): o servidor e o navegador desenham o mesmo. */
const HORARIO_INICIAL = new Date(2026, 0, 1, 9, 30);

function formatarHorario(date: Date | null) {
  if (!date) return 'nenhum';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Fuso do site na vitrine do DateTimepicker (#318): outro que o do navegador e o do servidor. */
const FUSO_DO_SITE = 'Europe/Lisbon';

/** Instante fixo da vitrine: 13:00 de 15/07/2026 em Lisboa (verão, UTC+1). */
const PUBLICACAO_INICIAL = new Date('2026-07-15T12:00:00Z');

/** Instante → ISO com o offset do fuso naquele instante, como o `IsoDateTimeSchema` grava. */
function isoNoFuso(date: Date | null, timeZone: string) {
  if (!date) return 'nenhum';
  const wall = toZonedDate(date, timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');
  const seconds = Math.floor(date.getTime() / 1000) * 1000;
  const offset = Math.round(
    (Date.UTC(
      wall.getFullYear(),
      wall.getMonth(),
      wall.getDate(),
      wall.getHours(),
      wall.getMinutes(),
      wall.getSeconds(),
    ) -
      seconds) /
      60_000,
  );
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return (
    `${wall.getFullYear()}-${pad(wall.getMonth() + 1)}-${pad(wall.getDate())}` +
    `T${pad(wall.getHours())}:${pad(wall.getMinutes())}:${pad(wall.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Arquivo já escolhido no Upload da vitrine: mostra a lista desde o servidor. */
const PAUTA = new File(['%PDF-1.7'], 'pauta-da-semana.pdf', { type: 'application/pdf' });
const ANEXOS_INICIAIS = [PAUTA];

/**
 * Valor de 120 caracteres sem espaço nem hífen (o pior caso de slug ou URL, sem ponto de quebra
 * natural): quebra dentro da lista de dados (#368).
 */
const LONG_VALUE = 'guiacompleto'.repeat(10);

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
  const [comentarios, setComentarios] = useState(true);
  const [tema, setTema] = useState<RadioValue>('claro');
  const [visualizacao, setVisualizacao] = useState<SegmentValue>('lista');
  const [canais, setCanais] = useState<SegmentValue>(['site']);
  const [horario, setHorario] = useState<Date | null>(HORARIO_INICIAL);
  const [publicacao, setPublicacao] = useState<Date | null>(PUBLICACAO_INICIAL);
  const [anexos, setAnexos] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [ordem, setOrdem] = useState<ThSort>('none');
  const [etapa, setEtapa] = useState(1);
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
          <Button variant="solid" icon={<PiPlus aria-hidden />}>
            Com ícone
          </Button>
          <Button icon={<PiPlus aria-hidden />} aria-label="Só ícone" />
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

      <section aria-labelledby="vitrine-switcher" className="space-y-3">
        <h2 id="vitrine-switcher" className="text-lg font-semibold">
          Switcher
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <Switcher
            aria-label="Comentários abertos"
            checked={comentarios}
            onChange={(checked) => setComentarios(checked)}
          />
          <Switcher aria-label="Destaque na home" defaultChecked />
          <Switcher
            aria-label="Newsletter"
            checkedContent="Sim"
            unCheckedContent="Não"
            defaultChecked
          />
          <Switcher aria-label="Rascunho automático" checkedContent="Sim" unCheckedContent="Não" />
          <Switcher aria-label="Sincronizando" isLoading defaultChecked />
          <Switcher aria-label="Indisponível" disabled />
        </div>
        <p role="status" className="text-sm">
          Comentários {comentarios ? 'abertos' : 'fechados'}.
        </p>
      </section>

      <section aria-labelledby="vitrine-radio" className="space-y-3">
        <h2 id="vitrine-radio" className="text-lg font-semibold">
          Radio
        </h2>
        <p id="vitrine-tema" className="text-sm font-semibold">
          Tema do site
        </p>
        <Radio.Group
          aria-labelledby="vitrine-tema"
          name="vitrine-tema"
          value={tema}
          onChange={(value) => setTema(value)}
        >
          <Radio value="claro">Claro</Radio>
          <Radio value="escuro">Escuro</Radio>
          <Radio value="sistema">Sistema</Radio>
          <Radio value="alto-contraste" disabled>
            Alto contraste
          </Radio>
        </Radio.Group>
        <p role="status" className="text-sm">
          Tema escolhido: {tema}.
        </p>
        <Radio.Group aria-label="Frequência" vertical value="semanal">
          <Radio value="diaria">Diária</Radio>
          <Radio value="semanal">Semanal</Radio>
        </Radio.Group>
      </section>

      <section aria-labelledby="vitrine-segment" className="space-y-3">
        <h2 id="vitrine-segment" className="text-lg font-semibold">
          Segment
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <Segment
            aria-label="Visualização"
            value={visualizacao}
            onChange={(value) => setVisualizacao(value)}
          >
            <Segment.Item value="lista">Lista</Segment.Item>
            <Segment.Item value="grade">Grade</Segment.Item>
            <Segment.Item value="calendario" disabled>
              Calendário
            </Segment.Item>
          </Segment>
          <Segment
            aria-label="Canais"
            size="sm"
            selectionType="multiple"
            value={canais}
            onChange={(value) => setCanais(value)}
          >
            <Segment.Item value="site">Site</Segment.Item>
            <Segment.Item value="newsletter">Newsletter</Segment.Item>
            <Segment.Item value="redes">Redes</Segment.Item>
          </Segment>
        </div>
        <p role="status" className="text-sm">
          Visualização: {String(visualizacao)}. Canais:{' '}
          {canais.length === 0 ? 'nenhum' : [canais].flat().join(', ')}.
        </p>
      </section>

      <section aria-labelledby="vitrine-time-input" className="space-y-3">
        <h2 id="vitrine-time-input" className="text-lg font-semibold">
          TimeInput
        </h2>
        <FormContainer className="form-width">
          <FormItem label="Horário de publicação">
            <TimeInput value={horario} onChange={setHorario} />
          </FormItem>
          <FormItem label="Horário do lembrete" invalid errorMessage="Informe o horário">
            <TimeInput />
          </FormItem>
          <FormItem label="Horário em 12 h">
            <TimeInput format="12" showSeconds defaultValue={HORARIO_INICIAL} />
          </FormItem>
          <FormItem label="Horário bloqueado">
            <TimeInput disabled defaultValue={HORARIO_INICIAL} />
          </FormItem>
        </FormContainer>
        <p role="status" className="text-sm">
          Horário de publicação: {formatarHorario(horario)}.
        </p>
      </section>

      <section aria-labelledby="vitrine-date-time-picker" className="space-y-3">
        <h2 id="vitrine-date-time-picker" className="text-lg font-semibold">
          DateTimepicker
        </h2>
        <p className="text-sm">Fuso do site: {FUSO_DO_SITE}.</p>
        <FormContainer className="form-width">
          <FormItem label="Data de publicação">
            <DateTimepicker value={publicacao} timeZone={FUSO_DO_SITE} onChange={setPublicacao} />
          </FormItem>
          <FormItem label="Data bloqueada">
            <DateTimepicker disabled defaultValue={PUBLICACAO_INICIAL} timeZone={FUSO_DO_SITE} />
          </FormItem>
        </FormContainer>
        <p role="status" className="text-sm">
          Valor devolvido: {isoNoFuso(publicacao, FUSO_DO_SITE)}.
        </p>
      </section>

      <section aria-labelledby="vitrine-upload" className="space-y-3">
        <h2 id="vitrine-upload" className="text-lg font-semibold">
          Upload
        </h2>
        <Upload
          draggable
          multiple
          className="w-full form-width"
          onChange={(files) => setAnexos(files.length)}
          onFileRemove={(files) => setAnexos(files.length)}
        />
        <p role="status" className="text-sm">
          Anexos escolhidos: {anexos}.
        </p>
        <Upload
          fileList={ANEXOS_INICIAIS}
          fileListClass="form-width"
          tip={<p className="mt-2 text-sm">PDF ou imagem, um por vez.</p>}
          uploadLimit={1}
        />
        <Upload draggable disabled className="w-full form-width">
          <span>Envio bloqueado</span>
        </Upload>
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

      <section aria-labelledby="vitrine-ellipsis-button" className="space-y-3">
        <h2 id="vitrine-ellipsis-button" className="text-lg font-semibold">
          EllipsisButton
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <EllipsisButton aria-label="Mais ações do site" />
          <EllipsisButton variant="default" shape="round">
            Mais ações
          </EllipsisButton>
        </div>
      </section>

      <section aria-labelledby="vitrine-container" className="space-y-3">
        <h2 id="vitrine-container" className="text-lg font-semibold">
          Container
        </h2>
        <Container
          asElement="article"
          className="rounded-md border border-gray-200 p-4 text-sm dark:border-gray-700"
        >
          Conteúdo centralizado na largura do breakpoint.
        </Container>
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

      <section aria-labelledby="vitrine-progress" className="space-y-3">
        <h2 id="vitrine-progress" className="text-lg font-semibold">
          Progress
        </h2>
        <Card>
          <div className="space-y-4">
            <div className="space-y-1">
              <p id="progresso-envio" className="text-sm">
                Envio de capa.jpg
              </p>
              <Progress percent={45} aria-labelledby="progresso-envio" />
            </div>
            <Progress percent={80} size="sm" aria-label="Processamento das variantes" />
            <Progress percent={100} showInfo={false} aria-label="Build concluído" />
            <div className="flex flex-wrap items-center gap-6">
              <Progress variant="circle" percent={30} width={96} aria-label="Artigos revisados" />
              <Progress
                variant="circle"
                percent={75}
                width={96}
                gapDegree={70}
                gapPosition="bottom"
                customInfo="3/4"
                aria-label="Etapas do build"
              />
            </div>
          </div>
        </Card>
      </section>

      <section aria-labelledby="vitrine-steps" className="space-y-3">
        <h2 id="vitrine-steps" className="text-lg font-semibold">
          Steps
        </h2>
        <Steps current={1}>
          <Steps.Item title="Criado" />
          <Steps.Item title="Configurado" />
          <Steps.Item title="Publicado" />
        </Steps>
        <Card>
          <div className="space-y-4">
            <Steps current={etapa} onChange={setEtapa}>
              <Steps.Item title="Conteúdo" />
              <Steps.Item title="Revisão" />
              <Steps.Item title="Publicação" />
            </Steps>
            <p role="status" className="text-sm">
              Etapa escolhida: {etapa + 1}.
            </p>
          </div>
        </Card>
        <Card>
          <Steps vertical current={2} status="error">
            <Steps.Item title="Render" description="Páginas geradas." />
            <Steps.Item title="Verificação" description="Links e imagens conferidos." />
            <Steps.Item title="Publicação" description="O deploy falhou." />
          </Steps>
        </Card>
      </section>

      <DataTableShowcase />

      <MenuShowcase />

      <StatesShowcase />

      <FormsShowcase />

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

      <section aria-labelledby="vitrine-lista-de-dados" className="space-y-3">
        <h2 id="vitrine-lista-de-dados" className="text-lg font-semibold">
          Lista de dados e linha de metadados
        </h2>
        <PageMeta
          items={[
            <StateTag key="estado" color="bg-success">
              Publicado
            </StateTag>,
            'Versão 3',
            'Atualizada em 01/10/2026, 12:30 BRT',
          ]}
        />
        <Card>
          <InfoList className="sm:grid-cols-2">
            <InfoField label="Domínio">exemplo-a.test</InfoField>
            <InfoField label="Identificador" className="tabular-nums">
              42
            </InfoField>
            <InfoField label="Slug">
              <span data-vitrine-valor-longo="">{LONG_VALUE}</span>
            </InfoField>
            <InfoField label="Estado">
              <StateTag color="bg-warning">Em revisão</StateTag>
            </InfoField>
          </InfoList>
        </Card>
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

      {/* Barra de ações do formulário (#322): presa ao fim da janela enquanto a seção rola,
          encostada nas bordas do `main`. Vem antes do "Rodapé fixo", que precisa ser o último. */}
      <section aria-labelledby="vitrine-barra-de-acoes" className="space-y-3">
        <h2 id="vitrine-barra-de-acoes" className="text-lg font-semibold">
          BottomStickyBar
        </h2>
        <div
          data-vitrine-rolagem-barra=""
          className="h-[120vh] rounded-md border border-gray-200 p-4 text-sm dark:border-gray-700"
        >
          Formulário longo para rolar.
        </div>
        <BottomStickyBar>
          <Container>
            <div className={`flex items-center justify-between gap-3 ${PAGE_CONTAINER_GUTTER_X}`}>
              <EllipsisButton aria-label="Mais ações do formulário" />
              <div className="flex items-center gap-3">
                <Button type="button">Descartar</Button>
                <Button type="button" variant="solid">
                  Publicar
                </Button>
              </div>
            </div>
          </Container>
        </BottomStickyBar>
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
