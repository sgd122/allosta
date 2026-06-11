export interface FamilyLink {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
}

export interface FamilyLinkWithCounterpart extends FamilyLink {
  counterpart: { id: string; name: string };
  relationLabel: string | null;
}

export interface FamilyMember {
  id: string;
  name: string;
  relation: string;
}

export interface InviteCode {
  code: string;
  expiresAt: string;
}
