const MISSING_TABLE_CODE = '42P01';

export function isMissingTableError(err: unknown, tables?: string[]) {
  const code = (err as { code?: string } | null)?.code;
  if (code !== MISSING_TABLE_CODE) return false;
  if (!tables || tables.length === 0) return true;

  const table = (err as { table?: string } | null)?.table;
  if (table && tables.includes(table)) return true;

  const message = String((err as { message?: string } | null)?.message ?? '');
  return tables.some((t) => message.includes(`relation \"${t}\"`) || message.includes(`relation "${t}"`));
}
