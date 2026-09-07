import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught React Error in Restaurant Portal:", error, errorInfo);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    private handleLogout = async () => {
        try {
            await supabase.auth.signOut();
        } catch (e) {
            console.warn("Logout error:", e);
        }
        localStorage.clear();
        window.location.href = '/';
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                    <div className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl border border-slate-100 text-center space-y-5">
                        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
                            <AlertCircle className="w-8 h-8" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-800">Algo no cargó correctamente</h2>
                            <p className="text-xs text-slate-500 mt-2 font-medium leading-relaxed">
                                Hemos detectado una interrupción al cargar los datos de tu negocio. Puedes recargar la aplicación o volver a iniciar sesión.
                            </p>
                        </div>
                        {this.state.error && (
                            <div className="bg-slate-50 p-3 rounded-xl text-left border border-slate-200">
                                <p className="text-[11px] font-mono text-slate-600 break-words line-clamp-3">
                                    {this.state.error.message || String(this.state.error)}
                                </p>
                            </div>
                        )}
                        <div className="space-y-2 pt-2">
                            <button
                                onClick={this.handleReset}
                                className="w-full bg-primary text-slate-900 py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-transform text-sm"
                            >
                                <RefreshCw className="w-4 h-4" /> Recargar Aplicación
                            </button>
                            <button
                                onClick={this.handleLogout}
                                className="w-full bg-slate-100 text-slate-600 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-200 active:scale-95 transition-all text-sm"
                            >
                                <LogOut className="w-4 h-4" /> Cerrar Sesión y Reintentar
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
