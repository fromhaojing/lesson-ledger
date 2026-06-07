export function formatMoney(amount: number | null | undefined) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: Number.isInteger(amount ?? 0) ? 0 : 2
  }).format(amount ?? 0);
}

export function parseAmount(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;

  const text = String(value).replace(/[¥￥,\s]/g, "");
  const amount = Number(text);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("金额不是有效数字");
  }

  return amount;
}
