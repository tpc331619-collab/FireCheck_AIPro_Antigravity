import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Copy, Check, Download, Share2, ShieldCheck, Clock, Building2, X, Sparkles, ExternalLink } from 'lucide-react';
import { SystemSettings } from '../types';

interface GuestShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    organizationId?: string | null;
    organizationName?: string;
    systemSettings?: SystemSettings;
    isAdmin?: boolean;
    onEnableGuestForCurrentOrg?: () => Promise<void>;
}

const GuestShareModal: React.FC<GuestShareModalProps> = ({
    isOpen,
    onClose,
    organizationId,
    organizationName,
    systemSettings,
    isAdmin,
    onEnableGuestForCurrentOrg
}) => {
    const [qrDataUrl, setQrDataUrl] = useState<string>('');
    const [copied, setCopied] = useState(false);
    const [syncingOrg, setSyncingOrg] = useState(false);

    // Resolve target org ID & name: prefer current org, fallback to systemSettings.guestOrganizationId
    const targetOrgId = organizationId || systemSettings?.guestOrganizationId || '';
    const targetOrgName = organizationName || systemSettings?.guestOrganizationName || '預設公開廠區';

    // Construct direct guest entry URL
    const shareUrl = React.useMemo(() => {
        const baseUrl = `${window.location.origin}${window.location.pathname}`;
        const params = new URLSearchParams();
        params.set('guest', '1');
        if (targetOrgId) {
            params.set('orgId', targetOrgId);
        }
        return `${baseUrl}?${params.toString()}`;
    }, [targetOrgId]);

    useEffect(() => {
        if (!isOpen) return;
        let active = true;
        QRCode.toDataURL(shareUrl, {
            width: 520,
            margin: 2,
            color: {
                dark: '#0f172a',
                light: '#ffffff'
            },
            errorCorrectionLevel: 'H'
        })
            .then(url => {
                if (active) setQrDataUrl(url);
            })
            .catch(err => console.error('Failed to generate Guest QR Code:', err));

        return () => {
            active = false;
        };
    }, [isOpen, shareUrl]);

    if (!isOpen) return null;

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            // Fallback copy
            const input = document.createElement('input');
            input.value = shareUrl;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        }
    };

    const handleNativeShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `FSIPPRO 消防查檢系統 — 訪客稽查通行證 (${targetOrgName})`,
                    text: `請點擊連結或掃描 QR Code 進入「${targetOrgName}」消防查檢資訊平台（免註冊訪客唯讀模式，時效 30 分鐘）：`,
                    url: shareUrl
                });
            } catch (err) {
                console.log('Share cancelled or failed', err);
            }
        } else {
            handleCopyLink();
        }
    };

    const handleDownloadPassCard = () => {
        if (!qrDataUrl) return;
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 1040;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 1. Background gradient
        const bgGrad = ctx.createLinearGradient(0, 0, 800, 1040);
        bgGrad.addColorStop(0, '#0f172a');
        bgGrad.addColorStop(1, '#1e293b');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 800, 1040);

        // Top accent bar
        const topGrad = ctx.createLinearGradient(0, 0, 800, 0);
        topGrad.addColorStop(0, '#ef4444');
        topGrad.addColorStop(0.5, '#f59e0b');
        topGrad.addColorStop(1, '#10b981');
        ctx.fillStyle = topGrad;
        ctx.fillRect(0, 0, 800, 14);

        // 2. White main card
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(60, 70, 680, 900, 32);
        ctx.fill();

        // 3. Header texts
        ctx.fillStyle = '#dc2626';
        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('FSIPPRO 消防查檢資訊平台', 400, 135);

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 38px "Microsoft JhengHei", sans-serif';
        ctx.fillText('消防稽查／外部參訪通行證', 400, 190);

        // Organization pill
        ctx.fillStyle = '#eff6ff';
        ctx.beginPath();
        ctx.roundRect(200, 218, 400, 50, 25);
        ctx.fill();
        ctx.strokeStyle = '#bfdbfe';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#1d4ed8';
        ctx.font = 'bold 24px "Microsoft JhengHei", sans-serif';
        ctx.fillText(`🏢 場域：${targetOrgName}`, 400, 252);

        // 4. Draw QR Image
        const img = new Image();
        img.onload = () => {
            // QR Frame
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.roundRect(170, 295, 460, 460, 24);
            ctx.stroke();

            ctx.drawImage(img, 190, 315, 420, 420);

            // 5. Footer instructions
            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 24px "Microsoft JhengHei", sans-serif';
            ctx.fillText('📱 請使用手機相機或 LINE 掃描上方 QR Code', 400, 815);

            ctx.fillStyle = '#64748b';
            ctx.font = '20px "Microsoft JhengHei", sans-serif';
            ctx.fillText('免註冊、免輸入密碼，一掃自動進入「訪客唯讀模式」', 400, 855);

            // Security badges at bottom
            ctx.fillStyle = '#f8fafc';
            ctx.beginPath();
            ctx.roundRect(110, 885, 580, 54, 14);
            ctx.fill();

            ctx.fillStyle = '#475569';
            ctx.font = 'bold 18px "Microsoft JhengHei", sans-serif';
            ctx.fillText('🛡️ 唯讀安全沙盒保護   ｜   ⏱️ 30 分鐘自動銷毀憑證', 400, 919);

            const link = document.createElement('a');
            link.download = `FSIPPRO_訪客稽查通行證_${targetOrgName}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        };
        img.src = qrDataUrl;
    };

    const isOrgSyncedAsPublic =
        systemSettings?.allowGuestView &&
        (!targetOrgId || systemSettings?.guestOrganizationId === targetOrgId);

    return (
        <div
            className="fixed inset-0 z-[70] bg-slate-900/65 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Top Tricolor Accent Bar */}
                <div className="h-1.5 w-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500 shrink-0" />

                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-blue-200">
                            <QrCode className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-extrabold text-slate-800 tracking-tight">消防稽查／訪客通行碼</h3>
                                <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200/80 whitespace-nowrap">
                                    免登入直通
                                </span>
                            </div>
                            <p className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase mt-0.5">
                                FIRE INSPECTION GUEST PASS
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto custom-scrollbar space-y-4">
                    {/* Current Organization & Sandbox Badges */}
                    <div className="flex flex-wrap items-center justify-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/80">
                            <Building2 className="w-3.5 h-3.5 text-blue-600" />
                            公開檢視場域：{targetOrgName}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
                            <Clock className="w-3 h-3 text-amber-600" />
                            30 分鐘時效
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            唯讀保護
                        </span>
                    </div>

                    {/* Quick Sync Warning if current Org is not yet set as Guest Public Org */}
                    {isAdmin && !isOrgSyncedAsPublic && onEnableGuestForCurrentOrg && (
                        <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                            <div className="text-xs text-amber-800 leading-relaxed">
                                <span className="font-bold block">尚未將「{targetOrgName}」設為預設公開場域</span>
                                <span className="text-[11px] text-amber-700">建議點擊右側按鈕同步開啟，確保跨裝置訪客可讀取雲端資料。</span>
                            </div>
                            <button
                                onClick={async () => {
                                    setSyncingOrg(true);
                                    try {
                                        await onEnableGuestForCurrentOrg();
                                    } finally {
                                        setSyncingOrg(false);
                                    }
                                }}
                                disabled={syncingOrg}
                                className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl whitespace-nowrap shadow-xs transition-all active:scale-95 shrink-0"
                            >
                                {syncingOrg ? '同步中...' : '一鍵同步開啟'}
                            </button>
                        </div>
                    )}

                    {/* QR Code Display Card */}
                    <div className="bg-gradient-to-b from-slate-50 to-white rounded-2xl p-5 border border-slate-200/90 shadow-inner flex flex-col items-center">
                        <div className="bg-white p-3 rounded-2xl shadow-md border border-slate-100">
                            {qrDataUrl ? (
                                <img
                                    src={qrDataUrl}
                                    alt="Guest Mode QR Code"
                                    className="w-56 h-56 sm:w-60 sm:h-60 object-contain select-none"
                                />
                            ) : (
                                <div className="w-56 h-56 flex items-center justify-center text-slate-400 text-xs">
                                    產生 QR Code 中...
                                </div>
                            )}
                        </div>
                        <p className="text-xs font-medium text-slate-500 mt-3 text-center">
                            掃描後免輸入帳密，自動以「訪客模式」直入系統
                        </p>
                    </div>

                    {/* Direct Link Box */}
                    <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 flex items-center justify-between gap-2">
                        <div className="truncate text-[11px] font-mono text-slate-500 pl-1.5 select-all">
                            {shareUrl}
                        </div>
                        <button
                            onClick={handleCopyLink}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all ${
                                copied
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-white text-slate-700 border border-slate-200 hover:border-blue-300 hover:text-blue-600'
                            }`}
                        >
                            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied ? '已複製' : '複製連結'}
                        </button>
                    </div>

                    {/* Action Buttons Grid */}
                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                        <button
                            onClick={handleDownloadPassCard}
                            className="flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-100 hover:bg-slate-200/80 text-slate-700 font-bold text-xs rounded-xl transition-all active:scale-95"
                        >
                            <Download className="w-4 h-4 text-slate-600" />
                            下載通行證立牌
                        </button>
                        <button
                            onClick={handleNativeShare}
                            className="flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm shadow-blue-200 transition-all active:scale-95"
                        >
                            <Share2 className="w-4 h-4" />
                            分享給稽查員
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GuestShareModal;

