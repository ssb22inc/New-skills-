'use client';

import { useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Upload, X, Loader2, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { analyzePhoto } from '@/services/ai/photo-analysis';

interface Photo {
  id?: string;
  url: string;
  file?: File;
  order: number;
  isPrimary: boolean;
  isUploading?: boolean;
  aiAnalysis?: {
    room_type?: string;
    features?: string[];
    quality_score?: number;
  };
}

interface PhotoUploaderProps {
  photos: Photo[];
  onChange: (photos: Photo[]) => void;
  maxPhotos?: number;
  listingId?: string;
  enableAIAnalysis?: boolean;
}

export function PhotoUploader({
  photos,
  onChange,
  maxPhotos = 20,
  listingId,
  enableAIAnalysis = true,
}: PhotoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const uploadToSupabase = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = listingId
      ? `listings/${listingId}/${fileName}`
      : `temp/${fileName}`;

    const { data, error } = await supabase.storage
      .from('listing-photos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from('listing-photos').getPublicUrl(data.path);

    return publicUrl;
  };

  const processFiles = async (files: FileList | File[]) => {
    setError(null);

    const fileArray = Array.from(files);
    const validFiles = fileArray.filter((file) => {
      if (!file.type.startsWith('image/')) {
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        // 10MB limit
        setError('Some files exceed the 10MB size limit');
        return false;
      }
      return true;
    });

    if (photos.length + validFiles.length > maxPhotos) {
      setError(`You can only upload up to ${maxPhotos} photos`);
      return;
    }

    // Create preview URLs and add to photos array
    const newPhotos: Photo[] = validFiles.map((file, index) => ({
      url: URL.createObjectURL(file),
      file,
      order: photos.length + index,
      isPrimary: photos.length === 0 && index === 0,
      isUploading: true,
    }));

    onChange([...photos, ...newPhotos]);

    // Upload files and analyze with AI
    for (let i = 0; i < newPhotos.length; i++) {
      const photo = newPhotos[i];
      try {
        // Upload to Supabase
        const url = await uploadToSupabase(photo.file!);

        // Run AI analysis if enabled
        let aiAnalysis;
        if (enableAIAnalysis) {
          try {
            const analysis = await analyzePhoto(url);
            aiAnalysis = {
              room_type: analysis.room_type,
              features: analysis.features,
              quality_score: analysis.quality_score,
            };
          } catch (err) {
            console.error('AI analysis failed:', err);
          }
        }

        // Update photo with real URL and analysis
        const updatedPhoto = {
          ...photo,
          url,
          isUploading: false,
          aiAnalysis,
        };

        onChange((current) =>
          current.map((p) => (p.url === photo.url ? updatedPhoto : p))
        );
      } catch (err) {
        console.error('Upload failed:', err);
        setError('Failed to upload some photos');
        // Remove failed upload
        onChange((current) => current.filter((p) => p.url !== photo.url));
      }
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        processFiles(files);
      }
    },
    [photos, maxPhotos]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const handleRemove = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    // Reorder and ensure we have a primary photo
    const reorderedPhotos = newPhotos.map((photo, i) => ({
      ...photo,
      order: i,
      isPrimary: i === 0 || (photo.isPrimary && index !== 0),
    }));

    if (reorderedPhotos.length > 0 && !reorderedPhotos.some((p) => p.isPrimary)) {
      reorderedPhotos[0].isPrimary = true;
    }

    onChange(reorderedPhotos);
  };

  const handleSetPrimary = (index: number) => {
    const newPhotos = photos.map((photo, i) => ({
      ...photo,
      isPrimary: i === index,
    }));
    onChange(newPhotos);
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    const newPhotos = [...photos];
    const [movedPhoto] = newPhotos.splice(fromIndex, 1);
    newPhotos.splice(toIndex, 0, movedPhoto);

    // Update order values
    const reorderedPhotos = newPhotos.map((photo, i) => ({
      ...photo,
      order: i,
    }));

    onChange(reorderedPhotos);
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-3">
          <div
            className={`p-4 rounded-full ${
              isDragging ? 'bg-primary/10' : 'bg-gray-100'
            }`}
          >
            <Upload className={`h-8 w-8 ${isDragging ? 'text-primary' : 'text-gray-400'}`} />
          </div>

          <div>
            <p className="text-lg font-medium mb-1">
              {isDragging ? 'Drop photos here' : 'Upload property photos'}
            </p>
            <p className="text-sm text-muted-foreground mb-3">
              Drag and drop or click to browse
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon className="h-4 w-4 mr-2" />
              Choose Files
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Up to {maxPhotos} photos, 10MB each. JPG, PNG, or WebP.
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Photo Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map((photo, index) => (
            <Card
              key={photo.url}
              className="relative aspect-square overflow-hidden group"
            >
              <Image
                src={photo.url}
                alt={`Photo ${index + 1}`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
              />

              {/* Loading Overlay */}
              {photo.isUploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                </div>
              )}

              {/* Actions Overlay */}
              {!photo.isUploading && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors">
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-8 w-8"
                      onClick={() => handleRemove(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {!photo.isPrimary && (
                    <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSetPrimary(index)}
                      >
                        Set as Primary
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Primary Badge */}
              {photo.isPrimary && (
                <div className="absolute top-2 left-2">
                  <span className="px-2 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded">
                    Primary
                  </span>
                </div>
              )}

              {/* AI Analysis Badge */}
              {photo.aiAnalysis && (
                <div className="absolute bottom-2 right-2">
                  <span className="px-2 py-1 bg-black/70 text-white text-xs rounded capitalize">
                    {photo.aiAnalysis.room_type}
                  </span>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {photos.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {photos.length} of {maxPhotos} photos uploaded
          {photos.some((p) => p.isUploading) && ' • Uploading...'}
        </p>
      )}
    </div>
  );
}
