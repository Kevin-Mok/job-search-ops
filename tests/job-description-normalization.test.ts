import { expect, test } from 'vitest';
import { classifyDescription } from '../src/core/job-description.js';

const body = 'Responsibilities: Build reliable services and review changes with the engineering team. Requirements: Experience with TypeScript and SQL, testing and collaborative development.';

for (const source of ['linkedin', 'indeed']) {
  for (const format of ['text', 'html'] as const) {
    test.each([
      ['Sign\nin to view this job', 'needs_login'],
      ['Log\tin to continue', 'needs_login'],
      ['Login\nrequired', 'needs_login'],
      ['Join\nnow', 'needs_login'],
      ['Sign\nup to view', 'needs_login'],
      [`Join\n${source} to view`, 'needs_login'],
      ['Verify that you are\nhuman', 'blocked'],
      ['Security\nchallenge', 'blocked'],
      ['Access\ndenied', 'blocked'],
      ['Unusual\ntraffic', 'blocked'],
      ['Show\nmore', 'partial'],
    ])(`${source} ${format} holds normalized %s`, (marker, status) => {
      const content = `${body} ${format === 'html' ? marker.replace(/\s/g, '<span> </span>') : marker}`;
      const text = format === 'text' ? content : `<html><section ${source === 'linkedin' ? 'class="show-more-less-html__markup"' : 'id="jobDescriptionText"'}>${content}</section></html>`;
      expect(classifyDescription({ text, format, source, operatorConfirmed: true }).status).toBe(status);
    });

    test.each(['<input type="password">', '<div class="authwall"></div>', '<a href="https://secure.indeed.com/auth">Continue</a>', '<div id="captcha"></div>', '<div class="cloudflare"></div>'])(`${source} ${format} retains raw structural hold %s`, marker => {
      expect(classifyDescription({ text: `${body} ${marker}`, format, source, operatorConfirmed: true }).status).toBe(/captcha|cloudflare/.test(marker) ? 'blocked' : 'needs_login');
    });
  }
}
