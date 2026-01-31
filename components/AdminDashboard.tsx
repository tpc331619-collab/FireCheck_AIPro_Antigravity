
import React, { useState, useEffect } from 'react';
import { StorageService, WhitelistEntry } from '../services/storageService';
import { Organization, OrganizationRole } from '../types';
import { ShieldCheck, User, Users, Check, X, Search, RefreshCw, LogOut, Clock, Building, Trash2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface AdminDashboardProps {
    currentUser: { email: string; uid: string };
    onClose: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser, onClose }) => {
    const [users, setUsers] = useState<WhitelistEntry[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'blocked'>('all');

    useEffect(() => {
        console.log('[AdminDashboard] Mounted');
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Whitelist
            const whitelist = await StorageService.getWhitelist();
            setUsers(whitelist);

            // Temporary solution: Fetch orgs of the current super admin to manage assignments.
            const adminOrgs = await StorageService.getUserOrganizations(currentUser.uid);
            setOrganizations(adminOrgs);

        } catch (error) {
            console.error("Failed to load admin data", error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (email: string, status: 'approved' | 'blocked' | 'pending') => {
        try {
            await StorageService.updateWhitelistEntry(email, { status });
            setUsers(prev => prev.map(u => u.email === email ? { ...u, status } : u));
        } catch (error) {
            alert('更新失敗');
        }
    };

    const handleUpdateRole = async (email: string, role: 'admin' | 'user') => {
        try {
            await StorageService.updateWhitelistEntry(email, { role });
            setUsers(prev => prev.map(u => u.email === email ? { ...u, role } : u));
        } catch (error) {
            alert('更新失敗');
        }
    };

    const handleAssignOrg = async (email: string, orgId: string) => {
        try {
            await StorageService.updateWhitelistEntry(email, { orgId: orgId || null });
            setUsers(prev => prev.map(u => u.email === email ? { ...u, orgId: orgId || null } : u));
        } catch (error) {
            alert('更新失敗');
        }
    };

    const handleDeleteUser = async (email: string) => {
        if (!confirm(t('deleteConfirm') || '確定要刪除此用戶嗎？此動作無法復原。')) return;

        try {
            await StorageService.deleteWhitelistEntry(email);
            setUsers(prev => prev.filter(u => u.email !== email));
        } catch (error) {
            console.error('Delete failed:', error);
            alert('刪除失敗');
        }
    };

    const { t } = useLanguage();

    const filteredUsers = users.filter(user => {
        const matchesSearch = (user.email.includes(searchTerm.toLowerCase()) || (user.name || '').toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesStatus = filterStatus === 'all' || user.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    return (
        <div className="fixed inset-0 bg-slate-50 font-sans text-slate-900 z-[100] overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Header */}
            <header className="bg-slate-900 text-white shadow-lg sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/50">
                            <ShieldCheck className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight">{t('adminDashboard') || '管理員後台'}</h1>
                            <p className="text-xs text-slate-400 font-medium">{t('adminDashboardSubtitle') || 'FireCheck Access Control'}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors text-sm font-medium border border-slate-700"
                    >
                        <X className="w-4 h-4" />
                        {t('close')}
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-8">

                {/* Controls */}
                <div className="mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full md:w-96 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                        <input
                            type="text"
                            placeholder={t('userSearchPlaceholder') || "搜尋用戶 Email 或顯示名稱..."}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 shadow-sm transition-all text-slate-700 font-medium placeholder:text-slate-400"
                        />
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                        {(['all', 'pending', 'approved', 'blocked'] as const).map(status => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all border shadow-sm ${filterStatus === status
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-blue-200'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                                    }`}
                            >
                                {status === 'all' && (t('all') || '全部')}
                                {status === 'pending' && (t('statusPending') || '待審核')}
                                {status === 'approved' && (t('statusApproved') || '已核准')}
                                {status === 'blocked' && (t('statusBlocked') || '已停用')}
                            </button>
                        ))}

                        <button
                            onClick={loadData}
                            className="p-2.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors shadow-sm"
                            title={t('refresh') || "重新整理"}
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* User List - Mobile Cards & Desktop Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden ring-1 ring-slate-900/5">

                    {/* Desktop Table View (Hidden on Mobile) */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3 font-bold text-slate-700 uppercase tracking-wider text-xs">{t('user') || '使用者'}</th>
                                    <th className="px-4 py-3 font-bold text-slate-700 uppercase tracking-wider text-xs">{t('status') || '狀態'}</th>
                                    <th className="px-4 py-3 font-bold text-slate-700 uppercase tracking-wider text-xs">{t('rolePermission') || '角色權限'}</th>
                                    <th className="px-4 py-3 font-bold text-slate-700 uppercase tracking-wider text-xs w-48">{t('assignOrg') || '指派組織'}</th>
                                    <th className="px-4 py-3 font-bold text-slate-700 uppercase tracking-wider text-xs">{t('applyTime') || '申請時間'}</th>
                                    <th className="px-4 py-3 font-bold text-slate-700 uppercase tracking-wider text-xs text-right">{t('operation') || '操作'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-medium">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <RefreshCw className="w-8 h-8 animate-spin text-blue-500 opacity-50" />
                                                <span>{t('loading') || '載入中...'}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-16 text-center text-slate-400">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <User className="w-12 h-12 text-slate-200" />
                                                <span className="font-medium">{t('noMatchingUsers') || '沒有找到符合的用戶'}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map(user => (
                                        <tr key={user.email} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    {user.photoURL ? (
                                                        <img src={user.photoURL} alt="" className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-sm ring-1 ring-slate-200" />
                                                    ) : (
                                                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
                                                            <User className="w-4 h-4" />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div className="font-bold text-slate-800">{user.name || 'Unknown User'}</div>
                                                        <div className="text-xs text-slate-500 font-mono mt-0.5">{user.email}</div>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${user.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' :
                                                    user.status === 'pending' ? 'bg-amber-100 text-amber-700 border-amber-200 animate-pulse' :
                                                        'bg-red-100 text-red-700 border-red-200'
                                                    }`}>
                                                    {user.status === 'approved' && (t('statusApproved') || '已核准')}
                                                    {user.status === 'pending' && (t('statusPending') || '待審核')}
                                                    {user.status === 'blocked' && (t('statusBlocked') || '已停用')}
                                                </span>
                                            </td>

                                            <td className="px-4 py-3">
                                                <div className="flex bg-slate-100 rounded-lg p-1 w-fit border border-slate-200">
                                                    <button
                                                        onClick={() => handleUpdateRole(user.email, 'user')}
                                                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${user.role !== 'admin'
                                                            ? 'bg-white text-slate-800 shadow-sm ring-1 ring-black/5'
                                                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                                                            }`}
                                                    >
                                                        {t('roleMember') || '成員'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleUpdateRole(user.email, 'admin')}
                                                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${user.role === 'admin'
                                                            ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-black/5'
                                                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                                                            }`}
                                                    >
                                                        {t('roleAdmin') || '管理員'}
                                                    </button>
                                                </div>
                                            </td>

                                            <td className="px-4 py-3">
                                                <div className="relative">
                                                    <select
                                                        value={user.orgId || ''}
                                                        onChange={(e) => handleAssignOrg(user.email, e.target.value)}
                                                        className="appearance-none bg-slate-50 border border-slate-200 hover:border-blue-400 text-slate-700 text-xs font-medium rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block w-full pl-3 pr-8 py-2 transition-colors cursor-pointer"
                                                    >
                                                        <option value="">{t('unassigned') || '(未指派)'}</option>
                                                        {organizations.map(org => (
                                                            <option key={org.id} value={org.id}>
                                                                {org.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                                                        <Building className="h-3 w-3" />
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-4 py-3 text-xs font-medium text-slate-500">
                                                <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded w-fit text-slate-600">
                                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                                    {new Date(user.requestedAt).toLocaleDateString()}
                                                </div>
                                            </td>

                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {user.status === 'pending' && (
                                                        <button
                                                            onClick={() => handleUpdateStatus(user.email, 'approved')}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 font-bold text-xs rounded-lg hover:bg-green-200 hover:shadow-sm transition-all border border-green-200"
                                                            title={t('approve') || "核准"}
                                                        >
                                                            <Check className="w-3.5 h-3.5" />
                                                            <span className="hidden xl:inline">{t('approve') || '核准'}</span>
                                                        </button>
                                                    )}

                                                    {user.status !== 'blocked' && (
                                                        <button
                                                            onClick={() => handleUpdateStatus(user.email, 'blocked')}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 font-bold text-xs rounded-lg hover:bg-red-100 hover:shadow-sm transition-all border border-red-200"
                                                            title={t('block') || "停用/拒絕"}
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                            <span className="hidden xl:inline">{t('block') || '停用'}</span>
                                                        </button>
                                                    )}

                                                    {user.status === 'blocked' && (
                                                        <button
                                                            onClick={() => handleUpdateStatus(user.email, 'approved')}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-600 font-bold text-xs rounded-lg hover:bg-slate-200 hover:shadow-sm transition-all border border-slate-200"
                                                            title={t('reactivate') || "重新啟用"}
                                                        >
                                                            <RefreshCw className="w-3.5 h-3.5" />
                                                            <span className="hidden xl:inline">{t('reactivate') || '啟用'}</span>
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={() => handleDeleteUser(user.email)}
                                                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-500 font-bold text-xs rounded-lg hover:bg-red-100 hover:text-red-600 hover:shadow-sm transition-all border border-slate-200 hover:border-red-200"
                                                        title={t('delete') || "刪除"}
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View (Visible on Mobile) */}
                    <div className="block md:hidden bg-slate-50 p-4 space-y-4">
                        {loading ? (
                            <div className="text-center py-12 text-slate-500">
                                <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-2 opacity-50" />
                                {t('loading') || '載入中...'}
                            </div>
                        ) : filteredUsers.length === 0 ? (
                            <div className="text-center py-16 text-slate-400">
                                <User className="w-12 h-12 mx-auto mb-2 text-slate-200" />
                                {t('noMatchingUsers') || '沒有找到符合的用戶'}
                            </div>
                        ) : (
                            filteredUsers.map(user => (
                                <div key={user.email} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                    <div className="p-4">
                                        {/* Mobile Header: Avatar, Info, Status */}
                                        <div className="flex items-start justify-between gap-3 mb-4">
                                            <div className="flex items-center gap-3">
                                                {user.photoURL ? (
                                                    <img src={user.photoURL} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm ring-1 ring-slate-200" />
                                                ) : (
                                                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
                                                        <User className="w-6 h-6" />
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="font-bold text-slate-800 text-base">{user.name || 'Unknown User'}</div>
                                                    <div className="text-xs text-slate-500 font-mono break-all">{user.email}</div>
                                                    <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
                                                        <Clock className="w-3 h-3" />
                                                        {new Date(user.requestedAt).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </div>
                                            <span className={`flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${user.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' :
                                                user.status === 'pending' ? 'bg-amber-100 text-amber-700 border-amber-200 animate-pulse' :
                                                    'bg-red-100 text-red-700 border-red-200'
                                                }`}>
                                                {user.status === 'approved' && (t('statusApproved') || '已核准')}
                                                {user.status === 'pending' && (t('statusPending') || '待審核')}
                                                {user.status === 'blocked' && (t('statusBlocked') || '已停用')}
                                            </span>
                                        </div>

                                        {/* Mobile Body: Role & Org */}
                                        <div className="grid grid-cols-1 gap-4 mb-4">
                                            {/* Role Toggle */}
                                            <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200 w-full">
                                                <button
                                                    onClick={() => handleUpdateRole(user.email, 'user')}
                                                    className={`flex-1 py-2 rounded-md text-xs font-bold transition-all text-center ${user.role !== 'admin'
                                                        ? 'bg-white text-slate-800 shadow-sm ring-1 ring-black/5'
                                                        : 'text-slate-500 hover:text-slate-700'
                                                        }`}
                                                >
                                                    {t('roleMember') || '成員'}
                                                </button>
                                                <button
                                                    onClick={() => handleUpdateRole(user.email, 'admin')}
                                                    className={`flex-1 py-2 rounded-md text-xs font-bold transition-all text-center ${user.role === 'admin'
                                                        ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-black/5'
                                                        : 'text-slate-500 hover:text-slate-700'
                                                        }`}
                                                >
                                                    {t('roleAdmin') || '管理員'}
                                                </button>
                                            </div>

                                            {/* Org Dropdown */}
                                            <div className="relative">
                                                <select
                                                    value={user.orgId || ''}
                                                    onChange={(e) => handleAssignOrg(user.email, e.target.value)}
                                                    className="appearance-none bg-slate-50 border border-slate-200 hover:border-blue-400 text-slate-700 text-sm font-medium rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block w-full pl-3 pr-8 py-3 transition-colors cursor-pointer"
                                                >
                                                    <option value="">{t('unassigned') || '(未指派)'}</option>
                                                    {organizations.map(org => (
                                                        <option key={org.id} value={org.id}>
                                                            {org.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                                                    <Building className="h-4 w-4" />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Mobile Footer: Action Buttons */}
                                        <div className="flex gap-2 pt-3 border-t border-slate-100 mt-2">
                                            {user.status === 'pending' && (
                                                <button
                                                    onClick={() => handleUpdateStatus(user.email, 'approved')}
                                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-100 text-green-700 font-bold text-sm rounded-lg hover:bg-green-200 border border-green-200 active:scale-95 transition-all"
                                                >
                                                    <Check className="w-4 h-4" />
                                                    {t('approve') || '核准'}
                                                </button>
                                            )}

                                            {user.status !== 'blocked' && (
                                                <button
                                                    onClick={() => handleUpdateStatus(user.email, 'blocked')}
                                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 font-bold text-sm rounded-lg hover:bg-red-100 border border-red-200 active:scale-95 transition-all"
                                                >
                                                    <X className="w-4 h-4" />
                                                    {t('block') || '停用'}
                                                </button>
                                            )}

                                            {user.status === 'blocked' && (
                                                <button
                                                    onClick={() => handleUpdateStatus(user.email, 'approved')}
                                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-600 font-bold text-sm rounded-lg hover:bg-slate-200 border border-slate-200 active:scale-95 transition-all"
                                                >
                                                    <RefreshCw className="w-4 h-4" />
                                                    {t('reactivate') || '重新啟用'}
                                                </button>
                                            )}

                                            <button
                                                onClick={() => handleDeleteUser(user.email)}
                                                className="flex items-center justify-center px-4 py-2.5 bg-slate-100 text-slate-500 font-bold text-sm rounded-lg hover:bg-red-100 hover:text-red-600 border border-slate-200 hover:border-red-200 active:scale-95 transition-all"
                                                title={t('delete') || "刪除"}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 font-medium flex justify-between items-center">
                        <div>{t('totalUsers', { count: filteredUsers.length.toString() }) || `總計 ${filteredUsers.length} 位用戶`}</div>
                        <div className="hidden md:flex items-center gap-2">
                            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                            {t('assignOrgNote') || '可指派組織必須先由管理員創建'}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminDashboard;
