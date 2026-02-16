export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  provider: AuthProvider;
}

export type AuthProvider = 'github' | 'gitlab' | 'google';
