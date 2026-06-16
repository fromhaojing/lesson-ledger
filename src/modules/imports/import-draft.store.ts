import * as FileSystem from "expo-file-system/legacy";

import type { ImportPreview } from "@/modules/imports/excel-parser";

export type ImportDraft = {
  filename: string;
  sourceUri?: string | null;
  preview: ImportPreview;
};

let currentDraft: ImportDraft | null = null;
const draftDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
const draftPath = draftDirectory ? `${draftDirectory}lesson-ledger-import-draft.json` : null;

export async function setImportDraft(draft: ImportDraft) {
  currentDraft = draft;
  await writeDraftFile(draft);
}

export function getImportDraft() {
  return currentDraft;
}

export async function loadImportDraft() {
  if (currentDraft) return currentDraft;
  if (!draftPath) return null;

  const info = await FileSystem.getInfoAsync(draftPath);
  if (!info.exists) return null;

  const text = await FileSystem.readAsStringAsync(draftPath);
  currentDraft = JSON.parse(text) as ImportDraft;
  return currentDraft;
}

export async function clearImportDraft() {
  currentDraft = null;
  if (!draftPath) return;

  const info = await FileSystem.getInfoAsync(draftPath);
  if (info.exists) {
    await FileSystem.deleteAsync(draftPath, { idempotent: true });
  }
}

async function writeDraftFile(draft: ImportDraft) {
  if (!draftPath) return;
  await FileSystem.writeAsStringAsync(draftPath, JSON.stringify(draft));
}
