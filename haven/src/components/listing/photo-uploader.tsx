'use client';

import { useState, useCallback } from 'react';
import { Upload, X, GripVertical, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

interface Photo {
  id?: string;
  url: string;
  file?: File;
  position: number;
  is_primary: boolean;
  uploading?: boolean;
}

interface PhotoUploaderProps {
  listingId?: string;
  photos: Photo[];
  onChange: (photos: Photo[]) => void;
  onAnalyze?: () => void;
  maxPhotos?: number;
}

export function PhotoUploader({ listingId, photos, onChange, onAnalyze, maxPhotos = 20 }: PhotoUploaderProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const supabase = createClient();

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files) return;
    
    const newPhotos: Photo[] = [];
    const startPosition = photos.length;

    for (let i = 0; i < files.length && photos.length + newPhotos.length < maxPhotos; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      const url = URL.createObjectURL(file);
      newPhotos.push({
        url,
        file,
        position: startPosition + i,
        is_primary: photos.length === 0 && i === 0,
        uploading: true,
      });
    }

    onChange([...photos, ...newPhotos]);

    // Upload each photo
    for (const photo of newPhotos) {
      if (!photo.file) continue;
      
      const fileName = `${Date.now()}-${photo.file.name}`;
      const path = listingId ? `listings/${listingId}/${fileName}` : `temp/${fileName}`;

      const { data, error } = await supabase.storage
        .from('photos')
        .upload(path, photo.file);

      if (error) {
        console.error('Upload error:', error);
        continue;
      }

      const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(path);

      onChange((prev) =>
        prev.map((p) =>
          p.url === photo.url ? { ...p, url: publicUrl, uploading: false } : p
        )
      );
    }
  }, [photos, onChange, maxPhotos, listingId, supabase]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index).map((p, i) => ({
      ...p,
      position: i,
      is_primary: i === 0,
    }));
    onChange(newPhotos);
  };

  const setPrimary = (index: number) => {
    onChange(photos.map((p, i) => ({ ...p, is_primary: i === index })));
  };

  const handleDragStart = (index: number) => setDraggedIndex(index);

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newPhotos = [...photos];
    const [dragged] = newPhotos.splice(draggedIndex, 1);
    newPhotos.splice(index, 0, dragged);
    
    onChange(newPhotos.map((p, i) => ({ ...p, position: i })));
    setDraggedIndex(index);
  };

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center transition-colors',
          'hover:border-blue-400 hover:bg-blue-50/50',
          photos.length >= maxPhotos ? 'opacity-50 pointer-events-none' : ''
        )}
      >
        <Upload className="h-10 w-10 mx-auto text-gray-400" />
        <p className="mt-2 text-sm text-gray-600">
          Drag & drop photos or{' '}
          <label className="text-blue-600 hover:underline cursor-pointer">
            browse
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files)}
              disabled={photos.length >= maxPhotos}
            />
          </label>
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {photos.length} / {maxPhotos} photos uploaded
        </p>
      </div>

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {photos.map((photo, index) => (
            <div
              key={photo.url}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={() => setDraggedIndex(null)}
              className={cn(
                'relative group aspect-square rounded-lg overflow-hidden border-2',
                photo.is_primary ? 'border-blue-500' : 'border-transparent',
                draggedIndex === index ? 'opacity-50' : ''
              )}
            >
              <img src={photo.url} alt="" className="h-full w-full object-cover" />
              
              {photo.uploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                </div>
              )}

              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors">
                <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <GripVertical className="h-5 w-5 text-white cursor-grab" />
                </div>
                
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => removePhoto(index)}
                    className="p-1 bg-red-500 rounded-full text-white hover:bg-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {!photo.is_primary && (
                  <button
                    onClick={() => setPrimary(index)}
                    className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs bg-white/90 rounded py-1 hover:bg-white"
                  >
                    Set as primary
                  </button>
                )}
              </div>

              {photo.is_primary && (
                <span className="absolute bottom-2 left-2 text-xs bg-blue-500 text-white px-2 py-0.5 rounded">
                  Primary
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {photos.length >= 3 && onAnalyze && (
        <Button onClick={onAnalyze} variant="outline" className="w-full">
          ✨ Analyze Photos with AI
        </Button>
      )}
    </div>
  );
}
