import { beforeEach, describe, expect, it, vi } from 'vitest';

const rendererMocks = vi.hoisted(() => ({
  createRoot: vi.fn(),
  render: vi.fn(),
}));

vi.mock('react-dom/client', () => ({
  createRoot: rendererMocks.createRoot,
}));

vi.mock('../OAuth.jsx', () => ({
  default: () => <div data-testid="oauth" />,
}));

vi.mock('@clerk/electron/react', () => ({
  ClerkProvider: ({ children }) => children,
}));

describe('renderer entry point', () => {
  beforeEach(() => {
    rendererMocks.createRoot.mockReset().mockReturnValue({ render: rendererMocks.render });
    rendererMocks.render.mockReset();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('mounts the OAuth app inside Clerk and React strict mode', async () => {
    await import('../renderer');

    expect(rendererMocks.createRoot).toHaveBeenCalledWith(document.getElementById('root'));
    expect(rendererMocks.render).toHaveBeenCalledOnce();

    const tree = rendererMocks.render.mock.calls[0][0];
    expect(tree.type).toBe((await import('react')).default.StrictMode);
    expect(tree.props.children.props.publishableKey).toBe('pk_test_component_tests');
  });
});
