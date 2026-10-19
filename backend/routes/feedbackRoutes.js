const express = require('express');
const {
  submitFeedback,
  getFeedback,
  updateFeedback,
  deleteFeedback
} = require('../controllers/feedbackController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const {
  validate,
  submitFeedbackSchema,
  updateFeedbackSchema,
  feedbackFilterQuerySchema,
  idParamSchema
} = require('../validators');

function createFeedbackRoutes() {
  const router = express.Router();
  // Submitting feedback is open to everyone (anonymous ratings); reading,
  // editing and deleting other people's feedback is an admin-only operation.
  const adminOnly = [authenticate, requireRole(['admin'])];
  router.get('/feedback', ...adminOnly, validate({ query: feedbackFilterQuerySchema }), getFeedback);
  router.post('/feedback', validate({ body: submitFeedbackSchema }), submitFeedback);
  router.patch(
    '/feedback/:id',
    ...adminOnly,
    validate({ params: idParamSchema, body: updateFeedbackSchema }),
    updateFeedback
  );
  router.delete(
    '/feedback/:id',
    ...adminOnly,
    validate({ params: idParamSchema }),
    deleteFeedback
  );
  return router;
}

module.exports = createFeedbackRoutes;
