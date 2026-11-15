import { calculateSlopeMapColors } from '../color/slopeMap';

type RgbMinMax = {
  min: [number, number, number];
  max: [number, number, number];
};

type SlopeWorkerRequest = {
  positions: Float32Array;
  rgbMinMax: RgbMinMax;
};

self.onmessage = (event: MessageEvent<SlopeWorkerRequest>) => {
  try {
    const colors = calculateSlopeMapColors(event.data.positions, event.data.rgbMinMax);
    self.postMessage({ colors }, [colors.buffer]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ error: message });
  }
};
