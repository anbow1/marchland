import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOCS } from '../tools/docs.ts';

// The reference documents are written from the game's own numbers. This fails
// when a rule changed and the documents were not regenerated: run `npm run docs`.
describe('reference documents', () => {
  for (const doc of DOCS) {
    it(`${doc.path} matches the rules in src/config.ts`, () => {
      const onDisk = readFileSync(new URL(`../${doc.path}`, import.meta.url), 'utf8');
      expect(onDisk, `${doc.path} is out of date: run 'npm run docs'`).toBe(doc.render());
    });
  }
});
