"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type Mapping, REQUIRED, type SheetPreview } from "./types";

const NONE = "__none__";
const columnLetter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `A${String.fromCharCode(65 + i - 26)}`);

/** Field → column table for one sheet, with an example value from the file. */
export function MappingTable({
  sheet,
  fields,
  mapping,
  onChange,
}: {
  sheet: SheetPreview;
  fields: readonly string[];
  mapping: Mapping;
  onChange: (m: Mapping) => void;
}) {
  const t = useTranslations("imports");
  const tf = useTranslations("imports.fields") as unknown as (k: string) => string;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("field")}</TableHead>
            <TableHead>{t("column")}</TableHead>
            <TableHead>{t("example")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((f) => {
            const col = mapping[f];
            const example = col === null || col === undefined ? "" : sheet.sample.find((r) => r[col])?.[col] ?? "";
            const missing = REQUIRED.has(f) && (col === null || col === undefined);
            return (
              <TableRow key={f} className={missing ? "bg-destructive/5" : undefined}>
                <TableCell className="font-medium">
                  {tf(f)}
                  {REQUIRED.has(f) && <span className="text-destructive"> *</span>}
                </TableCell>
                <TableCell className="w-72">
                  <Select
                    value={col === null || col === undefined ? NONE : String(col)}
                    onValueChange={(v) => onChange({ ...mapping, [f]: v === NONE ? null : Number(v) })}
                  >
                    <SelectTrigger className="w-full" aria-label={tf(f)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("notMapped")}</SelectItem>
                      {sheet.headers.map((h, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {columnLetter(i)} · {h || "—"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground">{example}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
