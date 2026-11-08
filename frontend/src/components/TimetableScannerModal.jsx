import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  UploadCloud,
  FileImage,
  Sparkles,
  Trash2,
  Plus,
  Clock,
  MapPin,
  BookOpen,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  Eye,
  FileText,
  Clipboard,
  FileUp
} from 'lucide-react';
import { scanTimetableOcr } from '../services/academics';
import { Attachment, AttachmentMedia, AttachmentContent, AttachmentTitle, AttachmentDescription, AttachmentActions, AttachmentAction } from './ui/attachment';

/**
 * Upscales small screenshots/photos, converts to grayscale and stretches contrast so
 * Tesseract can read thin grid text. Falls back to the original image on any failure.
 */
function preprocessTimetableImage(dataUrl, targetWidth = 2400) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(Math.max(targetWidth / img.width, 1), 3);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        const px = data.data;
        let lo = 255;
        let hi = 0;
        for (let i = 0; i < px.length; i += 4) {
          const g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
          px[i] = px[i + 1] = px[i + 2] = g;
          if (g < lo) lo = g;
          if (g > hi) hi = g;
        }
        const range = Math.max(hi - lo, 1);
        for (let i = 0; i < px.length; i += 4) {
          const v = Math.min(255, Math.max(0, ((px[i] - lo) * 255) / range));
          px[i] = px[i + 1] = px[i + 2] = v;
        }
        ctx.putImageData(data, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (_) {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function TimetableScannerModal({ isOpen, onClose, onSaveTimetable }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [extractedSlots, setExtractedSlots] = useState([]);
  const [rawOcrText, setRawOcrText] = useState('');
  const [showRawText, setShowRawText] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [inputMode, setInputMode] = useState('image');
  const [pastedText, setPastedText] = useState('');
  const [parserType, setParserType] = useState(null);

  const fileInputRef = useRef(null);

  // Global paste handler when modal is open (supports copying timetable image from anywhere and pressing Ctrl+V)
  useEffect(() => {
    if (!isOpen) return;

    const handleWindowPaste = (e) => {
      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            if (blob) {
              handleFileSelect(blob);
              e.preventDefault();
              return;
            }
          }
        }
      }
    };

    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [isOpen]);

  const handlePasteFromClipboard = async () => {
    setScanError(null);
    try {
      if (navigator.clipboard?.read) {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              handleFileSelect(blob);
              return;
            }
          }
        }
      }
      setScanError('No image found on your clipboard. Please copy an image (Ctrl+C or right-click Copy Image) and click Paste, or upload a file directly.');
    } catch (err) {
      setScanError('Please press Ctrl+V to paste your copied timetable image directly.');
    }
  };

  if (!isOpen) return null;

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    if (!selectedFile.type.startsWith('image/')) {
      setScanError('Please select a valid image file (PNG, JPG, or WebP).');
      return;
    }
    setScanError(null);
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target.result);
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleRunOcr = async () => {
    if (inputMode === 'image' && !previewUrl) {
      setScanError('Please upload or paste a timetable image first.');
      return;
    }
    if (inputMode === 'text' && !pastedText.trim()) {
      setScanError('Please enter or paste your timetable text first.');
      return;
    }

    setIsScanning(true);
    setScanError(null);

    try {
      const payload = inputMode === 'text'
        ? { text: pastedText }
        : { image: await preprocessTimetableImage(previewUrl) };
      const response = await scanTimetableOcr(payload);
      if (response && response.items) {
        setExtractedSlots(response.items);
        setRawOcrText(response.rawText || '');
        setParserType(response.parser || null);
        if (response.items.length === 0) {
          setScanError('Could not identify class timings from the provided input. You can add slots manually or edit text.');
        }
      } else {
        setScanError('Unable to extract timetable slots. Please try another photo or paste text.');
      }
    } catch (err) {
      console.error('Timetable scan failed:', err);
      setScanError(
        err?.status === 401
          ? 'Sign in to scan your timetable. Your account keeps the scanner private and rate-limited.'
          : err.message || 'Failed to analyze timetable. Please try again.'
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleSlotChange = (index, field, value) => {
    setExtractedSlots((prev) => {
      const updated = [...prev];
      const targetSlot = { ...updated[index], [field]: value };
      updated[index] = targetSlot;

      if (field === 'title') {
        const newTitle = String(value || '').trim();
        const curCode = String(targetSlot.subjectCode || '').trim();

        for (let i = 0; i < updated.length; i++) {
          if (i === index) continue;
          const otherTitle = String(updated[i].title || '').trim();
          const otherCode = String(updated[i].subjectCode || '').trim();

          // 1. If another slot shares this same subject name, reflect this cell's course code to it
          if (newTitle && otherTitle.toLowerCase() === newTitle.toLowerCase() && curCode) {
            updated[i] = { ...updated[i], subjectCode: targetSlot.subjectCode };
          }
          // 2. If another slot shares this same course code, reflect this cell's updated subject name to it
          else if (curCode && otherCode.toUpperCase() === curCode.toUpperCase()) {
            updated[i] = { ...updated[i], title: value };
          }
        }
      } else if (field === 'subjectCode') {
        const newCode = String(value || '').trim();
        const curTitle = String(targetSlot.title || '').trim();

        for (let i = 0; i < updated.length; i++) {
          if (i === index) continue;
          const otherTitle = String(updated[i].title || '').trim();
          const otherCode = String(updated[i].subjectCode || '').trim();

          // 1. If another slot shares this same course code, reflect this cell's subject name to it
          if (newCode && otherCode.toUpperCase() === newCode.toUpperCase() && curTitle) {
            updated[i] = { ...updated[i], title: targetSlot.title };
          }
          // 2. If another slot shares this same subject name, reflect this cell's updated course code to it
          else if (curTitle && otherTitle.toLowerCase() === curTitle.toLowerCase()) {
            updated[i] = { ...updated[i], subjectCode: value };
          }
        }
      }

      return updated;
    });
  };

  const handleDeleteSlot = (index) => {
    setExtractedSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddManualSlot = () => {
    const newSlot = {
      id: `manual-${Math.random().toString(36).slice(2, 9)}`,
      subjectCode: '',
      title: 'New Class',
      day: 'Monday',
      startTime: '09:00',
      endTime: '10:00',
      location: 'Hall 402',
      eventType: 'lecture'
    };
    setExtractedSlots((prev) => [...prev, newSlot]);
  };

  const handleSaveAll = () => {
    if (extractedSlots.length === 0) {
      setScanError('No timetable slots to save. Please scan or add at least one class.');
      return;
    }
    onSaveTimetable?.(extractedSlots);
    onClose?.();
  };

  const handleReset = () => {
    setFile(null);
    setPreviewUrl(null);
    setExtractedSlots([]);
    setRawOcrText('');
    setScanError(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ocr-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm overflow-y-auto"
    >
      <div className="bg-white dark:bg-[#0a0c16] border border-[#d8d3c5] dark:border-[#1e2440] rounded-3xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 font-sans">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-700 dark:text-blue-400 shrink-0">
              <Camera className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="ocr-modal-title" className="text-lg font-extrabold text-slate-900 dark:text-white truncate">
                Scan College Timetable
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Uses device Tesseract OCR to extract subject codes, days, and class timings
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1" style={{ scrollbarWidth: 'thin' }}>
          {scanError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{scanError}</span>
            </div>
          )}

          {/* Mode Switcher Tabs */}
          {extractedSlots.length === 0 && (
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/10 pb-3">
              <button
                type="button"
                onClick={() => { setInputMode('image'); setScanError(null); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  inputMode === 'image'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Photo / Image Upload</span>
              </button>
              <button
                type="button"
                onClick={() => { setInputMode('text'); setScanError(null); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  inputMode === 'text'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Paste Text / Schedule Grid</span>
              </button>
            </div>
          )}

          {/* Step 1: Image Upload or Text Input */}
          {extractedSlots.length === 0 ? (
            <div className="space-y-4">
              {inputMode === 'text' ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-xs text-blue-900 dark:text-blue-200 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      Timetable Scanner Active
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                      Paste rows, tabular schedule data, or class messages. Automatically parses course codes and resolves days and time slots.
                    </p>
                  </div>

                  <textarea
                    rows={8}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder={`Paste your timetable text or table here, e.g.:
Monday | 09:00 - 10:00 | DWM (CR 67)
Monday | 10:00 - 11:00 | AI (CR 67)
Monday | 11:15 - 01:15 | DWM Lab (Lab 3)
Tuesday | 09:00 - 10:00 | CN (CR 67)
Tuesday | 10:00 - 11:00 | TCS (CR 67)`}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed"
                  />

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setPastedText('')}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      Clear Text
                    </button>
                    <button
                      type="button"
                      onClick={handleRunOcr}
                      disabled={isScanning || !pastedText.trim()}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-md transition-all"
                    >
                      <Sparkles className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
                      <span>{isScanning ? 'Analyzing Subjects & Schedule...' : 'Analyze Timetable'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 scale-[0.99]'
                    : previewUrl
                    ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/20 dark:bg-emerald-950/10'
                    : 'border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 bg-slate-50/60 dark:bg-slate-900/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files?.[0])}
                />

                {previewUrl ? (
                  <div className="space-y-3 max-w-sm w-full mx-auto" onClick={(e) => e.stopPropagation()}>
                    <img
                      src={previewUrl}
                      alt="Timetable preview"
                      className="max-h-48 rounded-2xl mx-auto shadow-md border border-slate-200 dark:border-slate-700 object-contain"
                    />
                    <Attachment state={isScanning ? "processing" : "done"} className="w-full text-left">
                      <AttachmentMedia>
                        <FileImage className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      </AttachmentMedia>
                      <AttachmentContent>
                        <AttachmentTitle>{file?.name || 'timetable.png'}</AttachmentTitle>
                        <AttachmentDescription>
                          IMAGE ATTACHMENT · {(file?.size ? (file.size / 1024).toFixed(1) : '150')} KB
                        </AttachmentDescription>
                      </AttachmentContent>
                      <AttachmentActions>
                        <AttachmentAction
                          onClick={() => fileInputRef.current?.click()}
                          title="Change file"
                          aria-label="Change timetable file"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </AttachmentAction>
                        <AttachmentAction
                          onClick={handleReset}
                          title="Remove file"
                          aria-label="Remove timetable file"
                        >
                          <X className="w-4 h-4" />
                        </AttachmentAction>
                      </AttachmentActions>
                    </Attachment>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="w-14 h-14 rounded-3xl bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 flex items-center justify-center mx-auto shadow-sm">
                      <UploadCloud className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        Drag & drop your timetable photo, or choose an option:
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Supports PNG, JPG, or WebP • Auto-detects lectures, timings & classrooms
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all active:scale-95"
                      >
                        <FileUp className="w-4 h-4" />
                        <span>Upload from Device</span>
                      </button>

                      <button
                        type="button"
                        onClick={handlePasteFromClipboard}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs border border-slate-200 dark:border-slate-700 transition-all active:scale-95"
                      >
                        <Clipboard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span>Paste from Clipboard (Ctrl+V)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {previewUrl && (
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Clear Image
                  </button>
                  <button
                    type="button"
                    onClick={handleRunOcr}
                    disabled={isScanning}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm shadow-md transition-all disabled:opacity-50"
                  >
                    <Sparkles className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
                    <span>{isScanning ? 'Extracting Subjects & Schedule…' : 'Extract Timetable & Schedule'}</span>
                  </button>
                </div>
              )}
              </div>
              )}
            </div>
          ) : (
            /* Step 2: Extracted & Editable Schedule Slots */
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs sm:text-sm font-bold text-emerald-900 dark:text-emerald-300">
                        Extracted {extractedSlots.length} Class Slots
                      </h3>
                      {parserType?.startsWith('ai') && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-400/40 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          Verified Subjects &amp; Schedule
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-emerald-800/80 dark:text-emerald-400/80">
                      You can edit the subject code, name, day, timing, or room before saving to your schedule.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:underline"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Scan another photo</span>
                </button>
              </div>

              {/* Editable Slots List */}
              <div className="space-y-3">
                {extractedSlots.map((slot, index) => (
                  <div
                    key={slot.id || index}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 space-y-3 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      {/* Subject Code */}
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                          Code
                        </label>
                        <input
                          type="text"
                          value={slot.subjectCode || ''}
                          onChange={(e) => handleSlotChange(index, 'subjectCode', e.target.value)}
                          placeholder="e.g. CS 301"
                          className="w-full px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>

                      {/* Subject Name / Title */}
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                          Subject Name
                        </label>
                        <input
                          type="text"
                          value={slot.title || ''}
                          onChange={(e) => handleSlotChange(index, 'title', e.target.value)}
                          placeholder="e.g. Design & Analysis of Algorithms"
                          className="w-full px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>

                      {/* Day of Week */}
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                          Day
                        </label>
                        <select
                          value={slot.day || 'Monday'}
                          onChange={(e) => handleSlotChange(index, 'day', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          {DAYS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Start & End Times */}
                      <div className="sm:col-span-2 flex items-center gap-1.5">
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            Start
                          </label>
                          <input
                            type="time"
                            value={slot.startTime || '09:00'}
                            onChange={(e) => handleSlotChange(index, 'startTime', e.target.value)}
                            className="w-full px-2 py-1.5 rounded-xl text-xs font-mono font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            End
                          </label>
                          <input
                            type="time"
                            value={slot.endTime || '10:00'}
                            onChange={(e) => handleSlotChange(index, 'endTime', e.target.value)}
                            className="w-full px-2 py-1.5 rounded-xl text-xs font-mono font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      </div>

                      {/* Delete Action */}
                      <div className="sm:col-span-1 flex items-end justify-center pt-4 sm:pt-0">
                        <button
                          type="button"
                          onClick={() => handleDeleteSlot(index)}
                          className="p-2 rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                          title="Delete slot"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Room / Location Row */}
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-200/50 dark:border-slate-800/50">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        value={slot.location || ''}
                        onChange={(e) => handleSlotChange(index, 'location', e.target.value)}
                        placeholder="Location or room (e.g. Lab 402, Hall B)"
                        className="w-full text-xs text-slate-600 dark:text-slate-300 bg-transparent placeholder-slate-400 border-none outline-none focus:ring-0"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Add row manually */}
              <button
                type="button"
                onClick={handleAddManualSlot}
                className="w-full py-2.5 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-400 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-all"
              >
                <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Add Another Class Slot Manually</span>
              </button>

              {/* Raw OCR Text Disclosure */}
              {rawOcrText && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 bg-slate-50 dark:bg-slate-900/30 text-xs space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowRawText(!showRawText)}
                    className="flex items-center justify-between w-full font-bold text-slate-700 dark:text-slate-300"
                  >
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-500" />
                      <span>Inspect Raw Tesseract OCR Output</span>
                    </span>
                    <span className="text-[11px] text-blue-600 dark:text-blue-400 underline">
                      {showRawText ? 'Hide' : 'View'}
                    </span>
                  </button>

                  {showRawText && (
                    <pre className="mt-2 p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono whitespace-pre-wrap text-slate-700 dark:text-slate-300 max-h-40 overflow-y-auto">
                      {rawOcrText}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-950/40 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>

          {extractedSlots.length > 0 && (
            <button
              type="button"
              onClick={handleSaveAll}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Save &amp; Update Schedule ({extractedSlots.length})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

