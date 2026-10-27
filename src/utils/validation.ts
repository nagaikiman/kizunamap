import type { ProfileLink } from '../types/domain';

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('ja', { granularity: 'grapheme' })
    : null;

/**
 * 日本語や絵文字（サロゲートペア・結合文字）を考慮した書記素クラスタ文字数カウント
 */
export function countGraphemes(text: string): number {
  if (!text) return 0;
  if (segmenter) {
    return Array.from(segmenter.segment(text)).length;
  }
  return Array.from(text).length;
}

/**
 * Firestore セキュリティルールの string.size() と同じ UTF-16 コード単位長
 */
export function countUtf16Units(text: string): number {
  if (!text) return 0;
  return text.length;
}

/**
 * UI表示とFirestoreセキュリティルール（size() <= maxLen）の食い違いで
 * ユーザーが突然保存に失敗しないよう、書記素数とUTF-16コード単位数の
 * いずれか大きい方を実効カウントとして返します。
 */
export function getSafeCharCount(text: string): {
  graphemes: number;
  utf16Units: number;
  effectiveCount: number;
} {
  const graphemes = countGraphemes(text);
  const utf16Units = countUtf16Units(text);
  return {
    graphemes,
    utf16Units,
    effectiveCount: Math.max(graphemes, utf16Units),
  };
}

/**
 * 本人プロフィールコメント（最大400文字）の検証
 */
export function validateProfileBio(bio: string): { valid: boolean; error?: string } {
  const { effectiveCount } = getSafeCharCount(bio);
  if (effectiveCount > 400) {
    return {
      valid: false,
      error: `コメントは400文字以内で入力してください（現在: ${effectiveCount} / 400）`,
    };
  }
  return { valid: true };
}

/**
 * URL検証（http:// または https:// のみ許可、javascript: や data: 等を拒否、最大2,048文字）
 */
export function validateSafeHttpUrl(url: string): { valid: boolean; error?: string } {
  const trimmed = url.trim();
  if (!trimmed) {
    return { valid: false, error: 'URLを入力してください' };
  }
  if (countUtf16Units(trimmed) > 2048) {
    return { valid: false, error: 'URLは2,048文字以内で入力してください' };
  }
  if (!/^https?:\/\/[^\s<>"]+$/i.test(trimmed)) {
    return {
      valid: false,
      error: 'URLは https:// または http:// から始まる正しい形式で入力してください',
    };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'http:// または https:// のみ許可されています' };
    }
    if (!parsed.hostname) {
      return { valid: false, error: '有効なホスト名を含むURLを入力してください' };
    }
  } catch {
    return { valid: false, error: 'URLの形式が正しくありません' };
  }
  return { valid: true };
}

/**
 * プロフィールリンク配列（最大2個、ラベル最大50文字、URL最大2048文字）の検証
 */
export function validateProfileLinks(links: ProfileLink[]): { valid: boolean; error?: string } {
  if (links.length > 2) {
    return { valid: false, error: 'URLリンクは最大2個まで登録できます' };
  }
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const labelCount = getSafeCharCount(link.label.trim()).effectiveCount;
    if (labelCount < 1) {
      return { valid: false, error: `リンク${i + 1}の表示ラベルを入力してください` };
    }
    if (labelCount > 50) {
      return {
        valid: false,
        error: `リンク${i + 1}の表示ラベルは50文字以内で入力してください（現在: ${labelCount}文字）`,
      };
    }
    const urlCheck = validateSafeHttpUrl(link.url);
    if (!urlCheck.valid) {
      return { valid: false, error: `リンク${i + 1}: ${urlCheck.error}` };
    }
  }
  return { valid: true };
}

/**
 * 推測しにくいプロジェクト識別子（24文字のランダム英数字）の生成
 */
export function generateUnfathomableId(prefix = 'p'): string {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const array = new Uint8Array(22);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  let token = '';
  for (let i = 0; i < array.length; i++) {
    token += chars[array[i] % chars.length];
  }
  return `${prefix}_${token}`;
}
