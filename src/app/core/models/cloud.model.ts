import { Collection } from './collection.model';
import { User } from './auth.model';

export interface Team {
  id: string;
  name: string;
  owner_id: string;
  role: 'owner' | 'member';
}

export interface TeamMember {
  id: string;
  user_id: string;
  role: 'owner' | 'member';
  user: User;
}

export interface Workspace {
  id: string;
  name: string;
  user_id: string | null;
  team_id: string | null;
  type: 'personal' | 'team';
}

export interface CloudCollection {
  id: string;
  workspace_id: string;
  name: string;
  data: Collection;
  version: number;
  updated_by: string;
  updated_at?: string;
}
