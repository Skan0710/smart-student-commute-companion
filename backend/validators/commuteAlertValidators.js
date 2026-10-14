/**
 * Commute Alert Request Validators
 *
 * Validation schemas for commute disruption alerts, preferences, and background processing.
 */

const { z } = require('zod');
const { disruptionSeverityEnum } = require('../models/CommuteContracts');

const deliveryChannelEnum = z.enum(['in_app', 'socket', 'email', 'push']);

/**
 * Schema for listing active commute disruption alerts.
 */
const commuteAlertQuerySchema = z.object({
  mode: z.string().optional(),
  area: z.string().optional(),
  severity: disruptionSeverityEnum.optional(),
  disruptionType: z.string().optional(),
  includeBroadcast: z.union([
    z.boolean(),
    z.string().transform(val => {
      if (val === 'false' || val === '0') return false;
      return true;
    })
  ]).optional().default(true),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

/**
 * Schema for updating student commute alert notification preferences.
 */
const updateCommuteAlertPreferencesSchema = z.object({
  alertsEnabled: z.boolean().optional(),
  minimumSeverity: disruptionSeverityEnum.optional(),
  enabledCategories: z.array(z.string().min(1, 'Category cannot be empty')).optional(),
  preferredChannels: z.array(deliveryChannelEnum).min(1, 'At least one delivery channel is required').optional()
}).refine(data => {
  return data.alertsEnabled !== undefined ||
    data.minimumSeverity !== undefined ||
    data.enabledCategories !== undefined ||
    data.preferredChannels !== undefined;
}, {
  message: 'At least one preference field (alertsEnabled, minimumSeverity, enabledCategories, preferredChannels) must be provided'
});

/**
 * Schema for triggering authorized internal commute alert processing.
 */
const triggerAlertProcessingSchema = z.object({
  dryRun: z.boolean().optional().default(false),
  forceSync: z.boolean().optional().default(true),
  targetUserId: z.string().optional().nullable(),
  disruptions: z.array(z.any()).optional()
}).optional().default({});

module.exports = {
  commuteAlertQuerySchema,
  updateCommuteAlertPreferencesSchema,
  triggerAlertProcessingSchema,
  deliveryChannelEnum
};
