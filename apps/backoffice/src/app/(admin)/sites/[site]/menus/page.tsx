import { editorialListPage } from '../editorial-pages.tsx';

const page = editorialListPage('menu');

export default page.default;
export const generateMetadata = page.generateMetadata;
export const dynamic = 'force-dynamic';
