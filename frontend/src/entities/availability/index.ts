export type { AvailabilitySlot } from './types';
export {
  getMyCounselorSlots,
  createCounselorSlots,
  updateCounselorSlot,
  deleteCounselorSlot,
} from './api';
export {
  availabilityKeys,
  useCounselorSlots,
  useUpdateCounselorSlotMutation,
  useDeleteCounselorSlotMutation,
  useCreateCounselorSlotsMutation,
} from './api/queries';
