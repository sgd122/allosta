/** Cross-cutting primitive unions shared by multiple entities. */

export type Role = 'CUSTOMER' | 'COUNSELOR' | 'ADMIN';
export type SubjectType = 'CUSTOMER';
export type Outcome = 'EXPLAINED' | 'GUIDED' | 'PURCHASED';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
export type WaitlistStatus = 'WAITING' | 'NOTIFIED' | 'CONVERTED' | 'EXPIRED';
