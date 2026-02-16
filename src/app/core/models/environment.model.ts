export interface Secrets {
  [envId: string]: {
    [key: string]: string;
  };
}

export interface ResolvedVariables {
  [key: string]: string;
}
