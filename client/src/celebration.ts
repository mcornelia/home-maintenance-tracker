export function shouldCelebrateCompletion(previousOverdue: number, nextOverdue: number): boolean {
  return previousOverdue > 0 && nextOverdue === 0;
}
