import { getSelectedParts, GodMetadata, ImageInfo } from '@gaiaprotocol/god-mode-shared';
import { combinePngs } from '@gaiaprotocol/worker-common';

export async function generateGodImage(env: Env, url: string, metadata: GodMetadata) {
  const selectedParts = getSelectedParts(metadata);

  const images: ImageInfo[] = [];
  for (const part of Object.values(selectedParts)) {
    images.push(...(part.images || []));
  }
  images.sort((a, b) => a.drawOrder - b.drawOrder);

  const buffers = await Promise.all(
    images.map((image) =>
      env.ASSETS.fetch(new URL(`gods/part-images/${metadata.type.toLowerCase()}/${image.path}`, url)).then((response) =>
        response.arrayBuffer()
      )
    ),
  );

  return await combinePngs(1024, 1024, buffers);
}
