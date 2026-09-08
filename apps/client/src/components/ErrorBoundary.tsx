import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

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
        console.error("Uncaught React Error in Client App:", error, errorInfo);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    private handleGoHome = () => {
        this.setState({ hasError: false, error: null });
        window.location.href = '/';
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-[100dvh] bg-slate-100 flex items-center justify-center p-4">
                    <div className="bg-white rounded-[32px] p-6 max-w-sm w-full shadow-2xl border border-slate-200/80 text-center space-y-4">
                        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mx-auto shadow-md shadow-rose-500/10">
                            <AlertCircle className="w-8 h-8" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-800">Algo no cargó como se esperaba</h2>
                            <p className="text-xs text-slate-500 mt-2 font-medium leading-relaxed">
                                Ocurrió una interrupción temporal al desplegar esta sección. Puedes recargar la aplicación o volver al inicio.
                            </p>
                        </div>
                        {this.state.error && (
                            <div className="bg-slate-50 p-3 rounded-2xl text-left border border-slate-200 overflow-hidden">
                                <p className="text-[11px] font-mono text-slate-600 break-words line-clamp-3">
                                    {this.state.error.message || String(this.state.error)}
                                </p>
                            </div>
                        )}
                        <div className="space-y-2 pt-2">
                            <button
                                onClick={this.handleReset}
                                className="w-full bg-primary text-slate-950 py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-transform text-xs uppercase tracking-wider"
                            >
                                <RefreshCw className="w-4 h-4" /> Recargar Aplicación
                            </button>
                            <button
                                onClick={this.handleGoHome}
                                className="w-full bg-slate-100 text-slate-700 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-200 active:scale-95 transition-all text-xs uppercase tracking-wider"
                            >
                                <Home className="w-4 h-4" /> Ir al Inicio
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
