import { editorialListPage } from '../editorial-pages.tsx';

const page = editorialListPage('taxonomy');

export default page.default;
export const generateMetadata = page.generateMetadata;
export const dynamic = 'force-dynamic';
