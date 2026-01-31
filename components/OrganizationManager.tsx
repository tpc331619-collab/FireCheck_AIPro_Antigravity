import React, { useState, useEffect } from 'react';
import { X, Users, Plus, Trash2, UserMinus, Building2 } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { Organization, OrganizationMember, OrganizationRole, UserProfile } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface OrganizationManagerProps {
    user: UserProfile;
    currentOrgId: string | null;
    onClose: () => void;
    onOrgSwitch: (orgId: string) => void;
}

export const OrganizationManager: React.FC<OrganizationManagerProps> = ({
    user,
    currentOrgId,
    onClose,
    onOrgSwitch
}) => {
    const { t } = useLanguage();
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
    const [members, setMembers] = useState<OrganizationMember[]>([]);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [showInviteForm, setShowInviteForm] = useState(false);
    const [loading, setLoading] = useState(true);

    // Form states
    const [newOrgName, setNewOrgName] = useState('');
    const [newOrgDesc, setNewOrgDesc] = useState('');
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<OrganizationRole>('member');

    useEffect(() => {
        loadOrganizations();
    }, [user.uid]);

    useEffect(() => {
        if (selectedOrg) {
            loadMembers(selectedOrg.id);
        } else {
            setMembers([]);
        }
    }, [selectedOrg]);

    const loadOrganizations = async () => {
        setLoading(true);
        try {
            const orgs = await StorageService.getUserOrganizations(user.uid, user.email);
            setOrganizations(orgs);

            // Select current org or stay on personal if selectedOrg is null
            if (currentOrgId) {
                const current = orgs.find(o => o.id === currentOrgId);
                setSelectedOrg(current || null);
            } else {
                setSelectedOrg(null);
            }
        } catch (e) {
            console.error('Failed to load organizations', e);
        } finally {
            setLoading(false);
        }
    };

    const loadMembers = async (orgId: string) => {
        try {
            const memberList = await StorageService.getOrganizationMembers(orgId);
            setMembers(memberList);
        } catch (e) {
            console.error('Failed to load members', e);
        }
    };

    const handleCreateOrg = async () => {
        if (!newOrgName.trim()) {
            alert(t('orgNameRequired'));
            return;
        }

        try {
            const orgId = await StorageService.createOrganization({
                name: newOrgName,
                description: newOrgDesc,
                createdBy: user.uid,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });

            // Add creator as admin
            await StorageService.addOrganizationMember({
                organizationId: orgId,
                userId: user.uid,
                userEmail: user.email || '',
                userName: user.displayName || user.email || 'User',
                role: 'admin',
                joinedAt: Date.now()
            });

            alert(t('organizationCreated'));
            setShowCreateForm(false);
            setNewOrgName('');
            setNewOrgDesc('');
            loadOrganizations();
        } catch (e) {
            console.error('Failed to create organization', e);
            alert('Failed to create organization');
        }
    };

    const handleInviteMember = async () => {
        if (!inviteEmail.trim()) {
            alert(t('emailRequired'));
            return;
        }

        if (!selectedOrg) return;

        try {
            await StorageService.addOrganizationMember({
                organizationId: selectedOrg.id,
                userId: inviteEmail,
                userEmail: inviteEmail,
                userName: inviteEmail,
                role: inviteRole,
                joinedAt: Date.now()
            });

            alert(t('memberInvited'));
            setShowInviteForm(false);
            setInviteEmail('');
            setInviteRole('member');
            loadMembers(selectedOrg.id);
        } catch (e) {
            console.error('Failed to invite member', e);
            alert('Failed to invite member');
        }
    };

    const handleRemoveMember = async (memberId: string) => {
        if (!confirm(t('confirmRemoveMember'))) return;

        try {
            await StorageService.removeOrganizationMember(memberId);
            alert(t('memberRemoved'));
            if (selectedOrg) {
                loadMembers(selectedOrg.id);
            }
        } catch (e) {
            console.error('Failed to remove member', e);
            alert('Failed to remove member');
        }
    };

    const handleDeleteOrg = async (orgId: string) => {
        if (!confirm(t('confirmDeleteOrg'))) return;

        try {
            await StorageService.deleteOrganization(orgId);
            alert(t('organizationDeleted'));
            loadOrganizations();
        } catch (e) {
            console.error('Failed to delete organization', e);
            alert('Failed to delete organization');
        }
    };

    const handleSwitchOrg = (orgId: string) => {
        onOrgSwitch(orgId);
        onClose();
    };

    const isAdmin = selectedOrg && members.some(
        m => m.userId === user.uid && m.role === 'admin'
    );

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <Building2 className="w-6 h-6 text-blue-600" />
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                            {t('organizationManagement')}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    {loading ? (
                        <div className="text-center py-8">Loading...</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Organizations List */}
                            <div className="md:col-span-1">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold text-gray-900 dark:text-white">
                                        {t('myOrganizations')}
                                    </h3>
                                    <button
                                        onClick={() => setShowCreateForm(true)}
                                        className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                        title={t('createOrganization')}
                                    >
                                        <Plus className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {/* Personal Workspace Option */}
                                    <div
                                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${!selectedOrg
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
                                            }`}
                                        onClick={() => setSelectedOrg(null)}
                                    >
                                        <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                            <Building2 className="w-4 h-4 text-blue-500" />
                                            {t('personalOrganization')}
                                        </div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            {t('personalSpaceDesc') || '個人私人空間'}
                                        </div>
                                        {!currentOrgId && (
                                            <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                                {t('currentOrganization')}
                                            </div>
                                        )}
                                    </div>

                                    {organizations.map(org => (
                                        <div
                                            key={org.id}
                                            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${selectedOrg?.id === org.id
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                                : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
                                                }`}
                                            onClick={() => setSelectedOrg(org)}
                                        >
                                            <div className="font-medium text-gray-900 dark:text-white">
                                                {org.name}
                                            </div>
                                            {org.description && (
                                                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                    {org.description}
                                                </div>
                                            )}
                                            {currentOrgId === org.id && (
                                                <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                                    {t('currentOrganization')}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Details Column */}
                            <div className="md:col-span-2">
                                {!selectedOrg ? (
                                    /* Personal Workspace View */
                                    <div className="h-full flex flex-col">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-semibold text-gray-900 dark:text-white">
                                                {t('personalOrganization')}
                                            </h3>
                                            <div className="flex gap-2">
                                                {currentOrgId && (
                                                    <button
                                                        onClick={() => handleSwitchOrg('')}
                                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                                                    >
                                                        {t('switchOrganization')}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-10 text-center flex-1 flex flex-col items-center justify-center">
                                            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
                                                <Building2 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                                            </div>
                                            <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                                                {t('personalWorkspaceMode') || '個人空間模式'}
                                            </h4>
                                            <p className="text-gray-600 dark:text-gray-400 max-w-sm mx-auto">
                                                {t('personalWorkspaceModeInfo') || '這是您的私人工作空間。這裡的資料僅連結到您的帳號項目，不會與其他組織成員共享。'}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    /* Organization Details & Members */
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-semibold text-gray-900 dark:text-white">
                                                {selectedOrg.name}
                                            </h3>
                                            <div className="flex gap-2">
                                                {currentOrgId !== selectedOrg.id && (
                                                    <button
                                                        onClick={() => handleSwitchOrg(selectedOrg.id)}
                                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                                                    >
                                                        {t('switchOrganization')}
                                                    </button>
                                                )}
                                                {isAdmin && (
                                                    <button
                                                        onClick={() => handleDeleteOrg(selectedOrg.id)}
                                                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                        title={t('deleteOrganization')}
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Members Section */}
                                        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-2">
                                                    <Users className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                                                    <h4 className="font-medium text-gray-900 dark:text-white">
                                                        {t('organizationMembers')} ({members.length})
                                                    </h4>
                                                </div>
                                                {isAdmin && (
                                                    <button
                                                        onClick={() => setShowInviteForm(true)}
                                                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-2"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                        {t('inviteMember')}
                                                    </button>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                {members.map(member => (
                                                    <div
                                                        key={member.id}
                                                        className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg"
                                                    >
                                                        <div>
                                                            <div className="font-medium text-gray-900 dark:text-white">
                                                                {member.userName}
                                                            </div>
                                                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                                                {member.userEmail}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <span className={`px-2 py-1 rounded text-xs font-medium ${member.role === 'admin'
                                                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                                                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                                                }`}>
                                                                {t(member.role)}
                                                            </span>
                                                            {isAdmin && member.userId !== user.uid && (
                                                                <button
                                                                    onClick={() => handleRemoveMember(member.id)}
                                                                    className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                                    title={t('removeMember')}
                                                                >
                                                                    <UserMinus className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Create Organization Modal */}
            {showCreateForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
                        <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
                            {t('createOrganization')}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                                    {t('organizationName')}
                                </label>
                                <input
                                    type="text"
                                    value={newOrgName}
                                    onChange={(e) => setNewOrgName(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    placeholder={t('organizationName')}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                                    {t('organizationDescription')}
                                </label>
                                <textarea
                                    value={newOrgDesc}
                                    onChange={(e) => setNewOrgDesc(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    rows={3}
                                    placeholder={t('organizationDescription')}
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => {
                                        setShowCreateForm(false);
                                        setNewOrgName('');
                                        setNewOrgDesc('');
                                    }}
                                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
                                >
                                    {t('cancel')}
                                </button>
                                <button
                                    onClick={handleCreateOrg}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    {t('createOrganization')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Invite Member Modal */}
            {showInviteForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
                        <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
                            {t('inviteMember')}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                                    {t('memberEmail')}
                                </label>
                                <input
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    placeholder="user@example.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                                    {t('memberRole')}
                                </label>
                                <select
                                    value={inviteRole}
                                    onChange={(e) => setInviteRole(e.target.value as OrganizationRole)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    <option value="member">{t('member')}</option>
                                    <option value="admin">{t('admin')}</option>
                                </select>
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => {
                                        setShowInviteForm(false);
                                        setInviteEmail('');
                                        setInviteRole('member');
                                    }}
                                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
                                >
                                    {t('cancel')}
                                </button>
                                <button
                                    onClick={handleInviteMember}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    {t('inviteMember')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
