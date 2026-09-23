/** Keep the stored calculation numeric; append the overtime marker for display/export. */
export function formatDayLabourTotal(total: string, overtime = false): string {
  const value = total.trim();
  return value && overtime ? `${value} OT` : value;
}
