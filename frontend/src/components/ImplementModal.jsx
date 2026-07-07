import React, { useState, useRef } from 'react';
import { implementPaper } from '../services/api';
import { writeProjectFiles, isFsAccessSupported } from '../services/fsService';
import { Code2, FolderOpen, Loader2, Check, X, FileCode, TerminalSquare, AlertTriangle } from 'lucide-react';

// phase: intro -> generating -> writing -> done | error
export default function ImplementModal({ paper, onClose }) {
    const [phase, setPhase] = useState('intro');
    const [hints, setHints] = useState('');
    const [error, setError] = useState('');
    const [progress, setProgress] = useState({ current: 0, total: 0, path: '' });
    const [result, setResult] = useState(null);
    const destNameRef = useRef('');

    const busy = phase === 'generating' || phase === 'writing';

    const handleStart = async () => {
        setError('');
        // Pick the destination first — the folder picker must be opened from
        // this click, before any long-running await.
        let destHandle;
        try {
            destHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        } catch (e) {
            if (e?.name !== 'AbortError') setError('Could not open the folder picker.');
            return;
        }
        destNameRef.current = destHandle.name;

        setPhase('generating');
        let manifest;
        try {
            manifest = await implementPaper(paper.id, hints);
        } catch (e) {
            setError(e.message || 'Generation failed.');
            setPhase('error');
            return;
        }

        setPhase('writing');
        setProgress({ current: 0, total: manifest.files.length, path: '' });
        try {
            const written = await writeProjectFiles(
                destHandle,
                manifest.project_name,
                manifest.files,
                (current, path) => setProgress({ current, total: manifest.files.length, path }),
            );
            setResult({ ...manifest, written, destination: `${destHandle.name}/${manifest.project_name}` });
            setPhase('done');
        } catch (e) {
            console.error(e);
            setError(`Failed writing files to the selected folder: ${e.message || e}`);
            setPhase('error');
        }
    };

    return (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
            <div className="bg-surface rounded-lg shadow-xl border border-hardcoded-border w-full max-w-lg flex flex-col overflow-hidden">
                <div className="p-4 border-b border-hardcoded-border bg-surface-container-lowest flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Code2 size={18} className="text-primary" />
                        <h3 className="font-headline-sm text-sm font-bold text-on-surface">Implement Paper</h3>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={busy}
                        className="p-1 rounded hover:bg-surface-container text-on-surface-variant disabled:opacity-40"
                        aria-label="Close"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {phase === 'intro' && (
                        <>
                            <p className="text-sm text-on-surface leading-relaxed">
                                Gemini will read <strong>“{paper.title}”</strong> and generate a small, runnable
                                code project that recreates the method described in the paper — source files,
                                a README mapping the code to the paper, and dependency files.
                            </p>
                            <p className="text-sm text-on-surface-variant leading-relaxed">
                                You'll be asked to choose a destination folder. A new subfolder will be created
                                inside it, so nothing existing is overwritten.
                            </p>
                            <div className="flex flex-col gap-1.5">
                                <label className="font-label-sm text-xs text-on-surface-variant uppercase tracking-wide">
                                    Extra instructions (optional)
                                </label>
                                <textarea
                                    value={hints}
                                    onChange={(e) => setHints(e.target.value)}
                                    rows="2"
                                    placeholder="e.g. use PyTorch, keep it under 5 files, focus on section 3…"
                                    className="w-full px-3 py-2 bg-surface-container-lowest border border-hardcoded-border rounded text-sm resize-none outline-none focus:border-primary text-on-surface"
                                />
                            </div>
                            {!isFsAccessSupported() && (
                                <p className="text-sm text-error">Your browser does not support folder access. Use Chrome or Edge.</p>
                            )}
                            {error && <p className="text-sm text-error">{error}</p>}
                        </>
                    )}

                    {phase === 'generating' && (
                        <div className="flex flex-col items-center gap-3 py-6 text-center">
                            <Loader2 size={28} className="animate-spin text-primary" />
                            <p className="text-sm font-medium text-on-surface">Gemini is reading the paper and writing the implementation…</p>
                            <p className="text-xs text-on-surface-variant">This usually takes 1–3 minutes. Keep this tab open.</p>
                        </div>
                    )}

                    {phase === 'writing' && (
                        <div className="flex flex-col items-center gap-3 py-6 text-center">
                            <Loader2 size={28} className="animate-spin text-primary" />
                            <p className="text-sm font-medium text-on-surface">
                                Writing files… {progress.current}/{progress.total}
                            </p>
                            <p className="text-xs text-on-surface-variant font-mono truncate max-w-full">{progress.path}</p>
                        </div>
                    )}

                    {phase === 'done' && result && (
                        <>
                            <div className="flex items-center gap-2 text-primary">
                                <Check size={18} />
                                <p className="text-sm font-bold">Project created in “{result.destination}”</p>
                            </div>
                            {result.summary && <p className="text-sm text-on-surface-variant leading-relaxed">{result.summary}</p>}
                            <div className="flex flex-col gap-1.5">
                                <span className="font-label-sm text-xs text-on-surface-variant uppercase tracking-wide flex items-center gap-1">
                                    <FileCode size={12} /> Files ({result.written.length})
                                </span>
                                <div className="bg-surface-container-lowest border border-hardcoded-border rounded p-2 max-h-40 overflow-y-auto custom-scrollbar">
                                    {result.written.map((f) => (
                                        <div key={f} className="text-xs font-mono text-on-surface py-0.5">{f}</div>
                                    ))}
                                </div>
                            </div>
                            {result.run_instructions && (
                                <div className="flex flex-col gap-1.5">
                                    <span className="font-label-sm text-xs text-on-surface-variant uppercase tracking-wide flex items-center gap-1">
                                        <TerminalSquare size={12} /> How to run
                                    </span>
                                    <pre className="bg-surface-container-lowest border border-hardcoded-border rounded p-2 text-xs font-mono whitespace-pre-wrap text-on-surface overflow-x-auto">{result.run_instructions}</pre>
                                </div>
                            )}
                            <p className="text-xs text-on-surface-variant">
                                Note: this is an AI-generated starting point — review the code and README before relying on it.
                            </p>
                        </>
                    )}

                    {phase === 'error' && (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2 text-error">
                                <AlertTriangle size={18} />
                                <p className="text-sm font-bold">Implementation failed</p>
                            </div>
                            <p className="text-sm text-on-surface-variant leading-relaxed break-words">{error}</p>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-hardcoded-border bg-surface-container-lowest flex justify-end gap-2">
                    {phase === 'intro' && (
                        <>
                            <button onClick={onClose} className="px-3 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container-high rounded">Cancel</button>
                            <button
                                onClick={handleStart}
                                disabled={!isFsAccessSupported()}
                                className="px-4 py-1.5 text-sm bg-primary text-on-primary rounded font-medium flex items-center gap-1.5 disabled:opacity-50"
                            >
                                <FolderOpen size={14} /> Choose destination & Generate
                            </button>
                        </>
                    )}
                    {phase === 'error' && (
                        <>
                            <button onClick={onClose} className="px-3 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container-high rounded">Close</button>
                            <button onClick={() => { setPhase('intro'); setError(''); }} className="px-4 py-1.5 text-sm bg-primary text-on-primary rounded font-medium">
                                Try again
                            </button>
                        </>
                    )}
                    {phase === 'done' && (
                        <button onClick={onClose} className="px-4 py-1.5 text-sm bg-primary text-on-primary rounded font-medium">Done</button>
                    )}
                    {busy && <span className="text-xs text-on-surface-variant py-1.5">Working — please don't close this tab…</span>}
                </div>
            </div>
        </div>
    );
}
