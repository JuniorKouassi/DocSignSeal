import { readFile } from 'node:fs/promises';
import { getPageCount, renderPageToPng } from '../src/render.mjs';

// Fixture lives in the main app; this container has no PDFs of its own.
const bytes = await readFile(new URL('../../../design/flatten-example-output.pdf', import.meta.url));

const count = await getPageCount(bytes);
console.log('1. page count        :', count === 3);

const png = await renderPageToPng(bytes, 1);
console.log('2. png signature     :', png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47);
console.log('3. non-trivial size  :', png.length > 1000);
