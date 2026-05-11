import React, { useState, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RefreshCcw, Download } from 'lucide-react';
import { toast } from 'sonner';

interface ImageZoomModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageUrl: string;
}

export const ImageZoomModal: React.FC<ImageZoomModalProps> = ({ isOpen, onClose, imageUrl }) => {
    const [scale, setScale] = useState(1);
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    useEffect(() => {
        if (isOpen) {
            setScale(1);
            setPosition({ x: 0, y: 0 });
        }
    }, [isOpen, imageUrl]);

    if (!isOpen || !imageUrl) return null;

    const handleZoomIn = () => setScale(prev => Math.min(prev + 0.3, 4));
    const handleZoomOut = () => setScale(prev => Math.max(prev - 0.3, 0.5));
    const handleReset = () => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    };

    const handleDownload = () => {
        try {
            const link = document.createElement('a');
            link.href = imageUrl;
            // Generate a filename based on timestamp
            const timestamp = new Date().getTime();
            link.download = `xray_image_${timestamp}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success('Gambar berhasil didownload');
        } catch (error) {
            console.error('Failed to download image:', error);
            toast.error('Gagal mendownload gambar');
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (e.deltaY < 0) {
            handleZoomIn();
        } else {
            handleZoomOut();
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="absolute top-4 right-4 flex space-x-2 z-50"
                onClick={e => e.stopPropagation()}
            >
                <button
                    className="p-2 bg-white rounded-full text-black hover:bg-gray-200 shadow-lg transition-colors"
                    onClick={handleZoomIn}
                    title="Zoom In"
                >
                    <ZoomIn size={24} />
                </button>
                <button
                    className="p-2 bg-white rounded-full text-black hover:bg-gray-200 shadow-lg transition-colors"
                    onClick={handleZoomOut}
                    title="Zoom Out"
                >
                    <ZoomOut size={24} />
                </button>
                <button
                    className="p-2 bg-white rounded-full text-black hover:bg-gray-200 shadow-lg transition-colors"
                    onClick={handleReset}
                    title="Reset"
                >
                    <RefreshCcw size={24} />
                </button>
                <button
                    className="p-2 bg-blue-600 rounded-full text-white hover:bg-blue-700 shadow-lg transition-colors"
                    onClick={handleDownload}
                    title="Download Image"
                >
                    <Download size={24} />
                </button>
                <button
                    className="p-2 bg-red-500 rounded-full text-white hover:bg-red-600 shadow-lg transition-colors"
                    onClick={onClose}
                    title="Close"
                >
                    <X size={24} />
                </button>
            </div>

            <div
                className="relative w-full h-full overflow-hidden flex items-center justify-center"
                onWheel={handleWheel}
            >
                <img
                    src={imageUrl}
                    alt="Zoomed View"
                    style={{
                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                        transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                    }}
                    className={`max-w-full max-h-full object-contain ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    draggable="false"
                    onClick={e => e.stopPropagation()}
                />
            </div>
        </div>
    );
};
