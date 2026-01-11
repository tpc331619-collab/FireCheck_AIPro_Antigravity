
import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Plus, Trash2, Save, MapPin, ZoomIn, ZoomOut, Move } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { UserProfile, EquipmentMap, EquipmentMarker } from '../types';

interface EquipmentMapEditorProps {
    user: UserProfile;
    isOpen: boolean;
    onClose: () => void;
    // Optional: if editing an existing map
    existingMap?: EquipmentMap | null;
}

const EquipmentMapEditor: React.FC<EquipmentMapEditorProps> = ({ user, isOpen, onClose, existingMap }) => {
    const [maps, setMaps] = useState<EquipmentMap[]>([]); // List of maps if we support multiple, or just to list them
    const [currentMap, setCurrentMap] = useState<EquipmentMap | null>(null);

    // Editor State
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [markers, setMarkers] = useState<EquipmentMarker[]>([]);
    const [viewMode, setViewMode] = useState<'LIST' | 'EDIT'>('LIST');
    const [isSaving, setIsSaving] = useState(false);

    // Map Name
    const [mapName, setMapName] = useState('');

    const imageContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            loadMaps();
        }
    }, [isOpen, user.uid]);

    const loadMaps = async () => {
        const data = await StorageService.getEquipmentMaps(user.uid);
        setMaps(data);
        setViewMode('LIST');
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    setImage(img);
                    // Initialize new map
                    setCurrentMap(null); // New map definitely doesn't have an ID yet
                    setMarkers([]);
                    setMapName(file.name.split('.')[0]);
                    setViewMode('EDIT');
                };
                img.src = event.target?.result as string;
            };
            reader.readAsDataURL(file);
        }
    };

    const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!imageContainerRef.current) return;

        // Calculate percentage position
        const rect = imageContainerRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        const newMarker: EquipmentMarker = {
            id: Date.now().toString(),
            equipmentId: '',
            x,
            y
        };

        setMarkers([...markers, newMarker]);
    };

    const updateMarker = (id: string, equipmentId: string) => {
        setMarkers(markers.map(m => m.id === id ? { ...m, equipmentId } : m));
    };

    const deleteMarker = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setMarkers(markers.filter(m => m.id !== id));
    };

    const handleSave = async () => {
        if (!image || !mapName) return;
        setIsSaving(true);

        try {
            let finalImageUrl = image.src;

            // If a new file is selected and we are not in guest mode (checked inside service but good to know)
            // We'll try to upload. If it fails (e.g. guest), we might fallback or error.
            if (selectedFile && !StorageService.isGuest) {
                try {
                    finalImageUrl = await StorageService.uploadMapImage(selectedFile, user.uid);
                } catch (e) {
                    console.warn("Upload failed or guest mode, using Base64 fallback", e);
                    // finalImageUrl is already base64 from FileReader
                }
            }

            const mapData: any = {
                name: mapName,
                imageUrl: finalImageUrl,
                markers: markers,
            };

            if (currentMap?.id) {
                const updatedMap = { ...currentMap, ...mapData, updatedAt: Date.now() };
                await StorageService.updateEquipmentMap(updatedMap);
            } else {
                await StorageService.saveEquipmentMap(mapData, user.uid);
            }

            await loadMaps();
            alert('儲存成功');
        } catch (error) {
            console.error(error);
            alert('儲存失敗');
        } finally {
            setIsSaving(false);
        }
    };

    const editMap = (map: EquipmentMap) => {
        const img = new Image();
        img.onload = () => {
            setImage(img);
            setCurrentMap(map);
            setMarkers(map.markers);
            setMapName(map.name);
            setSelectedFile(null); // Reset selected file on edit
            setViewMode('EDIT');
        };
        img.src = map.imageUrl;
    };

    const deleteMap = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm('確定要刪除此地圖嗎？')) {
            await StorageService.deleteEquipmentMap(id, user.uid);
            loadMaps();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-50 flex flex-col backdrop-blur-sm animate-in fade-in duration-200">

            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shrink-0">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                    <MapPin className="w-6 h-6 text-red-500" />
                    {viewMode === 'LIST' ? '消防設備位置圖' : (currentMap ? '編輯位置圖' : '建立新位置圖')}
                </h2>
                <div className="flex items-center gap-2">
                    {viewMode === 'EDIT' && (
                        <button onClick={() => setViewMode('LIST')} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-colors">
                            返回列表
                        </button>
                    )}
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-6 h-6 text-slate-500" />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col">
                {viewMode === 'LIST' ? (
                    <div className="flex-1 overflow-y-auto p-8">
                        <div className="max-w-5xl mx-auto">
                            {/* Add New Card */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                                <label className="aspect-video bg-slate-100 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-red-500 hover:bg-slate-50 transition-all group">
                                    <input type="file" accept="image/png, image/jpeg, image/svg+xml, image/webp" className="hidden" onChange={handleFileUpload} />
                                    <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                        <Plus className="w-8 h-8 text-slate-400 group-hover:text-red-500" />
                                    </div>
                                    <span className="font-bold text-slate-500 group-hover:text-slate-800">建立新位置圖</span>
                                    <span className="text-xs text-slate-400 mt-1">支援 JPG, PNG, SVG, WebP</span>
                                </label>

                                {/* Existing Maps */}
                                {maps.map(map => (
                                    <div key={map.id} onClick={() => editMap(map)} className="aspect-video bg-white rounded-2xl border border-slate-200 shadow-sm relative group overflow-hidden cursor-pointer hover:shadow-md hover:border-red-200 transition-all">
                                        <img src={map.imageUrl} alt={map.name} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-4">
                                            <h3 className="text-white font-bold truncate">{map.name}</h3>
                                            <span className="text-white/70 text-xs">{map.markers.length} 個標記</span>
                                        </div>
                                        <button
                                            onClick={(e) => deleteMap(e, map.id)}
                                            className="absolute top-2 right-2 p-2 bg-white/90 rounded-lg text-slate-600 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex overflow-hidden bg-slate-50">
                        {/* Tools Sidebar */}
                        <div className="w-80 bg-white border-r border-slate-200 flex flex-col z-10 shadow-lg">
                            <div className="p-4 border-b border-slate-100 space-y-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase">圖面名稱</label>
                                    <input
                                        type="text"
                                        value={mapName}
                                        onChange={(e) => setMapName(e.target.value)}
                                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-red-500 font-bold text-slate-800"
                                        placeholder="輸入名稱..."
                                    />
                                </div>
                                <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 text-xs text-orange-700 leading-relaxed">
                                    <span className="font-bold">操作說明：</span><br />
                                    1. 點擊圖面任一處新增標記 (紅色圈圈)。<br />
                                    2. 點擊標記可輸入「設備編號」。<br />
                                    3. 點擊垃圾桶圖示可刪除標記。
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">設備列表 ({markers.length})</h3>
                                {markers.map((marker, idx) => (
                                    <div key={marker.id} className="flex items-center gap-2 bg-white p-2 border border-slate-100 rounded-lg shadow-sm group hover:border-slate-300 transition-colors">
                                        <div className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                                            {idx + 1}
                                        </div>
                                        <input
                                            type="text"
                                            value={marker.equipmentId}
                                            onChange={(e) => updateMarker(marker.id, e.target.value)}
                                            placeholder="輸入設備編號..."
                                            className="flex-1 min-w-0 text-sm p-1 bg-transparent focus:outline-none focus:border-b border-slate-300 font-medium"
                                            autoFocus={!marker.equipmentId}
                                        />
                                        <button onClick={(e) => deleteMarker(e, marker.id)} className="p-1 text-slate-400 hover:text-red-500">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                {markers.length === 0 && (
                                    <div className="text-center py-10 text-slate-400 text-sm">
                                        尚無標記<br />請點擊右圖新增
                                    </div>
                                )}
                            </div>

                            <div className="p-4 border-t border-slate-200">
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                >
                                    {isSaving ? '儲存中...' : (
                                        <>
                                            <Save className="w-4 h-4" />
                                            儲存位置圖
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Canvas Area */}
                        <div className="flex-1 overflow-auto flex items-center justify-center p-8 bg-slate-100 cursor-crosshair relative">
                            {image && (
                                <div
                                    ref={imageContainerRef}
                                    className="relative shadow-2xl bg-white select-none inline-block outline outline-4 outline-white"
                                    onClick={handleImageClick}
                                    style={{ maxWidth: '100%', maxHeight: '100%' }}
                                >
                                    <img src={image.src} alt="Map" className="max-w-none block" style={{ maxHeight: 'calc(100vh - 100px)' }} />

                                    {/* Markers Overlay */}
                                    {markers.map((marker, idx) => (
                                        <div
                                            key={marker.id}
                                            className="absolute w-8 h-8 -ml-4 -mt-4 bg-red-500/80 border-2 border-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 hover:bg-red-600 transition-transform z-10 group"
                                            style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                                            onClick={(e) => e.stopPropagation()} // Prevent adding new marker
                                        >
                                            <span className="text-white text-xs font-bold">{idx + 1}</span>

                                            {/* Tooltip */}
                                            <div className="absolute top-full mt-2 bg-slate-800 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20">
                                                {marker.equipmentId || '未命名'}
                                            </div>

                                            {/* Quick Delete (Optional UI tweak) */}
                                            <button
                                                onClick={(e) => deleteMarker(e, marker.id)}
                                                className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EquipmentMapEditor;
