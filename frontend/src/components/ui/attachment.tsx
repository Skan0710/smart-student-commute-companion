import * as React from "react"
import { cn } from "@/lib/utils"

export const Attachment = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { state?: 'idle' | 'uploading' | 'processing' | 'error' | 'done' }
>(({ className, state = 'idle', ...props }, ref) => (
  <div
    ref={ref}
    data-state={state}
    className={cn(
      "group relative flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-3 text-slate-900 dark:text-slate-100 shadow-sm transition-all hover:bg-slate-50 dark:hover:bg-slate-800/80",
      state === "uploading" && "animate-pulse border-blue-500/50",
      state === "processing" && "animate-pulse border-amber-500/50",
      state === "error" && "border-rose-500 text-rose-600 dark:text-rose-400",
      state === "done" && "border-emerald-500/50",
      className
    )}
    {...props}
  />
))
Attachment.displayName = "Attachment"

export const AttachmentMedia = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
      className
    )}
    {...props}
  />
))
AttachmentMedia.displayName = "AttachmentMedia"

export const AttachmentContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("min-w-0 flex-1 space-y-0.5", className)} {...props} />
))
AttachmentContent.displayName = "AttachmentContent"

export const AttachmentTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("truncate text-sm font-semibold text-slate-900 dark:text-white leading-tight", className)}
    {...props}
  />
))
AttachmentTitle.displayName = "AttachmentTitle"

export const AttachmentDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("truncate text-xs text-slate-500 dark:text-slate-400", className)}
    {...props}
  />
))
AttachmentDescription.displayName = "AttachmentDescription"

export const AttachmentActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center gap-1 shrink-0", className)} {...props} />
))
AttachmentActions.displayName = "AttachmentActions"

export const AttachmentAction = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer",
      className
    )}
    {...props}
  />
))
AttachmentAction.displayName = "AttachmentAction"

export default Attachment

