import { editorialCreatePage } from '../../editorial-pages.tsx';

const page = editorialCreatePage('taxonomy');

export default page.default;
export const generateMetadata = page.generateMetadata;
export const dynamic = 'force-dynamic';
