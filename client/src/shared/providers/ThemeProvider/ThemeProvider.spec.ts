import { cleanup, render } from '@testing-library/react';
import { createElement, useContext } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from './ThemeProvider';
import { ThemeContext } from './themeContext';

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

  it('defaults the weight unit to kg with no stored preference', () => {
    let seen: string | undefined;
    function Probe() {
      seen = useContext(ThemeContext).weightUnit;
      return null;
    }

    render(
      createElement(ThemeProvider, { theme: 'customer' }, createElement(Probe))
    );

    expect(seen).toBe('kg');
  });
});
