import { expect, test } from 'vitest';
import { classifyDescription } from '../src/core/job-description.js';

const body = 'Responsibilities: Design intuitive interfaces and download more datasets with the engineering team. Requirements: Experience with TypeScript and SQL, testing and collaborative development.';

for (const source of ['linkedin', 'indeed']) {
  for (const format of ['text', 'html'] as const) {
    const classify = (content: string) => classifyDescription({
      text: format === 'text' ? content : `<html><section ${source === 'linkedin' ? 'class="show-more-less-html__markup"' : 'id="jobDescriptionText"'}>${content}</section></html>`,
      source, format, operatorConfirmed: true,
    });

    for (const entity of ['&nbsp;', '&NonBreakingSpace;', '&ensp;', '&emsp;', '&emsp13;', '&emsp14;', '&numsp;', '&puncsp;', '&thinsp;', '&ThinSpace;', '&hairsp;', '&VeryThinSpace;', '&MediumSpace;', '&ThickSpace;', '&NegativeMediumSpace;', '&NegativeThickSpace;', '&NegativeThinSpace;', '&NegativeVeryThinSpace;', '&Tab;', '&NewLine;']) {
      test.each([
        ['Sign in to view this job', 'needs_login'],
        ['Verify you are human', 'blocked'],
        ['Show more', 'partial'],
        ['Job has expired', 'expired'],
      ])(`${source} ${format} ${entity} holds %s`, (marker, status) => {
        expect(classify(`${body} ${marker.replaceAll(' ', entity)}`).status).toBe(status);
      });

      test(`${source} ${format} ${entity} accepts ordinary prose`, () => {
        expect(classify(body.replaceAll(' ', entity)).status).toBe(format === 'text' ? 'complete_operator_confirmed' : 'complete');
      });
    }
  }
}
