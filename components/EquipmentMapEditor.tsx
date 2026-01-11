
import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Plus, Trash2, Save, MapPin, ZoomIn, ZoomOut, Move, RotateCw, Grid, MousePointer2, Download } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { UserProfile, EquipmentMap, EquipmentMarker } from '../types';

interface EquipmentMapEditorProps {
    user: UserProfile;
    isOpen: boolean;
    onClose: () => void;
    existingMap?: EquipmentMap | null;
}

const EquipmentMapEditor: React.FC<EquipmentMapEditorProps> = ({ user, isOpen, onClose, existingMap }) => {
    const [maps, setMaps] = useState<EquipmentMap[]>([]);
    const [currentMap, setCurrentMap] = useState<EquipmentMap | null>(null);

    // Editor State
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [markers, setMarkers] = useState<EquipmentMarker[]>([]);
    const [viewMode, setViewMode] = useState<'LIST' | 'EDIT'>('LIST');
    const [isSaving, setIsSaving] = useState(false);

    // Map Name
    const [mapName, setMapName] = useState('');

    // Transform State
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [showGrid, setShowGrid] = useState(false);

    // Drag State
    const [draggingMarkerId, setDraggingMarkerId] = useState<string | null>(null);

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
            // File Size Limit (5MB)
            if (file.size > 5 * 1024 * 1024) {
                alert('檔案大小超過 5MB，請上傳較小的圖片以確保系統穩定。');
                return;
            }
            setSelectedFile(file);
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    setImage(img);
                    // Initialize new map
                    setCurrentMap(null);
                    setMarkers([]);
                    setMapName(file.name.split('.')[0]);
                    setZoom(1);
                    setRotation(0);
                    setViewMode('EDIT');
                };
                img.src = event.target?.result as string;
            };
            reader.readAsDataURL(file);
        }
    };

    const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!imageContainerRef.current) return;

        // We get coords relative to the image container, which works even if transformed
        // provided the click event target bubbles up correctly or we use rect
        const rect = imageContainerRef.current.getBoundingClientRect();

        // With rotation/scale, things get tricky.
        // The easiest way for percentage based positioning is to use nativeEvent.offsetX / offsetWidth
        // BUT only if the target is the image element itself or the container equal to image size.
        // Let's rely on the container.

        // Note: When rotated, the bounding client rect changes dimensions.
        // Ideally we want coords in the *untransformed* space.
        // A simple hack: keep the markers as children of the transformed content. 
        // And use event.nativeEvent.offsetX / Y on the *image itself* (if we prevent pointer events on markers confusing it).

        // Let's use a simpler approach: 
        // If the user clicks the image, we use offsetX/Y of the image element.
        const target = e.target as HTMLElement;
        if (target.tagName !== 'IMG' && !target.classList.contains('grid-overlay') && !target.classList.contains('click-handler')) return;

        // Get the image element dimensions (untransformed natural size in the DOM flow before transform)
        // Actually standard offsetX is coordinate within the padding edge of the target node

        const x = (e.nativeEvent.offsetX / target.clientWidth) * 100;
        const y = (e.nativeEvent.offsetY / target.clientHeight) * 100;

        const newMarker: EquipmentMarker = {
            id: Date.now().toString(),
            equipmentId: '',
            x,
            y
        };

        setMarkers([...markers, newMarker]);
    };

    const handleMarkerMouseDown = (e: React.MouseEvent, markerId: string) => {
        e.stopPropagation(); // Prevent map click
        setDraggingMarkerId(markerId);
    };

    const handleMouseUp = () => {
        setDraggingMarkerId(null);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
        const target = e.target as HTMLElement;

        // Handle Dragging
        if (draggingMarkerId) {
            // We need the container to calculate relative position
            // We can find the closest relative container or use the imageContainerRef if accessible
            if (imageContainerRef.current) {
                const rect = imageContainerRef.current.getBoundingClientRect();
                const imageEl = imageContainerRef.current.querySelector('img');

                if (imageEl) {
                    // Logic similar to adding a marker, but dynamically updating
                    // Note: This logic assumes markers are children of the image container
                    // and we want x/y as percentage.

                    // We need to account for rotation/scale if we used nativeEvent on the container.
                    // But if we use clientX/Y relative to the container rect, it's easier.

                    // However, due to transforms, clientRect size changes. 
                    // The markers are inside the transformed container, so their 
                    // position reference is the UNTRANSFORMED content box.
                    // But our mouse events are in screen space.

                    // Actually, since markers are children of the transformed div (style={{ transform ... }}),
                    // wait, in the JSX:
                    // <div className="transition-transform ...">
                    //    <div ref={imageContainerRef} ... >
                    //       <img ... >
                    //       {markers...}
                    //    </div>
                    // </div>

                    // The `imageContainerRef` is inside the transform.
                    // React event `e.nativeEvent.offsetX` on the CONTAINER should be in local coordinate space?
                    // Let's rely on the trick we used for creation:
                    // If we are dragging, we are likely over the container or image.

                    // Simplest approach: Update x/y based on movement? No, absolute position is better.

                    // Let's use the same logic as handleImageClick but triggered by mouse move
                    // We need the pointer coordinates relative to the image element (natural un-rotated space).

                    // Challenge: When the mouse is over the *marker*, the target is the marker.
                    // We need coordinates relative to the *image*.

                    // Solution: Use imageContainerRef.current.getBoundingClientRect() BUT that is rotated.
                    // This is complex with CSS transforms.

                    // Alternative: If the user IS dragging, we assume they are looking at the visual map.
                    // We can try to use nativeEvent.offsetX if the event bubbles from the container?
                    // But dragging over a marker might give offsetX relative to the marker.

                    // Let's try: Calculate based on `imageContainerRef` but simplified?
                    // Actually, if we just want to support simple adjustments, maybe we skip complex math 
                    // and just assume the user is reasonably careful?

                    // Better: Use `mouseX - rect.left` etc?
                    // No, rotation breaks rect logic.

                    // Let's stick to: "Only update if mouse is over the 'click-handler' or 'grid-overlay' or 'img'".
                    // If dragging, we might be over other things. 

                    // If we are dragging, we effectively disable pointer events on everything else?
                    // Or we can just just use the fact that `imageContainerRef` internal coordinate system 
                    // *might* be accessible?

                    // Let's fallback to: 
                    // If dragging, we take the cursor position, and we try to map it. 
                    // But actually, `e.nativeEvent.offsetX/Y` on the *container* works IF the container is the target.
                    // But the container is parent of markers.

                    // Let's try to pass the event to the simpler logic:
                    // If target is Click Handler (which covers everything), offsetX/Y is correct.
                    // So we just need to ensure mouse events go to the Click Handler during drag?
                    // We can set pointer-events: none on markers during drag?

                    const container = imageContainerRef.current;
                    const x = (e.nativeEvent.offsetX / container.clientWidth) * 100;
                    const y = (e.nativeEvent.offsetY / container.clientHeight) * 100;

                    // Clamp to 0-100
                    const clampedX = Math.max(0, Math.min(100, x));
                    const clampedY = Math.max(0, Math.min(100, y));

                    setMarkers(markers.map(m =>
                        m.id === draggingMarkerId ? { ...m, x: clampedX, y: clampedY } : m
                    ));
                }
            }
            return;
        }

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

            if (selectedFile && !StorageService.isGuest) {
                try {
                    finalImageUrl = await StorageService.uploadMapImage(selectedFile, user.uid);
                } catch (e) {
                    console.warn("Upload failed or guest mode, using Base64 fallback", e);
                }
            }

            const mapData: any = {
                name: mapName,
                imageUrl: finalImageUrl,
                markers: markers,
                rotation: rotation, // Save rotation
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

    const handleExport = () => {
        if (!image) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Current rotation
        const deg = rotation % 360;
        const rad = (deg * Math.PI) / 180;

        // Calculate canvas dimensions based on rotation
        // If 90 or 270, swap width and height
        const isVertical = Math.abs(deg) === 90 || Math.abs(deg) === 270;
        const width = isVertical ? image.naturalHeight : image.naturalWidth;
        const height = isVertical ? image.naturalWidth : image.naturalHeight;

        canvas.width = width;
        canvas.height = height;

        // Fill background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Transformation context
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.rotate(rad);
        ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
        ctx.restore();

        // Draw Markers
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.rotate(rad);
        ctx.translate(-image.naturalWidth / 2, -image.naturalHeight / 2);

        markers.forEach((marker, idx) => {
            const mx = (marker.x / 100) * image.naturalWidth;
            const my = (marker.y / 100) * image.naturalHeight;

            // Draw Red Circle
            ctx.beginPath();
            ctx.arc(mx, my, 20, 0, 2 * Math.PI);
            ctx.fillStyle = 'red';
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Draw Number
            ctx.fillStyle = 'white';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((idx + 1).toString(), mx, my);

            // Draw Label
            if (marker.equipmentId) {
                ctx.fillStyle = 'black';
                ctx.font = 'bold 16px Arial';
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 4;
                ctx.strokeText(marker.equipmentId, mx, my + 35);
                ctx.fillText(marker.equipmentId, mx, my + 35);
            }
        });
        ctx.restore();

        // Trigger Download
        try {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            const link = document.createElement('a');
            link.download = `${mapName || 'map'}_export.jpg`;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error("Export failed", e);
            alert("匯出失敗：可能是因為跨網域圖片安全性限制。");
        }
    };

    const editMap = (map: EquipmentMap) => {
        const img = new Image();
        img.onload = () => {
            setImage(img);
            setCurrentMap(map);
            setMarkers(map.markers);
            setMapName(map.name);
            setRotation(map.rotation || 0); // Load rotation
            setZoom(1);
            setSelectedFile(null);
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

    // Transform Controls
    const rotateLeft = () => setRotation(r => (r - 90));
    const rotateRight = () => setRotation(r => (r + 90));
    const zoomIn = () => setZoom(z => Math.min(z + 0.1, 3));
    const zoomOut = () => setZoom(z => Math.max(z - 0.1, 0.5));
    const zoomReset = () => { setZoom(1); setRotation(0); };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-50 flex flex-col backdrop-blur-sm animate-in fade-in duration-200 h-[100dvh]">

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
            <div className="flex-1 overflow-hidden flex flex-col">
                {viewMode === 'LIST' ? (
                    <div className="flex-1 overflow-y-auto p-8">
                        <div className="max-w-6xl mx-auto">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
                                        <div className="w-full h-full p-2 bg-slate-50">
                                            <img
                                                src={map.imageUrl}
                                                alt={map.name}
                                                className="w-full h-full object-contain mix-blend-multiply"
                                                style={{ transform: `rotate(${map.rotation || 0}deg)` }}
                                            />
                                        </div>
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
                    <div className="flex-1 flex flex-col lg:flex-row-reverse overflow-hidden bg-slate-100">

                        {/* Canvas Area (DOM First -> Top on Mobile, Right on Desktop via flex-row-reverse) */}
                        <div className="h-[35dvh] lg:h-full lg:flex-1 overflow-hidden relative flex items-center justify-center bg-slate-100 pattern-grid-lg text-slate-300 border-b lg:border-b-0 lg:border-l border-slate-200 shadow-inner">

                            {/* Floating Toolbar */}
                            {/* Floating Toolbar - Unified Glass Design */}
                            <div className="absolute top-4 lg:top-6 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-md shadow-xl border border-white/50 rounded-full px-4 py-2 flex items-center gap-2 z-30 transition-all hover:bg-white/95 hover:shadow-2xl hover:scale-105">
                                <div className="flex items-center gap-1">
                                    <button onClick={zoomOut} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 active:bg-slate-200 transition-colors" title="Zoom Out">
                                        <ZoomOut className="w-5 h-5" />
                                    </button>
                                    <span className="text-xs font-mono font-bold w-12 text-center select-none text-slate-600 hidden lg:block">{Math.round(zoom * 100)}%</span>
                                    <button onClick={zoomIn} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 active:bg-slate-200 transition-colors" title="Zoom In">
                                        <ZoomIn className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                                <div className="flex items-center gap-1">
                                    <button onClick={rotateLeft} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 active:bg-slate-200 transition-colors" title="Rotate Left">
                                        <RotateCw className="w-5 h-5 -scale-x-100" />
                                    </button>
                                    <button onClick={rotateRight} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 active:bg-slate-200 transition-colors" title="Rotate Right">
                                        <RotateCw className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                                <button onClick={() => setShowGrid(!showGrid)} className={`p-2 rounded-full transition-all ${showGrid ? 'bg-indigo-50 text-indigo-600 shadow-inner' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'}`} title="Toggle Grid">
                                    <Grid className="w-5 h-5" />
                                </button>
                                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                                <button onClick={zoomReset} className="px-3 py-1 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors flex items-center gap-1" title="Reset View">
                                    <span>重置</span>
                                </button>
                            </div>

                            {/* Scrollable Container */}
                            <div className="w-full h-full overflow-auto flex items-center justify-center p-20 cursor-move">
                                <div
                                    className="transition-transform duration-200 ease-out origin-center select-none relative shadow-2xl ring-4 ring-white/50"
                                    style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
                                >
                                    {/* Inner Image Container - receives clicks */}
                                    {image && (
                                        <div
                                            ref={imageContainerRef}
                                            className="relative inline-block cursor-crosshair bg-white"
                                        >
                                            <img
                                                src={image.src}
                                                alt="Map"
                                                className="block w-auto h-auto max-w-full max-h-[50vh] lg:max-h-[calc(100vh-200px)] pointer-events-none object-contain"
                                            // Events handled by parent div
                                            />

                                            {/* Grid Overlay */}
                                            {showGrid && (
                                                <div
                                                    className="absolute inset-0 z-0 grid-overlay"
                                                    onClick={handleImageClick}
                                                    onMouseMove={handleMouseMove}
                                                    style={{
                                                        backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.1) 1px, transparent 1px)`,
                                                        backgroundSize: '10% 10%'
                                                    }}
                                                ></div>
                                            )}

                                            {/* Click Handler Overlay (Always present to catch clicks on image) */}
                                            <div
                                                className={`absolute inset-0 z-0 click-handler ${draggingMarkerId ? 'cursor-grabbing' : ''}`}
                                                onClick={handleImageClick}
                                                onMouseMove={handleMouseMove}
                                                onMouseUp={handleMouseUp}
                                                onMouseLeave={handleMouseUp}
                                            ></div>

                                            {/* Markers */}
                                            {markers.map((marker, idx) => (
                                                <div
                                                    key={marker.id}
                                                    className={`absolute w-4 h-4 md:w-6 md:h-6 lg:w-8 lg:h-8 -ml-2 -mt-2 md:-ml-3 md:-mt-3 lg:-ml-4 lg:-mt-4 bg-red-500 border border-white rounded-full flex items-center justify-center shadow-md hover:scale-125 z-10 group cursor-grab ${draggingMarkerId === marker.id ? 'opacity-80 scale-110 cursor-grabbing pointer-events-none' : ''}`}
                                                    style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                                                    onMouseDown={(e) => handleMarkerMouseDown(e, marker.id)}
                                                    onClick={(e) => { e.stopPropagation(); }}
                                                >
                                                    <span className="text-white text-[8px] md:text-[10px] lg:text-xs font-bold select-none">{idx + 1}</span>

                                                    {/* Tooltip */}
                                                    <div className="absolute bottom-full mb-1 lg:mb-2 bg-slate-900/90 backdrop-blur text-white text-[10px] lg:text-xs px-1.5 py-0.5 lg:px-2 lg:py-1 rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20">
                                                        {marker.equipmentId || '未命名'}
                                                    </div>

                                                    <button
                                                        onClick={(e) => deleteMarker(e, marker.id)}
                                                        className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 lg:p-1 shadow-sm border border-slate-200 opacity-0 group-hover:opacity-100 transition-all hover:text-red-600 hover:scale-110"
                                                    >
                                                        <X className="w-2 h-2 lg:w-3 lg:h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Tools Sidebar */}
                        <div className="flex-1 lg:flex-none w-full lg:w-80 bg-white border-t lg:border-t-0 lg:border-r border-slate-200 flex flex-col z-20 shadow-2xl shadow-slate-200/50 shrink-0 overflow-hidden">

                            {/* Map Settings */}
                            <div className="p-5 border-b border-slate-100 space-y-4 bg-slate-50/50">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">圖面名稱</label>
                                    <div className="relative group">
                                        <input
                                            type="text"
                                            value={mapName}
                                            onChange={(e) => setMapName(e.target.value)}
                                            className="w-full px-4 py-3 bg-white border-2 border-slate-100 rounded-xl focus:outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10 font-bold text-slate-800 transition-all placeholder:text-slate-300 group-hover:border-slate-200"
                                            placeholder="輸入圖面名稱..."
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                                            <MousePointer2 className="w-4 h-4 text-slate-300" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Equipment List */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
                                <div className="flex items-center justify-between px-1 mb-2">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">設備列表</h3>
                                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[10px] font-bold">{markers.length} 筆</span>
                                </div>

                                <div className="space-y-2">
                                    {markers.map((marker, idx) => (
                                        <div key={marker.id} className="flex items-center gap-3 bg-white p-2 pr-3 border border-slate-100 rounded-xl shadow-sm hover:shadow-md hover:border-red-100 hover:-translate-y-0.5 transition-all group duration-200">
                                            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center text-sm font-bold shrink-0 border border-red-100 group-hover:bg-red-500 group-hover:text-white transition-colors">
                                                {idx + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <input
                                                    type="text"
                                                    value={marker.equipmentId}
                                                    onChange={(e) => updateMarker(marker.id, e.target.value)}
                                                    placeholder="輸入設備編號..."
                                                    className="w-full text-sm font-bold text-slate-700 placeholder:text-slate-300 bg-transparent focus:outline-none focus:text-slate-900 border-b border-transparent focus:border-red-200 transition-colors pb-0.5"
                                                />
                                            </div>
                                            <button
                                                onClick={(e) => deleteMarker(e, marker.id)}
                                                className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                title="移除標記"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {markers.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
                                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                                            <MapPin className="w-6 h-6 text-slate-300" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-slate-500 font-bold text-sm">尚無標記</p>
                                            <p className="text-slate-400 text-xs">請點擊右圖新增位置標記</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-4 border-t border-slate-200 bg-white">
                                <div className="space-y-2">
                                    <button
                                        onClick={handleExport}
                                        className="w-full py-3 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                    >
                                        <Download className="w-4 h-4" />
                                        匯出圖片
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                    >
                                        {isSaving ? (
                                            <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></div>
                                        ) : (
                                            <>
                                                <Save className="w-4 h-4" />
                                                儲存位置圖
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EquipmentMapEditor;
