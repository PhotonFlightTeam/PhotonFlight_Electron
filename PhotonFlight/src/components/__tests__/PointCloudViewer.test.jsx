import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from '@loaders.gl/core';
import PointCloudViewer from '../PointCloudViewer';
import useStore from '../../useStore';

vi.mock('@loaders.gl/core', () => ({
  load: vi.fn(),
}));

vi.mock('@react-three/drei', () => ({
  Grid: () => <div data-testid="point-cloud-grid" />,
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

  it('applies the height color map when height mode is selected', async () => {
    vi.mocked(load).mockResolvedValue({
      attributes: { POSITION: { value: new Float32Array([0, 0, 10, 1, 0, 20]) } },
    });

    const { container } = render(
      <PointCloudViewer fileUrl="cloud.laz" active="height" pointsRef={{ current: null }} />,
    );

    await waitFor(() => {
      expect(useStore.getState().colors).toEqual(new Float32Array([0, 1, 0, 1, 0, 0]));
    });
    expect(container.querySelector('pointsmaterial')).toHaveAttribute('color', '#ffffff');
  });

  it('applies the slope color map when slope mode is selected', async () => {
    vi.mocked(load).mockResolvedValue({
      attributes: { POSITION: { value: new Float32Array([0, 0, 0, 0.1, 0, 1]) } },
    });

    render(
      <PointCloudViewer fileUrl="cloud.laz" active="slope" pointsRef={{ current: null }} />,
    );

    const mappedSlope = new Float32Array([10 / 12])[0];
    await waitFor(() => {
      expect(useStore.getState().colors).toEqual(new Float32Array([
        mappedSlope, 1 - mappedSlope, 0,
        mappedSlope, 1 - mappedSlope, 0,
      ]));
    });
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
