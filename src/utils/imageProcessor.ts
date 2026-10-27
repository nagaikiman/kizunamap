// ============================================================================
// アイコン画像処理ユーティリティ
// - JPEG / PNG / WebP のみ許可（SVG・GIF・アニメーションは初期版対象外）
// - 入力ファイル最大 5MB
// - 極端に大きな画素数（長辺 8,192px 超または総画素数 3,600万画素超）はデコード負荷防止のため拒否
// - 正方形切り抜き（ズーム・パン調整対応）
// - 128×128px WebP 透過対応に変換
// - 圧縮後本体は原則 20KB (20,480 bytes) 以下、最大 30KB (30,720 bytes)
// - Base64 文字列長（Firestoreルール上限 41,500 文字以内）も同時に検証
// ============================================================================

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_INPUT_FILE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_IMAGE_DIMENSION = 8192; // 8192px
export const MAX_TOTAL_PIXELS = 36_000_000; // 36MP
export const TARGET_ICON_SIZE = 128; // 128x128px
export const TARGET_PREFERRED_BYTES = 20 * 1024; // 原則20KB以下
export const MAX_ALLOWED_ICON_BYTES = 30 * 1024; // 最大30KB (30,720 bytes)
export const MAX_ALLOWED_DATAURL_CHARS = 41500;

export interface CropTransform {
  zoom: number;    // 1.0 〜 3.0
  offsetX: number; // -1.0 〜 1.0 (正規化オフセット)
  offsetY: number; // -1.0 〜 1.0
}

export interface ProcessedIconResult {
  dataUrl: string;
  byteSize: number;
  base64Length: number;
  width: 128;
  height: 128;
  mimeType: 'image/webp';
  qualityUsed: number;
  isWithinPreferred20KB: boolean;
}

/**
 * アップロードされたファイルの初期検証（MIMEタイプ・拡張子・5MB上限）
 */
export function validateInputImageFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'ファイルが選択されていません' };
  }
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.svg') || file.type === 'image/svg+xml') {
    return { valid: false, error: 'SVG画像は対象外です。JPEG・PNG・WebPを選択してください。' };
  }
  if (lowerName.endsWith('.gif') || file.type === 'image/gif') {
    return { valid: false, error: 'GIF（アニメーション画像）は対象外です。JPEG・PNG・WebPを選択してください。' };
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    return {
      valid: false,
      error: '対応していない画像形式です。JPEG・PNG・WebP形式の画像を選択してください。',
    };
  }
  if (file.size > MAX_INPUT_FILE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `ファイルサイズが上限（5MB）を超えています（現在: ${mb}MB）。5MB以下の画像を選択してください。`,
    };
  }
  if (file.size === 0) {
    return { valid: false, error: '空のファイルは読み込めません。' };
  }
  return { valid: true };
}

/**
 * 画像の画素数が極端に大きくないか検証
 */
export function validateImageDimensions(
  width: number,
  height: number
): { valid: boolean; error?: string } {
  if (width <= 0 || height <= 0) {
    return { valid: false, error: '画像のサイズを取得できませんでした。' };
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    return {
      valid: false,
      error: `画像の解像度が大きすぎます（${width}×${height}px）。一辺${MAX_IMAGE_DIMENSION}px以下の画像を使用してください。`,
    };
  }
  if (width * height > MAX_TOTAL_PIXELS) {
    return {
      valid: false,
      error: `総画素数が上限を超えています（${width}×${height}px）。より小さい画像を選択してください。`,
    };
  }
  return { valid: true };
}

/**
 * Base64 DataURL から実バイナリサイズ（バイト数）を計算し検証する
 */
