export type EimzoKey = {
  type?: string;
  disk?: string;
  cardUID?: string;
  name?: string;
  alias?: string;
  serialNumber?: string;
  certificateSerial?: string;
  serial?: string;
  CN?: string;
  O?: string;
  PINFL?: string;
  TIN?: string;
  INN?: string;
  UID?: string;
  validFrom?: Date | string;
  validTo?: Date | string;
  path?: string;
};

export type EimzoChallengeResponse = {
  challenge: string;
};

export type EimzoLoginResponse = {
  accessToken?: string;
  token?: string;
  user: {
    id: number;
    username?: string;
    email?: string | null;
    fullName?: string | null;
    pinfl?: string | null;
    inn?: string | null;
    role: string;
    permissions?: unknown;
    status?: string;
    lastLoginAt?: string | null;
    createdAt?: string;
  };
};
