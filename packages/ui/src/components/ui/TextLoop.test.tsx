import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { TextLoop } from './TextLoop';

describe('TextLoop', () => {
  test('hides its sizing-only content from assistive technology', () => {
    const markup = renderToStaticMarkup(
      <TextLoop trigger={false}>
        <span>Visible slide</span>
        <span>Sizing-only slide</span>
      </TextLoop>,
    );

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('Visible slide');
    expect(markup).toContain('Sizing-only slide');
  });

  test('can omit sizing-only content when the parent controls layout width', () => {
    const markup = renderToStaticMarkup(
      <TextLoop trigger={false} reserveSpace={false}>
        <span>Visible slide</span>
        <span>Sizing-only slide</span>
      </TextLoop>,
    );

    expect(markup.match(/Visible slide/g)?.length).toBe(1);
    expect(markup).not.toContain('invisible whitespace-nowrap');
  });
});
