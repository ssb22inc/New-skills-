'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { PhotoUploader } from '@/components/listing/photo-uploader';
import { VoiceRecorder } from '@/components/listing/voice-recorder';
import { Camera, Mic, MessageSquare, Loader2 } from 'lucide-react';
import { useListings } from '@/hooks/use-listings';

interface Photo {
  id?: string;
  url: string;
  file?: File;
  position: number;
  is_primary: boolean;
  uploading?: boolean;
}

export default function NewListingPage() {
  const router = useRouter();
  const { createListing, loading } = useListings();
  const [activeTab, setActiveTab] = useState('photos');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    property_type: 'apartment',
    bedrooms: 1,
    bathrooms: 1,
    sqft: '',
    address_line1: '',
    city: '',
    state: '',
    zip_code: '',
    price_monthly: '',
    amenities: [] as string[],
  });
  const [aiGenerating, setAiGenerating] = useState(false);

  const handlePhotoAnalysis = async () => {
    if (photos.length < 3) return;
    
    setAiGenerating(true);
    try {
      const res = await fetch('/api/ai/analyze-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls: photos.map(p => p.url) }),
      });
      const analysis = await res.json();
      
      const listingRes = await fetch('/api/ai/generate-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          photo_analysis: analysis.photos,
        }),
      });
      const { listing } = await listingRes.json();
      
      setFormData(prev => ({
        ...prev,
        title: listing.title || prev.title,
        description: listing.description || prev.description,
        amenities: listing.amenities || prev.amenities,
      }));
      
      setActiveTab('details');
    } catch (error) {
      console.error('AI generation error:', error);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleVoiceTranscription = async (text: string) => {
    setAiGenerating(true);
    try {
      const res = await fetch('/api/ai/generate-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          landlord_notes: text,
        }),
      });
      const { listing } = await res.json();
      
      setFormData(prev => ({
        ...prev,
        title: listing.title || prev.title,
        description: listing.description || prev.description,
        amenities: listing.amenities || prev.amenities,
      }));
      
      setActiveTab('details');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSubmit = async (status: 'draft' | 'active') => {
    const listing = await createListing({
      ...formData,
      sqft: formData.sqft ? parseInt(formData.sqft) : undefined,
      price_monthly: parseInt(formData.price_monthly),
      status,
    } as Parameters<typeof createListing>[0]);
    
    if (listing) {
      router.push(`/listings/${listing.id}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Create New Listing</h1>
        <p className="mt-1 text-gray-600">
          Use AI to create a compelling listing in minutes
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="photos" className="gap-2">
            <Camera className="h-4 w-4" /> Photos
          </TabsTrigger>
          <TabsTrigger value="voice" className="gap-2">
            <Mic className="h-4 w-4" /> Voice
          </TabsTrigger>
          <TabsTrigger value="details" className="gap-2">
            <MessageSquare className="h-4 w-4" /> Details
          </TabsTrigger>
        </TabsList>

        <TabsContent value="photos" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload Photos</CardTitle>
              <CardDescription>
                Add at least 3 photos and our AI will analyze them to create your listing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PhotoUploader
                photos={photos}
                onChange={setPhotos}
                onAnalyze={handlePhotoAnalysis}
              />
              
              {aiGenerating && (
                <div className="mt-4 flex items-center justify-center gap-2 text-blue-600">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Analyzing photos and generating listing...
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="voice" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Describe Your Property</CardTitle>
              <CardDescription>
                Tell us about your property and we'll create a listing for you
              </CardDescription>
            </CardHeader>
            <CardContent>
              <VoiceRecorder onTranscription={handleVoiceTranscription} />
              
              {aiGenerating && (
                <div className="mt-4 flex items-center justify-center gap-2 text-blue-600">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Generating listing from your description...
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Listing Details</CardTitle>
              <CardDescription>
                Review and edit your listing information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Input
                label="Title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Cozy 2BR near Downtown Hospital"
              />

              <Textarea
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe your property..."
                className="min-h-[150px]"
              />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Select
                  label="Property Type"
                  value={formData.property_type}
                  onChange={(e) => setFormData({ ...formData, property_type: e.target.value })}
                  options={[
                    { value: 'apartment', label: 'Apartment' },
                    { value: 'house', label: 'House' },
                    { value: 'condo', label: 'Condo' },
                    { value: 'room', label: 'Room' },
                    { value: 'studio', label: 'Studio' },
                  ]}
                />
                <Input
                  label="Bedrooms"
                  type="number"
                  value={formData.bedrooms}
                  onChange={(e) => setFormData({ ...formData, bedrooms: parseInt(e.target.value) })}
                />
                <Input
                  label="Bathrooms"
                  type="number"
                  step="0.5"
                  value={formData.bathrooms}
                  onChange={(e) => setFormData({ ...formData, bathrooms: parseFloat(e.target.value) })}
                />
                <Input
                  label="Sq Ft"
                  type="number"
                  value={formData.sqft}
                  onChange={(e) => setFormData({ ...formData, sqft: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Address"
                  value={formData.address_line1}
                  onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                  placeholder="123 Main Street"
                />
                <Input
                  label="City"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
                <Input
                  label="State"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="TX"
                  maxLength={2}
                />
                <Input
                  label="ZIP Code"
                  value={formData.zip_code}
                  onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                />
              </div>

              <Input
                label="Monthly Rent"
                type="number"
                value={formData.price_monthly}
                onChange={(e) => setFormData({ ...formData, price_monthly: e.target.value })}
                placeholder="2000"
              />

              <div className="flex gap-4 pt-4">
                <Button
                  variant="outline"
                  onClick={() => handleSubmit('draft')}
                  disabled={loading}
                >
                  Save as Draft
                </Button>
                <Button
                  onClick={() => handleSubmit('active')}
                  disabled={loading}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Publish Listing
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
