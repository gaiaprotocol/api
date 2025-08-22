type OpenSeaAttribute = {
  display_type?: string;
  trait_type: string;
  value: string | number;
};

type OpenSeaMetadataSchem = {
  name: string;
  description?: string;
  image: string;
  external_url?: string;
  animation_url?: string;
  attributes: OpenSeaAttribute[];
};

type NftData = {
  traits?: { [traitName: string]: string | number };
  parts?: { [partName: string]: string | number };
};

type NftInputPayload = {
  name: string;
  description?: string;
  image: string;
  external_url?: string;
  animation_url?: string;
} & NftData;

class MetadataTransformer {
  toOpenSeaFormat(nftSource: NftInputPayload): OpenSeaMetadataSchem {
    const {
      name,
      description,
      image,
      external_url,
      animation_url,
      traits,
      parts,
    } = nftSource;

    const attributeList: OpenSeaMetadataSchem["attributes"] = [];

    this.#appendAttributesFromObject(attributeList, traits);
    this.#appendAttributesFromObject(attributeList, parts);

    return {
      name,
      description,
      image,
      external_url,
      animation_url,
      attributes: attributeList,
    };
  }

  toNftDataFormat(metadata: OpenSeaMetadataSchem): NftData {
    const parts: Record<string, string | number> = {};

    for (const { trait_type, value } of metadata.attributes) {
      parts[trait_type] = value;
    }

    return { parts };
  }

  #appendAttributesFromObject(
    attributeList: OpenSeaMetadataSchem["attributes"],
    source?: Record<string, string | number>
  ): void {
    if (!source) return;

    for (const [traitType, value] of Object.entries(source)) {
      const attribute = {
        trait_type: traitType,
        value,
        ...(typeof value === "number" ? { display_type: "number" } : {}),
      };
      attributeList.push(attribute);
    }
  }
}

export const metadataTransformer = new MetadataTransformer();
