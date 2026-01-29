import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Plus, Trash2, Save, MapPin, ZoomIn, ZoomOut, Move, RotateCw, Grid, MousePointer2, Download, Check, ArrowLeft, RefreshCcw, ChevronRight, HardDrive } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { UserProfile, EquipmentMap, EquipmentMarker, EquipmentDefinition, InspectionReport, InspectionStatus, LightSettings } from '../types';
import StorageManagerModal from './StorageManagerModal';
import { calculateNextInspectionDate } from '../utils/dateUtils';
import { getFrequencyStatus } from '../utils/inspectionUtils';
import { useLanguage } from '../contexts/LanguageContext';

interface EquipmentMapEditorProps {
    user: UserProfile;
    isOpen: boolean;
    onClose: () => void;
    existingMap?: EquipmentMap | null;
    initialMapId?: string;
}

const EquipmentMapEditor: React.FC<EquipmentMapEditorProps> = ({ user, isOpen, onClose, existingMap, initialMapId }) => {
    const { t } = useLanguage();
    const [maps, setMaps] = useState<EquipmentMap[]>([]);
    const [currentMap, setCurrentMap] = useState<EquipmentMap | null>(null);
    const [reports, setReports] = useState<InspectionReport[]>([]); // Store inspection reports

    // Editor State
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [markers, setMarkers] = useState<EquipmentMarker[]>([]);
    const [viewMode, setViewMode] = useState<'LIST' | 'EDIT'>('LIST');
    const [isSaving, setIsSaving] = useState(false);
    const [allEquipment, setAllEquipment] = useState<EquipmentDefinition[]>([]);
    const [toolMode, setToolMode] = useState<'SELECT' | 'ADD_MARKER'>('SELECT');
    const [isCorsAllowed, setIsCorsAllowed] = useState(true);

    // Map Name
    const [mapName, setMapName] = useState('');
    const [isStorageManagerOpen, setIsStorageManagerOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'MANAGE' | 'SELECT'>('MANAGE');

    // Transform State
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [showGrid, setShowGrid] = useState(false);

    // Marker Settings
    const [markerSize, setMarkerSize] = useState<'small' | 'medium' | 'large' | number>('medium');
    const [markerColor, setMarkerColor] = useState('red');

    // Drag & Selection State
    const [draggingMarkerId, setDraggingMarkerId] = useState<string | null>(null);

    // Add Marker Confirmation State
    const [pendingMarker, setPendingMarker] = useState<{ x: number, y: number } | null>(null);
    const [pendingEquipmentId, setPendingEquipmentId] = useState('');
    const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

    // Legend Modal State
    const [isLegendModalOpen, setIsLegendModalOpen] = useState(false);

    const [lightSettings, setLightSettings] = useState<LightSettings | null>(null);

    const imageContainerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to selected marker in sidebar
    useEffect(() => {
        if (selectedMarkerId) {
            const el = document.getElementById(`marker-item-${selectedMarkerId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [selectedMarkerId]);

    useEffect(() => {
        if (isOpen) {
            loadMaps().then((data) => {
                if (initialMapId && data) {
                    const target = data.find(m => m.id === initialMapId);
                    if (target) {
                        // Small delay to ensure state acts correctly
                        setTimeout(() => editMap(target), 100);
                    }
                }
            });
        }
        // Also load all equipment definitions for color sync
        StorageService.getEquipmentDefinitions(user.uid).then(setAllEquipment);
        // Load reports to determine abnormal status
        StorageService.getReports(user.uid).then(setReports);
        // Load light settings
        StorageService.getLightSettings(user.uid).then(setLightSettings);
    }, [isOpen, user.uid]);

    const loadMaps = async (options?: { keepView?: boolean }) => {
        // First sync any files from storage that might be missing in Firestore (e.g. from data reset)
        // await StorageService.syncMapsFromStorage(user.uid); // Removed as per user request to avoid auto-creating maps from raw images
        const data = await StorageService.getEquipmentMaps(user.uid);
        setMaps(data);
        if (!options?.keepView) setViewMode('LIST');
        return data; // Return data for chaining
    };




    // Robust Image Loader Logic
    const loadMapImage = (url: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
            // Attempt 1: With CORS
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                setIsCorsAllowed(true);
                resolve(img);
            };
            img.onerror = () => {
                // Attempt 2: Without CORS (Fallback)
                console.warn("CORS load failed, retrying without CORS...");
                const img2 = new Image();
                img2.onload = () => {
                    setIsCorsAllowed(false);
                    // Silent fallback - user can still edit, but export will be disabled
                    resolve(img2);
                };
                img2.onerror = (err) => reject(new Error(t('imageLoadFailed') || "Image load failed"));
                img2.src = url;
            };
            img.src = url;
        });
    };

    const handleSelectFile = async (file: any) => {
        // DON'T close modal yet. Wait for load.

        // Check if map already exists
        const existingMap = maps.find(m => m.imageUrl === file.url);
        if (existingMap) {
            setIsStorageManagerOpen(false);
            editMap(existingMap);
            return;
        }

        try {
            // Extract name logic similar to sync
            const match = file.name.match(/^\d+_(.+)$/);
            const displayName = match ? match[1].split('.')[0] : file.name.split('.')[0];


            const newMap: Omit<EquipmentMap, 'id'> = {
                userId: user.uid,
                name: displayName,
                imageUrl: file.url,
                markers: [],
                updatedAt: Date.now(),
                size: file.size,
                markerSize: 'medium',
                markerColor: 'red'
            };

            const previewMap = { ...newMap, id: '' } as EquipmentMap;

            // Load Image with Helper
            const img = await loadMapImage(file.url);

            setImage(img);
            setCurrentMap(previewMap);
            setMarkers([]);
            setMapName(displayName);
            setRotation(0);
            setZoom(1);
            setSelectedFile(null);
            setViewMode('EDIT');

            // Success -> Close Modal
            setIsStorageManagerOpen(false);

        } catch (error: any) {
            console.error("Failed to load map from selection", error);
            alert((t('loadMapFailed') || "Load map failed: ") + (error.message || "Unknown error"));

            // Don't close modal so user can try another file
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // File Size Limit (10MB)
            if (file.size > 10 * 1024 * 1024) {
                alert(t('fileSizeExceeded') || 'File size exceeds 10MB.');

                return;
            }

            // Start Loading UI
            setIsSaving(true);

            try {
                // 1. Upload immediately to Storage (Cloud)
                const storageUrl = await StorageService.uploadMapImage(file, user.uid);

                // 2. Use Local Blob for Display (Avoids CORS/Loading issues)
                const blobUrl = URL.createObjectURL(file);
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => {
                    setImage(img);

                    // 3. Set Current Map with the REAL Storage URL
                    // This creates a "Draft" in memory (id='') that is NOT yet in the database
                    setCurrentMap({
                        id: '',
                        name: file.name.split('.')[0],
                        imageUrl: storageUrl,
                        markers: [],
                        updatedAt: Date.now()
                    });

                    setMarkers([]);
                    setMapName(file.name.split('.')[0]);
                    setSelectedFile(null);

                    // Default to 100% scale
                    setZoom(1);

                    setRotation(0);
                    setMarkerSize('medium');
                    setMarkerColor('red');
                    setViewMode('EDIT');
                    setIsSaving(false);
                };
                img.onerror = () => {
                    alert(t('imageLoadFailed') || 'Image load failed.');
                    setIsSaving(false);
                };
                img.src = blobUrl; // Load local blob

            } catch (error) {
                console.error("Upload failed", error);
                alert((t('uploadFailed') || 'Upload failed: ') + (error instanceof Error ? error.message : 'Unknown Error'));

                setIsSaving(false);
            }
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

        // If not in ADD_MARKER mode, only deselect
        if (toolMode !== 'ADD_MARKER') {
            setSelectedMarkerId(null);
            return;
        }

        // Get the image element dimensions (untransformed natural size in the DOM flow before transform)
        // Actually standard offsetX is coordinate within the padding edge of the target node

        const x = (e.nativeEvent.offsetX / target.clientWidth) * 100;
        const y = (e.nativeEvent.offsetY / target.clientHeight) * 100;

        // If clicking on background, deselect marker logic is handled elsewhere or here?
        // Actually if we click to create a new marker, we probably want to select it?
        // But for now, let's keep creation logic.

        // Deselect any selected marker if we are clicking bg (unless we clicked a marker, handled by propagation)
        // Checks are done in early return.
        // Deselect any selected marker if we are clicking bg
        setSelectedMarkerId(null);

        // Open Confirmation Dialog logic
        setPendingMarker({ x, y });
        setPendingEquipmentId(''); // Reset Input
    };

    const confirmAddMarker = () => {
        if (!pendingMarker) return;

        const newMarker: EquipmentMarker = {
            id: Date.now().toString(),
            equipmentId: pendingEquipmentId, // Use input
            x: pendingMarker.x,
            y: pendingMarker.y
        };

        setMarkers([...markers, newMarker]);
        setSelectedMarkerId(newMarker.id); // Auto-select new marker
        setPendingMarker(null); // Close Modal
        setPendingEquipmentId('');
    };

    const cancelAddMarker = () => {
        setPendingMarker(null);
        setPendingEquipmentId('');
    };

    // Add explicit selection handler if needed, or stick to onClick
    const handleMarkerClick = (e: React.MouseEvent, markerId: string) => {
        e.stopPropagation();
        setSelectedMarkerId(markerId);
    };

    const handleMarkerMouseDown = (e: React.MouseEvent, markerId: string) => {
        e.stopPropagation(); // Prevent map click
        setDraggingMarkerId(markerId);
    };

    const handleMouseUp = () => {
        setDraggingMarkerId(null);
    };

    // Helper: Determine dynamic marker color based on equipment status
    // Helper: Check if marker is abnormal
    const isMarkerAbnormal = (marker: EquipmentMarker) => {
        if (!marker.equipmentId) return false;

        // Map Barcode (marker.equipmentId) to UUID (EquipmentDefinition.id) if possible
        // Because reports store component ID (UUID), but marker likely stores Barcode ("001")
        const equip = allEquipment.find(e => e.barcode === marker.equipmentId);
        const targetId = equip ? equip.id : marker.equipmentId; // Fallback to using it as ID if no barcode match

        // Find latest report containing this item
        const relevantReports = reports.filter(r => r.items?.some(i => i.equipmentId === targetId));
        if (relevantReports.length > 0) {
            // Sort descending by date to get latest
            relevantReports.sort((a, b) => b.date - a.date);
            const latestItem = relevantReports[0].items?.find(i => i.equipmentId === targetId);
            return latestItem?.status === InspectionStatus.Abnormal;
        }
        return false;
    };

    // Helper: Determine dynamic marker color based on equipment status
    const getMarkerColor = (marker: EquipmentMarker) => {
        if (!marker.equipmentId) return 'bg-slate-400';

        // 1. Abnormal Check (Higher Priority)
        // Check both Barcode and UUID matching in reports
        if (isMarkerAbnormal(marker)) return 'bg-orange-500';

        // 2. Frequency/Status Check (Same as ChecklistInspection)
        const equip = allEquipment.find(e => e.barcode === marker.equipmentId);
        if (!equip) return 'bg-slate-400'; // Unknown or not linked to valid equipment

        const status = getFrequencyStatus(equip, lightSettings);

        switch (status) {
            case 'PENDING': return 'bg-red-500';     // 需檢查
            case 'CAN_INSPECT': return 'bg-yellow-400'; // 可以檢查
            case 'UNNECESSARY': return 'bg-emerald-500'; // 不需檢查
            case 'COMPLETED': return 'bg-emerald-500'; // 已完成
            default: return 'bg-slate-400';
        }
    };

    const getMarkerStyle = (marker: EquipmentMarker): React.CSSProperties => {
        if (!marker.equipmentId) return {};

        if (isMarkerAbnormal(marker)) {
            if (lightSettings?.abnormal?.color) {
                return { backgroundColor: lightSettings.abnormal.color };
            }
            return { backgroundColor: '#f97316' }; // Default Orange
        }

        const equip = allEquipment.find(e => e.barcode === marker.equipmentId);
        if (!equip) return {};

        const status = getFrequencyStatus(equip, lightSettings);
        if (status === 'PENDING' && lightSettings?.red?.color) return { backgroundColor: lightSettings.red.color };
        if (status === 'CAN_INSPECT' && lightSettings?.yellow?.color) return { backgroundColor: lightSettings.yellow.color };
        if (status === 'UNNECESSARY' && lightSettings?.green?.color) return { backgroundColor: lightSettings.green.color };
        if (status === 'COMPLETED' && lightSettings?.completed?.color) return { backgroundColor: lightSettings.completed.color };

        return {};
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

    // Updated fitImageToScreen with robust fallback
    const fitImageToScreen = () => {
        if (!image || !imageContainerRef.current) return;

        const img = image;
        const container = imageContainerRef.current;

        // Get container dimensions or fallback to window estimation
        let availWidth = container.clientWidth;
        let availHeight = container.clientHeight;

        if (availWidth === 0 || availHeight === 0) {
            // Fallback: Window - Sidebar (80px or 320px) - Padding
            availWidth = window.innerWidth - (window.innerWidth >= 1024 ? 320 : 0) - 40;
            availHeight = window.innerHeight - 80 - 40; // Toolbar - Padding
        }

        const scaleW = availWidth / img.naturalWidth;
        const scaleH = availHeight / img.naturalHeight;

        // "Contain" logic: Fit entirely within
        let optimalZoom = Math.min(scaleW, scaleH);

        // Mobile Optimization: Ensure readable size (min 95%)
        if (window.innerWidth < 768 && optimalZoom < 0.95) {
            optimalZoom = 0.95;
        }

        // Safety clamps
        if (optimalZoom < 0.1) optimalZoom = 0.1;
        if (optimalZoom > 5) optimalZoom = 5;

        setZoom(Number(optimalZoom.toFixed(2)));
    };

    // Auto-fit when image loads
    useEffect(() => {
        if (image) {
            // Default to Fit Screen (User request for cleaner view)
            setTimeout(() => fitImageToScreen(), 100);
        }
    }, [image]);

    const updateMarker = (id: string, updates: Partial<EquipmentMarker>) => {
        setMarkers(markers.map(m => m.id === id ? { ...m, ...updates } : m));
    };

    const updateMarkerId = (id: string, equipmentId: string) => {
        setMarkers(markers.map(m => m.id === id ? { ...m, equipmentId } : m));
    };

    const deleteMarker = (e: React.MouseEvent | null, markerId: string) => {
        if (e && e.stopPropagation) {
            e.stopPropagation();
        }
        setMarkers(prev => prev.filter(m => m.id !== markerId));
        if (selectedMarkerId === markerId) {
            setSelectedMarkerId(null);
        }
    };

    const handleSave = async () => {
        if (!image || !mapName) return;
        setIsSaving(true);

        try {
            // Determine final image URL
            let finalImageUrl = image.src;

            // Priority logic for map update
            if (selectedFile && !StorageService.isGuest) {
                try {
                    finalImageUrl = await StorageService.uploadMapImage(selectedFile, user.uid);
                } catch (e) {
                    console.warn("Upload failed, using Base64/Blob fallback", e);
                }
            } else if (currentMap?.imageUrl && currentMap.imageUrl.startsWith('http')) {
                finalImageUrl = currentMap.imageUrl;
            }

            // --- Capture and Upload Edited Image (Snapshot) ---
            if (!StorageService.isGuest && isCorsAllowed) { // Only if CORS allowed
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        // Logic similar to Export
                        const deg = rotation % 360;
                        const rad = (deg * Math.PI) / 180;
                        const isVertical = Math.abs(deg) === 90 || Math.abs(deg) === 270;
                        const width = isVertical ? image.naturalHeight : image.naturalWidth;
                        const height = isVertical ? image.naturalWidth : image.naturalHeight;
                        canvas.width = width;
                        canvas.height = height;

                        // Background
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, width, height);

                        // Draw Image
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
                            const currentSize = marker.size || markerSize;
                            const colorHex = '#ef4444'; // Red for normal markers (if logic falls back)

                            // Dimensions
                            const rMap: any = { tiny: 2, small: 4, medium: 6, large: 8, huge: 12 };
                            const fMap: any = { tiny: 6, small: 8, medium: 10, large: 12, huge: 16 };

                            const getSize = (s: any) => {
                                if (typeof s === 'number') return (s / 100) * 6;
                                return rMap[s] || 6;
                            };
                            const getFont = (s: any) => {
                                if (typeof s === 'number') return (s / 100) * 10;
                                return fMap[s] || 10;
                            };

                            const radius = getSize(currentSize);
                            const fontSize = getFont(currentSize);
                            const isAbnormal = isMarkerAbnormal(marker);

                            ctx.save();
                            ctx.translate(mx, my);
                            ctx.rotate(-rad); // Counter-rotate marker to be upright relative to view? No, markers rotate with map in this logic usually? 
                            // Actually in this save block:
                            // The canvas context has been rotated by `rad`.
                            // So (0,0) is center.
                            // We translated to marker pos (mx, my) which is in image space.
                            // The image itself was drawn rotated.
                            // Wait, the previous code:
                            // ctx.translate(width / 2, height / 2);
                            // ctx.rotate(rad);
                            // ctx.translate(-image.naturalWidth / 2, -image.naturalHeight / 2);
                            // So the coordinate system IS the image's local system.
                            // So (mx, my) is correct.
                            // However, we probably want the text/icon to be upright relative to the PAGE (output), not the image if the image is rotated?
                            // The previous code did `ctx.rotate(-rad)` inside the marker loop for the text/number.

                            // Unified Marker Drawing (Circle + Text)
                            // The color is already handled by 'blue-500', 'red-500' etc in getMarkerColor logic?
                            // No, the canvas uses hex codes. We need to map the status to Hex.

                            let fillStyle = colorHex;
                            if (isAbnormal) fillStyle = lightSettings?.abnormal?.color || '#f97316'; // Orange-500 or custom

                            ctx.save();
                            ctx.translate(mx, my);
                            ctx.rotate(-rad); // Keep text upright relative to canvas, effectively canceling rotation if needed.
                            // Wiat, in the previous code:
                            // The canvas 'ctx' was rotated by 'rad' (image rotation).
                            // We translated to (mx, my).
                            // If we want text to be upright on the OUTPUT image regardless of map rotation, we rotate by -rad.
                            // Simple Circle
                            ctx.beginPath();
                            ctx.arc(0, 0, radius, 0, 2 * Math.PI);
                            ctx.fillStyle = fillStyle;
                            ctx.fill();

                            // Text (Index Number)
                            ctx.fillStyle = 'white';
                            ctx.font = `bold ${fontSize}px Arial`;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText((idx + 1).toString(), 0, 0);

                            ctx.restore();

                            // Draw Label (Equipment ID) - remains similar
                            if (marker.equipmentId) {
                                ctx.save();
                                ctx.translate(mx, my);
                                ctx.rotate(-rad);
                                ctx.fillStyle = 'black';
                                ctx.font = 'bold 16px Arial';
                                ctx.strokeStyle = 'white';
                                ctx.lineWidth = 4;
                                ctx.strokeText(marker.equipmentId, 0, 35);
                                ctx.fillText(marker.equipmentId, 0, 35);
                                ctx.restore();
                            }
                        });
                        ctx.restore();

                        // Upload Blob
                        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
                        if (blob) {
                            const editFilename = `${mapName}_Edit.jpg`;
                            await StorageService.uploadBlob(blob, editFilename, user.uid);
                            console.log('Saved edited snapshot:', editFilename);
                        }
                    }
                } catch (e) {
                    console.error("Failed to upload edited snapshot", e);
                }
            }
            // ------------------------------------------------

            const mapData: any = {
                name: mapName,
                imageUrl: finalImageUrl,
                markers: markers,
                rotation: rotation,
                markerSize: markerSize,
                markerColor: markerColor,
                // Preserve size from current map or file
                size: currentMap?.size || (selectedFile ? selectedFile.size : undefined)
            };

            if (currentMap?.id) {
                const updatedMap = { ...currentMap, ...mapData, updatedAt: Date.now() };
                await StorageService.updateEquipmentMap(updatedMap);
                setCurrentMap(updatedMap);
            } else {
                const newId = await StorageService.saveEquipmentMap(mapData, user.uid);
                // Update current map with new ID so subsequent saves are updates
                setCurrentMap({ ...mapData, id: newId, userId: user.uid, updatedAt: Date.now() } as EquipmentMap);
            }

            await loadMaps({ keepView: true });
            alert(t('saveSuccess'));
        } catch (error: any) {
            console.error(error);
            alert(t('saveFailed') + ': ' + (error.message || 'Unknown Error'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleExport = () => {
        if (!image) return;
        if (!isCorsAllowed) {
            alert(t('corsError') || 'Export failed: CORS missing.');
            return;
        }

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

            // Individual or Global Settings
            const currentSize = marker.size || markerSize;

            // Reverted Logic with Number Support fallback
            const rMap: any = { tiny: 2, small: 4, medium: 6, large: 8, huge: 12 };
            const fMap: any = { tiny: 6, small: 8, medium: 10, large: 12, huge: 16 };

            const radius = (typeof currentSize === 'number') ? (currentSize / 100) * 6 : (rMap[currentSize as string] || 6);
            const fontSize = (typeof currentSize === 'number') ? (currentSize / 100) * 10 : (fMap[currentSize as string] || 10);
            const isAbnormal = isMarkerAbnormal(marker);

            ctx.save();
            ctx.translate(mx, my);

            // Unified Marker Drawing
            let fillStyle = '#ef4444'; // default red
            // We need to re-derive color logic or allow it to be passed?
            // In handleExport, we iterate markers. We need status.
            // isAbnormal is calculated.
            // Frequency status is NOT calculated here in the original loop easily without 'getMarkerColor' logic, 
            // but for 'Export', usually we want WYSIWYG.
            // The original code used 'colorHex' which was hardcoded to #ef4444? 
            if (isAbnormal) {
                fillStyle = lightSettings?.abnormal?.color || '#f97316';
            }

            // DRAW CIRCLE
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, 2 * Math.PI);
            ctx.fillStyle = fillStyle;
            ctx.fill();

            ctx.rotate(-rad); // Keep text upright
            ctx.fillStyle = 'white';
            ctx.font = `bold ${fontSize}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((idx + 1).toString(), 0, 0);

            ctx.restore(); // Restores the translate(mx, my) and the rotate(-rad)

            // Draw Label
            if (marker.equipmentId) {
                ctx.save();
                ctx.translate(mx, my);
                ctx.rotate(-rad);
                ctx.fillStyle = 'black';
                ctx.font = 'bold 16px Arial';
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 4;
                ctx.strokeText(marker.equipmentId, 0, 35);
                ctx.fillText(marker.equipmentId, 0, 35);
                ctx.restore();
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
            alert(t('corsError') || "Export failed: CORS restrictions.");
        }
    };

    const editMap = (map: EquipmentMap) => {
        loadMapImage(map.imageUrl).then((img) => {
            setImage(img);
            setCurrentMap(map);
            setMarkers(map.markers);
            setMapName(map.name);
            setRotation(map.rotation || 0);

            // Handle legacy sizes (Migrate back to string if number found)
            let loadedSize = map.markerSize;
            if (typeof loadedSize === 'number') {
                if (loadedSize < 60) loadedSize = 'tiny';
                else if (loadedSize < 85) loadedSize = 'small';
                else if (loadedSize < 125) loadedSize = 'medium';
                else if (loadedSize < 175) loadedSize = 'large';
                else loadedSize = 'huge';
            }
            setMarkerSize((loadedSize as any) || 'medium');

            setMarkerColor(map.markerColor || 'red');

            // Auto fit to 100%
            setZoom(1);

            setSelectedFile(null);
            setViewMode('EDIT');
        }).catch(err => {
            console.error("Edit map load error", err);
            alert(t('loadMapFailed') || "Load map failed, please retry.");
        });
    };

    const deleteMap = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm(t('confirmDeleteMap') || 'Are you sure you want to delete this map?')) {
            try {
                await StorageService.deleteEquipmentMap(id, user.uid);
                loadMaps();
            } catch (error: any) {
                console.error(error);
                alert(t('deleteFailed') + ': ' + (error.message || '未知錯誤'));

            }
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
        <div className="fixed inset-0 bg-slate-900/90 z-50 flex flex-col backdrop-blur-sm animate-in fade-in duration-200 h-[100dvh] relative">
            {/* Global Loading Overlay */}
            {isSaving && (
                <div className="absolute inset-0 z-[60] bg-white/80 backdrop-blur-md flex flex-col items-center justify-center">
                    <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                    <p className="text-lg font-bold text-slate-700">{t('processing') || 'Processing...'}</p>
                </div>
            )}

            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shrink-0 shadow-sm z-30">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            if (viewMode === 'EDIT') {
                                setViewMode('LIST');
                            } else {
                                onClose();
                            }
                        }}
                        className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors"
                        title={t('back')}

                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                        <MapPin className="w-6 h-6 text-red-500" />
                        {viewMode === 'LIST' ? t('mapManager') : t('editMap')}
                    </h2>
                </div>
                <div className="flex items-center gap-2">
                    {/* Right side actions if any */}
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
                {viewMode === 'LIST' ? (
                    //  === LIST VIEW ===
                    <div className="flex-1 overflow-y-auto p-4 sm:p-8">
                        <div className="max-w-7xl mx-auto space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-bold text-slate-700">{t('uploadedMaps')}</h3>
                                <div className="flex items-center gap-4">
                                    <p className="text-sm text-slate-500">{t('total') || 'Total'} {maps.length} {t('maps') || 'Maps'}</p>

                                    <button
                                        onClick={() => setIsStorageManagerOpen(true)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-sm font-bold transition-colors"
                                    >
                                        <Upload className="w-4 h-4" />
                                        {t('cloudGallery')}
                                    </button>
                                </div>
                            </div>

                            {/* Map List - Responsive View */}
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                {/* Desktop Table View */}
                                <div className="hidden md:block">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-12">#</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-24">{t('preview')}</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('mapName')}</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('mapSize')}</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('lastEdited')}</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">{t('actions')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {/* Create New Row */}
                                            <tr
                                                onClick={() => {
                                                    setModalMode('SELECT');
                                                    setIsStorageManagerOpen(true);
                                                }}
                                                className="hover:bg-blue-50 transition-colors cursor-pointer group border-b-2 border-slate-100/50"
                                            >
                                                <td className="px-6 py-4"></td>
                                                <td className="px-6 py-4">
                                                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                                                        <Plus className="w-6 h-6" />
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4" colSpan={4}>
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-bold text-slate-700 text-lg group-hover:text-blue-600">{t('createNewMap')}</span>
                                                        <span className="text-xs font-normal text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">{t('selectFromCloud')}</span>
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Existing Maps */}
                                            {maps.map((map, index) => (
                                                <tr key={map.id} onClick={() => editMap(map)} className="hover:bg-slate-50 transition-colors cursor-pointer group">
                                                    <td className="px-6 py-4 text-sm text-slate-500 font-bold">
                                                        {index + 1}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 relative">
                                                            <img
                                                                src={map.imageUrl}
                                                                alt={map.name}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-bold text-slate-700 text-base group-hover:text-blue-600 transition-colors">{map.name}</div>
                                                        <div className="text-xs text-slate-400 mt-0.5">{map.markers?.length || 0} {t('markers')}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-slate-600 font-mono">
                                                        {map.size ? (map.size / 1024 / 1024).toFixed(2) + ' MB' : '-'}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-slate-600">
                                                        {new Date(map.updatedAt).toLocaleString('zh-TW')}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button
                                                            onClick={(e) => deleteMap(e, map.id)}
                                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                            title={t('delete')}
                                                        >
                                                            <Trash2 className="w-5 h-5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile List View */}
                                <div className="md:hidden divide-y divide-slate-100">
                                    {/* Create New Card */}
                                    <div
                                        onClick={() => {
                                            setModalMode('SELECT');
                                            setIsStorageManagerOpen(true);
                                        }}
                                        className="p-4 flex items-center gap-4 hover:bg-blue-50 active:bg-blue-100 transition-colors cursor-pointer"
                                    >
                                        <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
                                            <Plus className="w-6 h-6" />
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="font-bold text-slate-800 text-lg">{t('createNewMap')}</h4>
                                            <p className="text-sm text-blue-600">{t('selectFromCloud')}</p>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-slate-400" />
                                    </div>

                                    {/* Existing Maps Cards */}
                                    {maps.map((map) => (
                                        <div
                                            key={map.id}
                                            onClick={() => editMap(map)}
                                            className="p-4 flex items-center gap-4 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer relative"
                                        >
                                            <div className="w-16 h-16 bg-slate-200 rounded-xl overflow-hidden border border-slate-200 shrink-0">
                                                <img
                                                    src={map.imageUrl}
                                                    alt={map.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-slate-800 text-base truncate pr-8">{map.name}</h4>
                                                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                                    <span className="flex items-center gap-1">
                                                        <MapPin className="w-3 h-3" /> {map.markers?.length || 0} {t('markers')}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <HardDrive className="w-3 h-3" /> {map.size ? (map.size / 1024 / 1024).toFixed(1) + 'MB' : '-'}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-slate-400 mt-1">
                                                    {new Date(map.updatedAt).toLocaleDateString('zh-TW')}
                                                </div>
                                            </div>

                                            {/* Stop Propagation logic for delete button on mobile might be tricky if row is clickable. 
                                                Using a specialized delete button area or just absolute positioning. */}
                                            <button
                                                onClick={(e) => deleteMap(e, map.id)}
                                                className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    // === EDIT VIEW ===
                    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-slate-100">

                        {/* Middle Canvas */}
                        <div className="h-[45vh] lg:h-auto lg:flex-1 relative overflow-hidden flex flex-col items-center justify-center bg-slate-100 pattern-grid-lg shadow-inner shrink-0">

                            {/* Floating Toolbar */}
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md shadow-lg border border-slate-200 rounded-full px-1.5 py-1 sm:px-4 sm:py-2 flex items-center gap-0.5 sm:gap-2 z-30 max-w-[98vw] overflow-x-auto no-scrollbar [&::-webkit-scrollbar]:hidden">
                                <div className="flex items-center gap-0.5 shrink-0">
                                    <button onClick={zoomOut} className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-full text-slate-600 active:bg-slate-200 transition-colors" title="Zoom Out">
                                        <ZoomOut className="w-4 h-4 sm:w-5 sm:h-5" />
                                    </button>
                                    <span className="text-[10px] sm:text-xs font-mono font-bold w-10 sm:w-12 text-center select-none text-slate-600">{Math.round(zoom * 100)}%</span>
                                    <button onClick={zoomIn} className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-full text-slate-600 active:bg-slate-200 transition-colors" title="Zoom In">
                                        <ZoomIn className="w-4 h-4 sm:w-5 sm:h-5" />
                                    </button>
                                </div>
                                <div className="w-px h-3 sm:h-6 bg-slate-200 mx-0.5 shrink-0"></div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                    <button onClick={rotateLeft} className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-full text-slate-600 active:bg-slate-200 transition-colors" title="Rotate Left">
                                        <RotateCw className="w-4 h-4 sm:w-5 sm:h-5 -scale-x-100" />
                                    </button>
                                    <button onClick={rotateRight} className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-full text-slate-600 active:bg-slate-200 transition-colors" title="Rotate Right">
                                        <RotateCw className="w-4 h-4 sm:w-5 sm:h-5" />
                                    </button>
                                </div>
                                <div className="w-px h-3 sm:h-6 bg-slate-200 mx-0.5 shrink-0"></div>
                                <button onClick={() => setShowGrid(!showGrid)} className={`p-1.5 sm:p-2 rounded-full transition-all shrink-0 ${showGrid ? 'bg-indigo-50 text-indigo-600 shadow-inner' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'}`} title="Toggle Grid">
                                    <Grid className="w-4 h-4 sm:w-5 sm:h-5" />
                                </button>
                                <div className="w-px h-3 sm:h-6 bg-slate-200 mx-0.5 shrink-0"></div>
                                <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 sm:p-1 rounded-full border border-slate-200 shrink-0">
                                    <button
                                        onClick={() => setToolMode('SELECT')}
                                        className={`p-1.5 sm:p-2 rounded-full transition-all flex items-center gap-1 sm:gap-2 ${toolMode === 'SELECT' ? 'bg-white text-blue-600 shadow-md ring-1 ring-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                                        title={t('selectMode')}
                                    >
                                        <MousePointer2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                        {/* Hide text on mobile for extreme compactness, or keep very small */}
                                        {toolMode === 'SELECT' && <span className="text-[10px] font-bold pr-1 hidden sm:inline">{t('select')}</span>}
                                    </button>
                                    <button
                                        onClick={() => setToolMode('ADD_MARKER')}
                                        className={`p-1.5 sm:p-2 rounded-full transition-all flex items-center gap-1 sm:gap-2 ${toolMode === 'ADD_MARKER' ? 'bg-white text-red-600 shadow-md ring-1 ring-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                                        title={t('addMarkerMode')}
                                    >
                                        <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                        {toolMode === 'ADD_MARKER' && <span className="text-[10px] font-bold pr-1 text-red-500 hidden sm:inline">{t('marker')}</span>}
                                    </button>
                                </div>
                                <div className="w-px h-3 sm:h-6 bg-slate-200 mx-0.5 shrink-0"></div>
                                <button onClick={zoomReset} className="px-1.5 py-1 sm:px-3 sm:py-1 text-[10px] sm:text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors flex items-center gap-1 shrink-0" title="Reset View">
                                    <span>{t('reset')}</span>
                                </button>
                            </div>

                            {/* Canvas Scroll Area */}
                            <div className="w-full h-full overflow-auto flex items-center justify-center p-0 sm:p-20 cursor-move">
                                <div
                                    className="transition-transform duration-200 ease-out origin-center select-none relative shadow-2xl ring-4 ring-white/50"
                                    style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
                                >
                                    {/* Inner Image Container */}
                                    {image && (
                                        <div
                                            ref={imageContainerRef}
                                            className="relative inline-block cursor-crosshair bg-white"
                                        >
                                            <img
                                                src={image.src}
                                                alt="Map"
                                                crossOrigin={isCorsAllowed ? "anonymous" : undefined}
                                                className="block min-w-[50vw] min-h-[50vh] max-w-[90vw] max-h-[70vh] w-auto h-auto object-contain pointer-events-none select-none"
                                                style={{ touchAction: 'none' }}
                                            />

                                            {/* Grid */}
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

                                            {/* Click Handler */}
                                            <div
                                                className={`absolute inset-0 z-0 click-handler ${draggingMarkerId ? 'cursor-grabbing' : toolMode === 'ADD_MARKER' ? 'cursor-crosshair' : 'cursor-default'}`}
                                                onClick={handleImageClick}
                                                onMouseMove={handleMouseMove}
                                                onMouseUp={handleMouseUp}
                                                onMouseLeave={handleMouseUp}
                                            ></div>

                                            {/* Markers */}
                                            {markers.map((marker, idx) => {
                                                const currentSize = marker.size || markerSize;
                                                const colorClasses = getMarkerColor(marker);

                                                const sizeClasses = {
                                                    tiny: 'w-1.5 h-1.5 md:w-2 md:h-2 -ml-0.5 -mt-0.5 md:-ml-1 md:-mt-1',
                                                    small: 'w-2 h-2 md:w-3 md:h-3 -ml-1 -mt-1 md:-ml-1.5 md:-mt-1.5',
                                                    medium: 'w-3 h-3 md:w-4 md:h-4 -ml-1.5 -mt-1.5 md:-ml-2 md:-mt-2',
                                                    large: 'w-4 h-4 md:w-6 md:h-6 -ml-2 -mt-2 md:-ml-3 md:-mt-3',
                                                    huge: 'w-6 h-6 md:w-8 md:h-8 -ml-3 -mt-3 md:-ml-4 md:-mt-4'
                                                }[currentSize];

                                                const textSizeClasses = {
                                                    tiny: 'text-[8px]',
                                                    small: 'text-[10px]',
                                                    medium: 'text-xs',
                                                    large: 'text-sm',
                                                    huge: 'text-base'
                                                }[currentSize];

                                                return (
                                                    <div
                                                        key={marker.id}
                                                        className={`absolute ${sizeClasses} ${colorClasses} rounded-full flex items-center justify-center shadow-sm hover:scale-150 z-10 group cursor-grab 
                                                            ${draggingMarkerId === marker.id ? 'opacity-80 scale-125 cursor-grabbing pointer-events-none' : ''}
                                                            ${selectedMarkerId === marker.id ? 'ring-4 ring-blue-400 ring-opacity-75 z-20' : ''}
                                                        `}
                                                        style={{
                                                            left: `${marker.x}%`,
                                                            top: `${marker.y}%`,
                                                            transform: `scale(${1 / zoom})`,
                                                            transformOrigin: 'center center',
                                                            ...getMarkerStyle(marker)
                                                        }}
                                                        onMouseDown={(e) => handleMarkerMouseDown(e, marker.id)}
                                                        onClick={(e) => handleMarkerClick(e, marker.id)}
                                                    >
                                                        <div
                                                            className="flex items-center justify-center relative w-full h-full pointer-events-none"
                                                            style={{ transform: `rotate(${-rotation}deg)` }}
                                                        >
                                                            <span className={`text-white font-bold select-none leading-none ${textSizeClasses} ${currentSize === 'small' ? 'scale-[0.6]' : ''}`}>
                                                                {idx + 1}
                                                            </span>

                                                            <div className="absolute bottom-full mb-1 bg-slate-900/90 backdrop-blur text-white text-[10px] px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                                                                {marker.equipmentId || '未命名'}
                                                            </div>
                                                        </div>
                                                        {/* Delete Button Removed as per request */}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Marker Selection Indicator / Quick Actions could go here, but Sidebar is better */}
                        </div>

                        {/* Tools Sidebar */}
                        <div className="flex-1 lg:flex-none w-full lg:w-80 bg-white border-t lg:border-t-0 lg:border-r border-slate-200 flex flex-col z-20 shadow-2xl shadow-slate-200/50 shrink-0 overflow-hidden">
                            <div className="flex-1 overflow-y-auto bg-slate-50/50">


                                {/* Global Marker Size */}
                                <div className="p-4 border-b border-slate-200 bg-white">
                                    {/* Global Marker Size Removed as per request (revert to individual only or non-UI global) */}

                                </div>

                                {/* Marker List */}
                                <div className="p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                            {t('markerList')}
                                            <span className="bg-slate-200 text-slate-600 px-1.5 rounded-md text-[10px]">{markers.length}</span>

                                        </h3>
                                        {/* Legend Info Icon */}
                                        <button
                                            onClick={() => setIsLegendModalOpen(true)}
                                            className="p-1.5 hover:bg-blue-50 rounded-full text-blue-500 transition-colors group relative"
                                            title={t('legendTitle')}
                                        >

                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="absolute -top-8 right-0 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                                {t('legendTitle')}
                                            </span>

                                        </button>
                                    </div>

                                    {markers.length === 0 ? (
                                        <div className="text-center py-10 text-slate-400 text-sm">
                                            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                            {t('clickToAddMarker')}
                                        </div>

                                    ) : (
                                        <div className="space-y-2">
                                            {markers.map((marker, idx) => {
                                                const isSelected = selectedMarkerId === marker.id;
                                                const colorClass = getMarkerColor(marker);

                                                return (
                                                    <div
                                                        key={marker.id}
                                                        id={`marker-item-${marker.id}`}
                                                        onClick={() => setSelectedMarkerId(marker.id)}
                                                        className={`bg-white p-3 rounded-xl border-2 transition-all cursor-pointer group ${isSelected ? 'border-blue-500 shadow-md ring-4 ring-blue-500/5' : 'border-slate-100 hover:border-blue-200 hover:shadow-sm'}`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div
                                                                className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-bold text-sm transition-colors shadow-sm text-white ${isMarkerAbnormal(marker)
                                                                    ? 'bg-orange-500'
                                                                    : (isSelected ? colorClass + ' ring-2 ring-offset-1 ring-blue-500' : colorClass + ' opacity-75 group-hover:opacity-100')
                                                                    }`}
                                                                style={getMarkerStyle(marker)}
                                                            >
                                                                {idx + 1}
                                                            </div>

                                                            <div className="flex-1 min-w-0">
                                                                <input
                                                                    type="text"
                                                                    value={marker.equipmentId}
                                                                    onChange={(e) => updateMarker(marker.id, { equipmentId: e.target.value.toUpperCase() })}
                                                                    placeholder={t('enterId')}
                                                                    className={`w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none p-0 text-sm font-bold transition-colors ${isSelected ? 'text-slate-800' : 'text-slate-600'}`}

                                                                />
                                                            </div>

                                                            <div className="flex items-center">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (confirm(t('confirmDeleteMarker'))) deleteMarker(e, marker.id);
                                                                    }}
                                                                    className={`p-1.5 rounded-lg transition-all ${isSelected ? 'text-red-500 hover:bg-red-50' : 'text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100'}`}
                                                                    title={t('delete')}

                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Expanded Controls for Selected Item */}
                                                        {isSelected && (
                                                            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
                                                                <div className="flex-1 flex bg-slate-50 p-1 rounded-lg gap-1">
                                                                    {(['tiny', 'small', 'medium', 'large', 'huge'] as const).map((size) => (
                                                                        <button
                                                                            key={size}
                                                                            onClick={(e) => { e.stopPropagation(); updateMarker(marker.id, { size }); }}
                                                                            className={`flex-1 py-1 text-[10px] font-bold rounded-md transition-all ${((marker.size || 'medium') === size) ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                                                            title={{ tiny: '極小', small: '小', medium: '中', large: '大', huge: '特大' }[size]}
                                                                        >
                                                                            {{ tiny: 'XS', small: 'S', medium: 'M', large: 'L', huge: 'XL' }[size]}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-4 border-t border-slate-200 bg-white space-y-2 shrink-0 z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">


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
                                            {t('savePositionMap')}
                                        </>

                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Legend Modal */}
            {
                isLegendModalOpen && (
                    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setIsLegendModalOpen(false)}>
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                            {/* Header */}
                            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                                    {t('legendTitle')}
                                </h3>

                                <button
                                    onClick={() => setIsLegendModalOpen(false)}
                                    className="p-1 hover:bg-slate-100 rounded-full transition-colors"
                                >
                                    <X className="w-5 h-5 text-slate-400" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-6 space-y-3">
                                {/* Abnormal Status - Logic Updates */}
                                <div className="flex items-center gap-4 p-3 bg-red-50 rounded-xl border border-red-100">
                                    <div className="w-10 h-10 flex items-center justify-center shrink-0">
                                        <div
                                            className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center shadow-md"
                                            style={lightSettings?.abnormal?.color ? { backgroundColor: lightSettings.abnormal.color } : {}}
                                        >
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-800">異常複檢</p>
                                        <p className="text-xs text-slate-600">表示設備異常</p>
                                    </div>
                                </div>

                                {/* Red Light - Overdue */}
                                <div className="flex items-center gap-4 p-3 bg-red-50 rounded-xl border border-red-100">
                                    <div
                                        className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center shadow-md shrink-0"
                                        style={lightSettings?.red?.color ? { backgroundColor: lightSettings.red.color } : {}}
                                    >
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-800">需檢查</p>
                                        <p className="text-xs text-slate-600">剩餘 &le; {lightSettings?.red?.days || 2} 天</p>
                                    </div>
                                </div>

                                {/* Yellow Light - Warning */}
                                <div className="flex items-center gap-4 p-3 bg-yellow-50 rounded-xl border border-yellow-100">
                                    <div
                                        className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center shadow-md shrink-0"
                                        style={lightSettings?.yellow?.color ? { backgroundColor: lightSettings.yellow.color } : {}}
                                    >
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-800">可以檢查</p>
                                        <p className="text-xs text-slate-600">剩餘 {(lightSettings?.red?.days || 2) + 1} - {lightSettings?.yellow?.days || 5} 天</p>
                                    </div>
                                </div>

                                {/* Green Light - Normal (Unnecessary) */}
                                <div className="flex items-center gap-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
                                    <div
                                        className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center shadow-md shrink-0"
                                        style={lightSettings?.green?.color ? { backgroundColor: lightSettings.green.color } : {}}
                                    >
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-800">不需檢查</p>
                                        <p className="text-xs text-slate-600">剩餘 &gt; {lightSettings?.yellow?.days || 5} 天</p>
                                    </div>
                                </div>

                                {/* Completed Light */}
                                <div className="flex items-center gap-4 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                                    <div
                                        className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center shadow-md shrink-0"
                                        style={lightSettings?.completed?.color ? { backgroundColor: lightSettings.completed.color } : {}}
                                    >
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-800">已檢查</p>
                                        <p className="text-xs text-slate-600">檢查完成</p>
                                    </div>
                                </div>

                                {/* Gray - Unlinked */}
                                <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                                    <div className="w-10 h-10 bg-slate-400 rounded-full flex items-center justify-center shadow-md shrink-0">
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-800">⚪ 灰色</p>
                                        <p className="text-xs text-slate-600">未連結設備</p>
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                                <button
                                    onClick={() => setIsLegendModalOpen(false)}
                                    className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl transition-colors"
                                >
                                    {t('gotIt')}
                                </button>

                            </div>
                        </div>
                    </div>
                )
            }

            <StorageManagerModal
                user={user}
                isOpen={isStorageManagerOpen}
                onClose={() => setIsStorageManagerOpen(false)}
                onSelect={modalMode === 'SELECT' ? handleSelectFile : undefined}
                allowUpload={modalMode !== 'SELECT'}
                allowDelete={modalMode !== 'SELECT'}
            />

            {/* Add Marker Confirmation Modal */}
            {pendingMarker && (
                <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100">
                            <h3 className="font-bold text-lg text-slate-800">{t('addMarkerTitle')}</h3>
                            <p className="text-xs text-slate-500">{t('addMarkerDesc')}</p>
                        </div>
                        <div className="p-6">
                            <label className="block text-sm font-bold text-slate-700 mb-2">{t('equipmentIdLabel')}</label>
                            <input
                                type="text"

                                value={pendingEquipmentId}
                                onChange={(e) => setPendingEquipmentId(e.target.value.toUpperCase())}
                                placeholder={t('exampleId')}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-lg"

                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') confirmAddMarker();
                                    if (e.key === 'Escape') cancelAddMarker();
                                }}
                            />
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                            <button
                                onClick={cancelAddMarker}
                                className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors"
                            >
                                {t('cancel')}
                            </button>
                            <button
                                onClick={confirmAddMarker}
                                className="flex-1 py-2.5 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 transition-colors shadow-lg shadow-blue-200"
                            >
                                {t('confirmAdd')}
                            </button>

                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

export default EquipmentMapEditor;
