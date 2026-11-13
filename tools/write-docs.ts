import { writeFileSync } from 'node:fs';
import { DOCS } from './docs.ts';

// npm run docs: rewrites the reference documents from src/config.ts.
for (const doc of DOCS) {
  writeFileSync(new URL(`../${doc.path}`, import.meta.url), doc.render());
  console.log(`wrote ${doc.path}`);
}
