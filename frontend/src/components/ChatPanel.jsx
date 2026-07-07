import React, { useState, useEffect, useRef } from 'react';
import { getChats, sendChat } from '../services/api';
import { Bot, User, Send, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function ChatPanel({ paper, onOpenSettings }) {
    const [chats, setChats] = useState([]);
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        setError('');
        if (paper) {
            getChats(paper.id)
                .then(setChats)
                .catch(e => console.error("Failed to fetch chats", e));
        } else {
            setChats([]);
        }
    }, [paper]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chats, loading]);

    const handleSend = async (msgText = message) => {
        const text = msgText.trim();
        if (!text || !paper || loading) return;

        const tempId = `temp_${Date.now()}`;
        setChats(prev => [...prev, { id: tempId, role: 'user', content: text }]);
        setMessage('');
        setError('');
        setLoading(true);

        try {
            const response = await sendChat(paper.id, text);
            setChats(prev => [...prev, response]);
        } catch (e) {
            console.error(e);
            // Roll back the optimistic message and restore the input for retry.
            setChats(prev => prev.filter(c => c.id !== tempId));
            setMessage(text);
            setError(e.message || 'Failed to send message.');
        } finally {
            setLoading(false);
        }
    };

    const isKeyError = /api key/i.test(error);

    return (
        <aside className="h-full w-full bg-surface border-l border-hardcoded-border flex flex-col relative z-10 hidden lg:flex">
            <div className="p-gap-md border-b border-hardcoded-border flex items-center justify-between shrink-0">
                <div className="flex items-center gap-gap-sm">
                    <Bot className="text-primary" size={20} />
                    <span className="font-headline-md text-headline-md font-bold text-on-surface">Gemini Assistant</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-gap-md flex flex-col gap-gap-md">
                {!paper ? (
                    <div className="text-center text-on-surface-variant mt-10">Select a paper to start chatting</div>
                ) : chats.length === 0 ? (
                    <div className="text-center text-on-surface-variant mt-10">No messages yet. Ask a question!</div>
                ) : (
                    chats.map((c, i) => (
                        <div key={c.id ?? i} className={`flex gap-gap-sm ${c.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${c.role === 'user' ? 'bg-primary-container text-on-primary' : 'bg-surface-container border border-hardcoded-border text-primary'}`}>
                                {c.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                            </div>
                            <div className={`rounded-lg p-3 font-body-md text-body-md shadow-sm max-w-[85%] ${c.role === 'user' ? 'bg-primary text-on-primary rounded-tr-none' : 'bg-surface-container-low border border-hardcoded-border rounded-tl-none text-on-surface'}`}>
                                <div className="text-sm leading-relaxed">
                                    {c.role === 'user' ? (
                                        <p className="whitespace-pre-wrap">{c.content}</p>
                                    ) : (
                                        <ReactMarkdown
                                            components={{
                                                p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                                                ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2 last:mb-0" {...props} />,
                                                ol: ({node, ...props}) => <ol className="list-decimal pl-4 mb-2 last:mb-0" {...props} />,
                                                li: ({node, ...props}) => <li className="mb-1 last:mb-0" {...props} />,
                                                h1: ({node, ...props}) => <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0" {...props} />,
                                                h2: ({node, ...props}) => <h2 className="text-base font-bold mb-2 mt-3 first:mt-0" {...props} />,
                                                h3: ({node, ...props}) => <h3 className="text-sm font-bold mb-2 mt-3 first:mt-0" {...props} />,
                                                pre: ({node, ...props}) => <pre className="bg-black/5 dark:bg-white/10 p-2 rounded text-xs overflow-x-auto mb-2 last:mb-0" {...props} />,
                                                // react-markdown v9+ no longer passes an `inline`
                                                // prop; code inside a fenced block gets a
                                                // language className or lives inside our styled
                                                // <pre>, so only pad bare single-line code.
                                                code: ({node, className, children, ...props}) => {
                                                    const isBlock = className || String(children).includes('\n');
                                                    return (
                                                        <code
                                                            className={isBlock ? `${className || ''} font-mono text-xs` : 'bg-black/5 dark:bg-white/10 rounded px-1 py-0.5 font-mono text-xs'}
                                                            {...props}
                                                        >{children}</code>
                                                    );
                                                },
                                                a: ({node, ...props}) => <a className="text-primary underline hover:text-primary-container" target="_blank" rel="noopener noreferrer" {...props} />
                                            }}
                                        >
                                            {c.content}
                                        </ReactMarkdown>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
                {loading && (
                    <div className="flex gap-gap-sm">
                        <div className="w-8 h-8 rounded-full bg-surface-container border border-hardcoded-border text-primary flex items-center justify-center shrink-0">
                            <Bot size={18} />
                        </div>
                        <div className="bg-surface-container-low border border-hardcoded-border rounded-lg rounded-tl-none p-3 text-on-surface font-body-md text-body-md shadow-sm">
                            <p className="text-sm animate-pulse">Thinking…</p>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-gap-md border-t border-hardcoded-border shrink-0 bg-surface">
                {error && (
                    <div className="mb-3 p-2.5 bg-error-container text-on-error-container rounded text-xs flex items-start gap-2">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <span>{error}</span>
                            {isKeyError && (
                                <button onClick={onOpenSettings} className="underline font-medium ml-1">Open Settings</button>
                            )}
                        </div>
                    </div>
                )}
                <div className="flex gap-2 mb-3 overflow-x-auto pb-1 custom-scrollbar">
                    <button onClick={() => handleSend("Summarize this paper")} disabled={!paper || loading} className="px-3 py-1 bg-surface-container-high text-secondary font-label-sm text-label-sm rounded whitespace-nowrap hover:bg-hardcoded-border transition-colors border border-transparent hover:border-outline-variant disabled:opacity-50">
                        Summarize
                    </button>
                    <button onClick={() => handleSend("Extract key findings")} disabled={!paper || loading} className="px-3 py-1 bg-surface-container-high text-secondary font-label-sm text-label-sm rounded whitespace-nowrap hover:bg-hardcoded-border transition-colors border border-transparent hover:border-outline-variant disabled:opacity-50">
                        Key Findings
                    </button>
                    <button onClick={() => handleSend("Explain the methodology in simple terms")} disabled={!paper || loading} className="px-3 py-1 bg-surface-container-high text-secondary font-label-sm text-label-sm rounded whitespace-nowrap hover:bg-hardcoded-border transition-colors border border-transparent hover:border-outline-variant disabled:opacity-50">
                        Methodology
                    </button>
                </div>
                <div className="relative border border-hardcoded-border rounded-lg focus-within:border-primary-container focus-within:ring-1 focus-within:ring-primary-container bg-surface-container-lowest overflow-hidden transition-all">
                    <textarea
                        className="w-full pl-3 pr-10 py-3 bg-transparent border-none focus:ring-0 font-body-md text-body-md resize-none h-20 placeholder-on-surface-variant outline-none text-on-surface"
                        placeholder={paper ? "Ask about this paper…" : "Select a paper first…"}
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        disabled={!paper}
                    ></textarea>
                    <div className="absolute right-2 bottom-2 flex gap-1">
                        <button
                            onClick={() => handleSend()}
                            disabled={!paper || loading || !message.trim()}
                            className="p-1.5 bg-primary-container text-on-primary rounded transition-colors hover:bg-primary shadow-sm disabled:opacity-50" title="Send message">
                            <Send size={20} />
                        </button>
                    </div>
                </div>
            </div>
        </aside>
    );
}
