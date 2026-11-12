import { expect, test } from 'vitest';
import { classifyDescription } from '../src/core/job-description.js';

const body = 'Responsibilities: Build reliable services with the engineering team and review changes. Requirements: Experience with TypeScript and SQL, testing and collaborative development.';

for (const source of ['linkedin', 'indeed']) {
  for (const format of ['text', 'html'] as const) {
    const classify = (content: string, operatorConfirmed = true) => classifyDescription({
      text: format === 'text' ? content : `<html><section ${source === 'linkedin' ? 'class="show-more-less-html__markup"' : 'id="jobDescriptionText"'}>${content}</section></html>`,
      source, format, operatorConfirmed,
    });

    test.each(['Design intuitive interfaces', 'download more datasets'])(`${source} ${format} accepts complete prose containing %s`, phrase => {
      expect(classify(`${body} Responsibilities: ${phrase}.`).status).toBe(format === 'text' ? 'complete_operator_confirmed' : 'complete');
    });

    test.each([
      ['Sign in to view this job', 'needs_login'],
      ['SIGN-IN', 'needs_login'],
      ['Login required', 'needs_login'],
      ['Log in to continue', 'needs_login'],
      ['Join now', 'needs_login'],
      ['Sign up to view', 'needs_login'],
      ['Join LinkedIn to view', 'needs_login'],
      ['Join Indeed to view', 'needs_login'],
      ['authwall', 'needs_login'],
      ['secure.indeed.com/auth', 'needs_login'],
      ['<input type="password">', 'needs_login'],
      ['Show more', 'partial'],
      ['LOAD MORE', 'partial'],
      ['Read more', 'partial'],
      ['See more', 'partial'],
      ['View full description', 'partial'],
      ['View full job description', 'partial'],
      ['Truncated', 'partial'],
      ['Truncation', 'partial'],
      ['Job snippet', 'partial'],
      ['…', 'partial'],
      ['...', 'partial'],
      ['&#x2026;', 'partial'],
      ['Verify that you are human', 'blocked'],
      ['CAPTCHA', 'blocked'],
      ['Security challenge', 'blocked'],
      ['Job has expired', 'expired'],
    ])(`${source} ${format} retains the hold for %s`, (marker, status) => {
      expect(classify(`${body} (${marker})`).status).toBe(status);
    });

    if (format === 'text') {
      test(`${source} complete prose still requires operator confirmation`, () => {
        expect(classify(`${body} Design intuitive interfaces and download more datasets.`, false).status).toBe('layout_unknown');
      });
    }
  }
}
