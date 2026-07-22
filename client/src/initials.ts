export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part.match(/\p{L}/u)?.[0])
    .filter((letter): letter is string => Boolean(letter))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
