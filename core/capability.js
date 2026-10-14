/*
 * core/capability.js - device checks that choose the guitar renderer (CONTRACT section 7).
 *
 * Public API:
 *   canUseGl()            a fine pointer, >= 900 px wide and a hardware WebGL2 context
 *   preferredGuitarMode() -> 'gl' | 'dom'   'gl' when canUseGl() and >= 4 GB (when reported) and
 *                                           no Save-Data
 *   forceGl               ?gl=force (testing): accept software WebGL, e.g. headless browsers
 *   needsOrientationPermission()            iOS: DeviceOrientationEvent.requestPermission exists
 *   hasOrientation()                        a coarse pointer and DeviceOrientationEvent exist
 */

export const forceGl = new URLSearchParams(location.search).get('gl') === 'force';

function webgl2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: !forceGl });
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

export function canUseGl() {
  if (forceGl) return webgl2();
  return !matchMedia('(pointer: coarse)').matches && innerWidth >= 900 && webgl2();
}

export function preferredGuitarMode() {
  const memory = navigator.deviceMemory;
  const saveData = navigator.connection?.saveData === true;
  if ((memory && memory < 4) || saveData) return 'dom';
  return canUseGl() ? 'gl' : 'dom';
}

export const hasOrientation = () => 'DeviceOrientationEvent' in window && matchMedia('(pointer: coarse)').matches;
export const needsOrientationPermission = () => hasOrientation() && typeof DeviceOrientationEvent.requestPermission === 'function';
