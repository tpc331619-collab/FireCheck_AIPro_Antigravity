
import React, { useState, useEffect } from 'react';
import { StorageService, WhitelistEntry } from '../services/storageService';
import { Organization, OrganizationRole } from '../types';
import { ShieldCheck, User, Users, Check, X, Search, RefreshCw, LogOut, Clock, Building, Building2, Trash2, ChevronRight, Info } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface AdminDashboardProps {
    currentUser: { email: string; uid: string };
    onClose: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser, onClose }) => {
    const [users, setUsers] = useState<WhitelistEntry[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'blocked'>('all');
    const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());

    const toggleExpand = (email: string) => {
        setExpandedEmails(prev => {
            const next = new Set(prev);
            if (next.has(email)) next.delete(email);
            else next.add(email);
            return next;
        });
    };

    const { t } = useLanguage();

    useEffect(() => {
        console.log('[AdminDashboard] Mounted');
        loadData();

        // Subscribe to real-time updates for the whitelist
        const unsubscribe = StorageService.onWhitelistChange((updatedUsers) => {
            console.log('[AdminDashboard] Real-time whitelist update received, count:', updatedUsers.length);
            setUsers(updatedUsers);
            setLoading(false);
        });

        return () => {
            console.log('[AdminDashboard] Unmounting, unsubscribing');
            unsubscribe();
        };
    }, []);

    const getStatusCount = (status: 'all' | 'pending' | 'approved' | 'blocked') => {
        if (status === 'all') return users.length;
        return users.filter(u => u.status === status).length;
    };

    const loadData = async () => {
        setLoading(true);
        try {
            // Fetch initial whitelist (subscriber will also trigger, but we fetch initially for immediate display if possible)
            const whitelist = await StorageService.getWhitelist();
            setUsers(whitelist);

            // Fetch orgs of the current super admin to manage assignments.
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

    const handleUpdatePermission = async (email: string, field: 'allowCreateOrg' | 'allowPersonalWorkspace', value: boolean) => {
        try {
            await StorageService.updateWhitelistEntry(email, { [field]: value });
            setUsers(prev => prev.map(u => u.email === email ? { ...u, [field]: value } : u));
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

    const filteredUsers = users.filter(user => {
        const matchesStatus = filterStatus === 'all' || user.status === filterStatus;
        return matchesStatus;
    });

    return (
        <div className="fixed inset-0 min-h-screen bg-slate-50 font-sans text-slate-900 z-[100] overflow-y-auto animate-in fade-in duration-500">
            {/* Professional Background */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] right-[-10%] w-[45%] h-[45%] bg-blue-100/30 blur-[120px] rounded-full animate-pulse"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[45%] h-[45%] bg-emerald-100/30 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>

            {/* Header */}
            <header className="bg-slate-900/95 backdrop-blur-md text-white shadow-lg sticky top-0 z-50 border-b border-white/10">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
                            <ShieldCheck className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-base font-bold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('adminDashboard') || '管理員後台'}</h1>
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-[0.1em]">{t('adminDashboardSubtitle') || 'FireCheck Access Control'}</p>
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

            <main className="max-w-7xl mx-auto px-4 py-8 relative z-10">
                {/* Controls */}
                <div className="mb-6 flex flex-col md:flex-row gap-4 items-center justify-start">
                    <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                        {(['all', 'pending', 'approved', 'blocked'] as const).map(status => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-2 shadow-sm ${filterStatus === status
                                    ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-200'
                                    : 'bg-white/70 backdrop-blur-md text-slate-600 border-slate-200 hover:bg-white hover:border-slate-300'
                                    }`}
                                style={{ fontFamily: "'Outfit', sans-serif" }}
                            >
                                <span>
                                    {status === 'all' && (t('all') || '全部')}
                                    {status === 'pending' && (t('statusPending') || '待審核')}
                                    {status === 'approved' && (t('statusApproved') || '已核准')}
                                    {status === 'blocked' && (t('statusBlocked') || '已停用')}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${filterStatus === status ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                    {getStatusCount(status)}
                                </span>
                            </button>
                        ))}

                        <div className="h-6 w-[1px] bg-slate-200 mx-2 hidden md:block"></div>

                        <button
                            onClick={loadData}
                            className="p-2.5 bg-white/70 backdrop-blur-md border border-slate-200 rounded-xl text-slate-500 hover:text-blue-600 transition-colors shadow-sm active:scale-95"
                            title={t('refresh') || "重新整理"}
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* User List - Mobile Cards & Desktop Table */}
                <div className="bg-white/70 backdrop-blur-md rounded-2xl shadow-xl shadow-blue-900/5 border border-white/50 overflow-hidden relative z-10">

                    {/* Desktop Table View (Hidden on Mobile) */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead>
                                <tr className="bg-slate-900/[0.02] border-b border-slate-100">
                                    <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-[0.05em] text-sm min-w-[120px]" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('user') || '使用者'}</th>
                                    <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-[0.05em] text-sm" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('status') || '狀態'}</th>
                                    <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-[0.05em] text-sm" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('rolePermission') || '身分 / 權限'}</th>
                                    <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-[0.05em] text-sm whitespace-nowrap text-center" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('allowCreateOrg') || '建立組織'}</th>
                                    <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-[0.05em] text-sm whitespace-nowrap text-center" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('allowPersonalWorkspace') || '個人空間'}</th>
                                    <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-[0.05em] text-sm whitespace-nowrap" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('assignOrg') || '指派組織'}</th>
                                    <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-[0.05em] text-sm whitespace-nowrap" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('applyTime') || '申請時間'}</th>
                                    <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-[0.05em] text-sm whitespace-nowrap text-right" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('operation') || '操作'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-12 text-center text-slate-500 font-medium">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <RefreshCw className="w-8 h-8 animate-spin text-blue-500 opacity-50" />
                                                <span>{t('loading') || '載入中...'}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-16 text-center text-slate-400">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <User className="w-12 h-12 text-slate-200" />
                                                <span className="font-medium">{t('noMatchingUsers') || '沒有找到符合的用戶'}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map(user => (
                                        <tr key={user.email} className="hover:bg-blue-50/20 transition-colors group">
                                            <td className={`px-4 py-2.5 transition-all duration-300 ${expandedEmails.has(user.email) ? 'min-w-[200px]' : 'w-[80px]'}`}>
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="relative cursor-pointer group/avatar shrink-0"
                                                        onClick={() => toggleExpand(user.email)}
                                                        title={expandedEmails.has(user.email) ? '點擊收合詳情' : '點擊展開詳情'}
                                                    >
                                                        <div className="relative">
                                                            {user.photoURL ? (
                                                                <img src={user.photoURL} alt="" className="w-11 h-11 rounded-full object-cover border-2 border-white shadow-sm ring-1 ring-slate-200 transition-all group-hover/avatar:scale-105" />
                                                            ) : (
                                                                <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200 transition-all group-hover/avatar:scale-105">
                                                                    <User className="w-6 h-6" />
                                                                </div>
                                                            )}
                                                            <div className={`absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full border border-slate-200 shadow-sm flex items-center justify-center transition-all ${expandedEmails.has(user.email) ? 'bg-blue-50 border-blue-200 rotate-90' : ''}`}>
                                                                <ChevronRight className={`w-3.5 h-3.5 text-slate-400 ${expandedEmails.has(user.email) ? 'text-blue-500' : ''}`} />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className={`flex flex-col transition-all duration-300 ease-in-out ${expandedEmails.has(user.email) ? 'max-w-md opacity-100 ml-1' : 'max-w-0 opacity-0 overflow-hidden'}`}>
                                                        <div className="font-bold text-slate-800 text-sm leading-tight whitespace-nowrap" style={{ fontFamily: "'Outfit', sans-serif" }}>{user.name || 'Unknown User'}</div>
                                                        <div className="text-[12px] text-slate-400 font-medium font-mono opacity-80 whitespace-nowrap">{user.email}</div>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-4 py-2.5 overflow-hidden">
                                                <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap ${user.status === 'approved' ? 'bg-emerald-100/50 text-emerald-700 border-emerald-200/50' :
                                                    user.status === 'pending' ? 'bg-amber-100/50 text-amber-700 border-amber-200/50 shadow-sm shadow-amber-100 anime-pulse' :
                                                        'bg-red-100/50 text-red-700 border-red-200/50'
                                                    }`} style={{ fontFamily: "'Outfit', sans-serif" }}>
                                                    <div className={`w-1.5 h-1.5 rounded-full mr-2 shrink-0 ${user.status === 'approved' ? 'bg-emerald-500' : user.status === 'pending' ? 'bg-amber-500' : 'bg-red-500'}`}></div>
                                                    {user.status === 'approved' && (t('statusApproved') || '已核准')}
                                                    {user.status === 'pending' && (t('statusPending') || '待審核')}
                                                    {user.status === 'blocked' && (t('statusBlocked') || '已停用')}
                                                </span>
                                            </td>

                                            <td className="px-4 py-2.5">
                                                <div className="flex bg-slate-200/40 backdrop-blur-sm rounded-xl p-1 w-fit border border-slate-200/50 shadow-inner">
                                                    <button
                                                        onClick={() => handleUpdateRole(user.email, 'user')}
                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${user.role !== 'admin'
                                                            ? 'bg-white text-slate-900 shadow-md shadow-slate-200/30 ring-1 ring-slate-100'
                                                            : 'text-slate-400 hover:text-slate-600'
                                                            }`}
                                                        style={{ fontFamily: "'Outfit', sans-serif" }}
                                                    >
                                                        <Users className={`w-3.5 h-3.5 ${user.role !== 'admin' ? 'text-blue-500' : 'text-slate-400'}`} />
                                                        {t('roleMember') || '檢查員'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleUpdateRole(user.email, 'admin')}
                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${user.role === 'admin'
                                                            ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-100'
                                                            : 'text-slate-400 hover:text-slate-600'
                                                            }`}
                                                        style={{ fontFamily: "'Outfit', sans-serif" }}
                                                    >
                                                        <ShieldCheck className={`w-3.5 h-3.5 ${user.role === 'admin' ? 'text-white' : 'text-slate-400'}`} />
                                                        {t('roleAdmin') || '管理員'}
                                                    </button>
                                                </div>
                                            </td>

                                            <td className="px-4 py-2.5 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={user.role === 'admin' ? true : !!user.allowCreateOrg}
                                                    disabled={user.role === 'admin'}
                                                    onChange={(e) => handleUpdatePermission(user.email, 'allowCreateOrg', e.target.checked)}
                                                    className={`w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 ${user.role === 'admin' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                />
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={user.role === 'admin' ? true : !!user.allowPersonalWorkspace}
                                                    disabled={user.role === 'admin'}
                                                    onChange={(e) => handleUpdatePermission(user.email, 'allowPersonalWorkspace', e.target.checked)}
                                                    className={`w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 ${user.role === 'admin' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                />
                                            </td>

                                            <td className="px-4 py-2.5">
                                                <div className="relative">
                                                    <select
                                                        value={user.orgId || ''}
                                                        onChange={(e) => handleAssignOrg(user.email, e.target.value)}
                                                        className="appearance-none bg-slate-50 border border-slate-200 hover:border-blue-400 text-slate-700 text-sm font-medium rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block w-full pl-3 pr-8 py-2.5 transition-colors cursor-pointer"
                                                    >
                                                        <option value="">{t('unassigned') || '(未指派)'}</option>
                                                        {organizations.map(org => (
                                                            <option key={org.id} value={org.id}>
                                                                {org.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                                                        <Building className="h-4 w-4" />
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-4 py-2.5 text-sm font-medium text-slate-500">
                                                <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1.5 rounded w-fit text-slate-600 whitespace-nowrap border border-slate-100">
                                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                                    {new Date(user.requestedAt).toLocaleDateString()}
                                                </div>
                                            </td>

                                            <td className="px-4 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {user.status === 'pending' && (
                                                        <button
                                                            onClick={() => handleUpdateStatus(user.email, 'approved')}
                                                            className="flex items-center justify-center w-9 h-9 bg-emerald-50 text-emerald-600 font-bold rounded-lg hover:bg-emerald-100 hover:shadow-sm transition-all border border-emerald-200 active:scale-95"
                                                            title={t('approve') || "核准"}
                                                        >
                                                            <Check className="w-5 h-5" />
                                                        </button>
                                                    )}

                                                    {user.status !== 'blocked' && (
                                                        <button
                                                            onClick={() => handleUpdateStatus(user.email, 'blocked')}
                                                            className="flex items-center justify-center w-9 h-9 bg-rose-50 text-rose-600 font-bold rounded-lg hover:bg-rose-100 hover:shadow-sm transition-all border border-rose-200 active:scale-95"
                                                            title={t('block') || "拒絕"}
                                                        >
                                                            <X className="w-5 h-5" />
                                                        </button>
                                                    )}

                                                    {user.status === 'blocked' && (
                                                        <button
                                                            onClick={() => handleUpdateStatus(user.email, 'approved')}
                                                            className="flex items-center justify-center w-9 h-9 bg-slate-50 text-slate-600 font-bold rounded-lg hover:bg-slate-100 hover:shadow-sm transition-all border border-slate-200 active:scale-95"
                                                            title={t('reactivate') || "重新啟用"}
                                                        >
                                                            <RefreshCw className="w-4 h-4" />
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={() => handleDeleteUser(user.email)}
                                                        className="flex items-center justify-center w-9 h-9 bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all border border-slate-200 hover:border-red-200 active:scale-95"
                                                        title={t('delete') || "刪除"}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
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
                    <div className="block md:hidden bg-transparent p-4 space-y-4">
                        {loading ? (
                            <div className="text-center py-12 text-slate-500">
                                <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-2 opacity-50" />
                                <span style={{ fontFamily: "'Outfit', sans-serif" }}>{t('loading') || '載入中...'}</span>
                            </div>
                        ) : filteredUsers.length === 0 ? (
                            <div className="text-center py-16 text-slate-400">
                                <User className="w-12 h-12 mx-auto mb-2 text-slate-100" />
                                <span className="font-medium" style={{ fontFamily: "'Outfit', sans-serif" }}>{t('noMatchingUsers') || '沒有找到符合的用戶'}</span>
                            </div>
                        ) : (
                            filteredUsers.map(user => (
                                <div key={user.email} className="bg-white/70 backdrop-blur-md rounded-2xl shadow-lg shadow-blue-900/5 border border-white/50 overflow-hidden active:scale-[0.98] transition-all">
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
                                            {/* Role & Permissions */}
                                            <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                                <div className="flex bg-white rounded-lg p-1 border border-slate-200 w-full shadow-sm">
                                                    <button
                                                        onClick={() => handleUpdateRole(user.email, 'user')}
                                                        className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all text-center ${user.role !== 'admin'
                                                            ? 'bg-slate-100 text-slate-800 shadow-inner'
                                                            : 'text-slate-500 hover:text-slate-700'
                                                            }`}
                                                    >
                                                        {t('roleMember') || '成員'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleUpdateRole(user.email, 'admin')}
                                                        className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all text-center ${user.role === 'admin'
                                                            ? 'bg-indigo-50 text-indigo-700 shadow-inner'
                                                            : 'text-slate-500 hover:text-slate-700'
                                                            }`}
                                                    >
                                                        {t('roleAdmin') || '管理員'}
                                                    </button>
                                                </div>

                                                <div className="flex items-center justify-between gap-2">
                                                    <label className={`flex items-center gap-2 text-xs font-bold text-slate-700 select-none ${user.role === 'admin' ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                                                        <input
                                                            type="checkbox"
                                                            checked={user.role === 'admin' ? true : !!user.allowCreateOrg}
                                                            disabled={user.role === 'admin'}
                                                            onChange={(e) => handleUpdatePermission(user.email, 'allowCreateOrg', e.target.checked)}
                                                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 shadow-sm"
                                                        />
                                                        {t('allowCreateOrg') || '建立組織'}
                                                    </label>
                                                    <label className={`flex items-center gap-2 text-xs font-bold text-slate-700 select-none ${user.role === 'admin' ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                                                        <input
                                                            type="checkbox"
                                                            checked={user.role === 'admin' ? true : !!user.allowPersonalWorkspace}
                                                            disabled={user.role === 'admin'}
                                                            onChange={(e) => handleUpdatePermission(user.email, 'allowPersonalWorkspace', e.target.checked)}
                                                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 shadow-sm"
                                                        />
                                                        {t('allowPersonalWorkspace') || '個人空間'}
                                                    </label>
                                                </div>
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
                                                    <Building2 className="h-4 w-4" />
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

                    <div className="px-6 py-4 bg-slate-900/[0.03] border-t border-slate-100 text-[10px] text-slate-500 font-bold uppercase tracking-wider flex justify-between items-center" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        <div>{t('totalUsers', { count: filteredUsers.length.toString() }) || `總計 ${filteredUsers.length} 位用戶`}</div>
                        <div className="hidden md:flex items-center gap-2">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                            {t('assignOrgNote') || '可指派組織必須先由管理員創建'}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminDashboard;
