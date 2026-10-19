import { editorialEditPage } from '../../editorial-pages.tsx';

const page = editorialEditPage('taxonomy');

export default page.default;
export const generateMetadata = page.generateMetadata;
export const dynamic = 'force-dynamic';
