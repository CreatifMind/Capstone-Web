export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatPercent(value: number) {
  return `${Number(value).toFixed(value % 1 === 0 ? 0 : 1)}%`;
}
