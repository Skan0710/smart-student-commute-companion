import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Send } from 'lucide-react';
import { Modal, Alert, Textarea } from './ui';
import { validateText } from '../utils/validation';
import { announceThankYou } from '../utils/thankYou';

const FEEDBACK_TAGS = [
  'Route accurate',
  'Disruption accurate',
  'Travel time inaccurate',
  'Better route existed',
  'Weather issue'
];

export default function FeedbackModal({ isOpen, onClose, onSubmit, recommendationId }) {
  const [isUseful, setIsUseful] = useState(true);
  const [selectedTags, setSelectedTags] = useState([]);
  const [comment, setComment] = useState('');
  const [website, setWebsite] = useState(''); // honeypot: humans never see or fill it
  const [isSending, setIsSending] = useState(false);
  const [commentError, setCommentError] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  if (!isOpen) return null;

  const toggleTag = (tag) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Client-side validation (comment is optional but bounded by the API contract)
    const validationError = validateText(comment, { maxLength: 1000, label: 'Comment' });
    if (validationError) {
      setCommentError(validationError);
      document.getElementById('feedback-comment')?.focus();
      return;
    }

    setCommentError(null);
    setSubmitError(null);
    setIsSending(true);
    try {
      await onSubmit({
        recommendation_id: recommendationId || '',
        is_useful: isUseful,
        tags: selectedTags,
        comment: comment.trim(),
        ...(website ? { website } : {})
      });
      // The shared confirmation dialog takes over; reset and close this form now.
      setIsUseful(true);
      setSelectedTags([]);
      setComment('');
      setWebsite('');
      onClose();
      announceThankYou('feedback');
    } catch (err) {
      // Recoverable: keep the form open so the user can retry
      setSubmitError(err?.message || 'Unable to send your feedback right now. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Rate Commute Recommendation"
      size="md"
    >
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div
              aria-hidden="true"
              style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }}
            >
              <label htmlFor="feedback-website">Leave this field empty</label>
              <input
                id="feedback-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </div>
            <div className="text-center">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                Was this recommendation useful?
              </label>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setIsUseful(true)}
                  aria-pressed={isUseful}
                  className={`min-h-[44px] flex items-center gap-2 px-4 py-2.5 rounded-xl border font-bold text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isUseful
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-400 shadow-md shadow-emerald-500/10'
                      : 'bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <ThumbsUp className="w-4 h-4" />
                  <span>Yes, Useful</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsUseful(false)}
                  aria-pressed={!isUseful}
                  className={`min-h-[44px] flex items-center gap-2 px-4 py-2.5 rounded-xl border font-bold text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
                    !isUseful
                      ? 'bg-rose-500/20 border-rose-500 text-rose-600 dark:text-rose-400 shadow-md shadow-rose-500/10'
                      : 'bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <ThumbsDown className="w-4 h-4" />
                  <span>Could be better</span>
                </button>
              </div>
            </div>

            {/* Optional feedback tags */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                What influenced your rating? (Optional)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {FEEDBACK_TAGS.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      aria-pressed={isSelected}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                        isSelected
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-700 dark:text-emerald-300 font-medium'
                          : 'bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional Comment */}
            <Textarea
              label="Any specific thoughts? (Optional)"
              id="feedback-comment"
              rows={2}
              maxLength={1000}
              showCount
              placeholder="e.g. Metro was accurate, but auto line was longer than expected..."
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                if (commentError) setCommentError(null);
              }}
              error={commentError || undefined}
            />

            {/* Recoverable submit failure — form stays open for a retry */}
            {submitError && (
              <Alert
                variant="error"
                title="Feedback not sent"
                dismissible
                onDismiss={() => setSubmitError(null)}
              >
                {submitError}
              </Alert>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Skip
              </button>
              <button
                type="submit"
                disabled={isSending}
                aria-busy={isSending}
                className="min-h-[44px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20 flex items-center gap-1.5 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 transition-all active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSending ? 'Submitting...' : 'Submit Feedback'}</span>
              </button>
            </div>
          </form>
    </Modal>
  );
}
