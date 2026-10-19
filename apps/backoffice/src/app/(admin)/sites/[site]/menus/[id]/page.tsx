import { editorialEditPage } from '../../editorial-pages.tsx';

const page = editorialEditPage('menu');

export default page.default;
export const generateMetadata = page.generateMetadata;
export const dynamic = 'force-dynamic';
