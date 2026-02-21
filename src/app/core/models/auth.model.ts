export type GlobalRole = 'super_admin' | 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  provider: AuthProvider;
  global_role: GlobalRole;
}

export type AuthProvider = 'github' | 'gitlab' | 'google';
