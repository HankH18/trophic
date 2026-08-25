/** tools/overlay-diff — build-doc §8.2's map-variant layout freeze. See diff.ts for the argument. */
export {
  luminance,
  sobelMagnitude,
  thresholdEdges,
  dilate,
  edgeMap,
  contrastRange,
  contrastNormalise,
  SOBEL_MAX,
  LUMINANCE_STEP,
  CONTRAST_TAIL,
  CONTRAST_BINS,
} from './edges.ts';
export type { EdgeOptions, ContrastRange } from './edges.ts';
export { walkableCells, walkablePixels, walkableMaskFor, allWalkable, cellsToRaster, MaskError } from './mask.ts';
export type { CellGrid } from './mask.ts';
export { overlayDiff, nextDenoise, OverlayDiffError } from './diff.ts';
export type { CellFootprint, OverlayDiffConfig, OverlayDiffInput, OverlayDiffResult } from './diff.ts';
export { overlayDiffConfig, collisionGrid, denoiseLadder, driftFootprint } from './config.ts';
