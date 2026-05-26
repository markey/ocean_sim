export {
  sampleDisplacedGridSurface,
  RENDERED_SURFACE_SAMPLE_SCRATCH,
  type RenderedSurfaceSample,
} from './RenderedSurfaceSample';
export {
  sampleOceanSurface,
  sampleOceanSurfaceHeight,
  sampleOceanSurfacePoint,
  type OceanSurfaceSample,
} from './OceanSurfaceSampler';
export { lockToSurfaceHeight } from './buoyancyIntegration';
export { FloatingBoat, type FloatingBoatOptions } from './FloatingBoat';
export { FloatingBuoy, type FloatingBuoyOptions } from './FloatingBuoy';
export { FloatingSphere, type FloatingSphereOptions } from './FloatingSphere';
export { DEFAULT_BUOYANCY_PARAMETERS, type BuoyancyParameters } from './types';
