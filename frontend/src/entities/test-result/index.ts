export type { MetricStatus, TestMetric, MetricRef, TestResult, SubjectTestResultDto } from './types';
export { getTestResults, getBookingTestResults } from './api';
export { testResultKeys, useTestResults, useBookingTestResults } from './api/queries';
export {
  toMetricList,
  formatServiceType,
  formatMetricKey,
  metricStatusColor,
} from './lib/metrics';
export {
  groupResultsIntoReports,
  representativeResultId,
  indexReportsByResultId,
  type TestReport,
} from './lib/reports';
export { createReportCatalog, type ReportCatalog, type SubjectName } from './lib/report-catalog';
export { ResultSection, type MetricSelection } from './ui/ResultSection';
