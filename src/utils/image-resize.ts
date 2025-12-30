/**
 * Cloudflare Image Resizing utilities for generating thumbnails.
 *
 * This module provides two ways to generate thumbnails:
 * 1. URL-based: Generate Cloudflare Image Resizing URLs (on-the-fly transformation)
 * 2. File-based: Fetch resized images and store them as actual files in R2
 *
 * Reference: https://developers.cloudflare.com/images/transform-images/transform-via-url/
 */

export interface ThumbnailConfig {
  width: number;
  height?: number;
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  quality?: number;
  format?: 'auto' | 'webp' | 'avif' | 'json';
}

export const AVATAR_THUMBNAIL_CONFIG: ThumbnailConfig = {
  width: 144,
  height: 144,
  fit: 'cover',
  quality: 85,
  format: 'webp',
};

export const BANNER_THUMBNAIL_CONFIG: ThumbnailConfig = {
  width: 960,
  fit: 'scale-down',
  quality: 85,
  format: 'webp',
};

/**
 * Generate a Cloudflare Image Resizing URL for thumbnails.
 * This requires Cloudflare Image Resizing to be enabled on the domain.
 *
 * @param originalUrl - The original image URL
 * @param config - Thumbnail configuration
 * @returns The resized image URL
 */
export function generateThumbnailUrl(
  originalUrl: string,
  config: ThumbnailConfig
): string {
  try {
    const url = new URL(originalUrl);

    // Build image options string
    const options: string[] = [];
    options.push(`width=${config.width}`);
    if (config.height) options.push(`height=${config.height}`);
    if (config.fit) options.push(`fit=${config.fit}`);
    if (config.quality) options.push(`quality=${config.quality}`);
    if (config.format) options.push(`format=${config.format}`);

    const optionsString = options.join(',');

    // Insert /cdn-cgi/image/{options}/ after the host
    // Original: https://static.example.com/avatars/0x123/uuid.png
    // Result:   https://static.example.com/cdn-cgi/image/width=144,height=144/avatars/0x123/uuid.png
    return `${url.origin}/cdn-cgi/image/${optionsString}${url.pathname}`;
  } catch (error) {
    console.error('[generateThumbnailUrl] Failed to generate thumbnail URL:', error);
    return originalUrl; // Fallback to original URL
  }
}

/**
 * Generate avatar thumbnail URL (144x144)
 */
export function getAvatarThumbnailUrl(originalUrl: string): string {
  return generateThumbnailUrl(originalUrl, AVATAR_THUMBNAIL_CONFIG);
}

/**
 * Generate banner thumbnail URL (960px width)
 */
export function getBannerThumbnailUrl(originalUrl: string): string {
  return generateThumbnailUrl(originalUrl, BANNER_THUMBNAIL_CONFIG);
}
