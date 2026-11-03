/**
 * Validators for the AI-backed / heavy endpoints: timetable scan, interactive
 * study plan and the campus chatbot. These call paid or CPU-heavy services, so
 * every field is typed, enumerated or length-bounded (also keeping user text
 * out of unbounded LLM prompts).
 */

const { z } = require('zod');

// base64 of 5 MB is ~6.7M characters (data-URL prefix included)
const MAX_IMAGE_FIELD_CHARS = 7_000_000;

const timetableScanSchema = z
  .object({
    image: z.string().min(16, 'Image data is invalid').max(MAX_IMAGE_FIELD_CHARS, 'Image is too large').optional(),
    fileName: z.string().trim().max(200).optional(),
    text: z.string().trim().min(1).max(20000, 'Pasted timetable text is too long').optional()
  })
  .refine(data => Boolean(data.image) !== Boolean(data.text), {
    message: 'Provide either an image or pasted text, not both and not neither'
  });

const aiStudyPlanSchema = z.object({
  hasExam: z.enum(['yes', 'no'], { errorMap: () => ({ message: 'hasExam must be "yes" or "no"' }) }),
  examTimeframe: z.string().trim().max(60, 'Exam timeframe is too long').optional().default(''),
  dailyStudyHours: z.coerce.number({ invalid_type_error: 'dailyStudyHours must be a number' }).min(0.5).max(16),
  sleepHours: z.coerce.number({ invalid_type_error: 'sleepHours must be a number' }).min(3).max(14),
  selectedSubjects: z.array(z.string().trim().min(1).max(80)).max(15).optional().default([])
});

const chatMessageSchema = z.object({
  message: z.string().trim().min(1, 'Message is required').max(1000, 'Message is too long (max 1000 characters)'),
  conversationHistory: z
    .array(
      z.object({
        sender: z.enum(['user', 'bot']),
        text: z.string().max(2000)
      }).passthrough()
    )
    .max(20)
    .optional()
    .default([])
});

module.exports = { timetableScanSchema, aiStudyPlanSchema, chatMessageSchema };
