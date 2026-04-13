export function redirectSystemPath({
  _path,
  _initial,
}: { _path: string; _initial: boolean }): string {
  if (_path && _path.includes('auth')) {
    return '';
  }
  if (_initial) {
    return '/';
  }
  return '';
}
