import { Injectable, inject, signal } from '@angular/core';
import { ApiClientService } from './api-client.service';
import { AuthService } from './auth.service';
import { Team, TeamMember } from '../models/cloud.model';

@Injectable({ providedIn: 'root' })
export class TeamService {
  private apiClient = inject(ApiClientService);
  private authService = inject(AuthService);

  readonly teams = signal<Team[]>([]);
  readonly isLoading = signal(false);

  constructor() {
    this.authService.onLogin(() => this.loadTeams());
    this.authService.onLogout(() => this.clear());
  }

  async loadTeams(): Promise<void> {
    this.isLoading.set(true);
    try {
      const teams = await this.apiClient.get<Team[]>('/teams');
      this.teams.set(teams);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createTeam(name: string): Promise<Team> {
    const team = await this.apiClient.post<Team>('/teams', { name });
    this.teams.update(teams => [...teams, team]);
    return team;
  }

  async updateTeam(id: string, name: string): Promise<Team> {
    const team = await this.apiClient.patch<Team>(`/teams/${id}`, { name });
    this.teams.update(teams => teams.map(t => t.id === id ? team : t));
    return team;
  }

  async deleteTeam(id: string): Promise<void> {
    await this.apiClient.delete(`/teams/${id}`);
    this.teams.update(teams => teams.filter(t => t.id !== id));
  }

  async getMembers(teamId: string): Promise<TeamMember[]> {
    return this.apiClient.get<TeamMember[]>(`/teams/${teamId}/members`);
  }

  async inviteMember(teamId: string, email: string): Promise<void> {
    await this.apiClient.post(`/teams/${teamId}/members`, { email });
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    await this.apiClient.delete(`/teams/${teamId}/members/${userId}`);
  }

  async leaveTeam(teamId: string): Promise<void> {
    await this.apiClient.post(`/teams/${teamId}/leave`);
    this.teams.update(teams => teams.filter(t => t.id !== teamId));
  }

  clear(): void {
    this.teams.set([]);
  }
}
