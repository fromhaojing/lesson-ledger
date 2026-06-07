import type { ImportPreview } from "@/modules/imports/excel-parser";

type ImportDraft = {
  filename: string;
  preview: ImportPreview;
};

let currentDraft: ImportDraft | null = null;

export function setImportDraft(draft: ImportDraft) {
  currentDraft = draft;
}

export function getImportDraft() {
  return currentDraft;
}

export function clearImportDraft() {
  currentDraft = null;
}
