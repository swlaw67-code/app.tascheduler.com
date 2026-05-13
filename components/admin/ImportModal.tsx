'use client';
// components/admin/ImportModal.tsx
// Modal for importing TASScheduler flat files (ZIP) into a company database.
// Supports drag-and-drop or file picker. Shows detailed per-table import summary.

import { useState, useRef, useCallback } from 'react';

interface TableStat {
  inserted: number;
  skipped: number;
  errors: string[];
}

interface ImportFileResult {
  file: string;
  records: Record<string, TableStat>;
  error?: string;
}

interface ImportSummary {
  success: boolean;
  results: ImportFileResult[];
  totalInserted: number;
  totalSkipped: number;
  totalErrors: number;
  refused?: string;
  error?: string;
}

interface Props {
  companyCode: string;
  companyName: string;
  onClose: () => void;
}

type Stage = 'idle' | 'uploading' | 'done';

export default function ImportModal({ companyCode, companyName, onClose }: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setUploadError('Please select a ZIP file.');
      return;
    }
    setUploadError('');
    setSelectedFile(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  async function handleImport() {
    if (!selectedFile) return;
    setStage('uploading');
    setUploadError('');

    try {
      const form = new FormData();
      form.append('file', selectedFile);

      const res = await fetch(`/api/admin/companies/${companyCode}/import`, {
        method: 'POST',
        body: form,
      });

      let data: ImportSummary;
      try {
        data = await res.json();
      } catch {
        setUploadError(`Server error (HTTP ${res.status}). Check iisnode logs.`);
        setStage('idle');
        return;
      }
      if (data.error) {
        setUploadError(data.error);
        setStage('idle');
        return;
      }
      setSummary(data);
      setStage('done');
    } catch (err) {
      setUploadError(`Connection error: ${err instanceof Error ? err.message : 'Please try again.'}`);
      setStage('idle');
    }
  }

  // ── Summary helpers ──────────────────────────────────────────────────────

  function totalForFile(result: ImportFileResult) {
    let ins = 0, skip = 0, errs = 0;
    for (const s of Object.values(result.records)) {
      ins += s.inserted; skip += s.skipped; errs += s.errors.length;
    }
    return { ins, skip, errs };
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="font-semibold text-[var(--text-primary)] text-sm">
              Import Data — {companyName}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Upload a ZIP containing .TSF, .EMP, .DAT, .HLD, and/or .TOR files
            </p>
          </div>
          <button onClick={onClose} disabled={stage === 'uploading'}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded disabled:opacity-40">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {stage !== 'done' && (
            <>
              {/* Warning */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2.5">
                <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" viewBox="0 0 24 24"
                     fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div className="text-xs text-amber-800">
                  <strong>One-time migration only.</strong> Import will be refused if this company already has data.
                  Ensure the database is empty before proceeding.
                </div>
              </div>

              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                  ${dragOver
                    ? 'border-[var(--brand-500)] bg-[var(--brand-50)]'
                    : selectedFile
                      ? 'border-green-400 bg-green-50'
                      : 'border-[var(--border)] hover:border-[var(--brand-400)] hover:bg-[var(--surface-hover)]'
                  }`}
              >
                <input ref={fileInputRef} type="file" accept=".zip" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />

                {selectedFile ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-center gap-2 text-green-700">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                           stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                      </svg>
                      <span className="font-medium text-sm">{selectedFile.name}</span>
                    </div>
                    <p className="text-xs text-green-600">
                      {(selectedFile.size / 1024).toFixed(1)} KB — click to change
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center">
                      <svg className="w-10 h-10 text-[var(--text-muted)]" viewBox="0 0 24 24"
                           fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Drag & drop your ZIP file here, or <span className="text-[var(--brand-600)] font-medium">browse</span>
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      ZIP containing .TSF / .EMP / .DAT / .HLD / .TOR files
                    </p>
                  </div>
                )}
              </div>

              {uploadError && (
                <div className="alert-error text-xs">{uploadError}</div>
              )}

              {/* Uploading indicator */}
              {stage === 'uploading' && (
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <svg className="animate-spin w-4 h-4 text-[var(--brand-600)]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10"
                            stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Parsing and importing data — this may take a moment…
                </div>
              )}
            </>
          )}

          {/* Summary */}
          {stage === 'done' && summary && (
            <div className="space-y-3">
              {/* Refused */}
              {summary.refused && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
                  <strong>Import refused:</strong> {summary.refused}
                </div>
              )}

              {/* Overall status */}
              {!summary.refused && (
                <div className={`rounded-lg p-3 flex items-center gap-3 text-sm font-medium
                  ${summary.success
                    ? 'bg-green-50 border border-green-200 text-green-800'
                    : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
                  {summary.success ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                  )}
                  <span>
                    {summary.success ? 'Import completed successfully' : 'Import completed with errors'} —&nbsp;
                    {summary.totalInserted} inserted,&nbsp;
                    {summary.totalSkipped} skipped,&nbsp;
                    {summary.totalErrors} errors
                  </span>
                </div>
              )}

              {/* Per-file results */}
              {summary.results.map((fileResult, fi) => {
                const totals = totalForFile(fileResult);
                return (
                  <div key={fi} className="border border-[var(--border)] rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2
                                    bg-[var(--surface-stripe)] border-b border-[var(--border)]">
                      <span className="text-xs font-semibold text-[var(--text-primary)]">
                        {fileResult.file}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        {totals.ins} inserted · {totals.skip} skipped · {totals.errs} errors
                      </span>
                    </div>
                    {fileResult.error && (
                      <div className="px-3 py-2 text-xs text-red-700 bg-red-50">
                        Parse error: {fileResult.error}
                      </div>
                    )}
                    <table className="w-full text-xs">
                      <tbody>
                        {Object.entries(fileResult.records).map(([table, stat]) => (
                          <tr key={table} className="border-b border-[var(--border)] last:border-b-0">
                            <td className="px-3 py-1.5 text-[var(--text-secondary)] w-48">
                              {table}
                            </td>
                            <td className="px-2 py-1.5 text-green-700 text-right w-20">
                              +{stat.inserted}
                            </td>
                            <td className="px-2 py-1.5 text-[var(--text-muted)] text-right w-20">
                              {stat.skipped > 0 ? `${stat.skipped} skipped` : ''}
                            </td>
                            <td className="px-3 py-1.5 text-red-600">
                              {stat.errors.length > 0 && (
                                <details>
                                  <summary className="cursor-pointer">
                                    {stat.errors.length} error{stat.errors.length !== 1 ? 's' : ''}
                                  </summary>
                                  <ul className="mt-1 space-y-0.5 ml-2">
                                    {stat.errors.slice(0, 10).map((err, i) => (
                                      <li key={i} className="text-[10px] text-red-500">{err}</li>
                                    ))}
                                    {stat.errors.length > 10 && (
                                      <li className="text-[10px] text-red-400">
                                        …and {stat.errors.length - 10} more
                                      </li>
                                    )}
                                  </ul>
                                </details>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3
                        border-t border-[var(--border)] bg-[var(--surface-stripe)] shrink-0">
          {stage === 'done' ? (
            <>
              <p className="text-xs text-[var(--text-muted)]">
                Review the results above before closing.
              </p>
              <button onClick={onClose} className="btn-primary btn-sm">
                Close
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} disabled={stage === 'uploading'}
                className="btn-secondary btn-sm disabled:opacity-40">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!selectedFile || stage === 'uploading'}
                className="btn-primary btn-sm flex items-center gap-1.5 disabled:opacity-40"
              >
                {stage === 'uploading' ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10"
                              stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Importing…
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Import Data
                  </>
                )}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
