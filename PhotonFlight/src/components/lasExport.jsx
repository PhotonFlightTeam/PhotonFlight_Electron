import { load } from '@loaders.gl/core';
import { LASLoader } from '@loaders.gl/las';

const HEADER_SIZE = 227; // LAS 1.2
const VLR_HEADER_SIZE = 54;
const COMPRESSED_FLAGS = 0xc0; // LASzip sets these bits on the point format byte. DO NOT CHANGE THIS I WILL EXPLODE YOU
const decoder = new TextDecoder('ascii');

function isCompressed(buffer) {
  return (new DataView(buffer).getUint8(104) & COMPRESSED_FLAGS) !== 0;
}

// VLRs hold the coordinate system. Keep them, except LASzip's, which only describes compression.
function copyVlrs(source) {
  const view = new DataView(source);
  const pointDataStart = view.getUint32(96, true);
  const count = view.getUint32(100, true);
  const vlrs = [];
  let offset = view.getUint16(94, true);

  for (let i = 0; i < count && offset + VLR_HEADER_SIZE <= pointDataStart; i++) {
    const size = VLR_HEADER_SIZE + view.getUint16(offset + 20, true);
    if (offset + size > pointDataStart) break;

    const userId = decoder.decode(new Uint8Array(source, offset + 2, 16));
    if (!userId.startsWith('laszip encoded')) vlrs.push(new Uint8Array(source, offset, size));
    offset += size;
  }
  return vlrs;
}

function writeText(bytes, offset, text) {
  for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
}

// Writes parsed points as uncompressed LAS 1.2 (point format 2 with color, 0 without)
export function encodeLas(mesh, source) {
  const positions = mesh.attributes.POSITION.value;
  const intensity = mesh.attributes.intensity.value;
  const classification = mesh.attributes.classification.value;
  const colors = mesh.attributes.COLOR_0?.value ?? null;
  const { scale, offset } = mesh.loaderData;

  const pointCount = positions.length / 3;
  const pointFormat = colors ? 2 : 0;
  const recordSize = colors ? 26 : 20;
  const vlrs = copyVlrs(source);
  const pointDataStart = HEADER_SIZE + vlrs.reduce((sum, vlr) => sum + vlr.length, 0);

  const bytes = new Uint8Array(pointDataStart + pointCount * recordSize);
  const view = new DataView(bytes.buffer);
  const mins = [Infinity, Infinity, Infinity];
  const maxs = [-Infinity, -Infinity, -Infinity];

  let cursor = pointDataStart;
  for (let i = 0; i < pointCount; i++) {
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[i * 3 + axis];
      if (value < mins[axis]) mins[axis] = value;
      if (value > maxs[axis]) maxs[axis] = value;
      // LAS stores coordinates as integers: value = stored * scale + offset. Might want to doublecheck this rounding, but it seems to be what the LASzip encoder does. - Tim
      view.setInt32(cursor + axis * 4, Math.round((value - offset[axis]) / scale[axis]), true);
    }
    view.setUint16(cursor + 12, intensity[i], true);
    bytes[cursor + 14] = 0b00001001; // AGAIN, DO NOT TOUCH THIS BY GOD DON'T DO IT
    bytes[cursor + 15] = classification[i];

    if (colors) {
      // (255 * 257) = 65535, the max value for a 16-bit unsigned integer. 
      
      view.setUint16(cursor + 22, colors[i * 4 + 1] * 257, true);
      view.setUint16(cursor + 24, colors[i * 4 + 2] * 257, true);
    }
    cursor += recordSize;
  }

  writeText(bytes, 0, 'LASF');
  bytes[24] = 1; // Version 1.2
  bytes[25] = 2;
  writeText(bytes, 26, 'PhotonFlight');
  writeText(bytes, 58, 'PhotonFlight');

  const now = new Date();
  view.setUint16(90, Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000), true);
  view.setUint16(92, now.getFullYear(), true);
  view.setUint16(94, HEADER_SIZE, true);
  view.setUint32(96, pointDataStart, true);
  view.setUint32(100, vlrs.length, true);
  bytes[104] = pointFormat;
  view.setUint16(105, recordSize, true);
  view.setUint32(107, pointCount, true);
  view.setUint32(111, pointCount, true); // Every point is written as a first return

  for (let axis = 0; axis < 3; axis++) {
    view.setFloat64(131 + axis * 8, scale[axis], true);
    view.setFloat64(155 + axis * 8, offset[axis], true);
    view.setFloat64(179 + axis * 16, maxs[axis], true);
    view.setFloat64(187 + axis * 16, mins[axis], true);
  }

  let vlrCursor = HEADER_SIZE;
  for (const vlr of vlrs) {
    bytes.set(vlr, vlrCursor);
    vlrCursor += vlr.length;
  }
  return bytes;
}

// source is an ArrayBuffer or a URL, the same value the viewer loads
export async function exportPointCloud(source, filePath) {
  const buffer = typeof source === 'string'
    ? await (await fetch(source)).arrayBuffer()
    : source;
  const wantsLaz = /\.laz$/i.test(filePath);
  const compressed = isCompressed(buffer);

  // Same format as the source. Nothing to do here, just write the bytes to disk. 
  if (wantsLaz === compressed) return new Uint8Array(buffer);
  if (wantsLaz) throw new Error('Converting .las to .laz is not supported yet. Export as .las instead.');

  // Parse a copy with 64-bit coords 
  // Viewer uses 64-bit coords to avoid precision issues, but LAS only supports 32-bit coords. So we need to parse the file and re-encode it as uncompressed LAS BROOOOOOOO.
  const mesh = await load(buffer.slice(0), LASLoader, {
    las: { fp64: true, skip: 1, colorDepth: 'auto' },
  });
  return encodeLas(mesh, buffer);
}