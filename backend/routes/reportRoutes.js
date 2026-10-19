const express = require('express');
const {
  getLiveReports,
  getReport,
  getAlerts,
  createReport,
  confirmReport,
  contradictReport,
  updateReport,
  deleteReport
} = require('../controllers/reportController');
const { authenticate, optionalAuthenticate } = require('../middleware/authMiddleware');
const {
  validate,
  createReportSchema,
  updateReportSchema,
  reportFilterQuerySchema,
  idParamSchema
} = require('../validators');

function createReportRoutes(io) {
  const router = express.Router();

  router.get('/live-reports', validate({ query: reportFilterQuerySchema }), getLiveReports);
  router.get('/live-reports/:id', validate({ params: idParamSchema }), getReport);
  router.get('/alerts', getAlerts);
  router.post('/live-reports', optionalAuthenticate, validate({ body: createReportSchema }), createReport(io));
  router.post('/reports', optionalAuthenticate, validate({ body: createReportSchema }), createReport(io));
  router.patch(
    '/live-reports/:id',
    authenticate,
    validate({ params: idParamSchema, body: updateReportSchema }),
    updateReport(io)
  );
  router.delete(
    '/live-reports/:id',
    authenticate,
    validate({ params: idParamSchema }),
    deleteReport(io)
  );
  router.post('/live-reports/:id/confirm', optionalAuthenticate, validate({ params: idParamSchema }), confirmReport(io));
  router.post('/live-reports/:id/contradict', optionalAuthenticate, validate({ params: idParamSchema }), contradictReport(io));

  return router;
}

module.exports = createReportRoutes;
