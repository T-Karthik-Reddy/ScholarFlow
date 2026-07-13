import React, { useState, useEffect, useRef } from 'react';
import { getChats, sendChat } from '../services/api';
import { Bot, User, Send, AlertTriangle, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

export default function ChatPanel({ paper, onOpenSettings, chatDraft, onChatDraftChange }) {
    const [chats, setChats] = useState([]);
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [currentOptionIndex, setCurrentOptionIndex] = useState(0);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        setCurrentOptionIndex(0);
    }, [chats.length]);

    useEffect(() => {
        if (chatDraft) {
            if (chatDraft === "I want to implement this paper. What are my options?") {
                handleSend(chatDraft);
            } else {
                setMessage(prev => {
                    const base = prev.trim();
                    return (base ? base + '\n\n' : '') + `> "${chatDraft}"\n\n`;
                });
            }
            onChatDraftChange("");
        }
    }, [chatDraft, onChatDraftChange]);

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

        const tempUserId = `temp_user_${Date.now()}`;
        const tempAssistantId = `temp_assistant_${Date.now()}`;
        
        setChats(prev => [
            ...prev, 
            { id: tempUserId, role: 'user', content: text },
            { id: tempAssistantId, role: 'assistant', content: '' }
        ]);
        
        setMessage('');
        setError('');
        setLoading(true);

        try {
            const { sendChatStream } = await import('../services/api');
            await sendChatStream(paper.id, text, (chunk) => {
                if (chunk.text) {
                    setChats(prev => prev.map(c => 
                        c.id === tempAssistantId ? { ...c, content: c.content + chunk.text } : c
                    ));
                }
                if (chunk.done) {
                    setChats(prev => prev.map(c => 
                        c.id === tempAssistantId ? { ...c, id: chunk.id, timestamp: chunk.timestamp } : c
                    ));
                }
                if (chunk.error) {
                    setError(chunk.error);
                }
            });
        } catch (e) {
            console.error(e);
            setChats(prev => prev.filter(c => c.id !== tempUserId && c.id !== tempAssistantId));
            setMessage(text);
            setError(e.message || 'Failed to send message.');
        } finally {
            setLoading(false);
        }
    };

    const preprocessMath = (text) => {
        if (!text) return text;
        let processed = text.replace(/\\\[([\s\S]*?)\\\]/g, '\n\n$$$$$1$$$$\n\n');
        processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
        return processed;
    };

    const parseStructuredResponse = (content) => {
        if (!content) return { obj: null, text: '' };
        try {
            // Start at `{"type":` and match to the last `}` to allow nested brackets (e.g. from LaTeX math or code) inside the JSON.
            const jsonMatch = content.match(/\{\s*"type"\s*:\s*"(implementation_plan_choice|ready_to_implement)"[\s\S]*\}/);
            if (jsonMatch) {
                const obj = JSON.parse(jsonMatch[0]);
                if (obj && typeof obj === 'object' && obj.type) {
                    let text = content.replace(jsonMatch[0], '').trim();
                    if (!text) text = obj.text || '';
                    if (obj.type === 'ready_to_implement' && obj.plan) {
                        text += '\n\n**Implementation Plan**\n\n' + obj.plan;
                    }
                    return { obj, text };
                }
            }
            const obj = JSON.parse(content);
            if (obj && typeof obj === 'object' && obj.type) return { obj, text: '' };
        } catch (e) {
            return { obj: null, text: content };
        }
        return { obj: null, text: content };
    };

    const isKeyError = /api key/i.test(error);
    const lastMessage = chats[chats.length - 1];
    const structuredLastMessage = lastMessage?.role === 'assistant' ? parseStructuredResponse(lastMessage.content).obj : null;

    const handleProceed = async () => {
        if (!paper) return;
        setLoading(true);
        setError('');
        
        const tempAssistantId = Date.now();
        setChats(prev => [...prev, {
            id: tempAssistantId,
            role: 'assistant',
            content: '*Starting Agentic Implementation Loop... The Senior Engineer evaluator is rigorously reviewing the generated code. (This may take up to 2 minutes)*'
        }]);

        try {
            const { implementPaper } = await import('../services/api');
            const result = await implementPaper(paper.id, structuredLastMessage.plan || "Use the provided plan.");
            console.log("Implementation Result:", result);
            
            setChats(prev => prev.map(c => c.id === tempAssistantId ? {
                ...c,
                content: `✅ **Implementation Complete!**\n\nThe full project code has been generated and saved to your local disk at:\n\`${result.local_path}\`\n\n**Summary:**\n${result.summary}\n\n**Run Instructions:**\n\`\`\`bash\n${result.run_instructions}\n\`\`\``
            } : c));
        } catch (e) {
            console.error(e);
            setError(e.message || "Implementation failed.");
            setChats(prev => prev.filter(c => c.id !== tempAssistantId));
        } finally {
            setLoading(false);
        }
    };

    const handleClearChats = async () => {
        if (!paper || chats.length === 0) return;
        if (!window.confirm("Are you sure you want to clear the chat history for this paper?")) return;
        setLoading(true);
        try {
            const { clearChatHistory } = await import('../services/api');
            await clearChatHistory(paper.id);
            setChats([]);
        } catch (e) {
            setError(e.message || "Failed to clear chats.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <aside className="h-full w-full bg-surface border-l border-hardcoded-border flex flex-col relative z-10 hidden lg:flex">
            <div className="p-gap-md border-b border-hardcoded-border flex items-center justify-between shrink-0">
                <div className="flex items-center gap-gap-sm">
                    <Bot className="text-primary" size={20} />
                    <span className="font-headline-md text-headline-md font-bold text-on-surface">Gemini Assistant</span>
                </div>
                {chats.length > 0 && (
                    <button
                        onClick={handleClearChats}
                        disabled={loading}
                        title="Clear Chat History"
                        className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container/50 rounded transition-colors disabled:opacity-50"
                    >
                        <Trash2 size={16} />
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-gap-md flex flex-col gap-gap-md">
                {!paper ? (
                    <div className="text-center text-on-surface-variant mt-10">Select a paper to start chatting</div>
                ) : chats.length === 0 ? (
                    <div className="text-center text-on-surface-variant mt-10">No messages yet. Ask a question!</div>
                ) : (
                    chats.map((c, i) => {
                        const parsed = c.role === 'assistant' ? parseStructuredResponse(c.content) : null;
                        const displayText = parsed ? parsed.text : c.content;
                        const mathText = preprocessMath(displayText);
                        return (
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
                                                remarkPlugins={[remarkMath]}
                                                rehypePlugins={[rehypeKatex]}
                                                components={{
                                                    p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                                                    ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2 last:mb-0" {...props} />,
                                                    ol: ({node, ...props}) => <ol className="list-decimal pl-4 mb-2 last:mb-0" {...props} />,
                                                    li: ({node, ...props}) => <li className="mb-1 last:mb-0" {...props} />,
                                                    h1: ({node, ...props}) => <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0" {...props} />,
                                                    h2: ({node, ...props}) => <h2 className="text-base font-bold mb-2 mt-3 first:mt-0" {...props} />,
                                                    h3: ({node, ...props}) => <h3 className="text-sm font-bold mb-2 mt-3 first:mt-0" {...props} />,
                                                    pre: ({node, ...props}) => <pre className="bg-black/5 dark:bg-white/10 p-2 rounded text-xs overflow-x-auto mb-2 last:mb-0" {...props} />,
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
                                                {mathText || 'Thinking…'}
                                            </ReactMarkdown>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-gap-md border-t border-hardcoded-border shrink-0 bg-surface flex flex-col">
                {structuredLastMessage?.type === 'implementation_plan_choice' && !loading && (
                    <div className="mb-4 bg-surface-container-lowest border border-hardcoded-border rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="p-3 flex items-center justify-between text-sm font-medium text-on-surface border-b border-hardcoded-border bg-surface-container-low">
                            <span>Choose an implementation path:</span>
                            {structuredLastMessage.options?.length > 0 && (
                                <div className="flex items-center gap-2 text-on-surface-variant">
                                    <button 
                                        disabled={currentOptionIndex === 0} 
                                        onClick={() => setCurrentOptionIndex(prev => prev - 1)}
                                        className="p-1 hover:bg-hardcoded-border rounded transition-colors disabled:opacity-30"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <span className="text-xs font-bold w-8 text-center">{currentOptionIndex + 1} of {structuredLastMessage.options.length}</span>
                                    <button 
                                        disabled={currentOptionIndex === structuredLastMessage.options.length - 1} 
                                        onClick={() => setCurrentOptionIndex(prev => prev + 1)}
                                        className="p-1 hover:bg-hardcoded-border rounded transition-colors disabled:opacity-30"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="p-4 flex flex-col gap-3">
                            <div className="text-on-surface font-medium text-sm leading-relaxed min-h-[40px]">
                                <ReactMarkdown>{structuredLastMessage.options?.[currentOptionIndex] || ''}</ReactMarkdown>
                            </div>
                            <button 
                                onClick={() => handleSend(structuredLastMessage.options?.[currentOptionIndex])}
                                className="w-full py-2 bg-primary-container text-on-primary-container rounded-lg font-bold shadow hover:bg-primary hover:text-on-primary transition-colors text-sm"
                            >
                                Implement this flow
                            </button>
                        </div>
                    </div>
                )}

                {structuredLastMessage?.type === 'ready_to_implement' && !loading && (
                    <div className="mb-4 p-4 bg-primary-container border border-primary-container rounded-xl shadow-lg flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <span className="text-on-primary-container text-sm font-bold text-center">{structuredLastMessage.text || "Implementation plan is ready."}</span>
                        <button
                            onClick={handleProceed}
                            className="w-full py-2 bg-primary text-on-primary rounded-lg font-bold shadow hover:opacity-90 transition-opacity"
                        >
                            🚀 Proceed with Implementation
                        </button>
                    </div>
                )}

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
