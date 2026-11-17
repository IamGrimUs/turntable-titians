/** "1 character" / "2 characters". Zero uses the plural; pass `many` for irregular words. */
export function plural(count: number, one: string, many: string = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
