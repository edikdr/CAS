/*
 * core/capability.js - device checks that choose the guitar renderer (CONTRACT section 7).
 *
 * Public API:
 *   preferredGuitarMode() -> 'gl' | 'dom'   'gl' only for a fine pointer, >= 900 px wide, >= 4 GB
 *                                           (when reported), no Save-Data, and a working WebGL2
 *   needsOrientationPermission()            iOS: DeviceOrientationEvent.requestPermission exists
 *   hasOrientation()                        a coarse pointer and DeviceOrientationEvent exist
 */

function webgl2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

export function preferredGuitarMode() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const memory = navigator.deviceMemory;
  const saveData = navigator.connection?.saveData === true;
  if (coarse || innerWidth < 900 || (memory && memory < 4) || saveData) return 'dom';
  return webgl2() ? 'gl' : 'dom';
}

export const hasOrientation = () => 'DeviceOrientationEvent' in window && matchMedia('(pointer: coarse)').matches;
export const needsOrientationPermission = () => hasOrientation() && typeof DeviceOrientationEvent.requestPermission === 'function';
