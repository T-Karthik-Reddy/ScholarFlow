import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { getPdfUrl } from '../services/fsService';
import { ZoomIn, ZoomOut, Maximize, ChevronUp, ChevronDown, List, FileText } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set worker path robustly
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfViewer({ paper, dirHandle }) {
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [scale, setScale] = useState(1.0);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [isContinuous, setIsContinuous] = useState(false);

    const containerRef = useRef(null);

    // Trackpad Pinch-to-Zoom logic
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e) => {
            // Trackpad pinch-to-zoom sets ctrlKey = true
            if (e.ctrlKey) {
                e.preventDefault();
                setScale(prev => {
                    const newScale = prev - (e.deltaY * 0.01);
                    return Math.min(Math.max(newScale, 0.5), 3.0);
                });
            }
        };

        // Needs passive: false to allow e.preventDefault()
        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, []);

    useEffect(() => {
        if (!paper || !dirHandle) {
            setPdfUrl(null);
            return;
        }
        
        const filename = paper.filename || `${paper.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
        
        let objectUrl = null;
        let isMounted = true;

        getPdfUrl(dirHandle, filename).then(url => {
            if (isMounted) {
                objectUrl = url;
                setPdfUrl(url);
                setPageNumber(1);
            } else if (url) {
                URL.revokeObjectURL(url);
            }
        });

        return () => {
            isMounted = false;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [paper, dirHandle]);

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

    return (
        <section className="h-full w-full bg-hardcoded-bg flex flex-col relative">
            {/* Toolbar */}
            <div className="h-12 border-b border-hardcoded-border bg-surface flex items-center justify-between px-gap-md shrink-0">
                <div className="flex items-center gap-gap-sm">
                    <span className="font-label-md text-label-md font-bold text-on-surface truncate max-w-[150px] lg:max-w-[300px]">
                        {paper.title}
                    </span>
                </div>
                
                {/* View Mode Toggle */}
                <div className="flex items-center gap-1 bg-surface-container-low rounded border border-hardcoded-border p-0.5 ml-2 mr-auto">
                    <button 
                        onClick={() => setIsContinuous(false)} 
                        className={`p-1 flex items-center gap-1 rounded transition-colors ${!isContinuous ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:bg-surface-container'}`} 
                        title="Page by Page"
                    >
                        <FileText size={16} />
                        <span className="text-xs font-medium hidden lg:inline px-1">Page</span>
                    </button>
                    <button 
                        onClick={() => setIsContinuous(true)} 
                        className={`p-1 flex items-center gap-1 rounded transition-colors ${isContinuous ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:bg-surface-container'}`} 
                        title="Continuous Scroll"
                    >
                        <List size={16} />
                        <span className="text-xs font-medium hidden lg:inline px-1">Scroll</span>
                    </button>
                </div>

                <div className="flex items-center gap-gap-xs bg-surface-container-low rounded border border-hardcoded-border p-0.5">
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
                
                <div className="flex items-center gap-gap-xs ml-2">
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
                            loading={<div className="p-10 text-on-surface-variant">Loading PDF...</div>}
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
                ) : (
                    <div className="p-10 text-on-surface-variant">
                        PDF not found locally. It might not be downloaded or the folder is incorrect.
                    </div>
                )}
            </div>
        </section>
    );
}
