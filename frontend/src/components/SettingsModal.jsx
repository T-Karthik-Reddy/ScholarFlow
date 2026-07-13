import React, { useState } from 'react';
import { validateApiKey } from '../services/api';
import { pickDirectory, isFsAccessSupported } from '../services/fsService';
import { getApiKey, setApiKey, setOnboarded } from '../services/settings';
import { KeyRound, FolderOpen, Check, ExternalLink, Loader2, Sparkles, X, Eye, EyeOff } from 'lucide-react';

export default function SettingsModal({ mode, dirHandle, dirStatus, onFolderPicked, onClose }) {
    const isOnboarding = mode === 'onboarding';
    // Onboarding walks through the same two sections step by step.
    const [step, setStep] = useState(isOnboarding ? 1 : 0);

    const [keyInput, setKeyInput] = useState(getApiKey());
    const [keyStatus, setKeyStatus] = useState(getApiKey() ? 'saved' : 'idle'); // idle | checking | valid | invalid | saved
    const [keyError, setKeyError] = useState('');
    const [folderError, setFolderError] = useState('');
    const [showKey, setShowKey] = useState(false);

    const handleValidateAndSave = async () => {
        const key = keyInput.trim();
        if (!key) {
            setKeyStatus('invalid');
            setKeyError('Please paste your API key first.');
            return;
        }
        setKeyStatus('checking');
        setKeyError('');
        try {
            await validateApiKey(key);
            setApiKey(key);
            setKeyStatus('valid');
        } catch (e) {
            setKeyStatus('invalid');
            setKeyError(e.message || 'Could not validate the key.');
        }
    };

    const handlePickFolder = async () => {
        setFolderError('');
        try {
            const handle = await pickDirectory();
            onFolderPicked(handle);
        } catch (e) {
            if (e?.name !== 'AbortError') {
                console.error(e);
                setFolderError('Could not open the folder picker.');
            }
        }
    };

    const handleFinish = () => {
        setOnboarded();
        onClose();
    };

    const keySection = (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-on-surface">
                <KeyRound size={18} className="text-primary" />
                <h4 className="font-bold text-sm">Gemini API Key</h4>
            </div>
            <p className="text-sm text-on-surface-variant leading-relaxed">
                ScholarFlow uses Google Gemini to chat with and implement papers. Your key is stored
                only in this browser and sent directly to your local backend.
            </p>
            <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary underline hover:opacity-80 w-fit"
            >
                Get a free API key from Google AI Studio <ExternalLink size={13} />
            </a>
            <div className="flex gap-2">
                <div className="flex-1 relative">
                    <input
                        type={showKey ? "text" : "password"}
                        value={keyInput}
                        onChange={(e) => { setKeyInput(e.target.value); setKeyStatus('idle'); setKeyError(''); }}
                        placeholder="Paste your Gemini API key (AIza...)"
                        className="w-full px-3 py-2 pr-10 bg-surface-container-lowest border border-hardcoded-border rounded font-body-md text-sm focus:border-primary outline-none text-on-surface"
                    />
                    <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant hover:text-on-surface transition-colors"
                        aria-label={showKey ? "Hide API key" : "Show API key"}
                    >
                        {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                </div>
                <button
                    onClick={handleValidateAndSave}
                    disabled={keyStatus === 'checking'}
                    className="px-3 py-2 bg-primary text-on-primary text-sm rounded font-medium disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                >
                    {keyStatus === 'checking' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {keyStatus === 'checking' ? 'Checking…' : 'Validate & Save'}
                </button>
            </div>
            {keyStatus === 'valid' && <p className="text-sm text-primary flex items-center gap-1"><Check size={14} /> Key validated and saved.</p>}
            {keyStatus === 'saved' && <p className="text-sm text-on-surface-variant">A key is saved in this browser. Paste a new one to replace it.</p>}
            {keyStatus === 'invalid' && <p className="text-sm text-error">{keyError}</p>}
        </div>
    );

    const folderSection = (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-on-surface">
                <FolderOpen size={18} className="text-primary" />
                <h4 className="font-bold text-sm">PDF Folder</h4>
            </div>
            <p className="text-sm text-on-surface-variant leading-relaxed">
                Choose a folder on your computer where imported paper PDFs will be saved and read from.
            </p>
            {!isFsAccessSupported() ? (
                <p className="text-sm text-error">Your browser does not support folder access. Use Chrome or Edge.</p>
            ) : (
                <div className="flex items-center gap-3">
                    <button
                        onClick={handlePickFolder}
                        className="px-3 py-2 bg-primary text-on-primary text-sm rounded font-medium flex items-center gap-1.5"
                    >
                        <FolderOpen size={14} /> {dirHandle ? 'Change folder' : 'Choose folder'}
                    </button>
                    {dirHandle && dirStatus === 'granted' && (
                        <span className="text-sm text-on-surface-variant flex items-center gap-1">
                            <Check size={14} className="text-primary" /> Using “{dirHandle.name}”
                        </span>
                    )}
                    {dirHandle && dirStatus === 'needs-permission' && (
                        <span className="text-sm text-on-surface-variant">“{dirHandle.name}” (access needs to be restored)</span>
                    )}
                </div>
            )}
            {folderError && <p className="text-sm text-error">{folderError}</p>}
        </div>
    );

    return (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
            <div className="bg-surface rounded-lg shadow-xl border border-hardcoded-border w-full max-w-lg flex flex-col overflow-hidden">
                <div className="p-4 border-b border-hardcoded-border bg-surface-container-lowest flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles size={18} className="text-primary" />
                        <h3 className="font-headline-sm text-sm font-bold text-on-surface">
                            {isOnboarding ? `Welcome to ScholarFlow ${step === 1 ? '· Step 1 of 2' : '· Step 2 of 2'}` : 'Settings'}
                        </h3>
                    </div>
                    {!isOnboarding && (
                        <button onClick={onClose} className="p-1 rounded hover:bg-surface-container text-on-surface-variant" aria-label="Close settings">
                            <X size={16} />
                        </button>
                    )}
                </div>

                <div className="p-5 flex flex-col gap-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {isOnboarding ? (step === 1 ? keySection : folderSection) : (
                        <>
                            {keySection}
                            <div className="border-t border-hardcoded-border"></div>
                            {folderSection}
                        </>
                    )}
                </div>

                <div className="p-4 border-t border-hardcoded-border bg-surface-container-lowest flex justify-end gap-2">
                    {isOnboarding && step === 1 && (
                        <>
                            <button onClick={() => setStep(2)} className="px-3 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container-high rounded">
                                Skip for now
                            </button>
                            <button
                                onClick={() => setStep(2)}
                                disabled={keyStatus !== 'valid' && keyStatus !== 'saved'}
                                className="px-4 py-1.5 text-sm bg-primary text-on-primary rounded font-medium disabled:opacity-50"
                            >
                                Next
                            </button>
                        </>
                    )}
                    {isOnboarding && step === 2 && (
                        <>
                            <button onClick={() => setStep(1)} className="px-3 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container-high rounded">
                                Back
                            </button>
                            <button onClick={handleFinish} className="px-4 py-1.5 text-sm bg-primary text-on-primary rounded font-medium">
                                {dirStatus === 'granted' ? 'Finish' : 'Finish (choose folder later)'}
                            </button>
                        </>
                    )}
                    {!isOnboarding && (
                        <button onClick={onClose} className="px-4 py-1.5 text-sm bg-primary text-on-primary rounded font-medium">
                            Done
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
