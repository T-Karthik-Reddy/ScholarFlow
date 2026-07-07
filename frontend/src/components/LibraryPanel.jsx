import React, { useState, useEffect } from 'react';
import { pickDirectory, savePdf } from '../services/fsService';
import { getCollections, createCollection, ingestPaper, deletePaper, deleteCollection, movePaper, moveAllPapers } from '../services/api';
import { Book, Folder, Clock, Download, Settings, Trash2, ChevronDown, ChevronRight, Plus, Pin, PinOff, FolderInput, Loader2 } from 'lucide-react';

export default function LibraryPanel({ onSelectPaper, selectedPaperId, dirHandle, onFolderPicked }) {
    const [collections, setCollections] = useState([]);
    const [arxivUrl, setArxivUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [importError, setImportError] = useState('');
    
    // UI State
    const [expandedCollections, setExpandedCollections] = useState({});
    const [pinnedPaperIds, setPinnedPaperIds] = useState([]);
    
    // Create Collection State
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newColName, setNewColName] = useState('');
    const [newColDesc, setNewColDesc] = useState('');

    // Import State
    const [showImportModal, setShowImportModal] = useState(false);
    const [importCollectionId, setImportCollectionId] = useState('');

    // Move Paper State
    const [movingPaper, setMovingPaper] = useState(null);
    const [moveTargetColId, setMoveTargetColId] = useState('');

    // Delete/Move Collection State
    const [deletingCollection, setDeletingCollection] = useState(null);
    const [bulkMovingCollection, setBulkMovingCollection] = useState(null);
    const [bulkMoveTargetColId, setBulkMoveTargetColId] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const cols = await getCollections();
            setCollections(cols);
            if (cols.length > 0 && !importCollectionId) {
                setImportCollectionId(cols[0].id.toString());
            }
        } catch (e) {
            console.error("Failed to fetch data", e);
        }
    };

    const toggleCollection = (id) => {
        setExpandedCollections(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const togglePin = (e, paperId) => {
        e.stopPropagation();
        setPinnedPaperIds(prev => 
            prev.includes(paperId) ? prev.filter(id => id !== paperId) : [...prev, paperId]
        );
    };

    const handleCreateCollection = async (e) => {
        e.preventDefault();
        if (!newColName.trim()) return;
        try {
            await createCollection(newColName, newColDesc);
            setNewColName('');
            setNewColDesc('');
            setShowCreateForm(false);
            await fetchData();
        } catch (err) {
            console.error(err);
            alert(err.message || "Failed to create collection");
        }
    };

    const handleImportClick = () => {
        if (!arxivUrl.trim() || loading) return;
        setImportError('');
        if (collections.length === 0) {
            setImportError("No collections exist yet. Create one first.");
            setShowCreateForm(true);
            return;
        }
        setShowImportModal(true);
    };

    const handleConfirmImport = async () => {
        if (!importCollectionId) return;

        // The folder picker must run inside this click, and we keep the
        // picked handle locally — the state update lands after this closure.
        let currentHandle = dirHandle;
        if (!currentHandle) {
            try {
                currentHandle = await pickDirectory();
                onFolderPicked(currentHandle);
            } catch (e) {
                if (e?.name !== 'AbortError') console.error(e);
                setImportError("A PDF folder is required to save the paper. Pick one to continue.");
                setShowImportModal(false);
                return;
            }
        }

        setShowImportModal(false);
        setLoading(true);
        try {
            const data = await ingestPaper(arxivUrl.trim(), parseInt(importCollectionId));
            const saved = await savePdf(currentHandle, data.filename, data.pdf_b64);
            if (!saved) {
                setImportError("Paper imported, but the PDF could not be written to your folder.");
            }
            setArxivUrl('');
            await fetchData();
            setExpandedCollections(prev => ({ ...prev, [importCollectionId]: true }));
        } catch (e) {
            console.error(e);
            setImportError(e.message || "Failed to import paper.");
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePaper = async (e, paperId) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this paper?")) return;
        try {
            await deletePaper(paperId);
            setPinnedPaperIds(prev => prev.filter(id => id !== paperId));
            await fetchData();
            if (selectedPaperId === paperId) {
                onSelectPaper(null);
            }
        } catch (error) {
            console.error("Failed to delete paper", error);
            alert(error.message || "Failed to delete paper");
        }
    };

    const handleMovePaperConfirm = async () => {
        if (!moveTargetColId) return;
        try {
            await movePaper(movingPaper.id, parseInt(moveTargetColId));
            setMovingPaper(null);
            await fetchData();
            setExpandedCollections(prev => ({ ...prev, [moveTargetColId]: true }));
        } catch (error) {
            console.error("Failed to move paper", error);
            alert(error.message || "Failed to move paper");
        }
    };

    const handleDeleteCollectionClick = async (e, col) => {
        e.stopPropagation();
        if (col.papers.length === 0) {
            if (confirm(`Delete empty collection "${col.name}"?`)) {
                try {
                    await deleteCollection(col.id);
                    await fetchData();
                } catch (err) {
                    console.error(err);
                }
            }
        } else {
            setDeletingCollection(col);
        }
    };

    const handleConfirmDeleteCollection = async () => {
        if (!deletingCollection) return;
        try {
            await deleteCollection(deletingCollection.id);
            setDeletingCollection(null);
            
            // Clear selections if deleted
            const deletedPaperIds = deletingCollection.papers.map(p => p.id);
            if (deletedPaperIds.includes(selectedPaperId)) onSelectPaper(null);
            setPinnedPaperIds(prev => prev.filter(id => !deletedPaperIds.includes(id)));
            
            await fetchData();
        } catch (err) {
            console.error("Failed to delete collection", err);
        }
    };

    const handleBulkMoveConfirm = async () => {
        if (!bulkMoveTargetColId || !bulkMovingCollection) return;
        try {
            await moveAllPapers(bulkMovingCollection.id, parseInt(bulkMoveTargetColId));
            await deleteCollection(bulkMovingCollection.id);
            setBulkMovingCollection(null);
            await fetchData();
            setExpandedCollections(prev => ({ ...prev, [bulkMoveTargetColId]: true }));
        } catch (err) {
            console.error("Failed to move and delete", err);
        }
    };

    const getPaperById = (id) => {
        for (const col of collections) {
            const p = col.papers.find(p => p.id === id);
            if (p) return p;
        }
        return null;
    };

    const activePapers = [];
    const addedIds = new Set();
    
    for (const pid of pinnedPaperIds) {
        const p = getPaperById(pid);
        if (p) {
            activePapers.push(p);
            addedIds.add(pid);
        }
    }
    
    if (selectedPaperId && !addedIds.has(selectedPaperId)) {
        const p = getPaperById(selectedPaperId);
        if (p) {
            activePapers.push(p);
            addedIds.add(selectedPaperId);
        }
    }

    const PaperItem = ({ p, isPinned }) => (
        <div 
            onClick={() => onSelectPaper(p)}
            className={`p-3 rounded border cursor-pointer mb-2 relative overflow-hidden group transition-colors flex items-start justify-between ${selectedPaperId === p.id ? 'bg-surface-container-low border-hardcoded-border' : 'border-transparent hover:bg-hardcoded-bg'}`}
        >
            {selectedPaperId === p.id && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary"></div>}
            <div className="flex-1 min-w-0 pr-2">
                <h4 className="font-label-md text-label-md font-bold text-on-surface mb-1 leading-tight pr-4">{p.title}</h4>
                <div className="flex items-center gap-gap-xs mb-2">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">{p.year || 'Unknown'}</span>
                    <span className="w-1 h-1 rounded-full bg-outline-variant"></span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant truncate">{p.authors || 'Unknown'}</span>
                </div>
            </div>
            <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={(e) => togglePin(e, p.id)}
                    className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary-container rounded transition-all"
                    title={isPinned ? "Unpin paper" : "Pin paper"}
                >
                    {isPinned ? <PinOff size={16} /> : <Pin size={16} />}
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); setMovingPaper(p); setMoveTargetColId(''); }}
                    className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary-container rounded transition-all"
                    title="Move to another collection"
                >
                    <FolderInput size={16} />
                </button>
                <button
                    onClick={(e) => handleDeletePaper(e, p.id)}
                    className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container rounded transition-all"
                    title="Delete paper"
                >
                    <Trash2 size={16} />
                </button>
            </div>
            {isPinned && <Pin size={12} className="absolute right-2 top-2 text-primary opacity-100" />}
        </div>
    );

    return (
        <aside className="h-full w-full bg-surface border-r border-hardcoded-border flex flex-col relative z-10 transition-colors duration-150 ease-in-out hidden md:flex">
            <div className="p-gap-md border-b border-hardcoded-border">
                <nav className="flex flex-col gap-unit">
                    <div className="flex items-center gap-gap-sm px-3 py-2 rounded text-primary bg-surface-container font-label-md text-label-md font-bold">
                        <Book size={18} /> Library
                    </div>
                </nav>
            </div>

            <div className="p-gap-md border-b border-hardcoded-border shrink-0 flex flex-col gap-2">
                <div className="relative flex gap-2">
                    <input 
                        className="flex-1 pl-3 pr-8 py-1.5 bg-surface-container-lowest border border-hardcoded-border rounded focus:border-primary-container focus:ring-0 font-body-md text-body-md transition-colors" 
                        placeholder="Import arXiv URL..." 
                        type="text"
                        value={arxivUrl}
                        onChange={(e) => setArxivUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleImportClick()}
                    />
                    <button
                        onClick={handleImportClick}
                        disabled={loading}
                        title="Import paper"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors disabled:opacity-50">
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    </button>
                </div>
                {loading && (
                    <p className="text-xs text-on-surface-variant px-1">Downloading paper from arXiv…</p>
                )}
                {importError && (
                    <p className="text-xs text-error px-1 flex items-start justify-between gap-2">
                        <span>{importError}</span>
                        <button onClick={() => setImportError('')} className="shrink-0 underline">dismiss</button>
                    </p>
                )}
            </div>

            {/* Modals overlay */}
            {(showImportModal || movingPaper || deletingCollection || bulkMovingCollection) && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
                    <div className="bg-surface rounded-lg shadow-lg border border-hardcoded-border w-full max-w-sm flex flex-col overflow-hidden">
                        
                        {/* Import Modal */}
                        {showImportModal && (
                            <>
                                <div className="p-4 border-b border-hardcoded-border bg-surface-container-lowest">
                                    <h3 className="font-headline-sm text-sm font-bold text-on-surface">Import Paper</h3>
                                </div>
                                <div className="p-4 flex flex-col gap-3">
                                    <label className="font-label-sm text-xs text-on-surface-variant uppercase tracking-wide">Select Collection</label>
                                    <select 
                                        value={importCollectionId} 
                                        onChange={e => setImportCollectionId(e.target.value)}
                                        className="w-full px-2 py-2 bg-surface-container border border-hardcoded-border rounded font-body-sm text-sm outline-none"
                                    >
                                        {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="p-4 border-t border-hardcoded-border bg-surface-container-lowest flex justify-end gap-2">
                                    <button onClick={() => setShowImportModal(false)} className="px-3 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container-high rounded">Cancel</button>
                                    <button onClick={handleConfirmImport} className="px-3 py-1.5 text-sm bg-primary text-on-primary rounded">Import</button>
                                </div>
                            </>
                        )}

                        {/* Move Single Paper Modal */}
                        {movingPaper && (
                            <>
                                <div className="p-4 border-b border-hardcoded-border bg-surface-container-lowest">
                                    <h3 className="font-headline-sm text-sm font-bold text-on-surface">Move Paper</h3>
                                </div>
                                <div className="p-4 flex flex-col gap-3">
                                    <p className="text-sm text-on-surface-variant truncate">"{movingPaper.title}"</p>
                                    <label className="font-label-sm text-xs text-on-surface-variant uppercase tracking-wide mt-2">Destination Collection</label>
                                    <select 
                                        value={moveTargetColId} 
                                        onChange={e => setMoveTargetColId(e.target.value)}
                                        className="w-full px-2 py-2 bg-surface-container border border-hardcoded-border rounded font-body-sm text-sm outline-none"
                                    >
                                        <option value="" disabled>Select destination...</option>
                                        {collections.filter(c => !c.papers.some(p => p.id === movingPaper.id)).map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="p-4 border-t border-hardcoded-border bg-surface-container-lowest flex justify-end gap-2">
                                    <button onClick={() => setMovingPaper(null)} className="px-3 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container-high rounded">Cancel</button>
                                    <button onClick={handleMovePaperConfirm} disabled={!moveTargetColId} className="px-3 py-1.5 text-sm bg-primary text-on-primary rounded disabled:opacity-50">Move</button>
                                </div>
                            </>
                        )}

                        {/* Delete Collection Warning Modal */}
                        {deletingCollection && (
                            <>
                                <div className="p-4 border-b border-hardcoded-border bg-error-container">
                                    <h3 className="font-headline-sm text-sm font-bold text-error">Warning: Delete Collection</h3>
                                </div>
                                <div className="p-4 flex flex-col gap-3">
                                    <p className="text-sm text-on-surface">
                                        The collection <strong>"{deletingCollection.name}"</strong> contains {deletingCollection.papers.length} paper(s).
                                    </p>
                                    <p className="text-sm text-on-surface-variant">What would you like to do with these papers?</p>
                                </div>
                                <div className="p-4 border-t border-hardcoded-border bg-surface-container-lowest flex flex-col gap-2">
                                    <button onClick={() => {
                                        setBulkMovingCollection(deletingCollection);
                                        setDeletingCollection(null);
                                        setBulkMoveTargetColId('');
                                    }} className="w-full py-2 text-sm bg-primary-container text-on-primary-container hover:bg-primary hover:text-on-primary rounded transition-colors text-center font-medium">
                                        Move Papers & Delete
                                    </button>
                                    <button onClick={handleConfirmDeleteCollection} className="w-full py-2 text-sm bg-error text-on-error hover:opacity-90 rounded transition-colors text-center font-medium">
                                        Delete All
                                    </button>
                                    <button onClick={() => setDeletingCollection(null)} className="w-full py-2 text-sm text-on-surface-variant hover:bg-surface-container-high rounded text-center">
                                        Cancel
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Bulk Move Modal */}
                        {bulkMovingCollection && (
                            <>
                                <div className="p-4 border-b border-hardcoded-border bg-surface-container-lowest">
                                    <h3 className="font-headline-sm text-sm font-bold text-on-surface">Move Papers & Delete</h3>
                                </div>
                                <div className="p-4 flex flex-col gap-3">
                                    <p className="text-sm text-on-surface-variant mb-2">Select where to move {bulkMovingCollection.papers.length} papers from "{bulkMovingCollection.name}":</p>
                                    <select 
                                        value={bulkMoveTargetColId} 
                                        onChange={e => setBulkMoveTargetColId(e.target.value)}
                                        className="w-full px-2 py-2 bg-surface-container border border-hardcoded-border rounded font-body-sm text-sm outline-none"
                                    >
                                        <option value="" disabled>Select destination...</option>
                                        {collections.filter(c => c.id !== bulkMovingCollection.id).map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="p-4 border-t border-hardcoded-border bg-surface-container-lowest flex justify-end gap-2">
                                    <button onClick={() => setBulkMovingCollection(null)} className="px-3 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container-high rounded">Cancel</button>
                                    <button onClick={handleBulkMoveConfirm} disabled={!bulkMoveTargetColId} className="px-3 py-1.5 text-sm bg-primary text-on-primary rounded disabled:opacity-50">Confirm</button>
                                </div>
                            </>
                        )}
                        
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                {activePapers.length > 0 && (
                    <div className="p-unit border-b border-hardcoded-border">
                        <h3 className="font-label-sm text-label-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2 px-1 flex items-center gap-1">
                            <Clock size={14} /> Active Workspace
                        </h3>
                        {activePapers.map(p => (
                            <PaperItem key={`active_${p.id}`} p={p} isPinned={pinnedPaperIds.includes(p.id)} />
                        ))}
                    </div>
                )}

                <div className="p-unit flex-1">
                    <div className="flex items-center justify-between mb-2 px-1">
                        <h3 className="font-label-sm text-label-sm font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                            <Folder size={14} /> Collections
                        </h3>
                        <button 
                            onClick={() => setShowCreateForm(!showCreateForm)}
                            className="text-on-surface-variant hover:text-primary transition-colors p-1"
                            title="New Collection"
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    {showCreateForm && (
                        <form onSubmit={handleCreateCollection} className="p-3 bg-surface-container-lowest border border-hardcoded-border rounded mb-3 flex flex-col gap-2">
                            <input 
                                autoFocus
                                required
                                value={newColName}
                                onChange={e => setNewColName(e.target.value)}
                                placeholder="Collection Name" 
                                className="w-full px-2 py-1 text-sm border border-hardcoded-border rounded"
                            />
                            <textarea 
                                value={newColDesc}
                                onChange={e => setNewColDesc(e.target.value)}
                                placeholder="Description (optional)" 
                                className="w-full px-2 py-1 text-sm border border-hardcoded-border rounded resize-none"
                                rows="2"
                            />
                            <div className="flex justify-end gap-2 mt-1">
                                <button type="button" onClick={() => setShowCreateForm(false)} className="text-xs text-on-surface-variant hover:text-on-surface">Cancel</button>
                                <button type="submit" className="text-xs bg-primary text-on-primary px-2 py-1 rounded">Create</button>
                            </div>
                        </form>
                    )}

                    {collections.length === 0 && !showCreateForm && (
                        <div className="text-sm text-center text-on-surface-variant mt-4 p-4 border border-dashed border-hardcoded-border rounded">
                            No collections yet. Click the + icon to create one.
                        </div>
                    )}

                    {collections.map(col => (
                        <div key={col.id} className="mb-1">
                            <div className="flex items-center gap-2 p-2 rounded hover:bg-surface-container-lowest cursor-pointer group">
                                <div onClick={() => toggleCollection(col.id)} className="flex items-center gap-2 flex-1 min-w-0">
                                    {expandedCollections[col.id] ? <ChevronDown size={16} className="text-on-surface-variant shrink-0" /> : <ChevronRight size={16} className="text-on-surface-variant shrink-0" />}
                                    <div className="flex-1 min-w-0">
                                        <div className="font-label-md text-sm font-bold text-on-surface truncate">{col.name}</div>
                                        {col.description && <div className="text-xs text-on-surface-variant truncate">{col.description}</div>}
                                    </div>
                                    <span className="text-xs text-on-surface-variant px-1.5 py-0.5 bg-surface-container rounded">{col.papers?.length || 0}</span>
                                </div>
                                <button 
                                    onClick={(e) => handleDeleteCollectionClick(e, col)}
                                    className="p-1.5 text-on-surface-variant opacity-0 group-hover:opacity-100 hover:text-error hover:bg-error-container rounded transition-all"
                                    title="Delete Collection"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                            
                            {expandedCollections[col.id] && (
                                <div className="pl-6 pr-2 py-2 border-l-2 border-surface-container-highest ml-3 mt-1">
                                    {col.papers?.length === 0 ? (
                                        <div className="text-xs text-on-surface-variant italic">Empty collection</div>
                                    ) : (
                                        col.papers.map(p => (
                                            <PaperItem key={`col_${col.id}_${p.id}`} p={p} isPinned={pinnedPaperIds.includes(p.id)} />
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="p-gap-md border-t border-hardcoded-border shrink-0 mt-auto bg-surface">
                <nav className="flex flex-col gap-unit">
                    <button
                        onClick={async () => {
                            try {
                                const handle = await pickDirectory();
                                onFolderPicked(handle);
                            } catch (e) {
                                if (e?.name !== 'AbortError') console.error(e);
                            }
                        }}
                        className="w-full flex items-center gap-gap-sm px-3 py-2 rounded text-secondary hover:bg-surface-container font-label-md text-label-md transition-colors text-left"
                    >
                        <Settings size={18} /> {dirHandle ? `PDF Folder: ${dirHandle.name}` : 'Set PDF Folder'}
                    </button>
                </nav>
            </div>
        </aside>
    );
}
