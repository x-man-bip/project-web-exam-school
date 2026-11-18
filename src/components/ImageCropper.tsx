import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { ZoomIn, ZoomOut } from "lucide-react";

const OUTPUT_SIZE = 256;

export function ImageCropper({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (croppedFile: File) => void;
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  // Generate live preview whenever the crop area changes
  useEffect(() => {
    if (!imgSrc || !croppedAreaPixels) return;
    let cancelled = false;
    const img = new Image();
    img.src = imgSrc;
    img.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(
        img,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE,
      );
      canvas.toBlob((blob) => {
        if (cancelled) return;
        setPreviewUrl(blob ? URL.createObjectURL(blob) : null);
      }, "image/png");
    };
    return () => {
      cancelled = true;
    };
  }, [imgSrc, croppedAreaPixels]);

  const handleConfirm = () => {
    if (!previewUrl) return;
    fetch(previewUrl)
      .then((res) => res.blob())
      .then((blob) => {
        const croppedFile = new File([blob], "avatar.png", { type: "image/png" });
        onConfirm(croppedFile);
      });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 text-center">
        Seret gambar untuk memposisikan dan gunakan slider untuk memperbesar/memperkecil.
      </p>

      {/* Cropper stage — fixed-size crop window; the *image* is what moves */}
      <div
        className="relative w-full rounded-xl overflow-hidden bg-slate-900"
        style={{ height: 320, touchAction: "none" }}
      >
        {imgSrc && (
          <Cropper
            image={imgSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            style={{
              containerStyle: { touchAction: "none" },
              cropAreaStyle: { zIndex: 2 },
              mediaStyle: { zIndex: 1 },
            }}
          />
        )}
      </div>

      {/* Zoom slider */}
      <div className="flex items-center gap-3 px-2">
        <ZoomOut size={18} className="text-slate-400 shrink-0" />
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="flex-1 accent-brand-500 cursor-pointer"
          aria-label="Zoom"
        />
        <ZoomIn size={18} className="text-slate-400 shrink-0" />
      </div>

      {/* Live circular preview */}
      <div className="flex items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-1">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Preview"
              className="w-20 h-20 rounded-full object-cover border-2 border-white shadow-md"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-slate-200 animate-pulse" />
          )}
          <span className="text-xs text-slate-400">Preview</span>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-1">
        <button onClick={onCancel} className="btn-secondary">Batal</button>
        <button onClick={handleConfirm} disabled={!previewUrl} className="btn-primary">
          Gunakan Foto
        </button>
      </div>
    </div>
  );
}
