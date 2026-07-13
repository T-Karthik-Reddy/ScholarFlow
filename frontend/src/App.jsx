import React, { useState, useEffect } from 'react';
import TopNav from './components/TopNav';
import LibraryPanel from './components/LibraryPanel';
import PdfViewer from './components/PdfViewer';
import ChatPanel from './components/ChatPanel';
import SettingsModal from './components/SettingsModal';
import AuthModal from './components/AuthModal';
import { getStoredDirectory, requestDirectoryPermission, isFsAccessSupported } from './services/fsService';
import { getApiKey, isOnboarded, getAuthToken } from './services/settings';
import { FolderOpen } from 'lucide-react';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';

export default function App() {
    const [selectedPaper, setSelectedPaper] = useState(null);
    const [dirHandle, setDirHandle] = useState(null);
    const [dirStatus, setDirStatus] = useState('none');
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(!!getAuthToken());
    const [chatDraft, setChatDraft] = useState("");

    useEffect(() => {
        getStoredDirectory().then(({ handle, status }) => {
            setDirHandle(handle);
            setDirStatus(status);
        });
        if (!isOnboarded() && !getApiKey()) {
            setShowOnboarding(true);
        }
    }, []);

    const handleFolderPicked = (handle) => {
        setDirHandle(handle);
        setDirStatus(handle ? 'granted' : 'none');
    };

    const handleRestoreAccess = async () => {
        if (!dirHandle) return;
        const granted = await requestDirectoryPermission(dirHandle);
        if (granted) setDirStatus('granted');
    };

    const grantedDirHandle = dirStatus === 'granted' ? dirHandle : null;

    if (!isAuthenticated) {
        return (
            <div className="bg-background h-screen w-screen">
                <AuthModal onAuthenticated={() => setIsAuthenticated(true)} />
            </div>
        );
    }

    return (
        <div className="bg-background text-on-background font-body-md h-screen overflow-hidden flex flex-col antialiased">
            <TopNav onOpenSettings={() => setShowSettings(true)} />

            {!isFsAccessSupported() && (
                <div className="bg-error-container text-on-error-container text-sm px-margin-page py-2 shrink-0">
                    Your browser does not support the File System Access API (needed to save PDFs locally).
                    Please use Chrome, Edge, or another Chromium-based browser.
                </div>
            )}

            {dirStatus === 'needs-permission' && (
                <div className="bg-primary-fixed text-on-primary-fixed text-sm px-margin-page py-2 shrink-0 flex items-center justify-between gap-4">
                    <span>ScholarFlow needs permission to access your PDF folder again.</span>
                    <button
                        onClick={handleRestoreAccess}
                        className="flex items-center gap-1.5 px-3 py-1 bg-primary text-on-primary rounded font-medium whitespace-nowrap hover:opacity-90 transition-opacity"
                    >
                        <FolderOpen size={14} /> Restore access
                    </button>
                </div>
            )}

            <main className="h-full w-full overflow-hidden relative flex-1">
                <PanelGroup orientation="horizontal" className="h-full w-full">
                    <Panel defaultSize="20%" minSize="15%" maxSize="30%">
                        <LibraryPanel
                            onSelectPaper={setSelectedPaper}
                            selectedPaperId={selectedPaper?.id}
                            dirHandle={grantedDirHandle}
                            onFolderPicked={handleFolderPicked}
                            key={selectedPaper?.id || 'library'}
                        />
                    </Panel>

                    <PanelResizeHandle className="relative w-[1px] bg-hardcoded-border hidden md:block group z-50">
                        <div className="absolute inset-y-0 -left-[4px] -right-[4px] cursor-col-resize group-hover:bg-primary/20 transition-colors duration-150"></div>
                    </PanelResizeHandle>

                    <Panel defaultSize="55%" minSize="30%">
                        <PdfViewer
                            paper={selectedPaper}
                            dirHandle={grantedDirHandle}
                            onImplement={() => setChatDraft("I want to implement this paper. What are my options?")}
                            onOpenSettings={() => setShowSettings(true)}
                            onAskAi={setChatDraft}
                        />
                    </Panel>

                    <PanelResizeHandle className="relative w-[1px] bg-hardcoded-border hidden lg:block group z-50">
                        <div className="absolute inset-y-0 -left-[4px] -right-[4px] cursor-col-resize group-hover:bg-primary/20 transition-colors duration-150"></div>
                    </PanelResizeHandle>

                    <Panel defaultSize="25%" minSize="20%" maxSize="40%">
                        <ChatPanel 
                            paper={selectedPaper} 
                            onOpenSettings={() => setShowSettings(true)} 
                            chatDraft={chatDraft}
                            onChatDraftChange={setChatDraft}
                        />
                    </Panel>
                </PanelGroup>
            </main>

            {(showOnboarding || showSettings) && (
                <SettingsModal
                    mode={showOnboarding ? 'onboarding' : 'settings'}
                    dirHandle={dirHandle}
                    dirStatus={dirStatus}
                    onFolderPicked={handleFolderPicked}
                    onClose={() => { setShowOnboarding(false); setShowSettings(false); }}
                />
            )}
        </div>
    );
}