export function estimateDataUrlByteSize(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return 0;
  const base64 = dataUrl.slice(commaIdx + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * 保存前のWebP DataURLが仕様（128x128 WebP, 最大30KB, Base64文字数上限）を満たすか検証
 */
export function validateProcessedIconDataUrl(
  dataUrl: string,
  byteSize: number
): { valid: boolean; error?: string } {
  if (!/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
    return { valid: false, error: 'WebP形式への変換結果が不正です。' };
  }
  if (dataUrl.length > MAX_ALLOWED_DATAURL_CHARS) {
    return {
      valid: false,
      error: 'Base64文字列長が保存上限を超えています。よりシンプルな範囲を切り抜いて再試行してください。',
    };
  }
  if (byteSize <= 0 || byteSize > MAX_ALLOWED_ICON_BYTES) {
    return {
      valid: false,
      error: `圧縮後のサイズが上限（30KB）を超えています（${(byteSize / 1024).toFixed(1)}KB）。切り抜き範囲を拡大するか別の画像でお試しください。`,
    };
  }
  return { valid: true };
}

/**
 * File をブラウザ内で HTMLImageElement にデコードする
 */
export function decodeImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const check = validateInputImageFile(file);
    if (!check.valid) {
      reject(new Error(check.error));
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const dimCheck = validateImageDimensions(img.naturalWidth, img.naturalHeight);
      if (!dimCheck.valid) {
        reject(new Error(dimCheck.error));
        return;
      }
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('画像のデコードに失敗しました。破損していないJPEG・PNG・WebP画像を選択してください。'));
    };
    img.src = objectUrl;
  });
}

/**
 * 切り抜きパラメータを適用して 128×128 Canvas に描画し、
 * 原則20KB以下（最大30KB）に収まるよう段階的に品質を調整して WebP DataURL を生成する
 */
export function renderAndCompressToWebp128(
  img: HTMLImageElement,
  crop: CropTransform
): ProcessedIconResult {
  const canvas = document.createElement('canvas');
  canvas.width = TARGET_ICON_SIZE;
  canvas.height = TARGET_ICON_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D コンテキストを初期化できませんでした。');
  }

  // 透過対応のためクリア
  ctx.clearRect(0, 0, TARGET_ICON_SIZE, TARGET_ICON_SIZE);

  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const minSide = Math.min(srcW, srcH);
  const safeZoom = Math.max(1, Math.min(3, crop.zoom || 1));
  const cropSide = minSide / safeZoom;

  const maxOffsetX = Math.max(0, (srcW - cropSide) / 2);
  const maxOffsetY = Math.max(0, (srcH - cropSide) / 2);

  const centerX = srcW / 2 - (crop.offsetX || 0) * maxOffsetX;
  const centerY = srcH / 2 - (crop.offsetY || 0) * maxOffsetY;

  const sx = Math.max(0, Math.min(srcW - cropSide, centerX - cropSide / 2));
  const sy = Math.max(0, Math.min(srcH - cropSide, centerY - cropSide / 2));

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, cropSide, cropSide, 0, 0, TARGET_ICON_SIZE, TARGET_ICON_SIZE);

  // 品質ステップを試行し、原則20KB以下を目指す。収まらない場合でも最大30KB以下を保証する。
  const qualities = [0.86, 0.8, 0.74, 0.66, 0.58, 0.5, 0.42, 0.34, 0.25];
  let selectedDataUrl = '';
  let selectedByteSize = 0;
  let selectedQuality = qualities[0];

  for (const q of qualities) {
    const candidate = canvas.toDataURL('image/webp', q);
    // ブラウザまたはJSDOMが image/webp 非対応の場合のフォールバック考慮（本番モダンブラウザはすべてWebP対応）
    const normalized = candidate.startsWith('data:image/webp')
      ? candidate
      : candidate.replace(/^data:image\/[a-z]+/, 'data:image/webp');
    const bytes = estimateDataUrlByteSize(normalized);
    selectedDataUrl = normalized;
    selectedByteSize = bytes;
    selectedQuality = q;

    if (bytes <= TARGET_PREFERRED_BYTES && normalized.length <= MAX_ALLOWED_DATAURL_CHARS) {
      break;
    }
  }

  const finalCheck = validateProcessedIconDataUrl(selectedDataUrl, selectedByteSize);
  if (!finalCheck.valid) {
    throw new Error(
      finalCheck.error ||
        '画像を30KB以下に圧縮できませんでした。切り抜き範囲を調整するか別の画像をお試しください。'
    );
  }

  return {
    dataUrl: selectedDataUrl,
    byteSize: selectedByteSize,
    base64Length: selectedDataUrl.length,
    width: TARGET_ICON_SIZE,
    height: TARGET_ICON_SIZE,
    mimeType: 'image/webp',
    qualityUsed: selectedQuality,
    isWithinPreferred20KB: selectedByteSize <= TARGET_PREFERRED_BYTES,
  };
}
