export interface ParsedAddress {
  village: string;
  post: string;
  upazila: string;
  district: string;
}

/**
 * Intelligent parser for Bangladeshi address formats.
 * Handles both labeled strings (e.g. "গ্রাম: আলীয়াবাদ, ডাকঘর: নবীনগর, উপজেলা: নবীনগর, জেলা: ব্রাহ্মণবাড়িয়া")
 * and comma-separated strings (e.g. "House 24, Road 5, Block B, Uttara, Dhaka").
 */
export function parseBangladeshiAddress(raw: string | null | undefined): ParsedAddress {
  if (!raw || typeof raw !== 'string') {
    return { village: '', post: '', upazila: '', district: '' };
  }
  const str = raw.trim().replace(/^["'\s]+|["'\s]+$/g, '');
  if (!str) return { village: '', post: '', upazila: '', district: '' };

  // Check labeled format: গ্রাম: ..., ডাকঘর: ..., উপজেলা/থানা: ..., জেলা: ...
  const villMatch = str.match(/(?:গ্রাম|মহল্লা|বাড়ি|রোড|বাসা|vill(?:age)?)\s*[:=\-]?\s*([^,;\n]+)/i);
  const postMatch = str.match(/(?:ডাকঘর|পোস্ট|পোঃ|post\s*office|post|po)\s*[:=\-]?\s*([^,;\n]+)/i);
  const upazilaMatch = str.match(/(?:উপজেলা|থানা|upazila|thana|ps)\s*[:=\-]?\s*([^,;\n]+)/i);
  // Negative lookbehind (?<!উপ) to prevent matching "উপজেলা" as "জেলা"
  const distMatch = str.match(/(?<!উপ)(?:জেলা|district|dist)\s*[:=\-]?\s*([^,;\n]+)/i);

  if (villMatch || postMatch || upazilaMatch || distMatch) {
    return {
      village: (villMatch ? villMatch[1].trim() : '').replace(/^[,\s]+|[,\s]+$/g, ''),
      post: (postMatch ? postMatch[1].trim() : '').replace(/^[,\s]+|[,\s]+$/g, ''),
      upazila: (upazilaMatch ? upazilaMatch[1].trim() : '').replace(/^[,\s]+|[,\s]+$/g, ''),
      district: (distMatch ? distMatch[1].trim() : '').replace(/^[,\s]+|[,\s]+$/g, ''),
    };
  }

  // Comma/newline separated
  const parts = str.split(/[,;\n]+/).map((p) => p.trim().replace(/^["'\s]+|["'\s]+$/g, '')).filter(Boolean);
  if (parts.length >= 4) {
    const district = parts[parts.length - 1];
    const upazila = parts[parts.length - 2];
    
    // Check if parts[parts.length - 3] is a street/house/block or post
    const thirdFromLast = parts[parts.length - 3];
    const isStreetOrBlock = /(?:house|road|block|sector|flat|holding|রোড|ব্লক|সেক্টর|বাড়ি|বাসা|\d)/i.test(thirdFromLast);
    
    if (isStreetOrBlock) {
      const village = parts.slice(0, parts.length - 2).join(', ');
      return { village, post: upazila, upazila, district };
    } else {
      const post = thirdFromLast;
      const village = parts.slice(0, parts.length - 3).join(', ');
      return { village, post, upazila, district };
    }
  } else if (parts.length === 3) {
    return {
      village: parts[0],
      post: parts[1],
      upazila: parts[1],
      district: parts[2],
    };
  } else if (parts.length === 2) {
    return {
      village: parts[0],
      post: parts[0],
      upazila: parts[0],
      district: parts[1],
    };
  }

  return {
    village: str,
    post: '',
    upazila: '',
    district: '',
  };
}

export function formatFullAddress(parts: Partial<ParsedAddress>): string {
  const chunks: string[] = [];
  if (parts.village) chunks.push(parts.village);
  if (parts.post) chunks.push(`ডাকঘর: ${parts.post}`);
  if (parts.upazila) chunks.push(`উপজেলা: ${parts.upazila}`);
  if (parts.district) chunks.push(`জেলা: ${parts.district}`);
  return chunks.join(', ');
}
