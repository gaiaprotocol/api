/**
 * Image resizing utilities for generating thumbnails.
 *
 * This module uses @cf-wasm/resvg for image resizing in Cloudflare Workers.
 * The approach: wrap the image in an SVG and render it at the target size.
 */

import { Resvg } from '@cf-wasm/resvg';

export interface ThumbnailConfig {
  width: number;
  height?: number;
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  quality?: number;
  format?: 'auto' | 'webp' | 'avif' | 'png';
}

export const AVATAR_THUMBNAIL_CONFIG: ThumbnailConfig = {
  width: 144,
  height: 144,
  fit: 'cover',
  quality: 85,
  format: 'png',
};

export const BANNER_THUMBNAIL_CONFIG: ThumbnailConfig = {
  width: 960,
  height: 540,
  fit: 'cover',
  quality: 85,
  format: 'png',
};

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Resize an image using resvg (SVG rendering approach)
 *
 * @param imageBuffer - The original image as ArrayBuffer
 * @param config - Thumbnail configuration
 * @returns Resized image as Uint8Array (PNG format)
 */
export function resizeImage(
  imageBuffer: ArrayBuffer,
  config: ThumbnailConfig,
): Uint8Array {
  const { width, height } = config;
  const targetHeight = height ?? width;

  const base64String = arrayBufferToBase64(imageBuffer);

  // Create SVG that wraps the image with preserveAspectRatio for cover behavior
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${targetHeight}">
    <image href="data:image/png;base64,${base64String}" x="0" y="0" width="${width}" height="${targetHeight}" preserveAspectRatio="xMidYMid slice" />
  </svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
  });

  return resvg.render().asPng();
}
