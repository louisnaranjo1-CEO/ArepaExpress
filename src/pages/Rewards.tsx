import React, { useState, useEffect } from 'react';
import { Gift, Coins, Share2, Ticket, ChevronRight, Award, Copy, CheckCircle, Globe, Map as MapIcon, Home } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore';

export default function Rewards() {
    const { user, userData } = useAuth();
    const navigate = useNavigate();
    const [copied, setCopied] = useState(false);
    const [contests, setContests] = useState<any[]>([]);
    const [raffles, setRaffles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const userPoints = userData?.points || 0;
    const referralCode = userData?.referralCode || user?.uid?.substring(0, 6).toUpperCase() || 'INVITA2X3';
    const [shareConfig, setShareConfig] = useState({
        message: '¡Usa 2X3 y obtén recompensas!',
        url: window.location.origin
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch active contests
                const contestsSnap = await getDocs(query(collection(db, 'referral_contests'), where('isActive', '==', true)));
                setContests(contestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

                // Fetch active raffles
                const rafflesSnap = await getDocs(query(collection(db, 'raffles'), where('isActive', '==', true)));
                setRaffles(rafflesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

                // Fetch share config
                const configSnap = await getDoc(doc(db, 'system_configs', 'fidelization'));
                if (configSnap.exists()) {
                    const data = configSnap.data();
                    setShareConfig(prev => ({
                        message: data.shareMessage || prev.message,
                        url: data.shareUrl || prev.url
                    }));
                }
            } catch (error) {
                console.error("Error fetching rewards data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleCopyCode = () => {
        navigator.clipboard.writeText(referralCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleShare = async () => {
        if (navigator.share) {
            try {
                const finalUrl = `${shareConfig.url.replace(/\/$/, '')}/auth?ref=${referralCode}`;
                await navigator.share({
                    title: '¡Acompáñame en 2X3!',
                    text: `${shareConfig.message}\nMi código es: ${referralCode}`,
                    url: finalUrl
                });
            } catch (err) {
                console.log('Error sharing:', err);
            }
        } else {
            handleCopyCode();
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-24">
            {/* Header */}
            <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-indigo-900 px-6 pt-12 pb-8 rounded-b-[2.5rem] relative overflow-hidden shadow-2xl flex-shrink-0">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-20 -mt-20"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/20 rounded-full blur-2xl -ml-10 -mb-10"></div>

                <div className="relative z-10 flex items-center justify-between mb-8">
                    <button onClick={() => navigate(-1)} className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white cursor-pointer active:scale-95 transition-all">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                    </button>
                    <h1 className="text-xl font-black text-white">Fidelización</h1>
                    <div className="w-10"></div> {/* Spacer */}
                </div>

                <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-gradient-to-tr from-amber-400 to-orange-500 rounded-full p-1 mb-4 shadow-lg shadow-orange-500/30">
                        <div className="w-full h-full bg-indigo-900 rounded-full flex items-center justify-center border-4 border-indigo-800">
                            <Award className="w-8 h-8 text-amber-400" />
                        </div>
                    </div>
                    <p className="text-indigo-200 font-bold uppercase tracking-widest text-[10px] mb-1">Mis Puntos Acumulados</p>
                    <h2 className="text-5xl font-black text-white drop-shadow-sm flex items-center gap-2">
                        {Math.floor(userPoints).toLocaleString()}
                        <span className="text-xl text-amber-400">pts</span>
                    </h2>
                    <p className="text-sm text-indigo-200 mt-2 max-w-[250px]">
                        Gana 2.5 puntos por cada dólar que gastes en la aplicación.
                    </p>
                </div>
            </div>

            <div className="px-6 -mt-6 relative z-20 space-y-6">

                {/* Referrals Section */}
                <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center shrink-0">
                            <Share2 className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-black text-slate-800 text-lg">Sistema de Referidos</h3>
                            <p className="text-xs text-slate-500 font-bold">Invita amigos y gana premios</p>
                        </div>
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-4 text-center">
                        <p className="text-xs text-slate-400 font-black uppercase tracking-widest mb-2">Tu Código de Invitación</p>
                        <div className="text-2xl font-black text-indigo-600 tracking-widest mb-4">
                            {referralCode}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleCopyCode} className="flex-1 bg-white text-slate-700 font-bold py-3 rounded-xl shadow-sm border border-slate-200 flex items-center justify-center gap-2 active:scale-95 transition-all text-sm">
                                {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                {copied ? 'Copiado' : 'Copiar'}
                            </button>
                            <button onClick={handleShare} className="flex-1 bg-emerald-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-95 transition-all text-sm">
                                <Share2 className="w-4 h-4" />
                                Compartir
                            </button>
                        </div>
                    </div>
                </div>

                {/* Active Campaigns / Raffles */}
                <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center shrink-0">
                                <Ticket className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-black text-slate-800 text-lg">Activaciones y Sorteos</h3>
                                <p className="text-xs text-slate-500 font-bold">Participa por grandes premios</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {loading && (
                            <div className="flex justify-center py-8">
                                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        )}

                        {!loading && contests.length === 0 && raffles.length === 0 && (
                            <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                <p className="text-slate-400 font-black text-xs uppercase tracking-widest">No hay sorteos activos en este momento</p>
                            </div>
                        )}

                        {/* Contests */}
                        {contests.map((contest) => (
                            <div key={contest.id} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-500 to-primary p-5 text-white shadow-lg cursor-pointer active:scale-[0.98] transition-all">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16"></div>
                                <h4 className="font-black text-xl mb-1 relative z-10 drop-shadow-sm">{contest.title}</h4>
                                <p className="text-sm text-white/90 font-medium mb-4 relative z-10 leading-snug">{contest.prize}</p>
                                <div className="flex items-center justify-between relative z-10">
                                    <span className="text-[10px] font-black uppercase tracking-widest bg-black/20 px-3 py-1 rounded-full backdrop-blur-sm">
                                        Meta: {contest.target} {contest.type === 'count' ? 'amigos' : 'compras'}
                                    </span>
                                    <ChevronRight className="w-5 h-5 opacity-50" />
                                </div>
                            </div>
                        ))}

                        {/* Raffles */}
                        {raffles.map((raffle) => (
                            <div key={raffle.id} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white shadow-lg cursor-pointer active:scale-[0.98] transition-all">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16"></div>
                                <div className="flex items-center gap-2 mb-2">
                                    {raffle.scope === 'national' ? <Globe className="w-4 h-4" /> :
                                        raffle.scope === 'regional' ? <MapIcon className="w-4 h-4" /> : <Home className="w-4 h-4" />}
                                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">{raffle.scope}</span>
                                </div>
                                <h4 className="font-black text-xl mb-1 relative z-10 drop-shadow-sm">{raffle.title}</h4>
                                <p className="text-sm text-white/90 font-medium mb-4 relative z-10 leading-snug">Premio: {raffle.prize}</p>
                                <div className="flex items-center justify-between relative z-10">
                                    <span className="text-[10px] font-black uppercase tracking-widest bg-black/20 px-3 py-1 rounded-full backdrop-blur-sm">
                                        Sorteo: {raffle.drawDate}
                                    </span>
                                    <ChevronRight className="w-5 h-5 opacity-50" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
}
