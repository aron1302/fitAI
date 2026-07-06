import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// "Add a photo" button. On touch devices (phones/tablets) it opens a bottom
// action sheet offering the camera or the photo library; on laptops/desktops
// it goes straight to the file picker — a webcam shot of a plate is rarely
// what anyone wants there.
//
// Camera capture uses <input capture="environment">, which hands off to the
// native camera app — no getUserMedia permission juggling, and the shot flows
// back through the same file-input path as an uploaded photo.

// Evaluated at click time (not module load) so DevTools device emulation and
// tablet convertibles that switch modes are detected correctly.
const isTouchDevice = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(hover: none) and (pointer: coarse)").matches;

export default function PhotoPicker({ disabled, onPick }) {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (file) onPick(file);
  }

  return (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleFile}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFile}
      />
      <button
        type="button"
        className="btn ghost sm"
        disabled={disabled}
        onClick={() => (isTouchDevice() ? setSheetOpen(true) : galleryRef.current?.click())}
      >
        📷 Add a photo
      </button>
      {sheetOpen && (
        <PhotoSourceSheet
          onCamera={() => {
            setSheetOpen(false);
            cameraRef.current?.click();
          }}
          onGallery={() => {
            setSheetOpen(false);
            galleryRef.current?.click();
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}

// Bottom sheet asking where the photo should come from. Closes on overlay
// tap, Cancel, or Escape, and locks page scroll while open. Rendered into
// <body> so card overflow can't clip it.
function PhotoSourceSheet({ onCamera, onGallery, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="modal-overlay photo-sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Add a photo"
    >
      <div className="photo-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="photo-sheet-handle" aria-hidden="true" />
        <div className="photo-sheet-title">Add a photo</div>
        <button type="button" className="photo-sheet-opt" onClick={onCamera} autoFocus>
          <span className="photo-sheet-ico" aria-hidden="true">
            📸
          </span>
          <span>
            <b>Take a photo</b>
            <small>Open the camera and snap your meal</small>
          </span>
        </button>
        <button type="button" className="photo-sheet-opt" onClick={onGallery}>
          <span className="photo-sheet-ico" aria-hidden="true">
            🖼️
          </span>
          <span>
            <b>Choose from device</b>
            <small>Pick an existing photo from your gallery</small>
          </span>
        </button>
        <button type="button" className="photo-sheet-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>,
    document.body
  );
}
