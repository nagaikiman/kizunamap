import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ImagePlus, Move, Trash2, X, ZoomIn } from 'lucide-react';
import {
  decodeImageFile,
  renderAndCompressToWebp128,
  type CropTransform,
  type ProcessedIconResult,
} from '../../utils/imageProcessor';

interface IconCropperModalProps {
  title: string;
  currentDataUrl?: string | null;
  onSave: (result: { dataUrl: string; byteSize: number } | null) => void;
  onClose: () => void;
}

export const IconCropperModal: React.FC<IconCropperModalProps> = ({
  title,
  currentDataUrl,
  onSave,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [decodedImg, setDecodedImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<CropTransform>({
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const [previewResult, setPreviewResult] = useState<ProcessedIconResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!decodedImg) return;
    try {
      const res = renderAndCompressToWebp128(decodedImg, crop);
      setPreviewResult(res);
      setErrorMsg(null);
    } catch (err) {
      setPreviewResult(null);
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [decodedImg, crop]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const img = await decodeImageFile(file);
      setDecodedImg(img);
      setCrop({ zoom: 1, offsetX: 0, offsetY: 0 });
    } catch (err) {
      setDecodedImg(null);
      setPreviewResult(null);
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 bg-slate-50">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <ImagePlus size={17} className="text-indigo-600" />
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
            <p className="font-semibold text-slate-700">画像仕様（Cloud Storage不使用・Firestore専用文書保存）</p>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-500">
              <li>対応形式：JPEG / PNG / WebP（最大5MB、SVG・GIFアニメは対象外）</li>
              <li>自動変換：128×128px 正方形 WebP（透過対応）</li>
              <li>容量制限：原則 20KB 以下（最大 30KB）。元画像は保存されません。</li>
            </ul>
          </div>

          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 px-4 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100/70 transition"
            >
              <ImagePlus size={16} />
              画像ファイルを選択（JPEG / PNG / WebP）
            </button>

            {currentDataUrl && (
              <button
                type="button"
                onClick={() => {
                  onSave(null);
                  onClose();
                }}
                className="flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                title="登録済み画像を削除して頭文字/プリセットに戻す"
              >
                <Trash2 size={14} />
                画像解除
              </button>
            )}
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {decodedImg && previewResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-6 py-2">
                <div className="text-center space-y-1">
                  <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-indigo-500 shadow-md mx-auto bg-slate-100">
                    <img
                      src={previewResult.dataUrl}
                      alt="円形プレビュー"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 block">円形プレビュー (128×128)</span>
                </div>

                <div className="text-center space-y-1">
                  <div className="w-28 h-28 rounded-2xl overflow-hidden border border-slate-300 shadow-sm mx-auto bg-slate-100">
                    <img
                      src={previewResult.dataUrl}
                      alt="角丸プレビュー"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 block">グループ角丸プレビュー</span>
                </div>
              </div>

              <div className="space-y-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 flex items-center gap-1">
                    <ZoomIn size={14} /> ズーム（切り抜き拡大）
                  </span>
                  <span className="text-slate-500 font-mono">{crop.zoom.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={crop.zoom}
                  onChange={(e) => setCrop((prev) => ({ ...prev, zoom: parseFloat(e.target.value) }))}
                  className="w-full accent-indigo-600"
                />

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1">
                      <Move size={12} /> 左右位置調整
                    </label>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={crop.offsetX}
                      onChange={(e) =>
                        setCrop((prev) => ({ ...prev, offsetX: parseFloat(e.target.value) }))
                      }
                      className="w-full accent-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1">
                      <Move size={12} /> 上下位置調整
                    </label>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={crop.offsetY}
                      onChange={(e) =>
                        setCrop((prev) => ({ ...prev, offsetY: parseFloat(e.target.value) }))
                      }
                      className="w-full accent-indigo-600"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2 text-xs text-emerald-800">
                <span className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 size={15} className="text-emerald-600" />
                  WebP 128×128px 圧縮完了
                </span>
                <span className="font-mono font-bold">
                  {(previewResult.byteSize / 1024).toFixed(1)} KB / 上限 30.0 KB
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={!previewResult}
            onClick={() => {
              if (!previewResult) return;
              onSave({
                dataUrl: previewResult.dataUrl,
                byteSize: previewResult.byteSize,
              });
              onClose();
            }}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-40"
          >
            このアイコンを適用
          </button>
        </div>
      </div>
    </div>
  );
};
