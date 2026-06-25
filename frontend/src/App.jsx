import React, { useState, useEffect } from 'react';
import TopNav from './components/TopNav';
import LibraryPanel from './components/LibraryPanel';
import PdfViewer from './components/PdfViewer';
import ChatPanel from './components/ChatPanel';
import { getDirectoryHandle } from './services/fsService';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';

export default function App() {
    const [selectedPaper, setSelectedPaper] = useState(null);
    const [dirHandle, setDirHandle] = useState(null);

    useEffect(() => {
        // Try to load dir handle from indexed DB
        getDirectoryHandle().then(handle => {
            if (handle) setDirHandle(handle);
        });
    }, []);

    return (
        <div className="bg-background text-on-background font-body-md h-screen overflow-hidden flex flex-col antialiased">
            <TopNav />
            <main className="h-full w-full overflow-hidden relative flex-1">
                <PanelGroup direction="horizontal" className="h-full w-full">
                    <Panel defaultSize="20%" minSize="15%" maxSize="30%">
                        <LibraryPanel 
                            onSelectPaper={setSelectedPaper} 
                            selectedPaperId={selectedPaper?.id} 
                            dirHandle={dirHandle} 
                            setDirHandle={setDirHandle}
                        />
                    </Panel>
                    
                    <PanelResizeHandle className="relative w-[1px] bg-hardcoded-border hidden md:block group z-50">
                        <div className="absolute inset-y-0 -left-[4px] -right-[4px] cursor-col-resize group-hover:bg-primary/20 transition-colors duration-150"></div>
                    </PanelResizeHandle>

                    <Panel defaultSize="55%" minSize="30%">
                        <PdfViewer paper={selectedPaper} dirHandle={dirHandle} />
                    </Panel>
                    
                    <PanelResizeHandle className="relative w-[1px] bg-hardcoded-border hidden lg:block group z-50">
                        <div className="absolute inset-y-0 -left-[4px] -right-[4px] cursor-col-resize group-hover:bg-primary/20 transition-colors duration-150"></div>
                    </PanelResizeHandle>

                    <Panel defaultSize="25%" minSize="20%" maxSize="40%">
                        <ChatPanel paper={selectedPaper} />
                    </Panel>
                </PanelGroup>
            </main>
        </div>
    );
}
