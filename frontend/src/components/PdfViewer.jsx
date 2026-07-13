import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { getPdfUrl, savePdf } from '../services/fsService';
import { fetchPaperPdf } from '../services/api';
import { ZoomIn, ZoomOut, Maximize, ChevronUp, ChevronDown, List, FileText, Code2, DownloadCloud, Loader2, Sparkles } from 'lucide-react';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Serve the worker from our own bundle so the app works offline / deployed
// without depending on a CDN.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfViewer({ paper, dirHandle, onImplement, onOpenSettings, onAskAi }) {
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [scale, setScale] = useState(1.0);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [isContinuous, setIsContinuous] = useState(false);
    const [loadState, setLoadState] = useState('idle'); // idle | loading | ready | missing | error
    const [redownloading, setRedownloading] = useState(false);
    const [selection, setSelection] = useState(null);

    const containerRef = useRef(null);

    useEffect(() => {
        const handleMouseUp = () => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const text = sel.toString().trim();
            if (text) {
                const range = sel.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                // Check if the selection is inside the PDF viewer container
                if (containerRef.current && containerRef.current.contains(range.commonAncestorContainer)) {
                    setSelection({
                        text,
                        x: rect.left + rect.width / 2,
                        y: rect.top - 10,
                    });
                } else {
                    setSelection(null);
                }
            } else {
                setSelection(null);
            }
        };

        const handleMouseDown = (e) => {
            if (e.target.closest('#ask-ai-btn')) return;
            setSelection(null);
        };

        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('mousedown', handleMouseDown);
        return () => {
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('mousedown', handleMouseDown);
        };
    }, []);

    // Trackpad pinch-to-zoom (browsers report pinch as wheel + ctrlKey)
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                setScale(prev => Math.min(Math.max(prev - (e.deltaY * 0.01), 0.5), 3.0));
            }
        };

        // passive: false is required to allow e.preventDefault()
        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [paper]);

    useEffect(() => {
        let cancelled = false;
        let objectUrl = null;

        (async () => {
            if (!paper || !dirHandle) {
                setPdfUrl(null);
                setLoadState('idle');
                return;
            }
            setLoadState('loading');
            const url = await getPdfUrl(dirHandle, paper.filename);
            if (cancelled) {
                if (url) URL.revokeObjectURL(url);
                return;
            }
            objectUrl = url;
            setPdfUrl(url);
            setNumPages(null);
            setPageNumber(1);
            setLoadState(url ? 'ready' : 'missing');
        })();

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [paper, dirHandle]);

    const handleRedownload = async () => {
        if (!paper || !dirHandle || redownloading) return;
        setRedownloading(true);
        try {
            const data = await fetchPaperPdf(paper.id);
            const ok = await savePdf(dirHandle, data.filename, data.pdf_b64);
            if (!ok) throw new Error('Could not write the PDF to your folder.');
            const url = await getPdfUrl(dirHandle, paper.filename);
            setPdfUrl(url);
            setNumPages(null);
            setPageNumber(1);
            setLoadState(url ? 'ready' : 'missing');
        } catch (e) {
            console.error(e);
            alert(e.message || 'Failed to download the PDF from arXiv.');
        } finally {
            setRedownloading(false);
        }
    };

    function onDocumentLoadSuccess({ numPages }) {
        setNumPages(numPages);
        setPageNumber(1);
    }

    if (!paper) {
        return (
            <section className="flex-1 bg-hardcoded-bg flex flex-col relative h-full items-center justify-center">
                <div className="text-on-surface-variant">Select a paper to view its PDF</div>
            </section>
        );
    }

    const viewToggleActive = 'bg-surface shadow-sm text-primary';
    const viewToggleIdle = 'text-on-surface-variant hover:bg-surface-container';

    return (
        <section className="h-full w-full bg-hardcoded-bg flex flex-col relative">
            {/* Toolbar */}
            <div className="h-12 border-b border-hardcoded-border bg-surface flex items-center justify-between px-gap-md shrink-0 gap-2">
                <div className="flex items-center gap-gap-sm min-w-0">
                    <span className="font-label-md text-label-md font-bold text-on-surface truncate max-w-[150px] lg:max-w-[300px]" title={paper.title}>
                        {paper.title}
                    </span>
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center gap-1 bg-surface-container-low rounded border border-hardcoded-border p-0.5 ml-2 mr-auto shrink-0">
                    <button
                        onClick={() => setIsContinuous(false)}
                        className={`p-1 flex items-center gap-1 rounded transition-colors ${!isContinuous ? viewToggleActive : viewToggleIdle}`}
                        title="Page by Page"
                    >
                        <FileText size={16} />
                        <span className="text-xs font-medium hidden lg:inline px-1">Page</span>
                    </button>
                    <button
                        onClick={() => setIsContinuous(true)}
                        className={`p-1 flex items-center gap-1 rounded transition-colors ${isContinuous ? viewToggleActive : viewToggleIdle}`}
                        title="Continuous Scroll"
                    >
                        <List size={16} />
                        <span className="text-xs font-medium hidden lg:inline px-1">Scroll</span>
                    </button>
                </div>

                <button
                    onClick={() => onImplement(paper)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary-container text-on-primary-container rounded border border-transparent hover:bg-primary hover:text-on-primary transition-colors shrink-0"
                    title="Generate a runnable code implementation of this paper"
                >
                    <Code2 size={16} />
                    <span className="text-xs font-bold hidden lg:inline">Implement</span>
                </button>

                <div className="flex items-center gap-gap-xs bg-surface-container-low rounded border border-hardcoded-border p-0.5 shrink-0">
                    <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))} className="p-1 rounded hover:bg-surface-container transition-colors text-on-surface-variant" title="Zoom Out">
                        <ZoomOut size={18} />
                    </button>
                    <span className="font-label-sm text-label-sm px-2 text-on-surface-variant">{Math.round(scale * 100)}%</span>
                    <button onClick={() => setScale(s => Math.min(3, s + 0.2))} className="p-1 rounded hover:bg-surface-container transition-colors text-on-surface-variant" title="Zoom In">
                        <ZoomIn size={18} />
                    </button>
                    <div className="w-[1px] h-4 bg-hardcoded-border mx-1"></div>
                    <button onClick={() => setScale(1.0)} className="p-1 rounded hover:bg-surface-container transition-colors text-on-surface-variant" title="Reset Zoom">
                        <Maximize size={18} />
                    </button>
                </div>

                <div className="flex items-center gap-gap-xs shrink-0">
                    <button
                        onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                        disabled={pageNumber <= 1 || isContinuous}
                        className="p-1.5 rounded hover:bg-surface-container transition-colors text-on-surface-variant disabled:opacity-50" title="Previous Page">
                        <ChevronUp size={18} />
                    </button>
                    <span className="font-label-sm text-label-sm text-on-surface-variant w-24 text-center">
                        {isContinuous ? `${numPages || '--'} Pages` : `Page ${pageNumber} of ${numPages || '--'}`}
                    </span>
                    <button
                        onClick={() => setPageNumber(p => Math.min(numPages || p, p + 1))}
                        disabled={pageNumber >= (numPages || 1) || isContinuous}
                        className="p-1.5 rounded hover:bg-surface-container transition-colors text-on-surface-variant disabled:opacity-50" title="Next Page">
                        <ChevronDown size={18} />
                    </button>
                </div>
            </div>

            {/* PDF Canvas Container */}
            <div ref={containerRef} className="flex-1 overflow-auto custom-scrollbar p-gap-md lg:p-margin-page flex flex-col items-center">
                {pdfUrl ? (
                    <div className="flex flex-col gap-4">
                        <Document
                            file={pdfUrl}
                            onLoadSuccess={onDocumentLoadSuccess}
                            onLoadError={(e) => { console.error(e); setLoadState('error'); }}
                            loading={<div className="p-10 text-on-surface-variant">Loading PDF…</div>}
                            error={<div className="p-10 text-error">This file could not be rendered as a PDF.</div>}
                        >
                            {isContinuous ? (
                                Array.from(new Array(numPages), (el, index) => (
                                    <div key={`page_${index + 1}`} className="bg-white shadow-sm border border-hardcoded-border relative mb-4 last:mb-0">
                                        <Page
                                            pageNumber={index + 1}
                                            scale={scale}
                                            renderTextLayer={true}
                                            renderAnnotationLayer={true}
                                            className="pdf-page"
                                        />
                                    </div>
                                ))
                            ) : (
                                <div className="bg-white shadow-sm border border-hardcoded-border relative">
                                    <Page
                                        pageNumber={pageNumber}
                                        scale={scale}
                                        renderTextLayer={true}
                                        renderAnnotationLayer={true}
                                        className="pdf-page"
                                    />
                                </div>
                            )}
                        </Document>
                    </div>
                ) : !dirHandle ? (
                    <div className="p-10 text-center flex flex-col items-center gap-3">
                        <p className="text-on-surface-variant">No PDF folder is connected, so the PDF can't be displayed.</p>
                        <button
                            onClick={onOpenSettings}
                            className="px-3 py-1.5 text-sm bg-primary text-on-primary rounded font-medium"
                        >
                            Open Settings to choose a folder
                        </button>
                    </div>
                ) : loadState === 'missing' ? (
                    <div className="p-10 text-center flex flex-col items-center gap-3">
                        <p className="text-on-surface-variant">This paper's PDF isn't in your folder yet.</p>
                        <button
                            onClick={handleRedownload}
                            disabled={redownloading}
                            className="px-3 py-1.5 text-sm bg-primary text-on-primary rounded font-medium flex items-center gap-1.5 disabled:opacity-60"
                        >
                            {redownloading ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
                            {redownloading ? 'Downloading…' : 'Download from arXiv'}
                        </button>
                    </div>
                ) : (
                    <div className="p-10 text-on-surface-variant">Loading…</div>
                )}
            </div>

            {selection && (
                <button
                    id="ask-ai-btn"
                    onClick={() => {
                        if (onAskAi) onAskAi(selection.text);
                        setSelection(null);
                        window.getSelection().removeAllRanges();
                    }}
                    style={{
                        position: 'fixed',
                        left: selection.x,
                        top: selection.y,
                        transform: 'translate(-50%, -100%)',
                        zIndex: 1000
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary rounded-lg shadow-lg font-medium text-sm hover:bg-primary-container hover:text-on-primary-container transition-colors animate-in fade-in zoom-in duration-200"
                >
                    <Sparkles size={14} /> Ask AI
                </button>
            )}
        </section>
    );
}
