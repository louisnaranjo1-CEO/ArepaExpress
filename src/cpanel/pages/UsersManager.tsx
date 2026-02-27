import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { User } from 'lucide-react';

export default function UsersManager() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const querySnapshot = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
                const data = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setUsers(data);
            } catch (error) {
                console.error("Error fetching users: ", error);
            } finally {
                setLoading(false);
            }
        };

        fetchUsers();
    }, []);

    if (loading) {
        return <div className="animate-pulse space-y-4"><div className="h-8 bg-slate-200 rounded w-1/4"></div><div className="h-64 bg-slate-200 rounded"></div></div>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-slate-900">Gestión de Usuarios</h1>
            <p className="text-slate-500">Listado de todos los clientes y administradores registrados.</p>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-4">Usuario</th>
                                <th className="px-6 py-4">Correo Electrónico</th>
                                <th className="px-6 py-4">Teléfono</th>
                                <th className="px-6 py-4">Rol</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {users.map((user) => (
                                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 flex flex-col items-center justify-center shrink-0 overflow-hidden border border-slate-200">
                                                {user.photoURL ? (
                                                    <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <User className="w-5 h-5 text-slate-400" />
                                                )}
                                            </div>
                                            <div className="font-bold text-slate-900">{user.name || 'Sin Nombre'}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-500">{user.email || '-'}</td>
                                    <td className="px-6 py-4 text-slate-500">{user.phone || '-'}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${user.role === 'restaurant' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>
                                            {user.role === 'restaurant' ? 'Restaurante' : 'Cliente'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
