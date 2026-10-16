const fs = require('fs');

function updateProfileFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Import
    if (!content.includes('PrivacyPolicyModal')) {
        content = content.replace(
            "import ReviewModal from '../components/ReviewModal';",
            "import ReviewModal from '../components/ReviewModal';\nimport PrivacyPolicyModal from '../components/PrivacyPolicyModal';"
        );
    }

    // 2. State (ensure deleteConfirmText and showPrivacyPolicyModal exist)
    if (!content.includes('showPrivacyPolicyModal')) {
        content = content.replace(
            "const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);",
            "const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);\n    const [deleteConfirmText, setDeleteConfirmText] = useState('');\n    const [showPrivacyPolicyModal, setShowPrivacyPolicyModal] = useState(false);"
        );
    }

    // 3. Update handleDeleteAccount
    const oldHandler = /const handleDeleteAccount = async \(\) => \{[\s\S]*?setIsDeletingAccount\(false\);\s*\}\s*\};/;
    const newHandler = `const handleDeleteAccount = async () => {
        if (!user) return;
        if (deleteConfirmText.trim().toUpperCase() !== 'ELIMINAR') {
            toast.error("Por favor escribe 'ELIMINAR' para confirmar.");
            return;
        }
        try {
            setIsDeletingAccount(true);
            vibrate(50);

            const { error } = await supabase.rpc('delete_user_account');
            if (error) {
                console.warn("RPC delete_user_account warning:", error);
                await supabase.from('profiles').update({
                    full_name: 'Usuario Eliminado',
                    status: 'deleted',
                    updated_at: new Date().toISOString()
                }).eq('id', user.id || user.uid);
            }

            toast.success("Tu cuenta ha sido eliminada por completo.");
            setShowDeleteAccountModal(false);
            setShowEditProfileModal(false);

            await supabase.auth.signOut();
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = '/';
        } catch (err: any) {
            console.error("Error al eliminar la cuenta:", err);
            toast.error(err.message || "No se pudo eliminar la cuenta. Intenta de nuevo.");
        } finally {
            setIsDeletingAccount(false);
        }
    };`;

    if (oldHandler.test(content)) {
        content = content.replace(oldHandler, newHandler);
    }

    // 4. Update the trigger button in EditProfileModal
    content = content.replace(
        /onClick=\{\(\) => \{\s*vibrate\(30\);\s*setShowDeleteAccountModal\(true\);\s*\}\}/g,
        "onClick={() => { vibrate(30); setDeleteConfirmText(''); setShowDeleteAccountModal(true); }}"
    );

    // 5. Add links under Cerrar Sesión
    const logoutBtnMatch = /<button[\s\S]*?onClick=\{handleLogout\}[\s\S]*?<\/button>/;
    const match = content.match(logoutBtnMatch);
    if (match && !content.includes('Términos y Privacidad')) {
        const replacement = match[0] + `\n                        <div className="mt-3 flex items-center justify-center gap-4 text-xs font-semibold">
                            <button
                                type="button"
                                onClick={() => setShowPrivacyPolicyModal(true)}
                                className="text-slate-400 hover:text-slate-600 underline transition-colors cursor-pointer"
                            >
                                Términos y Privacidad
                            </button>
                            <span className="text-slate-300">•</span>
                            <button
                                type="button"
                                onClick={() => {
                                    vibrate(30);
                                    setDeleteConfirmText('');
                                    setShowDeleteAccountModal(true);
                                }}
                                className="text-rose-400 hover:text-rose-600 underline transition-colors cursor-pointer"
                            >
                                Eliminar mi cuenta
                            </button>
                        </div>`;
        content = content.replace(match[0], replacement);
    }

    // 6. Update delete modal body to include input confirmation & privacy link
    const oldModalPattern = /<div className="space-y-2 pt-2">[\s\S]*?onClick=\{handleDeleteAccount\}[\s\S]*?<\/button>\s*<button[\s\S]*?setShowDeleteAccountModal\(false\)[\s\S]*?<\/button>\s*<\/div>/;
    const newModalButtons = `<div className="space-y-1.5 text-left">
                                <label className="text-[11px] font-bold text-slate-600 block">
                                    Escribe <span className="text-rose-600 font-extrabold">ELIMINAR</span> para confirmar:
                                </label>
                                <input
                                    type="text"
                                    value={deleteConfirmText}
                                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                                    placeholder="ELIMINAR"
                                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-rose-500 uppercase tracking-wider text-center"
                                />
                            </div>

                            <p className="text-[11px] text-slate-400">
                                Consulta nuestra{' '}
                                <button
                                    type="button"
                                    onClick={() => setShowPrivacyPolicyModal(true)}
                                    className="text-primary underline font-bold"
                                >
                                    Política de Privacidad
                                </button>
                            </p>

                            <div className="space-y-2 pt-2">
                                <button
                                    type="button"
                                    disabled={isDeletingAccount || deleteConfirmText.trim().toUpperCase() !== 'ELIMINAR'}
                                    onClick={handleDeleteAccount}
                                    className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                >
                                    {isDeletingAccount ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <Trash2 className="w-4 h-4" /> Sí, Eliminar Definitivamente
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    disabled={isDeletingAccount}
                                    onClick={() => {
                                        setDeleteConfirmText('');
                                        setShowDeleteAccountModal(false);
                                    }}
                                    className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs uppercase tracking-widest active:scale-95 transition-all"
                                >
                                    Cancelar
                                </button>
                            </div>`;

    if (oldModalPattern.test(content)) {
        content = content.replace(oldModalPattern, newModalButtons);
    }

    // 7. Add PrivacyPolicyModal JSX after showDeleteAccountModal AnimatePresence
    if (!content.includes('<PrivacyPolicyModal')) {
        content = content.replace(
            '</AnimatePresence>\n\n            {/* Mis Puntos y Premios Catalog Modal */}',
            `</AnimatePresence>

            {/* Privacy Policy and Terms Modal */}
            <PrivacyPolicyModal
                isOpen={showPrivacyPolicyModal}
                onClose={() => setShowPrivacyPolicyModal(false)}
            />

            {/* Mis Puntos y Premios Catalog Modal */}`
        );
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Successfully updated', filePath);
}

updateProfileFile('apps/client/src/pages/Profile.tsx');
if (fs.existsSync('src/pages/Profile.tsx')) {
    updateProfileFile('src/pages/Profile.tsx');
}
