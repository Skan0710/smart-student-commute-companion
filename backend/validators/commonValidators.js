/**
 * Common Parameter & Query Validation Schemas
 */

const { z } = require('zod');

const idParamSchema = z.object({
  id: z.string().trim().min(1, 'Identifier is required').max(100, 'Identifier exceeds maximum allowed length')
});

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(20)
});

/**
 * User-supplied links must be plain http(s) URLs. Anything else
 * (javascript:, data:, vbscript:, file:) is a stored-XSS vector for any
 * client that renders the value as a hyperlink.
 */
const safeHttpUrlSchema = z
  .string()
  .trim()
  .max(1000, 'URL cannot exceed 1000 characters')
  .refine(value => {
    if (value === '') return true;
    try {
      const { protocol } = new URL(value);
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  }, 'URL must be a valid http:// or https:// address');

module.exports = {
  safeHttpUrlSchema,
  idParamSchema,
  paginationQuerySchema
};
