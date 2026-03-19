export interface OAuthCredentials {
    access: string;
    refresh: string;
    expires: number;
}

export interface OAuthAuthEvent {
    url: string;
}

export interface OAuthPromptEvent {
    message: string;
}

export interface OAuthLoginCallbacks {
    onAuth: (event: OAuthAuthEvent) => void;
    onPrompt: (event: OAuthPromptEvent) => Promise<string>;
}

export interface OAuthProviderInterface {
    id: string;
    name: string;
    login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials>;
    refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials>;
    getApiKey(credentials: OAuthCredentials): string;
}
