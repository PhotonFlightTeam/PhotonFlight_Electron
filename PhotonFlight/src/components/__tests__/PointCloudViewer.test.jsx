import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from '@loaders.gl/core';
import PointCloudViewer from '../PointCloudViewer';
import useStore from '../../useStore';

vi.mock('@loaders.gl/core', () => ({
  load: vi.fn(),
}));

describe('PointCloudViewer', () => {
  beforeEach(() => {
    useStore.setState({ colors: null, positions: null, min: [0, 1, 0], max: [1, 0, 0] });
    vi.mocked(load).mockReset();
  });

  it('loads point positions into the store and renders the point cloud', async () => {
    const positions = new Float32Array([1, 2, 3, 4, 5, 6]);
    vi.mocked(load).mockResolvedValue({
      attributes: { POSITION: { value: positions } },
    });
    const { container } = render(
      <PointCloudViewer fileUrl="cloud.laz" active="base" pointsRef={{ current: null }} />,
    );

    await waitFor(() => expect(container.querySelector('points')).toBeInTheDocument());

    expect(load).toHaveBeenCalledWith('cloud.laz', expect.anything());
    expect(useStore.getState().positions).toBe(positions);
  });

  it('renders nothing when no file is selected', () => {
    const { container } = render(
      <PointCloudViewer fileUrl={null} active="base" pointsRef={{ current: null }} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(load).not.toHaveBeenCalled();
  });

  it('renders nothing and reports a parse error when loading fails', async () => {
    const error = new Error('invalid data');
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(load).mockRejectedValue(error);

    const { container } = render(
      <PointCloudViewer fileUrl="broken.laz" active="base" pointsRef={{ current: null }} />,
    );

    await waitFor(() => expect(logError).toHaveBeenCalledWith('Failed to parse LAS file:', error));
    expect(container).toBeEmptyDOMElement();
    logError.mockRestore();
  });
});
