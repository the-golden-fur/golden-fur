import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from './ThemeProvider';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeProvider', () => {
  it('applies the requested theme attribute to the document root', () => {
    render(
      createElement(
        ThemeProvider,
        { theme: 'customer' },
        createElement('div', null, 'theme content')
      )
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe(
      'customer'
    );
  });

  it('defaults --font-scale to 1 (Medium) with no stored preference', () => {
    render(
      createElement(
        ThemeProvider,
        { theme: 'customer' },
        createElement('div', null, 'theme content')
      )
    );

    expect(
      document.documentElement.style.getPropertyValue('--font-scale')
    ).toBe('1');
  });
});
