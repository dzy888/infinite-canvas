export type NewApiUser = {
    id: number;
    username: string;
    display_name?: string;
    email?: string;
    role: number;
};

export type AuthBundle = {
    access_token: string;
    token_type: string;
    access_expires_at: number;
    session: { sid: string };
    user: NewApiUser;
};

export type LoginChallenge = {
    require_verification: true;
    flow_token: string;
    expires_at: number;
    methods: { method: string; available: boolean }[];
};

export type LoginSettings = {
    login_captcha_mode: "image" | "turnstile";
    initialized: boolean;
    password_login_enabled: boolean;
    password_login_encryption_enabled: boolean;
    passkey_login: boolean;
    turnstile_check: boolean;
    turnstile_site_key?: string;
    register_enabled?: boolean;
    user_agreement_enabled?: boolean;
    privacy_policy_enabled?: boolean;
};

export type ImageVerification = { id: string; code: string };
