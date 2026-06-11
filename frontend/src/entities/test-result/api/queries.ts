import { useQuery } from '@tanstack/react-query';
import { testResultKeys } from './keys';
import { getTestResults, getBookingTestResults } from './index';


/** All test results for the current user (and linked family members). */
export function useTestResults() {
  return useQuery({
    queryKey: testResultKeys.list,
    queryFn: getTestResults,
  });
}

/** Test results attached to a specific counselor booking. */
export function useBookingTestResults(bookingId: string) {
  return useQuery({
    queryKey: testResultKeys.byBooking(bookingId),
    queryFn: () => getBookingTestResults(bookingId),
  });
}

export { testResultKeys } from './keys';
