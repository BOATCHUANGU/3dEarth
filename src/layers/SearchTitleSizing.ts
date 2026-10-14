// Source Han Serif SC Medium: 东 xMin=32, 京 xMax=959, 1000 units/em, tracking=.08em.
// Visible ink width, not the larger SDF quad or two full advance boxes.
export const TOKYO_INK_EM = 2.007;

export function searchTitleSizing(width: number, height: number, safeWidth: number, name: string) {
  const compact = width < 900;
  const shortHan = /^[\p{Script=Han}]{1,3}$/u.test(name);
  const targetRatio = compact ? 0.52 : 0.22;
  const arrivalSize = Math.max(1, Math.min((width * targetRatio) / TOKYO_INK_EM, height * 0.42));
  const widthLimit = compact ? (shortHan ? width * 0.6 : safeWidth) : width * 0.55;
  return { arrivalSize, maximumWidth: Math.max(40, Math.min(safeWidth, widthLimit)), compact };
}
