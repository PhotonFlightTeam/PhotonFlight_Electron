import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PluginIcon } from '../PluginLibrary';

describe('PluginIcon', () => {
  it('shows the plugin image and accessible name when an icon is provided', () => {
    render(<PluginIcon plugin={{ name: 'Terrain Map', icon: '/terrain.png' }} />);

    expect(screen.getByRole('img', { name: 'Terrain Map' })).toHaveAttribute(
      'src',
      '/terrain.png',
    );
  });

  it('falls back to the uppercase initial when no icon is provided', () => {
    render(<PluginIcon plugin={{ name: 'terrain map' }} className="plugin-avatar" />);

    expect(screen.getByText('T')).toHaveClass('plugin-avatar');
  });
});
