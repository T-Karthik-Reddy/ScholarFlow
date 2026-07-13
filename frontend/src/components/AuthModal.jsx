import React, { useState } from 'react';
import { login, register } from '../services/api';
import { setAuthToken } from '../services/settings';
import { LogIn, UserPlus, Loader2, Lock } from 'lucide-react';

export default function AuthModal({ onAuthenticated }) {
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            if (isLogin) {
                const data = await login(username, password);
                setAuthToken(data.access_token);
                onAuthenticated();
            } else {
                const data = await register(username, password);
                setAuthToken(data.access_token);
                onAuthenticated();
            }
        } catch (err) {
            setError(err.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-md p-4">
            <div className="bg-surface rounded-xl shadow-2xl border border-hardcoded-border w-full max-w-sm flex flex-col overflow-hidden">
                <div className="p-6 pb-4 border-b border-hardcoded-border bg-surface-container-lowest text-center">
                    <div className="mx-auto bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mb-3">
                        <Lock className="text-primary" size={24} />
                    </div>
                    <h3 className="font-headline-sm text-lg font-bold text-on-surface">
                        {isLogin ? 'Welcome Back' : 'Create Account'}
                    </h3>
                    <p className="text-sm text-on-surface-variant mt-1">
                        {isLogin ? 'Sign in to access your papers' : 'Sign up to start saving papers'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
                    {error && (
                        <div className="bg-error-container text-on-error-container text-sm p-3 rounded">
                            {error}
                        </div>
                    )}
                    
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-on-surface">Username</label>
                        <input
                            type="text"
                            required
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="px-3 py-2 bg-surface-container-lowest border border-hardcoded-border rounded text-sm focus:border-primary outline-none text-on-surface"
                            placeholder="Enter username"
                        />
                    </div>
                    
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-on-surface">Password</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="px-3 py-2 bg-surface-container-lowest border border-hardcoded-border rounded text-sm focus:border-primary outline-none text-on-surface"
                            placeholder="Enter password"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-2 w-full px-4 py-2 bg-primary text-on-primary rounded font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : (isLogin ? <LogIn size={18} /> : <UserPlus size={18} />)}
                        {isLogin ? 'Sign In' : 'Create Account'}
                    </button>
                </form>

                <div className="p-4 border-t border-hardcoded-border bg-surface-container-lowest text-center">
                    <button
                        type="button"
                        onClick={() => { setIsLogin(!isLogin); setError(''); }}
                        className="text-sm text-primary hover:underline"
                    >
                        {isLogin ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
                    </button>
                </div>
            </div>
        </div>
    );
}
