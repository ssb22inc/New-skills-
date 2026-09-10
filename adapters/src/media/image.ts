/**
 * Image polish port (P25). By DESIGN there is no generate(): the adapter
 * can only edit a real source photo. No source, no image — fabricated
 * product imagery is a Constitution violation, enforced by shape.
 */
export interface ImagePolishAdapter {
  readonly id: string;
  polish(sourcePhotoRef: string, brief: string): Promise<{ polishedRef: string }>;
}

export interface VideoAdapter {
  readonly id: string;
  shortVideo(sourceRefs: string[], brief: string): Promise<{ videoRef: string }>;
}

export function mockImagePolish(): ImagePolishAdapter {
  return {
    id: 'mock-image-polish',
    polish(sourcePhotoRef, _brief) {
      if (!sourcePhotoRef) return Promise.reject(new Error('polish requires a source photo'));
      return Promise.resolve({ polishedRef: `polished:${sourcePhotoRef}` });
    },
  };
}

export function mockVideo(): VideoAdapter {
  return {
    id: 'mock-video',
    shortVideo(sourceRefs, _brief) {
      if (sourceRefs.length === 0) {
        return Promise.reject(new Error('video requires source imagery'));
      }
      return Promise.resolve({ videoRef: `video:${sourceRefs.join('+')}` });
    },
  };
}
